import { DEFAULT_REMINDERS, ReminderSettings, withDefaults } from './reminders';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Exercise } from './exercise';
import { resolveFood } from './foodSearch';
import previousNumbers from './data/previousNumbers.json';
import { correctedEntry, PreviousNumbers } from './foodRefresh';
import { copiedTime } from './mealTime';
import { BUILTIN, Entry, Food, MealKey, NutrientKey, Portion, scale } from './foods';
import type { Units } from './calc';
import { newId, r1, today } from './util';

export type Targets = { kcal: number; p: number; c: number; f: number };
export type CalcInputs = { sex: 'male' | 'female'; age: number; height: number; weight: number; activity: number; goal: number };
export type Profile = {
  targets: Targets;
  customFoods: Food[];
  sampleDismissed: boolean;
  calc: CalcInputs | null;
  usdaKey: string;
  geminiKey: string; // optional free Gemini key for the assistant's AI boost
  aiEnabled: boolean;
  aiProvider: 'gemini' | 'meta';
  reminders: ReminderSettings;
  coachLog?: { date: string; tdee: number; target: number }[]; // smart target check-ins applied
  coachSeen?: string;
  showFasting?: boolean; // show the fasting card on the Diary // week (Monday) the Diary check-in was last dismissed
  metaKey: string; // optional Meta Model API key (paid)
  photoNoticeFor?: ('gemini' | 'meta')[]; // providers whose photo notice you've accepted
  onboarded: boolean;
  units: Units;
  goalWeightKg: number | null;
  waterGoalMl: number;
  favorites: Food[];
  meals: SavedMeal[];
  dayTargets?: Partial<Record<string, Targets>>; // weekdays ("0" is Sunday) with their own targets
  netCarbs?: boolean; // show carbs with fiber taken out
  nutrientTargets?: Partial<Record<NutrientKey, number>>; // your own vitamin and mineral targets
  exerciseAddsCalories?: boolean;
  streakSeen?: number; // the last logging milestone celebrated
};
export type Days = Record<string, Entry[]>;
export type WeightEntry = { date: string; kg: number };
export type Fast = { start: number; end?: number; goalH: number };
export type Fasts = { current?: Fast; history: Fast[] };
/** A saved combination of foods ("My usual breakfast"), logged in one tap. */
export type SavedMeal = { id: string; name: string; items: Omit<Entry, 'id' | 'meal' | 't' | 'sample'>[] };

export const DEFAULT_TARGETS: Targets = { kcal: 2000, p: 150, c: 200, f: 67 };
const DEFAULT_PROFILE: Profile = {
  targets: DEFAULT_TARGETS, customFoods: [], sampleDismissed: false, calc: null, usdaKey: '', geminiKey: '', aiEnabled: true, aiProvider: 'gemini', metaKey: '', reminders: DEFAULT_REMINDERS,
  onboarded: false, units: 'us', goalWeightKg: null, waterGoalMl: 1893, favorites: [], meals: [],
};

const previous = previousNumbers as PreviousNumbers;

const K_PROFILE = 'pantera.profile';
const K_DAY = 'pantera.day.';
const K_WEIGHTS = 'pantera.weights';
const K_WATER = 'pantera.water';
const K_FASTS = 'pantera.fasts';
const K_EXERCISE = 'pantera.exercise';

