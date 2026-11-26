/**
 * Share a saved meal (a "recipe") with another Pantera user, with no server and no account.
 * The meal is packed into a short text code ("PANTERA1:…") that fits in a text message or a QR code.
 * The code carries the nutrition itself, so the friend gets exactly the same numbers.
 */
import { CORE_NK, emptyNutrients, EXTRA_NK, NK } from './foods';
import type { SavedMeal } from './store';

export const SHARE_PREFIX = 'PANTERA1:';
const MAX_ITEMS = 40;

// A shared recipe also carries how many servings it makes and the finished weight
export type SharedMeal = { name: string; items: SavedMeal['items']; recipe?: { servings: number; cookedG?: number } };

// ---- UTF-8 + base64url, written out so it behaves the same on every phone ----
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else {
      c = Math.min(c, 0x10ffff);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
  }
  return out;
}

function utf8Decode(b: number[]): string {
  let s = '';
  for (let i = 0; i < b.length; ) {
    const x = b[i++];
    let c: number;
    if (x < 0x80) c = x;
    else if (x < 0xe0) c = ((x & 31) << 6) | (b[i++] & 63);
    else if (x < 0xf0) c = ((x & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    else c = ((x & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
    s += String.fromCodePoint(c);
  }
  return s;
}

function toB64(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) s += B64[n & 63];
  }
  return s;
}

function fromB64(s: string): number[] | null {
  const out: number[] = [];
  let buf = 0, bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 255);
    }
  }
  return out;
}

const round = (x: number) => Math.round((x || 0) * 100) / 100;
const text = (x: unknown, max: number) => (typeof x === 'string' ? x.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const numIn = (x: unknown, lo: number, hi: number) => (typeof x === 'number' && isFinite(x) && x >= lo && x <= hi ? x : null);

/** Pack a meal into a share code. */
export function encodeMeal(m: SharedMeal): string {
  const payload = {
    n: m.name.slice(0, 60),
    // Each food: [name, serving label, grams eaten, nutrients (trailing zeros dropped), serving grams if different]
    i: m.items.slice(0, MAX_ITEMS).map((it) => {
      const n = NK.map((k) => round(it.n[k]));
      while (n.length > 4 && n[n.length - 1] === 0) n.pop();
      const row: (string | number | number[])[] = [it.name.slice(0, 80), it.serving.slice(0, 40), round(it.grams), n];
      if (round(it.sg) !== round(it.grams)) row.push(round(it.sg));
      return row;
    }),
    ...(m.recipe ? { r: [round(m.recipe.servings), round(m.recipe.cookedG ?? 0)] } : {}),
  };
  return SHARE_PREFIX + toB64(utf8Encode(JSON.stringify(payload)));
}

/** Find a share code anywhere in a pasted message or scanned QR, and unpack it. Returns null if it isn't a valid code. */
export function decodeMeal(input: string): SharedMeal | null {
  const m = /PANTERA1:\s*([A-Za-z0-9_-]+(?:\s+[A-Za-z0-9_-]+)*)/.exec(input);
  if (!m) return null;
  // Usually the code is one unbroken token. Some apps (like email) wrap long lines, so also try joining the lines after it.
  const tokens = m[1].split(/\s+/);
  let obj: any = null;
  for (let n = tokens.length; n >= 1 && !obj; n--) {
    const bytes = fromB64(tokens.slice(0, n).join(''));
    if (!bytes) continue;
    try {
      obj = JSON.parse(utf8Decode(bytes));
    } catch {
      obj = null;
    }
  }
  if (!obj || !Array.isArray(obj.i)) return null;
  const items: SavedMeal['items'] = [];
  for (const row of obj.i.slice(0, MAX_ITEMS)) {
    if (!Array.isArray(row) || !Array.isArray(row[3])) continue;
    const name = text(row[0], 80);
    const grams = numIn(row[2], 0.1, 5000);
    if (!name || grams === null) continue;
    const n = emptyNutrients();
    NK.forEach((k, j) => (n[k] = numIn(row[3][j], 0, 100000) ?? 0));
    // Vitamins and minerals came along if any of the newer nutrients are present
    const mx = (row[3] as unknown[]).length > CORE_NK.length && EXTRA_NK.some((k) => n[k] > 0);
    items.push({ name, serving: text(row[1], 40) || `${Math.round(grams)} g`, sg: numIn(row[4], 0.1, 5000) ?? grams, grams, n, ...(mx ? { mx: true } : {}) });
  }
  if (!items.length) return null;
  const servings = Array.isArray(obj.r) ? numIn(obj.r[0], 0.1, 200) : null;
  const cookedG = Array.isArray(obj.r) ? numIn(obj.r[1], 1, 100000) : null;
  return { name: text(obj.n, 60) || 'Shared meal', items, ...(servings ? { recipe: { servings, ...(cookedG ? { cookedG } : {}) } } : {}) };
}

/** The message sent through WhatsApp, text, email… */
export function shareMessage(m: SharedMeal, kcal: number): string {
  const s = m.recipe?.servings ?? 1;
  return [
    m.recipe
      ? `🍲 Recipe: ${m.name} (${s} serving${s === 1 ? '' : 's'}, ${Math.round(kcal / s)} kcal each) — shared from Pantera`
      : `🍽️ ${m.name} (${Math.round(kcal)} kcal) — shared from Pantera`,
    '',
    'To add it: open Pantera → My foods → Import meal, then paste this whole message.',
    '',
    encodeMeal(m),
  ].join('\n');
}
