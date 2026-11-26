import { labelQuality, parseLabel } from '../src/label';
let fails = 0;
const ok = (label: string, cond: boolean, extra = '') => { if (!cond) fails++; console.log(cond ? 'PASS' : 'FAIL', label, extra); };

// 1) Classic US label, clean OCR
const us = `Nutrition Facts
8 servings per container
Serving size 2/3 cup (55g)
Amount per serving
Calories 230
% Daily Value*
Total Fat 8g 10%
Saturated Fat 1g 5%
Trans Fat 0g
Cholesterol 0mg 0%
Sodium 160mg 7%
Total Carbohydrate 37g 13%
Dietary Fiber 4g 14%
Total Sugars 12g
Includes 10g Added Sugars 20%
Protein 3g
Vitamin D 2mcg 10%
Calcium 260mg 20%
Iron 8mg 45%
Potassium 240mg 6%`;
let r = parseLabel(us);
ok('serving', r.servingG === 55 && r.servingLabel === '2/3 cup', JSON.stringify([r.servingLabel, r.servingG]));
ok('calories', r.values.kcal === 230);
ok('fat/sat', r.values.f === 8 && r.values.sat === 1);
ok('sodium', r.values.na === 160);
ok('carbs/fiber', r.values.c === 37 && r.values.fib === 4);
ok('sugars not added sugars', r.values.sug === 12, String(r.values.sug));
ok('protein', r.values.p === 3);
ok('minerals', r.values.ca === 260 && r.values.fe === 8 && r.values.k === 240);
ok('quality good', labelQuality(r).score === 'good', JSON.stringify(labelQuality(r)));

// 2) Messy OCR: blocks out of order, "Og", "89" for 8g, calories number on next line, split serving
const messy = [`Nutrition Facts\nServing Size 1 bar (40 g)`, `Calories\n190`, `Total Fat 89 10%\nSaturated Fat 3.5g 18%\nTrans Fat Og`, `Sodium 1,250mg 54%`, `Total Carbohydrate 22g 8%\nDietary Fiber 3g 11%\nTotal Sugars 7g\nIncludes 6g Added Sugars 12%\nProtein 10g`].join('\n');
r = parseLabel(messy);
ok('messy serving', r.servingG === 40 && r.servingLabel === '1 bar', JSON.stringify([r.servingLabel, r.servingG]));
ok('messy calories on next line', r.values.kcal === 190, String(r.values.kcal));
ok('"89" read as 8 g', r.values.f === 8 && r.estimated.includes('f'), String(r.values.f));
ok('comma thousands', r.values.na === 1250);
ok('protein', r.values.p === 10);

// 3) Old-style label with only %DV for minerals
const old = `Serving Size 1 cup (240mL)\nCalories 120\nTotal Fat 5g\nSodium 125mg\nTotal Carbohydrate 12g\nSugars 12g\nProtein 8g\nVitamin C 4%\nCalcium 30%\nIron 0%`;
r = parseLabel(old);
ok('ml serving', r.servingG === 240 && r.servingLabel === '1 cup');
ok('calcium from %DV', r.values.ca === 390 && r.estimated.includes('ca'), String(r.values.ca));
ok('vitamin C from %DV', r.values.vc === 3.6, String(r.values.vc));

// 4) EU label per 100 g
const eu = `Nutrition information\nTypical values per 100g\nEnergy 1569 kJ / 375 kcal\nFat 9.5g\nof which saturates 1.4g\nCarbohydrate 58g\nof which sugars 18g\nFibre 7.1g\nProtein 11g\nSalt 0.6g`;
r = parseLabel(eu);
ok('EU kcal', r.values.kcal === 375, String(r.values.kcal));
ok('EU per 100 g', r.per100 === true && r.servingG === 100);
ok('EU saturates + fibre', r.values.sat === 1.4 && r.values.fib === 7.1, JSON.stringify(r.values));
ok('EU sugars', r.values.sug === 18, String(r.values.sug));

// 5) Calories mismatch flagged
r = parseLabel(`Serving size 1 cup (30g)\nCalories 900\nTotal Fat 1g\nTotal Carbohydrate 20g\nProtein 3g`);
ok('mismatch flagged', labelQuality(r).score === 'check', JSON.stringify(labelQuality(r)));
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
const r2 = parseLabel(`Serving size 1 cup (240mL)\nCalories 130\nTotal Fat 5g\nCholesterol 20mg 7%\nSodium 115mg\nTotal Carbohydrate 12g\nProtein 8g\nVitamin D 2.5mcg 15%\nCalcium 310mg 25%`);
console.log(r2.values.chol === 20 && r2.values.vd === 2.5 ? 'PASS cholesterol + vitamin D' : 'FAIL cholesterol + vitamin D ' + JSON.stringify(r2.values));
