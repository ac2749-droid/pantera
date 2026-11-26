import json
import tempfile
import unittest
from pathlib import Path

from search.vocabulary import delete_keys, vocabulary, words_of


class Vocabulary(unittest.TestCase):
    def test_words_match_the_apps_rules(self):
        self.assertEqual(words_of("Ben & Jerry's  Häagen-Dazs 2%!"), ["ben", "jerrys", "haagen", "dazs", "2"])

    def test_delete_keys(self):
        self.assertEqual(sorted(delete_keys("kale")), ["ale", "kae", "kal", "kale", "kle"])
        self.assertEqual(delete_keys("egg").count("eg"), 1)

    def test_counts_foods_and_keeps_only_repeated_real_words(self):
        docs = [{"name": "Pizza Pizza 1000", "brand": "Acme", "aliases": ["pizza pie"]},
                {"name": "Pizza", "brand": "Acme", "aliases": []},
                {"name": "Zxqv ab", "brand": None}]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "foods.ndjson"
            path.write_text("".join(json.dumps(d) + "\n" for d in docs), encoding="utf-8")
            out = list(vocabulary(path))
        self.assertEqual([(w["word"], w["count"]) for w in out], [("acme", 2), ("pizza", 2)])
        self.assertEqual(len({w["id"] for w in out}), 2)
        self.assertIn("pizz", out[1]["keys"])


if __name__ == "__main__":
    unittest.main()
