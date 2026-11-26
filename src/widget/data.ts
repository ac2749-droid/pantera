/** What the home-screen widget shows, read straight from storage (works when the app is closed). */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { burnedOn, Exercise } from '../exercise';
import type { Entry } from '../foods';
import type { Profile } from '../store';
import { carbsShown, dayBudget } from '../targets';
import { ymd } from '../util';

export type WidgetData = {
  kcal: number;
  target: number;
  p: number; c: number; f: number;
  tp: number; tc: number; tf: number;
  waterMl: number;
  waterGoalMl: number;
  glassMl: number;
  fast?: { start: number; goalH: number };
  now: number; // when this was built (for the fasting clock)
};

export function buildWidgetData(o: {
  entries: Entry[];
  targets: { kcal: number; p: number; c: number; f: number };
  waterMl: number;
  waterGoalMl: number;
  units: 'us' | 'metric';
  fast?: { start: number; goalH: number };
  netCarbs?: boolean;
}): WidgetData {
  const list = o.entries.filter((e) => !e.sample);
  const s = (k: 'kcal' | 'p' | 'c' | 'f' | 'fib') => list.reduce((a, e) => a + (e.n[k] || 0), 0);
  return {
    kcal: s('kcal'), target: o.targets.kcal, p: s('p'), c: carbsShown({ c: s('c'), fib: s('fib') }, o.netCarbs), f: s('f'), tp: o.targets.p, tc: o.targets.c, tf: o.targets.f,
    waterMl: o.waterMl, waterGoalMl: o.waterGoalMl, glassMl: o.units === 'us' ? 236.6 : 250, fast: o.fast, now: Date.now(),
  };
}

export async function loadWidgetData(): Promise<WidgetData> {
  const d = ymd(new Date());
  const [[, day], [, prof], [, water], [, fasts], [, workouts]] = await AsyncStorage.multiGet([`pantera.day.${d}`, 'pantera.profile', 'pantera.water', 'pantera.fasts', 'pantera.exercise']);
  const parse = <T,>(s: string | null, fallback: T): T => {
    try {
      return s ? (JSON.parse(s) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const p = parse<Partial<Profile>>(prof, {});
  const usual = p.targets ?? { kcal: 2000, p: 150, c: 200, f: 67 };
  const burned = burnedOn(parse<Record<string, Exercise[]>>(workouts, {})[d]);
  return buildWidgetData({
    entries: parse<Entry[]>(day, []),
    targets: dayBudget({ ...p, targets: usual }, d, burned),
    netCarbs: p.netCarbs,
    waterMl: parse<Record<string, number>>(water, {})[d] ?? 0,
    waterGoalMl: p.waterGoalMl ?? 1893,
    units: p.units ?? 'us',
    fast: parse<{ current?: { start: number; goalH: number } }>(fasts, {}).current,
  });
}
