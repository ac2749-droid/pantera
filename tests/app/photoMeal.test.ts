import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';

import { buildPersonalIndex, searchFoods, toFood } from '../../src/foodSearch';
import { aiParse } from '../../src/meal/ai';
import { parseMeal } from '../../src/meal/parse';
import { readPhoto, readSeen, resolveSeen, SeenFood, targetSize } from '../../src/meal/photo';
import { failureText, noticeFor } from '../../src/meal/photoText';
import { itemFromFood, resolveItem, swapFood } from '../../src/meal/resolve';

const personal = buildPersonalIndex([], [], 'all', []);
const seen = (name: string, grams: number | null = 150, extra: Partial<SeenFood> = {}): SeenFood => ({ name, simple: name, grams, amount: '', sure: true, ...extra });

// A stand-in for the network: each call takes the next reply (the last one repeats)
type Reply = { status?: number; body?: unknown; throws?: boolean };
type Call = { url: string; init: RequestInit };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});
function fake(...replies: Reply[]): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), init });
    const r = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (r.throws) throw new TypeError('Network request failed');
    const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? {});
    return new Response(text, { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
}
const gemini = (obj: unknown): Reply => ({ body: { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] } });
const meta = (obj: unknown): Reply => ({ body: { choices: [{ message: { content: JSON.stringify(obj) } }] } });
const PLATE = { items: [{ name: 'chicken breast, grilled', simple: 'chicken breast', grams: 140, amount: '1 piece', sure: true }, { name: 'white rice, cooked', simple: 'white rice', grams: 180, amount: 'about 1 cup', sure: false }] };
const read = (key = 'k-123', provider: 'gemini' | 'meta' = 'gemini', signal?: AbortSignal) => readPhoto('QUJD', personal, { key, provider }, signal);

// ---------- reading the reply ----------

test('a reply is read even with a code fence or words around it', () => {
  const fenced = '```json\n' + JSON.stringify(PLATE) + '\n```';
  assert.equal(readSeen(fenced)?.length, 2);
  assert.equal(readSeen('Here you go: ' + JSON.stringify(PLATE) + ' Enjoy!')?.length, 2);
  assert.deepEqual(readSeen('{"items":[]}'), []);
});

test('a reply that is not the expected JSON is unreadable, not empty', () => {
  assert.equal(readSeen('I can see a plate of food.'), null);
  assert.equal(readSeen('{"foods":[]}'), null);
  assert.equal(readSeen(''), null);
});

test('odd weights are dropped, and nameless items skipped', () => {
  const list = readSeen(JSON.stringify({ items: [
    { name: 'apple', grams: 0 }, { name: 'banana', grams: -5 }, { name: 'rice', grams: 'a lot' }, { name: 'soup', grams: 90000 },
    { name: 'toast', grams: '60' }, { name: '  ', grams: 10 }, { grams: 10 }, null,
  ] }))!;
  assert.deepEqual(list.map((x) => [x.name, x.grams]), [['apple', null], ['banana', null], ['rice', null], ['soup', null], ['toast', 60]]);
  assert.equal(list[0].simple, 'apple');
});

test('a very long reply is cut to a sensible number of foods', () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ name: `food ${i}`, grams: 10 }));
  assert.equal(readSeen(JSON.stringify({ items }))!.length, 20);
});

// ---------- matching foods ----------

