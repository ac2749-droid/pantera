/** Orders results from the online databases: the brand you typed first, then the closest names. */

import { namesBrand, queryWords } from './foodIndex/client';
import type { Food } from './foods';

export function orderOnline(query: string, foods: Food[]): Food[] {
  const words = queryWords(query);
  if (!words.length) return foods;
  const score = (food: Food) => {
    const text = queryWords(`${food.name} ${food.brand ?? ''}`);
    const found = words.filter((w) => text.some((t) => t.startsWith(w))).length;
    return (namesBrand(words, food.brand ?? null) ? 100 : 0) + found;
  };
  return foods.map((food) => ({ food, score: score(food) })).sort((a, b) => b.score - a.score).map((x) => x.food);
}
