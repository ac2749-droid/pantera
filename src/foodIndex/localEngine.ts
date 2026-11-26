/**
 * Answers the food search from the database inside the app (built by search/mobile.py), so it works for
 * anyone, offline. It takes the same queries the server would, which keeps all the search logic in client.ts.
 */

import { namesBrand, queryWords } from './client';
import type { Engine, EngineQuery, IndexDoc } from './client';

/** The one thing needed from a database; expo-sqlite in the app, node:sqlite in tests. */
export type Db = { all<T>(sql: string, params: (string | number)[]): Promise<T[]> };

export type Synonyms = Record<string, string[]>;

// The order of NK in src/foods.ts (and NUTRIENT_ORDER in search/mobile.py)
const NUTRIENTS = ['kcal', 'p', 'c', 'f', 'fib', 'sug', 'sat', 'na', 'k', 'ca', 'fe', 'vc', 'chol', 'mono', 'poly', 'va', 'vd',
  've', 'vk', 'b1', 'b2', 'b3', 'b6', 'fol', 'b12', 'cho', 'mag', 'ph', 'zn', 'cu', 'mn', 'se'];
const SOURCES = ['off', 'usda_branded', 'usda_sr', 'usda_fndds'];
const GENERIC_CANDIDATES = 250;
const BRANDED_CANDIDATES = 400;
const MAX_PHRASE = 4;
const KEPT_READS = 8;

const quoted = (word: string) => `"${word}"`;

/** The other way of writing a word: "eggs" and "egg". */
function variants(word: string): string[] {
  if (word.length < 3 || /\d/.test(word)) return [word];
  if (word.endsWith('s')) return [word, word.slice(0, -1)];
  return [word, `${word}s`];
}

/** One word, or a run of words that has another name, as a full-text term. */
function term(words: string[], others: string[], prefix: boolean): string {
  const own = words.length > 1
    ? [`(${words.map(quoted).join(' AND ')})`]
    // A one-letter beginning has no index and would be slow, so only longer ones are completed
    : prefix && words[0].length > 1 ? [`${quoted(words[0])}*`] : variants(words[0]).map(quoted);
  const synonyms = others.map((other) => {
    const parts = queryWords(other);
    return parts.length > 1 ? `(${parts.map(quoted).join(' AND ')})` : quoted(parts[0]);
  });
  return `(${[...own, ...synonyms].join(' OR ')})`;
}

/** Every word must match; the last may be half typed. Words are quoted, so input can't change the query. */
export function matchExpression(typed: string[], synonyms: Synonyms): string | null {
  // A single letter after other words is the start of the next word: wait for its second letter
  const words = typed.length > 1 && /^\p{L}$/u.test(typed[typed.length - 1]) ? typed.slice(0, -1) : typed;
  const terms: string[] = [];
  for (let at = 0; at < words.length; ) {
    let size = Math.min(MAX_PHRASE, words.length - at);
    while (size > 1 && !synonyms[words.slice(at, at + size).join(' ')]) size--;
    const group = words.slice(at, at + size);
    at += size;
    terms.push(term(group, synonyms[group.join(' ')] ?? [], at === words.length));
  }
  return terms.length ? terms.join(' AND ') : null;
}

type Row = { rid: number; id: string; name: string; brand: string | null; barcode: string | null; n: string; portions: string; flagged: number; pop: number; source: number };

const COLUMNS = 'f.rid, f.id, f.name, f.brand, f.barcode, f.n, f.portions, f.flagged, f.pop, f.source';

function toDoc(row: Row): IndexDoc {
  const n: Record<string, number> = {};
  (JSON.parse(row.n) as (number | null)[]).forEach((value, i) => {
    if (value !== null) n[NUTRIENTS[i]] = value;
  });
  const portions = (JSON.parse(row.portions) as [string, number][]).map(([label, g]) => ({ label, g }));
  const source = SOURCES[row.source];
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    kind: row.source >= 2 ? 'generic' : 'branded',
    barcode: row.barcode,
    portions: [...portions, { label: '100 g', g: 100 }],
    n,
    source,
    popularity: row.pop,
    flagged: row.flagged ? 1 : 0,
    updated: '',
    category: '',
  };
}

