// Curated common foods (shown first in search). Values are per serving: USDA-based where the USDA has the food,
// otherwise typical restaurant/recipe values.
// [name, serving label, grams, kcal, protein, carbs, fat, fiber, sugar, satFat, sodium mg, potassium mg, calcium mg, iron mg, vitC mg]
const RAW: [string, string, ...number[]][] = [
["Egg, large","1 egg",50,72,6.3,0.4,4.8,0,0.2,1.6,71,69,28,0.9,0],
["Egg white, large","1 white",33,17,3.6,0.2,0.1,0,0.2,0,55,54,2,0,0],
["Chicken breast, cooked","100 g",100,165,31,0,3.6,0,0,1,74,256,15,1,0],
["Chicken thigh, skinless, cooked","100 g",100,179,24.8,0,8.2,0,0,2.3,95,269,12,1.1,0],
["Ground beef 85% lean, cooked","100 g",100,250,26,0,15,0,0,5.9,72,318,18,2.6,0],
["Sirloin steak, cooked","100 g",100,219,29,0,11,0,0,4.3,56,355,20,1.8,0],
["Pork loin, cooked","100 g",100,206,27.3,0,10,0,0,3.6,62,423,20,0.9,0.6],
["Salmon, cooked","100 g",100,206,22,0,12,0,0,2.5,61,384,15,0.3,3.7],
["Tuna, canned in water","100 g",100,116,26,0,0.8,0,0,0.2,247,237,11,1.5,0],
["Shrimp, cooked","100 g",100,99,24,0.2,0.3,0,0,0.1,111,259,70,0.5,0],
["Turkey breast, deli sliced","2 oz",56,60,10,2,1,0,1,0.3,500,200,5,0.4,0],
["Bacon, cooked","1 slice",8,43,3,0.1,3.3,0,0,1.1,137,45,1,0.1,0],
["Tofu, firm","100 g",100,144,17,3,9,2.3,0.6,1.3,14,237,683,2.7,0.2],
["Greek yogurt, plain nonfat","1 container",170,100,17,6,0.7,0,5.5,0.2,61,240,187,0.1,0],
["Milk, 2%","1 cup",244,122,8.1,11.7,4.8,0,12.3,3.1,115,342,293,0,0],
["Milk, whole","1 cup",244,149,7.7,11.7,7.9,0,12.3,4.6,105,322,276,0,0],
["Almond milk, unsweetened","1 cup",240,30,1,1,2.5,0.5,0,0,170,160,450,0.3,0],
["Cheddar cheese","1 oz",28,115,6.5,0.4,9.5,0,0.1,5.3,180,21,200,0.2,0],
["Mozzarella, part-skim","1 oz",28,72,6.9,0.8,4.5,0,0.3,2.9,175,27,222,0.1,0],
["Cottage cheese, 2%","½ cup",113,92,12,5,2.5,0,4.5,1.5,348,141,125,0.2,0],
["Half-and-half","2 tbsp",30,39,0.9,1.3,3.5,0,1.2,2.2,12,39,32,0,0],
["Butter, salted","1 tbsp",14,102,0.1,0,11.5,0,0,7.3,91,3,3,0,0],
["Olive oil","1 tbsp",13.5,119,0,0,13.5,0,0,1.9,0,0,0,0.1,0],
["Peanut butter","2 tbsp",32,190,7,8,16,2,3,3.3,140,180,15,0.6,0],
["Almonds","1 oz",28,164,6,6.1,14.2,3.5,1.2,1.1,0,208,76,1,0],
["Walnuts","1 oz",28,185,4.3,3.9,18.5,1.9,0.7,1.7,1,125,28,0.8,0.4],
["Avocado","½ avocado",100,160,2,8.5,14.7,6.7,0.7,2.1,7,485,12,0.6,10],
["Banana, medium","1 banana",118,105,1.3,27,0.4,3.1,14.4,0.1,1,422,6,0.3,10.3],
["Apple, medium","1 apple",182,95,0.5,25,0.3,4.4,18.9,0.1,2,195,11,0.2,8.4],
["Orange, medium","1 orange",131,62,1.2,15.4,0.2,3.1,12.2,0,0,237,52,0.1,69.7],
["Pear, medium","1 pear",178,101,0.6,27,0.3,5.5,17,0,2,206,16,0.3,7.6],
["Strawberries","1 cup",152,49,1,11.7,0.5,3,7.4,0,2,233,24,0.6,89.4],
["Blueberries","1 cup",148,84,1.1,21.4,0.5,3.6,14.7,0,1,114,9,0.4,14.4],
["Grapes","1 cup",151,104,1.1,27.3,0.2,1.4,23.4,0.1,3,288,15,0.5,4.8],
["Mango","1 cup",165,99,1.4,24.7,0.6,2.6,22.5,0.1,2,277,18,0.3,60.1],
["Watermelon","1 cup",152,46,0.9,11.5,0.2,0.6,9.4,0,2,170,11,0.4,12.3],
["Broccoli, raw","1 cup",91,31,2.6,6,0.3,2.4,1.5,0,30,288,43,0.7,81.2],
["Spinach, raw","1 cup",30,7,0.9,1.1,0.1,0.7,0.1,0,24,167,30,0.8,8.4],
["Kale, raw","1 cup",21,7,0.6,0.9,0.3,0.9,0.2,0,11,73,53,0.3,19.6],
["Mixed salad greens","2 cups",85,15,1.2,2.9,0.2,1.8,0.5,0,25,280,40,1,12],
["Carrot, medium","1 carrot",61,25,0.6,5.8,0.1,1.7,2.9,0,42,195,20,0.2,3.6],
["Red bell pepper","1 pepper",119,37,1.2,7.2,0.4,2.5,5,0,5,251,8,0.5,152],
["Tomato, medium","1 tomato",123,22,1.1,4.8,0.2,1.5,3.2,0,6,292,12,0.3,16.9],
["Cucumber, sliced","½ cup",52,8,0.3,1.9,0.1,0.3,0.9,0,1,76,8,0.1,1.5],
["Onion, chopped","½ cup",80,32,0.9,7.5,0.1,1.4,3.4,0,3,117,18,0.2,5.9],
["Mushrooms, raw","1 cup",70,15,2.2,2.3,0.2,0.7,1.4,0,4,223,2,0.4,1.5],
["Green beans, cooked","1 cup",125,44,2.4,9.9,0.4,4,2,0.1,1,182,55,0.8,12.1],
["Sweet corn","1 ear",90,88,3.3,19,1.4,2,6.4,0.2,14,243,3,0.5,6.1],
["Sweet potato, baked","1 medium",114,103,2.3,23.6,0.2,3.8,7.4,0,41,542,43,0.8,22.3],
["Potato, baked","1 medium",173,161,4.3,36.6,0.2,3.8,2,0.1,17,926,26,1.9,16.6],
["White rice, cooked","1 cup",158,205,4.3,44.5,0.4,0.6,0.1,0.1,2,55,16,1.9,0],
["Brown rice, cooked","1 cup",195,218,4.5,45.8,1.6,3.5,0.7,0.3,10,84,20,0.8,0],
["Quinoa, cooked","1 cup",185,222,8.1,39.4,3.6,5.2,1.6,0.4,13,318,31,2.8,0],
["Pasta, cooked","1 cup",140,221,8.1,43.2,1.3,2.5,0.8,0.2,1,63,10,1.8,0],
["Rolled oats, dry","½ cup",40,150,5,27,2.5,4,1,0.5,0,150,20,1.7,0],
["Corn flakes cereal","1 cup",28,100,2,24,0,1,3,0,200,30,0,8.1,6],
["Whole wheat bread","1 slice",32,81,4,13.8,1.1,1.9,1.4,0.2,146,81,52,0.8,0],
["White bread","1 slice",25,67,2.3,12.7,0.8,0.6,1.4,0.2,127,30,38,0.9,0],
["Bagel, plain","1 bagel",105,277,11,55,1.4,2.4,5.5,0.3,443,105,90,3.6,0],
["Flour tortilla, 8 inch","1 tortilla",49,146,3.8,24.6,3.6,1.7,1,0.9,330,69,50,1.6,0],
["Corn tortilla, 6 inch","1 tortilla",26,57,1.5,11.7,0.7,1.6,0.2,0.1,12,48,21,0.3,0],
["Black beans, cooked","½ cup",86,114,7.6,20.4,0.5,7.5,0.3,0.1,1,305,23,1.8,0],
["Chickpeas, cooked","½ cup",82,134,7.3,22.5,2.1,6.2,3.9,0.2,6,239,40,2.4,1.1],
["Lentils, cooked","½ cup",99,115,8.9,19.9,0.4,7.8,1.8,0.1,2,365,19,3.3,1.5],
["Hummus","2 tbsp",30,50,2.4,4.3,2.9,1.8,0.1,0.4,115,68,12,0.7,0],
["Whey protein powder","1 scoop",31,120,24,3,1.5,0,1,0.5,130,150,130,0.5,0],
["Protein bar (typical)","1 bar",60,200,20,22,7,5,4,3,200,150,150,2,0],
["Dark chocolate, 70–85%","1 oz",28,170,2.2,13,12,3.1,6.8,7,6,203,20,3.4,0],
["Potato chips","1 oz",28,152,2,15,9.8,1.3,0.1,1.1,147,350,7,0.5,5.3],
["Popcorn, air-popped","3 cups",24,93,3,18.6,1.1,3.5,0.2,0.2,2,79,2,0.8,0],
["Pizza, cheese","1 slice (14 in)",107,285,12.2,35.7,10.4,2.5,3.8,4.8,640,184,201,2.6,1.3],
["Cheeseburger, fast food","1 burger",119,303,15,33,12,1.3,6.7,5.5,730,225,160,2.7,0.6],
["French fries","1 medium",117,365,4,48,17,4.4,0.3,2.3,246,677,20,0.9,5],
["Mayonnaise","1 tbsp",14,94,0.1,0.1,10.3,0,0.1,1.6,88,3,1,0,0],
["Ketchup","1 tbsp",17,17,0.2,4.7,0,0.1,3.7,0,154,48,3,0.1,0.7],
["Honey","1 tbsp",21,64,0.1,17.3,0,0,17.2,0,1,11,1,0.1,0.1],
["Sugar","1 tsp",4,16,0,4.2,0,0,4.2,0,0,0,0,0,0],
["Coffee, black","1 cup",237,2,0.3,0,0,0,0,0,5,116,5,0,0],
["Orange juice","1 cup",248,112,1.7,25.8,0.5,0.5,20.8,0.1,2,496,27,0.5,124],
["Cola","12 fl oz can",368,140,0,39,0,0,39,0,45,4,7,0.1,0],
["Beer, regular","12 fl oz",356,153,1.6,12.6,0,0,0,0,14,96,14,0.1,0],
["Red wine","5 fl oz",147,125,0.1,3.8,0,0,0.9,0,6,187,12,0.7,0],
// Added later: keep new foods at the end so existing ids (b0, b1, …) never shift
["Water","1 cup",237,0,0,0,0,0,0,0,7,0,7,0,0],
["Sparkling water","12 fl oz can",355,0,0,0,0,0,0,0,7,0,11,0,0],
["Guacamole","2 tbsp",30,47,0.6,2.6,4.3,1.8,0.3,0.6,110,140,5,0.2,2.4],
["Salsa, tomato","2 tbsp",32,10,0.5,2.1,0.1,0.6,1.3,0,230,90,10,0.2,1.2],
["Sushi, California roll","1 piece",30,39,1.1,6.2,1.1,0.4,1.1,0.2,100,30,3,0.1,0.8],
["Pho, beef noodle soup","1 bowl",700,420,30,55,8,2,4,2.5,1800,700,70,4,5],
["Fried chicken, breast with skin","1 piece",140,364,35,13,19,0.4,0,5.2,700,320,25,1.3,0],
["Red Bull energy drink","8.4 fl oz can",250,110,0,28,0,0,27,0,105,0,0,0,0],
["Granola","½ cup",61,290,8,32,15,5,12,2.5,15,330,45,2.3,0.7],
["Croissant, butter","1 medium",57,231,4.7,26,12,1.5,6.4,6.6,420,67,21,1.2,0.1],
["Blueberry muffin","1 medium",113,426,6,62,17,1.6,34,3,380,150,60,1.6,1],
["BBQ sauce","2 tbsp",36,62,0.3,15,0.2,0.3,12,0,300,85,5,0.2,0.3],
["Quesadilla, cheese","1 quesadilla",150,470,20,38,26,2,2,13,900,150,450,2.5,0],
["Taco, beef","1 taco",100,220,10,15,13,2,1,5,370,200,90,1.3,1],
["Enchilada, chicken","1 enchilada",160,280,15,24,14,3,3,6,650,280,180,1.5,2],
["Lasagna with meat","1 piece",250,400,25,35,18,3,6,9,850,500,280,2.5,6],
["Meatloaf","1 slice",115,230,17,9,14,0.5,3,5,480,330,40,2,0.5],
["Pad thai with chicken","1 cup",200,375,17,45,15,2.5,11,2.5,900,250,50,2,3],
["Egg roll","1 roll",85,190,6,19,10,1.5,2,2,420,160,25,1.2,3],
["Chicken curry","1 cup",240,340,26,12,21,3,4,6,800,560,50,2.4,6],
["Naan","1 piece",90,262,8.7,45,5.1,2,3,1.3,418,112,76,2.9,0.1],
["Gyro, lamb and beef","1 gyro",250,590,25,50,32,3,4,11,1100,400,120,3.5,6],
["Chicken shawarma wrap","1 wrap",300,600,40,55,24,4,4,6,1300,550,120,4,8],
["Poke bowl, tuna","1 bowl",400,560,32,70,16,5,8,2.5,1300,600,60,3,8],
["Acai bowl","1 bowl",340,450,6,80,14,11,50,3,40,700,90,2,30],
["Fruit smoothie","16 fl oz",480,280,4,66,1,5,54,0.3,40,700,120,1,60],
["Latte, 2% milk","16 fl oz",480,190,13,18,7,0,17,4.5,170,570,450,0.2,0],
["Cappuccino, 2% milk","12 fl oz",360,120,8,12,4.5,0,11,2.8,110,360,280,0.1,0],
["Iced coffee with milk","16 fl oz",480,60,3,5,3,0,5,1.8,50,300,100,0,0],
["Whiskey","1.5 fl oz shot",42,97,0,0,0,0,0,0,0,1,0,0,0],
["Kombucha","16 fl oz",480,60,0,14,0,0,10,0,20,0,0,0,0],
["Oat milk","1 cup",240,120,3,16,5,2,7,0.5,100,390,350,0.3,0],
["String cheese","1 stick",28,80,7,1,6,0,0,3.5,200,25,200,0,0],
["Brownie","1 piece",56,227,2.7,36,9,1.2,20,2.4,175,80,16,1.3,0],
["Pork sausage link, cooked","1 link",25,81,4.6,0.4,6.8,0,0.2,2.3,190,70,4,0.3,0],
["Beef meatballs","3 meatballs",90,250,17,8,17,0.5,1.5,6.5,450,280,50,2,0.5],
["Fish taco","1 taco",130,260,13,22,13,2.5,2,2.5,440,260,80,1.3,5],
["Cod, cooked","100 g",100,105,23,0,0.9,0,0,0.2,78,244,14,0.5,1],
["Nachos with cheese","1 plate",200,610,15,60,34,5,4,13,1100,280,350,2.5,1],
["Caesar salad","1 bowl",200,360,8,15,30,3,3,6,700,350,180,1.5,20],
["Pancakes","2 medium",150,350,9,52,11,1.5,10,2.5,720,190,300,2.8,0.3],
["Chicken nuggets","6 pieces",96,280,15,17,17,1,0,3,540,260,15,0.8,0.5],
["Burrito bowl, chicken","1 bowl",500,660,45,75,20,14,5,6,1600,1000,200,5,20],
// Added later: keep appending at the end so existing ids stay stable
["Oatmeal, cooked","1 cup",234,166,5.9,28,3.6,4,0.6,0.7,9,164,21,2.1,0]
];

