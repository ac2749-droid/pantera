/**
 * Pantera meal reader: turns "a white tortilla wrap with about 60g chicken breast, some tomato
 * and a tbsp of mayo" into separate items with amounts. No AI, works offline.
 */
import type { MealKey } from '../foods';

export type Size = 'small' | 'medium' | 'large';

export type UnitDef =
  | { key: string; kind: 'mass'; g: number; label: string }
  | { key: string; kind: 'volume'; ml: number; label: string }
  | { key: string; kind: 'count'; words: string[]; label: string; fallbackG?: number };

export type ParsedItem = {
  raw: string; // the words this item came from
  qty: number | null; // null = not stated
  unit: UnitDef | null;
  size: Size | null;
  food: string; // what to search for
  vague: boolean; // "some", "a bit of"
};

export type ParsedMeal = { items: ParsedItem[]; meal: MealKey | null; dayOffset: number };

// ---------- units ----------

const U = {
  g: { key: 'g', kind: 'mass', g: 1, label: 'g' },
  kg: { key: 'kg', kind: 'mass', g: 1000, label: 'kg' },
  oz: { key: 'oz', kind: 'mass', g: 28.3495, label: 'oz' },
  lb: { key: 'lb', kind: 'mass', g: 453.592, label: 'lb' },
  ml: { key: 'ml', kind: 'volume', ml: 1, label: 'ml' },
  l: { key: 'l', kind: 'volume', ml: 1000, label: 'L' },
  floz: { key: 'floz', kind: 'volume', ml: 29.5735, label: 'fl oz' },
  cup: { key: 'cup', kind: 'volume', ml: 240, label: 'cup' },
  tbsp: { key: 'tbsp', kind: 'volume', ml: 15, label: 'tbsp' },
  tsp: { key: 'tsp', kind: 'volume', ml: 5, label: 'tsp' },
  glass: { key: 'glass', kind: 'volume', ml: 240, label: 'glass' },
  can: { key: 'can', kind: 'count', words: ['can'], label: 'can', fallbackG: 355 },
  bottle: { key: 'bottle', kind: 'count', words: ['bottle'], label: 'bottle', fallbackG: 500 },
  bowl: { key: 'bowl', kind: 'count', words: ['bowl'], label: 'bowl', fallbackG: 300 },
  plate: { key: 'plate', kind: 'count', words: ['plate', 'serving'], label: 'plate', fallbackG: 350 },
  slice: { key: 'slice', kind: 'count', words: ['slice'], label: 'slice' },
  piece: { key: 'piece', kind: 'count', words: ['piece', 'pc', 'item', 'unit'], label: 'piece' },
  serving: { key: 'serving', kind: 'count', words: ['serving'], label: 'serving' },
  scoop: { key: 'scoop', kind: 'count', words: ['scoop'], label: 'scoop', fallbackG: 31 },
  handful: { key: 'handful', kind: 'count', words: ['handful'], label: 'handful', fallbackG: 30 },
  bar: { key: 'bar', kind: 'count', words: ['bar'], label: 'bar' },
  stick: { key: 'stick', kind: 'count', words: ['stick'], label: 'stick' },
  clove: { key: 'clove', kind: 'count', words: ['clove'], label: 'clove', fallbackG: 3 },
  leaf: { key: 'leaf', kind: 'count', words: ['leaf', 'leaves'], label: 'leaf', fallbackG: 10 },
  strip: { key: 'strip', kind: 'count', words: ['strip', 'slice'], label: 'strip' },
  fillet: { key: 'fillet', kind: 'count', words: ['fillet'], label: 'fillet' },
  patty: { key: 'patty', kind: 'count', words: ['patty'], label: 'patty' },
  link: { key: 'link', kind: 'count', words: ['link'], label: 'link' },
  packet: { key: 'packet', kind: 'count', words: ['packet', 'package', 'pouch'], label: 'packet' },
  container: { key: 'container', kind: 'count', words: ['container'], label: 'container' },
  wedge: { key: 'wedge', kind: 'count', words: ['wedge'], label: 'wedge' },
  shot: { key: 'shot', kind: 'volume', ml: 44, label: 'shot' },
  pinch: { key: 'pinch', kind: 'mass', g: 0.4, label: 'pinch' },
} satisfies Record<string, UnitDef>;

