import { emptyNutrients, EXTRA_NK, ExtraKey, Food, NK, Nutrients, Portion } from './foods';
import { newId } from './util';

// Online food data:
// - Open Food Facts (free, no key) — https://world.openfoodfacts.org — packaged foods worldwide
// - USDA FoodData Central (free key; DEMO_KEY works for light use) — US branded foods and
//   "Survey (FNDDS)" foods, which cover everyday dishes like "spaghetti with meat sauce"

const USER_AGENT = 'Pantera/1.1 (personal nutrition tracker)';

export type LookupResult =
  | { ok: true; food: Food }
  | { ok: false; reason: 'not_found' | 'network' | 'incomplete'; partial?: Partial<Food> };

const stripZeros = (s: string) => s.replace(/^0+/, '');
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

async function fetchJson(url: string, timeoutMs = 10000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: ctrl.signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Build a Food from per-100 g values and a list of portions (first = default serving). */
function fromPer100(base: Omit<Food, 'n' | 'serving' | 'g' | 'portions'>, per100: Nutrients, portions: Portion[]): Food {
  const list = portions.filter((p) => p.g > 0 && p.g < 5000);
  if (!list.some((p) => p.label === '100 g')) list.push({ label: '100 g', g: 100 });
  const def = list[0];
  const n = emptyNutrients();
  NK.forEach((k) => (n[k] = Math.round(((per100[k] || 0) * def.g) / 100 * 100) / 100));
  return { ...base, serving: def.label, g: def.g, n, portions: list };
}

// ---------- is a label believable? (the same rules as search/records.py and search/merge.py) ----------

function addsUp(n: Nutrients, alcohol: number): boolean {
  if (n.kcal > 910 || [n.p, n.c, n.f].some((v) => v < 0 || v > 100) || n.p + n.c + n.f > 105) return false;
  if (!n.p && !n.c && !n.f) return true; // nothing to compare the calories with
  const fib = Math.max(n.fib, 0);
  const total = 4 * n.p + 4 * n.c + 9 * n.f + 7 * alcohol;
  const net = total - 4 * Math.min(fib, n.c) + 2 * fib;
  const allowed = Math.max(25, 0.2 * n.kcal);
  return Math.abs(n.kcal - total) <= allowed || Math.abs(n.kcal - net) <= allowed;
}

const per100g = (food: Food, key: 'kcal' | 'p' | 'c' | 'f') => (food.n[key] * 100) / food.g;

/** Which to trust when both databases know a barcode. USDA's label data is far more often right when they differ. */
function trusted(off: Food, usda: Food): Food {
  if (!!off.flagged !== !!usda.flagged) return off.flagged ? usda : off;
  const theirs = per100g(off, 'kcal');
  const ours = per100g(usda, 'kcal');
  if (Math.abs(theirs - ours) <= Math.max(20, 0.2 * ours)) return off;
  const blank = ours < 10 && per100g(usda, 'p') + per100g(usda, 'c') + per100g(usda, 'f') < 1;
  if (blank && theirs > 25) return { ...off, flagged: true };
  // One serving's numbers entered as 100 g, or scaled twice, explains the difference
  const grams = off.g !== 100 ? off.g : usda.g;
  const scaledBy = (factor: number) =>
    ([['kcal', 8, 0.07], ['p', 1.5, 0.15], ['c', 1.5, 0.15], ['f', 1.5, 0.15]] as const)
      .every(([k, floor, share]) => Math.abs(per100g(off, k) - per100g(usda, k) * factor) <= Math.max(floor, share * per100g(off, k)));
  const explained = Math.abs(grams - 100) >= 20 && (scaledBy(grams / 100) || scaledBy(100 / grams));
  return explained ? usda : { ...usda, flagged: true };
}

// ---------- Open Food Facts ----------

function offProductToFood(p: any, src: Food['src']): Food | Partial<Food> {
  const m = p.nutriments || {};
  const name: string = String(p.product_name_en || p.product_name || '').trim();
  const brand: string = String(p.brands || '').split(',')[0]?.trim() || '';
  const code: string | undefined = p.code ? String(p.code) : undefined;
  const num = (k: string): number | undefined => {
    const v = m[k];
    const x = typeof v === 'string' ? parseFloat(v) : v;
    return typeof x === 'number' && isFinite(x) ? x : undefined;
  };
  let kcal100 = num('energy-kcal_100g');
  if (kcal100 === undefined) {
    const kj = num('energy-kj_100g') ?? num('energy_100g');
    if (kj !== undefined) kcal100 = kj / 4.184;
  }
  if (!name || kcal100 === undefined) return { name, brand, barcode: code };

  const per100 = emptyNutrients();
  per100.kcal = kcal100;
  per100.p = num('proteins_100g') ?? 0;
  per100.c = num('carbohydrates_100g') ?? 0;
  per100.f = num('fat_100g') ?? 0;
  per100.fib = num('fiber_100g') ?? 0;
  per100.sug = num('sugars_100g') ?? 0;
  per100.sat = num('saturated-fat_100g') ?? 0;
  // Open Food Facts stores minerals in grams per 100 g
  const salt = num('salt_100g');
  per100.na = (num('sodium_100g') ?? (salt !== undefined ? salt / 2.5 : 0)) * 1000;
  per100.k = (num('potassium_100g') ?? 0) * 1000;
  per100.ca = (num('calcium_100g') ?? 0) * 1000;
  per100.fe = (num('iron_100g') ?? 0) * 1000;
  per100.vc = (num('vitamin-c_100g') ?? 0) * 1000;
  // Vitamins and minerals when the product lists them (grams per 100 g -> mg or µg)
  const OFF_EXTRA: [ExtraKey, string, number][] = [
    ['chol', 'cholesterol_100g', 1e3], ['mono', 'monounsaturated-fat_100g', 1], ['poly', 'polyunsaturated-fat_100g', 1],
    ['va', 'vitamin-a_100g', 1e6], ['vd', 'vitamin-d_100g', 1e6], ['ve', 'vitamin-e_100g', 1e3], ['vk', 'vitamin-k_100g', 1e6],
    ['b1', 'vitamin-b1_100g', 1e3], ['b2', 'vitamin-b2_100g', 1e3], ['b3', 'vitamin-pp_100g', 1e3], ['b6', 'vitamin-b6_100g', 1e3],
    ['fol', 'vitamin-b9_100g', 1e6], ['b12', 'vitamin-b12_100g', 1e6], ['mag', 'magnesium_100g', 1e3], ['ph', 'phosphorus_100g', 1e3],
    ['zn', 'zinc_100g', 1e3], ['cu', 'copper_100g', 1e3], ['mn', 'manganese_100g', 1e3], ['se', 'selenium_100g', 1e6],
  ];
  let listed = 0;
  OFF_EXTRA.forEach(([k, key, mult]) => {
    const v = num(key);
    if (v !== undefined) {
      per100[k] = v * mult;
      listed++;
    }
  });

  const sq = typeof p.serving_quantity === 'string' ? parseFloat(p.serving_quantity) : p.serving_quantity;
  const portions: Portion[] = [];
  if (typeof sq === 'number' && sq > 0) portions.push({ label: String(p.serving_size || `${sq} g`).slice(0, 40), g: sq });
  const doubt = !addsUp(per100, (num('alcohol_100g') ?? 0) * 0.789);
  // Count vitamins and minerals as "known" only when the label lists most of them
  return fromPer100({ id: 'c' + newId(), name: name.slice(0, 80), brand: brand || undefined, src, barcode: code, source: 'Open Food Facts', micros: listed >= 12, ...(doubt ? { flagged: true } : {}) }, per100, portions);
}

const OFF_FIELDS = 'code,product_name,product_name_en,brands,serving_size,serving_quantity,nutriments';

async function offBarcode(code: string): Promise<LookupResult> {
  const data = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (!data || !data.product || data.status === 0) return { ok: false, reason: 'not_found' };
  const f = offProductToFood({ ...data.product, code }, 'scan');
  if ('n' in f && f.n) return { ok: true, food: f as Food };
  return { ok: false, reason: 'incomplete', partial: { ...f, barcode: code } };
}

async function offSearch(q: string): Promise<Food[]> {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&sort_by=unique_scans_n&fields=${OFF_FIELDS}`;
  const data = await fetchJson(url, 12000);
  const products: any[] = (data && data.products) || [];
  return products.map((p) => offProductToFood(p, 'online')).filter((f): f is Food => 'n' in f && !!f.n);
}

// ---------- USDA FoodData Central ----------

const FDC_IDS: Record<number, keyof Nutrients> = {
  1008: 'kcal', 1003: 'p', 1005: 'c', 1004: 'f', 1079: 'fib', 2000: 'sug',
  1258: 'sat', 1093: 'na', 1092: 'k', 1087: 'ca', 1089: 'fe', 1162: 'vc',
  1253: 'chol', 1292: 'mono', 1293: 'poly', 1106: 'va', 1114: 'vd', 1109: 've', 1185: 'vk', 1165: 'b1', 1166: 'b2', 1167: 'b3',
  1175: 'b6', 1190: 'fol', 1178: 'b12', 1180: 'cho', 1090: 'mag', 1091: 'ph', 1095: 'zn', 1098: 'cu', 1101: 'mn', 1103: 'se',
};

function fdcToFood(hit: any, src: Food['src']): Food | null {
  // Search results report nutrients per 100 g (or 100 ml)
  const per100 = emptyNutrients();
  let hasKcal = false;
  let extras = 0;
  (hit.foodNutrients || []).forEach((fn: any) => {
    const k = FDC_IDS[fn.nutrientId];
    if (k && typeof fn.value === 'number') {
      per100[k] = fn.value;
      if (k === 'kcal') hasKcal = true;
      if ((EXTRA_NK as readonly string[]).includes(k)) extras++;
    }
  });
  if (!hasKcal || !hit.description) return null;
  const portions: Portion[] = [];
  const unit = String(hit.servingSizeUnit || '').toLowerCase();
  if (typeof hit.servingSize === 'number' && hit.servingSize > 0 && ['g', 'grm', 'ml', 'mlt'].includes(unit)) {
    portions.push({ label: hit.householdServingFullText ? String(hit.householdServingFullText).slice(0, 40) : `${Math.round(hit.servingSize)} g`, g: hit.servingSize });
  }
  (hit.foodMeasures || [])
    .filter((m: any) => m && typeof m.gramWeight === 'number' && m.gramWeight > 0 && m.disseminationText && !/quantity not specified/i.test(m.disseminationText))
    .sort((a: any, b: any) => (a.rank ?? 99) - (b.rank ?? 99))
    .slice(0, 4)
    .forEach((m: any) => portions.push({ label: String(m.disseminationText).slice(0, 40), g: m.gramWeight }));
  const branded = hit.dataType === 'Branded';
  const brand = branded && (hit.brandName || hit.brandOwner) ? titleCase(String(hit.brandName || hit.brandOwner)) : undefined;
  const desc = String(hit.description);
  return fromPer100(
    {
      id: 'c' + newId(),
      name: (branded ? titleCase(desc) : desc).slice(0, 80),
      brand,
      src,
      barcode: hit.gtinUpc ? String(hit.gtinUpc) : undefined,
      source: 'USDA FoodData Central',
      micros: extras >= 12,
      ...(addsUp(per100, (hit.foodNutrients || []).find((fn: any) => fn.nutrientId === 1018)?.value * 0.789 || 0) ? {} : { flagged: true }),
    },
    per100,
    portions,
  );
}

async function fdcBarcode(code: string, apiKey: string): Promise<LookupResult> {
  const key = apiKey.trim() || 'DEMO_KEY';
  const data = await fetchJson(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(code)}&dataType=Branded&pageSize=10&api_key=${encodeURIComponent(key)}`);
  const hit = ((data && data.foods) || []).find((f: any) => f.gtinUpc && stripZeros(String(f.gtinUpc)) === stripZeros(code));
  const food = hit ? fdcToFood(hit, 'scan') : null;
  if (!food) return { ok: false, reason: 'not_found' };
  return { ok: true, food: { ...food, barcode: code } };
}