// The original 12 nutrients (kept first and in this order: share codes and data rows depend on it)
export const CORE_NK = ['kcal', 'p', 'c', 'f', 'fib', 'sug', 'sat', 'na', 'k', 'ca', 'fe', 'vc'] as const;
// Vitamins, minerals and fat breakdown added in 2.0 (same order as scripts/build-usda.py)
export const EXTRA_NK = ['chol', 'mono', 'poly', 'va', 'vd', 've', 'vk', 'b1', 'b2', 'b3', 'b6', 'fol', 'b12', 'cho', 'mag', 'ph', 'zn', 'cu', 'mn', 'se'] as const;
export const NK = [...CORE_NK, ...EXTRA_NK] as const;
export type NutrientKey = (typeof NK)[number];
export type ExtraKey = (typeof EXTRA_NK)[number];
export type Nutrients = Record<NutrientKey, number>;

export type Food = {
  id: string;
  name: string;
  brand?: string;
  serving: string; // label, e.g. "1 cup"
  g: number; // grams in one serving
  n: Nutrients; // nutrients for one serving
  src: 'builtin' | 'custom' | 'recent' | 'scan' | 'usda' | 'online';
  barcode?: string;
  source?: string; // where the data came from
  portions?: Portion[]; // extra household measures (first is the default serving)
  fid?: string; // original food id, when this copy came from somewhere else (recents, favorites)
  recipe?: Recipe; // set when this food is a recipe made from other foods
  micros?: boolean; // true when the vitamins and minerals are known (USDA data, or entered)
  unknown?: NutrientKey[]; // main nutrients the source doesn't list (stored as 0 in n)
  flagged?: boolean; // the source's numbers don't add up
};

