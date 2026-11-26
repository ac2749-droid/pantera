import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import { findByBarcode, searchIndex } from '../../src/foodIndex/client';
import { createLocalEngine, matchExpression } from '../../src/foodIndex/localEngine';

const { DatabaseSync } = require('node:sqlite');

const food = (id: string, name: string, brand: string | null, over: object = {}) => ({
  id, name, brand, kind: brand ? 'branded' : 'generic', barcode: null,
  portions: [{ label: '1 cup', g: 240 }, { label: '100 g', g: 100 }], n: { kcal: 100, p: 5, c: 4, f: 3 },
  source: brand ? 'off' : 'usda_sr', popularity: 1, flagged: 0, updated: '2025-01-01', category: 'dairy', aliases: [] as string[], ...over,
});

const FOODS = [
  food('cow', 'Cottage Cheese', 'The Honest Cow', { barcode: '41900091290', popularity: 14 }),
  food('big', 'Cottage Cheese', 'Daisy', { popularity: 500 }),
  food('pine', 'Cottage Cheese With Pineapple', 'Daisy', { popularity: 900 }),
  food('plain', 'Cheese, cottage, lowfat', null, { aliases: ['cottage cheese'] }),
  food('dish', 'Spinach dip, regular', null), food('leaf', 'Spinach, raw', null),
  food('egg', 'Eggs, large', 'Acme', { popularity: 3 }),
  food('soda', 'Carbonated beverage, cola', null),
  food('chips', 'Kale Chips', 'Acme'), food('kale', 'Kale', 'Acme'),
  ...[1, 2, 3].map((i) => food(`oat${i}`, `Rolled Oats ${i}`, 'Quaker', { popularity: i })),
  food('twin', 'Granola Bar', 'Acme', { barcode: '555555', popularity: 9 }),
  food('twin2', 'Granola Bar', 'Acme', { barcode: '666666' }),
];

const dir = mkdtempSync(join(tmpdir(), 'engine-'));
writeFileSync(join(dir, 'foods.ndjson'), FOODS.map((f) => JSON.stringify(f)).join('\n') + '\n');
execFileSync('python', ['-c', 'import sys; from pathlib import Path; from search.mobile import build_mobile; d = Path(sys.argv[1]); build_mobile(d / "foods.ndjson", d / "foods.db", d / "info.json")', dir]);
const sqlite = new DatabaseSync(join(dir, 'foods.db'), { readOnly: true });
after(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

const engine = createLocalEngine(
  { all: async (sql: string, params: (string | number)[]) => sqlite.prepare(sql).all(...params) },
  { soda: ['carbonated beverage'] },
);
const cfg = { engine };
const ids = async (q: string) => (await searchIndex(cfg, q, 10)).best.map((d) => d.id);

test('the query becomes a full-text expression with plurals, synonyms and a half-typed last word', () => {
  assert.equal(matchExpression(['eggs', 'chee'], {}), '("eggs" OR "egg") AND ("chee"*)');
  assert.equal(matchExpression(['soda'], { soda: ['carbonated beverage'] }), '("soda"* OR ("carbonated" AND "beverage"))');
  assert.equal(matchExpression([], {}), null);
});

test('the brand you name comes first', async () => {
  assert.equal((await ids('honest cow cottage cheese'))[0], 'cow');
  assert.equal((await ids('cottage cheese honest cow'))[0], 'cow');
  assert.equal((await ids('honest cow cottage chee'))[0], 'cow');
});

test('a plain search shows the plain food, then brands with the closest name first', async () => {
  const found = await ids('cottage cheese');
  assert.equal(found[0], 'plain');
  assert.deepEqual(found.slice(1, 4), ['big', 'cow', 'pine']);
});

test('the food itself ranks above a dish containing it', async () => {
  assert.equal((await ids('spinach'))[0], 'leaf');
});

test('a spelling mistake is corrected', async () => {
  const result = await searchIndex(cfg, 'rolled oots', 10);
  assert.equal(result.corrected, 'rolled oats');
  assert.equal(result.best.length, 3);
});

test('plurals and everyday names work', async () => {
  assert.ok((await ids('egg acme')).includes('egg'));
  assert.equal((await ids('soda'))[0], 'soda');
});

test('close matches when a word is unknown', async () => {
  const result = await searchIndex(cfg, 'zzqx cottage cheese', 10);
  assert.deepEqual(result.best, []);
  assert.ok(result.close.length > 0);
});

test('nutrients and portions come back as the app expects', async () => {
  const doc = (await findByBarcode(cfg, '0041900091290'))!;
  assert.deepEqual([doc.id, doc.brand, doc.barcode, doc.source, doc.kind], ['cow', 'The Honest Cow', '41900091290', 'off', 'branded']);
  assert.deepEqual(doc.portions, [{ label: '1 cup', g: 240 }, { label: '100 g', g: 100 }]);
  assert.deepEqual(doc.n, { kcal: 100, p: 5, c: 4, f: 3 });
  assert.equal(await findByBarcode(cfg, '999999999'), null);
});

test('every barcode of an identical product is found, under the code scanned', async () => {
  const twin = (await findByBarcode(cfg, '555555'))!;
  assert.deepEqual([twin.id, twin.barcode], ['twin', '555555']);
  assert.equal((await findByBarcode(cfg, '666666'))!.id, 'twin');
});

test('one letter is not searched, and odd input is safe', async () => {
  assert.deepEqual(await ids('c'), []);
  for (const q of ['"', 'a AND (', 'NEAR/3 *', "'; DROP TABLE foods; --"]) await searchIndex(cfg, q, 5);
});

test('an aborted search stops', async () => {
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(searchIndex(cfg, 'cheese', 10, stop.signal), { name: 'AbortError' });
});

test('a single letter after other words is ignored until the next one', () => {
  assert.equal(matchExpression(['cottage', 'c'], {}), matchExpression(['cottage'], {}));
  assert.equal(matchExpression(['milk', '2'], {}), '("milk" OR "milks") AND ("2")');
});

test('each part of the database is read once for the three queries of a search', async () => {
  let reads = 0;
  const counted = createLocalEngine(
    { all: async (sql: string, params: (string | number)[]) => { if (sql.includes('FROM fts')) reads++; return sqlite.prepare(sql).all(...params); } },
    {},
  );
  await searchIndex({ engine: counted }, 'cottage cheese', 10);
  assert.equal(reads, 2);
});

test('rare characters find nothing instead of failing', async () => {
  await assert.doesNotReject(searchIndex(cfg, 'ab\u19b0cd cheese', 10));
});