const UNIT_WORDS: Record<string, UnitDef> = {};
const alias = (u: UnitDef, ...words: string[]) => words.forEach((w) => (UNIT_WORDS[w] = u));
alias(U.g, 'g', 'gr', 'gm', 'gms', 'gram', 'grams', 'gramm', 'grammes');
alias(U.kg, 'kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms');
alias(U.oz, 'oz', 'ozs', 'ounce', 'ounces');
alias(U.lb, 'lb', 'lbs', 'pound', 'pounds');
alias(U.ml, 'ml', 'mls', 'milliliter', 'milliliters', 'millilitre', 'millilitres');
alias(U.l, 'l', 'liter', 'liters', 'litre', 'litres');
alias(U.cup, 'cup', 'cups', 'c', 'cupful', 'mug', 'mugs');
alias(U.tbsp, 'tbsp', 'tbsps', 'tbs', 'tbp', 'tbl', 'tbls', 'tblsp', 'tablespoon', 'tablespoons', 'spoon', 'spoons', 'spoonful', 'spoonfuls');
alias(U.tsp, 'tsp', 'tsps', 'teaspoon', 'teaspoons');
alias(U.glass, 'glass', 'glasses');
alias(U.can, 'can', 'cans', 'tin', 'tins');
alias(U.bottle, 'bottle', 'bottles');
alias(U.bowl, 'bowl', 'bowls', 'bowlful');
alias(U.plate, 'plate', 'plates', 'plateful');
alias(U.slice, 'slice', 'slices');
alias(U.piece, 'piece', 'pieces', 'pc', 'pcs');
alias(U.serving, 'serving', 'servings', 'portion', 'portions', 'helping', 'helpings');
alias(U.scoop, 'scoop', 'scoops');
alias(U.handful, 'handful', 'handfuls');
alias(U.bar, 'bar', 'bars');
alias(U.stick, 'stick', 'sticks');
alias(U.clove, 'clove', 'cloves');
alias(U.leaf, 'leaf', 'leaves');
alias(U.strip, 'strip', 'strips', 'rasher', 'rashers');
alias(U.fillet, 'fillet', 'fillets', 'filet', 'filets');
alias(U.patty, 'patty', 'patties');
alias(U.link, 'link', 'links');
alias(U.packet, 'packet', 'packets', 'pack', 'packs', 'package', 'packages', 'pouch', 'sachet');
alias(U.container, 'container', 'containers', 'cup_container', 'tub');
alias(U.wedge, 'wedge', 'wedges');
alias(U.shot, 'shot', 'shots');
alias(U.pinch, 'pinch', 'dash', 'sprinkle');

export const unitFromWord = (w: string): UnitDef | null => UNIT_WORDS[w.toLowerCase().replace(/\.$/, '')] ?? null;

// ---------- numbers ----------

const NUM_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, dozen: 12, couple: 2, pair: 2, few: 3, several: 3, half: 0.5, quarter: 0.25,
  double: 2, triple: 3,
};
const VAGUE = new Set(['some', 'little', 'bit', 'splash', 'drizzle', 'touch', 'bunch', 'lot', 'lots', 'side']);
const FRACTIONS: Record<string, string> = { '½': ' 1/2', '¼': ' 1/4', '¾': ' 3/4', '⅓': ' 1/3', '⅔': ' 2/3', '⅛': ' 1/8' };

function parseNumberToken(tok: string): number | null {
  if (/^\d+([.,]\d+)?$/.test(tok)) return parseFloat(tok.replace(',', '.'));
  const frac = tok.match(/^(\d+)\/(\d+)$/);
  if (frac && +frac[2] > 0) return +frac[1] / +frac[2];
  const range = tok.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
  if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  return null;
}

// ---------- cleanup ----------

