const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (s: string, n: number) => {
  const d = parseYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const today = () => ymd(new Date());

export const r0 = (x: number) => Math.round(x || 0);
export const r1 = (x: number) => Math.round((x || 0) * 10) / 10;
export const int = (x: number) => r0(x).toLocaleString();
export const fmtAmount = (x: number, unit: 'g' | 'mg' | 'µg') =>
  (x >= 100 || (unit !== 'g' && x >= 10) ? r0(x) : x < 1 && x > 0 ? Math.round(x * 100) / 100 : r1(x)).toLocaleString();

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function dayTitle(d: string) {
  const t = today();
  if (d === t) return 'Today';
  if (d === addDays(t, -1)) return 'Yesterday';
  if (d === addDays(t, 1)) return 'Tomorrow';
  return WEEKDAYS[parseYmd(d).getDay()];
}
export function longDate(d: string) {
  const x = parseYmd(d);
  return `${MONTHS[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()}`;
}
export function shortDate(d: string) {
  const x = parseYmd(d);
  return `${WEEKDAYS[x.getDay()].slice(0, 3)}, ${MONTHS[x.getMonth()].slice(0, 3)} ${x.getDate()}`;
}
export const weekdayShort = (d: string) => WEEKDAYS[parseYmd(d).getDay()].slice(0, 3);
export const monthDay = (d: string) => {
  const x = parseYmd(d);
  return `${x.getMonth() + 1}/${x.getDate()}`;
};
