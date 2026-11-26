// Usage: node search/eval/run.mts --seed 1   (with search/start.ps1 running)
// Writes search/data/reports/seed-<n>.md. Exit code 1 when a target is missed, 2 when it cannot run.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';

import { findByBarcode, normalizeBarcode, searchIndex } from '../../src/foodIndex/client.ts';
import type { IndexDoc, SearchResult } from '../../src/foodIndex/client.ts';
import { scan } from './sample.mts';
import type { Doc } from './sample.mts';
import { halfLast, norm, reorder, rng, sameFood, typo } from './variants.mts';

const TARGETS = { exact: 0.95, reordered: 0.95, typo: 0.9, half: 0.9 } as const;
const LABELS = { exact: 'brand and name', reordered: 'other word order', typo: 'one spelling mistake', half: 'last word half typed' };
const LATENCY_MS = 100;
const MAX_WORDS = 10;
type Variant = keyof typeof TARGETS;
const VARIANTS = Object.keys(TARGETS) as Variant[];

type Search = (q: string) => Promise<SearchResult>;
type Tally = { hit: number; of: number };
type Failure = { variant: Variant; query: string; expected: string; got: string[] };
type Check = { q: string; status: 'PASS' | 'FAIL' | 'NOT IN DATA'; detail: string };

const label = (d: { brand: string | null; name: string }) => (d.brand ? `${d.brand} | ${d.name}` : d.name);

/** Brand words missing from the name, then the name: how someone would type it. */
export function queryFor(doc: { brand: string | null; name: string }): string {
  const name = norm(doc.name).split(' ');
  const brand = norm(doc.brand || '').split(' ').filter((w) => w && !name.includes(w));
  return [...brand, ...name].join(' ');
}

export async function evaluate(search: Search, targets: Doc[], rand: () => number) {
  const variants = Object.fromEntries(
    VARIANTS.map((v) => [v, { total: { hit: 0, of: 0 }, byCategory: {} as Record<string, Tally> }]),
  ) as Record<Variant, { total: Tally; byCategory: Record<string, Tally> }>;
  const skipped = { exact: 0, reordered: 0, typo: 0, half: 0 };
  const failures: Failure[] = [];
  const latencies: number[] = [];
  let skippedLong = 0;

  for (const target of targets) {
    const words = queryFor(target).split(' ');
    if (words.length > MAX_WORDS) {
      skippedLong++;
      continue;
    }
    const queries = { exact: words.join(' '), reordered: reorder(words, rand), typo: typo(words, rand), half: halfLast(words) };
    const category = target.kind === 'generic' ? 'generic' : target.category;
    for (const variant of VARIANTS) {
      const query = queries[variant];
      if (query === null) {
        skipped[variant]++;
        continue;
      }
      const started = performance.now();
      const { best } = await search(query);
      latencies.push(performance.now() - started);
      const hit = best.slice(0, 10).some((d) => sameFood(d, target));
      const tally = (variants[variant].byCategory[category] ??= { hit: 0, of: 0 });
      for (const t of [variants[variant].total, tally]) {
        t.of++;
        if (hit) t.hit++;
      }
      if (!hit) failures.push({ variant, query, expected: label(target), got: best.slice(0, 3).map(label) });
    }
  }
  return { variants, skipped, skippedLong, failures, latencies };
}

export async function checkExample(
  example: any,
  search: Search,
  byBarcode: (code: string) => Promise<IndexDoc | null>,
  found: { brands: Set<string>; barcodes: Set<string> },
): Promise<Check> {
  if (example.barcodes) {
    const q = example.barcodes.join(' = ');
    if (!example.barcodes.some((c: string) => found.barcodes.has(normalizeBarcode(c) ?? ''))) {
      return { q, status: 'NOT IN DATA', detail: 'barcode absent from the data' };
    }
    const hits = await Promise.all(example.barcodes.map((c: string) => byBarcode(c)));
    const ok = hits.every((h) => h && h.id === hits[0]?.id);
    return { q, status: ok ? 'PASS' : 'FAIL', detail: hits.map((h) => (h ? label(h) : 'nothing')).join(' / ') };
  }
  const q: string = example.q;
  if (example.brand && !found.brands.has(norm(example.brand))) {
    return { q, status: 'NOT IN DATA', detail: `brand "${example.brand}" absent from the data` };
  }
  const { best, close } = await search(q);
  const has = (d: IndexDoc, words: string[]) => words.every((w) => norm(d.name).includes(norm(w)));
  let ok: boolean;
  if (example.bestEmpty) {
    ok = best.length === 0 && close.some((d) => has(d, example.closeNameWords));
  } else {
    const top = best.slice(0, example.top);
    ok = true;
    if (example.brand) ok = top.filter((d) => norm(d.brand || '').includes(norm(example.brand))).length >= (example.min ?? 1);
    if (example.kind) ok = ok && top.length > 0 && top.every((d) => d.kind === example.kind);
    if (example.nameWords) ok = ok && top.some((d) => has(d, example.nameWords));
    if (example.brandedWithin) ok = ok && best.slice(0, example.brandedWithin).some((d) => d.kind === 'branded');
  }
  const shown = (best.length ? best : close).slice(0, 5).map(label).join(' / ') || 'nothing';
  return { q, status: ok ? 'PASS' : 'FAIL', detail: `${best.length ? 'best' : 'close'}: ${shown}` };
}

