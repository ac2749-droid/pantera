/** Turns a food from the search server into the shape the rest of the app uses. */

import { emptyNutrients, EXTRA_NK, Food, NK, NutrientKey } from '../foods';
import type { IndexDoc } from './client';

/** Prefix that keeps server foods apart from built-in ("b"), USDA ("u") and recent ("r:") ids. */
export const INDEX_PREFIX = 'x:';

/** Main nutrients that are shown as unknown, rather than zero, when the source doesn't list them. */
const SHOWN: NutrientKey[] = ['p', 'c', 'f', 'fib', 'sug', 'sat', 'na'];

export function isIndexFood(food: { id: string }): boolean {
  return food.id.startsWith(INDEX_PREFIX);
}

export function toFood(doc: IndexDoc): Food {
  const serving = doc.portions[0] ?? { label: '100 g', g: 100 };
  const n = emptyNutrients();
  NK.forEach((k) => (n[k] = Math.round((((doc.n[k] || 0) * serving.g) / 100) * 100) / 100));
  const unknown = SHOWN.filter((k) => doc.n[k] === undefined);
  const listed = EXTRA_NK.filter((k) => doc.n[k] !== undefined).length;
  return {
    id: INDEX_PREFIX + doc.id,
    name: doc.name.slice(0, 120),
    brand: doc.brand || undefined,
    serving: serving.label,
    g: serving.g,
    n,
    src: 'online',
    barcode: doc.barcode || undefined,
    source: doc.source === 'off' ? 'Open Food Facts' : 'USDA FoodData Central',
    portions: doc.portions.length ? doc.portions : [serving],
    // Vitamins and minerals count as known only when the source lists most of them
    micros: listed >= 12,
    ...(unknown.length ? { unknown } : {}),
    ...(doc.flagged ? { flagged: true } : {}),
  };
}
