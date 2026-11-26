import assert from 'node:assert/strict';
import test from 'node:test';

import { emptyNutrients, Entry } from '../../src/foods';
import { makePdf, PdfLine, toBytes } from '../../src/pdf';
import { buildWeek } from '../../src/report';
import { weekPdfLines } from '../../src/reportPdf';

const text = (lines: PdfLine[]) => lines.map((l) => [l.text, l.right].filter(Boolean).join(' | ')).join('\n');

/** Reads back where each object starts, as a PDF reader would. */
function check(pdf: string) {
  assert.ok(pdf.startsWith('%PDF-1.4\n') && pdf.endsWith('%%EOF\n'));
  const start = Number(/startxref\n(\d+)\n%%EOF/.exec(pdf)![1]);
  assert.equal(pdf.slice(start, start + 4), 'xref');
  const offsets = [...pdf.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((at, i) => assert.ok(pdf.slice(at).startsWith(`${i + 1} 0 obj`), `object ${i + 1}`));
  for (const m of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) assert.equal(m[2].length, Number(m[1]));
  return pdf;
}

test('a PDF is well formed and its text is escaped', () => {
  const pdf = check(makePdf([{ text: 'Mac (and) cheese \\ more', right: '120 kcal' }]));
  assert.match(pdf, /\(Mac \\\(and\\\) cheese \\\\ more\) Tj/);
  assert.match(pdf, /\(120 kcal\) Tj/);
  assert.equal(pdf.match(/\/Type \/Page /g)?.length, 1);
});

test('letters the font lacks are replaced, common ones are kept', () => {
  const pdf = check(makePdf([{ text: 'Häagen — “½ cup” × 2 · µg 🍌 米' }]));
  const shown = /BT[^\n]*\((.*)\) Tj/.exec(pdf)![1];
  assert.equal(shown, 'H\xe4agen \x97 \x93\xbd cup\x94 \xd7 2 \xb7 \xb5g ? ?');
  assert.deepEqual([...toBytes('A\x97')], [65, 0x97]);
  assert.ok([...pdf].every((c) => c.charCodeAt(0) < 256));
});

test('paper follows where you are: letter or A4', () => {
  assert.match(makePdf([{ text: 'a', right: 'b' }], 'letter'), /MediaBox \[0 0 612 792\]/);
  assert.match(makePdf([{ text: 'a' }]), /MediaBox \[0 0 595 842\]/);
});

test('long reports run over several pages and long lines wrap', () => {
  const many = Array.from({ length: 140 }, (_, i) => ({ text: `Line ${i}` }));
  assert.equal(check(makePdf(many)).match(/\/Type \/Page /g)?.length, 3);
  const long = check(makePdf([{ text: 'word '.repeat(80), right: '9 kcal' }]));
  assert.ok(long.match(/ Tj/g)!.length > 4);
});

test('the week’s report lists the summary, the nutrients and what was eaten each day', () => {
  const entry: Entry = { id: '1', name: 'Pita bread', serving: '1 pita', sg: 64, grams: 64, meal: 'lunch', t: 0, at: 780, n: { ...emptyNutrients(), kcal: 170, p: 6, c: 35, f: 2, fib: 5 } };
  const input = { days: { '2026-11-23': [entry], '2026-11-24': [{ ...entry, id: 's', sample: true }] }, weights: [], water: {}, targets: { kcal: 2000, p: 150, c: 200, f: 67 }, waterGoalMl: 1893 };
  const week = buildWeek(input, '2026-11-23', '2026-11-25');
  const out = text(weekPdfLines(week, { days: input.days, exercise: { '2026-11-23': [{ id: 'x', name: 'Running', minutes: 30, kcal: 300, t: 1 }] }, units: 'us', netCarbs: true, today: '2026-11-25' }));
  assert.match(out, /Pantera weekly report/);
  assert.match(out, /Average calories \| 170 of 2,000 kcal/);
  assert.match(out, /Fiber/);
  assert.match(out, /Pita bread, 1 pita \(64 g\), 1:00 PM \| 170 kcal/);
  assert.match(out, /Running, 30 min \| 300 kcal burned/);
  assert.match(out, /Average net carbs \| 30 of 200 g/);
  assert.equal(out.match(/Pita bread/g)?.length, 2); // the day's list and the top foods, not the sample
});
