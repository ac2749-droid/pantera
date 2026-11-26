import csv
import json
import tempfile
import unittest
from pathlib import Path

try:
    import duckdb
except ImportError:  # the system Python has no DuckDB; search/.venv does
    duckdb = None


def write_csv(path: Path, header: list[str], rows: list[list]):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL)
        w.writerow(header)
        w.writerows(rows)


NUTRIENT = (["id", "name", "unit_name", "nutrient_nbr", "rank"],
            [[1003, "Protein", "G", "203", ""], [1004, "Fat", "G", "204", ""], [1005, "Carbs", "G", "205", ""],
             [1008, "Energy", "KCAL", "208", ""], [2000, "Total Sugars", "G", "269", ""]])
FOOD_NUTRIENT = ["id", "fdc_id", "nutrient_id", "amount"]
PORTION = ["id", "fdc_id", "seq_num", "amount", "measure_unit_id", "portion_description", "modifier", "gram_weight"]
UNITS = (["id", "name"], [[1000, "cup"], [9999, "undetermined"]])


def nutrients(fdc_id, kcal=100, p=10, c=5, f=4, ids=(1008, 1003, 1005, 1004)):
    return [[f"{fdc_id}{i}", fdc_id, nid, v] for i, (nid, v) in enumerate(zip(ids, (kcal, p, c, f)))]


def off_fixture(data: Path, rows: list[dict]):
    folder = data / "downloads" / "off"
    folder.mkdir(parents=True)
    source = folder / "rows.ndjson"
    source.write_text("".join(json.dumps(r) + "\n" for r in rows), encoding="utf-8")
    target = (folder / "food.parquet").as_posix()
    duckdb.sql(f"COPY (SELECT * FROM read_json_auto('{source.as_posix()}')) TO '{target}' (FORMAT parquet)")


def off_row(code, name, countries=("en:united-states",)):
    return {"code": code, "product_name": [{"lang": "main", "text": name}] if name else [], "brands": "The Honest Cow",
            "countries_tags": list(countries), "categories_tags": ["en:dairies"], "serving_size": "0.5 cup (113 g)",
            "serving_quantity": "113", "nutrition_data_per": "100g", "unique_scans_n": 14, "last_modified_t": 1600000000, "obsolete": False,
            "nutriments": [{"name": n, "100g": v} for n, v in
                           [("energy-kcal", 106.0), ("proteins", 13.3), ("carbohydrates", 4.4), ("fat", 4.4)]]}


def branded_fixture(data: Path, foods: list[tuple]):
    """foods: (fdc_id, barcode, market, discontinued)"""
    folder = data / "usda" / "branded" / "FoodData_Central_branded_food_csv_x"
    write_csv(folder / "food.csv", ["fdc_id", "data_type", "description", "food_category_id", "publication_date", "market_country"],
              [[i, "branded_food", "COTTAGE CHEESE", "", "2025-01-01", market] for i, _, market, _ in foods])
    write_csv(folder / "branded_food.csv",
              ["fdc_id", "brand_owner", "brand_name", "gtin_upc", "ingredients", "serving_size", "serving_size_unit",
               "household_serving_fulltext", "branded_food_category", "modified_date", "market_country", "discontinued_date"],
              [[i, "Owner", "THE HONEST COW", code, 'MILK, "CULTURES",\nSALT', "113", "g", "0.5 cup", "Cheese",
                "2025-02-02", market, gone] for i, code, market, gone in foods])
    write_csv(folder / "food_nutrient.csv", FOOD_NUTRIENT, [r for i, *_ in foods for r in nutrients(i)])
    write_csv(folder / "nutrient.csv", *NUTRIENT)


def sr_fixture(data: Path):
    folder = data / "usda" / "sr" / "x"
    write_csv(folder / "food.csv", ["fdc_id", "data_type", "description", "food_category_id", "publication_date"],
              [[50, "sr_legacy_food", "Cheese, cottage, lowfat", 1, "2019-04-01"]])
    write_csv(folder / "food_nutrient.csv", FOOD_NUTRIENT, nutrients(50))
    write_csv(folder / "nutrient.csv", *NUTRIENT)
    write_csv(folder / "food_category.csv", ["id", "code", "description"], [[1, "0100", "Dairy and Egg Products"]])
    write_csv(folder / "sr_legacy_food.csv", ["fdc_id", "NDB_number"], [[50, "01015"]])
    write_csv(folder / "food_portion.csv", PORTION,
              [[2, 50, 2, "4", 9999, "", "oz", "113"], [1, 50, 1, "1", 1000, "", "(not packed)", "226"]])
    write_csv(folder / "measure_unit.csv", *UNITS)


