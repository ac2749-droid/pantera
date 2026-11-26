"""Turn one Open Food Facts or USDA source row into a FoodDoc. Nutrient keys match src/foods.ts."""

import math
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone

from search.vocabulary import words_of

HUNDRED = {"label": "100 g", "g": 100.0}
MAX_PORTION_G = 5000
MAX_SODIUM_MG = 40_000  # pure salt holds about 39,300 mg per 100 g
ROUNDING_G = 1  # labels round each line separately
PARTS = (("sug", "c"), ("fib", "c"), ("sat", "f"))
# A weight in grams printed in a serving label, such as "(113 g)"; "mg" does not match
LABEL_GRAMS = re.compile(r"(?<![\w.,])(\d+(?:[.,]\d+)?)\s*(?:g|gr|grm|grams?)\b", re.IGNORECASE)

# Open Food Facts nutrient name -> (our key, multiplier). Values arrive per 100 g, in grams.
OFF_NUTRIENTS = {
    "proteins": ("p", 1), "carbohydrates": ("c", 1), "fat": ("f", 1), "fiber": ("fib", 1), "sugars": ("sug", 1),
    "saturated-fat": ("sat", 1), "sodium": ("na", 1e3), "potassium": ("k", 1e3), "calcium": ("ca", 1e3),
    "iron": ("fe", 1e3), "vitamin-c": ("vc", 1e3), "cholesterol": ("chol", 1e3),
    "monounsaturated-fat": ("mono", 1), "polyunsaturated-fat": ("poly", 1), "vitamin-a": ("va", 1e6),
    "vitamin-d": ("vd", 1e6), "vitamin-e": ("ve", 1e3), "vitamin-k": ("vk", 1e6), "vitamin-b1": ("b1", 1e3),
    "vitamin-b2": ("b2", 1e3), "vitamin-pp": ("b3", 1e3), "vitamin-b6": ("b6", 1e3), "vitamin-b9": ("fol", 1e6),
    "vitamin-b12": ("b12", 1e6), "magnesium": ("mag", 1e3), "phosphorus": ("ph", 1e3), "zinc": ("zn", 1e3),
    "copper": ("cu", 1e3), "manganese": ("mn", 1e3), "selenium": ("se", 1e6),
}

# USDA FoodData Central nutrient id -> our key (already in our units)
FDC_NUTRIENTS = {
    1008: "kcal", 1003: "p", 1005: "c", 1004: "f", 1079: "fib", 2000: "sug", 1258: "sat", 1093: "na",
    1092: "k", 1087: "ca", 1089: "fe", 1162: "vc", 1253: "chol", 1292: "mono", 1293: "poly", 1106: "va",
    1114: "vd", 1109: "ve", 1185: "vk", 1165: "b1", 1166: "b2", 1167: "b3", 1175: "b6", 1190: "fol",
    1178: "b12", 1180: "cho", 1090: "mag", 1091: "ph", 1095: "zn", 1098: "cu", 1101: "mn", 1103: "se",
}
FDC_ALCOHOL = 1018

USDA_SOURCES = {
    "branded_food": ("usdab", "usda_branded", "branded"),
    "sr_legacy_food": ("usdasr", "usda_sr", "generic"),
    "survey_fndds_food": ("usdafn", "usda_fndds", "generic"),
}

# Checked in this order; the first matching group wins.
CATEGORY_WORDS = [
    ("frozen", ("frozen", "ice cream", "ice-cream", "pizza")),
    ("drinks", ("beverage", "drink", "juice", "soda", "water", "coffee", "teas")),
    ("snacks", ("snack", "candy", "candies", "chocolate", "cookie", "chip", "cracker", "confection", "sweet", "popcorn", "dessert")),
    ("dairy", ("dair", "cheese", "yogurt", "yoghurt", "milk", "butter", "cream", "egg")),
    ("meat_seafood", ("meat", "seafood", "fish", "poultry", "sausage", "beef", "pork", "chicken", "turkey")),
    ("bakery_grains", ("bread", "bakery", "baked", "cereal", "pasta", "rice", "grain", "flour", "tortilla", "oat")),
    ("produce", ("fruit", "vegetable", "salad", "legume", "bean")),
]


