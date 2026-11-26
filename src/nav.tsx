import { router } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { Food, MealKey, NutrientKey, Portion } from './foods';
import { draftFromFood, emptyDraft, RecipeDraft } from './recipe';
import { useTheme } from './theme';
import { Txt } from './ui';
import { today } from './util';

// Payloads for the modal screens. Food objects are passed through context
// rather than URL params so nothing gets lost in serialization.
export type Sheet =
  | { type: 'add'; meal: MealKey; pick?: boolean }
  | { type: 'detail'; food: Food; mode: 'add' | 'edit' | 'pick'; pickIndex?: number; meal: MealKey; grams?: number; portion?: Portion; entryId?: string; sample?: boolean; fromScan?: boolean }
  | { type: 'form'; food?: Food; prefill?: Partial<Food>; returnMeal?: MealKey; pick?: boolean; fromLabel?: LabelInfo }
  | { type: 'label'; food?: Food; prefill?: Partial<Food>; returnMeal?: MealKey; pick?: boolean }
  | { type: 'scan'; meal: MealKey; pick?: boolean }
  | { type: 'assistant'; meal?: MealKey; voice?: boolean }
  | { type: 'photo'; meal?: MealKey }
  | { type: 'saveMeal'; date: string; meal: MealKey }
  | { type: 'shareMeal'; mealId?: string; recipeId?: string }
  | { type: 'importMeal'; code?: string }
  | { type: 'quick'; meal: MealKey }
  | { type: 'fasting' }
  | { type: 'nutrient'; k: NutrientKey };

/** What the label scanner could and couldn't read, shown on the food form. */
export type LabelInfo = { found: NutrientKey[]; estimated: NutrientKey[]; note?: string; source: 'ai' | 'phone'; servingFound: boolean };

type SheetOf<T extends Sheet['type']> = Extract<Sheet, { type: T }>;
const ROUTES = { add: '/add', detail: '/detail', form: '/food-form', scan: '/scan', assistant: '/assistant', photo: '/photo-meal', saveMeal: '/save-meal', shareMeal: '/share-meal', importMeal: '/import-meal', label: '/label-scan', quick: '/quick-add', fasting: '/fasting', nutrient: '/nutrient' } as const;

type Nav = {
  date: string;
  setDate: (d: string) => void;
  payload: <T extends Sheet['type']>(type: T) => SheetOf<T> | undefined;
  go: (s: Sheet, opts?: { replace?: boolean }) => void;
  done: () => void;
  toast: (msg: string) => void;
  // The recipe being edited; ingredient pickers add to it and come back
  recipe: RecipeDraft;
  setRecipe: (fn: (d: RecipeDraft) => RecipeDraft) => void;
  openRecipe: (food?: Food) => void;
  backToRecipe: () => void;
};

const Ctx = createContext<Nav | null>(null);
export const useNav = () => {
  const n = useContext(Ctx);
  if (!n) throw new Error('useNav outside provider');
  return n;
};

export function NavProvider({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const [date, setDate] = useState(today());
  const [sheets, setSheets] = useState<Partial<Record<Sheet['type'], Sheet>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [recipe, setRecipeState] = useState<RecipeDraft>(emptyDraft);
  const setRecipe = useCallback((fn: (d: RecipeDraft) => RecipeDraft) => setRecipeState(fn), []);
  const openRecipe = useCallback((food?: Food) => {
    setRecipeState(food?.recipe ? draftFromFood(food) : emptyDraft());
    router.push('/recipe');
  }, []);
  const backToRecipe = useCallback(() => router.dismissTo('/recipe'), []);
  const [opacity] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback(
    (m: string) => {
      setMsg(m);
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setMsg(null));
      }, 2000);
    },
    [opacity],
  );
  const go = useCallback((s: Sheet, opts?: { replace?: boolean }) => {
    setSheets((prev) => ({ ...prev, [s.type]: s }));
    if (opts?.replace) router.replace(ROUTES[s.type]);
    else router.push(ROUTES[s.type]);
  }, []);
  const done = useCallback(() => {
    if (router.canDismiss()) router.dismissAll();
    else if (router.canGoBack()) router.back();
    else router.replace('/'); // opened straight from the widget or a link
  }, []);
  const payload = useCallback(<T extends Sheet['type']>(type: T) => sheets[type] as SheetOf<T> | undefined, [sheets]);
  const value = useMemo(() => ({ date, setDate, payload, go, done, toast, recipe, setRecipe, openRecipe, backToRecipe }), [date, payload, go, done, toast, recipe, setRecipe, openRecipe, backToRecipe]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {msg ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, bottom: 120, alignItems: 'center', opacity }}>
          <View style={{ backgroundColor: t.surface2, borderColor: t.accent, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 }}>
            <Txt weight="bodyBold" size={14}>
              {msg}
            </Txt>
          </View>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
}
