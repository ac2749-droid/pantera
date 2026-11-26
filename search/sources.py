"""Read the downloaded Open Food Facts and USDA files with DuckDB, one record at a time."""

from pathlib import Path

from search.records import FDC_ALCOHOL, FDC_NUTRIENTS, off_to_doc, usda_to_doc

FETCH = 5000
MAX_PORTIONS = 6
US_TAG = "en:united-states"
OFF_COLUMNS = ("code, product_name, brands, countries_tags, categories_tags, serving_size, serving_quantity, "
               "nutriments, nutrition_data_per, unique_scans_n, last_modified_t, obsolete")


def find_csv_folder(root: Path) -> Path | None:
    """The folder inside an unzipped USDA download that holds food.csv."""
    return next((p.parent for p in sorted(root.rglob("food.csv"))), None) if root.exists() else None


def _csv(folder: Path, name: str) -> str:
    path = (folder / f"{name}.csv").as_posix().replace("'", "''")
    return f"read_csv('{path}', header=true, all_varchar=true, delim=',', quote='\"', escape='\"')"


def _rows(con, sql: str):
    cursor = con.execute(sql)
    names = [c[0] for c in cursor.description]
    while batch := cursor.fetchmany(FETCH):
        for row in batch:
            yield dict(zip(names, row))


def read_off(con, parquet: Path, dropped):
    """Yields (doc, drop_reason). Non-US rows are only counted, never loaded into Python."""
    source = f"read_parquet('{parquet.as_posix()}')"
    us = f"coalesce(list_contains(countries_tags, '{US_TAG}'), false)"
    foreign = con.execute(f"SELECT count(*) FROM {source} WHERE NOT {us}").fetchone()[0]
    if foreign:
        dropped["not_us"] += foreign
    for row in _rows(con, f"SELECT {OFF_COLUMNS} FROM {source} WHERE {us}"):
        yield off_to_doc(row)


def _nutrient_table(con, folder: Path, name: str) -> None:
    """Per food, the nutrients we keep. FNDDS files use nutrient numbers where others use ids."""
    wanted = ",".join(str(i) for i in [*FDC_NUTRIENTS, FDC_ALCOHOL])
    con.execute(f"CREATE OR REPLACE TEMP TABLE nutrient_ids AS SELECT TRY_CAST(id AS BIGINT) AS id, "
                f"TRY_CAST(nutrient_nbr AS DOUBLE) AS nbr FROM {_csv(folder, 'nutrient')}")
    con.execute(f"""
        CREATE OR REPLACE TEMP TABLE {name} AS
        SELECT fdc_id, list(struct_pack(id := id, amount := amount)) AS nutrients
        FROM (
            SELECT f.fdc_id, coalesce(a.id, b.id) AS id, TRY_CAST(f.amount AS DOUBLE) AS amount
            FROM {_csv(folder, 'food_nutrient')} f
            LEFT JOIN nutrient_ids a ON a.id = TRY_CAST(f.nutrient_id AS BIGINT)
            LEFT JOIN nutrient_ids b ON a.id IS NULL AND b.nbr = TRY_CAST(f.nutrient_id AS DOUBLE)
        )
        WHERE id IN ({wanted}) AND amount IS NOT NULL
        GROUP BY fdc_id""")


def _nutrients(row: dict) -> dict[int, float]:
    return {int(n["id"]): n["amount"] for n in row["nutrients"] or []}


def read_branded(con, folder: Path, dropped):
    _nutrient_table(con, folder, "branded_nutrients")
    sql = f"""
        SELECT f.fdc_id, f.data_type, f.description, b.brand_name, b.brand_owner, b.gtin_upc, b.serving_size,
               b.serving_size_unit, b.household_serving_fulltext, b.branded_food_category AS category,
               coalesce(b.modified_date, f.publication_date) AS date,
               coalesce(b.market_country, f.market_country) AS market, b.discontinued_date AS discontinued, n.nutrients
        FROM {_csv(folder, 'food')} f
        JOIN {_csv(folder, 'branded_food')} b USING (fdc_id)
        LEFT JOIN branded_nutrients n USING (fdc_id)
        WHERE f.data_type = 'branded_food'"""
    for row in _rows(con, sql):
        if row["market"] != "United States":
            yield None, "not_us"
        elif row["discontinued"]:
            yield None, "discontinued"
        else:
            yield usda_to_doc(row, _nutrients(row), [])


def _amount(text) -> str:
    try:
        return f"{float(text):g}"
    except (TypeError, ValueError):
        return ""


def _portion_table(con, folder: Path) -> dict[str, list[dict]]:
    sql = f"""
        SELECT p.fdc_id, p.amount, u.name AS unit, p.portion_description AS description, p.modifier, p.gram_weight
        FROM {_csv(folder, 'food_portion')} p
        LEFT JOIN {_csv(folder, 'measure_unit')} u ON u.id = p.measure_unit_id
        ORDER BY p.fdc_id, TRY_CAST(p.seq_num AS INTEGER)"""
    out: dict[str, list[dict]] = {}
    for row in _rows(con, sql):
        grams = float(row["gram_weight"] or 0)
        label = (row["description"] or "").strip()
        if not label:
            unit = row["unit"] if row["unit"] and row["unit"] != "undetermined" else ""
            label = " ".join(x for x in (_amount(row["amount"]), unit, (row["modifier"] or "").strip()) if x)
        portions = out.setdefault(row["fdc_id"], [])
        if grams > 0 and label and label.lower() != "quantity not specified" and len(portions) < MAX_PORTIONS:
            portions.append({"label": label, "g": grams})
    return out


def read_generic(con, folder: Path, data_type: str):
    """SR Legacy ("sr_legacy_food") or FNDDS ("survey_fndds_food")."""
    _nutrient_table(con, folder, "generic_nutrients")
    survey = data_type == "survey_fndds_food"
    table, code = ("wweia_food_category", "wweia_food_category") if survey else ("food_category", "id")
    label = "wweia_food_category_description" if survey else "description"
    sql = f"""
        SELECT f.fdc_id, f.data_type, f.description, c.{label} AS category, f.publication_date AS date, n.nutrients
        FROM {_csv(folder, 'food')} f
        LEFT JOIN {_csv(folder, table)} c ON c.{code} = f.food_category_id
        LEFT JOIN generic_nutrients n USING (fdc_id)
        WHERE f.data_type = '{data_type}'"""
    portions = _portion_table(con, folder)
    for row in _rows(con, sql):
        yield usda_to_doc(row, _nutrients(row), portions.get(row["fdc_id"], []))


def sr_numbers(con, folder: Path) -> dict[str, int]:
    """fdc_id -> the SR number the app's bundled data uses."""
    sql = f"SELECT fdc_id, TRY_CAST(NDB_number AS BIGINT) AS ndb FROM {_csv(folder, 'sr_legacy_food')}"
    return {row["fdc_id"]: row["ndb"] for row in _rows(con, sql)}
