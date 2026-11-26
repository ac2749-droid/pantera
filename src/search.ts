/**
 * Pantera food search.
 *
 * - Matches as you type (every word is treated as a prefix)
 * - Tolerates typos (1 edit for 4–7 letters, 2 edits for 8+), including swapped letters
 * - Understands other names for foods (spaghetti → pasta, soda → carbonated beverage, …)
 * - Ranks simple, common foods above long, specific ones, and your own foods above everything
 */

export type SearchDoc<T> = {
  key: string;
  name: string;
  alias?: string; // extra searchable names ("hot dog, frank, wiener")
  boost: number; // added to the score (your foods, recents, curated list)
  item: T;
};

export type Hit<T> = { doc: SearchDoc<T>; score: number; matched: Set<string> };

// ---------- text normalization ----------

const STOP = new Set(['and', 'or', 'with', 'w', 'in', 'of', 'the', 'a', 'an', 'to', 'for', 'without', 'wo', 'from', 'made', 'style', 'type', 'ns', 'nfs', 'n', 'x']);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Light stemmer so singular/plural and y/ies forms meet: berry/berries → berri, cookie/cookies → cooki. */
export function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'i';
  if (t.length > 3 && t.endsWith('ie')) return t.slice(0, -1);
  if (t.length > 3 && /[^aeiou]y$/.test(t)) return t.slice(0, -1) + 'i';
  if (t.length > 4 && /(ches|shes|sses|xes|zes|oes)$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !/(ss|us|is)$/.test(t)) return t.slice(0, -1);
  return t;
}

function words(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((w) => w && !STOP.has(w));
}

// ---------- other names ----------

// Whole-phrase rewrites applied to the query before matching.
const PHRASES: [RegExp, string][] = [
  [/\bmac (and |n |)cheese\b/g, 'macaroni cheese'],
  [/\bhot ?dogs?\b/g, 'frankfurter'],
  [/\bpb ?(and |n |)j\b/g, 'peanut butter jelly'],
  [/\bpb\b/g, 'peanut butter'],
  [/\boj\b/g, 'orange juice'],
  [/\bfrench fries\b/g, 'french fried potato'],
  [/\bfries\b/g, 'french fried potato'],
  [/\bhash ?browns?\b/g, 'hash brown potato'],
  [/\bsoft drink\b/g, 'carbonated beverage'],
  [/\bsoda\b/g, 'carbonated beverage'],
  [/\bpop\b/g, 'carbonated beverage'],
  [/\bcoke\b/g, 'cola'],
  [/\bsprite\b/g, 'lemon lime soda'],
  [/\bgreek yoghurt\b/g, 'greek yogurt'],
  [/\bprotein shake\b/g, 'protein powder'],
  [/\bpeanut butter and jelly\b/g, 'peanut butter jelly'],
  [/\bice ?cream\b/g, 'ice cream'],
  [/\bsweet potatoes\b/g, 'sweet potato'],
];

// Single-word alternatives (both directions where it makes sense). Values are raw words; they get stemmed.
const SYNONYMS: Record<string, string[]> = {
  spaghetti: ['pasta'], penne: ['pasta'], macaroni: ['pasta'], linguine: ['pasta'], fettuccine: ['pasta'], fettucine: ['pasta'],
  lasagne: ['lasagna'], rigatoni: ['pasta'], ziti: ['pasta'], rotini: ['pasta'], farfalle: ['pasta'], lasagna: ['lasagna', 'pasta'], noodle: ['noodles', 'pasta'],
  yoghurt: ['yogurt'], ketchup: ['catsup'], catsup: ['ketchup'], burger: ['hamburger'], hamburger: ['burger'], cheeseburger: ['cheeseburger', 'hamburger'],
  steak: ['beef', 'steak'], chickpea: ['garbanzo'], chickpeas: ['garbanzo'], garbanzo: ['chickpea'], cilantro: ['coriander'],
  courgette: ['zucchini'], aubergine: ['eggplant'], prawn: ['shrimp'], prawns: ['shrimp'], scallion: ['onions', 'spring'],
  oatmeal: ['oats'], porridge: ['oatmeal', 'oats'], donut: ['doughnut'], doughnut: ['donut'], hoagie: ['sandwich'], sub: ['sandwich'],
  wrap: ['tortilla'], omelette: ['omelet', 'egg'], omelet: ['egg'], guac: ['guacamole'], candy: ['candies'], sweets: ['candies'],
  biscuit: ['biscuit', 'cookie'], jelly: ['jam', 'jelly'], jam: ['jelly'], mayo: ['mayonnaise'], soda: ['carbonated'],
  hotdog: ['frankfurter'], frank: ['frankfurter'], wiener: ['frankfurter'], bologna: ['bologna'], jello: ['gelatin'],
  cornflakes: ['corn', 'flakes'], granola: ['granola'], coffee: ['coffee'], latte: ['coffee', 'milk'], cappuccino: ['coffee'],
  espresso: ['coffee'], smoothie: ['smoothie', 'juice'], shake: ['milkshake', 'shake'], milkshake: ['shake'], fry: ['fried'],
  whey: ['whey', 'protein'], tofu: ['tofu'], edamame: ['soybeans'], ground: ['ground'], mince: ['ground'], minced: ['ground'],
  aubergines: ['eggplant'], zucchini: ['squash', 'zucchini'], capsicum: ['peppers'], rocket: ['arugula'], coriander: ['cilantro'],
  chips: ['chips', 'crisps'], crisps: ['chips'], pancake: ['pancakes'], waffle: ['waffles'], bun: ['roll', 'bun'], sourdough: ['sourdough', 'bread'],
  pita: ['pita'], naan: ['naan', 'bread'], bagel: ['bagels'], cereal: ['cereals'], soup: ['soup'], chili: ['chili'], chilli: ['chili'],
  teriyaki: ['teriyaki'], burrito: ['burrito'], taco: ['taco'], nacho: ['nachos'], quesadilla: ['quesadilla'], pizza: ['pizza'],
};

