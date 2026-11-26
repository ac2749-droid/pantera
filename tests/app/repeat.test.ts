import assert from 'node:assert/strict';
import test from 'node:test';

import { addingDay, repeatDates } from '../../src/repeat';

test('from today: the next seven days', () => {
  const days = repeatDates('2026-11-25', '2026-11-25');
  assert.equal(days.length, 7);
  assert.deepEqual([days[0], days[6]], ['2026-11-26', '2026-12-02']);
});

test('from an earlier day: today onwards', () => {
  assert.deepEqual(repeatDates('2026-11-20', '2026-11-25').slice(0, 2), ['2026-11-25', '2026-11-26']);
  assert.equal(repeatDates('2026-11-24', '2026-11-25')[0], '2026-11-25');
});

test('never further ahead than a week, nor the day itself', () => {
  assert.deepEqual(repeatDates('2026-11-30', '2026-11-25'), ['2026-12-01', '2026-12-02']);
  assert.deepEqual(repeatDates('2026-12-02', '2026-11-25'), []);
});

test('adding from far ahead goes on today', () => {
  assert.equal(addingDay('2026-12-02', '2026-11-25'), '2026-12-02');
  assert.equal(addingDay('2026-12-03', '2026-11-25'), '2026-11-25');
  assert.equal(addingDay('2026-11-01', '2026-11-25'), '2026-11-01');
});
