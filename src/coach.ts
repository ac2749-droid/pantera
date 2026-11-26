/**
 * Adaptive calorie target ("smart target").
 *
 * Energy balance: if you ate X kcal a day and your weight trend moved Y kg a day, your real
 * daily burn is about X − Y × 7,700 (≈ kcal in 1 kg of body weight). Day-to-day scale noise
 * (water, salt, timing) is smoothed with a least-squares trend line over the last 4 weeks.
 * The data-based estimate is blended with the Mifflin–St Jeor formula: with little data the
 * formula dominates, with 3+ weeks of steady logging the data does. Suggested changes are
 * capped at ±250 kcal per check-in so the target moves smoothly.
 */
import { bmr, dailyTarget, Sex } from './calc';
import type { Entry } from './foods';
import { addDays, parseYmd } from './util';

export const KCAL_PER_KG = 7700;
const WINDOW = 28;
const MAX_STEP = 250;

export type CoachInput = {
  days: Record<string, Entry[]>;
  weights: { date: string; kg: number }[];
  today: string;
  targetKcal: number;
  calc: { sex: Sex; age: number; height: number; weight: number; activity: number; goal: number } | null;
  showWeight?: (kg: number) => string; // for messages, in the user's units
};

export type CoachResult =
  | { status: 'need-data'; loggedDays: number; weighIns: number; needDays: number; needWeighIns: number; message: string }
  | {
      status: 'ready';
      avgIntake: number;
      loggedDays: number;
      weighIns: number;
      trendKgPerWeek: number;
      dataTdee: number;
      formulaTdee: number;
      tdee: number; // blended estimate of daily burn
      confidence: number; // 0..1, how much the data is trusted
      goal: number; // planned daily deficit (−) or surplus (+)
      suggested: number; // suggested daily target
      change: number; // suggested − current target
      expectedKgPerWeek: number; // what the goal should produce
      message: string;
    };

const dayNum = (d: string) => Math.round(parseYmd(d).getTime() / 86400000);

/** Least-squares slope of weight (kg) per day. */
export function trendSlope(points: { date: string; kg: number }[]): number {
  if (points.length < 2) return 0;
  const xs = points.map((p) => dayNum(p.date));
  const ys = points.map((p) => p.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => {
    num += (x - mx) * (ys[i] - my);
    den += (x - mx) ** 2;
  });
  return den ? num / den : 0;
}

export function coach(input: CoachInput): CoachResult {
  const { days, weights, today, targetKcal, calc } = input;
  const showW = input.showWeight ?? ((kg: number) => `${kg.toFixed(2)} kg`);
  const end = addDays(today, -1); // today isn't finished yet
  const start = addDays(end, -(WINDOW - 1));
  const dates = Array.from({ length: WINDOW }, (_, i) => addDays(start, i));

  // A day counts if it looks fully logged (at least half the target; skips forgotten days)
  const intakes = dates
    .map((d) => (days[d] ?? []).filter((e) => !e.sample).reduce((a, e) => a + (e.n.kcal || 0), 0))
    .filter((k) => k >= Math.max(800, targetKcal * 0.5));
  const ws = weights.filter((w) => w.date >= start && w.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const span = ws.length ? dayNum(ws[ws.length - 1].date) - dayNum(ws[0].date) : 0;

  const needDays = Math.max(0, 10 - intakes.length);
  const needWeighIns = Math.max(0, 4 - ws.length);
  if (needDays > 0 || needWeighIns > 0 || span < 10 || !calc) {
    const parts: string[] = [];
    if (needDays > 0) parts.push(`${needDays} more fully logged day${needDays === 1 ? '' : 's'}`);
    if (needWeighIns > 0) parts.push(`${needWeighIns} more weigh-in${needWeighIns === 1 ? '' : 's'}`);
    if (!needWeighIns && span < 10) parts.push('weigh-ins spread over at least 10 days');
    if (!calc) parts.push('your plan from Settings → Update my plan');
    return {
      status: 'need-data',
      loggedDays: intakes.length,
      weighIns: ws.length,
      needDays,
      needWeighIns,
      message: `Your smart target unlocks after ${parts.join(' and ')}. Keep logging and weighing in a few times a week.`,
    };
  }

  const avgIntake = intakes.reduce((a, b) => a + b, 0) / intakes.length;
  const slope = trendSlope(ws); // kg per day
  const latestKg = ws[ws.length - 1].kg;
  const formulaTdee = bmr(calc.sex, calc.age, calc.height, latestKg) * calc.activity;
  let dataTdee = avgIntake - slope * KCAL_PER_KG;
  dataTdee = Math.min(Math.max(dataTdee, formulaTdee * 0.6), formulaTdee * 1.5); // ignore impossible values

  const confidence = Math.min(1, intakes.length / 21) * Math.min(1, ws.length / 8) * Math.min(1, span / 21);
  const tdee = confidence * dataTdee + (1 - confidence) * formulaTdee;
  const ideal = dailyTarget(tdee, calc.goal, calc.sex);
  const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, ideal - targetKcal));
  const suggested = Math.round((targetKcal + step) / 10) * 10;
  const change = suggested - targetKcal;
  const trendKgPerWeek = slope * 7;
  const expectedKgPerWeek = (calc.goal * 7) / KCAL_PER_KG;

  const dir = (kg: number) => (Math.abs(kg) < 0.05 ? 'holding steady' : kg < 0 ? `losing ${showW(Math.abs(kg))} a week` : `gaining ${showW(kg)} a week`);
  let message: string;
  if (Math.abs(change) < 50) message = `You’re ${dir(trendKgPerWeek)}, in line with your plan. Your target is right where it should be.`;
  else if (change < 0) message = `You’re ${dir(trendKgPerWeek)} on about ${Math.round(avgIntake).toLocaleString()} kcal a day, so your body burns a bit less than estimated. Lowering your target by ${Math.abs(change)} kcal keeps you on track.`;
  else message = `You’re ${dir(trendKgPerWeek)} on about ${Math.round(avgIntake).toLocaleString()} kcal a day, so you burn more than estimated. You can eat ${change} kcal more and still reach your goal.`;

  return { status: 'ready', avgIntake, loggedDays: intakes.length, weighIns: ws.length, trendKgPerWeek, dataTdee, formulaTdee, tdee, confidence, goal: calc.goal, suggested, change, expectedKgPerWeek, message };
}

/** New macro targets for a new calorie target: protein grams stay, carbs and fat keep their ratio. */
export function rescaleMacros(t: { kcal: number; p: number; c: number; f: number }, kcal: number) {
  const pK = t.p * 4;
  const restOld = Math.max(1, t.kcal - pK);
  const restNew = Math.max(0, kcal - pK);
  const k = restNew / restOld;
  return { kcal, p: t.p, c: Math.round(t.c * k), f: Math.round(t.f * k) };
}