const SYN_BY_STEM = new Map<string, string[]>();
Object.entries(SYNONYMS).forEach(([k, v]) => {
  const key = stem(k);
  const list = v.map((w) => stem(normalize(w))).filter((w) => w !== key);
  SYN_BY_STEM.set(key, [...new Set([...(SYN_BY_STEM.get(key) || []), ...list])]);
});

// ---------- string distance (optimal string alignment, with early exit) ----------

function osa(a: string, b: string, max: number): number {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb];
}

// ---------- index ----------

type Posting = { name: number[]; alias: number[] };

// Words that usually describe an uncommon form of a food; lightly pushed down unless searched for.
const ODD = new Map<string, number>([
  ['dehydrated', 1.4], ['powder', 1.2], ['powdered', 1.2], ['industrial', 2], ['unprepared', 1.2], ['concentrate', 1],
  ['freeze', 1.2], ['dried', 0.5], ['dry', 0.7], ['babyfood', 2], ['imitation', 0.8], ['commodity', 1.5], ['school', 1],
  ['raw', 0.25], ['mix', 0.6], ['loaf', 0.9], ['oil', 0.8], ['broth', 0.6], ['sauce', 0.6], ['dressing', 0.6], ['meatless', 1.3], ['vegetarian', 1], ['dough', 0.8], ['refrigerated', 0.4], ['shoots', 0.8], ['leavening', 1.5], ['phosphate', 1.5], ['substitute', 0.8], ['formulated', 0.8], ['condensed', 0.5], ['canned', 0.2], ['frozen', 0.25],
].map(([w, v]) => [stem(w as string), v as number]));

export class SearchIndex<T> {
  docs: SearchDoc<T>[];
  private nameTerms: string[][];
  private aliasPhrases: Set<string>[];
  private heads: string[];
  private simpleFirst: boolean[]; // "Egg, large" (the food itself) vs "Egg roll" (a different food) // main noun of the name: "Cheddar cheese" → cheese, "Pizza, cheese" → pizza
  private postings = new Map<string, Posting>();
  private vocab: string[] = [];
  /** raw word → how many foods use it (for suggestions) */
  private display = new Map<string, number>();

  constructor(docs: SearchDoc<T>[]) {
    this.docs = docs;
    this.nameTerms = docs.map((d, i) => {
      const nameWords = words(d.name);
      const terms = nameWords.map(stem);
      terms.forEach((t) => this.post(t, i, 'name'));
      new Set(nameWords).forEach((w) => w.length > 2 && !/^\d/.test(w) && this.display.set(w, (this.display.get(w) || 0) + 1));
      if (d.alias) new Set(words(d.alias).map(stem)).forEach((t) => this.post(t, i, 'alias'));
      return terms;
    });
    this.vocab = [...this.postings.keys()];
    this.heads = docs.map((d) => {
      const first = words(d.name.split(',')[0].split(/\s(?:with|in|on|and)\s/i)[0]);
      return first.length ? stem(first[first.length - 1]) : '';
    });
    this.simpleFirst = docs.map((d) => words(d.name.split(',')[0]).length === 1);
    // "oatmeal, cooked" / "hot dog" as whole phrases, for exact other-name matches
    this.aliasPhrases = docs.map((d) => new Set((d.alias || '').split(',').map((a) => words(a).map(stem).join(' ')).filter(Boolean)));
  }

  private post(term: string, i: number, kind: 'name' | 'alias') {
    let p = this.postings.get(term);
    if (!p) this.postings.set(term, (p = { name: [], alias: [] }));
    const arr = p[kind];
    if (arr[arr.length - 1] !== i) arr.push(i);
  }