type Store = {
  ready: boolean;
  days: Days;
  profile: Profile;
  showSample: boolean;
  entriesFor: (date: string) => Entry[];
  addEntry: (date: string, food: Food, grams: number, meal: MealKey, portion?: Portion) => string;
  updateEntry: (date: string, id: string, grams: number, meal: MealKey, portion?: Portion, at?: number) => void;
  removeEntry: (date: string, id: string) => void;
  copyMeal: (from: string, to: string, meal: MealKey) => number;
  copyDay: (from: string, to: string) => number;
  clearDay: (date: string) => void;
  dismissSample: () => void;
  saveFood: (food: Food) => void;
  /** Rewrites your saved and favorite foods. */
  updateSavedFoods: (fn: (food: Food) => Food) => void;
  deleteFood: (id: string) => void;
  setTargets: (t: Targets, calc?: CalcInputs | null) => void;
  setUsdaKey: (k: string) => void;
  setAi: (patch: Partial<Pick<Profile, 'geminiKey' | 'aiEnabled' | 'aiProvider' | 'metaKey'>>) => void;
  findByBarcode: (code: string) => Food | undefined;
  recentFoods: () => Food[];
  // profile & setup
  setProfile: (patch: Partial<Profile>) => void;
  completeSetup: (patch: Partial<Profile>, weightKg: number | null) => void;
  eraseAll: () => Promise<void>;
  // weight & water
  weights: WeightEntry[];
  logWeight: (date: string, kg: number) => void;
  removeWeight: (date: string) => void;
  water: Record<string, number>;
  addWater: (date: string, deltaMl: number) => void;
  // exercise
  exercise: Record<string, Exercise[]>;
  addExercise: (date: string, activity: Omit<Exercise, 'id' | 't'>) => void;
  removeExercise: (date: string, id: string) => void;
  // favorites & saved meals
  isFavorite: (food: Food) => boolean;
  toggleFavorite: (food: Food) => boolean;
  saveMeal: (name: string, entries: Entry[]) => void;
  deleteMeal: (id: string) => void;
  logSavedMeal: (date: string, mealId: string, meal: MealKey) => string[];
  addSavedMeal: (name: string, items: SavedMeal['items']) => string;
  logItems: (date: string, items: SavedMeal['items'], meal: MealKey, factor?: number) => string[];
  reload: () => Promise<void>;
  fasts: Fasts;
  startFast: (goalH: number, start?: number) => void;
  updateFast: (patch: Partial<Fast>) => void;
  endFast: (end?: number) => void;
  cancelFast: () => void;
  deleteFast: (start: number) => void;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
};