export type Portion = { label: string; g: number };

/** All selectable portions for a food: its own list, or its single serving. */
export function portionsOf(food: Food): Portion[] {
  const list = food.portions && food.portions.length ? food.portions : [{ label: food.serving, g: food.g }];
  return list.filter((p) => p.g > 0);
}

/** One ingredient of a recipe: a food and how much of it (nutrients are for that amount). */
export type RecipeItem = { name: string; serving: string; sg: number; grams: number; n: Nutrients; fid?: string; mx?: boolean };
/** A recipe: ingredients, how many servings it makes, and optionally the weight of the finished dish. */
export type Recipe = { items: RecipeItem[]; servings: number; cookedG?: number };

export type Entry = {
  id: string;
  name: string;
  serving: string;
  sg: number; // serving grams
  grams: number; // amount eaten
  meal: MealKey;
  n: Nutrients; // nutrients for the amount eaten
  t: number;
  sample?: boolean;
  fid?: string; // id of the food it came from (for portion choices later)
  mx?: boolean; // vitamins and minerals known for this entry
  at?: number; // time eaten, minutes after midnight, when you set it
};

export type MealKey = 'breakfast' | 'lunch' | 'dinner' | 'snacks';
export const MEALS: [MealKey, string][] = [
  ['breakfast', 'Breakfast'],
  ['lunch', 'Lunch'],
  ['dinner', 'Dinner'],
  ['snacks', 'Snacks'],
];

