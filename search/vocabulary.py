"""Every word in the food names, for correcting spelling mistakes the search server cannot.

A word and each way of deleting one of its letters are its keys. A typed word that shares a key with a
real word is usually one mistake away from it, wherever the mistake is and however short the word.
"""

import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

MIN_LETTERS = 3
MIN_FOODS = 2  # a word seen only once is more likely a mistake in the data than a word people type


def words_of(text: str) -> list[str]:
    """The same rules as queryWords in src/foodIndex/client.ts."""
    plain = "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.category(c).startswith("M"))
    plain = plain.replace("'", "").replace("’", "").lower()
    return [w for w in re.split(r"[\W_]+", plain) if w]


def delete_keys(word: str) -> list[str]:
    return list(dict.fromkeys([word, *(word[:i] + word[i + 1:] for i in range(len(word)))]))


def vocabulary(foods: Path):
    """Documents for the `words` index, from foods.ndjson."""
    counts: Counter = Counter()
    with foods.open(encoding="utf-8") as f:
        for line in f:
            if line.strip():
                food = json.loads(line)
                text = " ".join([food["name"], food.get("brand") or "", *(food.get("aliases") or [])])
                counts.update({w for w in words_of(text) if len(w) >= MIN_LETTERS and w.isalpha()})
    kept = sorted(w for w, n in counts.items() if n >= MIN_FOODS)
    for i, word in enumerate(kept):
        yield {"id": str(i), "word": word, "count": counts[word], "keys": delete_keys(word)}
