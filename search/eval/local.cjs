// How well does the database inside the app find foods?
//   node -r ./tests/ts-require.cjs search/eval/local.cjs [--seed N]
const { join } = require('node:path');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { DatabaseSync } = require('node:sqlite');
const { createLocalEngine } = require('../../src/foodIndex/localEngine.ts');
const { searchIndex } = require('../../src/foodIndex/client.ts');

const root = join(__dirname, '..', '..');
const seed = Number(process.argv[process.argv.indexOf('--seed') + 1]) || 1;

async function main() {
  const { evaluate } = await import('./run.mts');
  const { cases, passes, split } = await import('./rank.mts');
  const { rng } = await import('./variants.mts');
  const db = new DatabaseSync(join(root, 'assets', 'foods.db'), { readOnly: true });
  const synonyms = JSON.parse(readFileSync(join(root, 'search', 'synonyms.json'), 'utf8'));
  const engine = createLocalEngine({ all: async (sql, params) => db.prepare(sql).all(...params) }, synonyms);
  const cfg = { engine };
  const search = (q) => searchIndex(cfg, q, 10);

  const generic = Number(db.prepare("SELECT value FROM meta WHERE key = 'generic'").get().value);
  const total = db.prepare('SELECT count(*) AS n FROM foods').get().n;
  const rand = rng(seed);
  const row = db.prepare('SELECT name, brand, source FROM foods WHERE rid = ?');
  const pick = (from, to, count) => Array.from({ length: count }, () => {
    const r = row.get(from + Math.floor(rand() * (to - from + 1)));
    const kind = r.source >= 2 ? 'generic' : 'branded';
    return { name: r.name, brand: r.brand, kind, category: kind };
  });
  const targets = [...pick(generic + 1, total, 2000), ...pick(1, generic, 500)];
  const result = await evaluate(search, targets, rng(seed));
  const sorted = [...result.latencies].sort((a, b) => a - b);
  const at = (p) => sorted[Math.ceil(p * sorted.length) - 1].toFixed(0);

  const lines = [`# Database in the app, seed ${seed}`, '', `${total} foods`];
  for (const [name, v] of Object.entries(result.variants)) {
    lines.push(`${name}: ${((100 * v.total.hit) / v.total.of).toFixed(1)}% (${v.total.hit}/${v.total.of})`);
  }
  lines.push(`latency on this PC: p50 ${at(0.5)} ms, p95 ${at(0.95)} ms, worst ${at(1)} ms`);
  const [tune, held] = split(cases);
  for (const [title, group] of [['shaping half', tune], ['other half', held]]) {
    let first = 0;
    const failed = [];
    for (const c of group) {
      const { best } = await search(c.q);
      if (passes(c, best[0])) first++;
      else failed.push(`  "${c.q}" -> ${best[0] ? `${best[0].brand ?? '-'} | ${best[0].name}` : 'nothing'}`);
    }
    lines.push(`right food first, ${title}: ${first}/${group.length}`);
    if (title === 'shaping half') lines.push(...failed);
  }
  lines.push('', 'examples:');
  for (const q of ['honest cow cottage cheese', 'honest cow cotage chese', 'chobani greek yogurt', 'fairlife milk', 'cottage cheese', 'chiken breast', 'banana', 'jrader joes', 'zzqx cottage cheese', 'oat milk', 'coke', 'big mac', 'red bell pepper', 'egg']) {
    const t = performance.now();
    const r = await search(q);
    const shown = (r.best.length ? r.best : r.close).slice(0, 3).map((d) => `${d.brand ?? '-'} | ${d.name}`).join(' / ');
    lines.push(`  ${q} (${(performance.now() - t).toFixed(0)} ms)${r.corrected ? ` [${r.corrected}]` : ''}${r.best.length ? '' : ' CLOSE'}: ${shown}`);
  }
  lines.push('', 'first 15 misses:', ...result.failures.slice(0, 15).map((f) => `  ${f.variant}: "${f.query}" expected ${f.expected}; got ${f.got[0] ?? 'nothing'}`));
  const out = join(root, 'search', 'data', 'reports');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `local-seed-${seed}.md`), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
