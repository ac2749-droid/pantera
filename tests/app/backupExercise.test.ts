import assert from 'node:assert/strict';
import test from 'node:test';

// backup.ts reads the phone's storage; the parts tested here don't, so an empty stand-in is enough
const storage: Record<string, unknown> = {};
const Module = require('module');
const load = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  return request === '@react-native-async-storage/async-storage' ? { __esModule: true, default: storage } : load.call(this, request, ...rest);
};
const { asSnapshot, isEmptySnapshot, mergeSnapshots, summarize, writeSnapshot } = require('../../src/backup') as typeof import('../../src/backup');

const run = { id: 'a', name: 'Running', minutes: 30, kcal: 300, t: 1 };
const walk = { id: 'b', name: 'Walking', minutes: 20, kcal: 60, t: 2 };
const snap = (at: string, data: Record<string, unknown>) => ({ app: 'pantera' as const, v: 1 as const, at, data });

test('exercise is part of a backup and must be a list per day', () => {
  const good = asSnapshot(snap('2026-11-25', { 'pantera.exercise': { '2026-11-25': [run] } }));
  assert.deepEqual(good?.data['pantera.exercise'], { '2026-11-25': [run] });
  assert.equal(asSnapshot(snap('2026-11-25', { 'pantera.exercise': [run] }))?.data['pantera.exercise'], undefined);
  const mixed = asSnapshot(snap('2026-11-25', { 'pantera.exercise': { '2026-11-25': 'x', '2026-11-24': [walk] } }));
  assert.deepEqual(mixed?.data['pantera.exercise'], { '2026-11-24': [walk] });
});

test('combining two phones keeps every workout once', () => {
  const merged = mergeSnapshots(
    snap('2026-11-24', { 'pantera.exercise': { '2026-11-25': [run] } }),
    snap('2026-11-25', { 'pantera.exercise': { '2026-11-25': [run, walk], '2026-11-20': [walk] } }),
  );
  assert.deepEqual(merged.data['pantera.exercise'], { '2026-11-25': [run, walk], '2026-11-20': [walk] });
});

test('a phone with only workouts is not treated as empty', () => {
  const only = snap('2026-11-25', { 'pantera.exercise': { '2026-11-25': [run] } });
  assert.equal(summarize(only).workouts, 1);
  assert.equal(isEmptySnapshot(only), false);
});

test('restoring data from before exercise existed leaves this phone’s workouts', async () => {
  const removed: string[] = [];
  const stored: Record<string, string> = { 'pantera.exercise': '{}', 'pantera.profile': '{}', 'pantera.day.2026-11-01': '[]' };
  Object.assign(storage, {
    getItem: async (k: string) => stored[k] ?? null,
    getAllKeys: async () => Object.keys(stored),
    multiRemove: async (keys: string[]) => removed.push(...keys),
    multiSet: async () => {},
  });
  await writeSnapshot(snap('2026-11-25', { 'pantera.profile': {} }));
  assert.deepEqual(removed.sort(), ['pantera.day.2026-11-01', 'pantera.profile']);
  removed.length = 0;
  await writeSnapshot(snap('2026-11-25', { 'pantera.exercise': {} }));
  assert.ok(removed.includes('pantera.exercise'));
});
