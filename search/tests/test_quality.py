import unittest

from search.quality import References
from search.records import FoodDoc

MILK = dict(kcal=50, p=3.33, c=5, f=2.08, ca=125)


def doc(name="2% Reduced Fat Milk", brand="Acme", source="off", grams=240.0, per_serving=False, flagged=0, ident="x", **n):
    return FoodDoc(id=ident, name=name, brand=brand, kind="branded", barcode=ident,
                   portions=[{"label": "1 serving", "g": grams}, {"label": "100 g", "g": 100.0}],
                   n=n or dict(MILK), source=source, flagged=flagged, per_serving=per_serving)


def refs(n=6, name="Reduced Fat 2% Milk", **values):
    return References.of(doc(name=name, brand=f"Dairy {i}", source="usda_branded", ident=str(i), **(values or MILK))
                         for i in range(n))


class Quality(unittest.TestCase):
    def test_a_cup_typed_in_as_100_g_is_put_right(self):
        wrong = doc(brand="Kirkland Signature", grams=247.0, per_serving=True, kcal=120, p=8, c=12, f=5, ca=300)
        fixed = refs().check(wrong)
        self.assertEqual(fixed.flagged, 0)
        self.assertAlmostEqual(fixed.n["kcal"] * 0.95, 46.2, delta=0.3)   # 95 g
        self.assertAlmostEqual(fixed.n["p"] * 0.95, 3.08, delta=0.05)
        self.assertAlmostEqual(fixed.n["ca"], 121.46, places=1)           # every nutrient moves together
        self.assertEqual(wrong.n["kcal"], 120)                            # the input is not changed

    def test_only_the_certain_mistake_is_rewritten(self):
        # a 355 g can of a light soda looks like its namesakes once multiplied up, but nothing proves it
        soda = refs(name="Cherry Vanilla", kcal=40, p=0, c=10, f=0)
        light = doc("Cherry Vanilla", grams=355.0, per_serving=True, kcal=11.3, p=0, c=2.8, f=0)
        self.assertEqual(soda.check(light).n, light.n)
        fruit = refs(name="Dried Cranberries", kcal=325, p=0, c=80, f=1)
        dense = fruit.check(doc("Dried Cranberries", grams=40.0, per_serving=True, kcal=812, p=0, c=200, f=2.5))
        self.assertEqual((dense.n["kcal"], dense.flagged), (812, 1))

    def test_far_from_other_foods_of_the_same_name_is_marked_but_not_changed(self):
        odd = refs().check(doc(kcal=210, p=3, c=40, f=4))
        self.assertEqual((odd.n["kcal"], odd.flagged), (210, 1))

    def test_a_label_not_entered_per_serving_is_never_rescaled(self):
        odd = refs().check(doc(grams=247.0, per_serving=False, kcal=120, p=8, c=12, f=5))
        self.assertEqual((odd.n["kcal"], odd.flagged), (120, 1))

    def test_ordinary_variation_is_left_alone(self):
        fine = doc(per_serving=True, kcal=58, p=3.4, c=6.2, f=2.1)
        self.assertEqual(refs().check(fine), fine)

    def test_too_few_or_too_different_namesakes_decide_nothing(self):
        wrong = doc(grams=247.0, per_serving=True, kcal=120, p=8, c=12, f=5)
        self.assertEqual(refs(n=4).check(wrong), wrong)
        mixed = References.of([doc(source="usda_branded", ident=str(i), kcal=k, p=3, c=5, f=2)
                               for i, k in enumerate((40, 45, 50, 150, 200, 220))])
        self.assertEqual(mixed.check(wrong), wrong)
        self.assertEqual(refs(name="Milk").check(doc("Milk", kcal=400, p=3, c=5, f=40)).flagged, 0)  # one word is too vague

    def test_usda_foods_are_not_second_guessed(self):
        usda = doc(source="usda_branded", kcal=210, p=3, c=40, f=4)
        self.assertEqual(refs().check(usda), usda)

    def test_brand_words_in_the_name_do_not_matter(self):
        wrong = doc("Kirkland 2% Reduced Fat Milk", brand="Kirkland", grams=247.0, per_serving=True, kcal=120, p=8, c=12, f=5)
        self.assertAlmostEqual(refs().check(wrong).n["kcal"], 48.58, places=1)


if __name__ == "__main__":
    unittest.main()
