/** Opens the food database inside the app. Everything that can be tested without a phone is in prepare.ts. */

import { Directory, File, Paths } from 'expo-file-system';
import { defaultDatabaseDirectory, importDatabaseFromAssetAsync, openDatabaseAsync } from 'expo-sqlite';

import synonyms from '../../search/synonyms.json';
import type { Engine } from './client';
import info from './foodsDbInfo.json';
import { createLocalEngine, Synonyms } from './localEngine';
import { DbFiles, openFoodDb } from './prepare';

const folder = () => new Directory(`file://${defaultDatabaseDirectory}`);
const file = (name: string) => new File(folder(), name);

/** Unpacking goes through a temporary copy in the cache, as large as the database itself. */
function clearCachedCopy(): void {
  for (const item of Paths.cache.list()) {
    if (item instanceof File && /^ExponentAsset-.*\.db$/.test(item.name)) item.delete();
  }
}

const files: DbFiles = {
  names: () => (folder().exists ? folder().list().map((item) => item.name) : []),
  remove: (name) => {
    if (file(name).exists) file(name).delete();
  },
  rename: (from, to) => file(from).rename(to),
  unpack: (name) => importDatabaseFromAssetAsync(name, { assetId: require('../../assets/foods.db') }),
};

async function open(name: string) {
  const db = await openDatabaseAsync(name);
  try {
    const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'version'");
    if (row?.value !== info.version) throw new Error(`Unexpected food database version ${row?.value}`);
    await db.execAsync('PRAGMA query_only = 1; PRAGMA cache_size = -8000;');
    return db;
  } catch (e) {
    await db.closeAsync().catch(() => {});
    throw e;
  }
}

export async function openLocalEngine(): Promise<Engine> {
  const db = await openFoodDb(files, info.version, open);
  // Only now: if unpacking fails (usually no free space), the next attempt starts from this copy,
  // and the asset library expects it to still be there
  try {
    clearCachedCopy();
  } catch {
    // Left behind, it only takes space
  }
  return createLocalEngine({ all: (sql, params) => db.getAllAsync(sql, params) }, synonyms as Synonyms);
}
