import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPersonalIndex } from '../../src/foodSearch';
import { bestGuess } from '../../src/meal/guess';
import { speechHints } from '../../src/voiceHints';

const personal = buildPersonalIndex([], [], 'all', []);

test('a guess that reads as real foods wins over one that does not', () => {
  assert.equal(bestGuess(['a whole wheat pizza bread', 'a whole wheat pita bread'], personal), 'a whole wheat pita bread');
});

test('the first guess stays when it reads well, or when others read as less', () => {
  assert.equal(bestGuess(['a slice of pizza', 'a slice of pita'], personal), 'a slice of pizza');
  assert.equal(bestGuess(['2 eggs and a zorblat', '2 eggs'], personal), '2 eggs and a zorblat');
  assert.equal(bestGuess(['only one guess'], personal), 'only one guess');
  assert.equal(bestGuess([], personal), '');
});

test('the recognizer is told about your foods first, then common ones, without repeats', () => {
  const hints = speechHints(['Labneh, Karoun', 'Pita bread', 'A very long product name with many words in it indeed', 'Pita bread']);
  assert.deepEqual(hints.slice(0, 2), ['Labneh', 'Pita bread']);
  assert.ok(hints.includes('hummus') && hints.includes('fried eggs'));
  assert.equal(new Set(hints.map((h) => h.toLowerCase())).size, hints.length);
  assert.ok(hints.length <= 100);
});
