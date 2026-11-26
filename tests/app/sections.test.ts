import assert from 'node:assert/strict';
import test from 'node:test';

import type { IndexDoc, SearchResult } from '../../src/foodIndex/client';
import { sameFoodKey, sections, ServerState } from '../../src/foodIndex/sections';
import { emptyNutrients, Food } from '../../src/foods';

const food = (name: string, brand?: string): Food => ({ id: `t:${name}:${brand ?? ''}`, name, brand, serving: '100 g', g: 100, n: emptyNutrients(), src: 'builtin' });
const doc = (name: string, brand: string | null = null, id = name + brand): IndexDoc => ({
  id, name, brand, kind: brand ? 'branded' : 'generic', barcode: null, portions: [{ label: '100 g', g: 100 }], n: { kcal: 1 },
  source: 'off', popularity: 0, flagged: 0, updated: '', category: 'other',
});
const ready = (query: string, best: IndexDoc[], close: IndexDoc[] = [], corrected?: string): ServerState => ({
  status: 'ready', query, result: { best, close, ...(corrected ? { corrected } : {}) } as SearchResult,
});
const device = [food('Banana bread')];
const run = (server: ServerState, extra: Partial<Parameters<typeof sections>[0]> = {}) =>
  sections({ query: 'banana', yours: [], device, curated: [], server, ...extra });
const names = (list: Food[]) => list.map((f) => f.name);

test('on-device foods show until the server answers', () => {
  for (const server of [{ status: 'off' }, { status: 'idle' }, { status: 'waiting', query: 'banana' }, { status: 'offline', query: 'banana' }] as ServerState[]) {
    const s = run(server);
    assert.deepEqual(names(s.best), ['Banana bread']);
    assert.equal(s.offline, server.status === 'offline');
    assert.deepEqual([s.close, s.corrected], [[], null]);
  }
});

test('the server order replaces them, only for the text on screen', () => {
  const server = ready('banana', [doc('Banana, raw'), doc('Banana chips', 'Acme')]);
  assert.deepEqual(names(run(server).best), ['Banana, raw', 'Banana chips']);
  assert.deepEqual(names(run(server, { query: '  banana ' }).best), ['Banana, raw', 'Banana chips']);
  assert.deepEqual(names(run(server, { query: 'banana bread' }).best), ['Banana bread']);
  assert.equal(run({ status: 'offline', query: 'ban' }).offline, false);
});

test('up to two built-in foods that match every word go first', () => {
  const curated = [food('Banana, medium'), food('Banana smoothie'), food('Banana pancakes'), food('Apple, medium')];
  const s = run(ready('banana', [doc('Banana, raw')]), { curated });
  assert.deepEqual(names(s.best), ['Banana, medium', 'Banana smoothie', 'Banana, raw']);
  const brand = sections({ query: 'honest cow cottage cheese', yours: [], device: [], curated: [food('Cottage cheese, 2%')], server: ready('honest cow cottage cheese', [doc('Cottage Cheese', 'The Honest Cow')]) });
  assert.deepEqual(names(brand.best), ['Cottage Cheese']);
});

test('one row for one food, however it is spelled', () => {
  assert.equal(sameFoodKey({ name: "Häagen-Dazs  Vanilla", brand: "Joe's" }), sameFoodKey({ name: 'haagen dazs VANILLA', brand: 'Joes' }));
  const s = run(ready('banana', [doc('Cottage Cheese', 'The Honest Cow', 'a'), doc('cottage cheese', 'the honest cow', 'b'), doc('Cottage Cheese', 'Other', 'c')]));
  assert.deepEqual(s.best.map((f) => f.id), ['x:a', 'x:c']);
});

test('your own food is not repeated below', () => {
  const s = run(ready('banana', [doc('Banana, raw'), doc('Banana Bar', 'Acme')], []), { yours: [food('Banana bar', 'Acme')] });
  assert.deepEqual(names(s.yours), ['Banana bar']);
  assert.deepEqual(names(s.best), ['Banana, raw']);
});

test('the same food on the device is not listed twice before the server answers', () => {
  const s = run({ status: 'waiting', query: 'banana' }, { yours: [food('Banana bread')] });
  assert.deepEqual(s.best, []);
});

test('close matches appear only when nothing matches every word', () => {
  const server = ready('zzqx banana', [], [doc('Banana, raw')]);
  const s = sections({ query: 'zzqx banana', yours: [], device: [], curated: [], server });
  assert.deepEqual([names(s.best), names(s.close)], [[], ['Banana, raw']]);
  const withCurated = run(ready('banana', [], [doc('Plantain')]), { curated: [food('Banana, medium')] });
  assert.deepEqual([names(withCurated.best), withCurated.close], [['Banana, medium'], []]);
});

test('an empty server answer falls back to the device', () => {
  assert.deepEqual(names(run(ready('banana', [])).best), ['Banana bread']);
});

test('the corrected spelling is shown only for the text on screen', () => {
  const server = ready('bananna', [doc('Banana, raw')], [], 'banana');
  assert.equal(run(server, { query: 'bananna' }).corrected, 'banana');
  assert.equal(run(server, { query: 'banannas' }).corrected, null);
});

test('while the next search runs, the last results stay on screen', () => {
  const previous = { query: 'banan', result: { best: [doc('Banana, raw')], close: [] } as SearchResult };
  const s = run({ status: 'waiting', query: 'banana', previous });
  assert.deepEqual(names(s.best), ['Banana, raw']);
  assert.equal(s.searching, false);
  assert.equal(run({ status: 'waiting', query: 'banana' }).searching, true);
  assert.equal(run({ status: 'waiting', query: 'apple', previous }).searching, false);
});

test('after a spelling correction the built-in foods are matched with the corrected words', () => {
  const curated = [food('Banana, medium')];
  const server = ready('bananna', [doc('Banana, raw')], [], 'banana');
  assert.deepEqual(names(run(server, { query: 'bananna', device: [], curated }).best), ['Banana, medium', 'Banana, raw']);
});
