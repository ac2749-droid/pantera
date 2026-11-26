import json
import subprocess
import tempfile
import unittest
from pathlib import Path

from search.settings import index_settings

START = Path(__file__).resolve().parents[1] / "start.ps1"


class Settings(unittest.TestCase):
    def test_settings(self):
        s = index_settings()
        self.assertEqual(s["searchableAttributes"], ["name", "brand", "aliases"])
        self.assertEqual(sorted(s["filterableAttributes"]), ["barcode", "kind"])
        self.assertEqual(s["rankingRules"], ["words", "typo", "proximity", "attributeRank", "exactness",
                                             "flagged:asc", "kind_rank:asc", "popularity:desc"])
        self.assertTrue(s["typoTolerance"]["disableOnNumbers"])
        # "kale", "pork" and "thin" are everyday food words: one typo must still find them
        self.assertEqual(s["typoTolerance"]["minWordSizeForTypos"], {"oneTypo": 4, "twoTypos": 9})
        self.assertIn("yogurt", s["synonyms"]["yoghurt"])
        self.assertIn("macaroni cheese", s["synonyms"]["mac and cheese"])
        blob = json.dumps(s).lower()
        for brand in ["honest cow", "chobani", "fairlife", "coke", "sprite"]:
            self.assertNotIn(brand, blob)

    def test_synonyms_never_point_at_themselves(self):
        for word, others in index_settings()["synonyms"].items():
            self.assertTrue(others, word)
            self.assertNotIn(word, others)

    def test_start_script_creates_a_master_key_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            env = Path(tmp) / ".env"
            env.write_text("MEILI_SEARCH_KEY=keep\n", encoding="ascii")
            run = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(START),
                   "-EnvFile", str(env), "-KeyOnly"]
            subprocess.run(run, check=True, capture_output=True, timeout=60)
            first = env.read_text(encoding="ascii")
            subprocess.run(run, check=True, capture_output=True, timeout=60)
            self.assertEqual(env.read_text(encoding="ascii"), first)
            lines = dict(line.split("=", 1) for line in first.splitlines() if line)
            self.assertEqual(lines["MEILI_SEARCH_KEY"], "keep")
            self.assertRegex(lines["MEILI_MASTER_KEY"], r"^[0-9a-f]{64}$")


if __name__ == "__main__":
    unittest.main()
