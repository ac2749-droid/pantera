import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMeal } from '../../src/meal/parse';

const read = (text: string) => parseMeal(text).items.map((i) => [i.qty, i.food]);

test('decimal amounts stay whole', () => {
  assert.deepEqual(read('14.5 oz diced tomatoes'), [[14.5, 'diced tomatoes']]);
  assert.deepEqual(read('1.5 cups rice'), [[1.5, 'rice']]);
  assert.deepEqual(read('2,5 oz cheese'), [[2.5, 'cheese']]);
  assert.deepEqual(read('1,000 g potatoes'), [[1000, 'potatoes']]);
  assert.deepEqual(read('.5 cup milk'), [[0.5, 'milk']]);
});

test('sentences and lists are still split', () => {
  assert.deepEqual(read('8.5 oz steak. 1 apple, 2 eggs'), [[8.5, 'steak'], [1, 'apple'], [2, 'eggs']]);
  assert.deepEqual(read('2 eggs.3 strips bacon').map((i) => i[1]), ['eggs', 'bacon']);
});

test('a dot after a unit does not split the sentence', () => {
  assert.deepEqual(read('1 lb. ground beef'), [[1, 'ground beef']]);
  assert.deepEqual(read('15.5 oz. tomatoes and 1 tbsp. honey'), [[15.5, 'tomatoes'], [1, 'honey']]);
  assert.deepEqual(parseMeal('2 oz. cheese').items[0].unit, parseMeal('2 oz cheese').items[0].unit);
});

test('a dot after a unit still ends a sentence', () => {
  assert.deepEqual(read('Chicken 6 oz. Rice 1 cup.'), [[6, 'chicken'], [1, 'rice']]);
  assert.deepEqual(read('ground beef 1 lb. pasta 8 oz. sauce').length, 3);
  assert.deepEqual(read('I had 4 oz. 2 eggs.').at(-1), [2, 'eggs']);
});

test('a comma between two foods is not a decimal comma', () => {
  assert.deepEqual(read('rice 150,2 eggs'), [[150, 'rice'], [2, 'eggs']]);
  assert.deepEqual(read('eggs 2,1 toast'), [[2, 'eggs'], [1, 'white bread']]);
});
