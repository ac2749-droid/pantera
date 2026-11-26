/** The time of day on a diary entry, as minutes after midnight. */

import { ymd } from './util';

const DAY = 24 * 60;
const STEP = 15;

/** The time you set, or when the food was logged if that was on the day itself. */
export function entryMinutes(entry: { t: number; at?: number }, date: string): number | null {
  if (entry.at !== undefined) return entry.at < 0 ? null : entry.at;
  if (!entry.t) return null;
  const logged = new Date(entry.t);
  return ymd(logged) === date ? logged.getHours() * 60 + logged.getMinutes() : null;
}

/** The time a copy of an entry keeps: the original's, or none (-1) rather than the moment of copying. */
export const copiedTime = (entry: { t: number; at?: number }, date: string) => entryMinutes(entry, date) ?? -1;

export function clockText(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  return `${h % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** The next quarter hour up or down. */
export function stepTime(minutes: number, direction: 1 | -1): number {
  const next = direction > 0 ? (Math.floor(minutes / STEP) + 1) * STEP : (Math.ceil(minutes / STEP) - 1) * STEP;
  return ((next % DAY) + DAY) % DAY;
}
