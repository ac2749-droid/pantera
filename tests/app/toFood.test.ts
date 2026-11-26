import assert from 'node:assert/strict';
import test from 'node:test';

import type { IndexDoc } from '../../src/foodIndex/client';
import { isIndexFood, toFood } from '../../src/foodIndex/toFood';
import { EXTRA_NK } from '../../src/foods';

const doc: IndexDoc = {
  id: 'off_41900091290', name: 'Cottage Cheese', brand: 'The Honest Cow', kind: 'branded', barcode: '41900091290',
  portions: [{ label: '0.5 cup (113 g)', g: 113 }, { label: '100 g', g: 100 }],
  n: { kcal: 106.19, p: 13.27, c: 4.42, f: 4.42, na: 415.9 }, source: 'off', popularity: 14, flagged: 0,
  updated: '2025-06-15', category: 'dairy',
};

test('one serving, with all portions', () => {
  const f = toFood(doc);
  assert.deepEqual([f.serving, f.g, Math.round(f.n.kcal), Math.round(f.n.p)], ['0.5 cup (113 g)', 113, 120, 15]);
  assert.deepEqual(f.portions, doc.portions);
  assert.deepEqual([f.brand, f.barcode, f.src, f.source], ['The Honest Cow', '41900091290', 'online', 'Open Food Facts']);
  assert.equal(toFood({ ...doc, source: 'usda_sr' }).source, 'USDA FoodData Central');
});

test('ids stay clear of the app’s own id kinds', () => {
  for (const id of ['off_1', 'usdab_2', 'usdasr_3', 'usdafn_4']) {
    const f = toFood({ ...doc, id });
    assert.equal(f.id, 'x:' + id);
    assert.ok(isIndexFood(f));
    assert.ok(!/^(u|b|r:)/.test(f.id)); // resolveFood treats these as other foods
  }
  assert.ok(!isIndexFood({ id: 'cabc' }));
});

test('missing figures are marked, not claimed to be zero', () => {
  const f = toFood({ ...doc, n: { kcal: 100, p: 3 } });
  assert.equal(f.n.f, 0);
  assert.deepEqual(f.unknown, ['c', 'f', 'fib', 'sug', 'sat', 'na']);
  assert.equal(toFood({ ...doc, n: { kcal: 1, p: 0, c: 0, f: 0, fib: 0, sug: 0, sat: 0, na: 0 } }).unknown, undefined);
});

test('flag, vitamins and a missing brand', () => {
  assert.equal(toFood({ ...doc, flagged: 1 }).flagged, true);
  assert.equal(toFood(doc).flagged, undefined);
  assert.equal(toFood(doc).micros, false);
  const many = Object.fromEntries(EXTRA_NK.slice(0, 12).map((k) => [k, 1]));
  assert.equal(toFood({ ...doc, n: { ...doc.n, ...many } }).micros, true);
  const bare = toFood({ ...doc, brand: null, barcode: null });
  assert.equal(bare.brand, undefined);
  assert.equal(bare.barcode, undefined);
});