@dataclass
class FoodDoc:
    id: str
    name: str
    brand: str | None
    kind: str
    barcode: str | None
    portions: list[dict]
    n: dict[str, float]
    source: str
    popularity: int = 0
    flagged: int = 0
    updated: str = ""
    category: str = "other"
    aliases: list[str] = field(default_factory=list)
    kind_rank: int = 1
    per_serving: bool = False  # Open Food Facts: the label was typed in per serving, not per 100 g


def serving_grams(doc: FoodDoc) -> float | None:
    """The weight of the food's own serving, when it has one besides 100 g."""
    return next((p["g"] for p in doc.portions if p["label"] != HUNDRED["label"]), None)


def _number(value) -> float | None:
    try:
        x = float(value)
    except (TypeError, ValueError):
        return None
    return x if math.isfinite(x) else None


def normalize_barcode(raw: str | None) -> str | None:
    if not raw or re.search(r"[^\d\s-]", raw):
        return None
    digits = re.sub(r"\D", "", raw).lstrip("0")
    return digits if 6 <= len(digits) <= 14 else None


def is_flagged(n: dict[str, float]) -> int:
    kcal = n.get("kcal")
    macros = [n.get(k) for k in ("p", "c", "f")]
    if kcal is not None and kcal > 910:
        return 1
    if any(v is not None and not 0 <= v <= 100 for v in macros):
        return 1
    if (n.get("na") or 0) > MAX_SODIUM_MG:
        return 1
    if any(n.get(part) is not None and n.get(whole) is not None and n[part] > n[whole] + ROUNDING_G
           for part, whole in PARTS):
        return 1
    if kcal is None or any(v is None for v in macros):
        return 0
    p, c, f = macros
    if p + c + f > 105:
        return 1
    fib, alc = max(n.get("fib") or 0, 0), max(n.get("alc") or 0, 0)
    total = 4 * p + 4 * c + 9 * f + 7 * alc
    net = 4 * p + 4 * max(c - fib, 0) + 2 * fib + 9 * f + 7 * alc
    allowed = max(25, 0.2 * kcal)
    return int(abs(kcal - total) > allowed and abs(kcal - net) > allowed)


def natural_alias(description: str) -> str | None:
    """USDA writes "Cheese, cottage, lowfat"; people type "cottage cheese"."""
    parts = [s.strip() for s in description.split(",") if s.strip()]
    return f"{parts[1]} {parts[0]}".lower() if len(parts) >= 2 else None


def _category(labels: list[str]) -> str:
    """Labels are ordered from most to least specific."""
    for label in labels:
        text = label.lower()
        if "and-beverages" in text or "plant-based-foods" in text:
            continue
        for category, keywords in CATEGORY_WORDS:
            if any(k in text for k in keywords):
                return category
    return "other"


def _agreed_grams(label: str, grams: float) -> float | None:
    """The serving weight to trust when the label states one; None when it cannot be told."""
    stated = {float(x.replace(",", ".")) for x in LABEL_GRAMS.findall(label)}
    if not stated or any(abs(x - grams) <= max(1, 0.1 * x) for x in stated):
        return grams
    return stated.pop() if len(stated) == 1 else None


def _portions(label: str | None, grams) -> list[dict]:
    g = _number(grams)
    if g is not None and g > 0 and label:
        g = _agreed_grams(str(label), g)
    if g is None or not 0 < g < MAX_PORTION_G:
        return [dict(HUNDRED)]
    return _with_hundred([{"label": str(label or f"{g:g} g")[:40], "g": g}])


def _with_hundred(portions: list[dict]) -> list[dict]:
    out = [p for p in portions if 0 < p["g"] < MAX_PORTION_G]
    if not any(p["label"] == HUNDRED["label"] for p in out):
        out.append(dict(HUNDRED))
    return out


def _doc_nutrients(raw: dict[str, float]) -> dict[str, float]:
    return {k: round(v, 4) for k, v in raw.items() if k != "alc" and v >= 0}


def _plain_spelling(brand: str | None, name: str) -> list[str]:
    """The search server reads "Ellie's" as "ellie" and "s"; people type "ellies"."""
    text = f"{brand or ''} {name}"
    return [" ".join(words_of(text))] if "'" in text or "’" in text else []


