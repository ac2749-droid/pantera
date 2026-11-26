import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultMeal } from '../components/helpers';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { emptyNutrients, Food, MealKey, MEALS } from '../foods';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Chip, Field, PrimaryButton, Txt } from '../ui';
import { addDays, today } from '../util';

const num = (s: string) => {
  const v = parseFloat(s.replace(',', '.'));
  return v >= 0 ? v : NaN;
};

/** Log calories (and optionally macros) without picking a food: a meal out, a snack at a friend's. */
export default function QuickAdd() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const [meal, setMeal] = useState<MealKey>(nav.payload('quick')?.meal ?? defaultMeal());
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const [err, setErr] = useState('');

  const P = num(p) || 0, C = num(c) || 0, F = num(f) || 0;
  const fromMacros = Math.round(P * 4 + C * 4 + F * 9);
  const K = kcal.trim() ? num(kcal) : fromMacros;

  const save = () => {
    if (!(K > 0)) return setErr('Enter the calories, or the protein, carbs and fat.');
    const n = emptyNutrients();
    n.kcal = Math.round(K);
    n.p = P;
    n.c = C;
    n.f = F;
    const label = name.trim() || 'Quick add';
    // A one-off "food" of 1 entry; the r: id keeps it out of recents' portion lookups
    const food: Food = { id: 'r:quick', name: label, serving: 'quick add', g: 1, n, src: 'recent' };
    const date = nav.date > addDays(today(), 7) ? today() : nav.date;
    store.addEntry(date, food, 1, meal, { label: 'quick add', g: 1 });
    nav.toast(`Added ${Math.round(K).toLocaleString()} kcal to ${MEALS.find((m) => m[0] === meal)?.[1]}`);
    nav.done();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Quick add" onClose={nav.done} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Txt size={13.5} color={t.muted}>Don’t know the exact food? Log the calories you’re estimating, and the macros if you know them.</Txt>
        <Field label="Description (optional)" value={name} onChangeText={setName} placeholder="e.g. Dinner at Mom’s, birthday cake" maxLength={60} />
        <Field label="Calories (kcal)" value={kcal} onChangeText={(v) => { setKcal(v); setErr(''); }} keyboardType="decimal-pad" placeholder={fromMacros > 0 ? `${fromMacros} from macros` : 'e.g. 650'} autoFocus />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Protein (g)" value={p} onChangeText={setP} keyboardType="decimal-pad" placeholder="0" style={{ minWidth: 0 }} />
          <Field label="Carbs (g)" value={c} onChangeText={setC} keyboardType="decimal-pad" placeholder="0" style={{ minWidth: 0 }} />
          <Field label="Fat (g)" value={f} onChangeText={setF} keyboardType="decimal-pad" placeholder="0" style={{ minWidth: 0 }} />
        </View>
        {kcal.trim() && fromMacros > 0 && Math.abs(fromMacros - K) > Math.max(30, K * 0.2) ? (
          <Txt size={12.5} color={t.warn}>Heads up: those macros add up to about {fromMacros} kcal.</Txt>
        ) : null}
        <View style={{ gap: 6 }}>
          <Txt weight="bodyBold" size={12.5} color={t.muted}>Meal</Txt>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {MEALS.map(([k, l]) => (
              <Chip key={k} label={l} active={meal === k} onPress={() => setMeal(k)} />
            ))}
          </View>
        </View>
        {err ? <Txt size={14} weight="bodyBold" color={t.warn}>{err}</Txt> : null}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: kb ? kb + 12 : insets.bottom + 12, borderTopWidth: 1, borderTopColor: t.line }}>
        <PrimaryButton label={K > 0 ? `Add ${Math.round(K).toLocaleString()} kcal` : 'Add'} onPress={save} />
      </View>
    </View>
  );
}
