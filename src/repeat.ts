/** Logging the same food on several days at once. */

import { addDays } from './util';

const AHEAD = 7; // how far ahead the diary plans
const MOST = 7;

/** The day a food added while viewing `viewing` goes on: planning stops a week ahead. */
export function addingDay(viewing: string, today: string): string {
  return viewing > addDays(today, AHEAD) ? today : viewing;
}

/** The days a food logged on `base` can also go on: later ones, from today up to a week ahead. */
export function repeatDates(base: string, today: string): string[] {
  const next = addDays(base, 1);
  const days: string[] = [];
  for (let day = next > today ? next : today; day <= addDays(today, AHEAD) && days.length < MOST; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}
