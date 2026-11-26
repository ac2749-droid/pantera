// Gives the app the search server's address and search-only key: node search/app-env.mts [address]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PREFIX = 'EXPO_PUBLIC_FOOD_INDEX_';

export function appEnv(searchEnv: string, existing: string, url = 'http://127.0.0.1:7700'): string {
  const key = /^MEILI_SEARCH_KEY=(.+)$/m.exec(searchEnv)?.[1].trim();
  if (!key) throw new Error('No search key in search/.env. Run search/load.py first.');
  const kept = existing.split(/\r?\n/).filter((line) => line && !line.startsWith(PREFIX));
  return [...kept, `${PREFIX}URL=${url}`, `${PREFIX}KEY=${key}`, ''].join('\n');
}

if (import.meta.main) {
  const root = join(import.meta.dirname, '..');
  const target = join(root, '.env.local');
  const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
  writeFileSync(target, appEnv(readFileSync(join(import.meta.dirname, '.env'), 'utf8'), existing, process.argv[2]));
  console.log('Wrote .env.local');
}
