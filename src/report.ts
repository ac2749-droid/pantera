/** Weekly report numbers (Monday–Sunday). Pure functions so they can be tested. */
import { emptyNutrients, Entry, microCoverage, NK, NutrientKey, Nutrients, NUTRIENTS, sum } from './foods';
import { addDays, parseYmd, ymd } from './util';
import { burnedOn, Exercise } from './exercise';
import { dailyValue, dayBudget } from './targets';

export type Targets = { kcal: number; p: number; c: number; f: number };
export type ReportInput = {
  days: Record<string, Entry[]>;
  weights: { date: string; kg: number }[];
  water: Record<string, number>;
  targets: Targets;
  dayTargets?: Partial<Record<string, Targets>>; // weekdays with their own targets
  nutrientTargets?: Partial<Record<NutrientKey, number>>;
  exercise?: Record<string, Exercise[]>;
  exerciseAddsCalories?: boolean;
  waterGoalMl: number;
};

/** Monday of the week containing this date (YYYY-MM-DD). */
export function weekStart(date: string): string {
  const d = parseYmd(date);
  const dow = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(date, -dow);
}

export type NutrientStatus = { k: NutrientKey; label: string; unit: 'g' | 'mg' | 'µg'; avg: number; dv: number; pct: number; kind: 'goal' | 'limit'; status: 'low' | 'ok' | 'high'; key: boolean };
export type WeekReport = {
  target: Targets; // average target of the logged days
  start: string;
  end: string;
  daily: { d: string; kcal: number; p: number; target: number; proteinTarget: number; logged: boolean }[];
  logged: number;
  elapsed: number; // days of this week that have started (7 for past weeks)
  avg: { kcal: number; p: number; c: number; f: number };
  onTarget: number; // days within 10% of the calorie target
  proteinDays: number; // days at 90%+ of the protein target
  split: { p: number; c: number; f: number }; // % of calories
  water: { avgMl: number; goalDays: number; daysTracked: number };
  weight: { start?: number; end?: number; change?: number };
  nutrients: NutrientStatus[];
  avgN: Nutrients; // every nutrient, daily average over logged days
  coverage: number; // share of calories with vitamins and minerals known
  topFoods: { name: string; kcal: number; times: number }[];
};

const realEntries = (l: Entry[] | undefined) => (l ?? []).filter((e) => !e.sample);

