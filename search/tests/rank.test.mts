import assert from 'node:assert/strict';
import test from 'node:test';

import { cases, passes, split } from '../eval/rank.mts';

const food = (name: string, brand: string | null = null) => ({ name, brand, kind: brand ? 'branded' : 'generic' }) as any;

test('a plain food needs a generic first result with the words and without the traps', () => {
  const c = { q: 'red bell pepper', words: ['pepper', 'red'], not: ['pasta'] };
  assert.ok(passes(c, food('Peppers, sweet, red, raw')));
  assert.ok(!passes(c, food('Red Bell Pepper', 'Acme'))); // a plain search wants the plain food
  assert.ok(!passes(c, food('Peppers, red, with pasta')));
  assert.ok(!passes(c, food('Peppers, green, raw')));
  assert.ok(!passes(c, undefined));
});

test('a brand search needs that brand first', () => {
  const c = { q: 'acme vanilla yogurt', words: ['vanilla'], not: ['drink'], brands: ['acme', 'other co'] };
  assert.ok(passes(c, food('Yogurt, Vanilla', 'ACME Foods')));
  assert.ok(passes(c, food('Vanilla Yogurt', 'Other Co')));
  assert.ok(!passes(c, food('Vanilla Yogurt', 'Zeta')));
  assert.ok(!passes(c, food('Vanilla Yogurt Drink', 'Acme')));
});

test('the cases are split in two halves, one for tuning and one kept aside', () => {
  const [tune, held] = split(cases);
  assert.ok(cases.length >= 70);
  assert.equal(tune.length + held.length, cases.length);
  assert.ok(Math.abs(tune.length - held.length) <= 1);
  assert.ok(held.some((c) => c.brands) && held.some((c) => !c.brands));
  assert.equal(new Set(cases.map((c) => c.q)).size, cases.length);
});