def survey_fixture(data: Path):
    folder = data / "usda" / "survey" / "x"
    write_csv(folder / "food.csv", ["fdc_id", "data_type", "description", "food_category_id", "publication_date"],
              [[70, "survey_fndds_food", "Milk, whole", 1002, "2024-10-31"]])
    # FNDDS identifies nutrients by nutrient_nbr, not id
    write_csv(folder / "food_nutrient.csv", FOOD_NUTRIENT, nutrients(70, 61, 3.2, 4.8, 3.3, ids=(208, 203, 205, 204)))
    write_csv(folder / "nutrient.csv", *NUTRIENT)
    write_csv(folder / "wweia_food_category.csv", ["wweia_food_category", "wweia_food_category_description"],
              [[1002, "Milk, whole"]])
    write_csv(folder / "food_portion.csv", PORTION,
              [[3, 70, 1, "", 9999, "1 cup", "10205", "244"], [4, 70, 2, "", 9999, "Quantity not specified", "90000", "0"]])
    write_csv(folder / "measure_unit.csv", *UNITS)


@unittest.skipIf(duckdb is None, "needs DuckDB: run with search/.venv/Scripts/python")
class Build(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.data = Path(tmp.name)
        self.out = self.data / "foods.ndjson"
        self.aliases = self.data / "usda.json"
        self.aliases.write_text("[]", encoding="utf-8")

    def run_build(self):
        from search.build import build
        report = build(self.data, self.out, aliases_file=self.aliases)
        lines = [json.loads(l) for l in self.out.read_text(encoding="utf-8").splitlines()]
        return report, lines

    def test_merges_sources_and_counts_drops(self):
        off_fixture(self.data, [off_row("0041900091290", "Cottage Cheese"),
                                off_row("111111111", "Fromage", ("en:france",)), off_row("222222222", None)])
        branded_fixture(self.data, [(10, "041900091290", "United States", "")])
        sr_fixture(self.data)
        report, lines = self.run_build()
        self.assertEqual(report["final"], 2)
        self.assertEqual(report["merged"], 1)
        self.assertEqual(report["dropped"], {"not_us": 1, "no_name": 1})
        self.assertEqual(report["read"], 5)
        self.assertEqual(len({d["id"] for d in lines}), 2)
        generic = next(d for d in lines if d["kind"] == "generic")
        self.assertTrue(generic["aliases"])
        self.assertEqual(generic["portions"], [{"label": "1 cup (not packed)", "g": 226.0},
                                               {"label": "4 oz", "g": 113.0}, {"label": "100 g", "g": 100.0}])
        self.assertEqual(generic["category"], "dairy")
        branded = next(d for d in lines if d["kind"] == "branded")
        # USDA is newer than the Open Food Facts record, so it wins but keeps the scan count
        self.assertEqual((branded["source"], branded["popularity"], branded["updated"]), ("usda_branded", 14, "2025-02-02"))

    def test_drops_foreign_and_discontinued_usda_rows(self):
        branded_fixture(self.data, [(1, "111111111", "New Zealand", ""), (2, "222222222", "United States", "2024-01-01"),
                                    (3, "333333333", "United States", "")])
        report, lines = self.run_build()
        self.assertEqual(report["dropped"], {"not_us": 1, "discontinued": 1})
        self.assertEqual([d["id"] for d in lines], ["usdab_3"])

    def test_survey_nutrient_numbers_and_portions(self):
        survey_fixture(self.data)
        report, lines = self.run_build()
        self.assertEqual(lines[0]["n"], {"kcal": 61.0, "p": 3.2, "c": 4.8, "f": 3.3})
        self.assertEqual(lines[0]["portions"], [{"label": "1 cup", "g": 244.0}, {"label": "100 g", "g": 100.0}])
        self.assertEqual(report["by_source"], {"usda_fndds": 1})

    def test_adds_the_apps_other_names_to_sr_foods(self):
        sr_fixture(self.data)
        row = [1015, "Cheese, cottage, lowfat"] + [0] * 14 + ["curds, lowfat cottage cheese", []]
        self.aliases.write_text(json.dumps([row]), encoding="utf-8")
        _, lines = self.run_build()
        self.assertEqual(lines[0]["aliases"], ["cottage cheese", "curds", "lowfat cottage cheese"])

    def test_corrects_numbers_typed_in_per_serving_using_namesakes(self):
        wrong = off_row("0099999999999", "Cottage Cheese")
        wrong.update(serving_size="1 portion (247 g)", serving_quantity="247", nutrition_data_per="serving",
                     nutriments=[{"name": n, "100g": v} for n, v in
                                 [("energy-kcal", 247.0), ("proteins", 24.7), ("carbohydrates", 12.35), ("fat", 9.88)]])
        off_fixture(self.data, [wrong])
        branded_fixture(self.data, [(i, f"3333333333{i}", "United States", "") for i in range(10, 16)])
        report, lines = self.run_build()
        fixed = next(d for d in lines if d["source"] == "off")
        self.assertEqual((fixed["n"]["kcal"], fixed["n"]["p"], fixed["flagged"]), (100.0, 10.0, 0))
        self.assertEqual(report["corrected"], 1)

    def test_rebuilding_gives_the_same_file(self):
        branded_fixture(self.data, [(3, "333333333", "United States", ""), (4, "333333333", "United States", "")])
        _, first = self.run_build()
        _, second = self.run_build()
        self.assertEqual((first, len(first)), (second, 1))


if __name__ == "__main__":
    unittest.main()
