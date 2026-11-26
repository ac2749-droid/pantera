import { fastStats, fastStreak, fmtDuration, reachedGoal } from '../src/fasting';
let fails = 0;
const ok = (l: string, c: boolean, x = '') => { if (!c) fails++; console.log(c ? 'PASS' : 'FAIL', l, x); };
const H = 3600000;
const now = new Date(2026, 9, 1, 14, 0);
const at = (dayOffset: number, h: number) => new Date(2026, 9, 1 + dayOffset, h, 0).getTime();
const hist = [
  { start: at(-1, 20), end: at(0, 12), goalH: 16 }, // 16h, ends today ✓
  { start: at(-2, 20), end: at(-1, 13), goalH: 16 }, // 17h ✓
  { start: at(-3, 20), end: at(-2, 10), goalH: 16 }, // 14h ✗
  { start: at(-4, 19), end: at(-3, 12), goalH: 16 }, // 17h ✓
];
ok('format', fmtDuration(16 * H + 5 * 60000) === '16h 05m' && fmtDuration(65 * 1000, true) === '00:01:05');
ok('goal check', reachedGoal(hist[0]) && !reachedGoal(hist[2]));
ok('streak stops at a missed goal', fastStreak(hist, now) === 2, String(fastStreak(hist, now)));
ok('streak counts from yesterday if none today', fastStreak(hist.slice(1), now) === 1);
const st = fastStats(hist)!;
ok('stats', st.count === 4 && st.hitRate === 0.75 && Math.round(st.longestMs / H) === 17, JSON.stringify(st));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
