import { Entry, MealKey } from '../foods';
import { r0 } from '../util';

export function defaultMeal(): MealKey {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  return h < 10.5 ? 'breakfast' : h < 15 ? 'lunch' : h < 21 ? 'dinner' : 'snacks';
}

export function amountLabel(e: Pick<Entry, 'grams' | 'sg' | 'serving'>) {
  if (e.serving === 'quick add') return 'Quick add';
  if (/^\d+(\.\d+)? ?g$/.test(e.serving)) return `${r0(e.grams)} g`;
  const servings = e.grams / (e.sg || 1);
  const q = Math.round(servings * 4) / 4;
  if (Math.abs(servings - q) < 0.01 && q > 0) {
    // "0.5 cup (113 g)" already says its weight; several of them need the total
    if (/\d ?g\)$/.test(e.serving)) return q === 1 ? e.serving : `${q} × ${e.serving} · ${r0(e.grams)} g`;
    return `${q === 1 ? '' : q + ' × '}${e.serving} (${r0(e.grams)} g)`;
  }
  return `${r0(e.grams)} g`;
}