export type NutrientInfo = { k: NutrientKey; label: string; unit: 'g' | 'mg' | 'µg'; dv: number; kind: 'goal' | 'limit' | 'info'; group: 'general' | 'vitamins' | 'minerals'; key?: boolean };
/** Everything shown under "Nutrients". Daily Values are the FDA's for adults (2,000 kcal label basis). */
export const NUTRIENTS: NutrientInfo[] = [
  { k: 'fib', label: 'Fiber', unit: 'g', dv: 28, kind: 'goal', group: 'general', key: true },
  { k: 'sug', label: 'Sugars', unit: 'g', dv: 50, kind: 'limit', group: 'general', key: true },
  { k: 'sat', label: 'Saturated fat', unit: 'g', dv: 20, kind: 'limit', group: 'general', key: true },
  { k: 'mono', label: 'Monounsaturated fat', unit: 'g', dv: 0, kind: 'info', group: 'general' },
  { k: 'poly', label: 'Polyunsaturated fat', unit: 'g', dv: 0, kind: 'info', group: 'general' },
  { k: 'chol', label: 'Cholesterol', unit: 'mg', dv: 300, kind: 'limit', group: 'general' },
  { k: 'na', label: 'Sodium', unit: 'mg', dv: 2300, kind: 'limit', group: 'general', key: true },
  { k: 'va', label: 'Vitamin A', unit: 'µg', dv: 900, kind: 'goal', group: 'vitamins' },
  { k: 'vc', label: 'Vitamin C', unit: 'mg', dv: 90, kind: 'goal', group: 'vitamins', key: true },
  { k: 'vd', label: 'Vitamin D', unit: 'µg', dv: 20, kind: 'goal', group: 'vitamins', key: true },
  { k: 've', label: 'Vitamin E', unit: 'mg', dv: 15, kind: 'goal', group: 'vitamins' },
  { k: 'vk', label: 'Vitamin K', unit: 'µg', dv: 120, kind: 'goal', group: 'vitamins' },
  { k: 'b1', label: 'Thiamin (B1)', unit: 'mg', dv: 1.2, kind: 'goal', group: 'vitamins' },
  { k: 'b2', label: 'Riboflavin (B2)', unit: 'mg', dv: 1.3, kind: 'goal', group: 'vitamins' },
  { k: 'b3', label: 'Niacin (B3)', unit: 'mg', dv: 16, kind: 'goal', group: 'vitamins' },
  { k: 'b6', label: 'Vitamin B6', unit: 'mg', dv: 1.7, kind: 'goal', group: 'vitamins' },
  { k: 'fol', label: 'Folate', unit: 'µg', dv: 400, kind: 'goal', group: 'vitamins' },
  { k: 'b12', label: 'Vitamin B12', unit: 'µg', dv: 2.4, kind: 'goal', group: 'vitamins' },
  { k: 'cho', label: 'Choline', unit: 'mg', dv: 550, kind: 'goal', group: 'vitamins' },
  { k: 'ca', label: 'Calcium', unit: 'mg', dv: 1300, kind: 'goal', group: 'minerals', key: true },
  { k: 'fe', label: 'Iron', unit: 'mg', dv: 18, kind: 'goal', group: 'minerals', key: true },
  { k: 'k', label: 'Potassium', unit: 'mg', dv: 4700, kind: 'goal', group: 'minerals', key: true },
  { k: 'mag', label: 'Magnesium', unit: 'mg', dv: 420, kind: 'goal', group: 'minerals' },
  { k: 'ph', label: 'Phosphorus', unit: 'mg', dv: 1250, kind: 'goal', group: 'minerals' },
  { k: 'zn', label: 'Zinc', unit: 'mg', dv: 11, kind: 'goal', group: 'minerals' },
  { k: 'cu', label: 'Copper', unit: 'mg', dv: 0.9, kind: 'goal', group: 'minerals' },
  { k: 'mn', label: 'Manganese', unit: 'mg', dv: 2.3, kind: 'goal', group: 'minerals' },
  { k: 'se', label: 'Selenium', unit: 'µg', dv: 55, kind: 'goal', group: 'minerals' },
];
/** The key nutrients shown before "Show all" (the original list plus vitamin D). */
export const MICROS = NUTRIENTS.filter((x) => x.key) as (NutrientInfo & { kind: 'goal' | 'limit' })[];
export const nutrientInfo = (k: NutrientKey) => NUTRIENTS.find((x) => x.k === k);

