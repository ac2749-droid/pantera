import { encodeMeal, decodeMeal, shareMessage } from '../src/share';
import { create } from 'qrcode/lib/core/qrcode';
import { emptyNutrients } from '../src/foods';
const mk = (name: string, serving: string, g: number, kcal: number) => ({ name, serving, sg: g, grams: g, n: { ...emptyNutrients(), kcal, p: 10.123, c: 20, f: 5 } });
const meal = { name: 'Bacon & egg sandwich — Tío’s 🍳', items: [mk('Bacon, cooked', '1 slice', 16, 86), mk('Egg, large', '1 egg', 100, 143), mk('White bread', '1 slice', 50, 134), mk('Crème fraîche', '1 tbsp', 15, 50)] };
const msg = shareMessage(meal, 413);
console.log(msg);
const back = decodeMeal('Hey look\n' + msg + '\nthanks');
console.log(JSON.stringify(back).slice(0, 200));
console.log('equal names', back?.name === meal.name, back?.items[3].name, back?.items[1].n.p);
// WhatsApp may wrap/insert spaces
console.log('wrapped ok', !!decodeMeal(msg.replace(/(.{40})/g, '$1\n')));
console.log('garbage', decodeMeal('PANTERA1:abc'), decodeMeal('hello'));
const code = encodeMeal(meal);
console.log('code length', code.length, 'qr size', create(code, { errorCorrectionLevel: 'M' }).modules.size);
const big = { name: 'Big', items: Array.from({ length: 15 }, (_, i) => mk('Chicken breast, cooked, roasted item ' + i, '1 cup, chopped or diced', 140, 231)) };
const bc = encodeMeal(big); console.log('15 items', bc.length, create(bc, { errorCorrectionLevel: bc.length > 900 ? 'L' : 'M' }).modules.size);
