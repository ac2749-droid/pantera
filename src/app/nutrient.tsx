import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultMeal } from '../components/helpers';
import { FoodRow } from '../components/FoodRow';
import { Arrive } from '../components/motion';
import { ModalHeader } from '../components/Screen';
import { Food, MEALS, NutrientKey, sum } from '../foods';
import { useNav } from '../nav';
import { describeNutrient, foodsRichIn, Source, SUGGESTABLE, topSources } from '../nutrientSources';
import { QuickAmount, quickAmount } from '../quickAdd';
import { addingDay } from '../repeat';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { carbsShown, dailyValue, targetsFor } from '../targets';
import { Bar, Card, Eyebrow, Field, GhostButton, num, PrimaryButton, Txt } from '../ui';
import { addDays, dayTitle, fmtAmount, r0, today } from '../util';

/** Lets you replace the daily value with your own number. */
function OwnTarget({ k, unit, standard }: { k: NutrientKey; unit: string; standard: number }) {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const own = store.profile.nutrientTargets?.[k];
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(own ? String(own) : standard ? String(standard) : '');

  const write = (value: number | undefined) => {
    const all = { ...store.profile.nutrientTargets, [k]: value };
    if (!value) delete all[k];
    store.setProfile({ nutrientTargets: Object.keys(all).length ? all : undefined });
    setOpen(false);
  };
  const save = () => {
    const value = parseFloat(text.replace(',', '.'));
    if (!(value > 0)) return nav.toast('Enter a number above 0');
    write(value);
    nav.toast('Your target is saved');
  };

  if (!open) {
    return (
      <GhostButton
        label={own ? `Your target: ${own.toLocaleString()} ${unit} · Change` : standard ? 'Set my own target' : 'Set a target'}
        onPress={() => setOpen(true)}
        color={t.accent}
      />
    );
  }
  return (
    <Card style={{ gap: 10 }}>
      <Field label={`My daily target (${unit})`} value={text} onChangeText={setText} keyboardType="decimal-pad" autoFocus selectTextOnFocus />
      <PrimaryButton label="Save target" onPress={save} />
      {own ? <GhostButton label={standard ? `Back to the daily value (${standard.toLocaleString()} ${unit})` : 'Remove my target'} onPress={() => { write(undefined); setText(standard ? String(standard) : ''); }} /> : null}
    </Card>
  );
}

