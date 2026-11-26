import json
from pathlib import Path

from search.changes import record_changes
from search.tests.test_mobile import Builder, food
from search.mobile import build_mobile

NUMBERS = dict(kcal=120, p=8, c=12, f=5)


class Changes(Builder):
    def database(self, name, foods):
        source = self.dir / f"{name}.ndjson"
        source.write_text("".join(json.dumps(f) + "\n" for f in foods), encoding="utf-8")
        out = self.dir / f"{name}.db"
        build_mobile(source, out, self.dir / f"{name}.json")
        return out

    def item(self, ident, barcode, source="off", **over):
        return food(ident, ident, "Acme", source=source, popularity=1, barcode=barcode,
                    **{"n": dict(NUMBERS), **over})

    def test_remembers_the_old_numbers_of_foods_that_changed(self):
        old = self.database("old", [self.item("off_1", "111111"), self.item("off_2", "222222"),
                                    self.item("off_3", "333333"), self.item("off_4", "444444"),
                                    self.item("off_5", "555555")])
        new = self.database("new", [
            self.item("off_1", "111111", n=dict(kcal=48.58, p=3.24, c=4.86, f=2.02)),  # corrected
            self.item("off_2", "222222"),                                              # unchanged
            self.item("usdab_9", "333333", source="usda_branded", n=dict(kcal=50, p=3, c=5, f=2)),  # replaced
            self.item("off_4", "444444", flagged=1),                                   # now doubted
        ])
        out = self.dir / "previous.json"
        self.assertEqual(record_changes(old, new, out), 3)
        self.assertEqual(json.loads(out.read_text(encoding="utf-8")),
                         {"off_1": [[120, 8, 12, 5]], "off_3": [[120, 8, 12, 5]], "off_4": [[120, 8, 12, 5]]})

    def test_keeps_what_earlier_releases_had(self):
        old = self.database("old", [self.item("off_1", "111111", n=dict(kcal=48, p=3, c=5, f=2))])
        new = self.database("new", [self.item("off_1", "111111", n=dict(kcal=60, p=3, c=8, f=2))])
        out = self.dir / "previous.json"
        out.write_text(json.dumps({"off_1": [[120, 8, 12, 5]]}), encoding="utf-8")
        record_changes(old, new, out)
        record_changes(old, new, out)
        self.assertEqual(json.loads(out.read_text(encoding="utf-8"))["off_1"], [[120, 8, 12, 5], [48, 3, 5, 2]])


if __name__ == "__main__":
    import unittest
    unittest.main()
