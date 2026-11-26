"""Build the food database that ships inside the app, from foods.ndjson.

Usage: python -m search.mobile
It keeps every USDA food, plus the Open Food Facts products that have been scanned or whose label is
complete. Identical products (same name, brand and numbers) share one row; every barcode is kept. Rows are numbered best-first (generic foods, then popular products),
so the app can stop reading after the first few hundred matches.
"""

import hashlib
import json
import re
import sqlite3
import sys
import time
from collections import Counter
from pathlib import Path

from search.vocabulary import MIN_FOODS, MIN_LETTERS, delete_keys, words_of

ROOT = Path(__file__).resolve().parent
APP = ROOT.parent
# The order of NK in src/foods.ts
NUTRIENT_ORDER = ["kcal", "p", "c", "f", "fib", "sug", "sat", "na", "k", "ca", "fe", "vc",
                  "chol", "mono", "poly", "va", "vd", "ve", "vk", "b1", "b2", "b3", "b6", "fol", "b12", "cho",
                  "mag", "ph", "zn", "cu", "mn", "se"]
SOURCES = {"off": 0, "usda_branded": 1, "usda_sr": 2, "usda_fndds": 3}

SCHEMA = """
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE foods(rid INTEGER PRIMARY KEY, id TEXT, name TEXT, brand TEXT, barcode TEXT, n TEXT,
                   portions TEXT, flagged INTEGER, pop INTEGER, source INTEGER);
CREATE VIRTUAL TABLE fts USING fts5(text, content='', detail='none',
                                    tokenize='unicode61 remove_diacritics 2', prefix='2 3');
CREATE TABLE barcodes(barcode TEXT PRIMARY KEY, rid INTEGER) WITHOUT ROWID;
CREATE TABLE words(id INTEGER PRIMARY KEY, word TEXT, count INTEGER);
CREATE TABLE word_keys(key TEXT, word_id INTEGER, PRIMARY KEY (key, word_id)) WITHOUT ROWID;
"""


SOURCE_LABEL_LIMIT = 40  # labels in foods.ndjson were cut at this length
YIELD_NOTE = re.compile(r"\s*\(\s*yields?\b[^)]*\)?", re.IGNORECASE)


def clean_label(label: str) -> str:
    """A serving label without kitchen notes or an ending cut off in the middle."""
    text = YIELD_NOTE.sub("", label)
    if text.count("(") > text.count(")"):
        text = text[: text.rfind("(")]
    elif len(label) == SOURCE_LABEL_LIMIT and not label.endswith(")") and text == label:
        text = text.rsplit(" ", 1)[0]
    return text.strip(" ,;") or label


def wanted(food: dict) -> bool:
    if food["source"] != "off" or food["popularity"] > 0:
        return True
    complete = all(k in food["n"] for k in ("p", "c", "f"))
    has_serving = any(p["label"] != "100 g" for p in food["portions"])
    # A doubtful one is kept: scanning it then shows a warning rather than fetching the same numbers unmarked
    return bool(food.get("brand")) and complete and has_serving


def _identity(food: dict) -> tuple:
    """Foods a person could not tell apart: same name, brand, serving and main numbers."""
    n = food["n"]
    return (" ".join(words_of(food["name"])), " ".join(words_of(food.get("brand") or "")),
            *(round(n.get(k, -1)) for k in ("kcal", "p", "c", "f")), round(food["portions"][0]["g"]))


def _distinct(foods: list[dict]) -> list[tuple[dict, list[str]]]:
    """One entry per distinct food, the most popular record kept, with all their barcodes."""
    kept: dict[tuple, tuple[dict, list[str]]] = {}
    for food in sorted(foods, key=lambda f: (-f["popularity"], f["source"] == "off", f["id"])):
        entry = kept.setdefault(_identity(food), (food, []))
        if food.get("barcode"):
            entry[1].append(food["barcode"])
    return list(kept.values())


def _order(food: dict) -> tuple:
    branded = food["kind"] == "branded"
    return (branded, food["flagged"], -food["popularity"] if branded else 0, len(food["name"]), food["id"])


def _nutrients(n: dict) -> str:
    values = [None if k not in n else round(n[k], 2) for k in NUTRIENT_ORDER]
    while values and values[-1] is None:
        values.pop()
    return json.dumps([int(v) if v is not None and v == int(v) else v for v in values], separators=(",", ":"))


def build_mobile(source: Path, out: Path, info_file: Path) -> dict:
    with source.open(encoding="utf-8") as f:
        foods = [food for line in f if line.strip() and wanted(food := json.loads(line))]
    entries = _distinct(foods)
    entries.sort(key=lambda entry: _order(entry[0]))

    out.parent.mkdir(parents=True, exist_ok=True)
    partial = out.with_name(out.name + ".partial")
    partial.unlink(missing_ok=True)
    db = sqlite3.connect(partial)
    try:
        db.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; PRAGMA page_size=4096;" + SCHEMA)
        counts: Counter = Counter()
        generic = 0
        contents = hashlib.sha1()  # of everything stored, so the app knows when to replace its copy
        for rid, (food, barcodes) in enumerate(entries, start=1):
            generic += food["kind"] == "generic"
            portions = [[clean_label(p["label"]), p["g"]] for p in food["portions"] if p["label"] != "100 g"]
            row = (rid, food["id"], food["name"], food.get("brand"), food.get("barcode"), _nutrients(food["n"]),
                   json.dumps(portions, ensure_ascii=False, separators=(",", ":")), food["flagged"],
                   food["popularity"], SOURCES[food["source"]])
            contents.update(repr((row, barcodes)).encode("utf-8"))
            db.execute("INSERT INTO foods VALUES (?,?,?,?,?,?,?,?,?,?)", row)
            db.executemany("INSERT OR IGNORE INTO barcodes VALUES (?, ?)", ((code, rid) for code in barcodes))
            text = words_of(" ".join([food["name"], food.get("brand") or "", *(food.get("aliases") or [])]))
            db.execute("INSERT INTO fts(rowid, text) VALUES (?, ?)", (rid, " ".join(dict.fromkeys(text))))
            counts.update({w for w in text if len(w) >= MIN_LETTERS and w.isalpha()})

        # With a smaller set of foods a rare word is still a real one, so the same threshold applies
        words = sorted(w for w, n in counts.items() if n >= MIN_FOODS)
        db.executemany("INSERT INTO words VALUES (?,?,?)", ((i, w, counts[w]) for i, w in enumerate(words, 1)))
        db.executemany("INSERT OR IGNORE INTO word_keys VALUES (?,?)",
                       ((key, i) for i, w in enumerate(words, 1) for key in delete_keys(w)))
        version = f"{len(entries)}-{contents.hexdigest()[:10]}"
        db.executemany("INSERT INTO meta VALUES (?,?)", [("generic", str(generic)), ("version", version)])
        db.execute("INSERT INTO fts(fts) VALUES ('optimize')")
        db.commit()
        db.execute("VACUUM")
    finally:
        db.close()
    partial.replace(out)
    info = {"version": version, "foods": len(entries), "generic": generic}
    info_file.write_text(json.dumps(info) + "\n", encoding="utf-8")
    return info


def main() -> int:
    source = ROOT / "data" / "foods.ndjson"
    if not source.exists():
        print("Build the index first: python -m search.build", file=sys.stderr)
        return 1
    started = time.time()
    out = APP / "assets" / "foods.db"
    info = build_mobile(source, out, APP / "src" / "foodIndex" / "foodsDbInfo.json")
    print(f"{info['foods']} foods, {out.stat().st_size / 1e6:.0f} MB, {(time.time() - started) / 60:.1f} minutes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
