/**
 * Saved copies of database foods keep the numbers they were saved with. When a release corrects a food,
 * a copy is recognised by still having exactly the old numbers, so anything you changed yourself stays.
 */

import { Food, Nutrients, scale } from './foods';
import { INDEX_PREFIX } from './foodIndex/toFood';

/** Database id → the per-100 g [calories, protein, carbs, fat] it had in earlier releases. */
export type PreviousNumbers = Record<string, number[][]>;

const KEYS = ['kcal', 'p', 'c', 'f'] as const;

/** Which database entry a saved food came from. */
function origin(food: { id?: string; source?: string; barcode?: string }): string | null {
  if (food.id?.startsWith(INDEX_PREFIX)) return food.id.slice(INDEX_PREFIX.length);
  // Saved from an online barcode scan
  if (food.source === 'Open Food Facts' && food.barcode) return `off_${food.barcode.replace(/^0+/, '')}`;
  return null;
}

function hasOldNumbers(n: Nutrients, grams: number, key: string | null, previous: PreviousNumbers): boolean {
  return !!key && !!previous[key]?.some((old) =>
    // the slack covers rounding only
    KEYS.every((k, i) => Math.abs(n[k] - (old[i] * grams) / 100) <= 0.01 + (0.0051 * grams) / 100 + 0.0006 * old[i]));
}

/** The saved foods that still carry numbers a release has since changed. */
export function outdatedFoods(foods: Food[], previous: PreviousNumbers): Food[] {
  return foods.filter((f) => hasOldNumbers(f.n, f.g, origin(f), previous));
}

/** The saved food with the database's present numbers, or null when there is nothing to change. */
export function refreshedFood(saved: Food, current: Food, previous: PreviousNumbers): Food | null {
  if (!hasOldNumbers(saved.n, saved.g, origin(saved), previous)) return null;
  const n = scale(current, saved.g);
  const same = KEYS.every((k) => Math.abs(n[k] - saved.n[k]) <= 0.05);
  if (same && !!current.flagged === !!saved.flagged) return null;
  const { flagged: _was, unknown: _unlisted, ...kept } = saved;
  return {
    ...kept, n, source: current.source, micros: current.micros,
    ...(current.unknown ? { unknown: current.unknown } : {}),
    ...(current.flagged ? { flagged: true } : {}),
  };
}

/**
 * A diary or saved-meal item about to be logged again: unchanged when its numbers are fine, worked out
 * from your corrected food when they are old ones, null when they are old and there is no such food.
 */
export function correctedEntry<T extends { fid?: string; grams: number; n: Nutrients }>(item: T, customFoods: Food[], previous: PreviousNumbers): T | null {
  const food = item.fid ? customFoods.find((f) => f.id === item.fid) : undefined;
  const key = origin(food ?? { id: item.fid });
  if (!hasOldNumbers(item.n, item.grams, key, previous)) return item;
  if (!food || hasOldNumbers(food.n, food.g, key, previous)) return null;
  return { ...item, n: scale(food, item.grams) };
}
