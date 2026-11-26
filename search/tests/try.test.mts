import assert from 'node:assert/strict';
import test from 'node:test';

import { format } from '../try.mts';

const food = (name: string, extra: object = {}) => ({
  name, brand: 'Acme', n: { kcal: 106.2, p: 13.3 }, portions: [{ label: '0.5 cup', g: 113 }], flagged: 0, ...extra,
});

test('shows calories and protein for one serving and marks doubtful foods', () => {
  const lines = format({ best: [food('Cottage Cheese'), food('Odd', { brand: null, n: { kcal: 100 }, flagged: 1 })], close: [] } as any);
  assert.deepEqual(lines, [
    'BEST MATCHES',
    '  1. Cottage Cheese (Acme): 120 kcal, 15 g protein per 0.5 cup',
    '  2. Odd: 113 kcal per 0.5 cup  [check]',
  ]);
});

test('says when the spelling was corrected, when matches are only close, and when there is nothing', () => {
  assert.equal(format({ best: [food('Kale')], close: [], corrected: 'kale' } as any)[0], 'BEST MATCHES (showing results for "kale")');
  assert.equal(format({ best: [], close: [food('Milk')] } as any)[0], 'CLOSE MATCHES');
  assert.deepEqual(format({ best: [], close: [] }), ['Nothing found']);
});
