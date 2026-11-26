// Is the right food FIRST? Usage: node search/eval/rank.mts [--all]   (with search/start.ps1 running)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { searchIndex } from '../../src/foodIndex/client.ts';
import type { IndexDoc } from '../../src/foodIndex/client.ts';
import { norm } from './variants.mts';

export type Case = { q: string; words: string[]; not: string[]; brands?: string[] };

export const cases: Case[] = JSON.parse(readFileSync(join(import.meta.dirname, 'ranking.json'), 'utf8'));

/** A plain food wants a generic result; a brand search wants that brand. Both want the right name. */
export function passes(c: Case, first: IndexDoc | undefined): boolean {
  if (!first) return false;
  const name = norm(first.name);
  const rightKind = c.brands
    ? c.brands.some((b) => norm(first.brand || '').includes(norm(b)))
    : first.kind === 'generic';
  return rightKind && c.words.every((w) => name.includes(norm(w))) && !c.not.some((w) => name.includes(norm(w)));
}

/** Every other case is for tuning; the rest show whether a change helps searches it was not shaped on. */
export function split(all: Case[]): [Case[], Case[]] {
  return [all.filter((_, i) => i % 2 === 0), all.filter((_, i) => i % 2 === 1)];
}

if (import.meta.main) {
  const env = readFileSync(join(import.meta.dirname, '..', '.env'), 'utf8');
  const key = /^MEILI_SEARCH_KEY=(.+)$/m.exec(env)?.[1].trim() ?? '';
  const cfg = { url: 'http://127.0.0.1:7700', key, timeoutMs: 20000 };
  const [tune, held] = split(cases);
  for (const [title, group] of [['tuning half', tune], ['kept-aside half', held]] as const) {
    let first = 0;
    let three = 0;
    const failed: string[] = [];
    for (const c of group) {
      const { best } = await searchIndex(cfg, c.q, 10);
      if (passes(c, best[0])) first++;
      else failed.push(`  "${c.q}" -> ${best[0] ? `${best[0].brand ?? '-'} | ${best[0].name}` : 'nothing'}`);
      if (best.slice(0, 3).some((d) => passes(c, d))) three++;
    }
    console.log(`${title}: right food first ${first}/${group.length}, in top 3 ${three}/${group.length}`);
    // The kept-aside failures stay hidden so that changes are not shaped on them.
    if (title === 'tuning half' || process.argv.includes('--all')) console.log(failed.join('\n'));
  }
}
