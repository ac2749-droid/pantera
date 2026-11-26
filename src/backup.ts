/**
 * Backups: everything Pantera stores, as one JSON "snapshot".
 * Used for backup files (save to Drive / Files, restore on any phone) and for cloud sync.
 * API keys are never included, so a backup file is safe to keep in the cloud.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Entry } from './foods';

export type Snapshot = { app: 'pantera'; v: 1; at: string; data: Record<string, unknown> };

const PREFIX = 'pantera.';
// Stored on the phone but never part of a backup: cloud login and sync bookkeeping
const LOCAL_ONLY = new Set(['pantera.cloud', 'pantera.sync']);
const SECRETS = ['geminiKey', 'metaKey', 'usdaKey'] as const;
const VALID_KEY = /^pantera\.(profile|weights|water|fasts|exercise|day\.\d{4}-\d{2}-\d{2})$/;

/** Read everything into a snapshot (without API keys). */
export async function readSnapshot(): Promise<Snapshot> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX) && !LOCAL_ONLY.has(k) && VALID_KEY.test(k));
  const pairs = keys.length ? await AsyncStorage.multiGet(keys) : [];
  const data: Record<string, unknown> = {};
  for (const [k, v] of pairs) {
    if (!v) continue;
    try {
      data[k] = JSON.parse(v);
    } catch {}
  }
  const profile = data['pantera.profile'] as Record<string, unknown> | undefined;
  if (profile) {
    const clean = { ...profile };
    SECRETS.forEach((s) => delete clean[s]);
    data['pantera.profile'] = clean;
  }
  return { app: 'pantera', v: 1, at: new Date().toISOString(), data };
}

/** Check that something is a Pantera snapshot we can safely load. */
export function asSnapshot(x: unknown): Snapshot | null {
  const s = x as Snapshot;
  if (!s || typeof s !== 'object' || s.app !== 'pantera' || !s.data || typeof s.data !== 'object') return null;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s.data)) {
    if (!VALID_KEY.test(k)) continue;
    if (k.startsWith('pantera.day.') && !Array.isArray(v)) continue;
    if (k === 'pantera.weights' && !Array.isArray(v)) continue;
    if ((k === 'pantera.profile' || k === 'pantera.water' || k === 'pantera.fasts' || k === 'pantera.exercise') && (typeof v !== 'object' || v === null || Array.isArray(v))) continue;
    if (k === 'pantera.exercise') {
      data[k] = Object.fromEntries(Object.entries(v as object).filter(([, list]) => Array.isArray(list)));
      continue;
    }
    data[k] = v;
  }
  return { app: 'pantera', v: 1, at: typeof s.at === 'string' ? s.at : new Date(0).toISOString(), data };
}

/** Replace everything on this phone with a snapshot. Keeps this phone's API keys and cloud login. Call store.reload() after. */
export async function writeSnapshot(snap: Snapshot): Promise<void> {
  const current = await AsyncStorage.getItem('pantera.profile');
  let secrets: Record<string, unknown> = {};
  try {
    const p = current ? JSON.parse(current) : {};
    secrets = Object.fromEntries(SECRETS.filter((k) => p[k]).map((k) => [k, p[k]]));
  } catch {}
  // Data from an app too old to know about exercise says nothing about it, so this phone's workouts stay
  const unknown = new Set(snap.data['pantera.exercise'] === undefined ? ['pantera.exercise'] : []);
  const old = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX) && !LOCAL_ONLY.has(k) && !unknown.has(k));
  const pairs: [string, string][] = Object.entries(snap.data).map(([k, v]) => [k, JSON.stringify(k === 'pantera.profile' ? { ...(v as object), ...secrets, onboarded: true } : v)]);
  if (old.length) await AsyncStorage.multiRemove(old);
  if (pairs.length) await AsyncStorage.multiSet(pairs);
}

export type SnapshotSummary = { days: number; entries: number; foods: number; meals: number; weights: number; workouts: number; first?: string; last?: string };
type ExerciseDays = Record<string, { id: string }[]>;

export function summarize(snap: Snapshot): SnapshotSummary {
  const dayKeys = Object.keys(snap.data).filter((k) => k.startsWith('pantera.day.')).sort();
  const entries = dayKeys.reduce((a, k) => a + ((snap.data[k] as unknown[]) ?? []).length, 0);
  const p = (snap.data['pantera.profile'] ?? {}) as { customFoods?: unknown[]; meals?: unknown[] };
  const w = snap.data['pantera.weights'];
  return {
    days: dayKeys.length,
    entries,
    foods: Array.isArray(p.customFoods) ? p.customFoods.length : 0,
    meals: Array.isArray(p.meals) ? p.meals.length : 0,
    weights: Array.isArray(w) ? w.length : 0,
    workouts: Object.values((snap.data['pantera.exercise'] ?? {}) as ExerciseDays).reduce((a, list) => a + list.length, 0),
    first: dayKeys[0]?.slice(12),
    last: dayKeys[dayKeys.length - 1]?.slice(12),
  };
}

