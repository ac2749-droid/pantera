import { ResultItem } from '../foodSearch';
import { MealKey } from '../foods';
import { SearchIndex } from '../search';
import { AiFailure, aiParse, AiProvider } from './ai';
import { parseMeal } from './parse';
import { MealItem, resolveItem } from './resolve';

export type { MealItem } from './resolve';
export { swapFood, amountFor } from './resolve';

export type MealReading = {
  items: MealItem[];
  meal: MealKey | null;
  dayOffset: number;
  source: 'ai' | 'reader';
  aiProblem?: AiFailure; // AI was tried but couldn't be used
};

/** Read a meal description: with the AI boost when a key is set, otherwise (or on failure) with the built-in reader. */
export async function readMeal(text: string, personal: SearchIndex<ResultItem>, ai: { key: string; enabled: boolean; provider?: AiProvider }): Promise<MealReading> {
  let aiProblem: AiFailure | undefined;
  if (ai.enabled && ai.key.trim()) {
    const r = await aiParse(text, ai.key, ai.provider);
    if (r.ok && r.meal.items.length) {
      const items = r.meal.items.map((it, i) => resolveItem(it, personal, r.grams[i] ?? undefined));
      return { items, meal: r.meal.meal, dayOffset: r.meal.dayOffset, source: 'ai' };
    }
    if (!r.ok) aiProblem = r.reason;
  }
  const p = parseMeal(text);
  return { items: p.items.map((it) => resolveItem(it, personal)), meal: p.meal, dayOffset: p.dayOffset, source: 'reader', aiProblem };
}
