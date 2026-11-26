// Try searches yourself, with search/start.ps1 running:
//   node search/try.mts honest cow cottage cheese
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { searchIndex } from '../src/foodIndex/client.ts';
import type { IndexDoc, SearchResult } from '../src/foodIndex/client.ts';

function line(food: IndexDoc, i: number): string {
  const portion = food.portions[0];
  const per = (value: number) => Math.round((value * portion.g) / 100);
  const protein = food.n.p === undefined ? '' : `, ${per(food.n.p)} g protein`;
  const brand = food.brand ? ` (${food.brand})` : '';
  const check = food.flagged ? '  [check]' : '';
  return `  ${i + 1}. ${food.name}${brand}: ${per(food.n.kcal)} kcal${protein} per ${portion.label}${check}`;
}

export function format(result: SearchResult): string[] {
  if (result.best.length) {
    const fixed = result.corrected ? ` (showing results for "${result.corrected}")` : '';
    return [`BEST MATCHES${fixed}`, ...result.best.map(line)];
  }
  return result.close.length ? ['CLOSE MATCHES', ...result.close.map(line)] : ['Nothing found'];
}

if (import.meta.main) {
  const query = process.argv.slice(2).join(' ');
  const env = readFileSync(join(import.meta.dirname, '.env'), 'utf8');
  const key = /^MEILI_SEARCH_KEY=(.+)$/m.exec(env)?.[1].trim() ?? '';
  try {
    console.log(format(await searchIndex({ url: 'http://127.0.0.1:7700', key, timeoutMs: 15000 }, query, 8)).join('\n'));
  } catch (e) {
    console.error(`${e instanceof Error ? e.message : e}. Is search/start.ps1 running?`);
    process.exitCode = 1;
  }
}
