import { emptyNutrients } from '../src/foods';
import { DEFAULT_REMINDERS, planNotifications, withDefaults } from '../src/reminders';
let fails = 0;
const ok = (l: string, c: boolean, x = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', l, x); };
const r = withDefaults({ meals: { breakfast: { on: true, time: '09:00' }, lunch: { on: true, time: '13:00' }, dinner: { on: true, time: '19:30' } }, water: { on: true, from: '10:00', to: '20:00', every: 2 }, weigh: { on: true, time: '07:30', weekly: true }, weekly: { on: true } });
// Thursday Oct 1 2026, 12:00
const now = new Date(2026, 9, 1, 12, 0);
const e = (meal: string, kcal: number) => ({ id: meal, name: 'x', serving: '1', sg: 1, grams: 1, meal: meal as any, n: { ...emptyNutrients(), kcal }, t: 0 });
const base = { now, days: {}, water: {}, waterGoalMl: 1893, glassMl: 236.6, weights: [], kcalTarget: 2300 };
let plan = planNotifications(r, base);
const today = plan.filter((p) => p.id.includes('2026-10-01'));
ok('no reminders in the past today', today.every((p) => p.date > now));
ok('lunch and dinner today (breakfast time passed)', today.some((p) => p.id.includes('lunch')) && today.some((p) => p.id.includes('dinner')) && !today.some((p) => p.id.includes('breakfast')));
ok('water today 14,16,18,20', today.filter((p) => p.data.kind === 'water').length === 4, String(today.filter((p) => p.data.kind === 'water').length));
ok('7 days planned', new Set(plan.map((p) => p.id.match(/\d{4}-\d{2}-\d{2}/)![0])).size === 7);
ok('weekly weigh-in only Monday', plan.filter((p) => p.data.kind === 'weigh').every((p) => p.date.getDay() === 1) && plan.some((p) => p.data.kind === 'weigh'));
ok('weekly report Monday 9:00', plan.filter((p) => p.data.kind === 'weekly').length === 1 && plan.find((p) => p.data.kind === 'weekly')!.date.getHours() === 9);
ok('sorted by time', plan.every((p, i) => i === 0 || +plan[i - 1].date <= +p.date));
// Lunch already logged -> skip today's lunch, dinner shows kcal left
plan = planNotifications(r, { ...base, days: { '2026-10-01': [e('breakfast', 500), e('lunch', 700)] } });
ok('logged lunch skipped today', !plan.some((p) => p.id === 'pantera-meal-lunch-2026-10-01'));
ok('dinner shows kcal left', plan.find((p) => p.id === 'pantera-meal-dinner-2026-10-01')!.body.includes('1,100 kcal left'));
ok('tomorrow lunch still planned', plan.some((p) => p.id === 'pantera-meal-lunch-2026-10-02'));
// Water goal met -> no more water today
plan = planNotifications(r, { ...base, water: { '2026-10-01': 2000 } });
ok('water stops when goal met', !plan.some((p) => p.data.kind === 'water' && p.id.includes('2026-10-01')) && plan.some((p) => p.data.kind === 'water' && p.id.includes('2026-10-02')));
plan = planNotifications(r, { ...base, water: { '2026-10-01': 710 } });
ok('water body shows progress', plan.find((p) => p.data.kind === 'water')!.body.includes('3 of 8'));
ok('all off -> nothing', planNotifications(DEFAULT_REMINDERS, base).length === 0);
ok('fits Android limit', planNotifications(r, base).length < 100, String(planNotifications(r, base).length));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
