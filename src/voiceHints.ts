/** Words the speech recognizer should expect, so food names aren't heard as something more common. */

const COMMON = [
  'pita', 'pita bread', 'whole wheat pita', 'naan', 'roti', 'tortilla', 'bagel', 'croissant', 'sourdough', 'hummus', 'labneh', 'tahini',
  'falafel', 'shawarma', 'kebab', 'gyro', 'tabbouleh', 'baba ghanoush', 'couscous', 'quinoa', 'oatmeal', 'granola', 'muesli',
  'Greek yogurt', 'cottage cheese', 'cream cheese', 'feta', 'halloumi', 'mozzarella', 'kefir', 'almond milk', 'oat milk',
  'fried eggs', 'scrambled eggs', 'boiled eggs', 'egg whites', 'omelette', 'turkey bacon', 'chicken breast', 'ground beef', 'salmon',
  'tuna', 'tofu', 'tempeh', 'lentils', 'chickpeas', 'black beans', 'edamame', 'brown rice', 'basmati rice', 'pasta', 'ramen', 'pho',
  'sushi', 'burrito', 'quesadilla', 'taco', 'empanada', 'dumplings', 'avocado toast', 'peanut butter', 'almond butter',
  'whey protein', 'protein shake', 'protein bar', 'latte', 'cappuccino', 'espresso', 'matcha', 'kombucha', 'smoothie',
];
const MOST = 100;
const MOST_WORDS = 4;

export function speechHints(yourFoods: string[]): string[] {
  // The part before the comma is what people say: "Labneh, Karoun"
  const yours = yourFoods.map((name) => name.split(/[,(]/)[0].trim()).filter((n) => n && n.split(/\s+/).length <= MOST_WORDS);
  const seen = new Map<string, string>();
  for (const word of [...yours, ...COMMON]) if (!seen.has(word.toLowerCase())) seen.set(word.toLowerCase(), word);
  return [...seen.values()].slice(0, MOST);
}
