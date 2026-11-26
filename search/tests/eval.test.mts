import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { checkExample, evaluate, missedTargets, queryFor } from '../eval/run.mts';
import { isPresent, popularityBand, sampleCells, scan } from '../eval/sample.mts';
import { halfLast, norm, reorder, rng, sameFood, typo } from '../eval/variants.mts';

const words = ['acme', 'cottage', 'cheese'];
const doc = (id: string, brand: string | null, name: string, extra: object = {}) => ({
  id, brand, name, kind: brand ? 'branded' : 'generic', barcode: null, popularity: 0, category: 'dairy',
  flagged: 0, source: 'off', aliases: [] as string[], ...extra,
});

test('reorder keeps the words and changes the order', () => {
  assert.deepEqual(reorder(words, rng(1))!.split(' ').sort(), [...words].sort());
  assert.notEqual(reorder(words, rng(1)), words.join(' '));
  assert.equal(reorder(['milk'], rng(1)), null);
  assert.equal(reorder(['pom', 'pom'], rng(1)), null);
});

test('typo changes exactly one word of four letters or more', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const t = typo(words, rng(seed))!.split(' ');
    assert.equal(t.filter((w, i) => w !== words[i]).length, 1);
  }
  assert.equal(typo(['tea', 'oat'], rng(1)), null);
  assert.equal(typo(['1000', '2024'], rng(1)), null);
  assert.equal(typo(words, rng(7)), typo(words, rng(7)));
});

test('halfLast cuts the last long word in half', () => {
  assert.equal(halfLast(words), 'acme cottage che');
  assert.equal(halfLast(['green', 'tea']), null);
});

test('norm and sameFood ignore accents, apostrophes and case', () => {
  assert.equal(norm("Ben & Jerry's Häagen"), 'ben jerrys haagen');
  assert.ok(sameFood({ brand: 'Häagen-Dazs', name: 'Vanilla' }, { brand: 'haagen dazs', name: 'VANILLA' }));
  assert.ok(!sameFood({ brand: 'Acme', name: 'Vanilla' }, { brand: null, name: 'Vanilla' }));
});

test('queryFor does not repeat brand words already in the name', () => {
  assert.equal(queryFor({ brand: 'Acme', name: 'Cottage Cheese' }), 'acme cottage cheese');
  assert.equal(queryFor({ brand: 'Acme Farms', name: 'Acme Cheese' }), 'farms acme cheese');
  assert.equal(queryFor({ brand: null, name: 'Cheese, cottage' }), 'cheese cottage');
});

test('popularity bands separate unscanned, rare and popular', () => {
  assert.deepEqual([0, 3, 10, 50].map((p) => popularityBand(p, 10)), [0, 1, 1, 2]);
});

test('sampleCells shares equally and tops up from larger cells', () => {
  const cells = new Map([['a', ['a1']], ['b', ['b1', 'b2', 'b3', 'b4', 'b5']], ['c', ['c1', 'c2', 'c3', 'c4', 'c5']]]);
  const picked = sampleCells(cells, 7, rng(1));
  assert.equal(picked.length, 7);
  assert.equal(new Set(picked).size, 7);
  assert.equal(picked.filter((x) => x[0] === 'a').length, 1);
  assert.equal(picked.filter((x) => x[0] === 'b').length, 3);
  assert.deepEqual(sampleCells(cells, 7, rng(1)), picked);
  assert.equal(sampleCells(cells, 100, rng(1)).length, 11);
});

test('isPresent needs the brand and every word', () => {
  const d = doc('1', "McDonald's", 'Big Mac Sandwich');
  assert.ok(isPresent(d, { brand: 'mcdonald', words: ['big', 'mac'] }));
  assert.ok(!isPresent(d, { brand: 'wendy', words: ['big'] }));
  assert.ok(!isPresent(d, { words: ['whopper'] }));
});

test('scan samples, counts and finds coverage in one file', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'scan-'));
  const file = join(dir, 'foods.ndjson');
  const docs = [doc('1', 'Häagen-Dazs', 'Vanilla', { popularity: 4, barcode: '123456' }), doc('2', 'Acme', 'Cheese'),
    doc('3', null, 'Milk, whole', { flagged: 1, source: 'usda_sr' })];
  writeFileSync(file, docs.map((d) => JSON.stringify(d)).join('\n') + '\n');
  const out = await scan(file, {
    seed: 1, branded: 10, generic: 10, coverage: [{ q: 'milk', words: ['milk'] }, { q: 'kimchi', words: ['kimchi'] }],
    brands: ['acme', 'fairlife'], barcodes: ['123456', '999999'],
  });
  rmSync(dir, { recursive: true });
  assert.equal(out.counts.total, 3);
  assert.equal(out.counts.flagged, 1);
  assert.deepEqual(out.counts.bySource, { off: 2, usda_sr: 1 });
  assert.equal(out.sample.length, 3);
  assert.deepEqual(out.missing.map((m) => m.q), ['kimchi']);
  assert.deepEqual([...out.brandsFound], ['acme']);
  assert.deepEqual([...out.barcodesFound], ['123456']);
  assert.deepEqual(out.accentedBrands, ['Häagen-Dazs']);
});

