/**
 * The one module that talks to the food search server. It has no runtime imports, so the app and the
 * evaluation harness in search/eval run exactly the same query logic.
 */

export type IndexDoc = {
  id: string;
  name: string;
  brand: string | null;
  kind: 'generic' | 'branded';
  barcode: string | null;
  portions: { label: string; g: number }[];
  n: Record<string, number>;
  source: string;
  popularity: number;
  flagged: 0 | 1;
  updated: string;
  category: string;
};

/** `corrected` holds the query actually searched when a spelling mistake was fixed. */
export type SearchResult = { best: IndexDoc[]; close: IndexDoc[]; corrected?: string };

/** One query, in the shape the search server takes. */
export type EngineQuery = { indexUid: string; q: string; limit: number; filter?: string; matchingStrategy?: string; sort?: string[] };

/** A search that runs on the phone instead of a server (see localEngine.ts). */
export type Engine = {
  search(query: EngineQuery): Promise<IndexDoc[]>;
  byBarcode(barcode: string): Promise<IndexDoc | null>;
};

export type ServerConfig = { url: string; key: string; timeoutMs?: number; fetchImpl?: typeof fetch; engine?: undefined };
export type ClientConfig = ServerConfig | { engine: Engine; timeoutMs?: number };

type Reason = 'network' | 'timeout' | 'auth' | 'server';

export class FoodIndexError extends Error {
  reason: Reason;
  constructor(reason: Reason, detail?: string) {
    super(detail ? `Food search failed (${reason}): ${detail}` : `Food search failed (${reason})`);
    this.name = 'FoodIndexError';
    this.reason = reason;
  }
}

const INDEX = 'foods';
const MAX_WORDS = 10; // Meilisearch ignores anything after the tenth word
const MAX_GENERIC = 3;
const GENERIC_POOL = 40; // how many generic matches are re-ranked to find the plainest ones
// USDA puts these groups before the food itself: "Fish, salmon", "Nuts, almonds", "Cheese, cottage"
const FOOD_GROUPS = new Set(['beverage', 'cereal', 'cheese', 'crustacean', 'fish', 'mollusk', 'nut', 'seed', 'spice']);
const MIN_BRANDED = 3; // brands still show on a plain search that has many generic matches
const BRAND_FILLER = new Set(['the', 'a', 'an', 'and', 'of', 'co', 'inc', 'llc']);
const WORDS = 'words';
const CORRECTABLE = /^\p{L}{3,}$/u; // numbers and very short words are left alone
const LOOKUP_LIMIT = 100;
const PER_WORD = 5;
const MAX_CORRECTIONS = 20;
// A word in the data this many times rarer than a near neighbour is most likely a misspelling itself
const FAR_MORE_COMMON = 50;
// On the phone, doubt a word that did find something only if it is this much rarer, long enough, and found little
const OBVIOUS_TYPO = 500;
const OBVIOUS_TYPO_LETTERS = 5;
const FIXED_FIRST = 3;
const TIMEOUT_MS = 4000;

export function queryWords(q: string): string[] {
  return q
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, MAX_WORDS);
}

/** Shorter versions of a query, grouped by length (longest first); within a group, right-most window first. */
export function relaxations(words: string[]): string[][][] {
  const groups: string[][][] = [];
  for (let size = words.length - 1; size >= 1; size--) {
    const group: string[][] = [];
    for (let start = words.length - size; start >= 0; start--) group.push(words.slice(start, start + size));
    groups.push(group);
  }
  return groups;
}

export function namesBrand(words: string[], brand: string | null): boolean {
  const meaningful = queryWords(brand || '').filter((w) => !BRAND_FILLER.has(w));
  return meaningful.length > 0 && meaningful.every((w) => words.includes(w));
}

/** Enough of a singular form to match "tomatoes" with "tomato" and "berries" with "berry". */
const singular = (word: string) => word.replace(/ies$/, 'y').replace(/oes$/, 'o').replace(/s$/, '');

