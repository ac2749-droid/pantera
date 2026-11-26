import assert from 'node:assert/strict';
import test from 'node:test';

import { lookupBarcode } from '../../src/lookup';

type Numbers = { kcal: number; p: number; c: number; f: number };

const offReply = (n: Numbers, grams = 28) => ({
  status: 1,
  product: {
    product_name: 'Chocolate Chip Cookies', brands: 'Acme', serving_size: `${grams} g`, serving_quantity: grams,
    nutriments: { 'energy-kcal_100g': n.kcal, proteins_100g: n.p, carbohydrates_100g: n.c, fat_100g: n.f },
  },
});
const usdaReply = (n: Numbers, grams = 28) => ({
  foods: [{
    description: 'CHOCOLATE CHIP COOKIES', gtinUpc: '0012345678905', dataType: 'Branded', brandName: 'ACME', servingSize: grams, servingSizeUnit: 'g',
    foodNutrients: [[1008, n.kcal], [1003, n.p], [1005, n.c], [1004, n.f]].map(([nutrientId, value]) => ({ nutrientId, value })),
  }],
});

/** Answers each database with the given reply; `null` means it can't be reached. */
function online(off: object | null, usda: object | null) {
  globalThis.fetch = (async (url: string) => {
    const reply = url.includes('openfoodfacts') ? off : usda;
    if (!reply) throw new Error('offline');
    return { ok: true, status: 200, json: async () => reply };
  }) as unknown as typeof fetch;
}

async function scan() {
  const r = await lookupBarcode('012345678905', '');
  assert.ok(r.ok);
  const per100 = Math.round((r.food.n.kcal * 100) / r.food.g);
  return [r.food.source, per100, !!r.food.flagged];
}

const label = { kcal: 500, p: 7, c: 64, f: 25 };
const perServing = { kcal: 140, p: 2, c: 18, f: 7 };

test('when one database has a serving’s numbers as 100 g, the other one is used', async () => {
  online(offReply(perServing), usdaReply(label));
  assert.deepEqual(await scan(), ['USDA FoodData Central', 500, false]);
});

test('databases that agree give the Open Food Facts food', async () => {
  online(offReply({ ...label, kcal: 480 }), usdaReply(label));
  assert.deepEqual(await scan(), ['Open Food Facts', 480, false]);
});

test('an unexplained disagreement is marked for checking', async () => {
  online(offReply({ kcal: 320, p: 5, c: 40, f: 16 }), usdaReply(label));
  assert.deepEqual(await scan(), ['USDA FoodData Central', 500, true]);
});

test('a scaling must show in every number to explain a difference', async () => {
  online(offReply({ kcal: 140, p: 7, c: 18, f: 4.5 }), usdaReply(label)); // calories fit, protein doesn't
  assert.deepEqual(await scan(), ['USDA FoodData Central', 500, true]);
});

test('empty USDA numbers do not replace real ones', async () => {
  online(offReply(label), usdaReply({ kcal: 0, p: 0, c: 0, f: 0 }));
  assert.deepEqual(await scan(), ['Open Food Facts', 500, true]);
});

test('either database alone still answers, and numbers that don’t add up are marked', async () => {
  online(offReply(label), null);
  assert.deepEqual(await scan(), ['Open Food Facts', 500, false]);
  online(null, usdaReply(label));
  assert.deepEqual(await scan(), ['USDA FoodData Central', 500, false]);
  online(offReply({ kcal: 120, p: 40, c: 60, f: 20 }), null);
  assert.deepEqual(await scan(), ['Open Food Facts', 120, true]);
});

test('no connection and no match are told apart', async () => {
  online(null, null);
  assert.deepEqual(await lookupBarcode('012345678905', ''), { ok: false, reason: 'network' });
  online({ status: 0 }, { foods: [] });
  const r = await lookupBarcode('012345678905', '');
  assert.equal(r.ok ? '' : r.reason, 'not_found');
});