test('evaluate scores each way of typing and lists failures', async () => {
  const target = doc('1', 'Acme', 'Cottage Cheese');
  const search = async (q: string) => ({ best: q === 'acme cottage cheese' ? [doc('2', 'acme', 'cottage cheese')] : [], close: [] });
  const out = await evaluate(search as any, [target, doc('9', null, 'a b c d e f g h i j k')] as any, rng(1));
  assert.deepEqual(out.variants.exact.total, { hit: 1, of: 1 });
  assert.deepEqual(out.variants.reordered.total, { hit: 0, of: 1 });
  assert.deepEqual(out.variants.exact.byCategory.dairy, { hit: 1, of: 1 });
  assert.equal(out.skippedLong, 1);
  assert.equal(out.failures.length, 3);
  assert.equal(out.latencies.length, 4);
});

test('missedTargets names every target not met', () => {
  const v = (hit: number) => ({ total: { hit, of: 100 }, byCategory: {} });
  const variants = { exact: v(95), reordered: v(94), typo: v(90), half: v(89) };
  assert.deepEqual(missedTargets({ variants } as any, 99, []), ['reordered', 'half']);
  assert.deepEqual(missedTargets({ variants: { exact: v(99), reordered: v(99), typo: v(99), half: v(99) } } as any, 100,
    [{ status: 'FAIL' }, { status: 'NOT IN DATA' }] as any), ['latency', 'examples']);
});

test('checkExample covers each kind of expectation', async () => {
  const cow = doc('c', 'The Honest Cow', 'Cottage Cheese'), generic = doc('g', null, 'Cheese, cottage');
  const found = { brands: new Set(['honest cow']), barcodes: new Set(['41900091290']) };
  const run = async (example: object, best: any[], close: any[] = [], byCode: any = null) =>
    (await checkExample(example as any, (async () => ({ best, close })) as any, (async () => byCode) as any, found)).status;
  assert.equal(await run({ q: 'x', top: 3, brand: 'honest cow' }, [generic, cow]), 'PASS');
  assert.equal(await run({ q: 'x', top: 1, brand: 'honest cow' }, [generic, cow]), 'FAIL');
  assert.equal(await run({ q: 'x', top: 5, brand: 'honest cow', min: 2 }, [cow]), 'FAIL');
  assert.equal(await run({ q: 'x', top: 5, brand: 'fairlife' }, []), 'NOT IN DATA');
  const plain = { q: 'x', top: 1, kind: 'generic', nameWords: ['cottage'], brandedWithin: 10 };
  assert.equal(await run(plain, [generic, cow]), 'PASS');
  assert.equal(await run(plain, [cow, generic]), 'FAIL');
  assert.equal(await run(plain, [generic]), 'FAIL');
  assert.equal(await run({ q: 'x', top: 3, nameWords: ['cottage', 'cheese'] }, [generic]), 'PASS');
  const none = { q: 'x', bestEmpty: true, closeNameWords: ['cottage'] };
  assert.equal(await run(none, [], [generic]), 'PASS');
  assert.equal(await run(none, [cow], [generic]), 'FAIL');
  const codes = { barcodes: ['0041900091290', '41900091290'] };
  assert.equal(await run(codes, [], [], cow), 'PASS');
  assert.equal(await run(codes, [], [], null), 'FAIL');
  assert.equal(await run({ barcodes: ['999999'] }, [], [], null), 'NOT IN DATA');
});

test('the command writes a report and exits 1 when targets are missed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'run-'));
  const file = join(dir, 'foods.ndjson');
  writeFileSync(file, JSON.stringify(doc('1', 'Acme', 'Cottage Cheese')) + '\n');
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw);
      res.end(JSON.stringify(body.queries ? { results: body.queries.map(() => ({ hits: [] })) } : { hits: [] }));
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as { port: number };
  const child = spawn(process.execPath, ['search/eval/run.mts', '--seed', '3', '--data', file, '--url',
    `http://127.0.0.1:${port}`, '--key', 'k', '--out', dir]);
  const code = await new Promise((ok) => child.on('close', ok));
  server.close();
  const report = readFileSync(join(dir, 'seed-3.md'), 'utf8');
  rmSync(dir, { recursive: true });
  assert.equal(code, 1);
  for (const text of ['Seed 3', 'brand and name', 'NOT IN DATA', 'Missing', 'p95']) assert.ok(report.includes(text), text);
});