const SIZE_WORDS: Record<string, Size> = {
  small: 'small', smallish: 'small', little_size: 'small', mini: 'small', medium: 'medium', regular: 'medium', average: 'medium', normal: 'medium',
  large: 'large', big: 'large', jumbo: 'large', huge: 'large', xl: 'large',
};

// Words that carry no food meaning in a spoken log
const FILLER = new Set([
  'hey', 'hi', 'hello', 'yo', 'chat', 'pantera', 'please', 'pls', 'thanks', 'thank', 'you', 'could', 'would', 'will', 'log', 'logged', 'add', 'added',
  'track', 'record', 'put', 'enter', 'that', 'this', 'it', 'them', 'those', 'these', 'in', 'into', 'for', 'me', 'my', 'i', 'ive', 'im', 'id', 'we', 'just', 'ate', 'eat',
  'eaten', 'eating', 'had', 'have', 'having', 'drank', 'drink', 'drinking', 'consumed', 'got', 'get', 'today', 'yesterday', 'tonight', 'morning', 'earlier', 'also', 'then',
  'around', 'about', 'approximately', 'approx', 'roughly', 'like', 'maybe', 'probably', 'kind', 'sort', 'sized', 'size', 'so', 'ok', 'okay', 'um', 'uh', 'was', 'were',
  'is', 'are', 'be', 'been', 'did', 'do', 'at', 'on', 'as', 'the', 'to', 'up', 'too', 'meal', 'food', 'there', 'here', 'what', 'which', 'wanna', 'want', 'need', 'something',
  'breakfast', 'lunch', 'dinner', 'supper', 'snack', 'snacks', 'brunch', 'brekkie', 'dessert', 'x',
]);

// Food names containing "and"/"with" that must not be split apart
const PROTECTED = [
  'mac and cheese', 'macaroni and cheese', 'peanut butter and jelly', 'pb and j', 'salt and pepper', 'sweet and sour', 'fish and chips',
  'rice and beans', 'beans and rice', 'chips and salsa', 'bread and butter', 'half and half', 'cookies and cream', 'pork and beans',
  'biscuits and gravy', 'chicken and waffles', 'ham and cheese', 'bacon egg and cheese', 'sausage egg and cheese', 'egg and cheese',
  'spaghetti and meatballs', 'franks and beans', 'oil and vinegar', 'surf and turf', 'sour cream and onion', 'spinach and artichoke',
  'with meat sauce', 'with meatballs', 'with tomato sauce', 'with marinara', 'with cheese sauce', 'chicken and rice soup', 'chicken and dumplings',
  'lox and cream cheese', 'bangers and mash', 'corned beef and cabbage', 'strawberries and cream',
];

// Everyday names → names the food database knows
const REWRITES: [RegExp, string][] = [
  [/\bwhite (tortilla )?wrap\b/g, 'flour tortilla'],
  [/\bwhite tortilla\b/g, 'flour tortilla'],
  [/\b(whole )?wheat (tortilla )?wrap\b/g, 'whole wheat tortilla'],
  [/\btortilla wrap\b/g, 'flour tortilla'],
  [/\b(chicken|turkey|veggie|vegetable|tuna|egg|steak|beef|ham|falafel) wrap\b/g, '$1, flour tortilla'], // "chicken wrap" → chicken + tortilla
  [/\bpb ?(and |& ?|n )?j\b/g, 'peanut butter and jelly'],
  [/\bpb\b/g, 'peanut butter'],
  [/\bmayo\b/g, 'mayonnaise'],
  [/\boj\b/g, 'orange juice'],
  [/\bevoo\b/g, 'olive oil'],
  [/\btomatoe\b/g, 'tomato'],
  [/\bpotatoe\b/g, 'potato'],
  [/\bchicken breasts?\b/g, 'chicken breast'],
  [/\bhard ?boiled eggs?\b/g, 'egg hard-boiled'],
  [/\bboiled eggs?\b/g, 'egg hard-boiled'],
  [/\bscrambled eggs?\b/g, 'egg scrambled'],
  [/\bfried eggs?\b/g, 'egg fried'],
  [/\bblack coffee\b/g, 'coffee black'],
  [/(^|[^h] )toast\b/g, '$1white bread'], // not "french toast"; a slice of toast weighs about the same as bread
  [/\boatmeal\b(?! cookie| bread| raisin)/g, 'oats cooked water'],
  [/\bporridge\b/g, 'oats cooked water'],
  [/\b(french )?fries\b/g, 'fast foods potato french fried'],
];

