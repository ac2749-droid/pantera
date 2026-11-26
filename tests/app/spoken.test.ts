import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPersonalIndex, searchFoods, toFood } from '../../src/foodSearch';
import { parseMeal } from '../../src/meal/parse';
import { resolveItem } from '../../src/meal/resolve';

const personal = buildPersonalIndex([], [], 'all', []);
const foods = (said: string) => parseMeal(said).items.map((it) => resolveItem(it, personal).food?.name ?? 'nothing');
const read = (said: string) => parseMeal(said).items.map((i) => [i.qty, i.food]);

test('a word that is a food is not read as a similar-looking one', () => {
  assert.match(foods('I had 2 fried eggs and 1 pita')[1], /pita/i);
  assert.match(foods('I had a pita with hummus')[0], /pita/i);
  assert.match(foods('one roti')[0], /roti/i);
  assert.match(toFood(searchFoods('pita', personal, 'all', 3)[0].doc.item).name, /pita/i);
});

test('spelling mistakes are still forgiven', () => {
  assert.match(foods('spagetti')[0], /spaghetti|pasta/i);
  assert.match(foods('brocoli')[0], /broccoli/i);
  assert.match(foods('yougurt')[0], /yogurt/i);
});

test('foods said one after another without pauses are separate', () => {
  assert.deepEqual(read('2 fried eggs 1 pita'), [[2, 'egg fried'], [1, 'pita']]);
  assert.deepEqual(read('i had 2 fried eggs 1 whole wheat pita bread a coffee'), [[2, 'egg fried'], [1, 'whole wheat pita bread'], [1, 'coffee']]);
  assert.deepEqual(read('two eggs one banana'), [[2, 'eggs'], [1, 'banana']]);
  assert.equal(read('5 oz salmon 1 cup rice').length, 2);
  assert.equal(read('100 grams of chicken 200 grams of rice').length, 2);
  assert.equal(read('a bagel with cream cheese 2 eggs').length, 3);
  assert.equal(read('2 large eggs 1 slice of toast 1 tbsp butter').length, 3);
  assert.equal(read('half an avocado 2 slices of toast').length, 2);
  assert.equal(read('two eggs a pita bread some hummus and a glass of orange juice').length, 4);
});

test('numbers that are part of a food or an amount stay with it', () => {
  for (const said of ['1 cup of 2% milk', '2 percent milk', 'a 6 inch sub', 'one 12 ounce coke', 'chicken breast 60 g', '1 1/2 cups rice', 'one and a half cups of rice',
    'a half cup of oats', 'a 100 calorie snack pack', 'a number 1 combo', 'vitamin b 12 shot', 'a bowl of rice', 'a glass of milk', 'half a bagel', 'a couple of eggs', 'chicken in a wrap', 'a dozen wings', 'eggs 2']) {
    assert.equal(read(said).length, 1, said);
  }
});

test('an amount said after a pause belongs to the food before it', () => {
  assert.deepEqual(read('chicken breast, 6 ounces'), [[6, 'chicken breast']]);
  assert.deepEqual(read('pizza, 2 slices and a coke'), [[2, 'pizza'], [1, 'coke']]);
  assert.deepEqual(read('steak. 8 oz. and a baked potato').map((i) => i[0]), [8, 1]);
  assert.deepEqual(read('a large pizza 3 slices'), [[3, 'pizza']]);
});

test('amounts said after each food stay with it', () => {
  assert.deepEqual(read('wings 6 fries 1'), [[6, 'wings'], ...read('1 fries')]);
  assert.deepEqual(read('eggs 3 bacon 2 strips').map((i) => i[0]), [3, 2]);
  assert.deepEqual(read('eggs 2 toast 2').map((i) => i[0]), [2, 2]);
  assert.deepEqual(read('chicken breast 60 g rice 100 g').map((i) => i[0]), [60, 100]);
  assert.equal(read('oatmeal one cup 2 percent milk').length, 2);
});

test('"a" inside a name, and the ingredients of a dish, do not start a new food', () => {
  for (const said of ['chicken a la king', 'apple pie a la mode', 'pasta a la vodka', 'chick fil a sandwich', 'omelette 3 eggs', 'an egg white omelette 3 eggs', 'smoothie 2 bananas 1 cup milk']) {
    assert.equal(read(said).length, 1, said);
  }
});

test('a time of day and a choice of amounts are not read as the amount', () => {
  assert.deepEqual(read('for breakfast at 8 i had 2 eggs'), [[2, 'eggs']]);
  assert.deepEqual(read('at 12:30 pm i had a banana'), [[1, 'banana']]);
  assert.deepEqual(read('maybe 3 or 4 cookies'), [[3.5, 'cookies']]);
  assert.deepEqual(read('2 oz at 160 calories').length, 1);
});

test('each item remembers your own words, without the lead-in', () => {
  const words = (said: string) => parseMeal(said).items.map((i) => i.raw);
  assert.deepEqual(words('I had 2 fried eggs and a whole wheat pita'), ['2 fried eggs', 'a whole wheat pita']);
  assert.deepEqual(words('a bowl of oatmeal, toast and fries'), ['a bowl of oatmeal', 'toast', 'fries']);
  assert.equal(words('a chicken wrap').length, 2); // one phrase read as two foods still has words for both
});