  /** Whether some food is named with this word (given as a stem). */
  knows(term: string): boolean {
    return this.postings.has(term);
  }

  /** Terms matching one query word, with a quality between 0 and 1. */
  private matchTerm(q: string, complete: boolean, known?: (term: string) => boolean): Map<string, number> {
    const out = new Map<string, number>();
    const set = (t: string, v: number) => {
      if ((out.get(t) ?? 0) < v) out.set(t, v);
    };
    // A real food word ("pita", "roti") is never "corrected" into a similar one ("potato", "pasta")
    const real = this.knows(q) || !!known?.(q);
    const maxE = real ? 0 : q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
    // A finished word that is a real food word ("spaghetti") shouldn't be outranked by longer words ("spaghettios").
    // But while typing, a rare exact word ("chick" from Chick-fil-A) shouldn't hide a common longer one ("chicken").
    const df = (t: string) => this.postings.get(t)?.name.length ?? 0;
    let prefixScale = 1;
    if (complete) prefixScale = 0.72;
    else if (this.postings.has(q)) {
      let maxLonger = 0;
      for (const t of this.vocab) if (t.length > q.length && t.startsWith(q)) maxLonger = Math.max(maxLonger, df(t));
      if (df(q) >= 0.3 * maxLonger) prefixScale = 0.72;
    }
    for (const t of this.vocab) {
      if (t === q) set(t, 1);
      else if (t.startsWith(q)) set(t, Math.max(0.5, (0.92 - (t.length - q.length) * 0.03) * prefixScale + 0.03 * Math.log10(1 + df(t))));
      else if (maxE) {
        const d = osa(q, t, maxE);
        if (d <= maxE) set(t, d === 1 ? 0.72 : 0.5);
        else if (t.length > q.length) {
          // A misspelled word that is still being typed: "spaget" → "spaghet(ti)"
          let dp = maxE + 1;
          for (const len of [q.length, q.length + 1, q.length - 1]) if (len > 2 && len < t.length) dp = Math.min(dp, osa(q, t.slice(0, len), maxE));
          if (dp <= maxE) set(t, dp === 1 ? 0.6 : 0.42);
        }
      }
    }
    // Other names: for the word itself and for close matches of it (so "spagetti" still finds pasta)
    [...out.entries()].forEach(([t, v]) => {
      if (v < 0.6) return;
      (SYN_BY_STEM.get(t) || []).forEach((syn) => this.postings.has(syn) && set(syn, Math.min(0.86, v * 0.88)));
    });
    SYN_BY_STEM.forEach((syns, key) => {
      let v = 0;
      if (key === q) v = 1;
      else if (!real && key.startsWith(q) && q.length >= 3) v = 0.8; // "roti" is a food, not the start of "rotini"
      else if (maxE && osa(q, key, maxE) <= maxE) v = 0.7;
      if (v) syns.forEach((syn) => this.postings.has(syn) && set(syn, Math.min(0.86, v * 0.88)));
    });
    return out;
  }

  /** `known` says which words are food words in another list searched alongside this one. */
  search(query: string, limit = 60, known?: (term: string) => boolean): Hit<T>[] {
    let qn = normalize(query);
    PHRASES.forEach(([re, rep]) => (qn = qn.replace(re, rep)));
    const qWords = qn.split(' ').filter((w) => w && !STOP.has(w));
    if (!qWords.length) return [];
    const qTerms = qWords.map(stem);

    // Per query word: doc index → best quality (and which terms matched)
    const endsWithSpace = /\s$/.test(query);
    const perWord = qTerms.map((q, wi) => {
      const terms = this.matchTerm(q, wi < qTerms.length - 1 || endsWithSpace, known);
      const docs = new Map<number, { v: number; t: string }>();
      terms.forEach((v, t) => {
        const p = this.postings.get(t)!;
        p.name.forEach((i) => {
          if ((docs.get(i)?.v ?? 0) < v) docs.set(i, { v, t });
        });
        p.alias.forEach((i) => {
          const av = v * 0.8;
          if ((docs.get(i)?.v ?? 0) < av) docs.set(i, { v: av, t });
        });
      });
      return docs;
    });

    const scoreDocs = (need: number, penalty: number) => {
      const counts = new Map<number, number>();
      perWord.forEach((m) => m.forEach((_, i) => counts.set(i, (counts.get(i) || 0) + 1)));
      const hits: Hit<T>[] = [];
      counts.forEach((c, i) => {
        if (c < need) return;
        const terms = this.nameTerms[i];
        const matched = new Set<string>();
        let sum = 0;
        perWord.forEach((m) => {
          const h = m.get(i);
          if (h) {
            sum += h.v;
            matched.add(h.t);
          }
        });
        let score = (sum / qTerms.length) * 10 * penalty;
        const unique = [...new Set(terms)];
        const covered = unique.filter((t) => matched.has(t)).length;
        // "Pasta, cooked" for "pasta": the food's main word matched directly (not only via another name)
        if (terms.length && matched.has(terms[0]) && perWord.some((m) => m.get(i)?.t === terms[0] && m.get(i)!.v >= 0.88)) score += 2.5;
        score += (3 * covered) / Math.max(unique.length, 1); // short, on-point names first
        score -= 0.07 * unique.length;
        let odd = 0;
        terms.forEach((t) => {
          const w = ODD.get(t);
          if (w && !matched.has(t)) odd += w;
        });
        score -= Math.min(odd, 2.4);
        if (this.heads[i] && matched.has(this.heads[i]) && (terms[0] !== this.heads[i] || !matched.has(terms[0]))) score += 1;
        if (this.simpleFirst[i] && matched.has(terms[0])) score += 0.6;
        if (this.aliasPhrases[i].has(qTerms.join(' '))) score += 4; // the query is exactly one of this food's other names
        score += this.docs[i].boost;
        hits.push({ doc: this.docs[i], score, matched });
      });
      return hits;
    };

    let hits = scoreDocs(qTerms.length, 1);
    if (hits.length < 3 && qTerms.length > 1) {
      const seen = new Set(hits.map((h) => h.doc.key));
      hits = hits.concat(scoreDocs(qTerms.length - 1, 0.6).filter((h) => !seen.has(h.doc.key)));
    }
    hits.sort((a, b) => b.score - a.score || a.doc.name.length - b.doc.name.length);
    return hits.slice(0, limit);
  }

