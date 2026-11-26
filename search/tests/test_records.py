import json
import unittest
from dataclasses import asdict

from search.records import is_flagged, natural_alias, normalize_barcode, off_to_doc, usda_to_doc


def nut(name, value):
    return {"name": name, "100g": value}


def off_row(**over):
    row = {"code": "0041900091290", "product_name": [{"lang": "main", "text": "Cottage Cheese"}],
           "brands": "The Honest Cow, Other", "countries_tags": ["en:united-states"],
           "categories_tags": ["en:dairies", "en:cheeses"], "serving_size": "0.5 cup (113 g)",
           "serving_quantity": "113", "unique_scans_n": 14, "last_modified_t": 1750000000, "obsolete": False,
           "nutriments": [nut("energy-kcal", 106.19), nut("proteins", 13.27),
                          nut("carbohydrates", 4.42), nut("fat", 4.42), nut("sodium", 0.4)]}
    return {**row, **over}


def usda_food(**over):
    food = {"fdc_id": 123, "data_type": "branded_food", "description": "GREEK YOGURT, PLAIN",
            "brand_name": "CHOBANI", "brand_owner": "Chobani, LLC", "gtin_upc": "00894700010137",
            "serving_size": 170, "serving_size_unit": "g", "household_serving_fulltext": "1 container",
            "category": "Yogurt", "date": "2025-03-01"}
    return {**food, **over}