async function fdcSearch(q: string, apiKey: string): Promise<Food[]> {
  const key = apiKey.trim() || 'DEMO_KEY';
  const types = encodeURIComponent('Survey (FNDDS),Branded');
  const data = await fetchJson(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&dataType=${types}&pageSize=30&api_key=${encodeURIComponent(key)}`, 12000);
  const foods: any[] = (data && data.foods) || [];
  // Everyday dishes (FNDDS) first, then branded products
  const sorted = [...foods.filter((f) => f.dataType !== 'Branded'), ...foods.filter((f) => f.dataType === 'Branded')];
  return sorted.map((f) => fdcToFood(f, 'online')).filter((f): f is Food => !!f);
}

// ---------- public API ----------

export async function lookupBarcode(code: string, usdaKey: string): Promise<LookupResult> {
  // Both are asked, so that one database's mistake can be caught by the other
  const [off, usda] = await Promise.allSettled([offBarcode(code), fdcBarcode(code, usdaKey)]);
  const a = off.status === 'fulfilled' ? off.value : null;
  const b = usda.status === 'fulfilled' ? usda.value : null;
  if (a?.ok && b?.ok) return { ok: true, food: trusted(a.food, b.food) };
  if (a?.ok) return a;
  if (b?.ok) return b;
  if (!a && !b) return { ok: false, reason: 'network' };
  const partial = a && !a.ok && a.reason === 'incomplete' ? a.partial : undefined;
  return { ok: false, reason: partial ? 'incomplete' : 'not_found', partial: partial ?? { barcode: code } };
}

export type OnlineResult = { foods: Food[]; failed: ('usda' | 'off')[] };

/** Search both online databases by name. Results are interleaved so each source gets a fair share. */
export async function searchOnline(q: string, usdaKey: string): Promise<OnlineResult> {
  const [usda, off] = await Promise.allSettled([fdcSearch(q, usdaKey), offSearch(q)]);
  const a = usda.status === 'fulfilled' ? usda.value : [];
  const b = off.status === 'fulfilled' ? off.value : [];
  const failed: OnlineResult['failed'] = [];
  if (usda.status === 'rejected') failed.push('usda');
  if (off.status === 'rejected') failed.push('off');
  const out: Food[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    [a[i], b[i]].forEach((f) => {
      if (!f) return;
      const key = (f.name + '|' + (f.brand || '')).toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(f);
    });
  }
  return { foods: out.slice(0, 40), failed };
}