// "I had 6 oz. steak": the dot shortens the unit when a quantity opens the phrase and small letters follow.
// Elsewhere ("Chicken 6 oz. Rice 1 cup.") it ends a sentence.
const SHORTENED_UNIT = /((?:^|[,;.!?\n]|\b(?:[Hh]ad|[Aa]te|[Aa]nd|[Ww]ith|[Pp]lus|[Aa]bout|[Oo]f|[Aa]n?|[Ll]og|[Aa]dd))\s*[\d/.½¼¾⅓⅔]+\s*(?:[Ll][Bb][Ss]?|[Oo][Zz]|[Tt][Ss][Pp]|[Tt][Bb][Ss][Pp]?))\.(?=\s*[a-z])/g;

/** `rewrite: false` keeps everyday names as said, for showing them back. */
function normalizeText(s: string, rewrite = true): string {
  let t = s.replace(SHORTENED_UNIT, '$1').toLowerCase();
  Object.entries(FRACTIONS).forEach(([f, r]) => (t = t.split(f).join(r)));
  t = t
    .replace(/(\d),(\d{3})\b/g, '$1$2') // "1,000 g"
    .replace(/(\d),(\d{1,2})(?=\s*(?:kg|g|oz|lbs?|ml|l|cups?|tbsp|tsp)\b)/g, '$1.$2') // "2,5 oz", but not "rice 150,2 eggs"
    .replace(/(^|\s)\.(\d)/g, '$10.$2') // ".5 cup"
    .replace(/[’']/g, '')
    .replace(/(\d)\s*-\s*(\d)/g, '$1-$2') // ranges "2 - 3" → "2-3"
    .replace(/(\d)(?:\s*)(g|gr|gm|gms|kg|oz|lb|lbs|ml|l|cups?|tbsp|tsp)\b/g, '$1 $2') // "60g" → "60 g"
    .replace(/\bfl\.?\s*oz\b/g, 'floz')
    .replace(/\bfluid ounces?\b/g, 'floz')
    .replace(/(\d)x\b/g, '$1')
    .replace(/\bx(\d)/g, '$1')
    // "at 8 I had…" is a time, not an amount
    .replace(/\bat (?:about |around )?\d{1,2}(?::\d{2})?(?:\s*(?:a\.?m\.?|p\.?m\.?|oclock))?(?=\s+(?:i|we|for|had|ate|my|the|and)\b|\s*[,.;]|\s*$)/g, ' ')
    .replace(/\b(\d+) or (\d+)\b/g, (_, a, b) => String((+a + +b) / 2))
    .replace(/\bone and a half\b/g, '1.5')
    .replace(/\b(\d+) and a half\b/g, (_, n) => String(+n + 0.5))
    .replace(/\ba half\b/g, 'half')
    .replace(/\bhalf an?\b/g, 'half')
    .replace(/\ba (little|bit|splash|drizzle|touch) (of )?/g, 'some ')
    .replace(/\ba lot of\b/g, 'some')
    .replace(/\b(can|could|would|will) you( please)?\b/g, ' ')
    .replace(/\b(please )?(log|add|track|record|enter|put)( that| this| it| them| these| those)?( in| into| down)?( my (diary|log))?( for me)?\b/g, ' ')
    .replace(/[()[\]{}"*#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (rewrite) REWRITES.forEach(([re, rep]) => (t = t.replace(re, rep)));
  return t;
}

// ---------- meal & day words ----------

function detectMeal(t: string): MealKey | null {
  if (/\b(breakfast|brekkie|brunch|this morning)\b/.test(t)) return 'breakfast';
  if (/\blunch\b/.test(t)) return 'lunch';
  if (/\b(dinner|supper|tonight)\b/.test(t)) return 'dinner';
  if (/\b(snacks?|dessert)\b/.test(t)) return 'snacks';
  return null;
}

// ---------- item parsing ----------

function parseSegment(seg: string): ParsedItem | null {
  const raw = seg.trim();
  let toks = raw.split(' ').filter(Boolean);
  let qty: number | null = null;
  let unit: UnitDef | null = null;
  let size: Size | null = null;
  let vague = false;

  // sizes can appear anywhere ("a medium apple", "apple medium sized")
  toks = toks.filter((w, idx) => {
    const s = SIZE_WORDS[w];
    if (s && !(w === 'big' && toks[idx + 1] === 'mac')) {
      size = s;
      return false;
    }
    return true;
  });

  const takeQty = (arr: string[], i: number): [number | null, number] => {
    // returns [quantity, tokens consumed]
    const w = arr[i];
    if (w === undefined) return [null, 0];
    const n = parseNumberToken(w);
    if (n !== null) {
      const next = arr[i + 1] ? parseNumberToken(arr[i + 1]) : null;
      if (next !== null && next < 1 && Number.isInteger(n) && /\//.test(arr[i + 1])) return [n + next, 2]; // "1 1/2"
      return [n, 1];
    }
    if (w in NUM_WORDS) {
      if ((w === 'a' || w === 'an') && arr[i + 1] === 'half') return [0.5, 2];
      if (w === 'half' && (arr[i + 1] === 'a' || arr[i + 1] === 'an')) return [0.5, 2];
      if ((w === 'a' || w === 'an') && (arr[i + 1] === 'couple' || arr[i + 1] === 'few' || arr[i + 1] === 'dozen' || arr[i + 1] === 'pair')) return [NUM_WORDS[arr[i + 1]], 2];
      return [NUM_WORDS[w], 1];
    }
    if (VAGUE.has(w)) {
      vague = true;
      return [null, 1];
    }
    return [null, 0];
  };

  // Leading quantity and unit: "about 60 g of chicken", "2 slices of bread", "a cup of rice"
  let i = 0;
  while (toks[i] && FILLER.has(toks[i]) && !(toks[i] in NUM_WORDS)) i++;
  const [q, used] = takeQty(toks, i);
  if (used) {
    qty = q;
    i += used;
    if (toks[i] === 'of') i++;
  }
  // a size word may sit between quantity and unit ("2 large slices")
  const maybeUnit = toks[i] ? unitFromWord(toks[i]) : null;
  // "a" alone must not be read as a unit ("c" or "l" only count right after a number)
  if (maybeUnit && !((toks[i] === 'c' || toks[i] === 'l') && qty === null)) {
    unit = maybeUnit;
    i++;
    if (toks[i] === 'of') i++;
  }
  let rest = toks.slice(i);
  if (!unit && (toks[i - used] === 'a' || toks[i - used] === 'an') && rest.length > 2) {
    const last = unitFromWord(rest[rest.length - 1]);
    const amount = parseNumberToken(rest[rest.length - 2]);
    if (last && amount !== null) {
      qty = amount;
      unit = last;
      rest = rest.slice(0, -2);
    }
  }

  // Trailing quantity: "chicken breast 60 g", "eggs 2", "apple x2"
  if (qty === null && !unit && rest.length >= 2) {
    let end = rest.length;
    const lastUnit = unitFromWord(rest[end - 1]);
    let trailingUnit: UnitDef | null = null;
    if (lastUnit && parseNumberToken(rest[end - 2] ?? '') !== null) {
      trailingUnit = lastUnit;
      end--;
    }
    // one or two number tokens ("1 1/2")
    const n1 = parseNumberToken(rest[end - 1] ?? '');
    if (n1 !== null) {
      let total = n1;
      let start = end - 1;
      const n0 = start > 0 ? parseNumberToken(rest[start - 1]) : null;
      if (n0 !== null && Number.isInteger(n0) && /\//.test(rest[end - 1])) {
        total = n0 + n1;
        start--;
      }
      if (start > 0) {
        qty = total;
        unit = trailingUnit;
        rest = rest.slice(0, start);
      }
    }
  }

  // A quantity + unit in the middle: "chicken 60 g breast" is rare; ignore. Drop filler words.
  rest = rest.filter((w) => !FILLER.has(w) && w !== 'of' && !VAGUE.has(w) && !(w in NUM_WORDS && w !== 'half'));
  const food = rest.join(' ').replace(/^(and|with|plus|some)\s+/, '').trim();
  if (!food || !/[a-z]{2,}/.test(food)) return null;
  return { raw, qty, unit, size, food, vague };
}

// Common combos that the food database doesn't have as one item, spelled out as ingredients
const EXPANSIONS: [RegExp, string][] = [
  // "a protein shake with 1 scoop whey and milk" → just the ingredients; a sandwich's bread becomes an item
  [/\b(protein )?(shake|smoothie) with\b/g, ','],
  [/\bsandwich with\b/g, ', 2 slices white bread,'],
  [/\bpeanut butter and jelly( sandwich)?\b/g, '2 slices white bread, 2 tbsp peanut butter, 1 tbsp jelly'],
  [/\bblt( sandwich)?\b/g, '2 slices white bread, 3 strips bacon, 1 leaf lettuce, 2 slices tomato, 1 tbsp mayonnaise'],
  [/\bavocado white bread\b/g, '1 slice white bread, half avocado'],
  [/\bcereal and milk\b/g, 'cereal, 1 cup milk'],
];

// Speech often arrives without commas: "2 fried eggs 1 pita a coffee"
const STARTERS = new Set(['a', 'an', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'another', 'half', 'some']);
// A number after one of these belongs to what came before: "chicken in a wrap", "number 1", "vitamin b 12"
const HOLDS_NUMBER = new Set(['in', 'on', 'of', 'with', 'from', 'at', 'like', 'about', 'half', 'quite', 'such', 'number', 'no', 'vitamin', 'omega', 'b', 'q', 'for', 'to', 'and', 'or', 'than', 'per', 'around', 'just', 'only', 'x', 'fil']);
// What follows these is what they are made of, not another thing eaten
const MADE_OF = new Set(['omelette', 'omelet', 'omelettes', 'omelets', 'smoothie', 'smoothies', 'shake', 'scramble']);
// A number before one of these describes the food: "2 percent milk", "6 inch sub", "100 calorie pack"
const DESCRIBES = new Set(['percent', '%', 'inch', 'inches', 'in', 'up', 'calorie', 'calories', 'cal', 'cals', 'kcal', 'la']);
const SMALL_WORDS = new Set(['a', 'an', 'and', 'of', 'some', 'with', 'quarter', 'dozen', 'couple', 'pair', 'few']);

/** Where one segment holds several foods said back to back, cuts it before each new amount. */
function splitRunOn(segment: string): string[] {
  const words = segment.split(' ').filter(Boolean);
  const amount = (w: string | undefined) => !!w && (parseNumberToken(w) !== null || STARTERS.has(w));
  const names = (w: string) => !amount(w) && !FILLER.has(w) && !SMALL_WORDS.has(w) && !SIZE_WORDS[w] && !unitFromWord(w) && !(w in NUM_WORDS);
  const parts: string[] = [];
  let from = 0;
  let named = false; // this part already has a food in it
  let amountFirst: boolean | undefined; // whether this part began with its amount
  const cut = (at: number) => {
    parts.push(words.slice(from, at).join(' '));
    from = at;
    named = false;
    amountFirst = undefined;
  };
  let dish = false; // inside "omelette …" the rest lists what is in it
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const next = words[i + 1];
    let after = i + 1; // past the rest of the number: "1 1/2 cups"
    while (words[after] && parseNumberToken(words[after]) !== null) after++;
    // "wings 6 fries 1": when the food came first, its amount follows it
    if (!dish && named && amountFirst === false && i > from && amount(word) && word !== 'a' && word !== 'an' && !HOLDS_NUMBER.has(words[i - 1]) && !DESCRIBES.has(next ?? '')) {
      const end = words[after] && unitFromWord(words[after]) ? after + 1 : after;
      const follows = words[end];
      if (follows && (amount(follows) || (names(follows) && words.slice(end + 1).some((w) => amount(w))))) {
        cut(end);
        i = end - 1;
        continue;
      }
    }
    const startsNew = !dish &&
      named && i > from && amount(word) && !!next &&
      // "half" only starts a food as "half a bagel"
      (word !== 'half' || next === 'a' || next === 'an') &&
      !HOLDS_NUMBER.has(words[i - 1]) && !amount(words[i - 1]) && !DESCRIBES.has(next) &&
      // "chicken breast 60 g" puts the amount after the food; leave it there
      (amountFirst || word === 'a' || word === 'an' || (!!words[after] && names(words[after])));
    if (startsNew) cut(i);
    if (MADE_OF.has(word)) dish = true;
    if (amountFirst === undefined && !FILLER.has(word)) amountFirst = amount(word);
    if (names(word)) named = true;
  }
  parts.push(words.slice(from).join(' '));
  return parts;
}

const isNumber = (w: string) => parseNumberToken(w) !== null || (w in NUM_WORDS && w !== 'a' && w !== 'an');
const isAmountWord = (w: string) => isNumber(w) || !!unitFromWord(w) || !!SIZE_WORDS[w] || FILLER.has(w) || SMALL_WORDS.has(w) || w in NUM_WORDS;

/** "chicken breast … 6 ounces", said with a pause: an amount on its own belongs to the food before it. */
function joinAmounts(segments: string[]): string[] {
  return segments.reduce<string[]>((out, segment) => {
    const words = segment.split(' ').filter(Boolean);
    const alone = words.every(isAmountWord) && words.some(isNumber) && (words.some((w) => !!unitFromWord(w)) || words.every(isNumber));
    const before = out[out.length - 1]?.split(' ') ?? [];
    const complete = before.length > 1 && !!unitFromWord(before[before.length - 1]) && isNumber(before[before.length - 2]);
    if (alone && before.some((w) => !isAmountWord(w)) && !complete) out[out.length - 1] += ` ${segment}`;
    else out.push(segment);
    return out;
  }, []);
}

/** One piece of text for each thing eaten. */
function splitItems(t: string): string[] {
  // Protect compound food names, then split
  PROTECTED.forEach((p) => {
    t = t.split(p).join(p.replace(/ and /g, ' _and_ ').replace(/^with /, '_with_ ').replace(/ with /g, ' _with_ '));
  });
  const segments = t
    .split(/\s*(?:[,;!?\n+&]|\.(?!\d)|(?<!\d)\.|\band then\b|\bthen\b|\balso\b|\bplus\b|\band\b|\bwith\b|\bon the side\b|\bside of\b|\btopped with\b)\s*/)
    .flatMap(splitRunOn) // protected names are still joined here, so they stay whole
    .map((s) => s.replace(/_and_/g, 'and').replace(/_with_/g, 'with').trim())
    .filter(Boolean);
  return joinAmounts(segments);
}

/** "i had 2 eggs" → "2 eggs" */
function withoutLeadIn(said: string): string {
  const words = said.split(' ');
  const from = words.findIndex((w) => !FILLER.has(w) || w in NUM_WORDS);
  return from > 0 ? words.slice(from).join(' ') : said;
}

export function parseMeal(text: string): ParsedMeal {
  let t = normalizeText(text);
  EXPANSIONS.forEach(([re, rep]) => (t = t.replace(re, rep)));
  const meal = detectMeal(t);
  const dayOffset = /\byesterday\b/.test(t) ? -1 : 0;
  const read = (segments: string[]) => segments.map(parseSegment).filter((x): x is ParsedItem => !!x);

  const found = read(splitItems(t));
  // Foods are looked up by the database's names, but shown back in the words that were used
  const said = read(splitItems(normalizeText(text, false)));
  const items = found.map((item, i) => ({ ...item, raw: withoutLeadIn(said.length === found.length ? said[i].raw : item.raw) }));
  return { items, meal, dayOffset };
}