/** Best first: the named brand, whole words, short names, trustworthy, generic, popular. */
function rank(rows: Row[], words: string[]): Row[] {
  const score = (row: Row) => {
    const name = queryWords(row.name);
    const all = new Set([...name, ...queryWords(row.brand ?? '')]);
    const exact = words.filter((w) => variants(w).some((v) => all.has(v))).length;
    const extra = name.filter((n) => !words.some((w) => n.startsWith(w) || variants(w).includes(n))).length;
    return [namesBrand(words, row.brand) ? 0 : 1, -exact, extra, row.flagged, row.source >= 2 ? 0 : 1, -row.pop, row.rid];
  };
  return rows
    .map((row) => ({ row, key: score(row) }))
    .sort((a, b) => a.key.map((v, i) => v - b.key[i]).find((d) => d !== 0) ?? 0)
    .map((entry) => entry.row);
}

export function createLocalEngine(db: Db, synonyms: Synonyms): Engine {
  let generic: Promise<number> | undefined;
  // Generic foods were numbered first, so their row numbers end here
  const genericEnd = () =>
    (generic ??= db.all<{ value: string }>("SELECT value FROM meta WHERE key = 'generic'", []).then((r) => Number(r[0]?.value ?? 0)));

  // One search asks about the same words several times; the database never changes, so answers are kept
  const reads = new Map<string, Promise<Row[]>>();
  function read(match: string, range: '<=' | '>', end: number, limit: number): Promise<Row[]> {
    const key = `${range} ${match}`;
    let rows = reads.get(key);
    if (!rows) {
      rows = db
        .all<Row>(`SELECT ${COLUMNS} FROM fts JOIN foods f ON f.rid = fts.rowid WHERE fts MATCH ? AND fts.rowid ${range} ? LIMIT ?`, [match, end, limit])
        .catch((e) => {
          reads.delete(key);
          // A few rare characters split a word in a way the index can't search: nothing matches them
          if (String(e?.message ?? e).includes('fts5')) return [];
          throw e;
        });
      reads.set(key, rows);
      if (reads.size > KEPT_READS) reads.delete(reads.keys().next().value!);
    }
    return rows;
  }

  async function foods(query: EngineQuery): Promise<IndexDoc[]> {
    const words = queryWords(query.q);
    // A single letter matches almost everything and would be slow on a phone
    if (!words.length || (words.length === 1 && words[0].length < 2)) return [];
    const match = matchExpression(words, synonyms)!;
    const end = await genericEnd();
    const rows: Row[] = [];
    if (query.filter !== 'kind = branded') rows.push(...(await read(match, '<=', end, GENERIC_CANDIDATES)));
    if (query.filter !== 'kind = generic') rows.push(...(await read(match, '>', end, BRANDED_CANDIDATES)));
    return rank(rows, words).slice(0, query.limit).map(toDoc);
  }

  /** Real words that share a spelling key with a typed word, most common first. */
  async function spellings(query: EngineQuery) {
    const keys = [...(query.filter ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (!keys.length) return [];
    const marks = keys.map(() => '?').join(',');
    return db.all<{ word: string; count: number }>(
      `SELECT DISTINCT w.word, w.count FROM word_keys k JOIN words w ON w.id = k.word_id WHERE k.key IN (${marks}) ORDER BY w.count DESC LIMIT ?`,
      [...keys, query.limit]);
  }

  return {
    search: (query) => (query.indexUid === 'words' ? (spellings(query) as unknown as Promise<IndexDoc[]>) : foods(query)),
    async byBarcode(barcode) {
      const rows = await db.all<Row>(`SELECT ${COLUMNS} FROM barcodes b JOIN foods f ON f.rid = b.rid WHERE b.barcode = ? LIMIT 1`, [barcode]);
      return rows.length ? { ...toDoc(rows[0]), barcode } : null;
    },
  };
}
