import assert from 'node:assert/strict';
import test from 'node:test';

import { DbFiles, openFoodDb } from '../../src/foodIndex/prepare';

/** A database directory kept in memory. `bad` names the contents that cannot be opened. */
function folder(initial: Record<string, string> = {}, bad: string[] = []) {
  const held = new Map(Object.entries(initial));
  const log: string[] = [];
  const files: DbFiles = {
    names: () => [...held.keys()],
    remove: (name) => { log.push(`remove ${name}`); held.delete(name); },
    rename: (from, to) => { held.set(to, held.get(from)!); held.delete(from); },
    unpack: async (name) => { log.push(`unpack ${name}`); held.set(name, 'fresh'); },
  };
  const open = async (name: string) => {
    const content = held.get(name) ?? 'missing';
    if (content === 'missing' || bad.includes(content)) throw new Error(`cannot open ${name}`);
    return content;
  };
  return { files, open, held, log };
}

test('first start: the database is unpacked under another name, then put in place', async () => {
  const f = folder();
  assert.equal(await openFoodDb(f.files, '2', f.open), 'fresh');
  assert.deepEqual(f.log, ['unpack foods-2.db.partial']);
  assert.deepEqual([...f.held.keys()], ['foods-2.db']);
});

test('later starts open it without unpacking again', async () => {
  const f = folder({ 'foods-2.db': 'kept', 'foods-2.db-journal': 'j' });
  assert.equal(await openFoodDb(f.files, '2', f.open), 'kept');
  assert.deepEqual(f.log, []);
});

test('older versions and half copies are removed first; other files are left alone', async () => {
  const f = folder({ 'foods-1.db': 'old', 'foods-1.db-wal': 'w', 'foods-2.db.partial': 'half', 'pantera.db': 'mine' });
  await openFoodDb(f.files, '2', f.open);
  assert.deepEqual(f.log, ['remove foods-1.db', 'remove foods-1.db-wal', 'remove foods-2.db.partial', 'unpack foods-2.db.partial']);
  assert.deepEqual([...f.held.keys()].sort(), ['foods-2.db', 'pantera.db']);
});

test('a damaged database is unpacked again', async () => {
  const f = folder({ 'foods-2.db': 'damaged' }, ['damaged']);
  assert.equal(await openFoodDb(f.files, '2', f.open), 'fresh');
  assert.deepEqual(f.log, ['remove foods-2.db', 'unpack foods-2.db.partial']);
});

test('a failed unpack is reported and leaves nothing that looks finished', async () => {
  const f = folder();
  f.files.unpack = async (name) => { f.held.set(name, 'half'); throw new Error('disk full'); };
  await assert.rejects(openFoodDb(f.files, '2', f.open), /disk full/);
  assert.deepEqual([...f.held.keys()], []);
});

test('a damaged database goes together with the files SQLite keeps beside it', async () => {
  const f = folder({ 'foods-2.db': 'damaged', 'foods-2.db-journal': 'j' }, ['damaged']);
  await openFoodDb(f.files, '2', f.open);
  assert.deepEqual(f.log, ['remove foods-2.db', 'remove foods-2.db-journal', 'unpack foods-2.db.partial']);
});