test('names a photo reader is likely to use find the right foods in the database', () => {
  const cases: [string, string, RegExp][] = [
    ['chicken breast, grilled', 'chicken breast', /chicken.*breast|breast.*chicken/i],
    ['white rice, cooked', 'white rice', /rice/i],
    ['broccoli, steamed', 'broccoli', /broccoli/i],
    ['scrambled eggs', 'eggs', /egg/i],
    ['french fries', 'french fries', /fries|french fried/i],
    ['olive oil', 'olive oil', /olive/i],
    ['caesar salad dressing', 'caesar dressing', /dressing/i],
    ['pepperoni pizza', 'pizza', /pizza/i],
    ['salmon fillet, baked', 'salmon', /salmon/i],
    ['banana', 'banana', /banana/i],
    ['avocado, sliced', 'avocado', /avocado/i],
    ['orange juice', 'orange juice', /orange juice/i],
    ['hamburger with cheese', 'cheeseburger', /burger/i],
    ['mixed green salad', 'salad', /salad|lettuce|greens/i],
    ['bacon, fried', 'bacon', /bacon/i],
    ['toast, whole wheat', 'whole wheat bread', /bread|toast/i],
    ['pancakes', 'pancake', /pancake/i],
    ['black beans, cooked', 'black beans', /bean/i],
    ['spaghetti with tomato sauce', 'spaghetti', /spaghetti|pasta/i],
    ['coffee, black', 'coffee', /coffee/i],
  ];
  const wrong = cases.flatMap(([name, simple, expected]) => {
    const [item] = resolveSeen([seen(name, 100, { simple })], personal);
    return item.food && expected.test(item.food.name) ? [] : [`${name} → ${item.food?.name ?? 'nothing'}`];
  });
  assert.deepEqual(wrong, []);
});

const matched = (name: string, simple: string) => resolveSeen([seen(name, 100, { simple })], personal)[0];

test('cooked food is not matched to the raw food when a cooked one exists', () => {
  for (const [name, simple] of [['broccoli, steamed', 'broccoli'], ['zucchini, grilled', 'zucchini'], ['spinach, sauteed', 'spinach']]) {
    const item = matched(name, simple);
    assert.match(item.food!.name, new RegExp(simple, 'i'), name);
    assert.doesNotMatch(item.food!.name, /\braw\b/i, name);
  }
  assert.doesNotMatch(matched('broccoli, steamed', 'broccoli').food!.name, /chinese|raab/i);
});

test('a different kind of food is not picked just because the words overlap', () => {
  assert.doesNotMatch(matched('steak, grilled', 'steak').food!.name, /soup/i);
  assert.doesNotMatch(matched('bacon, fried', 'bacon').food!.name, /canadian|turkey|meatless/i);
});

test('a food asked for by that kind keeps it', () => {
  assert.match(matched('canadian bacon, fried', 'canadian bacon').food!.name, /canadian/i);
  assert.match(matched('tomato soup', 'tomato soup').food!.name, /soup/i);
  assert.match(matched('broccoli, raw', 'broccoli').food!.name, /raw/i);
});

test('a match that is missing part of the name is marked to check', () => {
  assert.equal(matched('salmon sushi roll', 'salmon sushi').confidence, 'check');
});

test('the estimated weight is used, and the nutrients come from the database food', () => {
  const [a] = resolveSeen([seen('banana', 237)], personal);
  assert.equal(a.grams, 237);
  assert.equal(a.portion.label, '1 g');
  assert.equal(a.count, 237);
  assert.ok(a.food && a.food.n.kcal > 0);
});

test('without a usable weight, one ordinary portion is used', () => {
  const [a] = resolveSeen([seen('banana', null)], personal);
  assert.ok(a.grams > 50 && a.grams < 300, String(a.grams));
});

test('a food the reader was unsure of is marked to check', () => {
  const [sure, unsure] = resolveSeen([seen('banana'), seen('banana', 100, { sure: false })], personal);
  assert.equal(sure.confidence, 'good');
  assert.equal(unsure.confidence, 'check');
});

test('a food that is not in the database keeps its weight for when you pick one', () => {
  const [a] = resolveSeen([seen('zzqxv', 85, { simple: 'qqzzv' })], personal);
  assert.equal(a.food, null);
  assert.equal(a.confidence, 'none');
  assert.equal(a.grams, 85);
  assert.equal(a.keepGrams, true);
});

test('the simpler name is tried when the full name finds nothing', () => {
  const [a] = resolveSeen([seen('zzqxv vvkkq wwjjz', 100, { simple: 'banana' })], personal);
  assert.match(a.food?.name ?? '', /banana/i);
});

