/**
 * Read a Nutrition Facts label from text recognized on the phone (ML Kit OCR).
 * Handles US labels ("Total Fat 8g 10%") and EU-style labels ("Energy 1046 kJ / 250 kcal"),
 * plus common OCR mistakes: "Og" for "0g", "8g" read as "89", values split from their labels.
 */
import { NutrientKey } from './foods';

export type LabelReading = {
  servingLabel?: string;
  servingG?: number;
  values: Partial<Record<NutrientKey, number>>;
  /** Fields worked out from a % Daily Value rather than read directly */
  estimated: NutrientKey[];
  found: NutrientKey[];
  per100?: boolean; // values are per 100 g (EU style) rather than per serving
};

// Current FDA Daily Values, used when a label only shows a percentage
const DV: Partial<Record<NutrientKey, number>> = { chol: 300, f: 78, sat: 20, na: 2300, c: 275, fib: 28, p: 50, k: 4700, ca: 1300, fe: 18, vc: 90 };

type Rule = { k: NutrientKey; label: RegExp; unit: 'g' | 'mg'; max: number };
// Order matters: more specific labels first
const RULES: Rule[] = [
  { k: 'sat', label: /satur[a-z]*\.?\s*fat|sat\.?\s*fat|of\s*which\s*saturates|saturates/, unit: 'g', max: 120 },
  { k: 'f', label: /total\s*fat|(?:^|\n)\s*fat(?!\s*cal)/, unit: 'g', max: 200 },
  { k: 'na', label: /sodium/, unit: 'mg', max: 20000 },
  { k: 'fib', label: /dietary\s*fib(?:er|re)|(?:^|\n)\s*fib(?:er|re)/, unit: 'g', max: 100 },
  { k: 'sug', label: /total\s*sugars?|(?:^|\n)\s*sugars?(?!\s*alc)|of\s*which\s*sugars/, unit: 'g', max: 200 },
  { k: 'c', label: /total\s*carbo?h?y?d?r?a?t?e?s?\.?|(?:^|\n)\s*carbohydrates?|total\s*carb\.?/, unit: 'g', max: 400 },
  { k: 'p', label: /protein/, unit: 'g', max: 200 },
  { k: 'k', label: /potas+ium/, unit: 'mg', max: 10000 },
  { k: 'ca', label: /calcium/, unit: 'mg', max: 5000 },
  { k: 'fe', label: /(?:^|[^a-z])iron/, unit: 'mg', max: 200 },
  { k: 'vc', label: /vitamin\s*c\b|vit\.?\s*c\b/, unit: 'mg', max: 5000 },
  { k: 'chol', label: /cholest[ae]rol/, unit: 'mg', max: 3000 },
];

const NUM = '(\\d{1,5}(?:[.,]\\d{1,2})?)';

/** Clean up OCR text so the patterns below can match. */
export function normalizeLabelText(raw: string): string {
  return (
    raw
      .replace(/\r/g, '')
      .toLowerCase()
      // letters OCR confuses with digits, only where a number is expected
      .replace(/(\s|^)[o](\s?m?g\b)/g, '$10$2') // "Og", "O mg"
      .replace(/(\d)[o](\s?m?g\b)/g, '$10$2') // "1Og"
      .replace(/(\s)[il|](\d)/g, '$11$2') // "l5g"
      .replace(/(\d),(\d{3})(?!\d)/g, '$1$2') // 1,250 mg
      .replace(/[ \t]+/g, ' ')
      .replace(/ /g, ' ')
  );
}

const toNum = (s: string) => parseFloat(s.replace(',', '.'));

/** Find "LABEL ... 12 g" within a short window after the label. */
function valueAfter(text: string, label: RegExp, unit: 'g' | 'mg', max: number): { v: number; est?: boolean } | null {
  const re = new RegExp(label.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
    // "includes 10g added sugars" is not total sugars
    if (/^\s*(?:alcohol|added)/.test(after)) continue;
    const before = text.slice(Math.max(0, m.index - 12), m.index);
    if (/(?:added|incl\.?|includes)\s*$/.test(before)) continue;
    // 1) number with the right unit
    const withUnit = new RegExp(`^[\\s:.\\-]*(?:less than\\s*|<\\s*)?${NUM}\\s?(${unit === 'mg' ? 'mg|g' : 'g|mg'})\\b`).exec(after);
    if (withUnit) {
      let v = toNum(withUnit[1]);
      if (withUnit[2] === 'mg' && unit === 'g') v = v / 1000;
      if (withUnit[2] === 'g' && unit === 'mg') v = v * 1000;
      if (v <= max) return { v };
    }
    // 2) number with no unit: "8g" read as "89" or "8 9"
    const bare = new RegExp(`^[\\s:.\\-]*${NUM}(?![\\d.,]|\\s?%)`).exec(after);
    if (bare) {
      const s = bare[1];
      let v = toNum(s);
      if (unit === 'g' && /9$/.test(s) && s.length >= 2 && v > 15) v = toNum(s.slice(0, -1));
      if (v <= max) return { v, est: true };
    }
    // 3) only a percentage: work it out from the Daily Value
    const pct = new RegExp(`^[\\s:.\\-]*(\\d{1,3})\\s?%`).exec(after);
    if (pct) return { v: -toNum(pct[1]), est: true }; // negative = percent, resolved by caller
  }
  return null;
}

