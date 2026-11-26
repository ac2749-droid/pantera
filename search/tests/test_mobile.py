import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from search.mobile import clean_label, NUTRIENT_ORDER, build_mobile


def food(ident, name, brand=None, source="off", popularity=0, **over):
    doc = {"id": ident, "name": name, "brand": brand, "kind": "branded" if source in ("off", "usda_branded") else "generic",
           "barcode": None, "portions": [{"label": "1 cup", "g": 240.0}, {"label": "100 g", "g": 100.0}],
           "n": {"kcal": 106.1946, "p": 13.27, "va": 2}, "source": source, "popularity": popularity, "flagged": 0,
           "updated": "2025-01-01", "category": "dairy", "aliases": []}
    return {**doc, **over}


class Builder(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(ignore_cleanup_errors=True)
        self.addCleanup(tmp.cleanup)
        self.dir = Path(tmp.name)

    def build(self, foods):
        source = self.dir / "foods.ndjson"
        source.write_text("".join(json.dumps(f) + "\n" for f in foods), encoding="utf-8")
        info = build_mobile(source, self.dir / "foods.db", self.dir / "info.json")
        db = sqlite3.connect(self.dir / "foods.db")
        self.addCleanup(db.close)
        return info, db


class Mobile(Builder):
    def match(self, db, query):
        sql = "SELECT f.id FROM fts JOIN foods f ON f.rid = fts.rowid WHERE fts MATCH ? ORDER BY fts.rowid"
        return [r[0] for r in db.execute(sql, (query,))]

    def test_keeps_usda_foods_and_scanned_open_food_facts_products(self):
        info, db = self.build([
            food("a", "Never Scanned", popularity=0), food("b", "Scanned Once", popularity=1),
            food("c", "Branded USDA", source="usda_branded"), food("d", "Milk, whole", source="usda_fndds"),
        ])
        self.assertEqual(sorted(r[0] for r in db.execute("SELECT id FROM foods")), ["b", "c", "d"])
        self.assertEqual(info["foods"], 3)

    def test_also_keeps_unscanned_products_whose_label_is_complete(self):
        complete = {"n": {"kcal": 100, "p": 1, "c": 2, "f": 3}}
        info, db = self.build([
            food("full", "Cottage Cheese", "Honest", **complete),
            food("nobrand", "Mystery", **complete),
            food("doubt", "Odd", "B", flagged=1, **complete),
            food("noserving", "Bare", "B", portions=[{"label": "100 g", "g": 100.0}], **complete),
            food("nomacros", "Thin", "B", n={"kcal": 5}),
        ])
        # a doubtful one is kept too, so scanning it shows a warning instead of fetching the same numbers unmarked
        self.assertEqual(sorted(r[0] for r in db.execute("SELECT id FROM foods")), ["doubt", "full"])

    def test_identical_products_share_a_row_and_keep_every_barcode(self):
        same = {"n": {"kcal": 100, "p": 1, "c": 2, "f": 3}}
        info, db = self.build([
            food("one", "Cottage Cheese", "Honest", popularity=2, barcode="111111", **same),
            food("two", "cottage cheese", "honest", popularity=7, barcode="222222", **same),
            food("light", "Cottage Cheese", "Honest", popularity=1, barcode="333333", n={"kcal": 60, "p": 1, "c": 2, "f": 0}),
        ])
        self.assertEqual(sorted(r[0] for r in db.execute("SELECT id FROM foods")), ["light", "two"])
        found = dict(db.execute("SELECT b.barcode, f.id FROM barcodes b JOIN foods f ON f.rid = b.rid"))
        self.assertEqual(found, {"111111": "two", "222222": "two", "333333": "light"})
        self.assertEqual(db.execute("SELECT pop FROM foods WHERE id = 'two'").fetchone()[0], 7)

    def test_generic_foods_come_first_then_the_most_popular(self):
        info, db = self.build([
            food("rare", "Cheese", "A", popularity=1), food("hit", "Cheese", "B", popularity=50),
            food("bad", "Cheese", "C", popularity=90, flagged=1), food("plain", "Cheese, cottage", source="usda_sr"),
        ])
        self.assertEqual(self.match(db, '"cheese"'), ["plain", "hit", "rare", "bad"])
        self.assertEqual(db.execute("SELECT value FROM meta WHERE key = 'generic'").fetchone()[0], "1")

    def test_words_are_found_without_accents_or_apostrophes(self):
        _, db = self.build([food("h", "Vanilla", "Häagen-Dazs", popularity=1),
                            food("e", "Puffs", "Ellie’s", popularity=1, aliases=["caramel corn"])])
        self.assertEqual(self.match(db, '"haagen" "dazs"'), ["h"])
        self.assertEqual(self.match(db, '"ellies" "caramel"*'), ["e"])

    def test_stores_nutrients_in_a_fixed_order_and_drops_the_100_g_portion(self):
        _, db = self.build([food("a", "Yogurt", popularity=1, barcode="123456")])
        n, portions, barcode = db.execute("SELECT n, portions, barcode FROM foods").fetchone()
        values = dict(zip(NUTRIENT_ORDER, json.loads(n)))
        self.assertEqual((values["kcal"], values["p"], values["va"], values["c"]), (106.19, 13.27, 2, None))
        self.assertEqual(len(json.loads(n)), NUTRIENT_ORDER.index("va") + 1)  # trailing blanks are left off
        self.assertEqual(json.loads(portions), [["1 cup", 240.0]])
        self.assertEqual(barcode, "123456")

    def test_nutrient_order_matches_the_app(self):
        app = (Path(__file__).resolve().parents[2] / "src" / "foods.ts").read_text(encoding="utf-8")
        for key in NUTRIENT_ORDER:
            self.assertIn(f"'{key}'", app)
        self.assertEqual(NUTRIENT_ORDER[:4], ["kcal", "p", "c", "f"])
        self.assertEqual(len(NUTRIENT_ORDER), 32)

    def test_spelling_keys(self):
        _, db = self.build([food("a", "Kale Chips", popularity=1), food("b", "Kale", popularity=1)])
        sql = "SELECT w.word, w.count FROM word_keys k JOIN words w ON w.id = k.word_id WHERE k.key = ?"
        self.assertEqual(db.execute(sql, ("kae",)).fetchall(), [("kale", 2)])

    def test_writes_a_version_for_the_app(self):
        info, _ = self.build([food("a", "Yogurt", popularity=1)])
        saved = json.loads((self.dir / "info.json").read_text(encoding="utf-8"))
        self.assertEqual(saved, info)
        self.assertRegex(info["version"], r"^\d+-[0-9a-f]{10}$")


class Version(Builder):
    def test_changes_when_the_foods_change_and_only_then(self):
        def version(name):
            info, db = self.build([food("a", name, popularity=1)])
            db.close()  # Windows can't replace an open file
            return info["version"]

        first, again, changed = version("Milk"), version("Milk"), version("Oat Milk")
        self.assertEqual(first, again)
        self.assertNotEqual(first, changed)


class CleanLabel(unittest.TestCase):
    def test_notes_and_cut_off_endings_are_removed(self):
        cases = {
            '1 rib (yield after cooking, bone removed': '1 rib',
            '0.5 breast, bone removed (yield from 1 l': '0.5 breast, bone removed',
            '1 cup (yields 2 patties), chopped': '1 cup, chopped',
            '1 package (10 oz) (net weight after dra': '1 package (10 oz)',
            '1 serving of the large family size pizza': '1 serving of the large family size',
            '0.5 cup (113 g)': '0.5 cup (113 g)',
            '(': '(',
        }
        for label, shown in cases.items():
            self.assertEqual(clean_label(label), shown, label)


if __name__ == "__main__":
    unittest.main()
