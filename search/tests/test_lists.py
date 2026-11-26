import json, unittest
from pathlib import Path

EVAL = Path(__file__).resolve().parents[1] / "eval"
CATS = {"dairy", "snacks", "drinks", "frozen_meals", "store_brands",
        "restaurant", "produce", "meats", "international"}


class Lists(unittest.TestCase):
    def test_coverage_list(self):
        items = json.loads((EVAL / "coverage.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(items), 100)
        self.assertEqual(len({i["q"].lower() for i in items}), len(items))
        for cat in CATS:
            self.assertGreaterEqual(sum(i["category"] == cat for i in items), 8, cat)
        self.assertTrue(all(i["words"] for i in items))

    def test_examples(self):
        text = (EVAL / "examples.json").read_text(encoding="utf-8")
        for q in ["honest cow cottage cheese", "cottage cheese honest cow",
                  "honest cow cotage chese", "chobani greek yogurt", "fairlife milk",
                  "cottage cheese", "chiken breast", "zzqx cottage cheese",
                  "0041900091290", "41900091290"]:
            self.assertIn(q, text)