export function parseLabel(raw: string): LabelReading {
  const text = normalizeLabelText(raw);
  const out: LabelReading = { values: {}, estimated: [], found: [] };

  // Serving size: "Serving size 2/3 cup (55g)", "Serving Size 1 bar (40 g)", "Portion 30 g"
  const sv = /serving\s*size\s*[:\-]?\s*([^\n(]{0,30}?)\s*\(?\s*(?:about\s*)?(\d{1,4}(?:[.,]\d)?)\s?(g|ml)\s*\)?/.exec(text) || /(?:portion|per serving)\s*[:\-]?\s*()(\d{1,4}(?:[.,]\d)?)\s?(g|ml)/.exec(text);
  if (sv) {
    const label = sv[1].replace(/[,;:]+$/, '').trim();
    out.servingG = toNum(sv[2]);
    out.servingLabel = label && !/^\d+(\.\d+)?\s?(g|ml)$/.test(label) ? label : `${out.servingG} ${sv[3]}`;
  }

  // Calories (US) or kcal (EU)
  const cal = /calories\s*(?!from)[:\-]?\s*(?:\n\s*)?(\d{1,4})\b/.exec(text) || /amount per serving[\s\S]{0,30}?calories[\s\S]{0,12}?(\d{2,4})/.exec(text);
  const kcal = /(\d{1,4}(?:[.,]\d)?)\s?kcal/.exec(text);
  if (cal && toNum(cal[1]) <= 3000) out.values.kcal = toNum(cal[1]);
  else if (kcal) out.values.kcal = toNum(kcal[1]);
  else {
    const kj = /(\d{2,4})\s?kj/.exec(text);
    if (kj) {
      out.values.kcal = Math.round(toNum(kj[1]) / 4.184);
      out.estimated.push('kcal');
    }
  }
  if (out.values.kcal !== undefined) out.found.push('kcal');

  for (const r of RULES) {
    const hit = valueAfter(text, r.label, r.unit, r.max);
    if (!hit) continue;
    let v = hit.v;
    if (v < 0) {
      const dv = DV[r.k];
      if (!dv) continue;
      v = Math.round(((-v / 100) * dv) * 10) / 10;
    }
    out.values[r.k] = v;
    out.found.push(r.k);
    if (hit.est) out.estimated.push(r.k);
  }

  // Vitamin D is printed in mcg (µg) on current US labels: "Vitamin D 2mcg 10%"
  const vd = /vitamin\s*d\s*[:\-]?\s*(\d{1,3}(?:[.,]\d)?)\s?(mcg|µg|ug)/.exec(text) || /vitamin\s*d\s*[:\-]?\s*(\d{1,3})\s?%/.exec(text);
  if (vd) {
    out.values.vd = vd[2] ? toNum(vd[1]) : Math.round((toNum(vd[1]) / 100) * 20 * 10) / 10;
    out.found.push('vd');
    if (!vd[2]) out.estimated.push('vd');
  }

  // EU labels list values per 100 g
  out.per100 = /per\s*100\s?(g|ml)|\/\s*100\s?(g|ml)/.test(text) && !/serving\s*size/.test(text);
  if (out.per100 && !out.servingG) {
    out.servingG = 100;
    out.servingLabel = '100 g';
  }

  // Sanity: calories should roughly match the macros (4/4/9). If not and the label gives macros, trust them less.
  return out;
}

/** How believable a reading is: calories vs 4·P + 4·C + 9·F, and how many fields were found. */
export function labelQuality(r: LabelReading): { score: 'good' | 'check' | 'poor'; note?: string } {
  const v = r.values;
  const core = ['kcal', 'f', 'c', 'p'].filter((k) => r.found.includes(k as NutrientKey)).length;
  if (core < 2) return { score: 'poor', note: 'Only a few numbers could be read.' };
  if (v.kcal !== undefined && v.p !== undefined && v.c !== undefined && v.f !== undefined) {
    const est = 4 * v.p + 4 * v.c + 9 * v.f;
    const diff = Math.abs(est - v.kcal);
    if (diff > Math.max(25, v.kcal * 0.2)) return { score: 'check', note: `Calories (${v.kcal}) don’t quite match the protein, carbs and fat (about ${Math.round(est)}). Check those numbers.` };
  }
  if (!r.servingG) return { score: 'check', note: 'Couldn’t read the serving weight. Enter it from the label.' };
  return { score: core === 4 ? 'good' : 'check' };
}
