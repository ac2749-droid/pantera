/**
 * Turns parsed meal items into loggable foods: finds the best food match and works out the
 * amount in grams from the stated quantity, unit and size, using each food's household portions.
 */
import { FoodHit, ResultItem, searchFoods, toFood } from '../foodSearch';
import { Food, Portion, portionsOf } from '../foods';
import { normalize, SearchIndex, stem } from '../search';
import { newId } from '../util';
import { ParsedItem, Size, UnitDef } from './parse';

export type MealItem = {
  id: string;
  said: string; // what the user said, for reference
  query: string;
  food: Food | null;
  grams: number;
  portion: Portion; // unit shown and stored on the entry
  count: number; // how many of `portion`
  confidence: 'good' | 'check' | 'none';
  alternatives: Food[];
  parsed: ParsedItem;
  keepGrams?: boolean; // the weight was estimated from a photo, so it stays when the food is changed
};

const DESCRIPTIVE = new Set(['white', 'fresh', 'plain', 'regular', 'homemade', 'organic', 'whole', 'sliced', 'chopped', 'diced', 'shredded', 'grated', 'cold', 'hot', 'warm', 'little', 'extra', 'lean', 'natural', 'classic', 'original', 'simple', 'raw']);

const leadingCount = (label: string): number => {
  const m = label.trim().match(/^(\d+(?:\.\d+)?)?\s*(½|¼|¾|⅓|⅔|⅛)?/);
  const frac: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
  const whole = m && m[1] ? parseFloat(m[1]) : 0;
  const f = m && m[2] ? frac[m[2]] : 0;
  return whole + f || 1;
};
/** Grams per 1 of a measure portion: "2 tbsp" → per tbsp, "12 fl oz can" → per fl oz */
const perOne = (p: Portion) => p.g / leadingCount(p.label);
/** Grams per 1 item: "2 cookies" → per cookie, but "12 fl oz can" is one can */
const perItem = (p: Portion) => (/^[\d.½¼¾⅓⅔⅛\s]+(fl|oz|g|ml|lb|inch|in|"|-inch)\b/.test(p.label) ? p.g : perOne(p));
const itemLabel = (label: string) =>
  (/^[\d.½¼¾⅓⅔⅛\s]+(fl|oz|g|ml|lb|inch|in|"|-inch)\b/.test(label) ? label : label.replace(/^[\d.]+\s*[½¼¾⅓⅔⅛]?\s*/, '1 ')).replace(/\s*\(.*\)$/, '');
const hasWord = (label: string, words: string[]) => {
  const w = normalize(label).split(' ').map(stem);
  return words.some((x) => w.includes(stem(x)));
};
const MEASURE_WORDS = ['cup', 'tbsp', 'tablespoon', 'tsp', 'teaspoon', 'oz', 'fl', 'g', 'ml', 'lb', 'serving', 'nlea', 'crumbs'];

// Typical weight of one medium item, for foods whose database entry has no "1 each" portion
const EACH: Record<string, [number, string]> = {
  egg: [50, 'egg'], banana: [118, 'banana'], apple: [182, 'apple'], orange: [131, 'orange'], pear: [178, 'pear'], peach: [150, 'peach'],
  plum: [66, 'plum'], kiwi: [69, 'kiwi'], kiwifruit: [69, 'kiwi'], mango: [200, 'mango'], avocado: [150, 'avocado'], tomato: [123, 'tomato'],
  potato: [173, 'potato'], carrot: [61, 'carrot'], onion: [110, 'onion'], cucumber: [300, 'cucumber'], lemon: [58, 'lemon'], lime: [67, 'lime'],
  strawberry: [12, 'strawberry'], grape: [5, 'grape'], cherry: [8, 'cherry'], almond: [1.2, 'almond'], cookie: [15, 'cookie'], bagel: [105, 'bagel'],
  muffin: [113, 'muffin'], donut: [60, 'donut'], doughnut: [60, 'donut'], croissant: [57, 'croissant'], tortilla: [49, 'tortilla'], pancake: [77, 'pancake'],
  waffle: [75, 'waffle'], frankfurter: [45, 'hot dog'], sausage: [25, 'link'], bacon: [8, 'strip'], meatball: [30, 'meatball'], shrimp: [6, 'shrimp'],
  bread: [29, 'slice'], toast: [29, 'slice'], wing: [32, 'wing'], drumstick: [75, 'drumstick'], thigh: [85, 'thigh'], breast: [172, 'breast'],
  patty: [85, 'patty'], burger: [110, 'burger'], hamburger: [110, 'burger'], taco: [100, 'taco'], burrito: [220, 'burrito'], pickle: [35, 'pickle'],
  date: [8, 'date'], olive: [4, 'olive'], clementine: [74, 'clementine'], tangerine: [88, 'tangerine'], nectarine: [142, 'nectarine'],
};
const SIZE_FACTOR: Record<Size, number> = { small: 0.75, medium: 1, large: 1.3 };

function eachWeight(food: Food, query: string): [number, string] | null {
  const words = [...normalize(query).split(' '), normalize(food.name).split(' ')[0]];
  for (const w of words) {
    const hit = EACH[w] ?? EACH[stem(w)] ?? EACH[w.replace(/s$/, '')];
    if (hit) return hit;
  }
  return null;
}
const BEVERAGE = /\b(beverage|juice|milk|cola|soda|coffee|tea|water|beer|wine|drink|shake|smoothie|lemonade|kombucha|latte|nectar)\b/i;

function findPortion(food: Food, words: string[]): Portion | undefined {
  return portionsOf(food).find((p) => hasWord(p.label, words));
}

/** Grams per one natural unit of a food ("1 egg", "1 medium apple"), preferring the stated size. */
function naturalUnit(food: Food, size: Size | null, query = ''): { portion: Portion; g: number } {
  const ps = portionsOf(food);
  const sized = (label: string, g: number) => {
    // "1 banana" → "1 large banana" with a size adjustment when no exact size portion exists
    const f = size ? SIZE_FACTOR[size] : 1;
    const l = size && size !== 'medium' && !label.includes(size) ? label.replace(/^1 /, `1 ${size} `) : label;
    return { portion: { label: l, g: g * f }, g: g * f };
  };
  if (size) {
    const exact = ps.find((p) => hasWord(p.label, [size]));
    if (exact) return { portion: { label: exact.label.replace(/^\d+(\.\d+)?\s*/, '1 ').replace(/\s*\(.*\)$/, ''), g: perOne(exact) }, g: perOne(exact) };
  }
  const medium = ps.find((p) => hasWord(p.label, ['medium']));
  if (medium) {
    const g = perOne(medium) * (size ? SIZE_FACTOR[size] : 1);
    return { portion: { label: `1 ${size ?? 'medium'}`, g }, g };
  }
  // A countable portion such as "1 egg", "1 banana", "1 frankfurter", "1 slice" (not crumbs of a strip of fries)
  const countable = ps.find((p) => /^\d/.test(p.label) && !hasWord(p.label, MEASURE_WORDS) && perOne(p) >= 8);
  if (countable) return sized(itemLabel(countable.label), perItem(countable));
  const each = eachWeight(food, query);
  if (each) return sized(`1 ${each[1]}`, each[0]);
  return { portion: { label: food.serving, g: food.g }, g: food.g };
}

/** Work out grams for a parsed amount of a particular food. */
export function amountFor(food: Food, it: Pick<ParsedItem, 'qty' | 'unit' | 'size' | 'vague' | 'food'>, aiGrams?: number): { grams: number; portion: Portion; count: number } {
  const qty = it.qty ?? 1;
  let u: UnitDef | null = it.unit;
  // "12 oz coke" means fluid ounces
  if (u?.key === 'oz' && BEVERAGE.test(food.name + ' ' + it.food)) u = { key: 'floz', kind: 'volume', ml: 29.5735, label: 'fl oz' };
  if (u?.kind === 'mass') {
    const grams = qty * u.g;
    if (u.key === 'oz') return { grams, portion: { label: '1 oz', g: u.g }, count: qty };
    return { grams, portion: { label: '1 g', g: 1 }, count: Math.round(grams * 10) / 10 };
  }
  if (u?.kind === 'volume') {
    const ml = qty * u.ml;
    // Use the food's own cup/tbsp/tsp measure for its real density; otherwise assume water-like
    const cup = findPortion(food, ['cup']);
    const tbsp = findPortion(food, ['tbsp', 'tablespoon']);
    const tsp = findPortion(food, ['tsp', 'teaspoon']);
    const floz = findPortion(food, ['fl']);
    let gPerMl = 1;
    if (cup) gPerMl = perOne(cup) / 240;
    else if (tbsp) gPerMl = perOne(tbsp) / 15;
    else if (tsp) gPerMl = perOne(tsp) / 5;
    else if (floz) gPerMl = perOne(floz) / 29.57;
    const unitG = u.ml * gPerMl;
    return { grams: ml * gPerMl, portion: { label: `1 ${u.label}`, g: unitG }, count: qty };
  }
  if (u?.kind === 'count') {
    if (u.key === 'serving') return { grams: qty * food.g, portion: { label: food.serving, g: food.g }, count: qty };
    const p = findPortion(food, u.words);
    if (p) {
      const g = perItem(p);
      return { grams: qty * g, portion: { label: itemLabel(p.label), g }, count: qty };
    }
    if (aiGrams && aiGrams > 0) return { grams: aiGrams, portion: { label: `1 ${u.label}`, g: aiGrams / qty }, count: qty };
    // A can of tuna or chicken is ~5 oz drained, a can of soup ~10.5 oz, beans or vegetables ~15 oz; drinks are 12 fl oz
    const canG = u.key === 'can' ? (/\b(tuna|salmon|chicken|sardine|crab|ham)\b/i.test(food.name) ? 142 : /\bsoup\b/i.test(food.name) ? 305 : /\b(beans?|corn|peas|tomato|vegetable|chickpea|pumpkin|fruit|peach|pear|pineapple)/i.test(food.name) ? 425 : undefined) : undefined;
    // "2 slices" of a food listed only as a whole pizza, pie or loaf: use a typical slice, never the whole thing
    const sliceG =
      u.key === 'slice'
        ? /\bpizza\b/i.test(food.name) ? 110 : /\b(cake|pie|cheesecake|quiche|loaf)\b/i.test(food.name) ? 100 : /\b(cheese|ham|turkey|salami|bologna|beef|chicken)\b/i.test(food.name) ? 28 : Math.min(150, naturalUnit(food, it.size, it.food).g)
        : undefined;
    const g = canG ?? sliceG ?? u.fallbackG ?? naturalUnit(food, it.size, it.food).g;
    return { grams: qty * g, portion: { label: `1 ${u.label}`, g }, count: qty };
  }
  // No unit: "2 eggs", "a medium apple", "lettuce"
  if (aiGrams && aiGrams > 0 && it.qty === null) {
    return { grams: aiGrams, portion: { label: '1 g', g: 1 }, count: Math.round(aiGrams) };
  }
  const nat = naturalUnit(food, it.size, it.food);
  if (it.qty === null) {
    // Nothing stated: one natural unit; vague amounts ("some tomato") get half a serving
    if (it.vague) return { grams: food.g / 2, portion: { label: food.serving, g: food.g }, count: 0.5 };
    return { grams: nat.g, portion: nat.portion, count: 1 };
  }
  return { grams: qty * nat.g, portion: nat.portion, count: qty };
}

function bestHits(query: string, personal: SearchIndex<ResultItem>): { hits: FoodHit[]; q: string } {
  let q = query;
  let hits = searchFoods(q, personal, 'all', 6);
  if (!hits.length) {
    // Drop descriptive words ("white", "fresh", "plain") and try again
    const trimmed = q.split(' ').filter((w) => !DESCRIPTIVE.has(w)).join(' ');
    if (trimmed && trimmed !== q) {
      q = trimmed;
      hits = searchFoods(q, personal, 'all', 6);
    }
  }
  return { hits, q };
}

/** Match one parsed item to a food and amount. */
export function resolveItem(it: ParsedItem, personal: SearchIndex<ResultItem>, aiGrams?: number): MealItem {
  const { hits, q } = bestHits(it.food, personal);
  const id = newId();
  if (!hits.length) {
    return { id, said: it.raw, query: q, food: null, grams: 0, portion: { label: '1 g', g: 1 }, count: 0, confidence: 'none', alternatives: [], parsed: it };
  }
  // Prefer a close match that fits what was said: a portion in the stated size, and cooked over dry
  let pick = 0;
  const saysDry = /\b(dry|raw|uncooked|powder)\b/.test(it.food);
  const close = hits.filter((h) => h.score >= hits[0].score - 2.5);
  if (it.size) {
    const i = close.findIndex((h) => portionsOf(toFood(h.doc.item)).some((p) => hasWord(p.label, [it.size!])));
    if (i > 0) pick = i;
  }
  if (!saysDry && /\bdry\b/i.test(hits[pick].doc.name)) {
    const i = hits.findIndex((h) => /\bcooked|prepared\b/i.test(h.doc.name) && h.score >= hits[0].score - 4);
    if (i >= 0) pick = i;
  }
  const top = hits[pick];
  const food = toFood(top.doc.item);
  const qWords = normalize(q).split(' ').filter((w) => w.length > 1);
  const matchedAll = qWords.every((w) => [...top.matched].some((m) => m.startsWith(stem(w).slice(0, 4))));
  const confidence: MealItem['confidence'] = matchedAll && top.score >= 9 ? 'good' : 'check';
  const amt = amountFor(food, it, aiGrams);
  return {
    id,
    said: it.raw,
    query: q,
    food,
    grams: Math.round(amt.grams * 10) / 10,
    portion: amt.portion,
    count: Math.round(amt.count * 100) / 100,
    confidence,
    alternatives: hits.filter((_, i) => i !== pick).map((h) => toFood(h.doc.item)),
    parsed: it,
  };
}

/** Swap an item's food, keeping what the user said about the amount, or the weight seen in a photo. */
export function swapFood(item: MealItem, food: Food): MealItem {
  const amt = item.keepGrams && item.grams > 0 ? { grams: item.grams, portion: { label: '1 g', g: 1 }, count: item.grams } : amountFor(food, item.parsed);
  const others = [item.food, ...item.alternatives].filter((f): f is Food => !!f && f.id !== food.id);
  return { ...item, food, grams: Math.round(amt.grams * 10) / 10, portion: amt.portion, count: Math.round(amt.count * 100) / 100, confidence: 'good', alternatives: others };
}

/** A food picked by hand and added to the list: one ordinary portion of it. */
export function itemFromFood(food: Food): MealItem {
  const parsed: ParsedItem = { raw: '', qty: null, unit: null, size: null, food: food.name.toLowerCase(), vague: false };
  return swapFood({ id: newId(), said: '', query: parsed.food, food: null, grams: 0, portion: { label: '1 g', g: 1 }, count: 0, confidence: 'good', alternatives: [], parsed }, food);
}
