"""Settings for the Meilisearch `foods` index."""

import json
from pathlib import Path

SYNONYMS = Path(__file__).with_name("synonyms.json")


def words_settings() -> dict:
    """The vocabulary used to correct spelling: look words up by key, most common first."""
    return {
        "searchableAttributes": ["word"],
        "filterableAttributes": ["keys"],
        "sortableAttributes": ["count"],
    }


def index_settings() -> dict:
    return {
        "searchableAttributes": ["name", "brand", "aliases"],
        "filterableAttributes": ["barcode", "kind"],
        # Text relevance first, then trustworthy, generic and popular foods.
        "rankingRules": ["words", "typo", "proximity", "attributeRank", "exactness",
                         "flagged:asc", "kind_rank:asc", "popularity:desc"],
        "typoTolerance": {"disableOnNumbers": True, "minWordSizeForTypos": {"oneTypo": 4, "twoTypos": 9}},
        "synonyms": json.loads(SYNONYMS.read_text(encoding="utf-8")),
    }