/** The words naming the food itself: "spinach" in "Spinach, raw", "salmon" in "Fish, salmon, raw". */
function foodWords(name: string): string[] {
  const parts = name.split(',').map((part) => queryWords(part).map(singular));
  return parts.length > 1 && parts[0].length === 1 && FOOD_GROUPS.has(parts[0][0]) ? parts[1] : parts[0];
}

/** Restaurant and packaged items among the generic foods are written in capitals: "HORMEL ...", "McDONALD'S". */
const isBrandedEntry = (name: string) => /[A-Z]{4,}/.test(name.replace(/USDA/g, ''));

/**
 * Generic foods, best first: the food itself before dishes that contain it, then its plain or raw form,
 * then the shortest name. Equal foods keep the server's order.
 */
export function rankGeneric(words: string[], docs: IndexDoc[]): IndexDoc[] {
  const asked = new Set(words.map(singular));
  const score = (doc: IndexDoc) => {
    const food = foodWords(doc.name);
    const parts = queryWords(doc.name.replace(/,/g, ' , '));
    return [
      isBrandedEntry(doc.name) ? 1 : 0,
      food.length && food.every((w) => asked.has(w)) ? 0 : 1,
      parts.includes('raw') || parts.includes('nfs') ? 0 : 1,
      doc.name.split(/\s+/).length,
    ];
  };
  return docs
    .map((doc) => ({ doc, key: score(doc) }))
    .sort((a, b) => a.key.map((v, i) => v - b.key[i]).find((diff) => diff !== 0) ?? 0)
    .map((entry) => entry.doc);
}

/** A brand like "Oatmeal" is also what a plain food is called, so typing it does not mean the brand. */
function isFoodName(brand: string, generic: IndexDoc[]): boolean {
  const name = queryWords(brand).map(singular).join(' ');
  return generic.some((doc) => !isBrandedEntry(doc.name) && foodWords(doc.name).join(' ') === name);
}

/** A search that names a brand keeps the server's order; a plain search shows generic foods, then brands. */
export function orderBest(words: string[], all: IndexDoc[], generic: IndexDoc[], branded: IndexDoc[], limit: number): IndexDoc[] {
  const brandAsked = all.slice(0, 5).some((doc) => namesBrand(words, doc.brand) && !isFoodName(doc.brand ?? '', generic));
  if (brandAsked) return all.slice(0, limit);
  const ordered = new Map<string, IndexDoc>();
  const plain = rankGeneric(words, generic).slice(0, MAX_GENERIC);
  for (const doc of [...plain, ...branded.slice(0, MIN_BRANDED), ...all]) ordered.set(doc.id, doc);
  return [...ordered.values()].slice(0, limit);
}

/** Digits only, without leading zeros: the form barcodes have in the index. */
export function normalizeBarcode(code: string): string | null {
  if (/[^\d\s-]/.test(code)) return null;
  const digits = code.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length >= 6 && digits.length <= 14 ? digits : null;
}

/** A word and each way of deleting one of its letters (must match search/vocabulary.py). */
export function spellingKeys(word: string): string[] {
  const letters = [...word];
  return [...new Set([word, ...letters.map((_, i) => letters.filter((__, j) => j !== i).join(''))])];
}

/** Exactly one wrong, missing, extra or swapped letter. */
export function oneMistakeApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let start = 0;
  while (start < a.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const x = a.slice(start, a.length - end);
  const y = b.slice(start, b.length - end);
  if (x.length <= 1 && y.length <= 1) return true;
  return x.length === 2 && y.length === 2 && x[0] === y[1] && x[1] === y[0];
}

function abortError(): Error {
  const e = new Error('Search aborted');
  e.name = 'AbortError';
  return e;
}