test('the review line says what was seen', () => {
  const [a] = resolveSeen([seen('pepperoni pizza', 220, { amount: '2 slices' })], personal);
  assert.equal(a.said, 'pepperoni pizza, 2 slices');
});

// ---------- sending the photo ----------

test('the photo goes in the body, the key in a header and never in the address', async () => {
  const calls = fake(gemini(PLATE));
  const r = await read();
  assert.ok(r.ok);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].grams, 140);
  assert.equal(r.items[1].confidence, 'check');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/generativelanguage\.googleapis\.com\//);
  assert.doesNotMatch(calls[0].url, /k-123/);
  assert.equal((calls[0].init.headers as Record<string, string>)['x-goog-api-key'], 'k-123');
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.contents[0].parts[0], { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } });
});

test('a Meta key sends the photo to Meta', async () => {
  const calls = fake(meta(PLATE));
  const r = await read('m-1', 'meta');
  assert.ok(r.ok);
  assert.match(calls[0].url, /^https:\/\/api\.meta\.ai\//);
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer m-1');
  assert.match(String(calls[0].init.body), /data:image\/jpeg;base64,QUJD/);
});

test('without a key nothing is sent', async () => {
  const calls = fake(gemini(PLATE));
  assert.deepEqual(await read('   '), { ok: false, reason: 'bad_key' });
  assert.equal(calls.length, 0);
});

test('no food in the photo is reported as such', async () => {
  fake(gemini({ items: [] }));
  assert.deepEqual(await read(), { ok: false, reason: 'no_food' });
});

const failures: [string, Reply, string][] = [
  ['no internet', { throws: true }, 'network'],
  ['a rejected key', { status: 400, body: { error: { message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } } }, 'bad_key'],
  ['a key without access', { status: 403, body: { error: { status: 'PERMISSION_DENIED' } } }, 'bad_key'],
  ['a used-up free limit, though Google mentions billing', { status: 429, body: { error: { message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED' } } }, 'rate_limit'],
  ['an unsupported place', { status: 400, body: { error: { message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' } } }, 'region'],
  ['no free tier in this country', { status: 400, body: { error: { message: 'Gemini API free tier is not available in your country. Please enable billing on your project.', status: 'FAILED_PRECONDITION' } } }, 'region'],
  ['no credit', { status: 402, body: 'insufficient_quota' }, 'no_credit'],
  ['an overloaded service', { status: 503, body: 'overloaded' }, 'overloaded'],
  ['a blocked photo', { body: { promptFeedback: { blockReason: 'SAFETY' } } }, 'blocked'],
  ['a reply in plain words', gemini('That looks tasty!'), 'bad_response'],
];
for (const [what, reply, reason] of failures) {
  test(`photo reading reports ${what}`, async () => {
    fake(reply);
    assert.deepEqual(await read(), { ok: false, reason });
  });
}

test('the next model is tried when one is retired or out of quota', async () => {
  for (const status of [404, 429, 503]) {
    const calls = fake({ status, body: 'nope' }, gemini(PLATE));
    const r = await read();
    assert.ok(r.ok, String(status));
    assert.equal(calls.length, 2);
    assert.notEqual(calls[0].url, calls[1].url);
  }
});

test('cancelling stops the request and reports it', async () => {
  const stop = new AbortController();
  globalThis.fetch = ((_url: unknown, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(new Error('aborted')));
      stop.abort();
    })) as typeof fetch;
  assert.deepEqual(await read('k', 'gemini', stop.signal), { ok: false, reason: 'cancelled' });
});

test('already cancelled means nothing is sent', async () => {
  const calls = fake(gemini(PLATE));
  const stop = new AbortController();
  stop.abort();
  assert.deepEqual(await read('k', 'gemini', stop.signal), { ok: false, reason: 'cancelled' });
  assert.equal(calls.length, 0);
});

test('written meals are still read the same way', async () => {
  const calls = fake(gemini({ meal: 'lunch', day_offset: -1, items: [{ name: 'banana', quantity: 2, unit: 'medium', grams: 230 }] }));
  const r = await aiParse('2 bananas', 'k');
  assert.ok(r.ok);
  assert.equal(r.meal.meal, 'lunch');
  assert.equal(r.meal.dayOffset, -1);
  assert.equal(r.meal.items[0].size, 'medium');
  assert.deepEqual(r.grams, [230]);
  const body = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(body.contents[0].parts, [{ text: '2 bananas' }]);
});

test('written meals retry without the schema, and report a used-up limit', async () => {
  const calls = fake({ status: 400, body: 'schema not accepted' }, gemini({ meal: 'unknown', day_offset: 0, items: [] }));
  assert.ok((await aiParse('toast', 'k')).ok);
  assert.ok(!('responseSchema' in JSON.parse(String(calls[1].init.body)).generationConfig));
  fake({ status: 429, body: 'quota; check billing' });
  assert.deepEqual(await aiParse('toast', 'k'), { ok: false, reason: 'rate_limit' });
});

// ---------- correcting what was found ----------

const database = (name: string) => toFood(searchFoods(name, personal, 'all', 1)[0].doc.item);

test('changing a photo food keeps the weight seen, or the weight you set', () => {
  const [item] = resolveSeen([seen('banana', 237)], personal);
  assert.equal(swapFood(item, database('apple')).grams, 237);
  assert.equal(swapFood({ ...item, grams: 80, count: 80 }, database('apple')).grams, 80);
});

test('picking a food for something not found uses the estimated weight', () => {
  const [item] = resolveSeen([seen('zzqxv', 85, { simple: 'qqzzv' })], personal);
  const picked = swapFood(item, database('banana'));
  assert.equal(picked.grams, 85);
  assert.equal(picked.portion.label, '1 g');
});

test('changing a spoken food still follows the amount said', () => {
  const said = resolveItem(parseMeal('2 eggs').items[0], personal);
  const swapped = swapFood(said, database('banana'));
  assert.equal(swapped.count, 2);
  assert.ok(swapped.grams > 150);
});

test('a food added by hand starts as one ordinary portion', () => {
  const food = database('banana');
  const item = itemFromFood(food);
  assert.equal(item.food?.id, food.id);
  assert.ok(item.grams > 50 && item.grams < 300, String(item.grams));
  assert.equal(item.count, 1);
  assert.equal(item.said, '');
});

// ---------- what the screen says ----------

test('the Google notice covers sending, use of free data, age and region', () => {
  const text = noticeFor('gemini').points.join(' ');
  for (const must of [/Google/, /only when you tap/, /improve/, /review/, /18 or older/, /European Economic Area/, /Switzerland/, /United Kingdom/, /paid key/]) assert.match(text, must);
});

test('the Meta notice names Meta and the charge, and not Google', () => {
  const text = noticeFor('meta').points.join(' ');
  assert.match(text, /Meta/);
  assert.match(text, /charges/);
  assert.doesNotMatch(text, /Google/);
});

test('every way a photo can fail has words, and a way forward where one exists', () => {
  const reasons = ['network', 'rate_limit', 'bad_key', 'no_credit', 'region', 'overloaded', 'blocked', 'no_food', 'bad_response', 'cancelled'] as const;
  for (const r of reasons) {
    for (const p of ['gemini', 'meta'] as const) {
      const f = failureText(r, p);
      assert.ok(f.title && f.detail, r);
    }
  }
  assert.ok(failureText('network', 'gemini').retry);
  assert.ok(failureText('rate_limit', 'gemini').retry);
  assert.ok(failureText('bad_key', 'gemini').settings);
  assert.ok(!failureText('no_food', 'gemini').retry);
});

// ---------- shrinking the photo ----------

test('large photos are shrunk by their longer side, small ones left alone', () => {
  assert.deepEqual(targetSize(4000, 3000), { width: 1280 });
  assert.deepEqual(targetSize(3000, 4000), { height: 1280 });
  assert.equal(targetSize(1280, 960), null);
  assert.equal(targetSize(640, 480), null);
  assert.deepEqual(targetSize(0, 0), { width: 1280 });
});
