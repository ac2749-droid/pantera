/**
 * Optional "AI boost" using Google's Gemini API (free tier works; no billing = no charges)
 * or Meta's Model API (paid per use, fractions of a cent per meal).
 * The AI only breaks the description into foods and amounts. Nutrition always comes from
 * Pantera's own food database, so numbers stay consistent with the rest of the app.
 */
import type { MealKey, NutrientKey } from '../foods';
import type { LabelReading } from '../label';
import { ParsedItem, ParsedMeal, Size, unitFromWord } from './parse';

// Tried in order; if Google retires one, the next is used
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
const ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

export type AiProvider = 'gemini' | 'meta';
// Meta Model API (OpenAI-style chat completions). The separate Llama API at api.llama.com was retired in July 2026.
const META_ENDPOINT = 'https://api.meta.ai/v1/chat/completions';
const META_MODELS = ['muse-spark-1.3', 'muse-spark-1.1'];

export type AiFailure = 'bad_key' | 'rate_limit' | 'no_credit' | 'network' | 'region' | 'overloaded' | 'bad_response';
export type AiOutcome = { ok: true; meal: ParsedMeal; grams: (number | null)[] } | { ok: false; reason: AiFailure };

const SYSTEM = `You turn a person's description of what they ate into a list of foods for a calorie tracker.
Rules:
- Return each food separately, using a short, generic English name like a nutrition database would use: "flour tortilla", "chicken breast, cooked", "mayonnaise", "white rice, cooked", "cola".
- If the person lists the ingredients of a dish, return the ingredients. If they name a well-known item without details ("Big Mac", "slice of pepperoni pizza", "chicken burrito"), return it as one item.
- For a restaurant bowl or salad described only by name, return its typical main components.
- quantity and unit: use what the person said. unit must be one of: g, oz, fl oz, ml, cup, tbsp, tsp, slice, piece, serving, can, bottle, glass, scoop, small, medium, large, each. If they didn't say, choose a typical single portion.
- grams: your best estimate of the total edible grams for that item.
- meal: breakfast, lunch, dinner or snacks if stated or clearly implied ("this morning" = breakfast), otherwise "unknown".
- day_offset: 0 for today, -1 for yesterday, -2 for two days ago.
- Ignore chatter that isn't food. Never add foods the person didn't mention, except typical components of a named restaurant dish.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    meal: { type: 'STRING', enum: ['breakfast', 'lunch', 'dinner', 'snacks', 'unknown'] },
    day_offset: { type: 'INTEGER' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unit: { type: 'STRING' },
          grams: { type: 'NUMBER' },
        },
        required: ['name', 'quantity', 'unit', 'grams'],
      },
    },
  },
  required: ['meal', 'day_offset', 'items'],
};

// Same shape as SCHEMA in standard JSON Schema, for OpenAI-style APIs
const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    meal: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snacks', 'unknown'] },
    day_offset: { type: 'integer' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, quantity: { type: 'number' }, unit: { type: 'string' }, grams: { type: 'number' } },
        required: ['name', 'quantity', 'unit', 'grams'],
      },
    },
  },
  required: ['meal', 'day_offset', 'items'],
};

/** One question for the AI: words, and optionally a photo, answered as JSON. */
export type AiAsk = {
  system: string;
  text: string;
  image?: string; // base64 JPEG
  schema: object; // Gemini's flavour
  jsonSchema: object; // standard JSON Schema, for OpenAI-style APIs
  keys: string; // what to ask for in words when a model won't take the schema
  timeoutMs?: number;
};
export type AiAnswer<T> = { ok: true; value: T } | { ok: false; reason: AiFailure | 'blocked' | 'cancelled' };

function request(provider: AiProvider, model: string, key: string, ask: AiAsk, withSchema: boolean): [string, RequestInit] {
  if (provider === 'meta') {
    const system = ask.system + (withSchema ? '' : `\nReply with only a JSON object with keys ${ask.keys}.`);
    const content = ask.image ? [{ type: 'text', text: ask.text }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${ask.image}` } }] : ask.text;
    return [
      META_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content },
          ],
          max_completion_tokens: ask.image ? 2000 : 1200,
          ...(withSchema ? { reasoning_effort: 'minimal', response_format: { type: 'json_schema', json_schema: { name: 'meal', schema: ask.jsonSchema, strict: true } } } : {}),
        }),
      },
    ];
  }
  return [
    ENDPOINT(model),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: ask.system }] },
        contents: [{ role: 'user', parts: [...(ask.image ? [{ inline_data: { mime_type: 'image/jpeg', data: ask.image } }] : []), { text: ask.text }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json', ...(withSchema ? { responseSchema: ask.schema } : {}) },
      }),
    },
  ];
}

