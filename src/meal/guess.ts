/** The speech recognizer offers a few versions of what it heard; this picks the one that is food. */

import { SearchIndex } from '../search';
import { ResultItem } from '../foodSearch';
import { parseMeal } from './parse';
import { resolveItem } from './resolve';

export function bestGuess(guesses: string[], personal: SearchIndex<ResultItem>): string {
  const read = (text: string) => {
    const items = parseMeal(text).items.map((it) => resolveItem(it, personal));
    return { count: items.length, sure: items.length > 0 && items.every((i) => i.confidence === 'good') };
  };
  const first = guesses[0] ?? '';
  if (guesses.length < 2) return first;
  const base = read(first);
  if (base.sure) return first;
  // Only a version with as many foods, all recognized, may replace what was heard first
  const better = guesses.slice(1).find((g) => {
    const other = read(g);
    return other.sure && other.count >= base.count;
  });
  return better ?? first;
}
