import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findByBarcode, FoodIndexError, normalizeBarcode, namesBrand, oneMistakeApart, orderBest, queryWords, rankGeneric, relaxations,
  searchIndex, spellingKeys,
} from '../../src/foodIndex/client.ts';
import type { ClientConfig, IndexDoc } from '../../src/foodIndex/client.ts';

const d = (id: string, brand: string | null, kind: 'generic' | 'branded'): IndexDoc => ({
  id, name: 'Cottage Cheese', brand, kind, barcode: null, portions: [{ label: '100 g', g: 100 }], n: { kcal: 100 },
  source: 'off', popularity: 0, flagged: 0, updated: '2025-01-01', category: 'dairy',
});

type Call = { url: string; body: any; headers: Record<string, string> };

/** A fake server: `answer` returns the hits for one query object. */
function fake(answer: (query: any) => IndexDoc[]) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: any, init: any) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, headers: init.headers });
    const json = body.queries
      ? { results: body.queries.map((q: any) => ({ hits: answer(q) })) }
      : { hits: answer(body) };
    return new Response(JSON.stringify(json), { status: 200 });
  }) as typeof fetch;
  const cfg: ClientConfig = { url: 'http://meili.test/', key: 'search-key', fetchImpl };
  return { cfg, calls };
}

const failing = (fetchImpl: any, timeoutMs?: number): ClientConfig => ({ url: 'http://meili.test', key: 'k', fetchImpl, timeoutMs });
const reason = (r: string) => (e: unknown) => e instanceof FoodIndexError && e.reason === r;

test('queryWords strips accents and apostrophes and keeps ten words', () => {
  assert.deepEqual(queryWords("Ben & Jerry's  Häagen-Dazs!"), ['ben', 'jerrys', 'haagen', 'dazs']);
  assert.equal(queryWords('a b c d e f g h i j k l').length, 10);
});

test('relaxations go longest first, right-most window first', () => {
  assert.deepEqual(relaxations(['zzqx', 'cottage', 'cheese']), [
    [['cottage', 'cheese'], ['zzqx', 'cottage']], [['cheese'], ['cottage'], ['zzqx']]]);
  assert.deepEqual(relaxations(['milk']), []);
});

test('namesBrand needs every meaningful brand word', () => {
  assert.equal(namesBrand(['honest', 'cow', 'cheese'], 'The Honest Cow'), true);
  assert.equal(namesBrand(['cottage', 'cheese'], 'The Honest Cow'), false);
  assert.equal(namesBrand(['ben', 'jerrys'], "Ben & Jerry's"), true);
  assert.equal(namesBrand(['the', 'cheese'], 'The'), false);
  assert.equal(namesBrand(['cheese'], null), false);
});

test('a plain search puts up to three generic foods first without duplicates', () => {
  const g = d('g1', null, 'generic'), b = d('b1', 'Acme', 'branded');
  assert.deepEqual(orderBest(['cottage', 'cheese'], [b, g], [g], [b], 10).map((x) => x.id), ['g1', 'b1']);
  const many = [1, 2, 3, 4].map((i) => d(`g${i}`, null, 'generic'));
  assert.deepEqual(orderBest(['cheese'], [b], many, [b], 10).map((x) => x.id), ['g1', 'g2', 'g3', 'b1']);
  assert.equal(orderBest(['cheese'], [b], many, [b], 2).length, 2);
});

test('a plain search still shows brands when generic foods would fill the whole list', () => {
  const generic = Array.from({ length: 12 }, (_, i) => d(`g${i}`, null, 'generic'));
  const branded = [1, 2, 3, 4, 5].map((i) => d(`b${i}`, 'Acme', 'branded'));
  assert.deepEqual(orderBest(['cheese'], generic.slice(0, 10), generic.slice(0, 3), branded, 10).map((x) => x.id),
    ['g0', 'g1', 'g2', 'b1', 'b2', 'b3', 'g3', 'g4', 'g5', 'g6']);
});

test('a brand search keeps the server order', () => {
  const g = d('g1', null, 'generic'), b = d('b1', 'Acme', 'branded');
  assert.deepEqual(orderBest(['acme', 'cheese'], [b, g], [g], [b], 10).map((x) => x.id), ['b1', 'g1']);
});

test('normalizeBarcode matches the index form', () => {
  assert.equal(normalizeBarcode(' 0041900091290 '), '41900091290');
  assert.equal(normalizeBarcode('0 41900-09129 0'), '41900091290');
  for (const bad of ['abc', '', '000000', '12a456789']) assert.equal(normalizeBarcode(bad), null);
});

test('a query with no words sends nothing', async () => {
  const { cfg, calls } = fake(() => []);
  for (const q of ['   ', '!!!', '🍕']) assert.deepEqual(await searchIndex(cfg, q), { best: [], close: [] });
  assert.equal(calls.length, 0);
});

