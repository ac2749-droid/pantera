import { coach, KCAL_PER_KG, rescaleMacros, trendSlope } from '../src/coach';
import { emptyNutrients } from '../src/foods';
import { addDays } from '../src/util';
let fails = 0;
const ok = (l: string, c: boolean, x = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', l, x); };
const today = '2026-10-01';
const calc = { sex: 'male' as const, age: 28, height: 178, weight: 84, activity: 1.55, goal: -500 };
// Simulate someone whose true burn is 2,700 kcal eating 2,200 a day: loses 500*7/7700 ≈ 0.45 kg/week
function scenario(trueBurn: number, intake: number, days = 28, weighEvery = 2, noise = 0.3, logEvery = 1) {
  const dd: Record<string, any[]> = {};
  const ws: { date: string; kg: number }[] = [];
  let kg = 84;
  let seed = 1;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280 - 0.5) * 2;
  for (let i = days; i >= 1; i--) {
    const d = addDays(today, -i);
    kg += (intake - trueBurn) / KCAL_PER_KG;
    if (i % logEvery === 0) dd[d] = [{ id: d, name: 'x', serving: '1', sg: 1, grams: 1, meal: 'lunch', t: 0, n: { ...emptyNutrients(), kcal: intake } }];
    if (i % weighEvery === 0) ws.push({ date: d, kg: Math.round((kg + rnd() * noise) * 10) / 10 });
  }
  return { days: dd, weights: ws };
}
ok('slope of a straight line', Math.abs(trendSlope([{ date: '2026-09-01', kg: 80 }, { date: '2026-09-11', kg: 79 }]) + 0.1) < 1e-9);
// Not enough data
let r = coach({ ...scenario(2700, 2200, 5), today, targetKcal: 2200, calc });
ok('needs data with 5 days', r.status === 'need-data' && /more fully logged day/.test(r.message), r.message);
// Burn higher than the formula thinks (formula ≈ 2,800 for this person? check) -> estimate tracks truth
r = coach({ ...scenario(3100, 2200), today, targetKcal: 2200, calc });
ok('ready with 4 weeks', r.status === 'ready');
if (r.status === 'ready') {
  console.log('   formula', Math.round(r.formulaTdee), 'data', Math.round(r.dataTdee), 'blend', Math.round(r.tdee), 'conf', r.confidence.toFixed(2), 'trend/wk', r.trendKgPerWeek.toFixed(2), 'suggest', r.suggested, r.change);
  ok('data estimate close to true burn (±150)', Math.abs(r.dataTdee - 3100) < 150, String(Math.round(r.dataTdee)));
  ok('suggests eating more, capped at +250', r.change === 250);
}
// Burn lower than formula -> suggests less
r = coach({ ...scenario(2300, 2200), today, targetKcal: 2200, calc });
if (r.status === 'ready') {
  console.log('   formula', Math.round(r.formulaTdee), 'data', Math.round(r.dataTdee), 'suggest', r.suggested, r.change);
  ok('suggests eating less when losing slower than planned', r.change < 0 && r.change >= -250);
  ok('message explains the change', /Lowering your target/.test(r.message));
}
// On track -> no change
const onTrack = scenario(2700, 2200);
r = coach({ ...onTrack, today, targetKcal: 2200, calc: { ...calc, activity: 2700 / (10 * 84 + 6.25 * 178 - 5 * 28 + 5) } });
if (r.status === 'ready') ok('on track: change under 50 kcal', Math.abs(r.change) < 50, `${r.change} ${r.message}`);
// Sparse logging days are skipped, not counted as starving
const sparse = scenario(2700, 2200, 28, 2, 0.3, 2);
r = coach({ ...sparse, today, targetKcal: 2200, calc });
ok('logs every other day still works (14 days)', r.status === 'ready' && Math.abs((r as any).avgIntake - 2200) < 1);
ok('rescale keeps protein, scales carbs/fat', JSON.stringify(rescaleMacros({ kcal: 2200, p: 160, c: 220, f: 76 }, 1960)) === JSON.stringify({ kcal: 1960, p: 160, c: 186, f: 64 }), JSON.stringify(rescaleMacros({ kcal: 2200, p: 160, c: 220, f: 76 }, 1960)));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