export function buildWeek(input: ReportInput, start: string, todayStr: string = ymd(new Date())): WeekReport {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const budget = (d: string) => dayBudget(input, d, burnedOn(input.exercise?.[d]));
  const daily = dates.map((d) => {
    const t = sum(d <= todayStr ? realEntries(input.days[d]) : []);
    // Planned (future) days don't count yet
    const goal = budget(d);
    return { d, kcal: t.kcal, p: t.p, target: goal.kcal, proteinTarget: goal.p, logged: d <= todayStr && realEntries(input.days[d]).length > 0 };
  });
  const loggedDates = dates.filter((_, i) => daily[i].logged);
  const n = loggedDates.length || 1;
  const all = loggedDates.flatMap((d) => realEntries(input.days[d]));
  const tot = sum(all);
  const avg = { kcal: tot.kcal / n, p: tot.p / n, c: tot.c / n, f: tot.f / n };
  const kP = avg.p * 4, kC = avg.c * 4, kF = avg.f * 9, kS = kP + kC + kF || 1;

  const nutrients: NutrientStatus[] = NUTRIENTS.filter((m) => m.kind !== 'info').map((m) => {
    const a = tot[m.k] / n;
    const dv = dailyValue(input, m.k, m.dv);
    const pct = a / dv;
    const status = m.kind === 'goal' ? (pct < 0.7 ? 'low' : 'ok') : pct > 1 ? 'high' : 'ok';
    return { k: m.k, label: m.label, unit: m.unit, avg: a, dv, pct, kind: m.kind as 'goal' | 'limit', status, key: !!m.key };
  });
  const avgN = emptyNutrients();
  NK.forEach((k) => (avgN[k] = tot[k] / n));
  const coverage = microCoverage(all);

  // Foods that added the most calories this week
  const byName = new Map<string, { name: string; kcal: number; times: number }>();
  all.forEach((e) => {
    const key = e.name.toLowerCase();
    const cur = byName.get(key) ?? { name: e.name, kcal: 0, times: 0 };
    cur.kcal += e.n.kcal || 0;
    cur.times += 1;
    byName.set(key, cur);
  });
  const topFoods = [...byName.values()].sort((a, b) => b.kcal - a.kcal).slice(0, 5);

  // Weight: last weigh-in before or at the start vs last weigh-in in the week
  const ws = [...input.weights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const inWeek = ws.filter((w) => w.date >= start && w.date <= dates[6]);
  const before = ws.filter((w) => w.date < start).pop();
  const startW = before?.kg ?? inWeek[0]?.kg;
  const endW = inWeek[inWeek.length - 1]?.kg;
  const weight = { start: startW, end: endW, change: startW !== undefined && endW !== undefined && (before || inWeek.length > 1) ? endW - startW : undefined };

  const waterDays = dates.filter((d) => (input.water[d] ?? 0) > 0);
  const water = {
    avgMl: waterDays.length ? waterDays.reduce((a, d) => a + input.water[d], 0) / waterDays.length : 0,
    goalDays: dates.filter((d) => (input.water[d] ?? 0) >= input.waterGoalMl).length,
    daysTracked: waterDays.length,
  };

  // The target to compare the averages with: that of the days actually logged
  const compared = (loggedDates.length ? loggedDates : dates).map(budget);
  const mean = (k: keyof Targets) => Math.round(compared.reduce((a, t) => a + t[k], 0) / compared.length);
  const target: Targets = { kcal: mean('kcal'), p: mean('p'), c: mean('c'), f: mean('f') };

  return {
    start,
    target,
    end: dates[6],
    daily,
    logged: loggedDates.length,
    elapsed: Math.max(1, dates.filter((d) => d <= todayStr).length),
    avg,
    onTarget: daily.filter((x) => x.logged && Math.abs(x.kcal - x.target) <= x.target * 0.1).length,
    proteinDays: daily.filter((x) => x.logged && x.p >= x.proteinTarget * 0.9).length,
    split: { p: Math.round((kP / kS) * 100), c: Math.round((kC / kS) * 100), f: Math.round((kF / kS) * 100) },
    water,
    weight,
    nutrients,
    avgN,
    coverage,
    topFoods,
  };
}

const TIPS: Partial<Record<NutrientKey, string>> = {
  fib: 'Beans, lentils, berries, oats and whole-grain bread are easy fiber wins.',
  k: 'Potatoes, bananas, beans, yogurt and spinach are rich in potassium.',
  ca: 'Milk, yogurt, cheese and calcium-set tofu cover calcium quickly.',
  fe: 'Red meat, lentils, spinach and fortified cereal add iron. Vitamin C with them helps absorption.',
  vc: 'Oranges, strawberries, bell peppers and broccoli are packed with vitamin C.',
  na: 'Restaurant meals, deli meats, soups and snacks are the usual sodium sources.',
  sug: 'Sweet drinks and desserts are the quickest place to cut sugar.',
  sat: 'Fatty meats, butter, cheese and fried foods carry most saturated fat.',
  vd: 'Fatty fish like salmon, eggs and fortified milk help; sunlight counts too.',
  mag: 'Nuts, seeds, beans, whole grains and dark chocolate are good magnesium sources.',
  zn: 'Beef, shellfish, pumpkin seeds and beans add zinc.',
  b12: 'Meat, fish, eggs and dairy provide B12; plant-based eaters may need fortified foods.',
  fol: 'Leafy greens, beans, lentils and fortified grains are rich in folate.',
  va: 'Carrots, sweet potatoes, spinach and eggs boost vitamin A.',
  ve: 'Almonds, sunflower seeds and olive oil are top vitamin E sources.',
  vk: 'Leafy greens like spinach, kale and broccoli are packed with vitamin K.',
  cho: 'Eggs, meat, fish and soybeans are the best choline sources.',
  chol: 'Egg yolks, organ meats and shellfish are the main sources of cholesterol.',
  se: 'Brazil nuts, fish, eggs and whole grains provide selenium.',
};

export type Insight = { kind: 'win' | 'focus'; text: string; tip?: string };

/** Plain-language highlights for the week. */
export function insights(r: WeekReport, t: Targets, opts: { goal: number; showWeight: (kg: number) => string; prev?: WeekReport }): Insight[] {
  const { goal, showWeight, prev } = opts;
  const out: Insight[] = [];
  if (r.logged === 0) return out;
  const fmt = (x: number) => Math.round(x).toLocaleString();
  const of = r.elapsed === 7 ? '7 days' : `${r.elapsed} days so far`;
  if (r.elapsed >= 3 && r.logged >= r.elapsed - (r.elapsed === 7 ? 1 : 0)) out.push({ kind: 'win', text: `You logged ${r.logged} of ${of}. Consistency is what makes the numbers useful.` });
  else if (r.logged <= r.elapsed / 2) out.push({ kind: 'focus', text: `Only ${r.logged} of ${of} logged. Try reminders in Settings so nothing slips.` });
  const diff = r.avg.kcal - t.kcal;
  if (Math.abs(diff) <= t.kcal * 0.1) out.push({ kind: 'win', text: `Calories averaged ${fmt(r.avg.kcal)}, right on your ${fmt(t.kcal)} target.` });
  else out.push({ kind: 'focus', text: `Calories averaged ${fmt(r.avg.kcal)}, ${fmt(Math.abs(diff))} ${diff > 0 ? 'over' : 'under'} your ${fmt(t.kcal)} target.` });
  if (r.proteinDays >= Math.max(4, r.logged - 1)) out.push({ kind: 'win', text: `Protein goal hit on ${r.proteinDays} days (average ${fmt(r.avg.p)} g).` });
  else if (r.avg.p < t.p * 0.8) out.push({ kind: 'focus', text: `Protein averaged ${fmt(r.avg.p)} g of your ${fmt(t.p)} g goal.`, tip: 'Eggs, Greek yogurt, chicken, fish, tofu and protein shakes make it easier.' });
  if (r.weight.change !== undefined && Math.abs(r.weight.change) >= 0.1) {
    const ch = r.weight.change;
    const good = goal < 0 ? ch < 0 : goal > 0 ? ch > 0 : Math.abs(ch) < 0.5;
    out.push({ kind: good ? 'win' : 'focus', text: `Weight ${ch < 0 ? 'down' : 'up'} ${showWeight(Math.abs(ch))} this week${good ? ', in line with your goal' : ''}.` });
  }
  // Vitamins and minerals beyond the key ones are only judged when most foods list them
  r.nutrients
    .filter((x) => x.status !== 'ok' && (x.key || r.coverage >= 0.8))
    .sort((a, b) => (a.status === 'low' ? a.pct : -a.pct) - (b.status === 'low' ? b.pct : -b.pct))
    .slice(0, 3)
    .forEach((x) => out.push({ kind: 'focus', text: `${x.label} ${x.status === 'low' ? 'was low' : 'ran high'}: about ${Math.round(x.pct * 100)}% of the daily ${x.kind === 'limit' ? 'limit' : 'value'}.`, tip: TIPS[x.k] }));
  const goodNut = r.nutrients.filter((x) => x.kind === 'goal' && x.pct >= 1).map((x) => x.label.toLowerCase());
  if (goodNut.length) out.push({ kind: 'win', text: `You met your daily ${goodNut.join(', ')} on average.` });
  if (prev && prev.logged && Math.abs(r.avg.kcal - prev.avg.kcal) > 100) {
    const closer = Math.abs(r.avg.kcal - t.kcal) < Math.abs(prev.avg.kcal - t.kcal);
    out.push({ kind: closer ? 'win' : 'focus', text: `${fmt(Math.abs(r.avg.kcal - prev.avg.kcal))} kcal a day ${r.avg.kcal < prev.avg.kcal ? 'less' : 'more'} than the week before${closer ? ', closer to your target' : ''}.` });
  }
  return out;
}

export const thisWeek = () => weekStart(ymd(new Date()));
