/** The weekly report as printed pages: the summary, nutrients, and everything logged each day. */

import { GLASS_ML, showWeight, Units } from './calc';
import { amountLabel } from './components/helpers';
import { burnedOn, Exercise } from './exercise';
import { Entry, MEALS } from './foods';
import { clockText, entryMinutes } from './mealTime';
import type { PdfLine } from './pdf';
import type { WeekReport } from './report';
import { carbsShown } from './targets';
import { fmtAmount, int, longDate, r0, shortDate } from './util';

export function weekPdfLines(
  week: WeekReport,
  extra: { days: Record<string, Entry[]>; exercise: Record<string, Exercise[]>; units: Units; netCarbs?: boolean; today: string },
): PdfLine[] {
  const { days, exercise, units, netCarbs } = extra;
  const t = week.target;
  const carbs = netCarbs ? 'Net carbs' : 'Carbs';
  const avgCarbs = carbsShown(week.avgN, netCarbs);
  const lines: PdfLine[] = [
    { text: 'Pantera weekly report', size: 20, bold: true },
    { text: `${longDate(week.start)} to ${longDate(week.end)}`, gap: 2 },
    { text: 'Summary', size: 13, bold: true, gap: 14 },
    { text: 'Days logged', right: `${week.logged} of ${week.elapsed}` },
    { text: 'Average calories', right: `${int(week.avg.kcal)} of ${int(t.kcal)} kcal` },
    { text: 'Days within 10% of the calorie target', right: String(week.onTarget) },
    { text: 'Average protein', right: `${r0(week.avg.p)} of ${r0(t.p)} g` },
    { text: `Average ${carbs.toLowerCase()}`, right: `${r0(avgCarbs)} of ${r0(t.c)} g` },
    { text: 'Average fat', right: `${r0(week.avg.f)} of ${r0(t.f)} g` },
    { text: 'Calories from protein, carbs and fat', right: `${week.split.p}% / ${week.split.c}% / ${week.split.f}%` },
  ];
  if (week.water.daysTracked) lines.push({ text: 'Average water', right: `${Math.round(week.water.avgMl / GLASS_ML(units))} glasses` });
  if (week.weight.end !== undefined) {
    const change = week.weight.change;
    lines.push({ text: 'Weight', right: `${showWeight(week.weight.end, units)}${change === undefined ? '' : ` (${change <= 0 ? '−' : '+'}${showWeight(Math.abs(change), units)})`}` });
  }

  if (week.logged) {
    lines.push({ text: 'Nutrients, daily average', size: 13, bold: true, gap: 14 });
    week.nutrients.forEach((n) =>
      lines.push({ text: n.kind === 'limit' ? `${n.label} (limit)` : n.label, right: `${fmtAmount(n.avg, n.unit)} of ${n.dv.toLocaleString()} ${n.unit} · ${r0(n.pct * 100)}%` }),
    );
    lines.push({ text: `Vitamins and minerals are listed for ${r0(week.coverage * 100)}% of the calories eaten.`, size: 8.5, gap: 4 });
    lines.push({ text: 'Biggest calorie sources', size: 13, bold: true, gap: 14 });
    week.topFoods.forEach((f) => lines.push({ text: `${f.name} (${f.times}×)`, right: `${int(f.kcal)} kcal` }));
  }

  lines.push({ text: 'Food log', size: 13, bold: true, gap: 14 });
  for (const { d } of week.daily) {
    if (d > extra.today) continue;
    const eaten = (days[d] ?? []).filter((e) => !e.sample);
    const moved = exercise[d] ?? [];
    if (!eaten.length && !moved.length) continue;
    const kcal = eaten.reduce((a, e) => a + (e.n.kcal || 0), 0);
    lines.push({ text: shortDate(d), right: `${int(kcal)} kcal eaten${moved.length ? ` · ${int(burnedOn(moved))} burned` : ''}`, bold: true, gap: 8 });
    for (const [meal, label] of MEALS) {
      const list = eaten.filter((e) => e.meal === meal);
      if (!list.length) continue;
      lines.push({ text: label, size: 9.5, bold: true, gap: 2 });
      list.forEach((e) => {
        const at = entryMinutes(e, d);
        lines.push({ text: `${e.name}, ${amountLabel(e)}${at === null ? '' : `, ${clockText(at)}`}`, right: `${r0(e.n.kcal)} kcal` });
      });
    }
    if (moved.length) {
      lines.push({ text: 'Exercise', size: 9.5, bold: true, gap: 2 });
      moved.forEach((x) => lines.push({ text: x.minutes ? `${x.name}, ${x.minutes} min` : x.name, right: `${int(x.kcal)} kcal burned` }));
    }
  }
  lines.push({ text: 'Made with Pantera. Values are estimates and not medical advice.', size: 8.5, gap: 16 });
  return lines;
}
