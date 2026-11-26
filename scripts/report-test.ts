import { emptyNutrients } from '../src/foods';
import { buildWeek, insights, weekStart } from '../src/report';
let fails = 0;
const ok = (l: string, c: boolean, x = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', l, x); };
ok('week starts Monday', weekStart('2026-10-01') === '2026-09-28' && weekStart('2026-09-28') === '2026-09-28' && weekStart('2026-10-04') === '2026-09-28');
const e = (name: string, kcal: number, p: number, extra: Partial<Record<string, number>> = {}) => ({ id: name + Math.random(), name, serving: '1', sg: 1, grams: 1, meal: 'lunch' as const, t: 0, n: { ...emptyNutrients(), kcal, p, c: (kcal * 0.4) / 4, f: (kcal * 0.3) / 9, ...extra } });
const days: Record<string, any[]> = {};
['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].forEach((d, i) => (days[d] = [e('Chicken breast', 800, 70, { na: 1500, fib: 8 }), e('Rice', 1200 + i * 50, 20, { na: 800, fib: 4 })]));
days['2026-09-27'] = [e('Pizza', 3000, 90)]; // previous Sunday, not in week
days['2026-10-03'] = [{ ...e('Sample', 500, 10), sample: true }]; // samples ignored
const input = { days, weights: [{ date: '2026-09-26', kg: 84 }, { date: '2026-10-02', kg: 83.2 }], water: { '2026-09-28': 2000, '2026-09-29': 1000 }, targets: { kcal: 2100, p: 150, c: 200, f: 70 }, waterGoalMl: 1893 };
const r = buildWeek(input, '2026-09-28', '2026-10-10');
ok('logged 5 days (sample day ignored)', r.logged === 5);
ok('avg kcal over logged days', Math.round(r.avg.kcal) === 2100, String(r.avg.kcal));
ok('on target days', r.onTarget === 5);
ok('protein days (90 g < 135)', r.proteinDays === 0 && Math.round(r.avg.p) === 90);
ok('macro split sums ~100', Math.abs(r.split.p + r.split.c + r.split.f - 100) <= 1, JSON.stringify(r.split));
ok('weight change from last weigh-in before week', Math.round((r.weight.change ?? 0) * 10) / 10 === -0.8);
ok('water goal days', r.water.goalDays === 1 && r.water.daysTracked === 2);
ok('sodium high flagged', r.nutrients.find((x) => x.k === 'na')!.status === 'ok' && r.nutrients.find((x) => x.k === 'fib')!.status === 'low');
ok('top food is Rice', r.topFoods[0].name === 'Rice' && r.topFoods[0].times === 5);
const prev = buildWeek(input, '2026-09-21');
ok('previous week has the Sunday pizza', prev.logged === 1 && prev.avg.kcal === 3000);
const ins = insights(r, input.targets, { goal: -500, showWeight: (kg) => `${(kg / 0.4536).toFixed(1)} lb`, prev });
ins.forEach((i) => console.log('   ', i.kind.toUpperCase(), i.text, i.tip ? `(${i.tip})` : ''));
ok('weight loss is a win when goal is lose', ins.some((i) => i.kind === 'win' && i.text.startsWith('Weight down 1.8 lb')));
ok('protein focus with tip', ins.some((i) => i.kind === 'focus' && i.text.startsWith('Protein') && !!i.tip));
ok('empty week -> no insights', insights(buildWeek(input, '2026-10-12'), input.targets, { goal: 0, showWeight: String }).length === 0);
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
