/**
 * Reading a recipe from a web page. Recipe sites describe their recipes in a standard hidden block
 * (schema.org "Recipe"), which is what this reads.
 */

export type WebRecipe = { name: string; servings: number | null; ingredients: string[] };

const MAX_INGREDIENTS = 60;
const MAX_LINE = 300; // real ingredient lines are far shorter
const MAX_BLOCKS = 50;

/** The web address in what was typed or pasted, or null. */
export function recipeUrl(text: string): string | null {
  const pasted = /https?:\/\/\S+/i.exec(text)?.[0];
  const typed = text.trim();
  if (pasted) return pasted.replace(/[).,!]+$/, '');
  // A bare address such as "www.site.com/chili"
  return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(typed) ? `https://${typed}` : null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', ndash: '–', mdash: '—', rsquo: '’' };

function plain(text: unknown): string {
  return String(text ?? '')
    .replace(/<[^<>]*>/g, '')
    .replace(/&#(x?)([0-9a-f]+);/gi, (_, hex, code) => String.fromCodePoint(Math.min(parseInt(code, hex ? 16 : 10), 0x10ffff)))
    .replace(/&([a-z0-9]+);/gi, (all, name) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/\s+/g, ' ')
    .trim();
}

type Block = Record<string, unknown>;

function findBlock(value: unknown, depth = 0): Block | null {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  if (!Array.isArray(value)) {
    const type = (value as Block)['@type'];
    if (([] as unknown[]).concat(type).includes('Recipe')) return value as Block;
  }
  for (const inner of Object.values(value)) {
    const found = findBlock(inner, depth + 1);
    if (found) return found;
  }
  return null;
}

function servingsIn(value: unknown): number | null {
  for (const v of ([] as unknown[]).concat(value ?? [])) {
    const n = Number(/\d+/.exec(String(v))?.[0]);
    if (n > 0 && n <= 200) return n;
  }
  return null;
}

/** The contents of the page's data blocks. Walks the page once, so a broken page can't stall the phone. */
function* dataBlocks(html: string): Generator<string> {
  const open = /<script\b[^<>]{0,500}?type\s*=\s*["']?application\/ld\+json[^<>]{0,500}>/gi;
  const close = /<\/script\s*>/gi;
  for (let count = 0; count < MAX_BLOCKS && open.exec(html); count++) {
    close.lastIndex = open.lastIndex;
    const end = close.exec(html);
    if (!end) return;
    yield html.slice(open.lastIndex, end.index);
    open.lastIndex = close.lastIndex;
  }
}

export function findRecipe(html: string): WebRecipe | null {
  for (const source of dataBlocks(html)) {
    let data: unknown;
    try {
      data = JSON.parse(source.trim());
    } catch {
      continue;
    }
    const block = findBlock(data);
    if (!block) continue;
    const ingredients = ([] as unknown[])
      .concat(block.recipeIngredient ?? block.ingredients ?? [])
      .slice(0, MAX_INGREDIENTS)
      .map((line) => plain(String(line ?? '').slice(0, MAX_LINE * 4)).slice(0, MAX_LINE))
      .filter(Boolean);
    if (ingredients.length) {
      return { name: plain(String(block.name ?? '').slice(0, MAX_LINE)), servings: servingsIn(block.recipeYield), ingredients };
    }
  }
  return null;
}

const PACKAGES = 'cans?|packages?|pkgs?|packets?|jars?|bags?|boxes|box|bottles?|cartons?|containers?';
const WEIGHTS = 'ounces?|oz|pounds?|lbs?|kilograms?|kg|grams?|g';
// "4 (6 ounce) salmon fillets", "1 package (8 oz) cream cheese", "2 (1 lb) packages ground turkey"
const SIZED = new RegExp(
  `^(\\d+)\\s*(?:(?:${PACKAGES})\\b\\s*)?\\(\\s*([\\d.]+)[\\s-]*(${WEIGHTS})\\b\\.?\\s*\\)\\s*(?:(?:${PACKAGES})\\b)?`,
  'i',
);
const shortUnit = (unit: string) => (/^k/i.test(unit) ? 'kg' : /^g/i.test(unit) ? 'g' : /^o/i.test(unit) ? 'oz' : 'lb');

// A quantity as written: "2", "1/2", "1 and 1/2", "¾"
const AMOUNT = '[\\d\\s/.½¼¾⅓⅔⅛]+(?:and\\s+[\\d/½¼¾]+\\s*)?';

/** Removes bracketed notes, including notes inside notes. */
function withoutBrackets(text: string): string {
  let before: string;
  do {
    before = text;
    text = text.replace(/\([^()]*\)/g, ' ');
  } while (text !== before);
  return text.replace(/[()].*$/, ' ');
}

/** "1 (14.5 ounce) can diced tomatoes, undrained" → "14.5 oz diced tomatoes". */
export function cleanIngredient(line: string): string {
  const sized = line
    .slice(0, MAX_LINE)
    .replace(/^[^\p{L}\p{N}.½¼¾⅓⅔⅛]+/u, '') // checkboxes and bullets
    .replace(/\$\s?\d[\d.,]*|\*/g, ' ') // prices and footnote marks
    .replace(/\b(lbs?|oz|tsp|tbsp|tbs|pkg|qt|pt)\./gi, '$1')
    // "1,250 kg" and "1,5 kg" are decimals; "1,000 g" is a thousand
    .replace(/(\d),(\d{3})(?=\s*(?:kg|lbs?|pounds?|l|litres?|liters?)\b)/gi, '$1.$2')
    .replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/(\d),(\d{1,2})(?!\d)/g, '$1.$2')
    .replace(SIZED, (_, count, size, unit) => `${Math.round(Number(count) * Number(size) * 100) / 100} ${shortUnit(unit)} `)
    // "2 cups (250g) flour": the weight is more exact than the cups
    .replace(new RegExp(`^${AMOUNT}(?:cups?|tbsp|tablespoons?|tsp|teaspoons?)\\s*\\([^()]*?(\\d+(?:\\.\\d+)?)\\s*g\\b[^()]*\\)`, 'i'), '$1 g');
  return withoutBrackets(sized)
    .replace(/\s+/g, ' ')
    .replace(new RegExp(`(\\d ?(?:${WEIGHTS})) (?:${PACKAGES})\\b`, 'i'), '$1') // the weight says how much
    .replace(/(\d ?(?:oz|g|lb|kg)) (?:fillets|filets) (?=\p{L})/iu, '$1 ') // "24 oz fillets tilapia"
    .replace(/\bgarlic cloves?\b/i, 'cloves garlic')
    .replace(/\b(boneless|skinless), ?(?=skinless|boneless)/gi, '$1 ')
    .replace(/ ?(,|;|\bto taste\b|\bplus (?:more|extra|a little)\b|\bfor serving\b|\boptional\b).*$/i, '')
    .replace(/\b(?:light|dark) or (?:light|dark)\b|\bpacked\b/gi, '')
    .replace(/ or full[- ]fat\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Salt, water and the like: nothing worth counting, and matching them tends to go wrong
const NOT_COUNTED = /^[\d\s/.½¼¾⅓⅔-]*(?:(?:tsp|teaspoons?|tbsp|tablespoons?|cups?|g|ml|l|pinch(?:es)?|dash(?:es)?)\s+(?:of\s+)?)?(?:(?:kosher|sea|fine|table|coarse)\s+)?(?:salt(?:\s*(?:and|&)\s*(?:freshly\s+)?(?:ground\s+)?(?:black\s+)?pepper)?|(?:(?:hot|cold|warm|boiling)\s+)?water|ice(?:\s+cubes)?|cooking spray|baking soda)$/i;

const PASTA = /\b(?:(?:spaghetti|penne|fettuccine|linguine|macaroni|fusilli|rotini|rigatoni|farfalle|elbows?)(?:\s+pasta)?|pasta)\b/i;
const RICE = /\b(?:(brown)\s+|(?:white|long[- ]grain|jasmine|basmati)\s+)*rice\b(?!\s+(?:vinegar|noodles?|milk|wine|flour|cakes?|paper))/i;

/** Words recipes use that the food list files under another name. */
const RENAMED: [RegExp, string][] = [
  [/\bground cumin\b/i, 'cumin'],
  [/\bwhole chicken\b/i, 'roasted chicken'],
  [/\bcayenne(?:\s+(?:powder|pepper))?\b/i, 'cayenne pepper'],
  [/(?<!ground )\bcinnamon\b(?!\s+(?:buns?|rolls?|sticks?))/i, 'ground cinnamon'],
  [/\bsmoked paprika\b/i, 'paprika'],
  [/\bvegetable oil\b/i, 'canola oil'],
  [/\b(?:yellow|white|brown) onion/i, 'onion'],
  [/\bplain flour\b/i, 'all-purpose flour'],
  [/\bchocolate chips\b/i, 'chocolate candies semisweet'],
  [/\b(chicken) broth\b/i, '$1 stock'],
  [/(?<!canned )\bcoconut milk\b/i, 'canned coconut milk'],
];

/** The words to look an ingredient line up by, or null when the line isn't worth counting. */
export function ingredientQuery(line: string): string | null {
  let text = cleanIngredient(line);
  if (!text || NOT_COUNTED.test(text)) return null;
  // Garnishes with no amount ("lemon wedges, to serve")
  if (/\bto serve\b/i.test(line) && !/^[\d½¼¾⅓⅔]/.test(text)) return null;
  if (/\bcan(?:s|ned)?\b/i.test(line)) text = text.replace(/\bdiced tomatoes\b/i, 'canned tomatoes');
  // Recipes weigh pasta and rice dry unless they say otherwise
  if (!/\bcooked\b/i.test(text.replace(/\buncooked\b/gi, ''))) {
    const dry = text.replace(/\buncooked\s+|\s+uncooked\b|\bdry\s+/gi, '');
    if (PASTA.test(dry)) text = dry.replace(PASTA, 'dry pasta');
    else if (RICE.test(dry)) text = dry.replace(RICE, (_, brown) => `dry ${brown ? 'brown' : 'white'} rice`);
  }
  if (/\bcan(?:s|ned)?\b|\bounce\)|\boz\)/i.test(line) && /\bbeans?\b/i.test(text) && !/\bcanned\b|\bgreen beans\b/i.test(text)) {
    text = text.replace(/(\b(?:kidney|black|pinto|cannellini|white|navy)\s+)?\bbeans?\b/i, (all) => `canned ${all}`);
  }
  for (const [from, to] of RENAMED) text = text.replace(from, to);
  return text;
}

export class RecipeImportError extends Error {
  reason: 'unreachable' | 'blocked' | 'no-recipe';
  constructor(reason: 'unreachable' | 'blocked' | 'no-recipe') {
    super(`Recipe import failed (${reason})`);
    this.name = 'RecipeImportError';
    this.reason = reason;
  }
}

const TIMEOUT_MS = 15000;
const MAX_PAGE = 4_000_000; // characters; recipe pages are far smaller

export async function loadRecipe(url: string, send: typeof fetch = fetch): Promise<WebRecipe> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  let html: string;
  try {
    const res = await send(url, { headers: { Accept: 'text/html,application/xhtml+xml' }, signal: stop.signal });
    if (!res.ok) throw new RecipeImportError(res.status === 401 || res.status === 403 || res.status === 429 ? 'blocked' : 'unreachable');
    html = await res.text();
  } catch (e) {
    throw e instanceof RecipeImportError ? e : new RecipeImportError('unreachable');
  } finally {
    clearTimeout(timer);
  }
  const recipe = findRecipe(html.slice(0, MAX_PAGE));
  if (!recipe) throw new RecipeImportError('no-recipe');
  return recipe;
}
