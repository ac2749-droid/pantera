/** Fill vitamins & minerals for the curated foods from their closest USDA match. Run: npx tsx scripts/builtin-micros.ts */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');
declare const require: (m: string) => any;
declare const __dirname: string;
import { BUILTIN, EXTRA_NK } from '../src/foods';
import { getUsdaIndex } from '../src/foodSearch';
import { usdaFoods } from '../src/usda';

// Hand-picked USDA names where the search's first hit isn't the right reference food
const OVERRIDE: Record<string, string> = JSON.parse(fs.readFileSync(path.join(__dirname, 'builtin-micros-overrides.json'), 'utf8'));
const byName = new Map(usdaFoods().map((u) => [u.name, u]));
const out: Record<string, number[]> = {};
const report: string[] = [];
for (const f of BUILTIN) {
  const raw = OVERRIDE[f.name];
  if (raw === '') {
    report.push(`   ${f.name.padEnd(34)} (mixed dish: left without vitamin data)`);
    continue;
  }
  const [forced, mode] = (raw ?? '').split('|');
  let u = forced ? byName.get(forced) : undefined;
  if (forced && !u) report.push(`!! override not found for ${f.name}: ${forced}`);
  if (!u) {
    const hit = getUsdaIndex().search(f.name, 5).find((h) => h.doc.item.kind === 'usda');
    u = hit && hit.doc.item.kind === 'usda' ? hit.doc.item.u : undefined;
  }
  if (!u) {
    report.push(`-- no match: ${f.name}`);
    continue;
  }
  // Scale per-100 g USDA values to this food's serving, but only if calories per gram are close
  const ratio = f.n.kcal && u.per100.kcal ? (f.n.kcal / f.g) / (u.per100.kcal / 100) : 1;
  // Usually scale by weight; for drinks like lattes, scale by calories (the milk carries both)
  const factor = mode === 'kcal' && u.per100.kcal ? f.n.kcal / u.per100.kcal : f.g / 100;
  const xs = EXTRA_NK.map((k) => Math.round(u!.per100[k] * factor * 1000) / 1000);
  while (xs.length && xs[xs.length - 1] === 0) xs.pop();
  out[f.name] = xs;
  report.push(`${Math.abs(ratio - 1) > 0.35 && mode !== 'kcal' ? '⚠ ' : '  '}${f.name.padEnd(34)} → ${u.name}  (kcal/g ratio ${ratio.toFixed(2)})`);
}
fs.writeFileSync(path.join(__dirname, '..', 'src', 'data', 'builtin-micros.json'), JSON.stringify(out));
console.log(report.join('\n'));
console.log(Object.keys(out).length, 'of', BUILTIN.length, 'filled');
