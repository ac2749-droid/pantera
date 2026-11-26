import { aiLabel } from '../src/meal/ai';
const body = { calories: 230, fat_g: 8, saturated_fat_g: 1, carbs_g: 37, fiber_g: 4, sugars_g: 12, protein_g: 3, sodium_mg: 160, potassium_mg: 240, calcium_mg: 260, iron_mg: 8, vitamin_c_mg: -1, serving_g: 55, serving_label: '2/3 cup', per100: false, name: 'Granola' };
(globalThis as any).fetch = async (url: string, init: any) => {
  const b = JSON.parse(init.body);
  const isMeta = url.includes('meta.ai');
  const hasImage = isMeta ? b.messages[0].content[1].image_url.url.startsWith('data:image/jpeg;base64,') : !!b.contents[0].parts[0].inline_data.data;
  if (!hasImage) throw new Error('no image');
  const text = JSON.stringify(body);
  return { ok: true, status: 200, json: async () => (isMeta ? { choices: [{ message: { content: 'Here: ' + text } }] } : { candidates: [{ content: { parts: [{ text }] } }] }) } as any;
};
(async () => {
  for (const prov of ['gemini', 'meta'] as const) {
    const r = await aiLabel('QUJD', 'key', prov);
    const ok = r && r.values.kcal === 230 && r.values.p === 3 && r.servingG === 55 && r.name === 'Granola' && r.values.vc === undefined && r.found.length === 11;
    console.log(ok ? 'PASS' : 'FAIL', prov, JSON.stringify(r?.values));
  }
})();