function makeSample(): Entry[] {
  const pick = (name: string, grams: number, meal: MealKey): Entry => {
    const f = BUILTIN.find((x) => x.name === name)!;
    return { id: 's' + newId(), name: f.name, serving: f.serving, sg: f.g, grams, meal, n: scale(f, grams), t: 0, sample: true };
  };
  return [
    pick('Rolled oats, dry', 40, 'breakfast'), pick('Blueberries', 74, 'breakfast'), pick('Greek yogurt, plain nonfat', 170, 'breakfast'), pick('Coffee, black', 237, 'breakfast'),
    pick('Chicken breast, cooked', 150, 'lunch'), pick('Brown rice, cooked', 195, 'lunch'), pick('Broccoli, raw', 91, 'lunch'),
    pick('Salmon, cooked', 140, 'dinner'), pick('Sweet potato, baked', 114, 'dinner'), pick('Mixed salad greens', 85, 'dinner'), pick('Olive oil', 13.5, 'dinner'),
    pick('Almonds', 28, 'snacks'), pick('Apple, medium', 182, 'snacks'),
  ];
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [days, setDays] = useState<Days>({});
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [sample] = useState<Entry[]>(makeSample);
  const [weights, setWeights] = useState<WeightEntry[]>([]);
  const [water, setWater] = useState<Record<string, number>>({});
  const [fasts, setFasts] = useState<Fasts>({ history: [] });
  const [exercise, setExercise] = useState<Record<string, Exercise[]>>({});
  const daysRef = useRef(days);
  useEffect(() => {
    daysRef.current = days;
  }, [days]);

  // Read everything from the phone's storage (on launch, and after a restore or cloud sync)
  const reload = useCallback(async () => {
    {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const wanted = keys.filter((k) => k === K_PROFILE || k === K_WEIGHTS || k === K_WATER || k === K_FASTS || k === K_EXERCISE || k.startsWith(K_DAY));
        const pairs = wanted.length ? await AsyncStorage.multiGet(wanted) : [];
        const d: Days = {};
        let p: Profile = DEFAULT_PROFILE;
        let hadProfile = false;
        let w: WeightEntry[] = [];
        let wa: Record<string, number> = {};
        let fa: Fasts = { history: [] };
        let ex: Record<string, Exercise[]> = {};
        pairs.forEach(([k, v]) => {
          if (!v) return;
          try {
            const val = JSON.parse(v);
            if (k === K_PROFILE) {
              hadProfile = true;
              p = { ...DEFAULT_PROFILE, ...val, targets: { ...DEFAULT_TARGETS, ...(val.targets || {}) }, reminders: withDefaults(val.reminders) };
              // People who used Pantera before the setup flow existed skip it
              if (val.onboarded === undefined) p.onboarded = true;
            } else if (k === K_WEIGHTS && Array.isArray(val)) w = val;
            else if (k === K_WATER && val && typeof val === 'object') wa = val;
            else if (k === K_FASTS && val && Array.isArray(val.history)) fa = val;
            else if (k === K_EXERCISE && val && typeof val === 'object') ex = val;
            else if (Array.isArray(val) && val.length) d[k.slice(K_DAY.length)] = val;
          } catch {}
        });
        if (!hadProfile && Object.keys(d).length) p = { ...p, onboarded: true };
        setDays(d);
        setProfile(p);
        setWeights(w);
        setWater(wa);
        setFasts(fa);
        setExercise(ex);
      } catch {}
      setReady(true);
    }
  }, []);
  useEffect(() => {
    Promise.resolve().then(reload);
  }, [reload]);

  const persistDay = useCallback((date: string, list: Entry[]) => {
    const key = K_DAY + date;
    (list.length ? AsyncStorage.setItem(key, JSON.stringify(list)) : AsyncStorage.removeItem(key)).catch(() => {});
  }, []);
  const writeDay = useCallback(
    (date: string, fn: (list: Entry[]) => Entry[]) => {
      setDays((prev) => {
        const next = fn(prev[date] ? [...prev[date]] : []);
        persistDay(date, next);
        const copy = { ...prev };
        if (next.length) copy[date] = next;
        else delete copy[date];
        return copy;
      });
    },
    [persistDay],
  );
  const writeProfile = useCallback((fn: (p: Profile) => Profile) => {
    setProfile((prev) => {
      const next = fn(prev);
      AsyncStorage.setItem(K_PROFILE, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const showSample = ready && !profile.sampleDismissed && Object.keys(days).length === 0;

  const dismissSample = useCallback(() => writeProfile((p) => (p.sampleDismissed ? p : { ...p, sampleDismissed: true })), [writeProfile]);

  const entriesFor = useCallback(
    (date: string) => (showSample && date === today() ? sample : days[date] || []),
    [days, showSample, sample],
  );

  const addEntry = useCallback(
    (date: string, food: Food, grams: number, meal: MealKey, portion?: Portion) => {
      dismissSample();
      const e: Entry = {
        id: newId(),
        name: food.brand && !food.name.toLowerCase().includes(food.brand.toLowerCase()) ? `${food.name} (${food.brand})` : food.name,
        serving: portion?.label ?? food.serving,
        sg: portion?.g ?? food.g,
        grams: r1(grams),
        meal,
        n: scale(food, grams),
        t: Date.now(),
        fid: food.id.startsWith('r:') ? undefined : food.id,
        ...(food.micros ? { mx: true } : {}),
      };
      writeDay(date, (l) => [...l, e]);
      return e.id;
    },
    [dismissSample, writeDay],
  );
  const updateEntry = useCallback(
    (date: string, id: string, grams: number, meal: MealKey, portion?: Portion, at?: number) =>
      writeDay(date, (l) =>
        l.map((e) => (e.id === id ? { ...e, grams: r1(grams), meal, n: scale({ g: e.grams || 1, n: e.n }, grams), serving: portion?.label ?? e.serving, sg: portion?.g ?? e.sg, ...(at !== undefined ? { at } : {}) } : e)),
      ),
    [writeDay],
  );
  const removeEntry = useCallback((date: string, id: string) => writeDay(date, (l) => l.filter((e) => e.id !== id)), [writeDay]);
  const fresh = useCallback(
    <T extends { fid?: string; grams: number; n: Entry['n'] }>(item: T): T => correctedEntry(item, profile.customFoods, previous) ?? item,
    [profile.customFoods],
  );
  const copyMeal = useCallback(
    (from: string, to: string, meal: MealKey) => {
      const src = (daysRef.current[from] || []).filter((e) => e.meal === meal);
      if (!src.length) return 0;
      dismissSample();
      writeDay(to, (l) => [...l, ...src.map((e) => ({ ...fresh(e), id: newId(), t: Date.now(), at: copiedTime(e, from) }))]);
      return src.length;
    },
    [dismissSample, writeDay, fresh],
  );

  /** Copy every entry from one day to another (sample entries excluded). */
  const copyDay = useCallback(
    (from: string, to: string) => {
      const src = (daysRef.current[from] || []).filter((e) => !e.sample);
      if (!src.length) return 0;
      dismissSample();
      const now = Date.now();
      writeDay(to, (l) => [...l, ...src.map((e, i) => ({ ...fresh(e), id: newId(), t: now + i, at: copiedTime(e, from) }))]);
      return src.length;
    },
    [dismissSample, writeDay, fresh],
  );
  const clearDay = useCallback((date: string) => writeDay(date, () => []), [writeDay]);

  const saveFood = useCallback(
    (food: Food) =>
      writeProfile((p) => {
        const clean: Food = { ...food, src: 'custom' };
        const i = p.customFoods.findIndex((x) => x.id === food.id);
        const list = [...p.customFoods];
        if (i >= 0) list[i] = clean;
        else list.unshift(clean);
        return { ...p, customFoods: list };
      }),
    [writeProfile],
  );
  const updateSavedFoods = useCallback(
    (fn: (food: Food) => Food) => writeProfile((p) => ({ ...p, customFoods: p.customFoods.map(fn), favorites: p.favorites.map(fn) })),
    [writeProfile],
  );
  const deleteFood = useCallback((id: string) => writeProfile((p) => ({ ...p, customFoods: p.customFoods.filter((f) => f.id !== id) })), [writeProfile]);
  const setTargets = useCallback((t: Targets, calc?: CalcInputs | null) => writeProfile((p) => ({ ...p, targets: t, calc: calc === undefined ? p.calc : calc })), [writeProfile]);
  const setUsdaKey = useCallback((k: string) => writeProfile((p) => ({ ...p, usdaKey: k })), [writeProfile]);
  const setAi = useCallback((patch: Partial<Pick<Profile, 'geminiKey' | 'aiEnabled' | 'aiProvider' | 'metaKey'>>) => writeProfile((p) => ({ ...p, ...patch })), [writeProfile]);
  const findByBarcode = useCallback(
    (code: string) => {
      const strip = (s: string) => s.replace(/^0+/, '');
      return profile.customFoods.find((f) => f.barcode && strip(f.barcode) === strip(code));
    },
    [profile.customFoods],
  );
  const recent = useMemo(() => {
    const seen = new Map<string, Food>();
    Object.keys(days)
      .sort()
      .reverse()
      .forEach((d) =>
        [...days[d]]
          .sort((a, b) => b.t - a.t)
          .forEach((e) => {
            if (seen.has(e.name) || seen.size >= 15) return;
            const full = resolveFood(e.fid, profile.customFoods);
            // An old entry whose numbers were since corrected mustn't stand in for the food
            if (!full && !correctedEntry(e, profile.customFoods, previous)) return;
            seen.set(
              e.name,
              full
                ? { ...full, name: e.name, brand: undefined, src: 'recent' }
                : { id: 'r:' + e.name, name: e.name, serving: e.serving, g: e.sg || e.grams, n: scale({ g: e.grams || 1, n: e.n }, e.sg || e.grams), src: 'recent' },
            );
          }),
      );
    return [...seen.values()];
  }, [days, profile.customFoods]);
  const recentFoods = useCallback(() => recent, [recent]);

  // ---- profile & setup ----
  const setProfilePatch = useCallback((patch: Partial<Profile>) => writeProfile((p) => ({ ...p, ...patch })), [writeProfile]);

  // ---- weight ----
  const writeWeights = useCallback((fn: (w: WeightEntry[]) => WeightEntry[]) => {
    setWeights((prev) => {
      const next = fn(prev).sort((a, b) => a.date.localeCompare(b.date));
      AsyncStorage.setItem(K_WEIGHTS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const logWeight = useCallback((date: string, kg: number) => writeWeights((w) => [...w.filter((x) => x.date !== date), { date, kg: Math.round(kg * 100) / 100 }]), [writeWeights]);
  const removeWeight = useCallback((date: string) => writeWeights((w) => w.filter((x) => x.date !== date)), [writeWeights]);
  const completeSetup = useCallback(
    (patch: Partial<Profile>, weightKg: number | null) => {
      writeProfile((p) => ({ ...p, ...patch, onboarded: true }));
      if (weightKg && weightKg > 0) logWeight(today(), weightKg);
    },
    [writeProfile, logWeight],
  );

  // ---- water ----
  const addWater = useCallback((date: string, deltaMl: number) => {
    setWater((prev) => {
      const next = { ...prev, [date]: Math.max(0, Math.round((prev[date] || 0) + deltaMl)) };
      if (!next[date]) delete next[date];
      AsyncStorage.setItem(K_WATER, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ---- exercise ----
  const writeExercise = useCallback((date: string, fn: (list: Exercise[]) => Exercise[]) => {
    setExercise((prev) => {
      const list = fn(prev[date] ?? []);
      const next = { ...prev, [date]: list };
      if (!list.length) delete next[date];
      AsyncStorage.setItem(K_EXERCISE, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const addExercise = useCallback(
    (date: string, activity: Omit<Exercise, 'id' | 't'>) => writeExercise(date, (l) => [...l, { ...activity, id: newId(), t: Date.now() }]),
    [writeExercise],
  );
  const removeExercise = useCallback((date: string, id: string) => writeExercise(date, (l) => l.filter((x) => x.id !== id)), [writeExercise]);

  // ---- favorites ----
  const favKey = (f: Food) => (f.fid ?? (f.id.startsWith('r:') ? 'n:' + f.name.toLowerCase() : f.id));
  const isFavorite = useCallback((food: Food) => profile.favorites.some((f) => favKey(f) === favKey(food) || f.name === food.name), [profile.favorites]);
  const toggleFavorite = useCallback(
    (food: Food) => {
      const on = !profile.favorites.some((f) => favKey(f) === favKey(food) || f.name === food.name);
      writeProfile((p) => ({
        ...p,
        favorites: on ? [{ ...food, src: food.src === 'online' ? 'custom' : food.src }, ...p.favorites] : p.favorites.filter((f) => favKey(f) !== favKey(food) && f.name !== food.name),
      }));
      return on;
    },
    [profile.favorites, writeProfile],
  );

  // ---- saved meals ----
  const saveMeal = useCallback(
    (name: string, entries: Entry[]) =>
      writeProfile((p) => ({
        ...p,
        meals: [{ id: newId(), name: name.trim() || 'My meal', items: entries.filter((e) => !e.sample).map(({ id: _id, meal: _m, t: _t, at: _at, sample: _s, ...rest }) => rest) }, ...p.meals],
      })),
    [writeProfile],
  );
  const deleteMeal = useCallback((id: string) => writeProfile((p) => ({ ...p, meals: p.meals.filter((m) => m.id !== id) })), [writeProfile]);
  const logItems = useCallback(
    (date: string, items: SavedMeal['items'], meal: MealKey, factor = 1) => {
      if (!items.length) return [];
      dismissSample();
      const now = Date.now();
      const f = factor > 0 ? factor : 1;
      const entries: Entry[] = items.map(fresh).map((it, i) => ({
        ...it,
        grams: Math.round(it.grams * f * 10) / 10,
        n: f === 1 ? it.n : scale({ g: 1, n: it.n }, f),
        id: newId(),
        meal,
        t: now + i,
      }));
      writeDay(date, (l) => [...l, ...entries]);
      return entries.map((e) => e.id);
    },
    [dismissSample, writeDay, fresh],
  );
  const logSavedMeal = useCallback(
    (date: string, mealId: string, meal: MealKey) => {
      const m = profile.meals.find((x) => x.id === mealId);
      return m ? logItems(date, m.items, meal) : [];
    },
    [profile.meals, logItems],
  );
  const addSavedMeal = useCallback(
    (name: string, items: SavedMeal['items']) => {
      const id = newId();
      writeProfile((p) => ({ ...p, meals: [{ id, name: name.trim() || 'Shared meal', items }, ...p.meals] }));
      return id;
    },
    [writeProfile],
  );

  // ---- fasting ----
  const writeFasts = useCallback((fn: (f: Fasts) => Fasts) => {
    setFasts((prev) => {
      const next = fn(prev);
      AsyncStorage.setItem(K_FASTS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const startFast = useCallback((goalH: number, start = Date.now()) => writeFasts((f) => ({ ...f, current: { start, goalH } })), [writeFasts]);
  const updateFast = useCallback((patch: Partial<Fast>) => writeFasts((f) => (f.current ? { ...f, current: { ...f.current, ...patch } } : f)), [writeFasts]);
  const endFast = useCallback(
    (end = Date.now()) => writeFasts((f) => (f.current ? { current: undefined, history: [{ ...f.current, end }, ...f.history].slice(0, 200) } : f)),
    [writeFasts],
  );
  const cancelFast = useCallback(() => writeFasts((f) => ({ ...f, current: undefined })), [writeFasts]);
  const deleteFast = useCallback((start: number) => writeFasts((f) => ({ ...f, history: f.history.filter((x) => x.start !== start) })), [writeFasts]);

  const eraseAll = useCallback(async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('pantera.'));
    if (keys.length) await AsyncStorage.multiRemove(keys);
    setDays({});
    setWeights([]);
    setWater({});
    setFasts({ history: [] });
    setExercise({});
    setProfile(DEFAULT_PROFILE);
  }, []);

  const value = useMemo<Store>(
    () => ({
      ready, days, profile, showSample, entriesFor, addEntry, updateEntry, removeEntry, copyMeal, copyDay, clearDay, dismissSample, saveFood, updateSavedFoods, deleteFood, setTargets, setUsdaKey, setAi, findByBarcode, recentFoods,
      setProfile: setProfilePatch, completeSetup, eraseAll, weights, logWeight, removeWeight, water, addWater, isFavorite, toggleFavorite, saveMeal, deleteMeal, logSavedMeal, addSavedMeal, logItems, reload, fasts, startFast, updateFast, endFast, cancelFast, deleteFast,
      exercise, addExercise, removeExercise,
    }),
    [
      ready, days, profile, showSample, entriesFor, addEntry, updateEntry, removeEntry, copyMeal, copyDay, clearDay, dismissSample, saveFood, updateSavedFoods, deleteFood, setTargets, setUsdaKey, setAi, findByBarcode, recentFoods,
      setProfilePatch, completeSetup, eraseAll, weights, logWeight, removeWeight, water, addWater, isFavorite, toggleFavorite, saveMeal, deleteMeal, logSavedMeal, addSavedMeal, logItems, reload, fasts, startFast, updateFast, endFast, cancelFast, deleteFast,
      exercise, addExercise, removeExercise,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
