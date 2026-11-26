import Ionicons from '@expo/vector-icons/Ionicons';
import { Macros } from '../components/Macros';
import { useMemo, useState } from 'react';
import { ScrollView, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { defaultMeal } from '../components/helpers';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { MealKey, MEALS, sum, scale } from '../foods';
import { useNav } from '../nav';
import { recipeFood, recipeTotals } from '../recipe';
import { decodeMeal } from '../share';
import { useStore } from '../store';
import { fonts, useTheme } from '../theme';
import { Card, Chip, Eyebrow, GhostButton, num, PrimaryButton, Txt } from '../ui';
import { carbsShown } from '../targets';
import { int, r0, today } from '../util';

const AMOUNTS: [number, string][] = [[0.5, '½'], [1, 'All of it'], [1.5, '1½×'], [2, '2×']];
const SERVINGS: [number, string][] = [[0.5, '½ serving'], [1, '1 serving'], [1.5, '1½ servings'], [2, '2 servings']];

export default function ImportMeal() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const scanned = nav.payload('importMeal')?.code ?? '';
  const [text, setText] = useState(scanned);
  const [meal, setMeal] = useState<MealKey>(defaultMeal());
  const [factor, setFactor] = useState(1);
  const [keep, setKeep] = useState(true);
  const shared = useMemo(() => decodeMeal(text), [text]);
  const isRecipe = !!shared?.recipe;
  // A recipe is logged by servings, so totals shown are for one serving
  const tot = shared ? (shared.recipe ? recipeTotals({ items: shared.items, servings: shared.recipe.servings, cookedG: shared.recipe.cookedG }).perServing : sum(shared.items)) : null;
  const sharedRecipeFood = () => (shared?.recipe ? recipeFood({ name: shared.name, servings: shared.recipe.servings, cookedG: shared.recipe.cookedG, items: shared.items }) : null);
  const date = nav.date > today() ? today() : nav.date;
  const mealLabel = MEALS.find((m) => m[0] === meal)?.[1] ?? 'Snacks';

  const log = () => {
    if (!shared) return;
    const rf = sharedRecipeFood();
    if (rf) {
      if (keep) store.saveFood(rf);
      store.addEntry(date, rf, rf.g * factor, meal, { label: '1 serving', g: rf.g });
      nav.toast(`${shared.name} added to ${mealLabel}`);
      nav.done();
      return;
    }
    if (keep) store.addSavedMeal(shared.name, shared.items);
    store.logItems(date, shared.items, meal, factor);
    nav.toast(`${shared.name} added to ${mealLabel}`);
    nav.done();
  };
  const saveOnly = () => {
    if (!shared) return;
    const rf = sharedRecipeFood();
    if (rf) store.saveFood(rf);
    else store.addSavedMeal(shared.name, shared.items);
    nav.toast(rf ? 'Recipe saved to My foods' : 'Saved to your meals');
    nav.done();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Import meal" onClose={nav.done} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        {!shared ? (
          <>
            <Txt size={14} color={t.muted}>Paste the message a friend sent you from Pantera. You can paste the whole message, not just the code.</Txt>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Long-press here and tap Paste"
              placeholderTextColor={t.faint}
              multiline
              autoFocus={!scanned}
              autoCorrect={false}
              autoCapitalize="none"
              style={{ minHeight: 140, textAlignVertical: 'top', borderWidth: 1, borderColor: text ? t.warn : t.line, backgroundColor: t.surface, color: t.ink, borderRadius: 14, padding: 12, fontFamily: fonts.bodySemi, fontSize: 14 }}
            />
            {text.trim() ? (
              <Txt size={13.5} weight="bodyBold" color={t.warn}>
                That doesn’t look like a Pantera meal. Make sure you copied the whole message, including the part that starts with PANTERA1:
              </Txt>
            ) : null}
            <GhostButton label="Scan a friend’s QR code instead" onPress={() => nav.go({ type: 'scan', meal }, { replace: true })} />
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="gift-outline" size={20} color={t.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Txt weight="display" size={20}>{shared.name}</Txt>
                <Txt size={13} color={t.muted}>{shared.recipe ? `Recipe shared with you · makes ${shared.recipe.servings} serving${shared.recipe.servings === 1 ? '' : 's'} · ${shared.items.length} ingredients` : `Shared with you · ${shared.items.length} ${shared.items.length === 1 ? 'item' : 'items'}`}</Txt>
              </View>
            </View>

            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {shared.items.map((it, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, gap: 10 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt size={14} weight="bodyBold">{it.name}</Txt>
                    <Txt size={12.5} color={t.muted}>{factor === 1 || isRecipe ? it.serving : `${r0(it.grams * factor)} g`}{(factor === 1 || isRecipe) && !/\bg$/.test(it.serving) ? ` · ${r0(it.grams)} g` : ''}</Txt>
                    <Macros n={scale({ g: 1, n: it.n }, isRecipe ? 1 : factor)} />
                  </View>
                  <Txt size={14} weight="bodyHeavy" style={num}>{r0(it.n.kcal * (isRecipe ? 1 : factor))}</Txt>
                </View>
              ))}
            </Card>

            <View style={{ gap: 8 }}>
              <Eyebrow>How much did you eat?</Eyebrow>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {(isRecipe ? SERVINGS : AMOUNTS).map(([v, l]) => (
                  <Chip key={v} label={l} active={factor === v} onPress={() => setFactor(v)} />
                ))}
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Eyebrow>Meal</Eyebrow>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {MEALS.map(([k, l]) => (
                  <Chip key={k} label={l} active={meal === k} onPress={() => setMeal(k)} />
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt size={14} weight="bodyBold">{isRecipe ? 'Also save to my recipes' : 'Also save to my meals'}</Txt>
                <Txt size={12.5} color={t.muted}>So you can log it again in one tap.</Txt>
              </View>
              <Switch value={keep} onValueChange={setKeep} trackColor={{ true: t.accent, false: t.surface2 }} thumbColor={t.ink} />
            </View>
          </>
        )}
      </ScrollView>
      {shared && tot ? (
        <View style={{ padding: 16, paddingBottom: kb ? kb + 12 : insets.bottom + 12, borderTopWidth: 1, borderTopColor: t.line, gap: 8 }}>
          <Txt size={13} color={t.muted} style={[num, { textAlign: 'center' }]}>
            {int(tot.kcal * factor)} kcal · P {r0(tot.p * factor)} · C {r0(carbsShown(tot, store.profile.netCarbs) * factor)} · F {r0(tot.f * factor)}
          </Txt>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <GhostButton label="Save only" onPress={saveOnly} />
            <PrimaryButton label={`Log to ${mealLabel}`} onPress={log} style={{ flex: 1 }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