export default function Nutrient() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const k = nav.payload('nutrient')?.k ?? 'p';
  const info = describeNutrient(k);
  const date = nav.date;
  const day = store.entriesFor(date);
  // The seven days ending on this one, without the sample day or days still to come
  const week = Array.from({ length: 7 }, (_, i) => addDays(date, -i))
    .filter((d) => d <= today())
    .flatMap((d) => (store.days[d] ?? []).filter((e) => !e.sample));

  if (!info) return <View style={{ flex: 1, backgroundColor: t.bg }} />;

  // Macros are measured against that day's targets; everything else against your target or the daily value
  const macro = k === 'p' || k === 'c' || k === 'f';
  const target = macro ? targetsFor(store.profile, date)[k] : dailyValue(store.profile, k, info.dv);
  const totals = sum(day);
  const eaten = k === 'c' ? carbsShown(totals, store.profile.netCarbs) : totals[k] || 0;
  const limit = info.kind === 'limit';
  const over = limit && target > 0 && eaten > target;
  const reached = !limit && target > 0 && eaten >= target;
  const color = k === 'p' ? t.protein : k === 'c' ? t.carbs : k === 'f' ? t.fat : over ? t.warn : reached ? t.good : t.accent;
  const left = Math.max(0, target - eaten);
  const status = !target
    ? 'No daily value is set for this one.'
    : over
      ? `${fmtAmount(eaten - target, info.unit)} ${info.unit} over the daily limit.`
      : reached
        ? 'You’ve reached it for this day.'
        : limit
          ? `${fmtAmount(left, info.unit)} ${info.unit} left before the daily limit.`
          : `${fmtAmount(left, info.unit)} ${info.unit} to go.`;

  const suggestions = left > 0 ? foodsRichIn(k, SUGGESTABLE, 6) : [];
  // The time of day only says which meal this is when you're looking at today
  // Carbs listed by source follow the same measure as the total
  const measured = (entries: typeof day) => (k === 'c' && store.profile.netCarbs ? entries.map((e) => ({ ...e, n: { ...e.n, c: carbsShown(e.n, true) } })) : entries);
  const meal = date === today() ? defaultMeal() : 'snacks';
  const add = (food: Food, amount: QuickAmount) => {
    store.addEntry(addingDay(date, today()), food, amount.grams, meal, amount.portion);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    nav.toast(`${food.name} added to ${MEALS.find((m) => m[0] === meal)?.[1] ?? 'Snacks'}`);
  };

  const list = (title: string, sources: Source[], empty: string) => (
    <Card style={{ gap: 12 }}>
      <Eyebrow inline>{title}</Eyebrow>
      {sources.length ? (
        sources.map((s) => (
          <View key={s.name} style={{ gap: 5 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <Txt size={14} style={{ flexShrink: 1 }} numberOfLines={2}>
                {s.name}
                {s.times > 1 ? <Txt size={12} color={t.faint}>{`  ×${s.times}`}</Txt> : null}
              </Txt>
              <Txt size={13} color={t.muted} style={num}>
                <Txt size={13} weight="bodyHeavy" style={num}>{fmtAmount(s.amount, info.unit)} {info.unit}</Txt> · {r0(s.share * 100)}%
              </Txt>
            </View>
            <Bar value={s.share} max={1} color={color} height={5} />
          </View>
        ))
      ) : (
        <Txt size={13.5} color={t.muted}>{empty}</Txt>
      )}
    </Card>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title={k === 'c' && store.profile.netCarbs ? 'Net carbs' : info.label} onClose={nav.done} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 24 }}>
        <Arrive>
          <Card style={{ gap: 10, borderColor: color }}>
            <Txt size={13} color={t.muted} weight="bodyBold">{dayTitle(date)}</Txt>
            <Txt weight="displayHeavy" size={34} color={color} style={num}>
              {fmtAmount(eaten, info.unit)} <Txt weight="displaySemi" size={16} color={t.muted}>{info.unit}{target ? ` of ${target.toLocaleString()}` : ''}</Txt>
            </Txt>
            {target ? <Bar value={eaten} max={target} color={color} height={10} /> : null}
            <Txt size={14} color={t.muted}>{status}</Txt>
          </Card>
        </Arrive>

        {macro ? null : <OwnTarget key={k} k={k} unit={info.unit} standard={info.dv} />}

        <Arrive delay={80}>{list('Where it came from', topSources(measured(day), k), 'Nothing logged this day lists this nutrient.')}</Arrive>
        {week.length > day.length ? <Arrive delay={140}>{list('Top sources, last 7 days', topSources(measured(week), k, 5), 'No sources yet.')}</Arrive> : null}

        {suggestions.length ? (
          <Arrive delay={200}>
            <Card style={{ gap: 4 }}>
              <Eyebrow inline>Foods that would help</Eyebrow>
              <Txt size={12.5} color={t.muted}>A good amount for the calories. Tap + to log one.</Txt>
              {suggestions.map((food) => {
                const quick = quickAmount(store.days, food);
                return (
                  <FoodRow
                    key={food.id}
                    food={food}
                    quick={quick}
                    onPress={() => nav.go({ type: 'detail', food, mode: 'add', meal })}
                    onQuickAdd={() => add(food, quick)}
                  />
                );
              })}
            </Card>
          </Arrive>
        ) : null}
        <Txt size={12} color={t.faint} style={{ textAlign: 'center' }}>
          Foods that don’t list a nutrient are not counted. General information, not medical advice.
        </Txt>
      </ScrollView>
    </View>
  );
}