export function missedTargets(result: Pick<Awaited<ReturnType<typeof evaluate>>, 'variants'>, p95: number, checks: Check[]): string[] {
  const missed: string[] = VARIANTS.filter((v) => {
    const { hit, of } = result.variants[v].total;
    return of === 0 || hit / of < TARGETS[v];
  });
  if (!(p95 < LATENCY_MS)) missed.push('latency');
  if (checks.some((c) => c.status === 'FAIL')) missed.push('examples');
  return missed;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? NaN;
}

const rate = ({ hit, of }: Tally) => (of ? `${((100 * hit) / of).toFixed(1)}% (${hit}/${of})` : 'no cases');

async function main(): Promise<number> {
  const here = import.meta.dirname;
  const root = join(here, '..');
  const { values } = parseArgs({
    options: { seed: { type: 'string', default: '1' }, data: { type: 'string' }, url: { type: 'string' }, key: { type: 'string' }, out: { type: 'string' } },
  });
  const seed = Number(values.seed);
  const data = values.data ?? join(root, 'data', 'foods.ndjson');
  const out = values.out ?? join(root, 'data', 'reports');
  const envFile = join(root, '.env');
  const env = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
  const key = values.key ?? /^MEILI_SEARCH_KEY=(.+)$/m.exec(env)?.[1]?.trim();
  if (!key) throw new Error('No search key. Run search/load.py first.');
  if (!existsSync(data)) throw new Error(`No data file: ${data}`);
  const cfg = { url: values.url ?? 'http://127.0.0.1:7700', key, timeoutMs: 15000 };
  const search: Search = (q) => searchIndex(cfg, q, 10);

  const read = (name: string) => JSON.parse(readFileSync(join(here, name), 'utf8'));
  const examples = read('examples.json');
  const coverage = read('coverage.json');
  const scanned = await scan(data, {
    seed, branded: 2000, generic: 500, coverage,
    brands: examples.flatMap((e: any) => (e.brand ? [e.brand] : [])),
    barcodes: examples.flatMap((e: any) => (e.barcodes ?? []).map((c: string) => normalizeBarcode(c))),
  });

  const result = await evaluate(search, scanned.sample, rng(seed));
  const found = { brands: scanned.brandsFound, barcodes: scanned.barcodesFound };
  const checks: Check[] = [];
  for (const e of examples) checks.push(await checkExample(e, search, (c) => findByBarcode(cfg, c), found));
  for (const brand of scanned.accentedBrands) {
    const q = norm(brand);
    if (!q) continue;
    const { best } = await search(q);
    const ok = best.some((d) => norm(d.brand || '') === q);
    checks.push({ q: `${q} (plain spelling of ${brand})`, status: ok ? 'PASS' : 'FAIL', detail: best.slice(0, 3).map(label).join(' / ') || 'nothing' });
  }

  const p50 = percentile(result.latencies, 0.5);
  const p95 = percentile(result.latencies, 0.95);
  const missed = missedTargets(result, p95, checks);

  const lines = [`# Seed ${seed}`, '', missed.length ? `**Targets missed: ${missed.join(', ')}**` : '**All targets met**', ''];
  const buildReport = join(dirname(data), 'build-report.json');
  if (existsSync(buildReport)) lines.push('## Build', '```json', readFileSync(buildReport, 'utf8').trim(), '```', '');
  lines.push(`Records: ${scanned.counts.total} (flagged ${scanned.counts.flagged}), by source ${JSON.stringify(scanned.counts.bySource)}`, '');
  lines.push('## Ways of typing', '', '| Way | Target | Result | Not applicable |', '|---|---|---|---|');
  for (const v of VARIANTS) {
    lines.push(`| ${LABELS[v]} | ${TARGETS[v] * 100}% | ${rate(result.variants[v].total)} | ${result.skipped[v]} |`);
  }
  lines.push('', `Sampled ${scanned.sample.length}; skipped ${result.skippedLong} with more than ${MAX_WORDS} words.`, '', '## By category', '');
  for (const v of VARIANTS) {
    lines.push(`- ${LABELS[v]}: ${Object.entries(result.variants[v].byCategory).sort().map(([c, t]) => `${c} ${rate(t)}`).join('; ')}`);
  }
  lines.push('', '## Latency', '', `p50 ${p50.toFixed(0)} ms, p95 ${p95.toFixed(0)} ms (target: p95 under ${LATENCY_MS} ms, ${result.latencies.length} searches)`);
  lines.push('', '## Examples', '', ...checks.map((c) => `- ${c.status}: \`${c.q}\` → ${c.detail}`));
  lines.push('', `## Missing from the data (${scanned.missing.length} of ${coverage.length})`, '',
    ...scanned.missing.map((m) => `- ${m.category}: ${m.q}`));
  lines.push('', '## First 50 failures', '',
    ...result.failures.slice(0, 50).map((f) => `- ${f.variant}: \`${f.query}\` expected ${f.expected}; got ${f.got.join(' / ') || 'nothing'}`));

  mkdirSync(out, { recursive: true });
  const report = join(out, `seed-${seed}.md`);
  writeFileSync(report, lines.join('\n') + '\n');
  console.log([...lines.slice(0, 3), ...VARIANTS.map((v) => `${LABELS[v]}: ${rate(result.variants[v].total)}`), `p95 ${p95.toFixed(0)} ms`, report].join('\n'));
  return missed.length ? 1 : 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 2;
  }
}
