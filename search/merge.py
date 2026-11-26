"""Choose between two records that share a barcode."""

from dataclasses import replace

from search.quality import References
from search.records import FoodDoc, serving_grams


def _complete(doc: FoodDoc) -> bool:
    return all(k in doc.n for k in ("p", "c", "f"))


def _disagree(usda: FoodDoc, off: FoodDoc) -> bool:
    if "kcal" not in usda.n or "kcal" not in off.n:
        return False
    return abs(off.n["kcal"] - usda.n["kcal"]) > max(20, 0.2 * usda.n["kcal"])


def _blank(doc: FoodDoc) -> bool:
    return doc.n.get("kcal", 0) < 10 and sum(doc.n.get(k, 0) for k in ("p", "c", "f")) < 1


def _explained(usda: FoodDoc, off: FoodDoc) -> bool:
    """The Open Food Facts numbers are all USDA's, wrongly scaled by the serving size one way or the other."""
    grams = serving_grams(off) or serving_grams(usda)
    if not grams or abs(grams - 100) < 20:
        return False

    def scaled_by(factor: float) -> bool:
        return all(abs(off.n[k] - usda.n[k] * factor) <= max(floor, share * off.n[k])
                   for k, floor, share in (("kcal", 8, 0.07), ("p", 1.5, 0.15), ("c", 1.5, 0.15), ("f", 1.5, 0.15))
                   if k in off.n and k in usda.n)

    return scaled_by(grams / 100) or scaled_by(100 / grams)


def _between_sources(usda: FoodDoc, off: FoodDoc, refs: References | None) -> FoodDoc:
    if not _disagree(usda, off):
        return off if off.updated > usda.updated else usda
    # When they differ, USDA's label data is far more often right, however recently the other was edited
    if _blank(usda) and off.n["kcal"] > 25:
        return replace(off, flagged=1)
    if not _explained(usda, off):
        return replace(usda, flagged=1)
    # Now and then USDA is the scaled one: foods of the same name show it
    return replace(off, flagged=1) if refs and refs.backs(off, usda) else usda


def _winner(a: FoodDoc, b: FoodDoc, refs: References | None) -> FoodDoc:
    # A record with all three macros beats one without, whatever its source or age.
    if _complete(a) != _complete(b):
        return a if _complete(a) else b
    # Likewise a record whose numbers add up beats a doubtful one.
    if a.flagged != b.flagged:
        return b if a.flagged else a
    a_usda, b_usda = a.source.startswith("usda"), b.source.startswith("usda")
    if a_usda != b_usda:
        return _between_sources(a, b, refs) if a_usda else _between_sources(b, a, refs)
    return max(a, b, key=lambda d: (d.updated, d.id))


def pick(a: FoodDoc, b: FoodDoc, refs: References | None = None) -> FoodDoc:
    won = _winner(a, b, refs)
    lost = b if (won.id, won.source) == (a.id, a.source) else a
    return replace(won, popularity=max(a.popularity, b.popularity), brand=won.brand or lost.brand)
