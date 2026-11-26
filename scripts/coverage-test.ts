import { buildPersonalIndex, searchFoods, toFood } from '../src/foodSearch';
const personal = buildPersonalIndex([], [], 'all');
const foods = 'guacamole,salsa,hummus,sushi,tofu,quinoa,kale,ramen,pho,chicken nuggets,fried chicken,gatorade,energy drink,red bull,granola,trail mix,cream cheese,croissant,muffin,donut,pancakes,waffles,maple syrup,sour cream,ketchup,mustard,bbq sauce,soy sauce,hot sauce,ranch,caesar salad,coleslaw,mashed potatoes,sweet potato fries,onion rings,nachos,quesadilla,taco,enchilada,lasagna,meatloaf,chili,pad thai,fried rice,dumplings,egg roll,curry,naan,plantains,empanada,falafel,gyro,shawarma,poke,acai,smoothie,iced coffee,latte,cappuccino,tea,lemonade,beer,wine,vodka,whiskey,kombucha,oat milk,protein powder,beef jerky,string cheese,rice cake,popcorn,pretzels,chocolate chip cookie,brownie,cheesecake,ice cream,frozen yogurt,apple pie,cereal,bagel,english muffin,grits,biscuit,hash browns,sausage,ham,salami,pepperoni,meatballs,burrito,cheeseburger,chicken sandwich,fish tacos,shrimp,lobster,crab,tilapia,cod,sardines'.split(',');
const miss: string[] = [];
for (const f of foods) {
  const h = searchFoods(f, personal, 'all', 1)[0];
  if (!h) miss.push(f);
  else console.log(f.padEnd(24), '→', toFood(h.doc.item).name.slice(0, 70));
}
console.log('\nMISSING:', miss.join(', ') || 'none');