class Records(unittest.TestCase):
    def test_barcode(self):
        for raw in ["0041900091290", "041900091290", " 41900091290 ", "0 41900-09129 0"]:
            self.assertEqual(normalize_barcode(raw), "41900091290")
        for raw in [None, "", "abc", "000000"]:
            self.assertIsNone(normalize_barcode(raw))

    def test_flag(self):
        self.assertEqual(is_flagged({"kcal": 106.2, "p": 13.3, "c": 4.4, "f": 4.4}), 0)
        self.assertEqual(is_flagged({"kcal": 900, "p": 13, "c": 4, "f": 4}), 1)
        self.assertEqual(is_flagged({"kcal": 240, "p": 10, "c": 70, "f": 2, "fib": 40}), 0)   # fiber
        self.assertEqual(is_flagged({"kcal": 231, "p": 0, "c": 0, "f": 0, "alc": 33}), 0)    # alcohol
        self.assertEqual(is_flagged({"kcal": 100, "p": -1, "c": 20, "f": 1}), 1)
        self.assertEqual(is_flagged({"kcal": 400, "p": 60, "c": 50, "f": 0}), 1)             # over 105 g

    def test_flag_with_missing_macros_only_checks_ranges(self):
        self.assertEqual(is_flagged({"kcal": 500}), 0)
        self.assertEqual(is_flagged({"kcal": 950}), 1)

    def test_flags_impossible_parts_and_sodium(self):
        base = {"kcal": 96, "p": 5, "c": 10, "f": 4}
        self.assertEqual(is_flagged({**base, "na": 69062}), 1)       # more sodium than salt holds
        self.assertEqual(is_flagged({**base, "sug": 20}), 1)         # more sugar than carbohydrate
        self.assertEqual(is_flagged({**base, "sat": 9}), 1)          # more saturated fat than fat
        self.assertEqual(is_flagged({**base, "fib": 20}), 1)         # more fiber than carbohydrate
        self.assertEqual(is_flagged({**base, "sug": 10.5, "sat": 4.5}), 0)   # label rounding
        self.assertEqual(is_flagged({"kcal": 0, "p": 0, "c": 0, "f": 0, "na": 39300}), 0)    # table salt
        self.assertEqual(is_flagged({"kcal": 100, "na": 50000}), 1)  # even without macros

    def test_serving_grams_agree_with_the_label(self):
        def serving(label, quantity):
            return off_to_doc(off_row(serving_size=label, serving_quantity=quantity))[0].portions[0]

        # the number printed on the package wins over a contradicting quantity field
        self.assertEqual(serving("1 PACKET, MAKES 16.9 fl oz. (5 g)", "507"), {"label": "1 PACKET, MAKES 16.9 fl oz. (5 g)", "g": 5.0})
        self.assertEqual(serving("1 cup (21 g)", "180")["g"], 21.0)
        self.assertEqual(serving("28,5 g", "280")["g"], 28.5)
        self.assertEqual(serving("1 bar (40g)", "40.2")["g"], 40.2)  # close enough: keep the exact field
        self.assertEqual(serving("1 cup (240 ml)", "240")["g"], 240.0)
        self.assertEqual(serving("1 tablet (500 mg)", "2")["g"], 2.0)
        self.assertEqual(serving("2 bars (80 g) or 1 bar (40 g)", "500"), {"label": "100 g", "g": 100.0})
        usda = usda_to_doc(usda_food(household_serving_fulltext="1 packet (5 g)", serving_size=507), {1008: 10}, [])[0]
        self.assertEqual(usda.portions[0]["g"], 5.0)

    def test_alias(self):
        self.assertEqual(natural_alias("Cheese, cottage, lowfat"), "cottage cheese")
        self.assertIsNone(natural_alias("Hummus"))

    def test_off_row(self):
        doc, why = off_to_doc(off_row())
        self.assertIsNone(why)
        self.assertEqual((doc.id, doc.brand, doc.kind), ("off_41900091290", "The Honest Cow", "branded"))
        self.assertEqual(doc.portions[0], {"label": "0.5 cup (113 g)", "g": 113.0})
        self.assertIn({"label": "100 g", "g": 100.0}, doc.portions)
        self.assertAlmostEqual(doc.n["na"], 400)          # grams -> mg
        self.assertNotIn("fe", doc.n)
        self.assertEqual((doc.category, doc.popularity, doc.flagged, doc.kind_rank), ("dairy", 14, 0, 1))
        self.assertEqual((doc.source, doc.updated), ("off", "2025-06-15"))

    def test_off_remembers_numbers_entered_per_serving(self):
        self.assertTrue(off_to_doc(off_row(nutrition_data_per="serving"))[0].per_serving)
        self.assertFalse(off_to_doc(off_row(nutrition_data_per="100g"))[0].per_serving)
        self.assertFalse(off_to_doc(off_row())[0].per_serving)

    def test_off_name_prefers_english(self):
        names = [{"lang": "it", "text": "Fiocchi"}, {"lang": "en", "text": "Cottage Cheese"}]
        self.assertEqual(off_to_doc(off_row(product_name=names))[0].name, "Cottage Cheese")

    def test_off_salt_becomes_sodium(self):
        doc = off_to_doc(off_row(nutriments=[nut("energy-kcal", 100), nut("salt", 1.0)]))[0]
        self.assertAlmostEqual(doc.n["na"], 400)

    def test_off_category_ignores_umbrella_tags(self):
        tags = ["en:plant-based-foods-and-beverages", "en:plant-based-foods", "en:breads"]
        self.assertEqual(off_to_doc(off_row(categories_tags=tags))[0].category, "bakery_grains")

    def test_off_dirty(self):
        self.assertEqual(off_to_doc(off_row(countries_tags=["en:france"]))[1], "not_us")
        self.assertEqual(off_to_doc(off_row(countries_tags=None))[1], "not_us")
        self.assertEqual(off_to_doc(off_row(obsolete=True))[1], "obsolete")
        self.assertEqual(off_to_doc(off_row(product_name=[]))[1], "no_name")
        self.assertEqual(off_to_doc(off_row(nutriments=[]))[1], "no_calories")
        self.assertEqual(off_to_doc(off_row(nutriments=None))[1], "no_calories")
        self.assertEqual(off_to_doc(off_row(nutriments=[nut("energy-kcal", float("nan"))]))[1], "no_calories")
        self.assertEqual(off_to_doc(off_row(code=""))[1], "no_code")
        kj = off_to_doc(off_row(nutriments=[nut("energy-kj", 418.4)]))[0]
        self.assertAlmostEqual(kj.n["kcal"], 100)
        for bad_serving in ["abc", "-5", "99999", None]:
            bad = off_to_doc(off_row(serving_size="1 serving", serving_quantity=bad_serving))[0]
            self.assertEqual(bad.portions, [{"label": "100 g", "g": 100.0}])
        neg = off_to_doc(off_row(nutriments=[nut("energy-kcal", 100), nut("proteins", -3)]))[0]
        self.assertNotIn("p", neg.n)
        self.assertEqual(neg.flagged, 1)
        self.assertIsNone(off_to_doc(off_row(brands=" , "))[0].brand)

    def test_off_alcohol_is_converted_for_the_flag_and_not_stored(self):
        rows = [nut("energy-kcal", 231), nut("proteins", 0), nut("carbohydrates", 0), nut("fat", 0),
                nut("alcohol", 40)]
        doc = off_to_doc(off_row(nutriments=rows))[0]
        self.assertEqual(doc.flagged, 0)
        self.assertNotIn("alc", doc.n)

    def test_apostrophes_can_be_left_out(self):
        # The search server splits "Ellie's" into "ellie" and "s", but people type "ellies"
        off = off_to_doc(off_row(brands="Ellie’s", product_name=[{"lang": "en", "text": "Caramel Puffs"}]))[0]
        self.assertEqual(off.aliases, ["ellies caramel puffs"])
        usda = usda_to_doc(usda_food(brand_name="JOIE'S", description="HUMMUS"), {1008: 1}, [])[0]
        self.assertEqual(usda.aliases, ["joies hummus"])
        generic = usda_food(data_type="sr_legacy_food", description="Candies, Hershey's Kisses")
        self.assertEqual(usda_to_doc(generic, {1008: 1}, [])[0].aliases,
                         ["hershey's kisses candies", "candies hersheys kisses"])
        self.assertEqual(off_to_doc(off_row())[0].aliases, [])

    def test_usda_branded(self):
        doc, why = usda_to_doc(usda_food(), {1008: 59, 1003: 10, 1005: 3.6, 1004: 0.4, 1093: 36}, [])
        self.assertIsNone(why)
        self.assertEqual((doc.id, doc.source, doc.kind), ("usdab_123", "usda_branded", "branded"))
        self.assertEqual((doc.name, doc.brand), ("Greek Yogurt, Plain", "Chobani"))
        self.assertEqual(doc.barcode, "894700010137")
        self.assertEqual(doc.portions[0], {"label": "1 container", "g": 170.0})
        self.assertEqual((doc.n["kcal"], doc.n["na"], doc.updated, doc.category), (59, 36, "2025-03-01", "dairy"))
        self.assertNotIn("fib", doc.n)

    def test_usda_generic(self):
        food = usda_food(fdc_id=9, data_type="sr_legacy_food", description="Cheese, cottage, lowfat",
                         brand_name=None, brand_owner=None, gtin_upc=None, serving_size=None,
                         category="Dairy and Egg Products", date="2019-04-01")
        doc = usda_to_doc(food, {1008: 72, 1003: 12}, [{"label": "1 cup", "g": 226}])[0]
        self.assertEqual((doc.id, doc.source, doc.kind, doc.kind_rank), ("usdasr_9", "usda_sr", "generic", 0))
        self.assertEqual((doc.name, doc.brand, doc.barcode), ("Cheese, cottage, lowfat", None, None))
        self.assertEqual(doc.aliases, ["cottage cheese"])
        self.assertEqual(doc.portions, [{"label": "1 cup", "g": 226.0}, {"label": "100 g", "g": 100.0}])
        fndds = usda_to_doc({**food, "data_type": "survey_fndds_food"}, {1008: 72}, [])[0]
        self.assertEqual((fndds.id, fndds.source), ("usdafn_9", "usda_fndds"))
        json.dumps(asdict(doc))

    def test_usda_dirty(self):
        self.assertEqual(usda_to_doc(usda_food(description="  "), {1008: 1}, [])[1], "no_name")
        self.assertEqual(usda_to_doc(usda_food(), {}, [])[1], "no_calories")
        doc = usda_to_doc(usda_food(serving_size="abc", gtin_upc="n/a"), {1008: 10}, [])[0]
        self.assertEqual(doc.portions, [{"label": "100 g", "g": 100.0}])
        self.assertIsNone(doc.barcode)


if __name__ == "__main__":
    unittest.main()
