import { BUILTIN, DISH_START } from '../src/foods';
import { SearchIndex, SearchDoc } from '../src/search';
import { usdaFoods } from '../src/usda';

type Item = { name: string };
const docs: SearchDoc<Item>[] = [
  ...BUILTIN.map((f, i) => ({ key: f.id, name: f.name, boost: i >= DISH_START ? 2.6 : 3.5, item: { name: '★ ' + f.name + ' — ' + f.serving } })),
  ...usdaFoods().map((u) => ({ key: u.id, name: u.name, alias: u.alias, boost: ({ 21: -0.8, 36: -0.8, 22: -0.5, 25: -0.2 } as Record<number, number>)[u.group] ?? 0, item: { name: u.name } })),
];
let t = Date.now();
const idx = new SearchIndex(docs);
console.log('index built in', Date.now() - t, 'ms,', docs.length, 'docs');
const queries = process.argv.slice(2).length ? process.argv.slice(2) : ['spaghetti', 'spag', 'spagetti', 'spaghetti meat sauce', 'brocoli', 'chiken breast', 'banan', 'apple', 'yougurt', 'greek yogurt', 'mac and cheese', 'fries', 'soda', 'coke', 'hot dog', 'oj', 'strawberries', 'eggs', 'big mac', 'burrito', 'salmon', 'rice', 'white rice', 'oatmeal', 'avocado', 'tortilla', 'peanut butter', 'pizza', 'steak', 'cookies', 'bread', 'milk', 'cheese', 'turkey sandwich', 'ice cream', 'protein bar'];
for (const q of queries) {
  t = Date.now();
  const hits = idx.search(q, 6);
  const ms = Date.now() - t;
  console.log(`\n"${q}" (${ms} ms)${hits.length ? '' : '  -> did you mean: ' + idx.didYouMean(q)}   completions: ${idx.complete(q, idx.search(q, 40), 4).join(' | ')}`);
  hits.forEach((h) => console.log('   ', h.score.toFixed(1), h.doc.item.name));
}
