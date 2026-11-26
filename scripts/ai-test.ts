import { buildPersonalIndex } from '../src/foodSearch';
import { readMeal } from '../src/meal';

const personal = buildPersonalIndex([], [], 'all');
const answer = {
  meal: 'lunch', day_offset: 0,
  items: [
    { name: 'flour tortilla', quantity: 1, unit: 'each', grams: 49 },
    { name: 'chicken breast, cooked', quantity: 60, unit: 'g', grams: 60 },
    { name: 'tomato', quantity: 2, unit: 'slice', grams: 40 },
    { name: 'lettuce', quantity: 0.5, unit: 'cup', grams: 20 },
    { name: 'mayonnaise', quantity: 1, unit: 'tbsp', grams: 14 },
    { name: 'white rice, cooked', quantity: 1, unit: 'cup', grams: 158 },
    { name: 'guacamole', quantity: 2, unit: 'tbsp', grams: 30 },
  ],
};
function mock(scenario: string) {
  const calls: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    calls.push(url.split('/models/')[1]);
    const json = (status: number, body: any) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (scenario === 'ok') return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    if (scenario === 'badkey') return json(400, { error: { message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
    if (scenario === 'ratelimit') return json(429, { error: { status: 'RESOURCE_EXHAUSTED' } });
    if (scenario === 'firstModelGone') return calls.length === 1 ? json(404, { error: { message: 'models/gemini-3.5-flash-lite is not found' } }) : json(200, { candidates: [{ content: { parts: [{ text: '```json\n' + JSON.stringify(answer) + '\n```' }] } }] });
    throw new Error('offline');
  };
  return calls;
}
(async () => {
  for (const sc of ['ok', 'badkey', 'ratelimit', 'firstModelGone', 'offline']) {
    const calls = mock(sc);
    const r = await readMeal('chipotle style chicken wrap with rice and guac for lunch', personal, { key: 'test-key', enabled: true });
    console.log(`\n[${sc}] source=${r.source} problem=${r.aiProblem ?? '-'} meal=${r.meal} models=${calls.join(' → ')}`);
    r.items.forEach((i) => console.log(`   ${i.food?.name ?? 'NO MATCH: ' + i.query} — ${i.count} × ${i.portion.label} = ${Math.round(i.grams)} g ${i.food ? Math.round((i.food.n.kcal * i.grams) / i.food.g) + ' kcal' : ''}`));
  }
})();
