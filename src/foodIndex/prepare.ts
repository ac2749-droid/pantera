/**
 * Puts the food database that ships inside the app where SQLite can open it, once per version of it.
 * It is unpacked under a temporary name, so an interrupted copy is never mistaken for a finished one.
 */

export type DbFiles = {
  /** File names in the database folder. */
  names(): string[];
  remove(name: string): void;
  rename(from: string, to: string): void;
  /** Copies the database inside the app to this file name. */
  unpack(name: string): Promise<void>;
};

const PREFIX = 'foods-';
// Files SQLite keeps beside a database while using it
const COMPANIONS = ['', '-wal', '-shm', '-journal'];

export async function openFoodDb<T>(files: DbFiles, version: string, open: (name: string) => Promise<T>): Promise<T> {
  const name = `${PREFIX}${version}.db`;
  const current = new Set(COMPANIONS.map((suffix) => name + suffix));
  // Older versions and half-finished copies go first, to free their space
  for (const file of files.names()) {
    if (file.startsWith(PREFIX) && !current.has(file)) files.remove(file);
  }

  if (files.names().includes(name)) {
    try {
      return await open(name);
    } catch {
      // Damaged: remove it with the files beside it, then unpack it again
      for (const file of files.names()) if (current.has(file)) files.remove(file);
    }
  }

  const partial = `${name}.partial`;
  try {
    await files.unpack(partial);
  } catch (e) {
    if (files.names().includes(partial)) files.remove(partial);
    throw e;
  }
  files.rename(partial, name);
  return open(name);
}
