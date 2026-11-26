import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyNutrients, Food, scale } from '../../src/foods';
import type { IndexDoc } from '../../src/foodIndex/client';
import { toFood } from '../../src/foodIndex/toFood';
import { correctedEntry, outdatedFoods, PreviousNumbers, refreshedFood } from '../../src/foodRefresh';

const previous: PreviousNumbers = { off_96619000081: [[120, 8, 12, 5]] };

const doc = (per100: Record<string, number>, over: Partial<IndexDoc> = {}): IndexDoc => ({
  id: 'off_96619000081', name: '2% Reduced Fat Milk', brand: 'Kirkland Signature', kind: 'branded', barcode: '96619000081',
  portions: [{ label: '1 portion (247 g)', g: 247 }, { label: '100 g', g: 100 }], n: per100, source: 'off', popularity: 9, flagged: 0, updated: '', category: '', ...over,
});
const oldNumbers = { kcal: 120, p: 8, c: 12, f: 5, ca: 300 };
const newNumbers = { kcal: 48.58, p: 3.24, c: 4.86, f: 2.02, ca: 121.46 };
/** The copy that adding the old database food left in My foods. */
const saved = (): Food => ({ ...toFood(doc(oldNumbers)), src: 'custom' });
const current = toFood(doc(newNumbers));

test('a saved copy of a corrected food is found and takes the new numbers', () => {
  assert.deepEqual(outdatedFoods([saved()], previous).map((f) => f.barcode), ['96619000081']);
  const food = refreshedFood(saved(), current, previous)!;
  assert.equal(Math.round(food.n.kcal), 120);
  assert.equal(Math.round(scale(food, 95).kcal), 46);
  assert.equal(Math.round(scale(food, 95).p * 10) / 10, 3.1);
  assert.equal(Math.round(food.n.ca), 300);
  assert.deepEqual([food.id, food.name, food.serving, food.g, food.src], [saved().id, saved().name, '1 portion (247 g)', 247, 'custom']);
  assert.deepEqual(outdatedFoods([food], previous), []);
});

test('numbers you changed yourself are left alone', () => {
  const edited = { ...saved(), n: { ...saved().n, kcal: 130, p: 8.5 } };
  assert.deepEqual(outdatedFoods([edited], previous), []);
  assert.equal(refreshedFood(edited, current, previous), null);
});

test('foods you made, and foods that were never wrong, are left alone', () => {
  const own: Food = { id: 'cabc', name: 'My milk', serving: '1 cup', g: 247, n: saved().n, src: 'custom' };
  const other: Food = { ...saved(), id: 'x:off_123456', barcode: '123456' };
  assert.deepEqual(outdatedFoods([own, other], previous), []);
});

test('a copy saved from an online barcode scan is corrected too', () => {
  const scanned: Food = { ...saved(), id: 'cxyz', source: 'Open Food Facts', barcode: '096619000081' };
  assert.equal(outdatedFoods([scanned], previous).length, 1);
  assert.equal(Math.round(refreshedFood(scanned, current, previous)!.n.kcal), 120);
});

test('nothing changes when the database still has the old numbers', () => {
  assert.equal(refreshedFood(saved(), toFood(doc(oldNumbers)), previous), null);
});

test('a food now doubted is marked on your copy', () => {
  const doubted = refreshedFood(saved(), toFood(doc(oldNumbers, { flagged: 1 })), previous);
  assert.equal(doubted?.flagged, true);
  assert.equal(refreshedFood(doubted!, toFood(doc(oldNumbers, { flagged: 1 })), previous), null);
});

test('logging an old entry again uses your corrected food', () => {
  const old = { fid: saved().id, grams: 95, n: scale(saved(), 95), name: 'Milk' };
  const fixed = refreshedFood(saved(), current, previous)!;
  const again = correctedEntry(old, [fixed], previous)!;
  assert.equal(Math.round(again.n.kcal), 46);
  assert.equal(again.name, 'Milk');
  assert.equal(correctedEntry(old, [], previous), null); // wrong, with nothing to put right from
  const fine = { fid: saved().id, grams: 95, n: scale(fixed, 95) };
  assert.equal(correctedEntry(fine, [fixed], previous), fine);
  const quick = { grams: 1, n: emptyNutrients() };
  assert.equal(correctedEntry(quick, [fixed], previous), quick);
});
