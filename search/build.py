"""Build search/data/foods.ndjson from the downloads.

Usage: search\\.venv\\Scripts\\python -m search.build
"""

import json
import sqlite3
import sys
import tempfile
import time
from collections import Counter
from dataclasses import asdict
from functools import reduce
from itertools import groupby
from pathlib import Path

import duckdb

from search import sources
from search.merge import pick
from search.quality import References
from search.records import FoodDoc

ROOT = Path(__file__).resolve().parent
APP_USDA = ROOT.parent / "src" / "data" / "usda.json"
BATCH = 5000


def _app_aliases(aliases_file: Path) -> dict[int, list[str]]:
    """Other names the app already knows for USDA SR foods, by SR number."""
    rows = json.loads(aliases_file.read_text(encoding="utf-8"))
    return {r[0]: [a.strip() for a in r[16].split(",") if a.strip()] for r in rows if r[16]}


def _records(con, data: Path, aliases_file: Path, dropped: Counter):
    """Every (doc, drop_reason) from every source that is present."""
    parquet = data / "downloads" / "off" / "food.parquet"
    if parquet.exists():
        print("reading Open Food Facts", flush=True)
        yield from sources.read_off(con, parquet, dropped)
    if folder := sources.find_csv_folder(data / "usda" / "branded"):
        print("reading USDA branded", flush=True)
        yield from sources.read_branded(con, folder, dropped)
    if folder := sources.find_csv_folder(data / "usda" / "sr"):
        print("reading USDA SR Legacy", flush=True)
        numbers, other_names = sources.sr_numbers(con, folder), _app_aliases(aliases_file)
        for doc, why in sources.read_generic(con, folder, "sr_legacy_food"):
            if doc:
                extra = other_names.get(numbers.get(doc.id.split("_", 1)[1]), [])
                doc.aliases = list(dict.fromkeys([*doc.aliases, *extra]))
            yield doc, why
    if folder := sources.find_csv_folder(data / "usda" / "survey"):
        print("reading USDA survey foods", flush=True)
        yield from sources.read_generic(con, folder, "survey_fndds_food")


def _merge(docs: list[FoodDoc], refs: References) -> FoodDoc:
    """Newest USDA record and best Open Food Facts record first, then choose between the two sources."""
    families = [[d for d in docs if d.source.startswith("usda")], [d for d in docs if d.source == "off"]]
    return reduce(lambda a, b: pick(a, b, refs), [reduce(pick, family) for family in families if family])


def build(data_dir: Path, out: Path, aliases_file: Path = APP_USDA) -> dict:
    dropped: Counter = Counter()
    kept = 0
    out.parent.mkdir(parents=True, exist_ok=True)
    partial = out.with_name(out.name + ".partial")
    # Records are staged on disk so millions of them never sit in memory.
    with tempfile.TemporaryDirectory(dir=out.parent, ignore_cleanup_errors=True) as work:
        con = duckdb.connect(config={"temp_directory": str(Path(work) / "duck")})
        con.execute("SET enable_progress_bar=false")
        staged = sqlite3.connect(Path(work) / "staged.sqlite")
        try:
            staged.executescript("PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF; CREATE TABLE s(key TEXT, doc TEXT)")
            batch = []
            refs = References()
            for doc, why in _records(con, data_dir, aliases_file, dropped):
                if doc is None:
                    dropped[why] += 1
                    continue
                if doc.source == "usda_branded":
                    refs.add(doc)
                batch.append((doc.barcode or doc.id, json.dumps(asdict(doc), ensure_ascii=False)))
                if len(batch) >= BATCH:
                    staged.executemany("INSERT INTO s VALUES (?, ?)", batch)
                    kept += len(batch)
                    batch = []
                    if kept % 100_000 == 0:
                        print(f"  {kept} records kept", flush=True)
            staged.executemany("INSERT INTO s VALUES (?, ?)", batch)
            kept += len(batch)

            print("merging duplicates", flush=True)
            staged.execute("CREATE INDEX s_key ON s(key)")
            final = flagged = corrected = 0
            by_source: Counter = Counter()
            with partial.open("w", encoding="utf-8", newline="\n") as f:
                rows = staged.execute("SELECT key, doc FROM s ORDER BY key")
                for _, group in groupby(rows, key=lambda r: r[0]):
                    merged = _merge([FoodDoc(**json.loads(r[1])) for r in group], refs)
                    doc = refs.check(merged)
                    corrected += doc.n != merged.n
                    f.write(json.dumps(asdict(doc), ensure_ascii=False) + "\n")
                    final += 1
                    flagged += doc.flagged
                    by_source[doc.source] += 1
        finally:
            staged.close()
            con.close()
    partial.replace(out)
    return {"read": kept + sum(dropped.values()), "dropped": dict(dropped), "merged": kept - final,
            "flagged": flagged, "corrected": corrected, "final": final, "by_source": dict(by_source)}


def main() -> int:
    data = ROOT / "data"
    needed = {"Open Food Facts": (data / "downloads" / "off" / "food.parquet").exists()}
    for name in ("branded", "sr", "survey"):
        needed[f"USDA {name}"] = sources.find_csv_folder(data / "usda" / name) is not None
    if missing := [name for name, present in needed.items() if not present]:
        print(f"Missing downloads: {', '.join(missing)}", file=sys.stderr)
        return 1
    started = time.time()
    report = build(data, data / "foods.ndjson")
    report["minutes"] = round((time.time() - started) / 60, 1)
    report["file_gb"] = round((data / "foods.ndjson").stat().st_size / 1e9, 2)
    (data / "build-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