test('a full match needs one request', async () => {
  const hit = d('b1', 'Acme', 'branded');
  const { cfg, calls } = fake((q) => (q.filter ? [] : [hit]));
  const out = await searchIndex(cfg, '  Cottage chee ');
  assert.deepEqual(out, { best: [hit], close: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://meili.test/multi-search');
  assert.equal(calls[0].headers.Authorization, 'Bearer search-key');
  const [all, generic, branded] = calls[0].body.queries;
  assert.deepEqual(all, { indexUid: 'foods', q: 'Cottage chee', limit: 20, matchingStrategy: 'all' });
  assert.deepEqual(generic, { indexUid: 'foods', q: 'Cottage chee', limit: 40, matchingStrategy: 'all', filter: 'kind = generic' });
  assert.deepEqual(branded, { indexUid: 'foods', q: 'Cottage chee', limit: 3, matchingStrategy: 'all', filter: 'kind = branded' });
});

test('long queries are cut to ten words', async () => {
  const { cfg, calls } = fake(() => [d('b1', 'Acme', 'branded')]);
  await searchIndex(cfg, 'a b c d e f g h i j k l');
  assert.equal(calls[0].body.queries[0].q, 'a b c d e f g h i j');
});

test('with no full match, close holds the first shorter query that finds something', async () => {
  const cottage = d('b1', 'Acme', 'branded'), other = d('b2', 'Acme', 'branded');
  const { cfg, calls } = fake((q) => (q.q === 'cottage cheese' ? [cottage] : q.q === 'zzqx cottage' ? [other] : []));
  assert.deepEqual(await searchIndex(cfg, 'zzqx cottage cheese'), { best: [], close: [cottage] });
  assert.equal(calls.length, 4); // full query, spelling lookup, which shorter query works, its results
});

test('close matching moves on to shorter windows', async () => {
  const hit = d('b1', 'Acme', 'branded');
  const { cfg, calls } = fake((q) => (q.q === 'cottage' ? [hit] : []));
  assert.deepEqual((await searchIndex(cfg, 'zzqx cottage cheesy')).close, [hit]);
  assert.equal(calls.length, 4);
});

test('nothing at any length gives empty results', async () => {
  const { cfg } = fake(() => []);
  assert.deepEqual(await searchIndex(cfg, 'zzqx qqzz'), { best: [], close: [] });
});

test('findByBarcode filters by the normalized code', async () => {
  const hit = d('b1', 'Acme', 'branded');
  const { cfg, calls } = fake(() => [hit]);
  assert.equal(await findByBarcode(cfg, 'abc'), null);
  assert.equal(calls.length, 0);
  assert.deepEqual(await findByBarcode(cfg, '0041900091290'), hit);
  assert.equal(calls[0].url, 'http://meili.test/indexes/foods/search');
  assert.deepEqual(calls[0].body, { q: '', filter: 'barcode = "41900091290"', limit: 1 });
  assert.equal(await findByBarcode(fake(() => []).cfg, '123456'), null);
});

test('failures raise typed errors', async () => {
  const status = (code: number) => async () => new Response('{}', { status: code });
  await assert.rejects(searchIndex(failing(async () => { throw new TypeError('offline'); }), 'milk'), reason('network'));
  await assert.rejects(searchIndex(failing(() => new Promise(() => {}), 50), 'milk'), reason('timeout'));
  await assert.rejects(searchIndex(failing(status(401)), 'milk'), reason('auth'));
  await assert.rejects(searchIndex(failing(status(403)), 'milk'), reason('auth'));
  await assert.rejects(searchIndex(failing(status(500)), 'milk'), reason('server'));
  await assert.rejects(searchIndex(failing(async () => new Response('<html>', { status: 200 })), 'milk'), reason('server'));
  await assert.rejects(findByBarcode(failing(status(500)), '123456'), reason('server'));
});

test('an aborted search rejects with AbortError', async () => {
  const hang = failing(() => new Promise(() => {}), 5000);
  const early = new AbortController();
  early.abort();
  await assert.rejects(searchIndex(hang, 'milk', 20, early.signal), { name: 'AbortError' });
  const late = new AbortController();
  setTimeout(() => late.abort(), 10);
  await assert.rejects(searchIndex(hang, 'milk', 20, late.signal), { name: 'AbortError' });
});

test('spellingKeys are the word and each way of deleting one letter', () => {
  assert.deepEqual(spellingKeys('kale').sort(), ['ale', 'kae', 'kal', 'kale', 'kle']);
});

test('oneMistakeApart allows exactly one wrong, missing, extra or swapped letter', () => {
  for (const [typed, real] of [['jrader', 'trader'], ['kae', 'kale'], ['tthin', 'thin'], ['pcokets', 'pockets'], ['ipzza', 'pizza']]) {
    assert.ok(oneMistakeApart(typed, real), `${typed} ${real}`);
  }
  for (const [a, b] of [['kale', 'kale'], ['kale', 'milk'], ['abcd', 'badc'], ['cheese', 'chess'], ['pizza', 'pizzaaa']]) {
    assert.ok(!oneMistakeApart(a, b), `${a} ${b}`);
  }
});

/** A fake server that knows some words and answers only the listed food queries. */
function speller(vocabulary: Record<string, number>, foods: Record<string, IndexDoc[]>) {
  return fake((q) => {
    if (q.indexUid !== 'words') return q.filter ? [] : foods[q.q] ?? [];
    const keys = [...q.filter.matchAll(/"([^"]+)"/g)].map((m: RegExpMatchArray) => m[1]);
    return Object.entries(vocabulary)
      .filter(([word]) => spellingKeys(word).some((k) => keys.includes(k)))
      .sort((a, b) => b[1] - a[1])
      .map(([word, count]) => ({ word, count })) as any;
  });
}

test('a misspelled word is corrected and the results count as best matches', async () => {
  const hit = d('b1', 'Acme', 'branded');
  const { cfg, calls } = speller({ trader: 90, grader: 5, blend: 40 }, { 'trader blend': [hit] });
  assert.deepEqual(await searchIndex(cfg, 'jrader blend'), { best: [hit], close: [], corrected: 'trader blend' });
  const lookup = calls[1].body.queries;
  assert.equal(lookup.length, 2);
  assert.deepEqual([lookup[0].indexUid, lookup[0].sort], ['words', ['count:desc']]);
  assert.ok(lookup[0].filter.startsWith('keys IN ['));
});

test('the most common correction that finds food wins', async () => {
  const rare = d('b1', 'Acme', 'branded'), common = d('b2', 'Acme', 'branded');
  const one = speller({ cake: 500, kale: 50 }, { 'cake pie': [common], 'kale pie': [rare] });
  assert.deepEqual((await searchIndex(one.cfg, 'cale pie')).best, [common]);
});

test('a word that does not exist is corrected before a real word is doubted', async () => {
  const right = d('b1', 'Acme', 'branded'), wrong = d('b2', 'Acme', 'branded');
  const { cfg } = speller({ soup: 900, soap: 800, pork: 10 }, { 'pork soup': [right], 'zork soap': [wrong] });
  assert.deepEqual((await searchIndex(cfg, 'zork soup')).best, [right]);
});

test('short words and numbers are never corrected', async () => {
  const { cfg, calls } = speller({}, {});
  await searchIndex(cfg, '99 ml');
  assert.ok(calls.every((c) => (c.body.queries ?? []).every((q: any) => q.indexUid === 'foods')));
});

test('a real word is never swapped for another', async () => {
  const wrong = d('b1', 'Acme', 'branded'), closeHit = d('b2', 'Acme', 'branded');
  const { cfg } = speller({ fat: 900, oat: 500, yogurt: 100, siggis: 5 },
    { 'siggis fat yogurt': [wrong], 'oat yogurt': [closeHit] });
  assert.deepEqual(await searchIndex(cfg, 'siggis oat yogurt'), { best: [], close: [closeHit] });
});

test('a hopeless long search takes only a few requests', async () => {
  const { cfg, calls } = fake(() => []);
  assert.deepEqual(await searchIndex(cfg, 'aaaq bbbq cccq dddq eeeq fffq gggq hhhq iiiq jjjq kkkq'), { best: [], close: [] });
  assert.ok(calls.length <= 3, String(calls.length));
});

test('the time limit covers the whole search, not each request', async () => {
  const slow = (async (_: any, init: any) => {
    await new Promise((ok) => setTimeout(ok, 40));
    const { queries } = JSON.parse(init.body);
    return new Response(JSON.stringify({ results: queries.map(() => ({ hits: [] })) }), { status: 200 });
  }) as typeof fetch;
  await assert.rejects(searchIndex(failing(slow, 70), 'zzqx cottage cheese'), reason('timeout'));
});

const plain = (name: string, brand: string | null = null): IndexDoc => ({ ...d(name, brand, brand ? 'branded' : 'generic'), name });
const first = (words: string[], ...names: string[]) => rankGeneric(words, names.map((n) => plain(n)))[0].name;

test('the food itself ranks above dishes that contain it', () => {
  assert.equal(first(['spinach'], 'Spinach dip, regular', 'Spinach quiche, meatless', 'Spinach, raw'), 'Spinach, raw');
  assert.equal(first(['orange'], 'Orange chicken', 'Orange, raw'), 'Orange, raw');
  assert.equal(first(['oatmeal'], 'Bread, oatmeal', 'Oatmeal, regular, cooked'), 'Oatmeal, regular, cooked');
  assert.equal(first(['strawberries'], 'Strawberry shortcake', 'Strawberries, raw'), 'Strawberries, raw');
  assert.equal(first(['tomato'], 'Tomato soup', 'Tomatoes, red, raw'), 'Tomatoes, red, raw');
});

test('a leading food group is skipped to find the food', () => {
  assert.equal(first(['salmon'], 'Salmon salad', 'Fish, salmon, Atlantic, raw'), 'Fish, salmon, Atlantic, raw');
  assert.equal(first(['almonds'], 'Almond paste', 'Nuts, almonds'), 'Nuts, almonds');
});

test('the plain form ranks first, then the shorter name', () => {
  assert.equal(first(['banana'], 'Banana, baked', 'Banana, raw'), 'Banana, raw');
  assert.equal(first(['milk', 'whole'], 'Milk, whole, with added vitamin D and calcium', 'Milk, whole'), 'Milk, whole');
});

test('restaurant and brand items among the generic foods rank last', () => {
  assert.equal(first(['pork', 'tenderloin'], 'HORMEL ALWAYS TENDER, Pork Tenderloin, Teriyaki-Flavored',
    'Pork, fresh, loin, tenderloin, cooked'), 'Pork, fresh, loin, tenderloin, cooked');
  assert.equal(first(['cottage', 'cheese'], 'Cheese, cottage, NFS', 'Cheese, cottage, creamed'), 'Cheese, cottage, NFS');
});

test('a brand that is just a food word does not take over a plain search', () => {
  const brand = plain('Instant', 'Oatmeal'), food = plain('Oatmeal, NFS');
  assert.equal(orderBest(['oatmeal'], [brand], [food], [brand], 10)[0].name, 'Oatmeal, NFS');
});

test('a real brand is still honored when a generic entry carries its name', () => {
  const product = plain('Sausage Links', 'Jimmy Dean'), entry = plain('JIMMY DEAN, Sausage Biscuit, frozen');
  assert.equal(orderBest(['jimmy', 'dean', 'sausage'], [product], [entry], [product], 10)[0].brand, 'Jimmy Dean');
});

test('a rare spelling that exists in the data is still corrected to a far more common word', async () => {
  const hit = d('b1', 'Acme', 'branded');
  const { cfg } = speller({ dark: 900, dar: 4, bark: 3 }, { 'dark chocolate': [hit] });
  assert.deepEqual(await searchIndex(cfg, 'dar chocolate'), { best: [hit], close: [], corrected: 'dark chocolate' });
});

test('two misspelled words are corrected together', async () => {
  const hit = d('b1', 'Acme', 'branded');
  const { cfg } = speller({ cottage: 900, cheese: 800 }, { 'cottage cheese': [hit] });
  assert.deepEqual(await searchIndex(cfg, 'cotage chese'), { best: [hit], close: [], corrected: 'cottage cheese' });
});

/** The same fake, answering as the database on the phone does. */
function phone(vocabulary: Record<string, number>, foods: Record<string, IndexDoc[]>): ClientConfig {
  const { cfg } = speller(vocabulary, foods);
  const server = cfg as Extract<ClientConfig, { url: string }>;
  return {
    engine: {
      search: async (query) => {
        const res = await server.fetchImpl!('http://x/multi-search', { body: JSON.stringify({ queries: [query] }), headers: {} } as any);
        return ((await res.json()) as any).results[0].hits;
      },
      byBarcode: async () => null,
    },
  };
}

const many = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => d(`${prefix}${i}`, 'Acme', 'branded'));

test('on the phone, a typo that also appears in the data still shows the right spelling first', async () => {
  const wrong = many('typo', 6), right = many('ok', 5);
  const cfg = phone({ chicken: 40000, chiken: 20, breast: 9000 }, { 'chiken breast': wrong, 'chicken breast': right });
  const result = await searchIndex(cfg, 'chiken breast', 20);
  assert.equal(result.corrected, 'chicken breast');
  assert.deepEqual(result.best.map((x) => x.id), ['ok0', 'ok1', 'ok2', ...wrong.map((x) => x.id), 'ok3', 'ok4']);
});

test('on the phone, an ordinary or short word with results is left alone', async () => {
  const found = many('a', 3);
  const brand = phone({ area: 6000, arla: 100 }, { arla: found, area: many('b', 3) });
  assert.deepEqual(await searchIndex(brand, 'arla', 20), { best: found, close: [] });
  const common = phone({ yogurts: 6000, yogurtz: 100 }, { yogurtz: found, yogurts: many('b', 3) });
  assert.deepEqual(await searchIndex(common, 'yogurtz', 20), { best: found, close: [] });
});
