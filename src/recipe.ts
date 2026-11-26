/** Turning a recipe's ingredients into one food you can log by serving or by weight. */
import { Food, Portion, Recipe, RecipeItem, scale, sum } from './foods';
import { newId } from './util';

export type RecipeDraft = { id?: string; name: string; servings: number; cookedG?: number; items: RecipeItem[] };

const r1 = (x: number) => Math.round(x * 10) / 10;

export function recipeTotals(d: Pick<RecipeDraft, 'items' | 'servings' | 'cookedG'>) {
  const total = sum(d.items);
  const rawG = d.items.reduce((a, x) => a + (x.grams || 0), 0);
  const totalG = d.cookedG && d.cookedG > 0 ? d.cookedG : rawG;
  const servings = d.servings > 0 ? d.servings : 1;
  const perG = totalG / servings;
  const perServing = scale({ g: totalG || 1, n: total }, perG);
  return { total, rawG, totalG, servings, perG, perServing };
}

/** The food saved to My foods for a recipe. Logging "1 serving" or "250 g" both work from it. */
export function recipeFood(d: RecipeDraft): Food {
  const { totalG, servings, perG, perServing } = recipeTotals(d);
  const portions: Portion[] = [{ label: '1 serving', g: r1(perG) }];
  if (servings !== 1) portions.push({ label: 'whole recipe', g: r1(totalG) });
  const recipe: Recipe = { items: d.items, servings, ...(d.cookedG && d.cookedG > 0 ? { cookedG: d.cookedG } : {}) };
  // Vitamins and minerals are known only if every ingredient has them
  const micros = d.items.length > 0 && d.items.every((x) => x.mx);
  return { id: d.id ?? 'c' + newId(), name: d.name.trim() || 'My recipe', serving: '1 serving', g: r1(perG), n: perServing, src: 'custom', portions, recipe, source: 'Recipe', micros };
}

export const draftFromFood = (f: Food): RecipeDraft => ({ id: f.id, name: f.name, servings: f.recipe?.servings ?? 1, cookedG: f.recipe?.cookedG, items: f.recipe?.items ?? [] });
export const emptyDraft = (): RecipeDraft => ({ name: '', servings: 4, items: [] });
