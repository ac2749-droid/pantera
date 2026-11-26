/** What you're aiming for on a given day. */

import { rescaleMacros } from './coach';
import type { NutrientKey } from './foods';
import type { Profile, Targets } from './store';
import { parseYmd } from './util';

/** Weekdays as stored (0 is Sunday), listed Monday first as people read them. */
export const WEEKDAYS: [string, string][] = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];

export const weekdayKey = (date: string) => String(parseYmd(date).getDay());

export function targetsFor(profile: Pick<Profile, 'targets' | 'dayTargets'>, date: string): Targets {
  return profile.dayTargets?.[weekdayKey(date)] ?? profile.targets;
}

/** The day's targets, with exercise calories added when you've chosen that. */
export function dayBudget(profile: Pick<Profile, 'targets' | 'dayTargets' | 'exerciseAddsCalories'>, date: string, burned: number): Targets {
  const t = targetsFor(profile, date);
  return profile.exerciseAddsCalories && burned > 0 ? { ...t, kcal: t.kcal + Math.round(burned) } : t;
}

/** When the usual calorie target changes, special days move by the same amount. */
export function shiftDayTargets(days: Profile['dayTargets'], from: number, to: number): Profile['dayTargets'] {
  if (!days) return days;
  return Object.fromEntries(Object.entries(days).map(([k, t]) => [k, t ? rescaleMacros(t, Math.max(0, t.kcal + to - from)) : t]));
}

export function carbsShown(n: { c: number; fib: number }, net: boolean | undefined): number {
  return net ? Math.max(0, n.c - (n.fib || 0)) : n.c;
}

/** Your target for a nutrient if you set one, otherwise the daily value. */
export function dailyValue(profile: Pick<Profile, 'nutrientTargets'>, k: NutrientKey, standard: number): number {
  const own = profile.nutrientTargets?.[k];
  return own && own > 0 ? own : standard;
}
