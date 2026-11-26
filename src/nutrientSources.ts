/** Where a nutrient came from, and which everyday foods would add more of it. */

import { BUILTIN, DISH_START, Entry, EXTRA_NK, Food, NutrientInfo, NutrientKey, nutrientInfo } from './foods';

export type Source = { name: string; amount: number; share: number; times: number };

const ENOUGH = 0.1; // a suggestion gives at least a tenth of the daily value
const HEAVIEST = 500; // kcal
const LIGHTEST = 40; // so near-zero foods don't win on calories alone

// The macros are tracked against your own targets, so the nutrient list doesn't carry them
const MACROS: Partial<Record<NutrientKey, NutrientInfo>> = {
  p: { k: 'p', label: 'Protein', unit: 'g', dv: 50, kind: 'goal', group: 'general' },
  c: { k: 'c', label: 'Carbs', unit: 'g', dv: 275, kind: 'info', group: 'general' },
  f: { k: 'f', label: 'Fat', unit: 'g', dv: 78, kind: 'info', group: 'general' },
};

/** Name, unit, daily value and whether to aim for or stay under it, for any nutrient shown in the app. */
export const describeNutrient = (k: NutrientKey): NutrientInfo | undefined => MACROS[k] ?? nutrientInfo(k);

const TREATS = /^(Cheeseburger|Pizza|French fries|Potato chips|Bacon|Mayonnaise|Ketchup|Honey)/;
/** The everyday ingredients worth suggesting: no restaurant dishes, drinks or treats. */
export const SUGGESTABLE = BUILTIN.slice(0, DISH_START).filter((f) => !TREATS.test(f.name));

/** The foods that supplied a nutrient, biggest first. */
export function topSources(entries: Pick<Entry, 'name' | 'n'>[], k: NutrientKey, limit = 8): Source[] {
  const byName = new Map<string, { amount: number; times: number }>();
  let total = 0;
  for (const e of entries) {
    const amount = e.n[k] || 0;
    if (amount <= 0) continue;
    total += amount;
    const so = byName.get(e.name) ?? { amount: 0, times: 0 };
    byName.set(e.name, { amount: so.amount + amount, times: so.times + 1 });
  }
  return [...byName]
    .map(([name, v]) => ({ name, amount: v.amount, share: v.amount / total, times: v.times }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/** Foods with a good amount in one serving for the calories they cost. Empty for nutrients to keep low. */
export function foodsRichIn(k: NutrientKey, foods: Food[], limit = 8): Food[] {
  const info = describeNutrient(k);
  if (!info || info.kind !== 'goal' || !info.dv) return [];
  const needsListed = (EXTRA_NK as readonly string[]).includes(k);
  const score = (f: Food) => Math.min(f.n[k] / info.dv, 1) / Math.sqrt(Math.max(f.n.kcal, LIGHTEST));
  return foods
    .filter((f) => (!needsListed || f.micros) && f.n[k] >= info.dv * ENOUGH && f.n.kcal <= HEAVIEST)
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit);
}
