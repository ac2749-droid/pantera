import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import previousNumbers from '../data/previousNumbers.json';
import { findByBarcode } from '../foodIndex/client';
import { loadFoodIndex } from '../foodIndex/source';
import { toFood } from '../foodIndex/toFood';
import { Food } from '../foods';
import { outdatedFoods, PreviousNumbers, refreshedFood } from '../foodRefresh';
import { useNav } from '../nav';
import { useStore } from '../store';

const previous = previousNumbers as PreviousNumbers;

/** After an update that corrected foods, gives your saved copies of them the new numbers. */
export function FoodRefresh() {
  const { ready, profile, updateSavedFoods } = useStore();
  const nav = useNav();
  const say = useRef(nav.toast);
  useEffect(() => {
    say.current = nav.toast;
  }, [nav]);
  // Each saved food is looked up once; restoring a backup brings new ones to check
  const looked = useRef(new Set<Food>());

  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const stale = outdatedFoods([...profile.customFoods, ...profile.favorites], previous).filter((f) => !looked.current.has(f));
    if (!stale.length) return;
    (async () => {
      const index = await loadFoodIndex();
      if (!index) return; // tried again the next time the app opens
      const fixes = new Map<string, Food>();
      const names = new Set<string>();
      for (const food of stale) {
        looked.current.add(food);
        const doc = food.barcode ? await findByBarcode(index, food.barcode) : null;
        if (!doc) continue;
        const current = toFood(doc);
        if (refreshedFood(food, current, previous)) {
          fixes.set(food.id, current);
          names.add(food.name);
        }
      }
      if (!fixes.size) return;
      updateSavedFoods((f) => {
        const current = fixes.get(f.id);
        return (current && refreshedFood(f, current, previous)) || f;
      });
      say.current(names.size === 1 ? `Updated the numbers for ${[...names][0]}` : `Updated the numbers for ${names.size} saved foods`);
    })().catch((e) => console.warn('Saved foods not updated', e));
  }, [ready, profile.customFoods, profile.favorites, updateSavedFoods]);

  return null;
}
