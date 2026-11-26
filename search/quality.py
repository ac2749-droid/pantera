"""Catch wrong crowd-sourced numbers by comparing a product with USDA products of the same name.

A common mistake in Open Food Facts is one serving's numbers entered as if they were for 100 g (a cup
of milk then counts about two and a half times over). Only that mistake is rewritten, when the label says
it was typed per serving and the corrected numbers match; anything else that looks wrong is only marked.
"""

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import replace
from statistics import median

from search.records import FoodDoc, is_flagged, serving_grams
from search.vocabulary import words_of

MACROS = ("kcal", "p", "c", "f")
MIN_NAMESAKES = 5
MIN_WORDS = 2  # one word ("Milk", "Bars") covers too many different foods
MIN_KCAL = 25  # below this, scaled and unscaled numbers look alike
WRONG_BY = 1.5
MIN_SERVING_GAP = 30  # grams from 100, so the two readings of a number differ


def _name_key(doc: FoodDoc) -> str:
    brand = set(words_of(doc.brand or ""))
    words = sorted({w for w in words_of(doc.name) if w not in brand})
    return " ".join(words) if len(words) >= MIN_WORDS else ""


def _near(values: tuple, usual: tuple) -> bool:
    allowed = [max(floor, share * x) for x, floor, share in zip(usual, (12, 1.2, 2.5, 1.2), (0.18, 0.35, 0.35, 0.35))]
    return all(abs(v - x) <= 0.8 * a for v, x, a in zip(values, usual, allowed))


class References:
    """The usual numbers of foods sharing a name, taken from USDA's label data."""

    def __init__(self):
        self._rows: dict[str, list[tuple]] = defaultdict(list)
        self._summaries: dict[str, tuple | None] = {}

    @classmethod
    def of(cls, docs: Iterable[FoodDoc]) -> "References":
        refs = cls()
        for doc in docs:
            refs.add(doc)
        return refs

    def add(self, doc: FoodDoc) -> None:
        if not doc.flagged and all(k in doc.n for k in MACROS) and (key := _name_key(doc)):
            self._rows[key].append(tuple(doc.n[k] for k in MACROS))

    def _summary(self, key: str) -> tuple | None:
        """(typical macros, low kcal, high kcal), or None when the namesakes don't agree well enough."""
        if key not in self._summaries:
            rows = self._rows.get(key, [])
            found = None
            if len(rows) >= MIN_NAMESAKES:
                kcal = sorted(r[0] for r in rows)
                low, high = kcal[len(kcal) // 10], kcal[len(kcal) * 9 // 10]
                if high <= max(low * 1.6, low + 25):
                    found = (tuple(median(r[i] for r in rows) for i in range(len(MACROS))), low, high)
            self._summaries[key] = found
        return self._summaries[key]

    def backs(self, doc: FoodDoc, other: FoodDoc) -> bool:
        """Foods of the same name look like `doc` and not like `other`."""
        summary = self._summary(_name_key(doc))
        if not summary or not all(k in d.n for d in (doc, other) for k in MACROS):
            return False
        usual = summary[0]
        return _near(tuple(doc.n[k] for k in MACROS), usual) and not _near(tuple(other.n[k] for k in MACROS), usual)

    def check(self, doc: FoodDoc) -> FoodDoc:
        """The same record, corrected or marked for checking when its numbers can't be right."""
        if doc.source != "off" or not all(k in doc.n for k in MACROS):
            return doc
        summary = self._summary(_name_key(doc))
        if not summary:
            return doc
        usual, low, high = summary
        kcal = doc.n["kcal"]
        grams = serving_grams(doc)
        if (doc.per_serving and grams and abs(grams - 100) >= MIN_SERVING_GAP and usual[0] >= MIN_KCAL
                and not usual[0] / WRONG_BY < kcal < usual[0] * WRONG_BY):
            scaled = {k: round(v * 100 / grams, 4) for k, v in doc.n.items()}
            if _near(tuple(scaled[k] for k in MACROS), usual):
                return replace(doc, n=scaled, flagged=is_flagged(scaled))
        far = kcal > max(high * WRONG_BY, high + 40) or kcal < min(low / WRONG_BY, low - 40)
        return replace(doc, flagged=1) if far else doc
