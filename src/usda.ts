import { CORE_NK, emptyNutrients, EXTRA_NK, Food, NK, Nutrients, Portion } from './foods';

// Row layout written by scripts/build-usda.py (values per 100 g):
// [id, name, group, kcal, p, c, f, fib, sug, sat, na, k, ca, fe, vc, portions, alias, extras[]]
type Row = [number, string, number, number, number, number, number, number, number, number, number, number, number, number, number, string, string, number[]?];

export type UsdaFood = {
  id: string;
  name: string;
  group: number;
  alias: string;
  per100: Nutrients;
  portions: Portion[];
};

let cache: UsdaFood[] | null = null;

/** Parsed USDA foods. The data is loaded on first use (~8k foods). */
export function usdaFoods(): UsdaFood[] {
  if (cache) return cache;
  const rows = require('./data/usda.json') as Row[];
  cache = rows.map((r) => {
    const per100 = emptyNutrients();
    CORE_NK.forEach((k, i) => (per100[k] = (r[3 + i] as number) || 0));
    const x = r[17] ?? [];
    EXTRA_NK.forEach((k, i) => (per100[k] = x[i] || 0));
    const portions: Portion[] = r[15]
      ? r[15].split(';').map((p) => {
          const [g, label] = p.split('|');
          return { g: parseFloat(g), label };
        })
      : [];
    return { id: 'u' + r[0], name: r[1], group: r[2], alias: r[16] || '', per100, portions };
  });
  return cache;
}

/** Turn a USDA record into a loggable Food (nutrients per default portion). */
export function usdaToFood(u: UsdaFood): Food {
  const portions: Portion[] = [...u.portions, { label: '100 g', g: 100 }];
  const def = portions[0];
  const n = emptyNutrients();
  NK.forEach((k) => (n[k] = Math.round(((u.per100[k] * def.g) / 100) * 100) / 100));
  return { id: u.id, name: u.name, serving: def.label, g: def.g, n, src: 'usda', source: 'USDA', portions, micros: true };
}

// SR28 food group codes, used for ranking and labels
export const GROUPS: Record<number, string> = {
  1: 'Dairy & eggs', 2: 'Spices & herbs', 4: 'Fats & oils', 5: 'Poultry', 6: 'Soups & sauces', 7: 'Sausages & deli',
  8: 'Cereals', 9: 'Fruits', 10: 'Pork', 11: 'Vegetables', 12: 'Nuts & seeds', 13: 'Beef', 14: 'Beverages',
  15: 'Fish & seafood', 16: 'Legumes', 17: 'Lamb, veal & game', 18: 'Baked goods', 19: 'Sweets', 20: 'Grains & pasta',
  21: 'Fast food', 22: 'Meals & entrees', 25: 'Snacks', 36: 'Restaurant foods',
};