/** The text of a reply, from either provider. */
function replyText(data: any): string | undefined {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((c: any) => c?.text ?? '').join('');
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('');
}
const wasBlocked = (data: any) =>
  !!data?.promptFeedback?.blockReason || /SAFETY|PROHIBITED|BLOCKLIST|RECITATION|content_filter/i.test(String(data?.candidates?.[0]?.finishReason ?? data?.choices?.[0]?.finish_reason ?? ''));

/** Ask the models in turn until one answers with something `read` understands. */
export async function askAi<T>(provider: AiProvider, key: string, ask: AiAsk, read: (text: string) => T | null, signal?: AbortSignal): Promise<AiAnswer<T>> {
  let sawRateLimit = false;
  let sawBusy = false;
  const models = provider === 'meta' ? META_MODELS : MODELS;
  for (const model of models) {
    for (const withSchema of [true, false]) {
      if (signal?.aborted) return { ok: false, reason: 'cancelled' };
      const ctrl = new AbortController();
      const stop = () => ctrl.abort();
      signal?.addEventListener('abort', stop);
      // The timer covers the whole reply, not only its first bytes
      const timer = setTimeout(stop, ask.timeoutMs ?? (provider === 'meta' ? 25000 : 20000));
      let res: Response;
      let body: string;
      try {
        const [url, init] = request(provider, model, key.trim(), ask, withSchema);
        res = await fetch(url, { ...init, signal: ctrl.signal });
        body = await res.text();
      } catch {
        return { ok: false, reason: signal?.aborted ? 'cancelled' : 'network' };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
      }
      if (res.ok) {
        let data: any = null;
        try {
          data = JSON.parse(body);
        } catch {}
        const text = replyText(data);
        const value = text ? read(text) : null;
        if (value !== null) return { ok: true, value };
        if (wasBlocked(data)) return { ok: false, reason: 'blocked' };
        if (withSchema) continue; // try once more without the schema
        return { ok: false, reason: 'bad_response' };
      }
      // Where you are comes first: these replies also say "not supported" or mention billing
      if (/location is not supported|not available in your (country|region)/i.test(body)) return { ok: false, reason: 'region' };
      if (res.status === 401 || res.status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|invalid_api_key|Incorrect API key/i.test(body)) return { ok: false, reason: 'bad_key' };
      if (res.status === 402 || /insufficient_quota|credit balance/i.test(body)) return { ok: false, reason: 'no_credit' };
      // Checked before "billing": Google's used-up free limit says "check your plan and billing details"
      if (res.status === 429) {
        sawRateLimit = true;
        break; // this model's quota is used up; try the next model
      }
      if (/billing/i.test(body)) return { ok: false, reason: 'no_credit' };
      if (res.status === 404 || /not found|not supported|is not available/i.test(body)) break; // model retired: next model
      if (res.status === 400 && withSchema) continue; // schema not accepted: retry without it
      if (res.status >= 500) {
        sawBusy = true;
        break;
      }
      return { ok: false, reason: 'bad_response' };
    }
  }
  return { ok: false, reason: sawRateLimit ? 'rate_limit' : sawBusy ? 'overloaded' : 'bad_response' };
}

function toParsed(text: string): { meal: ParsedMeal; grams: (number | null)[] } | null {
  const obj = parseJsonText(text);
  if (!obj || !Array.isArray(obj.items)) return null;
  const grams: (number | null)[] = [];
  const items: ParsedItem[] = [];
  obj.items.forEach((x: any) => {
    const name = String(x?.name ?? '').trim();
    if (!name) return;
    const unitWord = String(x?.unit ?? '').toLowerCase().trim();
    const sizeWord = ['small', 'medium', 'large'].includes(unitWord) ? (unitWord as Size) : null;
    const unit = unitWord === 'fl oz' ? unitFromWord('floz') ?? { key: 'floz', kind: 'volume', ml: 29.5735, label: 'fl oz' } : sizeWord || unitWord === 'each' ? null : unitFromWord(unitWord);
    const qty = typeof x?.quantity === 'number' && x.quantity > 0 ? x.quantity : null;
    items.push({ raw: name, qty, unit: unit ?? null, size: sizeWord, food: name.toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' '), vague: false });
    grams.push(typeof x?.grams === 'number' && x.grams > 0 ? x.grams : null);
  });
  const meal: MealKey | null = ['breakfast', 'lunch', 'dinner', 'snacks'].includes(obj.meal) ? obj.meal : null;
  const dayOffset = Number.isInteger(obj.day_offset) && obj.day_offset <= 0 && obj.day_offset > -8 ? obj.day_offset : 0;
  return { meal: { items, meal, dayOffset }, grams };
}

export async function aiParse(text: string, key: string, provider: AiProvider = 'gemini'): Promise<AiOutcome> {
  const ask: AiAsk = { system: SYSTEM, text, schema: SCHEMA, jsonSchema: JSON_SCHEMA, keys: 'meal, day_offset and items (each item: name, quantity, unit, grams)' };
  const r = await askAi(provider, key, ask, toParsed);
  if (r.ok) return { ok: true, ...r.value };
  return { ok: false, reason: r.reason === 'blocked' || r.reason === 'cancelled' ? 'bad_response' : r.reason };
}