async function post(cfg: ServerConfig, path: string, body: unknown, signal?: AbortSignal): Promise<any> {
  if (signal?.aborted) throw abortError();
  const send = cfg.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  // Settles even if the fetch implementation ignores the abort signal.
  const stopped = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new FoodIndexError('timeout'));
      ctrl.abort();
    }, cfg.timeoutMs ?? TIMEOUT_MS);
    onAbort = () => {
      reject(abortError());
      ctrl.abort();
    };
    signal?.addEventListener('abort', onAbort);
  });
  const work = async () => {
    let res: Response;
    try {
      res = await send(cfg.url.replace(/\/+$/, '') + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new FoodIndexError('network', e instanceof Error ? e.message : undefined);
    }
    if (res.status === 401 || res.status === 403) throw new FoodIndexError('auth');
    if (!res.ok) throw new FoodIndexError('server', `HTTP ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new FoodIndexError('server', 'unreadable response');
    }
  };
  try {
    return await Promise.race([work(), stopped]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

async function multiSearch(cfg: ClientConfig, queries: EngineQuery[], signal?: AbortSignal): Promise<IndexDoc[][]> {
  if (cfg.engine) {
    const results: IndexDoc[][] = [];
    for (const query of queries) {
      // Checked between queries, so typing on stops work that is no longer wanted
      if (signal?.aborted) throw abortError();
      results.push(await cfg.engine.search(query));
    }
    if (signal?.aborted) throw abortError();
    return results;
  }
  const data = await post(cfg, '/multi-search', { queries }, signal);
  if (!Array.isArray(data?.results) || data.results.length !== queries.length) {
    throw new FoodIndexError('server', 'unexpected response');
  }
  return data.results.map((r: { hits?: IndexDoc[] }) => r.hits ?? []);
}

/** Matches for every word, ordered for display. */
async function bestMatches(cfg: ClientConfig, words: string[], q: string, limit: number, signal?: AbortSignal): Promise<IndexDoc[]> {
  const base = { indexUid: INDEX, q, limit, matchingStrategy: 'all' };
  const [all, generic, branded] = await multiSearch(cfg, [
    base,
    { ...base, limit: GENERIC_POOL, filter: 'kind = generic' },
    { ...base, limit: MIN_BRANDED, filter: 'kind = branded' },
  ], signal);
  return orderBest(words, all, generic, branded, limit);
}

/**
 * Queries with one misspelled word replaced by a real word one mistake away, common words first. A word
 * counts as misspelled when no food has it, or only a tiny share compared with the replacement. Ordinary
 * words are never swapped: that would show a different food than the one asked for.
 */
async function corrections(cfg: ClientConfig, words: string[], signal?: AbortSignal, ratio = FAR_MORE_COMMON): Promise<string[][]> {
  const positions = words.map((_, i) => i).filter((i) => CORRECTABLE.test(words[i]));
  if (!positions.length) return [];
  const found = (await multiSearch(cfg, positions.map((i) => ({
    indexUid: WORDS,
    q: '',
    filter: `keys IN [${spellingKeys(words[i]).map((k) => `"${k}"`).join(', ')}]`,
    sort: ['count:desc'],
    limit: LOOKUP_LIMIT,
  })), signal)) as unknown as { word: string; count: number }[][];

  const options = positions.flatMap((position, n) => {
    const typed = found[n].find((hit) => hit.word === words[position]);
    const needed = typed ? typed.count * ratio : 0;
    return found[n]
      .filter((hit) => oneMistakeApart(words[position], hit.word) && hit.count >= needed)
      .slice(0, PER_WORD)
      .map((hit) => ({ position, word: hit.word, count: hit.count }));
  });
  options.sort((a, b) => b.count - a.count);
  const replaced = (changes: { position: number; word: string }[]) =>
    words.map((w, i) => changes.find((c) => c.position === i)?.word ?? w);
  // One mistake is the usual case; several misspelled words are then tried together, two choices each
  let together: { position: number; word: string }[][] = [[]];
  const mistaken = [...new Set(options.map((o) => o.position))];
  for (const position of mistaken) {
    const choices = options.filter((o) => o.position === position).slice(0, 2);
    together = together.flatMap((set) => choices.map((c) => [...set, c])).slice(0, MAX_CORRECTIONS);
  }
  return [
    ...options.slice(0, MAX_CORRECTIONS).map((o) => replaced([o])),
    ...(mistaken.length > 1 ? together.map(replaced) : []),
  ];
}

/** The first of these queries that finds anything, asked about in a single request. */
async function firstWithHits(cfg: ClientConfig, queries: string[][], signal?: AbortSignal): Promise<string[] | undefined> {
  if (!queries.length) return undefined;
  if (cfg.engine) {
    for (const words of queries) {
      const [hits] = await multiSearch(cfg, [{ indexUid: INDEX, q: words.join(' '), limit: 1, matchingStrategy: 'all' }], signal);
      if (hits.length) return words;
    }
    return undefined;
  }
  const results = await multiSearch(
    cfg, queries.map((w) => ({ indexUid: INDEX, q: w.join(' '), limit: 1, matchingStrategy: 'all' })), signal);
  return queries[results.findIndex((hits) => hits.length)];
}

/**
 * The data itself contains misspellings ("chiken breast"), so a typo can find a few foods. When a word is
 * overwhelmingly more often spelled another way, those foods are shown first.
 */
async function obviousTypo(cfg: ClientConfig, words: string[], limit: number, signal?: AbortSignal) {
  const candidates = (await corrections(cfg, words, signal, OBVIOUS_TYPO)).filter((fixed) =>
    fixed.every((w, i) => w === words[i] || words[i].length >= OBVIOUS_TYPO_LETTERS));
  const fixed = await firstWithHits(cfg, candidates, signal);
  if (!fixed) return undefined;
  const corrected = fixed.join(' ');
  return { best: await bestMatches(cfg, fixed, corrected, limit, signal), corrected };
}

export async function searchIndex(cfg: ClientConfig, query: string, limit = 20, signal?: AbortSignal): Promise<SearchResult> {
  const words = queryWords(query);
  if (!words.length) return { best: [], close: [] };
  // The original text keeps Meilisearch's matching of a half-typed last word.
  const q = query.trim().split(/\s+/).slice(0, MAX_WORDS).join(' ');
  // One time limit for the whole search, however many requests it takes.
  const deadline = Date.now() + (cfg.timeoutMs ?? TIMEOUT_MS);
  const left = (): ClientConfig => ({ ...cfg, timeoutMs: Math.max(0, deadline - Date.now()) });

  const best = await bestMatches(left(), words, q, limit, signal);
  if (best.length) {
    const respelled = cfg.engine && best.length < limit ? await obviousTypo(left(), words, limit, signal) : undefined;
    if (!respelled) return { best, close: [] };
    const merged = new Map<string, IndexDoc>();
    for (const doc of [...respelled.best.slice(0, FIXED_FIRST), ...best, ...respelled.best]) merged.set(doc.id, doc);
    return { best: [...merged.values()].slice(0, limit), close: [], corrected: respelled.corrected };
  }

  const fixed = await firstWithHits(left(), await corrections(left(), words, signal), signal);
  if (fixed) {
    const corrected = fixed.join(' ');
    return { best: await bestMatches(left(), fixed, corrected, limit, signal), close: [], corrected };
  }

  const shorter = await firstWithHits(left(), relaxations(words).flat(), signal);
  if (!shorter) return { best: [], close: [] };
  const [close] = await multiSearch(
    left(), [{ indexUid: INDEX, q: shorter.join(' '), limit, matchingStrategy: 'all' }], signal);
  return { best: [], close };
}

export async function findByBarcode(cfg: ClientConfig, code: string): Promise<IndexDoc | null> {
  const barcode = normalizeBarcode(code);
  if (!barcode) return null;
  if (cfg.engine) return cfg.engine.byBarcode(barcode);
  const data = await post(cfg, `/indexes/${INDEX}/search`, { q: '', filter: `barcode = "${barcode}"`, limit: 1 });
  return data?.hits?.[0] ?? null;
}
