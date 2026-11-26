// The different ways a person might type the same food.

/** Plain lowercase words: no accents, apostrophes or punctuation. */
export function norm(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(' ');
}

type Named = { brand: string | null; name: string };

export function sameFood(a: Named, b: Named): boolean {
  return norm(a.brand || '') === norm(b.brand || '') && norm(a.name) === norm(b.name);
}

/** Seeded random numbers in [0, 1) (mulberry32), so every run can be repeated. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const below = (rand: () => number, n: number) => Math.floor(rand() * n);

export function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = below(rand, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The same words in another order; null when no other order exists. */
export function reorder(words: string[], rand: () => number): string | null {
  if (new Set(words).size < 2) return null;
  const original = words.join(' ');
  for (let tries = 0; tries < 20; tries++) {
    const out = shuffle(words, rand).join(' ');
    if (out !== original) return out;
  }
  return [...words.slice(1), words[0]].join(' ');
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

/** One missing, wrong or swapped letter, anywhere in one word of four or more letters. */
export function typo(words: string[], rand: () => number): string | null {
  const eligible = words.map((_, i) => i).filter((i) => words[i].length >= 4 && !/\p{N}/u.test(words[i]));
  if (!eligible.length) return null;
  const index = eligible[below(rand, eligible.length)];
  const word = words[index];
  const at = below(rand, word.length);
  const kind = below(rand, 3);
  let changed: string;
  if (kind === 0) changed = word.slice(0, at) + word.slice(at + 1);
  else if (kind === 1 && at + 1 < word.length && word[at] !== word[at + 1]) {
    changed = word.slice(0, at) + word[at + 1] + word[at] + word.slice(at + 2);
  } else {
    const others = LETTERS.replace(word[at], '');
    changed = word.slice(0, at) + others[below(rand, others.length)] + word.slice(at + 1);
  }
  return words.map((w, i) => (i === index ? changed : w)).join(' ');
}

/** The last word only half typed; null when it is shorter than four letters. */
export function halfLast(words: string[]): string | null {
  const last = words[words.length - 1];
  if (!last || last.length < 4) return null;
  return [...words.slice(0, -1), last.slice(0, Math.ceil(last.length / 2))].join(' ');
}
