import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { emptyNutrients, EXTRA_NK, Food, NK, NutrientKey, NUTRIENTS } from '../foods';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Field, GhostButton, PrimaryButton, Txt } from '../ui';
import { newId } from '../util';

const FIELDS: [NutrientKey, string, string][][] = [
  [['kcal', 'Calories *', 'kcal'], ['p', 'Protein', 'g']],
  [['c', 'Carbs', 'g'], ['f', 'Fat', 'g']],
  [['fib', 'Fiber', 'g'], ['sug', 'Sugars', 'g']],
  [['sat', 'Saturated fat', 'g'], ['na', 'Sodium', 'mg']],
  [['k', 'Potassium', 'mg'], ['ca', 'Calcium', 'mg']],
  [['fe', 'Iron', 'mg'], ['vc', 'Vitamin C', 'mg']],
];

// Extra nutrients in pairs, in the order they appear under "Nutrients"
const EXTRA_INFO = NUTRIENTS.filter((x) => (EXTRA_NK as readonly string[]).includes(x.k));
const EXTRA_ROWS = EXTRA_INFO.reduce<(typeof EXTRA_INFO)[]>((rows, x, i) => (i % 2 ? rows[rows.length - 1].push(x) : rows.push([x]), rows), []);

export default function FoodForm() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const p = nav.payload('form');
  const existing = p?.food;
  const pre = p?.prefill ?? {};
  const label = p?.fromLabel;
  // Values from a scanned label (or typed before scanning) win over the saved food's
  const [name, setName] = useState(pre.name || existing?.name || '');
  const [brand, setBrand] = useState(pre.brand ?? existing?.brand ?? '');
  const [serving, setServing] = useState(pre.serving ?? existing?.serving ?? '1 serving');
  const [g, setG] = useState(pre.g ? String(pre.g) : existing ? String(existing.g) : '');
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    const from = pre.n ?? existing?.n;
    NK.forEach((k) => (o[k] = from ? (label && !label.found.includes(k) && !from[k] ? '' : String(Math.round((from[k] ?? 0) * 100) / 100)) : ''));
    return o;
  });
  const scanLabel = () =>
    nav.go(
      { type: 'label', food: existing, prefill: { ...pre, name: name.trim() || undefined, brand: brand.trim() || undefined, serving: serving.trim() || undefined, g: parseFloat(g) || undefined, barcode: pre.barcode ?? existing?.barcode }, returnMeal: p?.returnMeal, pick: p?.pick },
      { replace: true },
    );
  const mark = (k: NutrientKey) => (!label ? '' : label.estimated.includes(k) ? ' · check' : label.found.includes(k) ? '' : ' · not found');
  const [err, setErr] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [more, setMore] = useState(() => EXTRA_NK.some((k) => !!(pre.n?.[k] || existing?.n?.[k])));
  const barcode = existing?.barcode ?? pre.barcode;

  const save = () => {
    const grams = parseFloat(g.replace(',', '.'));
    const kcal = parseFloat((vals.kcal || '').replace(',', '.'));
    if (!name.trim()) return setErr('Give the food a name.');
    if (!(grams > 0)) return setErr('Enter the serving weight in grams. It is on the label next to the serving size.');
    if (!(kcal >= 0)) return setErr('Enter the calories per serving.');
    const n = emptyNutrients();
    NK.forEach((k) => {
      const v = parseFloat((vals[k] || '').replace(',', '.'));
      n[k] = v >= 0 ? v : 0;
    });
    const label = serving.trim() || '1 serving';
    // Keep any extra portions a scanned or online food came with
    const portions = existing?.portions?.length ? [{ label, g: grams }, ...existing.portions.filter((x) => x.label !== label && x.label !== existing.serving)] : undefined;
    // Vitamins and minerals count as known if this food came with them or most were entered
    const entered = EXTRA_NK.filter((k) => (vals[k] || '').trim() !== '').length;
    const micros = entered >= 12 || (!!existing?.micros && entered > 0) || (!!pre.micros && entered > 0);
    const food: Food = { id: existing?.id ?? 'c' + newId(), name: name.trim(), brand: brand.trim() || undefined, serving: label, g: grams, n, src: 'custom', barcode, source: pre.source ?? existing?.source, portions, micros };
    store.saveFood(food);
    nav.toast(existing ? 'Food updated' : 'Food saved');
    if (p?.returnMeal) nav.go({ type: 'detail', food, mode: p.pick ? 'pick' : 'add', meal: p.returnMeal }, { replace: true });
    else nav.done();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title={existing ? 'Edit food' : 'New food'} onClose={nav.done} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        {label ? (
          <View style={{ backgroundColor: t.accentSoft, borderColor: t.accent, borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="scan" size={18} color={t.accent} />
              <Txt weight="bodyBold" size={14.5} style={{ flex: 1 }}>Filled from your label photo</Txt>
              <Txt size={13} weight="bodyBold" color={t.accent} onPress={scanLabel} suppressHighlighting>Retake</Txt>
            </View>
            <Txt size={13} color={t.muted}>
              {label.source === 'ai' ? 'Read with your AI key.' : 'Read on your phone.'} Check every number against the label before saving. Fields marked “check” were guessed from blurry text or a % Daily Value.
            </Txt>
            {label.note ? <Txt size={13} weight="bodyBold" color={t.warn}>{label.note}</Txt> : null}
            {!label.servingFound ? <Txt size={13} weight="bodyBold" color={t.warn}>Enter the serving size and its weight in grams from the label.</Txt> : null}
          </View>
        ) : (
          <Pressable onPress={scanLabel} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: t.accent, borderRadius: 14, padding: 14, backgroundColor: pressed ? t.surface2 : t.surface })}>
            <Ionicons name="scan" size={24} color={t.accent} />
            <View style={{ flex: 1 }}>
              <Txt weight="bodyBold" size={15} color={t.accent}>Scan the nutrition label</Txt>
              <Txt size={12.5} color={t.muted}>Take one photo and Pantera fills in the numbers for you.</Txt>
            </View>
            <Ionicons name="camera-outline" size={20} color={t.accent} />
          </Pressable>
        )}
        <Txt size={13.5} color={t.muted}>
          Enter the values for one serving, straight from the nutrition label.{barcode ? ` This food will be saved with barcode ${barcode}, so the next scan finds it instantly.` : ''}
        </Txt>
        <Field label="Name *" value={name} onChangeText={setName} placeholder="e.g. Vanilla protein yogurt" autoFocus={!existing && !pre.name} maxLength={80} />
        <Field label="Brand" value={brand} onChangeText={setBrand} placeholder="Optional" maxLength={60} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Serving size" value={serving} onChangeText={setServing} placeholder="e.g. 1 cup" maxLength={40} />
          <Field label="Serving weight (g) *" value={g} onChangeText={setG} keyboardType="decimal-pad" placeholder="e.g. 150" />
        </View>
        {FIELDS.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
            {row.map(([k, lbl, unit]) => (
              <Field key={k} label={`${lbl} (${unit})${mark(k)}`} value={vals[k]} onChangeText={(v) => setVals((o) => ({ ...o, [k]: v }))} keyboardType="decimal-pad" placeholder="0" />
            ))}
          </View>
        ))}
        <Pressable onPress={() => setMore(!more)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }} accessibilityRole="button">
          <Ionicons name={more ? 'chevron-up' : 'chevron-down'} size={18} color={t.accent} />
          <Txt weight="bodyBold" size={14.5} color={t.accent}>More nutrients (optional)</Txt>
          <Txt size={12.5} color={t.faint}>vitamins, minerals, fats</Txt>
        </Pressable>
        {more
          ? EXTRA_ROWS.map((row, i) => (
              <View key={'x' + i} style={{ flexDirection: 'row', gap: 10 }}>
                {row.map((x) => (
                  <Field key={x.k} label={`${x.label} (${x.unit})${mark(x.k)}`} value={vals[x.k]} onChangeText={(v) => setVals((o) => ({ ...o, [x.k]: v }))} keyboardType="decimal-pad" placeholder="—" />
                ))}
              </View>
            ))
          : null}
        {err ? <Txt color={t.warn} weight="bodyBold" size={14}>{err}</Txt> : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: kb ? kb + 12 : insets.bottom + 12, borderTopWidth: 1, borderTopColor: t.line }}>
        {existing ? (
          <GhostButton
            label={confirmDelete ? 'Tap to confirm' : 'Delete'}
            color={t.warn}
            onPress={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              store.deleteFood(existing.id);
              nav.toast('Food deleted');
              nav.done();
            }}
          />
        ) : null}
        <PrimaryButton label={existing ? 'Save changes' : 'Save food'} onPress={save} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
