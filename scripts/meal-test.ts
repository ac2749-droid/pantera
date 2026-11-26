import { buildPersonalIndex } from '../src/foodSearch';
import { parseMeal } from '../src/meal/parse';
import { resolveItem } from '../src/meal/resolve';

const personal = buildPersonalIndex([], [], 'all');
const cases = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [
      'a white tortilla wrap with about 60g of chicken breast and some tomatoe and lettuce and a tbp of mayonnaise',
      'Hey chat I ate an apple today medium sized, can you log that in for me?',
      '2 eggs and toast with butter for breakfast',
      'half a cup of rice and 5 oz salmon',
      '12 oz coke',
      'a large banana, greek yogurt and a handful of almonds',
      'coffee with milk and 2 tsp sugar',
      'mac and cheese',
      'spaghetti with meat sauce and a slice of garlic bread',
      'yesterday for dinner I had 2 slices of pepperoni pizza and a can of coke',
      '3 scrambled eggs, 2 strips of bacon and a glass of orange juice',
      'chicken breast 150g, broccoli 1 cup, brown rice 1 1/2 cups',
      'a big mac and medium fries',
      'protein shake with 1 scoop whey and 1 cup almond milk',
      'a bowl of oatmeal with blueberries and a tbsp of honey',
      'pb and j sandwich',
      'two hard boiled eggs',
      'a can of tuna',
    ];

for (const c of cases) {
  const m = parseMeal(c);
  console.log(`\n» ${c}\n  meal=${m.meal ?? '-'} day=${m.dayOffset}`);
  m.items.forEach((it) => {
    const r = resolveItem(it, personal);
    const amt = r.food ? `${r.count} × ${r.portion.label} = ${Math.round(r.grams)} g, ${Math.round(r.food.n.kcal * (r.grams / r.food.g))} kcal` : '';
    console.log(`  - [${it.qty ?? '·'} ${it.unit?.key ?? '·'} ${it.size ?? ''}] "${it.food}" → ${r.food ? r.food.name : 'NO MATCH'} ${r.confidence === 'good' ? '' : '(' + r.confidence + ')'}  ${amt}`);
  });
}
