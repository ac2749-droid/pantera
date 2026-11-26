import assert from 'node:assert/strict';
import { amountLabel } from '../../src/components/helpers';
import test from 'node:test';

import { amount, rowBadge } from '../../src/foodIndex/labels';
import type { Food } from '../../src/foods';

test('a missing figure is a dash, not zero', () => {
  assert.equal(amount(0, 'p'), '0');
  assert.equal(amount(0, 'p', ['p']), '–');
  assert.equal(amount(15.4, 'p', ['c']), '15');
});

test('doubtful foods are marked; foods from the index need no other badge', () => {
  assert.equal(rowBadge({ id: 'x:off_1', src: 'online', flagged: true } as Food), 'CHECK');
  assert.equal(rowBadge({ id: 'x:off_1', src: 'online' } as Food), undefined);
  assert.equal(rowBadge({ id: 'x:off_1', src: 'custom', barcode: '1' } as Food), 'SCANNED');
  assert.equal(rowBadge({ id: 'c1', src: 'online' } as Food), 'ONLINE');
  assert.equal(rowBadge({ id: 'c1', src: 'custom' } as Food), 'MINE');
  assert.equal(rowBadge({ id: 'c1', src: 'custom', recipe: {} } as unknown as Food), 'RECIPE');
});

test('a serving that already states its weight is not followed by it again', () => {
  assert.equal(amountLabel({ grams: 113, sg: 113, serving: '0.5 cup (113 g)' }), '0.5 cup (113 g)');
  assert.equal(amountLabel({ grams: 226, sg: 113, serving: '0.5 cup (113 g)' }), '2 × 0.5 cup (113 g) · 226 g');
  assert.equal(amountLabel({ grams: 50, sg: 50, serving: '1 large egg' }), '1 large egg (50 g)');
  assert.equal(amountLabel({ grams: 100, sg: 50, serving: '1 large egg' }), '2 × 1 large egg (100 g)');
});
