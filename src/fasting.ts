/** Fasting helpers: durations, streaks and stats. */
import type { Fast } from './store';
import { ymd } from './util';

export const PRESETS = [12, 14, 16, 18, 20, 24];
const H = 3600000;

export function fmtDuration(ms: number, seconds = false): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  if (seconds) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

export const fastLength = (f: Fast, now = Date.now()) => (f.end ?? now) - f.start;
export const reachedGoal = (f: Fast, now = Date.now()) => fastLength(f, now) >= f.goalH * H;

/** Days in a row (ending today or yesterday) with a fast that reached its goal, by end date. */
export function fastStreak(history: Fast[], now = new Date()): number {
  const goalDays = new Set(history.filter((f) => f.end && reachedGoal(f)).map((f) => ymd(new Date(f.end!))));
  const d = new Date(now);
  if (!goalDays.has(ymd(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (goalDays.has(ymd(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function fastStats(history: Fast[]) {
  const done = history.filter((f) => f.end).slice(0, 30);
  if (!done.length) return null;
  const avg = done.reduce((a, f) => a + fastLength(f), 0) / done.length;
  const longest = Math.max(...done.map((f) => fastLength(f)));
  const hit = done.filter((f) => reachedGoal(f)).length;
  return { count: done.length, avgMs: avg, longestMs: longest, hitRate: hit / done.length };
}
