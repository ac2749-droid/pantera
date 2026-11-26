import assert from 'node:assert/strict';
import test from 'node:test';

import { appEnv } from '../app-env.mts';

const searchEnv = ['MEILI_MASTER_KEY=MASTER', 'MEILI_SEARCH_KEY=SEARCH', ''].join('\n');

test('writes the address and the search key, keeping other lines', () => {
  const out = appEnv(searchEnv, ['OTHER=1', 'EXPO_PUBLIC_FOOD_INDEX_KEY=old', ''].join('\n'));
  assert.deepEqual(out.split('\n'), ['OTHER=1', 'EXPO_PUBLIC_FOOD_INDEX_URL=http://127.0.0.1:7700', 'EXPO_PUBLIC_FOOD_INDEX_KEY=SEARCH', '']);
  assert.ok(!out.includes('MASTER'));
});

test('takes another address and refuses to run without a search key', () => {
  assert.ok(appEnv(searchEnv, '', 'https://food.example').includes('EXPO_PUBLIC_FOOD_INDEX_URL=https://food.example'));
  assert.throws(() => appEnv('MEILI_MASTER_KEY=MASTER', ''), /search key/i);
});
