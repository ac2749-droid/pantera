import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { NutrientPanel } from '../components/NutrientPanel';
import { MealTime } from '../components/MealTime';
import { RepeatDays } from '../components/RepeatDays';
import { MealKey, MEALS, Portion, portionsOf, scale } from '../foods';
import { useNav } from '../nav';
import { addingDay } from '../repeat';
import { carbsShown } from '../targets';
import { useStore } from '../store';
import { fonts, useTheme } from '../theme';
import { Card, Chip, GhostButton, IconButton, num, PrimaryButton, Txt } from '../ui';
import { r0, r1, today } from '../util';

type Unit = Portion & { key: string; step: number };

const OZ = 28.3495;
const nice = (x: number) => Math.abs(x * 4 - Math.round(x * 4)) < 0.02;
const fmt = (x: number) => String(Math.round(x * 100) / 100);

export default function Detail() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const p = nav.payload('detail');
  const food = p?.food;
  const entryPortion = p?.portion;
  const startGrams = p?.grams;

  // Every way to measure this food: its household portions, then grams and ounces
  const units: Unit[] = useMemo(() => {
    if (!food) return [];
    const list: Unit[] = portionsOf(food).map((x, i) => ({ ...x, key: 'p' + i, step: 0.5 }));
    if (entryPortion && !list.some((u) => u.label === entryPortion.label)) list.unshift({ ...entryPortion, key: 'pe', step: 0.5 });
    // Plain gram/ounce portions are covered by the grams and oz units
    const plain = list.filter((u) => !/^\d+(\.\d+)? ?g$/.test(u.label) && !/^1 oz$/.test(u.label));
    return [...plain, { label: 'grams', g: 1, key: 'g', step: 10 }, { label: 'oz', g: OZ, key: 'oz', step: 1 }];
  }, [food, entryPortion]);

  const initial = useMemo(() => {
    const grams = startGrams ?? food?.g ?? 100;
    const preferred = (entryPortion && units.find((u) => u.label === entryPortion.label)) || units[0];
    const count = preferred ? grams / preferred.g : grams;
    if (preferred && nice(count)) return { key: preferred.key, amount: fmt(count) };
    return { key: 'g', amount: fmt(grams) };
  }, [startGrams, entryPortion, food, units]);

  const [unitKey, setUnitKey] = useState(initial.key);
  const [amount, setAmount] = useState(initial.amount);
  const [meal, setMeal] = useState<MealKey>(p?.meal ?? 'snacks');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [repeat, setRepeat] = useState<string[]>([]); // more days to put this food on
  const [at, setAt] = useState<number | undefined>(undefined); // a time you set for this entry
  const unit = units.find((u) => u.key === unitKey) ?? units[0];

  const grams = useMemo(() => {
    const a = parseFloat(amount.replace(',', '.'));
    return a > 0 && unit ? a * unit.g : 0;
  }, [amount, unit]);
  const n = food ? scale(food, grams) : null;

  if (!p || !food || !n || !unit) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ModalHeader title="Food" onClose={nav.done} />
      </View>
    );
  }

  const starred = store.isFavorite(food);

  const switchUnit = (u: Unit) => {
    if (u.key === unit.key) return;
    const g = grams || unit.g;
    const count = g / u.g;
    setAmount(u.key === 'g' ? fmt(Math.round(g)) : fmt(nice(count) ? Math.round(count * 4) / 4 : count));
    setUnitKey(u.key);
  };
  const bump = (dir: 1 | -1) => {
    const a = parseFloat(amount.replace(',', '.')) || 0;
    const next = Math.max(0, Math.round((a + dir * unit.step) * 100) / 100);
    setAmount(fmt(next));
  };
  // The portion stored on the entry, so the diary can say "2 × 1 slice"
  const chosen: Portion | undefined = unit.key === 'g' ? { label: '1 g', g: 1 } : unit.key === 'oz' ? { label: '1 oz', g: OZ } : { label: unit.label, g: unit.g };

  const pick = p.mode === 'pick';
  const close = pick ? nav.backToRecipe : nav.done;
  // The day this goes on
  const day = p.mode === 'add' ? addingDay(nav.date, today()) : nav.date;
  const confirm = () => {
    if (!(grams > 0)) return;
    if (pick) {
      // An ingredient for the recipe being edited
      if (food.src === 'online') store.saveFood(food);
      const item = {
        name: food.brand && !food.name.toLowerCase().includes(food.brand.toLowerCase()) ? `${food.name} (${food.brand})` : food.name,
        serving: chosen?.label ?? food.serving,
        sg: chosen?.g ?? food.g,
        grams: Math.round(grams * 10) / 10,
        n: scale(food, grams),
        fid: food.id.startsWith('r:') ? undefined : food.id,
        mx: !!food.micros,
      };
      const idx = p.pickIndex;
      nav.setRecipe((d) => ({ ...d, items: idx !== undefined ? d.items.map((x, i) => (i === idx ? item : x)) : [...d.items, item] }));
      nav.toast(idx !== undefined ? 'Ingredient updated' : 'Added to recipe');
      nav.backToRecipe();
      return;
    }
    const mealName = MEALS.find((m) => m[0] === meal)?.[1];
    const more = repeat.length;
    if (p.mode === 'add') {
      if (food.src === 'online') store.saveFood(food); // keep it in My foods for next time
      store.addEntry(day, food, grams, meal, chosen);
      nav.toast(more ? `Added to ${mealName} on ${more + 1} days` : `Added to ${mealName}`);
    } else if (p.entryId) {
      store.updateEntry(day, p.entryId, grams, meal, chosen, at);
      nav.toast(more ? `Saved and copied to ${more} more day${more === 1 ? '' : 's'}` : 'Updated');
    }
    repeat.forEach((d) => store.addEntry(d, food, grams, meal, chosen));
    nav.done();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader
        title={food.name}
        onClose={close}
        right={
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={starred ? 'Remove from favorites' : 'Add to favorites'}
            onPress={() => nav.toast(store.toggleFavorite(food) ? 'Added to favorites' : 'Removed from favorites')}
            style={{ padding: 6 }}
          >
            <Ionicons name={starred ? 'star' : 'star-outline'} size={22} color={starred ? t.carbs : t.muted} />
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        {food.recipe ? (
          <Txt size={13} color={t.muted}>
            Your recipe · makes {food.recipe.servings} serving{food.recipe.servings === 1 ? '' : 's'} · {food.recipe.items.length} ingredients{'  '}
            {!pick ? (
              <Txt size={13} weight="bodyBold" color={t.accent} onPress={() => nav.openRecipe(food)} suppressHighlighting>
                Edit recipe
              </Txt>
            ) : null}
          </Txt>
        ) : food.brand || food.source ? (
          <Txt size={13} color={t.muted}>
            {[food.brand, food.source ? `Data from ${food.source}` : null].filter(Boolean).join(' · ')}
          </Txt>
        ) : null}

        {food.flagged ? (
          <View style={{ flexDirection: 'row', gap: 8, backgroundColor: t.warnSoft, borderRadius: 12, padding: 12 }}>
            <Ionicons name="alert-circle-outline" size={18} color={t.warn} />
            <Txt size={13} color={t.warn} weight="bodyBold" style={{ flex: 1 }}>These numbers may be wrong. Check them against the label.</Txt>
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <Txt weight="bodyBold" size={12.5} color={t.muted}>Amount</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconButton label="Less" onPress={() => bump(-1)}>
              <Ionicons name="remove" size={20} color={t.ink} />
            </IconButton>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              selectTextOnFocus
              autoFocus={p.mode === 'add' || p.mode === 'pick'}
              accessibilityLabel="Amount"
              style={{ flex: 1, minWidth: 0, borderWidth: 1, borderColor: t.accent, backgroundColor: t.surface2, color: t.ink, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fonts.display, fontSize: 22, textAlign: 'center' }}
            />
            <IconButton label="More" onPress={() => bump(1)}>
              <Ionicons name="add" size={20} color={t.ink} />
            </IconButton>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Txt weight="bodyBold" size={12.5} color={t.muted}>Measured in</Txt>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {units.map((u) => (
              <Chip key={u.key} label={u.key === 'g' || u.key === 'oz' ? u.label : `${u.label} · ${r1(u.g)} g`} active={u.key === unit.key} onPress={() => switchUnit(u)} />
            ))}
          </View>
          <Txt size={12.5} color={t.faint}>{grams > 0 ? `Logging ${r0(grams)} g` : 'Enter an amount'}</Txt>
        </View>

        {pick ? null : <View style={{ gap: 6 }}>
          <Txt weight="bodyBold" size={12.5} color={t.muted}>Meal</Txt>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {MEALS.map(([k, l]) => (
              <Chip key={k} label={l} active={meal === k} onPress={() => setMeal(k)} />
            ))}
          </View>
        </View>}

        {p.mode === 'edit' && p.entryId && !p.sample ? <MealTime entry={store.entriesFor(day).find((e) => e.id === p.entryId)} date={day} value={at} onChange={setAt} /> : null}

        {pick || p.sample ? null : <RepeatDays base={day} selected={repeat} onChange={setRepeat} />}

        <Card style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 }}>
          {([['kcal', 'kcal', t.ink], ['p', 'protein g', t.protein], ['c', store.profile.netCarbs ? 'net carbs g' : 'carbs g', t.carbs], ['f', 'fat g', t.fat]] as const).map(([k, label, color]) => (
            <View key={k} style={{ alignItems: 'center', flex: 1 }}>
              <Txt weight="display" size={21} color={color} style={num}>{food.unknown?.includes(k) ? '–' : k === 'kcal' ? r0(n[k]) : k === 'c' ? r1(carbsShown(n, store.profile.netCarbs)) : r1(n[k])}</Txt>
              <Txt size={11.5} color={t.muted}>{label}</Txt>
            </View>
          ))}
        </Card>

        <Card>
          <NutrientPanel n={n} coverage={food.micros ? 1 : 0} unknown={food.unknown} targets={store.profile.nutrientTargets} />
        </Card>
        {p.sample ? <Txt size={13} color={t.muted}>This is a sample entry. Log your own food to replace the sample day.</Txt> : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: kb ? kb + 12 : insets.bottom + 12, borderTopWidth: 1, borderTopColor: t.line }}>
        {pick && p.pickIndex !== undefined ? (
          <GhostButton
            label={confirmRemove ? 'Tap to confirm' : 'Remove'}
            color={t.warn}
            onPress={() => {
              if (!confirmRemove) return setConfirmRemove(true);
              const idx = p.pickIndex;
              nav.setRecipe((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }));
              nav.toast('Ingredient removed');
              nav.backToRecipe();
            }}
          />
        ) : null}
        {p.mode === 'edit' && !p.sample ? (
          <GhostButton
            label={confirmRemove ? 'Tap to confirm' : 'Remove'}
            color={t.warn}
            onPress={() => {
              if (!confirmRemove) return setConfirmRemove(true);
              if (p.entryId) store.removeEntry(nav.date, p.entryId);
              nav.toast('Removed');
              nav.done();
            }}
          />
        ) : null}
        <PrimaryButton label={pick ? (p.pickIndex !== undefined ? 'Update ingredient' : 'Add to recipe') : p.mode === 'add' ? 'Add to diary' : 'Save'} onPress={confirm} disabled={!(grams > 0) || !!p.sample} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
