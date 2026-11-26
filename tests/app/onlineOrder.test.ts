import assert from 'node:assert/strict';
import test from 'node:test';

import { orderOnline } from '../../src/onlineOrder';
import { emptyNutrients, Food } from '../../src/foods';

const food = (name: string, brand?: string): Food => ({ id: name + brand, name, brand, serving: '100 g', g: 100, n: emptyNutrients(), src: 'online' });
const names = (list: Food[]) => list.map((f) => `${f.brand ?? '-'}:${f.name}`);

test('the brand you typed comes first', () => {
  const list = [food('Cheese, cottage, NFS'), food('Cottage cheese, with fruit'), food('Cottage Cheese', 'The Honest Cow')];
  assert.equal(names(orderOnline('honest cow cottage cheese', list))[0], 'The Honest Cow:Cottage Cheese');
});

test('then foods matching more of your words, keeping the given order otherwise', () => {
  const list = [food('Crackers'), food('Cheese, cheddar'), food('Cheese, cottage')];
  assert.deepEqual(names(orderOnline('cottage cheese', list)), ['-:Cheese, cottage', '-:Cheese, cheddar', '-:Crackers']);
});

test('an empty search changes nothing', () => {
  const list = [food('b'), food('a')];
  assert.deepEqual(orderOnline('  ', list), list);
});
