import unittest

from search.merge import pick
from search.quality import References
from search.records import FoodDoc

full = dict(kcal=100, p=10, c=5, f=4)


def doc(source, updated, brand="Acme", popularity=0, ident=None, **n):
    return FoodDoc(id=ident or f"{source}_{updated}", name="Thing", brand=brand, kind="branded",
                   barcode="123456", portions=[], n=n or dict(full), source=source,
                   popularity=popularity, updated=updated)


class Merge(unittest.TestCase):
    def both(self, a, b):
        """The winner, checked to be the same whichever order the two arrive in."""
        first = pick(a, b)
        self.assertEqual(first, pick(b, a))
        return first

    def test_usda_newest_wins(self):
        won = self.both(doc("usda_branded", "2024-01-01"), doc("usda_branded", "2025-01-01"))
        self.assertEqual(won.updated, "2025-01-01")

    def test_usda_preferred(self):
        won = self.both(doc("usda_branded", "2025-01-01"), doc("off", "2024-01-01"))
        self.assertEqual(won.source, "usda_branded")

    def test_newer_off_wins(self):
        won = self.both(doc("usda_branded", "2024-01-01"), doc("off", "2025-01-01"))
        self.assertEqual(won.source, "off")

    def test_incomplete_usda_loses(self):
        won = self.both(doc("usda_branded", "2025-01-01", kcal=100, c=5, f=4), doc("off", "2024-01-01"))
        self.assertEqual(won.source, "off")

    def test_newer_but_incomplete_off_does_not_replace_complete_usda(self):
        won = self.both(doc("usda_branded", "2024-01-01"), doc("off", "2025-01-01", kcal=100))
        self.assertEqual(won.source, "usda_branded")

    def test_between_two_off_records_complete_beats_newer(self):
        won = self.both(doc("off", "2024-01-01"), doc("off", "2025-01-01", kcal=100))
        self.assertEqual(won.updated, "2024-01-01")

    def test_doubtful_record_loses_to_a_trustworthy_one(self):
        doubtful = doc("off", "2025-01-01")
        doubtful.flagged = 1
        self.assertEqual(self.both(doc("usda_branded", "2024-01-01"), doubtful).source, "usda_branded")

    def test_keeps_popularity_and_brand(self):
        usda = doc("usda_branded", "2025-01-01", brand=None, popularity=0)
        off = doc("off", "2024-01-01", brand="Acme", popularity=14)
        won = self.both(usda, off)
        self.assertEqual((won.source, won.popularity, won.brand), ("usda_branded", 14, "Acme"))
        self.assertIsNone(usda.brand)  # inputs are not changed

    def test_exact_tie_breaks_by_id(self):
        a = doc("off", "2024-01-01", ident="off_a")
        b = doc("off", "2024-01-01", ident="off_b")
        self.assertEqual(self.both(a, b).id, "off_b")

    def serving(self, source, updated, grams, **n):
        d = doc(source, updated, **n)
        d.portions = [{"label": "1 serving", "g": grams}, {"label": "100 g", "g": 100.0}]
        return d

    def test_newer_off_with_per_serving_numbers_loses(self):
        usda = self.serving("usda_branded", "2024-01-01", 28.0, kcal=500, p=7, c=64, f=25)
        off = self.serving("off", "2026-01-01", 28.0, kcal=140, p=2, c=18, f=7)
        won = self.both(usda, off)
        self.assertEqual((won.source, won.flagged), ("usda_branded", 0))

    def test_off_numbers_scaled_up_twice_lose_to_usda(self):
        usda = self.serving("usda_branded", "2024-01-01", 40.0, kcal=325, p=0, c=80, f=1)
        off = self.serving("off", "2026-01-01", 40.0, kcal=812, p=0, c=200, f=2.5)
        won = self.both(usda, off)
        self.assertEqual((won.source, won.flagged), ("usda_branded", 0))

    def test_a_scaling_must_show_in_every_number_to_explain_a_difference(self):
        usda = self.serving("usda_branded", "2024-01-01", 150.0, kcal=80, p=10, c=7, f=0)
        off = self.serving("off", "2026-01-01", 150.0, kcal=53.3, p=10, c=7, f=0)  # same protein and carbs
        self.assertEqual(self.both(usda, off).flagged, 1)

    def test_foods_of_the_same_name_can_show_that_usda_is_the_scaled_one(self):
        usda = self.serving("usda_branded", "2026-01-01", 240.0, kcal=120, p=8, c=12, f=5)
        off = self.serving("off", "2024-01-01", 240.0, kcal=50, p=3.33, c=5, f=2.08)
        named = [doc("usda_branded", "2024-01-01", ident=str(i), kcal=50, p=3.33, c=5, f=2.08) for i in range(6)]
        for d in (usda, off, *named):
            d.name = "Reduced Fat Milk"
        namesakes = References.of(named)
        won = pick(usda, off, namesakes)
        self.assertEqual(won, pick(off, usda, namesakes))
        self.assertEqual((won.source, won.flagged), ("off", 1))
        self.assertEqual(pick(usda, off).source, "usda_branded")  # without namesakes USDA is trusted

    def test_unexplained_disagreement_keeps_usda_and_asks_for_a_check(self):
        usda = doc("usda_branded", "2024-01-01", kcal=300, p=10, c=40, f=11)
        off = doc("off", "2026-01-01", kcal=150, p=5, c=20, f=6)
        won = self.both(usda, off)
        self.assertEqual((won.source, won.flagged), ("usda_branded", 1))
        self.assertEqual(usda.flagged, 0)  # inputs are not changed

    def test_a_tiny_serving_does_not_explain_away_empty_usda_numbers(self):
        usda = self.serving("usda_branded", "2026-01-01", 5.0, kcal=0, p=0, c=0, f=0)
        off = self.serving("off", "2024-01-01", 5.0, kcal=33, p=0.7, c=6, f=0)
        won = self.both(usda, off)
        self.assertEqual((won.source, won.flagged), ("off", 1))

    def test_empty_usda_numbers_lose_to_off(self):
        usda = doc("usda_branded", "2026-01-01", kcal=0, p=0, c=0, f=0)
        off = doc("off", "2024-01-01", kcal=42, p=0, c=10.6, f=0)
        won = self.both(usda, off)
        self.assertEqual((won.source, won.flagged), ("off", 1))

    def test_small_differences_are_not_a_disagreement(self):
        usda = doc("usda_branded", "2024-01-01", kcal=50, p=3.3, c=5, f=2)
        off = doc("off", "2026-01-01", kcal=58, p=3.3, c=6, f=2)
        won = self.both(usda, off)
        self.assertEqual((won.source, won.flagged), ("off", 0))

if __name__ == "__main__":
    unittest.main()