const byId = <T extends { id?: string; name?: string }>(a: T[] = [], b: T[] = []) => {
  const seen = new Map<string, T>();
  [...a, ...b].forEach((x) => {
    const k = x.id ?? x.name ?? JSON.stringify(x);
    if (!seen.has(k)) seen.set(k, x);
  });
  return [...seen.values()];
};

/**
 * Combine two snapshots without losing anything: diary entries, foods, meals, favorites and weigh-ins
 * from both. For settings (targets, units…) the newer snapshot wins.
 */
export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  const [older, newer] = a.at <= b.at ? [a, b] : [b, a];
  const data: Record<string, unknown> = { ...older.data, ...newer.data };
  for (const k of new Set([...Object.keys(a.data), ...Object.keys(b.data)])) {
    if (k.startsWith('pantera.day.')) {
      const list = byId(older.data[k] as Entry[] | undefined, newer.data[k] as Entry[] | undefined);
      data[k] = list.sort((x, y) => (x.t ?? 0) - (y.t ?? 0));
    }
  }
  const wa = (older.data['pantera.weights'] ?? []) as { date: string; kg: number }[];
  const wb = (newer.data['pantera.weights'] ?? []) as { date: string; kg: number }[];
  const wm = new Map<string, { date: string; kg: number }>();
  [...wa, ...wb].forEach((w) => wm.set(w.date, w)); // newer wins for the same day
  if (wm.size) data['pantera.weights'] = [...wm.values()].sort((x, y) => (x.date < y.date ? -1 : 1));
  const water: Record<string, number> = { ...((older.data['pantera.water'] ?? {}) as Record<string, number>) };
  Object.entries((newer.data['pantera.water'] ?? {}) as Record<string, number>).forEach(([d, ml]) => (water[d] = Math.max(water[d] ?? 0, ml)));
  if (Object.keys(water).length) data['pantera.water'] = water;
  // Fasting history from both; the newer snapshot's running fast wins
  const fo = (older.data['pantera.fasts'] ?? { history: [] }) as { current?: unknown; history: { start: number }[] };
  const fn = (newer.data['pantera.fasts'] ?? { history: [] }) as { current?: unknown; history: { start: number }[] };
  if (older.data['pantera.fasts'] || newer.data['pantera.fasts']) {
    const hist = new Map<number, { start: number }>();
    [...(fo.history ?? []), ...(fn.history ?? [])].forEach((h) => hist.set(h.start, h));
    data['pantera.fasts'] = { current: fn.current ?? fo.current, history: [...hist.values()].sort((a, b) => b.start - a.start) };
  }
  // Workouts from both
  const xo = (older.data['pantera.exercise'] ?? {}) as ExerciseDays;
  const xn = (newer.data['pantera.exercise'] ?? {}) as ExerciseDays;
  if (older.data['pantera.exercise'] || newer.data['pantera.exercise']) {
    data['pantera.exercise'] = Object.fromEntries([...new Set([...Object.keys(xo), ...Object.keys(xn)])].map((d) => [d, byId(xo[d], xn[d])]));
  }
  const po = (older.data['pantera.profile'] ?? {}) as Record<string, unknown[]>;
  const pn = (newer.data['pantera.profile'] ?? {}) as Record<string, unknown[]>;
  if (older.data['pantera.profile'] || newer.data['pantera.profile']) {
    data['pantera.profile'] = {
      ...po,
      ...pn,
      customFoods: byId(pn.customFoods as { id: string }[], po.customFoods as { id: string }[]),
      meals: byId(pn.meals as { id: string }[], po.meals as { id: string }[]),
      favorites: byId(pn.favorites as { id: string }[], po.favorites as { id: string }[]),
    };
  }
  return { app: 'pantera', v: 1, at: newer.at, data };
}

/** True when a snapshot has no real user data (a fresh install). */
export const isEmptySnapshot = (s: Snapshot) => {
  const sum = summarize(s);
  return sum.entries === 0 && sum.foods === 0 && sum.meals === 0 && sum.weights === 0 && sum.workouts === 0;
};
