/**
 * Smart reminders. Instead of fixed repeating alarms, Pantera plans the next 7 days of one-off
 * notifications and re-plans whenever you log something, so it can skip a lunch reminder once
 * lunch is logged, stop water reminders when you hit your goal, and show today's real numbers.
 */
import type { Entry, MealKey } from './foods';
import { addDays, ymd } from './util';

export type TimeStr = string; // "HH:MM", 24-hour
export type ReminderSettings = {
  meals: Record<'breakfast' | 'lunch' | 'dinner', { on: boolean; time: TimeStr }>;
  water: { on: boolean; from: TimeStr; to: TimeStr; every: number }; // every N hours
  weigh: { on: boolean; time: TimeStr; weekly: boolean }; // weekly = Mondays only
  weekly: { on: boolean };
};

export const DEFAULT_REMINDERS: ReminderSettings = {
  meals: { breakfast: { on: false, time: '09:00' }, lunch: { on: false, time: '13:00' }, dinner: { on: false, time: '19:30' } },
  water: { on: false, from: '10:00', to: '20:00', every: 2 },
  weigh: { on: false, time: '07:30', weekly: false },
  weekly: { on: false },
};

/** The settings with any missing pieces filled in (older saved profiles). */
export function withDefaults(r?: Partial<ReminderSettings>): ReminderSettings {
  const d = DEFAULT_REMINDERS;
  return {
    meals: { breakfast: { ...d.meals.breakfast, ...r?.meals?.breakfast }, lunch: { ...d.meals.lunch, ...r?.meals?.lunch }, dinner: { ...d.meals.dinner, ...r?.meals?.dinner } },
    water: { ...d.water, ...r?.water },
    weigh: { ...d.weigh, ...r?.weigh },
    weekly: { ...d.weekly, ...r?.weekly },
  };
}

export const anyOn = (r: ReminderSettings) => r.meals.breakfast.on || r.meals.lunch.on || r.meals.dinner.on || r.water.on || r.weigh.on || r.weekly.on;

export const toMinutes = (t: TimeStr) => {
  const [h, m] = t.split(':').map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
};
export const fromMinutes = (min: number): TimeStr => {
  const v = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
};
export function showTime(t: TimeStr, h12: boolean) {
  const v = toMinutes(t);
  const h = Math.floor(v / 60), m = v % 60;
  if (!h12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export type PlannedNotification = { id: string; date: Date; title: string; body: string; data: { kind: 'meal' | 'water' | 'weigh' | 'weekly'; meal?: MealKey } };

export type PlanState = {
  now: Date;
  days: Record<string, Entry[]>;
  water: Record<string, number>;
  waterGoalMl: number;
  glassMl: number;
  weights: { date: string }[];
  kcalTarget: number;
};

const at = (dateStr: string, t: TimeStr) => {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const v = toMinutes(t);
  return new Date(y, mo - 1, d, Math.floor(v / 60), v % 60, 0, 0);
};
const MEAL_TEXT: Record<'breakfast' | 'lunch' | 'dinner', [string, string]> = {
  breakfast: ['Log your breakfast', 'What did you have this morning? Tap to add it.'],
  lunch: ['Lunch time', 'Tap to log your lunch. Say it, scan it or search it.'],
  dinner: ['Log your dinner', 'Wrap up today’s diary. Tap to add dinner.'],
};

/** Plan the next 7 days of reminders. Pure function, so it's easy to test. */
export function planNotifications(r: ReminderSettings, s: PlanState, horizonDays = 7): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  const t0 = ymd(s.now);
  const todays = (s.days[t0] ?? []).filter((e) => !e.sample);
  const eaten = todays.reduce((a, e) => a + (e.n.kcal || 0), 0);
  const left = Math.round(s.kcalTarget - eaten);
  const goalGlasses = Math.max(1, Math.round(s.waterGoalMl / s.glassMl));

  for (let i = 0; i < horizonDays; i++) {
    const d = addDays(t0, i);
    const isToday = i === 0;

    // Meals: skipped today if that meal already has food in it
    (['breakfast', 'lunch', 'dinner'] as const).forEach((m) => {
      const cfg = r.meals[m];
      if (!cfg.on) return;
      const when = at(d, cfg.time);
      if (when <= s.now) return;
      if (isToday && todays.some((e) => e.meal === m)) return;
      const [title, body] = MEAL_TEXT[m];
      const extra = isToday && m !== 'breakfast' && todays.length ? (left >= 0 ? ` ${left.toLocaleString()} kcal left today.` : ` You’re ${(-left).toLocaleString()} kcal over today.`) : '';
      out.push({ id: `pantera-meal-${m}-${d}`, date: when, title, body: body + extra, data: { kind: 'meal', meal: m } });
    });

    // Water: every N hours between from and to; stops for the day once the goal is reached
    if (r.water.on) {
      const ml = s.water[d] ?? 0;
      const done = isToday && ml >= s.waterGoalMl;
      if (!done) {
        const step = Math.max(30, Math.round(r.water.every * 60));
        const glasses = Math.round(ml / s.glassMl);
        for (let mnt = toMinutes(r.water.from); mnt <= toMinutes(r.water.to); mnt += step) {
          const when = at(d, fromMinutes(mnt));
          if (when <= s.now) continue;
          out.push({
            id: `pantera-water-${d}-${fromMinutes(mnt)}`,
            date: when,
            title: 'Time for some water 💧',
            body: isToday ? `You’re at ${glasses} of ${goalGlasses} glasses today. Tap to add one.` : `Goal: ${goalGlasses} glasses today. Tap to add one.`,
            data: { kind: 'water' },
          });
        }
      }
    }

    // Weigh-in: daily or Mondays; skipped if already weighed that day
    if (r.weigh.on) {
      const monday = at(d, '12:00').getDay() === 1;
      const when = at(d, r.weigh.time);
      const weighed = s.weights.some((w) => w.date === d);
      if ((!r.weigh.weekly || monday) && when > s.now && !weighed) {
        out.push({ id: `pantera-weigh-${d}`, date: when, title: 'Morning weigh-in', body: 'Step on the scale before breakfast for the most reliable trend. Tap to log it.', data: { kind: 'weigh' } });
      }
    }

    // Weekly report: Monday 9:00
    if (r.weekly.on && at(d, '12:00').getDay() === 1) {
      const when = at(d, '09:00');
      if (when > s.now) out.push({ id: `pantera-weekly-${d}`, date: when, title: 'Your weekly report is ready', body: 'See how last week went: calories, protein, weight and the nutrients you were low on.', data: { kind: 'weekly' } });
    }
  }
  return out.sort((a, b) => +a.date - +b.date);
}