def off_to_doc(row: dict) -> tuple[FoodDoc | None, str | None]:
    if "en:united-states" not in (row.get("countries_tags") or []):
        return None, "not_us"
    if row.get("obsolete"):
        return None, "obsolete"
    names = {n["lang"]: n["text"].strip() for n in (row.get("product_name") or []) if n and (n.get("text") or "").strip()}
    name = names.get("en") or names.get("main") or next(iter(names.values()), "")
    if not name:
        return None, "no_name"

    values = {}
    for item in row.get("nutriments") or []:
        x = _number(item.get("100g")) if item else None
        if x is not None:
            values[item.get("name")] = x

    raw = {key: values[off] * mult for off, (key, mult) in OFF_NUTRIENTS.items() if off in values}
    if "na" not in raw and "salt" in values:
        raw["na"] = values["salt"] / 2.5 * 1e3
    kcal = values.get("energy-kcal")
    if kcal is None:
        kj = values.get("energy-kj", values.get("energy"))
        kcal = None if kj is None else kj / 4.184
    if kcal is None or kcal < 0:
        return None, "no_calories"
    raw["kcal"] = kcal
    if "alcohol" in values:
        raw["alc"] = values["alcohol"] * 0.789  # % volume -> grams per 100 ml

    code = str(row.get("code") or "")
    barcode = normalize_barcode(code)
    ident = barcode or ("x" + re.sub(r"[^A-Za-z0-9]", "", code) if re.search(r"[A-Za-z0-9]", code) else None)
    if not ident:
        return None, "no_code"

    brand = next((b.strip() for b in str(row.get("brands") or "").split(",") if b.strip()), None)
    modified = _number(row.get("last_modified_t"))
    updated = datetime.fromtimestamp(modified, timezone.utc).date().isoformat() if modified else ""
    return FoodDoc(
        id=f"off_{ident}", name=name[:120], brand=brand, kind="branded", barcode=barcode,
        portions=_portions(row.get("serving_size"), row.get("serving_quantity")),
        n=_doc_nutrients(raw), source="off", popularity=int(_number(row.get("unique_scans_n")) or 0),
        flagged=is_flagged(raw), updated=updated,
        category=_category(list(reversed(row.get("categories_tags") or []))),
        aliases=_plain_spelling(brand, name), per_serving=row.get("nutrition_data_per") == "serving",
    ), None


def _title(text: str) -> str:
    """Title-case shouted USDA names without turning "JERRY'S" into "Jerry'S"."""
    if text != text.upper():
        return text
    return re.sub(r"(?<![\w'’])\w", lambda m: m.group().upper(), text.lower())


def usda_to_doc(food: dict, nutrients: dict[int, float], portions: list[dict]) -> tuple[FoodDoc | None, str | None]:
    prefix, source, kind = USDA_SOURCES[food["data_type"]]
    name = str(food.get("description") or "").strip()
    if not name:
        return None, "no_name"

    raw = {key: x for fid, key in FDC_NUTRIENTS.items() if (x := _number(nutrients.get(fid))) is not None}
    if raw.get("kcal") is None or raw["kcal"] < 0:
        return None, "no_calories"
    alcohol = _number(nutrients.get(FDC_ALCOHOL))
    if alcohol is not None:
        raw["alc"] = alcohol

    branded = kind == "branded"
    brand = str(food.get("brand_name") or food.get("brand_owner") or "").strip() if branded else ""
    if branded:
        unit = str(food.get("serving_size_unit") or "").strip().lower()
        grams = food.get("serving_size") if unit in ("g", "grm", "ml", "mlt") else None
        doc_portions = _portions(food.get("household_serving_fulltext"), grams)
    else:
        doc_portions = _with_hundred([{"label": str(p["label"])[:40], "g": float(p["g"])} for p in portions])

    alias = None if branded else natural_alias(name)
    shown_name = (_title(name) if branded else name)[:120]
    shown_brand = _title(brand) if brand else None
    aliases = ([alias] if alias else []) + _plain_spelling(shown_brand, shown_name)
    category = str(food.get("category") or "")
    return FoodDoc(
        id=f"{prefix}_{food['fdc_id']}", name=shown_name, brand=shown_brand, kind=kind,
        barcode=normalize_barcode(str(food.get("gtin_upc") or "")) if branded else None,
        portions=doc_portions, n=_doc_nutrients(raw), source=source, flagged=is_flagged(raw),
        updated=str(food.get("date") or ""), category=_category([category, name]),
        aliases=aliases, kind_rank=1 if branded else 0,
    ), None