  /**
   * Word completions for the word being typed: "spag" → spaghetti, spaghettios.
   * Pass the current hits so multi-word completions come from foods that actually match.
   */
  complete(query: string, hits?: Hit<T>[], max = 5): string[] {
    const qn = normalize(query);
    if (!qn || /\s$/.test(query)) return [];
    const parts = qn.split(' ');
    const last = parts[parts.length - 1];
    if (last.length < 2 || STOP.has(last)) return [];
    // Already a common, complete word: nothing to complete
    if ((this.display.get(last) || 0) >= 3) return [];
    const counts = new Map<string, number>();
    if (hits && parts.length > 1) {
      hits.slice(0, 40).forEach((h) => new Set(words(h.doc.name)).forEach((w) => w.startsWith(last) && w !== last && counts.set(w, (counts.get(w) || 0) + 1)));
    } else {
      this.display.forEach((n, w) => {
        if (w !== last && w.startsWith(last)) counts.set(w, n);
      });
    }
    // One suggestion per word family (broiler/broilers)
    const byStem = new Map<string, [string, number]>();
    counts.forEach((n, w) => {
      const k = stem(w);
      const cur = byStem.get(k);
      if (!cur || n > cur[1] || (n === cur[1] && w.length < cur[0].length)) byStem.set(k, [w, cur ? Math.max(n, cur[1]) : n]);
    });
    const out = [...byStem.values()];
    out.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
    return out.slice(0, max).map(([w]) => [...parts.slice(0, -1), w].join(' '));
  }

  /** A corrected query when nothing matches: "spagety" → "spaghetti" */
  didYouMean(query: string): string | null {
    const qWords = normalize(query).split(' ').filter(Boolean);
    let changed = false;
    const fixed = qWords.map((w) => {
      if (STOP.has(w) || this.postings.has(stem(w))) return w;
      let best: [string, number, number] | null = null; // word, distance, frequency
      const max = Math.max(2, Math.ceil(w.length / 3));
      this.display.forEach((n, cand) => {
        let d = osa(w, cand, max);
        // Partly typed words: compare with the start of the candidate too (small extra cost)
        if (cand.length > w.length) for (const len of [w.length, w.length + 1]) if (len < cand.length) d = Math.min(d, osa(w, cand.slice(0, len), max) + 0.5);
        if (cand.slice(0, 3) === w.slice(0, 3)) d -= 0.4; // same start is a strong hint
        if (d <= max && (!best || d < best[1] || (d === best[1] && n > best[2]))) best = [cand, d, n];
      });
      if (best) {
        changed = true;
        return (best as [string, number, number])[0];
      }
      return w;
    });
    return changed ? fixed.join(' ') : null;
  }
}

/** Split a name into pieces, flagging words that matched the query (for bold highlighting). */
export function highlight(name: string, matched: Set<string>): { text: string; hit: boolean }[] {
  return name.split(/(\s+|,|\/|\(|\))/).filter((s) => s !== '').map((part) => {
    const w = normalize(part);
    return { text: part, hit: !!w && !STOP.has(w) && matched.has(stem(w)) };
  });
}