/** Share of calories whose vitamins and minerals are known (entries from USDA or curated foods, or entered). */
export function microCoverage(list: { n: Nutrients; mx?: boolean }[]): number {
  const total = list.reduce((a, e) => a + (e.n.kcal || 0), 0);
  if (total <= 0) return list.length && list.every((e) => e.mx) ? 1 : 0;
  return list.reduce((a, e) => a + (e.mx ? e.n.kcal || 0 : 0), 0) / total;
}

export const emptyNutrients = (): Nutrients =>
  NK.reduce((o, k) => ((o[k] = 0), o), {} as Nutrients);

/** Index where prepared dishes start in the curated list; plain staples rank above them in search. */
export const DISH_START = RAW.findIndex((r) => r[0] === 'Guacamole');

// Vitamins and minerals for the curated foods, taken from their closest USDA match (scripts/builtin-micros.ts)
const BUILTIN_MICROS = require('./data/builtin-micros.json') as Record<string, number[]>;

export const BUILTIN: Food[] = RAW.map((r, i) => {
  const n = emptyNutrients();
  CORE_NK.forEach((k, j) => (n[k] = r[2 + 1 + j] as number));
  const x = BUILTIN_MICROS[r[0] as string];
  if (x) EXTRA_NK.forEach((k, j) => (n[k] = x[j] ?? 0));
  return { id: 'b' + i, name: r[0], serving: r[1], g: r[2] as number, n, src: 'builtin', micros: !!x };
});

export function scale(food: { g: number; n: Nutrients }, grams: number): Nutrients {
  const f = grams / (food.g || 1);
  const o = emptyNutrients();
  NK.forEach((k) => (o[k] = Math.round((food.n[k] || 0) * f * 100) / 100));
  return o;
}

export function sum(list: { n: Nutrients }[]): Nutrients {
  const o = emptyNutrients();
  list.forEach((e) => NK.forEach((k) => (o[k] += e.n[k] || 0)));
  return o;
}
