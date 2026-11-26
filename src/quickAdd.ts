/** One-tap logging: how much of a food to add, and what has been added so far. */

import { Entry, Food, Portion, scale } from './foods';
import { today as todayDate } from './util';

export type QuickAmount = {
  grams: number;
  portion: Portion;
  usual: boolean; // true when this is the amount logged last time
  kcal: number;
};

/** The amount you had last time, or one serving the first time. */
export function quickAmount(days: Record<string, Entry[]>, food: Food, today = todayDate()): QuickAmount {
  const matches = (e: Entry) => (food.id.startsWith('r:') ? e.name === food.name : e.fid === food.id);
  let last: Entry | undefined;
  for (const date of Object.keys(days).sort().reverse()) {
    if (date > today) continue; // planned, not eaten yet
    for (const e of days[date]) {
      if (!e.sample && e.grams > 0 && matches(e) && (!last || e.t > last.t)) last = e;
    }
    if (last) break;
  }
  const grams = last?.grams ?? food.g;
  const portion = last ? { label: last.serving, g: last.sg || last.grams } : { label: food.serving, g: food.g };
  return { grams, portion, usual: !!last, kcal: scale(food, grams).kcal };
}

export function addedSummary(added: { kcal: number }[]): string | null {
  if (!added.length) return null;
  const kcal = added.reduce((total, a) => total + a.kcal, 0);
  return `${added.length} added · ${Math.round(kcal)} kcal`;
}

/** Doubtful numbers deserve a look before they are logged. */
export function canQuickAdd(food: Food): boolean {
  return !food.flagged && food.g > 0;
}
