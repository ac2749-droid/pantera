import assert from 'node:assert/strict';
import test from 'node:test';

import type { SearchResult } from '../../src/foodIndex/client';
import { createSearcher } from '../../src/foodIndex/searcher';
import type { ServerState } from '../../src/foodIndex/sections';

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const result = (corrected: string): SearchResult => ({ best: [], close: [], corrected });

function setup() {
  const calls: { query: string; signal: AbortSignal; resolve: (r: SearchResult) => void; reject: (e: Error) => void }[] = [];
  const states: string[] = [];
  const searcher = createSearcher({
    search: (query, signal) => new Promise((resolve, reject) => calls.push({ query, signal, resolve, reject })),
    onState: (s: ServerState) => states.push(s.status === 'ready' ? `ready:${s.query}` : 'query' in s ? `${s.status}:${s.query}` : s.status),
    delayMs: 10,
    releaseMs: 20,
  });
  return { searcher, calls, states };
}

test('quick typing sends one search, for the last text', async () => {
  const { searcher, calls, states } = setup();
  searcher.setQuery('m');
  searcher.setQuery('mi');
  searcher.setQuery('mil');
  await wait(30);
  assert.deepEqual(calls.map((c) => c.query), ['mil']);
  calls[0].resolve(result('a'));
  await wait(0);
  assert.deepEqual(states, ['waiting:m', 'waiting:mi', 'waiting:mil', 'ready:mil']);
});

test('blank text is idle and the same text again does nothing', async () => {
  const { searcher, calls, states } = setup();
  searcher.setQuery('  ');
  searcher.setQuery('milk');
  searcher.setQuery('milk ');
  await wait(30);
  assert.equal(calls.length, 1);
  assert.deepEqual(states, ['idle', 'waiting:milk']);
});

test('an older answer never replaces a newer one', async () => {
  const { searcher, calls, states } = setup();
  searcher.setQuery('milk');
  await wait(30);
  searcher.setQuery('oats');
  await wait(30);
  assert.ok(calls[0].signal.aborted);
  calls[1].resolve(result('b'));
  await wait(0);
  calls[0].resolve(result('a'));
  await wait(0);
  assert.equal(states.at(-1), 'ready:oats');
});

test('a failure reads as offline, a cancellation as nothing', async () => {
  const { searcher, calls, states } = setup();
  searcher.setQuery('milk');
  await wait(30);
  calls[0].reject(Object.assign(new Error('stop'), { name: 'AbortError' }));
  await wait(0);
  assert.deepEqual(states, ['waiting:milk']);
  searcher.setQuery('oats');
  await wait(30);
  calls[1].reject(new Error('down'));
  await wait(0);
  assert.equal(states.at(-1), 'offline:oats');
});

test('a search that throws immediately also reads as offline', async () => {
  const states: string[] = [];
  const searcher = createSearcher({ search: () => { throw new Error('bad'); }, onState: (s) => states.push(s.status), delayMs: 1 });
  searcher.setQuery('milk');
  await wait(20);
  assert.deepEqual(states, ['waiting', 'offline']);
});

test('nothing moves while a finger is down, and only shortly after it lifts', async () => {
  const { searcher, calls, states } = setup();
  searcher.setQuery('milk');
  await wait(30);
  searcher.hold(true);
  calls[0].resolve(result('a'));
  await wait(40);
  assert.deepEqual(states, ['waiting:milk']);
  searcher.hold(false);
  await wait(5);
  searcher.hold(true); // touched again before the results arrived on screen
  await wait(40);
  assert.deepEqual(states, ['waiting:milk']);
  searcher.hold(false);
  await wait(5);
  assert.deepEqual(states, ['waiting:milk']);
  await wait(40);
  assert.deepEqual(states, ['waiting:milk', 'ready:milk']);
});

test('typing during a hold drops the held answer and still shows waiting', async () => {
  const { searcher, calls, states } = setup();
  searcher.setQuery('milk');
  await wait(30);
  searcher.hold(true);
  calls[0].resolve(result('a'));
  await wait(0);
  searcher.setQuery('oats');
  searcher.hold(false);
  await wait(60);
  assert.deepEqual(states, ['waiting:milk', 'waiting:oats']);
});

test('after leaving the screen nothing is delivered', async () => {
  const { searcher, calls, states } = setup();
  searcher.setQuery('milk');
  await wait(30);
  searcher.dispose();
  assert.ok(calls[0].signal.aborted);
  calls[0].resolve(result('a'));
  searcher.setQuery('oats');
  await wait(40);
  assert.deepEqual(states, ['waiting:milk']);
  assert.equal(calls.length, 1);
});

test('waiting keeps the last results while the text is being extended or deleted', async () => {
  const seen: ServerState[] = [];
  const searcher = createSearcher({ search: async () => result('a'), onState: (s) => seen.push(s), delayMs: 1 });
  const kept = () => (seen.at(-1) as { previous?: { query: string } }).previous?.query;
  searcher.setQuery('milk');
  await wait(20);
  searcher.setQuery('milk ch');
  assert.equal(kept(), 'milk');
  await wait(20);
  searcher.setQuery('mil');
  assert.equal(kept(), 'milk ch');
  await wait(20);
  searcher.setQuery('oats');
  assert.equal(kept(), undefined);
  await wait(20);
  searcher.setQuery('');
  searcher.setQuery('oats');
  assert.equal(kept(), undefined);
});
