import assert from 'node:assert/strict';
import test from 'node:test';

import { addedSummary, canQuickAdd, quickAmount } from '../../src/quickAdd';
import { emptyNutrients, Entry, Food } from '../../src/foods';

const food: Food = { id: 'x:off_1', name: 'Cottage Cheese', brand: 'Acme', serving: '0.5 cup', g: 113, n: { ...emptyNutrients(), kcal: 120 }, src: 'online' };
const entry = (over: Partial<Entry>): Entry => ({
  id: 'e', name: 'Cottage Cheese (Acme)', serving: '1 cup', sg: 226, grams: 339, meal: 'breakfast', n: emptyNutrients(), t: 1, ...over,
});

test('a food logged for the first time uses its own serving', () => {
  assert.deepEqual(quickAmount({}, food), { grams: 113, portion: { label: '0.5 cup', g: 113 }, usual: false, kcal: 120 });
});

test('a food you have logged before uses the amount you had last', () => {
  const days = {
    '2026-11-01': [entry({ fid: 'x:off_1', grams: 100, sg: 1, serving: '1 g', t: 5 })],
    '2026-11-20': [entry({ fid: 'x:off_1', t: 9 }), entry({ fid: 'x:off_1', grams: 50, t: 8 })],
  };
  const q = quickAmount(days, food);
  assert.deepEqual([q.grams, q.portion, q.usual], [339, { label: '1 cup', g: 226 }, true]);
  assert.equal(Math.round(q.kcal), 360);
});

test('other foods, sample entries and broken amounts are ignored', () => {
  const days = { '2026-11-20': [entry({ fid: 'x:off_2' }), entry({ fid: 'x:off_1', sample: true }), entry({ fid: 'x:off_1', grams: 0, t: 3 })] };
  assert.equal(quickAmount(days, food).usual, false);
});

test('a recent food is matched by its name', () => {
  const recent: Food = { ...food, id: 'r:Cottage Cheese (Acme)', name: 'Cottage Cheese (Acme)', brand: undefined };
  assert.equal(quickAmount({ '2026-11-20': [entry({})] }, recent).usual, true);
});

test('doubtful foods are opened, not added in one tap', () => {
  assert.equal(canQuickAdd(food), true);
  assert.equal(canQuickAdd({ ...food, flagged: true }), false);
  assert.equal(canQuickAdd({ ...food, g: 0 }), false);
});

test('the tray says what was added in this visit', () => {
  assert.equal(addedSummary([]), null);
  assert.equal(addedSummary([{ kcal: 120.4 }]), '1 added · 120 kcal');
  assert.equal(addedSummary([{ kcal: 120.4 }, { kcal: 300.4 }]), '2 added · 421 kcal');
});

test('food planned for a later day is not what you had last time', () => {
  const days = { '2026-11-20': [entry({ fid: 'x:off_1', t: 1, grams: 100 })], '2026-11-28': [entry({ fid: 'x:off_1', t: 9, grams: 500 })] };
  assert.equal(quickAmount(days, food, '2026-11-25').grams, 100);
});
