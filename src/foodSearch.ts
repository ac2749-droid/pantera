import { BUILTIN, DISH_START, Food } from './foods';
import { Hit, normalize, SearchDoc, SearchIndex } from './search';
import { UsdaFood, usdaFoods, usdaToFood } from './usda';

// What a search result points at: a ready Food, or a USDA record converted on demand.
export type ResultItem = { kind: 'food'; food: Food } | { kind: 'usda'; u: UsdaFood };
export type FoodHit = Hit<ResultItem>;

export const toFood = (item: ResultItem): Food => (item.kind === 'food' ? item.food : usdaToFood(item.u));

let usdaIndex: SearchIndex<ResultItem> | null = null;
let usdaById: Map<string, UsdaFood> | null = null;

/** The big USDA index is built once (a fraction of a second) and reused. */
export function getUsdaIndex(): SearchIndex<ResultItem> {
  if (!usdaIndex) {
    // Basic foods first: restaurant chains, fast food and packaged meals sit slightly lower
    const groupBoost: Record<number, number> = { 21: -0.8, 36: -0.8, 22: -0.2, 25: -0.2 };
    const docs: SearchDoc<ResultItem>[] = usdaFoods().map((u) => ({ key: u.id, name: u.name, alias: u.alias, boost: groupBoost[u.group] ?? 0, item: { kind: 'usda', u } }));
    usdaIndex = new SearchIndex(docs);
  }
  return usdaIndex;
}

/** Warm up the index in the background so the first search is instant. */
export function preloadSearch() {
  setTimeout(() => {
    try {
      getUsdaIndex();
    } catch {}
  }, 400);
}

/** Find the full food for an id stored on a diary entry (keeps portion choices for recents and edits). */
export function resolveFood(id: string | undefined, custom: Food[]): Food | undefined {
  if (!id) return undefined;
  if (id.startsWith('u')) {
    if (!usdaById) usdaById = new Map(usdaFoods().map((u) => [u.id, u]));
    const u = usdaById.get(id);
    return u ? usdaToFood(u) : undefined;
  }
  if (id.startsWith('b')) return BUILTIN.find((f) => f.id === id);
  return custom.find((f) => f.id === id);
}

export type Scope = 'all' | 'recent' | 'custom' | 'saved';

/** Small index over your foods, recents and the curated list; rebuilt when they change. */
export function buildPersonalIndex(custom: Food[], recent: Food[], scope: Scope, favorites: Food[] = []): SearchIndex<ResultItem> {
  const docs: SearchDoc<ResultItem>[] = [];
  const add = (f: Food, boost: number) => docs.push({ key: f.id, name: f.brand ? `${f.name} ${f.brand}` : f.name, boost, item: { kind: 'food', food: f } });
  // Favorites rank above everything; duplicates by name are removed in searchFoods
  if (scope === 'all' || scope === 'saved') favorites.forEach((f) => add(f, 4.5));
  if (scope === 'all' || scope === 'custom') custom.forEach((f) => add({ ...f, src: 'custom' }, 4));
  if (scope === 'all' || scope === 'recent') recent.forEach((f) => add(f, 3.2));
  if (scope === 'all') BUILTIN.forEach((f, i) => add(f, i >= DISH_START ? 2.6 : 3.5));
  return new SearchIndex(docs);
}

/** Search your foods and (for "all") the USDA database, merged and de-duplicated. */
export function searchFoods(query: string, personal: SearchIndex<ResultItem>, scope: Scope, limit = 60): FoodHit[] {
  const usda = scope === 'all' ? getUsdaIndex() : null;
  const known = usda ? (term: string) => personal.knows(term) || usda.knows(term) : undefined;
  const hits = personal.search(query, limit, known);
  if (usda) hits.push(...usda.search(query, limit, known));
  hits.sort((a, b) => b.score - a.score);
  // Hide weak spelling-only matches far below a strong match ("sushi" shouldn't list "Sunshine crackers")
  const floor = hits.length ? hits[0].score - 8 : 0;
  const seen = new Set<string>();
  const out: FoodHit[] = [];
  for (const h of hits) {
    const k = normalize(h.doc.name);
    if (seen.has(k) || h.score < floor) continue;
    seen.add(k);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}
