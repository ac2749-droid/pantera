import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPersonalIndex } from '../../src/foodSearch';
import { parseMeal } from '../../src/meal/parse';
import { resolveItem } from '../../src/meal/resolve';
import { cleanIngredient, findRecipe, ingredientQuery, loadRecipe, RecipeImportError, recipeUrl } from '../../src/recipeImport';

const page = (...blocks: unknown[]) =>
  `<html><head>${blocks.map((b) => `<script type="application/ld+json">${typeof b === 'string' ? b : JSON.stringify(b)}</script>`).join('')}</head></html>`;
const recipe = { '@type': 'Recipe', name: 'Chili', recipeYield: '6 servings', recipeIngredient: ['1 lb ground beef', '1 can beans'] };

test('a recipe is read from the page’s structured data', () => {
  assert.deepEqual(findRecipe(page(recipe)), { name: 'Chili', servings: 6, ingredients: ['1 lb ground beef', '1 can beans'] });
});

test('it is found inside a graph, a list, or beside broken blocks', () => {
  const graph = { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite' }, { ...recipe, '@type': ['Recipe', 'NewsArticle'] }] };
  assert.equal(findRecipe(page('{ not json', graph))?.name, 'Chili');
  assert.equal(findRecipe(page([{ '@type': 'Person' }, recipe]))?.name, 'Chili');
  assert.equal(findRecipe(page({ '@type': 'WebPage', mainEntity: recipe }))?.name, 'Chili');
});

test('servings come in several shapes', () => {
  const servings = (recipeYield: unknown) => findRecipe(page({ ...recipe, recipeYield }))?.servings;
  assert.equal(servings(4), 4);
  assert.equal(servings(['8', '8 slices']), 8);
  assert.equal(servings('Makes about 12 muffins'), 12);
  assert.equal(servings('a crowd'), null);
  assert.equal(servings(undefined), null);
});

test('web text is made plain', () => {
  const found = findRecipe(page({ ...recipe, name: 'Mac &amp; Cheese', recipeIngredient: ['<b>2 cups</b> mac&#39;n', ' &frac12; cup milk ', ''] }));
  assert.deepEqual([found?.name, found?.ingredients], ['Mac & Cheese', ["2 cups mac'n", '½ cup milk']]);
});

test('a page without a recipe gives nothing', () => {
  assert.equal(findRecipe('<html><body>hello</body></html>'), null);
  assert.equal(findRecipe(page({ '@type': 'Recipe', name: 'Empty', recipeIngredient: [] })), null);
});

test('ingredient lines lose their kitchen notes', () => {
  const cases: [string, string][] = [
    ['2 cloves garlic, minced', '2 cloves garlic'],
    ['▢ 1 cup (240 ml) whole milk', '1 cup whole milk'],
    ['1 (14.5 ounce) can diced tomatoes, undrained', '14.5 oz diced tomatoes'],
    ['2 (400 g) cans chickpeas', '800 g chickpeas'],
    ['Salt, to taste', 'Salt'],
    ['1 tbsp olive oil, plus more for serving', '1 tbsp olive oil'],
    ['1/2 cup sour cream (optional)', '1/2 cup sour cream'],
    ['1 pound boneless, skinless chicken breast', '1 pound boneless skinless chicken breast'],
    ['1,000 g potatoes', '1000 g potatoes'],
  ];
  for (const [line, clean] of cases) assert.equal(cleanIngredient(line), clean, line);
});

test('each cleaned line reads as one ingredient', () => {
  const items = parseMeal(cleanIngredient('1 (14.5 ounce) can diced tomatoes, undrained')).items;
  assert.deepEqual(items.map((i) => [i.qty, i.food]), [[14.5, 'diced tomatoes']]);
});

test('only web addresses are opened', () => {
  assert.equal(recipeUrl(' www.example.com/chili '), 'https://www.example.com/chili');
  assert.equal(recipeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(recipeUrl('Check this out: https://example.com/chili !'), 'https://example.com/chili');
  assert.equal(recipeUrl('file:///etc/hosts'), null);
  assert.equal(recipeUrl('chili recipe'), null);
  assert.equal(recipeUrl(''), null);
});

test('loading a page gives its recipe, or says why not', async () => {
  const fake = (status: number, body: string) => (async () => ({ ok: status < 300, status, text: async () => body })) as unknown as typeof fetch;
  assert.equal((await loadRecipe('https://x.test/chili', fake(200, page(recipe)))).name, 'Chili');
  await assert.rejects(loadRecipe('https://x.test/', fake(200, '<html></html>')), (e: RecipeImportError) => e.reason === 'no-recipe');
  await assert.rejects(loadRecipe('https://x.test/', fake(403, '')), (e: RecipeImportError) => e.reason === 'blocked');
  await assert.rejects(loadRecipe('https://x.test/', (async () => { throw new Error('down'); }) as typeof fetch), (e: RecipeImportError) => e.reason === 'unreachable');
});

test('lines are worded the way the food list names things', () => {
  const cases: [string, string | null][] = [
    ['200 g spaghetti', '200 g dry pasta'],
    ['8 oz penne pasta, uncooked', '8 oz dry pasta'],
    ['2 cups cooked pasta', '2 cups cooked pasta'],
    ['1 cup long grain rice', '1 cup dry white rice'],
    ['1 cup brown rice', '1 cup dry brown rice'],
    ['1 cup cooked white rice', '1 cup cooked white rice'],
    ['2 tbsp rice vinegar', '2 tbsp rice vinegar'],
    ['1 (15 ounce) can kidney beans, drained', '15 oz canned kidney beans'],
    ['1 can coconut milk', '1 can canned coconut milk'],
    ['1 teaspoon ground cumin', '1 teaspoon cumin'],
    ['1 tsp cinnamon', '1 tsp ground cinnamon'],
    ['1 tsp smoked paprika', '1 tsp paprika'],
    ['1/2 cup vegetable oil', '1/2 cup canola oil'],
    ['1 large yellow onion, chopped', '1 large onion'],
    ['2 cups plain flour', '2 cups all-purpose flour'],
    ['1 cup chocolate chips', '1 cup chocolate candies semisweet'],
    ['2 cups chicken broth', '2 cups chicken stock'],
    ['Salt and pepper, to taste', null],
    ['1 tsp kosher salt', null],
    ['2 cups water', null],
    ['1 tsp baking soda', null],
    ['1 tsp black pepper', '1 tsp black pepper'],
    ['1 red bell pepper', '1 red bell pepper'],
    ['1 cup unsalted butter', '1 cup unsalted butter'],
  ];
  for (const [line, query] of cases) assert.equal(ingredientQuery(line), query, line);
});

test('prices, nested notes and dotted units from real recipe pages', () => {
  const cases: [string, string | null][] = [
    ['1 yellow onion (small dice, (about 2 cups) $0.74)', '1 onion'],
    ['2 garlic cloves (minced, $0.12)', '2 cloves garlic'],
    ['1 lb. ground beef ($5.94*)', '1 lb ground beef'],
    ['15.5 oz. can kidney beans (one can, (drained & rinsed) $0.86)', '15.5 oz canned kidney beans'],
    ['6 oz. can tomato paste ($0.86)', '6 oz tomato paste'],
    ['1 tsp. salt $0.04', null],
    ['¼ tsp cayenne powder ($0.02)', '¼ tsp cayenne pepper'],
    ['2 Tbsp olive oil ($0.35)*', '2 Tbsp olive oil'],
  ];
  for (const [line, query] of cases) assert.equal(ingredientQuery(line), query, line);
});

test('a stated weight wins over cups, and extras for serving are left out', () => {
  const cases: [string, string | null][] = [
    ['2 cups (250g) all-purpose flour (spooned & leveled)', '250 g all-purpose flour'],
    ['1/2 cup (8 Tbsp; 113g) unsalted butter, softened', '113 g unsalted butter'],
    ['3/4 cup (150g) packed light or dark brown sugar', '150 g brown sugar'],
    ['1 and 1/2 cups (345g) mashed bananas (about 3–4 ripe bananas)', '345 g mashed bananas'],
    ['1/3 cup (80g) plain Greek yogurt or full-fat sour cream, at room temperature', '80 g plain Greek yogurt'],
    ['1 cup (240 ml) whole milk', '1 cup whole milk'],
    ['1 tbsp sunflower or vegetable oil plus a little extra for frying', '1 tbsp sunflower or canola oil'],
    ['lemon wedges to serve (optional)', null],
    ['caster sugar, to serve', null],
    ['14.5 oz. can diced tomatoes (with juices)', '14.5 oz canned tomatoes'],
    ['2 diced tomatoes', '2 diced tomatoes'],
  ];
  for (const [line, query] of cases) assert.equal(ingredientQuery(line), query, line);
});

test('package sizes are multiplied out and keep their unit', () => {
  const cases: [string, string][] = [
    ['4 (6 ounce) salmon fillets', '24 oz salmon fillets'],
    ['6 (4 ounce) fillets tilapia', '24 oz tilapia'],
    ['2 salmon fillets', '2 salmon fillets'],
    ['1 package (8 oz) cream cheese', '8 oz cream cheese'],
    ['2 packages (8 oz.) cream cheese', '16 oz cream cheese'],
    ['1 (2 pound) whole chicken', '2 lb whole chicken'],
    ['2 (1 lb) packages ground turkey', '2 lb ground turkey'],
    ['1 (1.5 kg) pork shoulder', '1.5 kg pork shoulder'],
    ['1 can (15 oz) black beans', '15 oz black beans'],
    ['1,5 kg potatoes', '1.5 kg potatoes'],
    ['1,250 kg flour', '1.250 kg flour'],
  ];
  for (const [line, clean] of cases) assert.equal(cleanIngredient(line), clean, line);
});

test('package sizes end up as the right weight', () => {
  const personal = buildPersonalIndex([], [], 'all', []);
  const grams = (line: string) => resolveItem(parseMeal(ingredientQuery(line)!).items[0], personal).grams;
  assert.equal(Math.round(grams('4 (6 ounce) salmon fillets')), 680);
  assert.equal(Math.round(grams('1 package (8 oz) cream cheese')), 227);
  assert.equal(Math.round(grams('1 (2 pound) whole chicken')), 907);
  const chicken = resolveItem(parseMeal(ingredientQuery('1 (2 pound) whole chicken')!).items[0], personal).food!.name;
  assert.doesNotMatch(chicken, /soup/i);
});

test('junk and hostile pages are handled quickly', () => {
  const started = Date.now();
  findRecipe(page({ ...recipe, recipeIngredient: ['()'.repeat(30000), '<'.repeat(200000), '('.repeat(30000)] }))?.ingredients.forEach(ingredientQuery);
  ingredientQuery('()'.repeat(30000) + 'x');
  findRecipe('<script type="application/ld+json">'.repeat(20000));
  findRecipe('<script '.repeat(100000));
  assert.ok(Date.now() - started < 1000, `${Date.now() - started} ms`);
});
