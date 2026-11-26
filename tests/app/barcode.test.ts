import assert from 'node:assert/strict';
import test from 'node:test';

import { findScanned, fullBarcode } from '../../src/foodIndex/barcode';
import type { IndexDoc } from '../../src/foodIndex/client';
import { emptyNutrients, Food } from '../../src/foods';
import type { LookupResult } from '../../src/lookup';

test('an 8-digit UPC-E expands to its 12-digit form', () => {
  assert.equal(fullBarcode('04252614', 'upc_e'), '042100005264');
  assert.equal(fullBarcode('01234531', 'upc_e'), '012300000451');
  assert.equal(fullBarcode('01234542', 'upc_e'), '012340000052');
  assert.equal(fullBarcode('01234565', 'upc_e'), '012345000065');
});

test('other codes are unchanged', () => {
  assert.equal(fullBarcode('04252614', 'ean8'), '04252614');
  assert.equal(fullBarcode('04252614'), '04252614');
  assert.equal(fullBarcode('041900091290', 'upc_a'), '041900091290');
  assert.equal(fullBarcode('94252614', 'upc_e'), '94252614'); // not a valid UPC-E number system
});

const food: Food = { id: 'c1', name: 'Mine', serving: '100 g', g: 100, n: emptyNutrients(), src: 'custom' };
const doc: IndexDoc = { id: 'off_1', name: 'Indexed', brand: null, kind: 'generic', barcode: '1', portions: [{ label: '100 g', g: 100 }],
  n: { kcal: 1 }, source: 'off', popularity: 0, flagged: 0, updated: '', category: 'other' };
const online: LookupResult = { ok: false, reason: 'not_found', partial: { barcode: '123456' } };
const never = () => { throw new Error('should not be called'); };

test('a food you saved wins and nothing else is asked', async () => {
  const r = await findScanned('123456', { saved: () => food, index: never, online: never });
  assert.deepEqual(r, { ok: true, food, saved: true });
});

test('then the food index', async () => {
  const r = await findScanned('123456', { saved: () => undefined, index: async () => doc, online: never });
  assert.ok(r.ok && r.food.name === 'Indexed' && r.food.id === 'x:off_1' && !r.saved);
  assert.equal(r.ok && r.food.barcode, '123456');
});

test('then the online databases, whether the index misses, fails or is not set up', async () => {
  for (const index of [async () => null, async () => { throw new Error('down'); }, null]) {
    const asked: string[] = [];
    const r = await findScanned('123456', { saved: () => undefined, index, online: async (c) => { asked.push(c); return online; } });
    assert.equal(r, online);
    assert.deepEqual(asked, ['123456']);
  }
});
