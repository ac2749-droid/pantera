import assert from 'node:assert/strict';
import test from 'node:test';

import { burnedOn, caloriesBurned } from '../../src/exercise';
import { clockText, copiedTime, entryMinutes, stepTime } from '../../src/mealTime';
import { MILESTONES, newMilestone, streakStats } from '../../src/streak';
import { carbsShown, dailyValue, dayBudget, shiftDayTargets, targetsFor } from '../../src/targets';

const usual = { kcal: 2000, p: 150, c: 200, f: 67 };
const training = { kcal: 2500, p: 170, c: 300, f: 70 };
const profile = { targets: usual, dayTargets: { '1': training, '4': training } }; // Monday, Thursday

test('a weekday with its own targets uses them; the others use the usual ones', () => {
  assert.deepEqual(targetsFor(profile, '2026-11-23'), training); // Monday
  assert.deepEqual(targetsFor(profile, '2026-11-25'), usual); // Wednesday
  assert.deepEqual(targetsFor({ targets: usual }, '2026-11-23'), usual);
});

test('exercise adds calories to the day only when you ask for it', () => {
  assert.equal(dayBudget({ ...profile, exerciseAddsCalories: false }, '2026-11-25', 300).kcal, 2000);
  assert.deepEqual(dayBudget({ ...profile, exerciseAddsCalories: true }, '2026-11-25', 300), { ...usual, kcal: 2300 });
  assert.equal(dayBudget({ ...profile, exerciseAddsCalories: true }, '2026-11-23', 100).kcal, 2600);
});

test('when the usual target moves, special days move with it', () => {
  const moved = shiftDayTargets(profile.dayTargets, 2000, 1800);
  assert.equal(moved?.['1']?.kcal, 2300);
  assert.equal(moved?.['1']?.p, 170); // protein stays
  assert.ok(moved!['1']!.c < 300 && moved!['1']!.f < 70);
  assert.equal(shiftDayTargets(undefined, 2000, 1800), undefined);
});

test('net carbs leave fiber out and never go below zero', () => {
  assert.equal(carbsShown({ c: 40, fib: 12 }, false), 40);
  assert.equal(carbsShown({ c: 40, fib: 12 }, true), 28);
  assert.equal(carbsShown({ c: 3, fib: 8 }, true), 0);
});

test('your own nutrient target replaces the daily value', () => {
  assert.equal(dailyValue({ nutrientTargets: { fe: 27 } }, 'fe', 18), 27);
  assert.equal(dailyValue({ nutrientTargets: { fe: 27 } }, 'ca', 1300), 1300);
  assert.equal(dailyValue({ nutrientTargets: { fe: 0 } }, 'fe', 18), 18);
  assert.equal(dailyValue({}, 'fe', 18), 18);
});

const logged = (...dates: string[]) => Object.fromEntries(dates.map((d) => [d, [{}]]));

test('a streak counts days in a row and survives until today is over', () => {
  const days = logged('2026-11-22', '2026-11-23', '2026-11-24');
  assert.deepEqual([streakStats(days, '2026-11-24').current, streakStats(days, '2026-11-24').loggedToday], [3, true]);
  assert.deepEqual([streakStats(days, '2026-11-25').current, streakStats(days, '2026-11-25').loggedToday], [3, false]);
  assert.equal(streakStats(days, '2026-11-26').current, 0);
});

test('best streak and total ignore sample, empty and planned days', () => {
  const days = { ...logged('2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-10', '2026-11-28'), '2026-11-09': [], '2026-11-11': [{ sample: true }] };
  const s = streakStats(days, '2026-11-25');
  assert.deepEqual([s.current, s.best, s.total], [0, 4, 5]);
  assert.deepEqual(s.reached, [3]);
  assert.equal(s.next, MILESTONES[0]);
});

test('a streak crosses months and daylight saving changes', () => {
  assert.equal(streakStats(logged('2026-10-31', '2026-11-01', '2026-11-02'), '2026-11-02').current, 3);
});

test('a milestone is celebrated once', () => {
  const s = streakStats(logged('2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25'), '2026-11-25');
  assert.equal(newMilestone(s, 0), 7);
  assert.equal(newMilestone(s, 3), 7);
  assert.equal(newMilestone(s, 7), null);
  assert.equal(s.next, 14);
});

test('exercise calories are those beyond resting', () => {
  assert.equal(caloriesBurned(9.8, 80, 30), 352);
  assert.equal(caloriesBurned(1, 80, 60), 0);
  assert.equal(caloriesBurned(5, 0, 30), 0);
  assert.equal(burnedOn([{ id: 'a', name: 'Run', minutes: 30, kcal: 300, t: 1 }, { id: 'b', name: 'Walk', minutes: 20, kcal: 50, t: 2 }]), 350);
  assert.equal(burnedOn(undefined), 0);
});

test('a meal’s time is the one you set, or when you logged it that day', () => {
  const at = new Date(2026, 10, 25, 8, 42).getTime();
  assert.equal(entryMinutes({ t: at }, '2026-11-25'), 8 * 60 + 42);
  assert.equal(entryMinutes({ t: at }, '2026-11-24'), null); // logged on another day
  assert.equal(entryMinutes({ t: 0 }, '2026-11-25'), null);
  assert.equal(entryMinutes({ t: at, at: 13 * 60 }, '2026-11-24'), 780);
  assert.equal(clockText(0), '12:00 AM');
  assert.equal(clockText(780), '1:00 PM');
  assert.equal(clockText(8 * 60 + 5), '8:05 AM');
  assert.equal(stepTime(8 * 60 + 42, 1), 8 * 60 + 45);
  assert.equal(stepTime(8 * 60 + 45, -1), 8 * 60 + 30);
  assert.equal(stepTime(0, -1), 23 * 60 + 45);
});

test('after a broken streak the milestones are celebrated again', () => {
  const s = streakStats(logged('2026-11-23', '2026-11-24', '2026-11-25'), '2026-11-25');
  assert.equal(newMilestone(s, 30), 3);
});

test('a copied entry keeps its time, or shows none', () => {
  const logged = new Date(2026, 10, 24, 8, 42).getTime();
  assert.equal(copiedTime({ t: logged }, '2026-11-24'), 8 * 60 + 42);
  assert.equal(copiedTime({ t: logged }, '2026-11-20'), -1);
  assert.equal(entryMinutes({ t: Date.now(), at: -1 }, '2026-11-25'), null);
});
