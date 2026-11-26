"""Remember the old numbers of foods whose numbers changed between two releases of the database.

Usage: python -m search.changes OLD.db [NEW.db]
The app recognises copies of those foods saved before the change by these numbers, and updates them.
Run it for every release whose database changed, with the database of the release before.
"""

import json
import sqlite3
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
OUT = APP / "src" / "data" / "previousNumbers.json"
# Smaller differences in kcal, protein, carbs and fat are rounding, not worth touching a saved food for
WORTH = (2, 0.5, 0.5, 0.5)


def _macros(n: str) -> list:
    values = (json.loads(n) + [None] * 4)[:4]
    return [0 if v is None else v for v in values]


def record_changes(old: Path, new: Path, out: Path = OUT) -> int:
    """Adds the old numbers of changed foods to `out`; returns how many foods changed."""
    known: dict[str, list] = json.loads(out.read_text(encoding="utf-8")) if out.exists() else {}
    before, after = sqlite3.connect(old), sqlite3.connect(new)
    changed = 0
    try:
        now = {code: (_macros(n), flagged) for code, n, flagged in after.execute(
            "SELECT b.barcode, f.n, f.flagged FROM barcodes b JOIN foods f ON f.rid = b.rid")}
        rows = before.execute("SELECT id, barcode, n, flagged FROM foods WHERE barcode IS NOT NULL ORDER BY id")
        for ident, code, n, flagged in rows:
            if code not in now:
                continue
            was, (is_now, doubted) = _macros(n), now[code]
            if not (doubted and not flagged) and all(abs(a - b) <= w for a, b, w in zip(was, is_now, WORTH)):
                continue
            changed += 1
            if was not in known.setdefault(ident, []):
                known[ident].append(was)
    finally:
        before.close()
        after.close()
    out.write_text(json.dumps(dict(sorted(known.items())), separators=(",", ":")) + "\n", encoding="utf-8")
    return changed


def main() -> int:
    if len(sys.argv) < 2 or not Path(sys.argv[1]).exists():
        print("Usage: python -m search.changes OLD.db [NEW.db]", file=sys.stderr)
        return 1
    new = Path(sys.argv[2]) if len(sys.argv) > 2 else APP / "assets" / "foods.db"
    changed = record_changes(Path(sys.argv[1]), new)
    print(f"{changed} foods changed; {OUT.stat().st_size / 1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
