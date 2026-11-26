import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILTIN, emptyNutrients, Food, Nutrients } from '../../src/foods';
import { foodsRichIn, SUGGESTABLE, topSources } from '../../src/nutrientSources';

const n = (over: Partial<Nutrients>): Nutrients => ({ ...emptyNutrients(), ...over });
const entry = (name: string, over: Partial<Nutrients>) => ({ name, n: n(over) });
const food = (name: string, over: Partial<Nutrients>, micros = true): Food => ({ id: name, name, serving: '1', g: 100, n: n(over), src: 'builtin', micros });

test('sources are added up by food, biggest first, with their share', () => {
  const list = topSources([entry('Milk', { ca: 300 }), entry('Cheese', { ca: 200 }), entry('Milk', { ca: 300 }), entry('Apple', {})], 'ca');
  assert.deepEqual(list, [
    { name: 'Milk', amount: 600, share: 0.75, times: 2 },
    { name: 'Cheese', amount: 200, share: 0.25, times: 1 },
  ]);
});

test('a limit on the list keeps shares relative to everything eaten', () => {
  const list = topSources([entry('A', { fib: 3 }), entry('B', { fib: 1 })], 'fib', 1);
  assert.deepEqual(list.map((s) => [s.name, s.share]), [['A', 0.75]]);
});

test('suggestions give a good amount for their calories, best first', () => {
  const list = foodsRichIn('fe', [
    food('Small', { fe: 0.5, kcal: 20 }), // under a tenth of the daily value
    food('Greens', { fe: 6, kcal: 40 }),
    food('Feast', { fe: 9, kcal: 900 }), // too heavy to suggest
    food('Beans', { fe: 4, kcal: 220 }),
  ]);
  assert.deepEqual(list.map((f) => f.name), ['Greens', 'Beans']);
});

test('vitamins and minerals are only suggested from foods that list them', () => {
  assert.deepEqual(foodsRichIn('mag', [food('Unlisted', { mag: 300, kcal: 100 }, false)]), []);
  assert.equal(foodsRichIn('fib', [food('Bran', { fib: 10, kcal: 100 }, false)]).length, 1);
});

test('nutrients to keep low, and ones without a daily value, get no suggestions', () => {
  assert.deepEqual(foodsRichIn('na', BUILTIN), []);
  assert.deepEqual(foodsRichIn('mono', BUILTIN), []);
});

test('the built-in foods give real suggestions for the common gaps', () => {
  for (const k of ['p', 'fib', 'fe', 'ca', 'vc', 'k', 'vd', 'mag', 'b12'] as const) {
    assert.ok(foodsRichIn(k, SUGGESTABLE).length >= 2, k);
  }
});

test('treats, drinks and restaurant dishes are not suggested', () => {
  const names = SUGGESTABLE.map((f) => f.name).join('|');
  assert.doesNotMatch(names, /Red Bull|Latte|French fries|Pizza|Pho/);
  assert.match(names, /Salmon/);
});
