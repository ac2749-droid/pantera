/** Energy and body-measure math shared by the setup flow, Targets and Settings. */

export type Sex = 'male' | 'female';
export type Units = 'us' | 'metric';

export const ACTIVITY: { v: number; label: string; hint: string }[] = [
  { v: 1.2, label: 'Mostly sitting', hint: 'Desk job, little exercise' },
  { v: 1.375, label: 'Lightly active', hint: 'Exercise 1–3 days a week' },
  { v: 1.55, label: 'Moderately active', hint: 'Exercise 3–5 days a week' },
  { v: 1.725, label: 'Very active', hint: 'Hard exercise 6–7 days a week' },
  { v: 1.9, label: 'Athlete', hint: 'Training twice a day or a physical job' },
];

// Daily calorie change from maintenance. 3,500 kcal ≈ 1 lb (0.45 kg) of body weight.
export const GOALS: { v: number; label: string; hint: string }[] = [
  { v: -750, label: 'Lose faster', hint: 'About 1.5 lb (0.7 kg) a week' },
  { v: -500, label: 'Lose weight', hint: 'About 1 lb (0.45 kg) a week' },
  { v: -250, label: 'Lose slowly', hint: 'About 0.5 lb (0.2 kg) a week' },
  { v: 0, label: 'Maintain', hint: 'Keep my current weight' },
  { v: 250, label: 'Gain slowly', hint: 'Lean muscle gain, about 0.5 lb a week' },
];

export const SPLITS: { key: string; label: string; p: number; c: number; f: number }[] = [
  { key: 'balanced', label: 'Balanced', p: 30, c: 40, f: 30 },
  { key: 'protein', label: 'High protein', p: 35, c: 35, f: 30 },
  { key: 'lowcarb', label: 'Low carb', p: 30, c: 20, f: 50 },
];

/** Mifflin–St Jeor resting energy, in kcal/day (weight kg, height cm). */
export function bmr(sex: Sex, age: number, heightCm: number, weightKg: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

export function dailyTarget(tdee: number, goalDelta: number, sex: Sex): number {
  // Never suggest below a safe floor
  const floor = sex === 'male' ? 1500 : 1200;
  return Math.max(floor, Math.round((tdee + goalDelta) / 10) * 10);
}

export function macroGrams(kcal: number, split: { p: number; c: number; f: number }) {
  return { p: Math.round((kcal * split.p) / 400), c: Math.round((kcal * split.c) / 400), f: Math.round((kcal * split.f) / 900) };
}

export const LB = 0.45359237;
export const kgToLb = (kg: number) => kg / LB;
export const lbToKg = (lb: number) => lb * LB;
export const cmToFtIn = (cm: number) => {
  const inches = cm / 2.54;
  let ft = Math.floor(inches / 12);
  let inch = Math.round(inches - ft * 12);
  if (inch === 12) {
    ft += 1;
    inch = 0;
  }
  return { ft, inch };
};
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * 2.54;

/** Weight for display in the user's units. */
export const showWeight = (kg: number, units: Units) => (units === 'us' ? `${Math.round(kgToLb(kg) * 10) / 10} lb` : `${Math.round(kg * 10) / 10} kg`);
export const weightIn = (kg: number, units: Units) => Math.round((units === 'us' ? kgToLb(kg) : kg) * 10) / 10;
export const weightFrom = (value: number, units: Units) => (units === 'us' ? lbToKg(value) : value);

// Water: one "glass" is 8 fl oz (US) or 250 ml (metric)
export const GLASS_ML = (units: Units) => (units === 'us' ? 236.6 : 250);
export const showWater = (ml: number, units: Units) => (units === 'us' ? `${Math.round(ml / 29.5735)} fl oz` : ml >= 1000 ? `${Math.round(ml / 100) / 10} L` : `${Math.round(ml)} ml`);