/** Quick check used by the settings screen. */
export async function testKey(key: string, provider: AiProvider = 'gemini'): Promise<AiOutcome> {
  return aiParse('a medium apple', key, provider);
}

// ---------- Nutrition label from a photo (AI vision) ----------

const LABEL_PROMPT = `This is a photo of a food package's nutrition label. Read it exactly.
Return the values for ONE SERVING as printed (or per 100 g if the label only gives per-100 g values; then set per100 true).
Use grams for fat, saturated fat, carbs, fiber, sugars (total sugars, not added sugars) and protein; milligrams for sodium, potassium, calcium, iron, vitamin C and cholesterol; micrograms (mcg) for vitamin D.
If a value isn't on the label, use -1. serving_label is the household measure like "2/3 cup" or "1 bar"; serving_g is the weight in grams (or ml).
Also return the product name if it's visible on the package, otherwise "".`;

const LABEL_FIELDS: [string, NutrientKey][] = [['calories', 'kcal'], ['fat_g', 'f'], ['saturated_fat_g', 'sat'], ['carbs_g', 'c'], ['fiber_g', 'fib'], ['sugars_g', 'sug'], ['protein_g', 'p'], ['sodium_mg', 'na'], ['potassium_mg', 'k'], ['calcium_mg', 'ca'], ['iron_mg', 'fe'], ['vitamin_c_mg', 'vc'], ['cholesterol_mg', 'chol'], ['vitamin_d_mcg', 'vd']];
const labelProps = (num: string, str: string, bool: string) => ({
  serving_label: { type: str },
  serving_g: { type: num },
  per100: { type: bool },
  name: { type: str },
  ...Object.fromEntries(LABEL_FIELDS.map(([f]) => [f, { type: num }])),
});

function toLabelReading(obj: any): (LabelReading & { name?: string }) | null {
  if (!obj || typeof obj !== 'object') return null;
  const r: LabelReading & { name?: string } = { values: {}, estimated: [], found: [] };
  for (const [f, k] of LABEL_FIELDS) {
    const v = Number(obj[f]);
    if (isFinite(v) && v >= 0) {
      r.values[k] = Math.round(v * 10) / 10;
      r.found.push(k);
    }
  }
  const sg = Number(obj.serving_g);
  if (isFinite(sg) && sg > 0) r.servingG = sg;
  if (typeof obj.serving_label === 'string' && obj.serving_label.trim()) r.servingLabel = obj.serving_label.trim().slice(0, 40);
  r.per100 = obj.per100 === true;
  if (r.per100 && !r.servingG) {
    r.servingG = 100;
    r.servingLabel = '100 g';
  }
  if (typeof obj.name === 'string' && obj.name.trim()) r.name = obj.name.trim().slice(0, 80);
  return r.found.length >= 2 ? r : null;
}

function parseJsonText(raw: string | undefined): any {
  if (!raw) return null;
  try {
    const c = raw.replace(/^\s*```(json)?/i, '').replace(/```\s*$/, '').trim();
    const a = c.indexOf('{'), b = c.lastIndexOf('}');
    return JSON.parse(a >= 0 && b > a ? c.slice(a, b + 1) : c);
  } catch {
    return null;
  }
}

/** Read a nutrition label photo with the user's AI key. Returns null on any failure (the on-device reading is used instead). */
export async function aiLabel(base64: string, key: string, provider: AiProvider = 'gemini'): Promise<(LabelReading & { name?: string }) | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    if (provider === 'meta') {
      for (const model of META_MODELS) {
        const res = await fetch(META_ENDPOINT, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key.trim()}` },
          body: JSON.stringify({
            model,
            max_completion_tokens: 600,
            messages: [{ role: 'user', content: [{ type: 'text', text: LABEL_PROMPT + '\nReply with only a JSON object with keys: ' + ['serving_label', 'serving_g', 'per100', 'name', ...LABEL_FIELDS.map((x) => x[0])].join(', ') }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64}` } }] }],
          }),
        });
        if (res.status === 404) continue;
        if (!res.ok) return null;
        const data = await res.json().catch(() => null);
        const content = data?.choices?.[0]?.message?.content;
        return toLabelReading(parseJsonText(typeof content === 'string' ? content : Array.isArray(content) ? content.map((c: any) => c?.text ?? '').join('') : undefined));
      }
      return null;
    }
    for (const model of MODELS) {
      const res = await fetch(ENDPOINT(model), {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key.trim() },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: LABEL_PROMPT }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: labelProps('NUMBER', 'STRING', 'BOOLEAN'), required: ['serving_g', 'calories', 'fat_g', 'carbs_g', 'protein_g'] } },
        }),
      });
      if (res.status === 404 || res.status === 429) continue;
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      return toLabelReading(parseJsonText(data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text ?? '').join('')));
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
