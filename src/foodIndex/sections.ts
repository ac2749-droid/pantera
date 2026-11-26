/** What each part of the search results shows, given what the phone and the server know right now. */

import type { Food } from '../foods';
import { queryWords, SearchResult } from './client';
import { toFood } from './toFood';

/** The last answer shown, kept on screen while the next one is on its way. */
export type Answer = { query: string; result: SearchResult };

export type ServerState =
  | { status: 'off' }
  | { status: 'idle' }
  | { status: 'waiting'; query: string; previous?: Answer }
  | { status: 'ready'; query: string; result: SearchResult }
  | { status: 'offline'; query: string };

/** `searching` is true while there is nothing from the food search to show for this text yet. */
export type Sections = { yours: Food[]; best: Food[]; close: Food[]; offline: boolean; searching: boolean; corrected: string | null };

const MAX_CURATED = 2;

/** Two entries with the same name and brand are one food to the person reading the list. */
export function sameFoodKey(food: { name: string; brand?: string }): string {
  return `${queryWords(food.name).join(' ')}|${queryWords(food.brand ?? '').join(' ')}`;
}

/** Built-in foods whose name has a word starting with every word typed: "banana" → "Banana, medium". */
function strictMatches(query: string, curated: Food[]): Food[] {
  const words = queryWords(query);
  if (!words.length) return [];
  return curated.filter((f) => {
    const name = queryWords(f.name);
    return words.every((w) => name.some((n) => n.startsWith(w)));
  });
}

/** The foods in order, without repeats and without anything already listed. */
function unique(foods: Food[], listed: Set<string>): Food[] {
  return foods.filter((f) => {
    const key = sameFoodKey(f);
    if (listed.has(key)) return false;
    listed.add(key);
    return true;
  });
}

export function sections(input: { query: string; yours: Food[]; device: Food[]; curated: Food[]; server: ServerState }): Sections {
  const { query, yours, device, curated, server } = input;
  const text = query.trim();
  const current = 'query' in server && server.query.trim() === text;
  const listed = new Set(yours.map(sameFoodKey));
  const waiting = current && server.status === 'waiting';
  const base = { yours, close: [] as Food[], offline: current && server.status === 'offline', searching: waiting, corrected: null };
  const answer: Answer | undefined = !current ? undefined
    : server.status === 'ready' ? server
    : server.status === 'waiting' ? server.previous
    : undefined;

  if (!answer) return { ...base, best: unique(device, listed) };

  const { result } = answer;
  const first = strictMatches(result.corrected ?? answer.query, curated).slice(0, MAX_CURATED);
  if (!first.length && !result.best.length && !result.close.length) return { ...base, best: unique(device, listed) };

  const best = unique([...first, ...result.best.map(toFood)], listed);
  const close = result.best.length || first.length ? [] : unique(result.close.map(toFood), listed);
  return { ...base, searching: false, best, close, corrected: result.corrected ?? null };
}
