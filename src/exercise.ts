/** Exercise and the energy it uses. */

export type Exercise = { id: string; name: string; minutes: number; kcal: number; t: number };

/** Typical intensity (MET) of common activities, from the Compendium of Physical Activities. */
export const ACTIVITIES: { name: string; met: number }[] = [
  { name: 'Walking', met: 3.5 },
  { name: 'Brisk walking', met: 4.3 },
  { name: 'Hiking', met: 6 },
  { name: 'Jogging', met: 7 },
  { name: 'Running', met: 9.8 },
  { name: 'Cycling', met: 7.5 },
  { name: 'Stationary bike', met: 6.8 },
  { name: 'Swimming', met: 6 },
  { name: 'Weight training', met: 5 },
  { name: 'HIIT', met: 8 },
  { name: 'Elliptical', met: 5 },
  { name: 'Rowing machine', met: 7 },
  { name: 'Stair climbing', met: 8.8 },
  { name: 'Jump rope', met: 11 },
  { name: 'Yoga', met: 2.5 },
  { name: 'Pilates', met: 3 },
  { name: 'Dancing', met: 5 },
  { name: 'Boxing', met: 7.8 },
  { name: 'Basketball', met: 6.5 },
  { name: 'Soccer', met: 7 },
  { name: 'Tennis', met: 7.3 },
];

/** Calories beyond what resting for the same time would use (your daily target already includes that). */
export function caloriesBurned(met: number, kg: number, minutes: number): number {
  return Math.round((Math.max(0, met - 1) * Math.max(0, kg) * Math.max(0, minutes)) / 60);
}

export const burnedOn = (list: Exercise[] | undefined) => (list ?? []).reduce((total, x) => total + (x.kcal || 0), 0);
