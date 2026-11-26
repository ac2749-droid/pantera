// Reads foods.ndjson (too big to hold in memory) and picks what to test.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

import { norm, rng, shuffle } from './variants.mts';

export type Doc = {
  id: string; name: string; brand: string | null; kind: 'generic' | 'branded'; barcode: string | null;
  popularity: number; category: string; flagged: 0 | 1; source: string; aliases?: string[];
};

export type CoverageItem = { q: string; category?: string; brand?: string; words: string[] };

/** 0 = never scanned (or no scan data), 1 = rarely scanned, 2 = popular. */
export function popularityBand(popularity: number, median: number): 0 | 1 | 2 {
  if (popularity <= 0) return 0;
  return popularity <= median ? 1 : 2;
}

/** Equal shares from every cell; what small cells cannot fill is taken from larger ones. */
export function sampleCells<T>(cells: Map<string, T[]>, total: number, rand: () => number): T[] {
  const ordered = [...cells.entries()].sort((a, b) => a[1].length - b[1].length || a[0].localeCompare(b[0]));
  const out: T[] = [];
  let remaining = total;
  ordered.forEach(([, items], i) => {
    const take = Math.min(items.length, Math.floor(remaining / (ordered.length - i)));
    out.push(...shuffle(items, rand).slice(0, take));
    remaining -= take;
  });
  return out;
}

const startsWord = (text: string, part: string) => ` ${text}`.includes(` ${part}`);

export function isPresent(doc: { brand: string | null; name: string; aliases?: string[] }, item: { brand?: string; words: string[] }): boolean {
  if (item.brand && !startsWord(norm(doc.brand || ''), norm(item.brand))) return false;
  const text = norm(`${doc.name} ${doc.brand || ''} ${(doc.aliases || []).join(' ')}`);
  return item.words.every((w) => text.includes(norm(w)));
}

async function* docs(file: string): AsyncGenerator<Doc> {
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) if (line.trim()) yield JSON.parse(line);
}

/** Keeps a uniform random sample of at most `size` items from a stream. */
function reservoir<T>(size: number, rand: () => number) {
  const items: T[] = [];
  let seen = 0;
  return {
    items,
    add(item: T) {
      seen++;
      if (items.length < size) items.push(item);
      else {
        const j = Math.floor(rand() * seen);
        if (j < size) items[j] = item;
      }
    },
  };
}

export type ScanOptions = {
  seed: number; branded: number; generic: number; coverage: CoverageItem[]; brands: string[]; barcodes: string[];
};

export async function scan(file: string, options: ScanOptions) {
  const scanned: number[] = [];
  for await (const d of docs(file)) if (d.kind === 'branded' && d.popularity > 0) scanned.push(d.popularity);
  scanned.sort((a, b) => a - b);
  const median = scanned[Math.floor((scanned.length - 1) / 2)] ?? 0;

  const rand = rng(options.seed);
  const cells = new Map<string, ReturnType<typeof reservoir<Doc>>>();
  const generic = reservoir<Doc>(options.generic, rand);
  const counts = { total: 0, flagged: 0, bySource: {} as Record<string, number> };
  const missing = new Set(options.coverage);
  const wantedBrands = options.brands.map(norm);
  const brandsFound = new Set<string>();
  const wantedBarcodes = new Set(options.barcodes);
  const barcodesFound = new Set<string>();
  const accented = new Set<string>();

  for await (const d of docs(file)) {
    counts.total++;
    counts.flagged += d.flagged;
    counts.bySource[d.source] = (counts.bySource[d.source] || 0) + 1;
    if (d.kind === 'generic') generic.add(d);
    else {
      const cell = `${d.category}/${popularityBand(d.popularity, median)}`;
      if (!cells.has(cell)) cells.set(cell, reservoir<Doc>(options.branded, rand));
      cells.get(cell)!.add(d);
    }
    const brand = norm(d.brand || '');
    for (const wanted of wantedBrands) if (!brandsFound.has(wanted) && startsWord(brand, wanted)) brandsFound.add(wanted);
    if (d.barcode && wantedBarcodes.has(d.barcode)) barcodesFound.add(d.barcode);
    if (d.brand && /[^\x00-\x7F]|'/.test(d.brand)) accented.add(d.brand);
    for (const item of missing) if (isPresent(d, item)) missing.delete(item);
  }

  const branded = sampleCells(new Map([...cells].map(([k, r]) => [k, r.items])), options.branded, rand);
  return {
    counts,
    sample: [...branded, ...generic.items],
    missing: [...missing],
    brandsFound,
    barcodesFound,
    accentedBrands: shuffle([...accented].sort(), rand).slice(0, 20),
  };
}
