/** Small pieces of text shown on food rows and screens. */

import type { Food, NutrientKey } from '../foods';
import { isIndexFood } from './toFood';

const SOURCE_BADGES: Partial<Record<Food['src'], string>> = { custom: 'MINE', recent: 'RECENT', scan: 'SCANNED', online: 'ONLINE' };

/** A rounded amount, or a dash when the source doesn't list it. */
export function amount(value: number, key: NutrientKey, unknown?: NutrientKey[]): string {
  return unknown?.includes(key) ? '–' : String(Math.round(value));
}

export function rowBadge(food: Food): string | undefined {
  if (food.flagged) return 'CHECK';
  if (food.recipe) return 'RECIPE';
  if (food.src === 'custom' && food.barcode) return 'SCANNED';
  if (food.src === 'online' && isIndexFood(food)) return undefined;
  return SOURCE_BADGES[food.src];
}
