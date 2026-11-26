/** Days in a row with food logged. */

import { addDays } from './util';

export const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365];

export type Streak = {
  current: number; // still alive until the end of today
  best: number;
  total: number; // days ever logged
  loggedToday: boolean;
  next: number | null; // the milestone ahead of the current streak
  reached: number[]; // milestones your best streak has passed
};

export function streakStats(days: Record<string, { sample?: boolean }[]>, today: string): Streak {
  // Sample entries and days planned ahead don't count
  const logged = Object.keys(days).filter((d) => d <= today && days[d].some((e) => !e.sample)).sort();
  let best = 0;
  let run = 0;
  logged.forEach((d, i) => {
    run = i > 0 && addDays(logged[i - 1], 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
  });
  const last = logged[logged.length - 1];
  const alive = last === today || last === addDays(today, -1);
  const current = alive ? run : 0;
  return {
    current,
    best,
    total: logged.length,
    loggedToday: last === today,
    next: MILESTONES.find((m) => m > current) ?? null,
    reached: MILESTONES.filter((m) => m <= best),
  };
}

/** The milestone to celebrate now, if the current streak passed one not yet celebrated. */
export function newMilestone(streak: Streak, seen: number): number | null {
  const since = seen > streak.current ? 0 : seen; // celebrated in an earlier streak: that one is over
  const passed = MILESTONES.filter((m) => m <= streak.current && m > since);
  return passed.length ? passed[passed.length - 1] : null;
}
