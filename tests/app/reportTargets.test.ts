import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyNutrients, Entry } from '../../src/foods';
import { buildWeek } from '../../src/report';
import { buildWidgetData } from '../../src/widget/data';

const entry = (kcal: number, p = 0, c = 0, fib = 0): Entry => ({
  id: String(Math.random()), name: 'Food', serving: '1', sg: 1, grams: 1, meal: 'lunch', t: 1, n: { ...emptyNutrients(), kcal, p, c, fib, fe: 9 },
});
const usual = { kcal: 2000, p: 150, c: 200, f: 67 };
const big = { kcal: 3000, p: 200, c: 300, f: 90 };
const input = {
  days: { '2026-11-23': [entry(3000, 195)], '2026-11-24': [entry(2000, 150)] },
  weights: [], water: {}, targets: usual, waterGoalMl: 2000,
};

test('each day of the week is judged by its own target', () => {
  const week = buildWeek({ ...input, dayTargets: { '1': big } }, '2026-11-23', '2026-11-25');
  assert.deepEqual([week.onTarget, week.proteinDays], [2, 2]);
  assert.deepEqual(week.daily.slice(0, 2).map((d) => d.target), [3000, 2000]);
  assert.deepEqual([week.target.kcal, week.target.p], [2500, 175]); // average over the logged days
  assert.equal(buildWeek(input, '2026-11-23', '2026-11-25').onTarget, 1);
});

test('your own nutrient targets are used in the report', () => {
  const iron = (targets?: object) => buildWeek({ ...input, nutrientTargets: targets }, '2026-11-23', '2026-11-25').nutrients.find((n) => n.k === 'fe')!;
  assert.deepEqual([iron({ fe: 9 }).dv, iron({ fe: 9 }).status], [9, 'ok']);
  assert.deepEqual([iron().dv, iron().status], [18, 'low']);
});

test('the widget shows the day’s target and net carbs when chosen', () => {
  const base = { entries: [entry(500, 10, 60, 15)], targets: usual, waterMl: 0, waterGoalMl: 2000, units: 'us' as const };
  assert.equal(buildWidgetData(base).c, 60);
  assert.equal(buildWidgetData({ ...base, netCarbs: true }).c, 45);
});

test('exercise counts toward the day’s budget in the report when you chose that', () => {
  const days = { '2026-11-23': [entry(2400, 150)] };
  const exercise = { '2026-11-23': [{ id: 'x', name: 'Run', minutes: 40, kcal: 400, t: 1 }] };
  const report = (adds: boolean) => buildWeek({ ...input, days, exercise, exerciseAddsCalories: adds }, '2026-11-23', '2026-11-25');
  assert.deepEqual([report(true).daily[0].target, report(true).onTarget], [2400, 1]);
  assert.deepEqual([report(false).daily[0].target, report(false).onTarget], [2000, 0]);
});
