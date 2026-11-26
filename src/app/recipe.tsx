import Ionicons from '@expo/vector-icons/Ionicons';
import { Macros } from '../components/Macros';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { useVoice } from '../components/useVoice';
import { buildPersonalIndex, resolveFood } from '../foodSearch';
import { Food, portionsOf, RecipeItem, scale } from '../foods';
import { readMeal } from '../meal';
import type { MealItem } from '../meal';
import { parseMeal } from '../meal/parse';
import { resolveItem } from '../meal/resolve';
import { bestGuess } from '../meal/guess';
import { useNav } from '../nav';
import { recipeFood, recipeTotals } from '../recipe';
import { ingredientQuery, loadRecipe, RecipeImportError, recipeUrl } from '../recipeImport';
import { useStore } from '../store';
import { fonts, useTheme } from '../theme';
import { Card, Chip, Eyebrow, Field, GhostButton, IconButton, num, PrimaryButton, Txt } from '../ui';
import { int, r0 } from '../util';
import { carbsShown } from '../targets';
import { speechHints } from '../voiceHints';

const OZ = 28.3495;
const fmt = (x: number) => String(Math.round(x * 100) / 100);
// "1 tbsp", "2 × 1 cup", "1.5 × 1 serving"
const amountOf = (it: RecipeItem) => {
  const c = Math.round((it.grams / (it.sg || it.grams)) * 100) / 100;
  return c === 1 ? it.serving : `${c} × ${it.serving}`;
};

/** A food the meal reader matched, as an ingredient. Null when it found nothing usable. */
function ingredient(it: MealItem): RecipeItem | null {
  if (!it.food || !(it.grams > 0)) return null;
  const f = it.food;
  return {
    name: f.brand && !f.name.toLowerCase().includes(f.brand.toLowerCase()) ? `${f.name} (${f.brand})` : f.name,
    serving: it.portion.label,
    sg: it.portion.g,
    grams: Math.round(it.grams * 10) / 10,
    n: scale(f, it.grams),
    fid: f.id.startsWith('r:') ? undefined : f.id,
    mx: !!f.micros,
  };
}

const IMPORT_PROBLEMS: Record<RecipeImportError['reason'], string> = {
  unreachable: 'Couldn’t open that page. Check the link and your connection.',
  blocked: 'That site doesn’t let apps read its pages. Copy the ingredient list into Describe instead.',
  'no-recipe': 'No recipe found on that page. Copy the ingredient list into Describe instead.',
};

export default function RecipeEditor() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const d = nav.recipe;
  const editing = !!d.id && store.profile.customFoods.some((f) => f.id === d.id);

  const [servingsText, setServingsText] = useState(fmt(d.servings));
  const [unit, setUnit] = useState<'g' | 'oz'>(store.profile.units === 'us' ? 'oz' : 'g');
  const [weightText, setWeightText] = useState(d.cookedG ? fmt(d.cookedG / (store.profile.units === 'us' ? OZ : 1)) : '');
  const [describing, setDescribing] = useState(false);
  const [describeText, setDescribeText] = useState('');
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const open = useRef(true); // a page that arrives after the editor closes must not reach another recipe
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const totals = recipeTotals(d);
  const personal = useMemo(() => buildPersonalIndex(store.profile.customFoods, store.recentFoods(), 'all', store.profile.favorites), [store]);

  const setServings = (v: string) => {
    setServingsText(v);
    const n = parseFloat(v.replace(',', '.'));
    if (n > 0) nav.setRecipe((x) => ({ ...x, servings: Math.min(n, 200) }));
  };
  const bumpServings = (dir: 1 | -1) => setServings(fmt(Math.max(1, (parseFloat(servingsText) || d.servings) + dir)));
  const setWeight = (v: string, u = unit) => {
    setWeightText(v);
    const n = parseFloat(v.replace(',', '.'));
    nav.setRecipe((x) => ({ ...x, cookedG: n > 0 ? Math.round(n * (u === 'oz' ? OZ : 1)) : undefined }));
  };
  const switchUnit = (u: 'g' | 'oz') => {
    if (u === unit) return;
    setUnit(u);
    if (d.cookedG) setWeightText(fmt(d.cookedG / (u === 'oz' ? OZ : 1)));
  };

  const editItem = (it: RecipeItem, index: number) => {
    // Rebuild a food for the amount screen; keep the original food's portions when we still have it
    const own = { label: it.serving, g: it.sg || it.grams };
    const original = resolveFood(it.fid, store.profile.customFoods);
    const food: Food = { id: it.fid ?? 'r:' + it.name, name: it.name, serving: own.label, g: own.g, n: scale({ g: it.grams || 1, n: it.n }, own.g), src: 'recent', portions: original ? portionsOf(original) : undefined, micros: it.mx };
    nav.go({ type: 'detail', food, mode: 'pick', pickIndex: index, meal: 'snacks', grams: it.grams, portion: own });
  };

  const addDescribed = async (text: string) => {
    const said = text.trim();
    if (!said || reading) return;
    setReading(true);
    setNote(null);
    try {
      const p = store.profile;
      const key = p.aiProvider === 'meta' ? p.metaKey : p.geminiKey;
      const r = await readMeal(said, personal, { key, enabled: p.aiEnabled, provider: p.aiProvider });
      const found: RecipeItem[] = [];
      const missed: string[] = [];
      r.items.forEach((it) => {
        const item = ingredient(it);
        if (item) found.push(item);
        else missed.push(it.said || it.query);
      });
      if (found.length) nav.setRecipe((x) => ({ ...x, items: [...x.items, ...found] }));
      setNote(
        found.length
          ? `Added ${found.length} ingredient${found.length > 1 ? 's' : ''}. Tap any one to check the food or amount.${missed.length ? ` Couldn’t find: ${missed.join(', ')}.` : ''}`
          : 'I couldn’t pick out any ingredients. Try “2 cups cooked rice, 1 lb chicken breast, 1 tbsp olive oil”.',
      );
      if (found.length) {
        setDescribeText('');
        setDescribing(false);
      }
    } catch {
      setNote('Something went wrong reading that. Try again or add ingredients with Search.');
    }
    setReading(false);
  };
  const importRecipe = async () => {
    const url = recipeUrl(link);
    if (loading) return;
    if (!url) return setNote('Paste the web address of a recipe, for example from your browser’s share button.');
    setLoading(true);
    setNote(null);
    try {
      const page = await loadRecipe(url);
      if (!open.current) return;
      const found: RecipeItem[] = [];
      const missed: string[] = [];
      const unsure: string[] = [];
      // One line is one ingredient, so each is read on its own
      for (const line of page.ingredients) {
        const query = ingredientQuery(line);
        if (query === null) continue; // seasonings and water add nothing worth counting
        const parsed = parseMeal(query).items[0];
        const match = parsed ? resolveItem(parsed, personal) : null;
        const item = match ? ingredient(match) : null;
        if (!item) missed.push(line);
        else {
          found.push(item);
          if (match?.confidence === 'check') unsure.push(item.name);
        }
      }
      if (found.length) {
        nav.setRecipe((x) => ({ ...x, name: x.name || page.name.slice(0, 60), servings: page.servings ?? x.servings, items: [...x.items, ...found] }));
        if (page.servings) setServingsText(fmt(page.servings));
        setLink('');
        setLinking(false);
      }
      setNote(`Added ${found.length} of ${page.ingredients.length} ingredients (salt, pepper and water are left out). Check each food and amount, they are estimates.${unsure.length ? ` Look closely at: ${unsure.join('; ')}.` : ''}${missed.length ? ` Not matched: ${missed.join('; ')}.` : ''}`);
    } catch (e) {
      setNote(IMPORT_PROBLEMS[e instanceof RecipeImportError ? e.reason : 'unreachable']);
    }
    setLoading(false);
  };
  const voice = useVoice(
    (heard) => {
      setDescribeText(heard);
      addDescribed(heard);
    },
    {
      words: speechHints(store.profile.customFoods.map((f) => f.name)),
      choose: (guesses) => bestGuess(guesses, personal),
      onInterrupted: (heard) => setDescribeText((typed) => [typed.trim(), heard].filter(Boolean).join(', ')),
    },
  );

  const save = () => {
    if (!d.name.trim()) return setErr('Give the recipe a name.');
    if (!d.items.length) return setErr('Add at least one ingredient.');
    const food = recipeFood(d);
    store.saveFood(food);
    nav.toast(editing ? 'Recipe updated' : 'Recipe saved to My foods');
    nav.done();
  };

  const perLabel = store.profile.units === 'us' ? `${fmt(Math.round((totals.perG / OZ) * 10) / 10)} oz (${r0(totals.perG)} g)` : `${r0(totals.perG)} g`;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title={editing ? 'Edit recipe' : 'New recipe'} onClose={nav.done} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Field label="Recipe name" value={d.name} onChangeText={(v) => { setErr(''); nav.setRecipe((x) => ({ ...x, name: v })); }} placeholder="e.g. Bacon & egg sandwich, Chicken chili" maxLength={60} autoFocus={!editing && !d.items.length} />

        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Txt weight="bodyBold" size={12.5} color={t.muted}>Makes how many servings?</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <IconButton label="Fewer servings" onPress={() => bumpServings(-1)} disabled={d.servings <= 1}>
                <Ionicons name="remove" size={20} color={t.ink} />
              </IconButton>
              <TextInput
                value={servingsText}
                onChangeText={setServings}
                keyboardType="decimal-pad"
                selectTextOnFocus
                style={{ flex: 1, textAlign: 'center', borderWidth: 1, borderColor: t.line, backgroundColor: t.surface2, borderRadius: 12, paddingVertical: 10, color: t.ink, fontFamily: fonts.bodyBold, fontSize: 17 }}
              />
              <IconButton label="More servings" onPress={() => bumpServings(1)}>
                <Ionicons name="add" size={20} color={t.ink} />
              </IconButton>
            </View>
          </View>
        </View>

        <View style={{ gap: 6 }}>
          <Txt weight="bodyBold" size={12.5} color={t.muted}>Weight of the finished dish (optional)</Txt>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={weightText}
              onChangeText={(v) => setWeight(v)}
              keyboardType="decimal-pad"
              placeholder={totals.rawG ? `Ingredients total ${unit === 'oz' ? fmt(Math.round((totals.rawG / OZ) * 10) / 10) : r0(totals.rawG)} ${unit}` : 'e.g. 1200'}
              placeholderTextColor={t.faint}
              style={{ flex: 1, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, color: t.ink, fontFamily: fonts.bodySemi, fontSize: 16 }}
            />
            <Chip label="g" active={unit === 'g'} onPress={() => switchUnit('g')} />
            <Chip label="oz" active={unit === 'oz'} onPress={() => switchUnit('oz')} />
          </View>
          <Txt size={12.5} color={t.faint}>Cooking changes weight (water cooks off, rice soaks it up). Weigh the whole pot after cooking so “250 g” of it is accurate. Leave empty to use the ingredients’ weight.</Txt>
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Eyebrow inline>Ingredients</Eyebrow>
            <Txt size={12.5} color={t.muted}>{d.items.length ? `${d.items.length} · ${int(totals.total.kcal)} kcal total` : ''}</Txt>
          </View>
          {d.items.length ? (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {d.items.map((it, i) => (
                <Pressable key={i} onPress={() => editItem(it, i)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="bodyBold" size={14.5} numberOfLines={2}>{it.name}</Txt>
                    <Txt size={12.5} color={t.muted}>
                      {/\bg$/.test(it.serving) ? `${r0(it.grams)} g` : `${amountOf(it)} · ${r0(it.grams)} g`}
                    </Txt>
                    <Macros n={it.n} />
                  </View>
                  <Txt weight="bodyHeavy" size={14} style={num}>{r0(it.n.kcal)}</Txt>
                  <Pressable hitSlop={8} accessibilityLabel={`Remove ${it.name}`} onPress={() => nav.setRecipe((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))} style={{ padding: 4 }}>
                    <Ionicons name="close" size={18} color={t.faint} />
                  </Pressable>
                </Pressable>
              ))}
            </Card>
          ) : (
            <Txt size={13.5} color={t.muted}>Add everything that goes in: search, scan a package, or just describe it.</Txt>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {([
              ['search', 'Search', () => nav.go({ type: 'add', meal: 'snacks', pick: true })],
              ['barcode-outline', 'Scan', () => nav.go({ type: 'scan', meal: 'snacks', pick: true })],
              ['sparkles', 'Describe', () => { setDescribing(!describing); setNote(null); }],
            ] as const).map(([icon, label, onPress]) => (
              <Pressable key={label} onPress={onPress} disabled={voice.listening} style={({ pressed }) => ({ opacity: voice.listening ? 0.45 : 1, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: label === 'Describe' && describing ? t.accent : t.line, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 11, backgroundColor: pressed ? t.surface2 : label === 'Describe' && describing ? t.accentSoft : 'transparent' })}>
                <Ionicons name={icon} size={17} color={t.accent} />
                <Txt weight="bodyBold" size={14} color={t.accent}>{label}</Txt>
              </Pressable>
            ))}
          </View>
          <Pressable
            disabled={voice.listening}
            onPress={() => { setLinking(!linking); setNote(null); }}
            accessibilityRole="button"
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: linking ? t.accent : t.line, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 11, backgroundColor: pressed ? t.surface2 : linking ? t.accentSoft : t.bg })}
          >
            <Ionicons name="link" size={17} color={t.accent} />
            <Txt weight="bodyBold" size={14} color={t.accent}>Import from a web page</Txt>
          </Pressable>
          {linking ? (
            <View style={{ gap: 8 }}>
              <TextInput
                value={link}
                onChangeText={setLink}
                editable={!loading}
                placeholder="Paste a recipe link"
                placeholderTextColor={t.faint}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                inputMode="url"
                returnKeyType="go"
                onSubmitEditing={importRecipe}
                style={{ borderWidth: 1, borderColor: t.accent, backgroundColor: t.surface, borderRadius: 14, padding: 12, color: t.ink, fontFamily: fonts.bodySemi, fontSize: 15 }}
              />
              {loading ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <ActivityIndicator color={t.accent} />
                  <Txt size={13.5} color={t.muted}>Reading the recipe…</Txt>
                </View>
              ) : (
                <GhostButton label="Get the ingredients" onPress={importRecipe} disabled={!link.trim()} />
              )}
            </View>
          ) : null}
          {describing ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
                <TextInput
                  value={voice.listening ? voice.partial : describeText}
                  onChangeText={setDescribeText}
                  editable={!voice.listening && !reading}
                  placeholder={voice.listening ? 'Listening… say the ingredients, then tap the square' : '2 cups cooked rice, 1 lb ground beef, 1 can black beans…'}
                  placeholderTextColor={voice.listening ? t.accent : t.faint}
                  multiline
                  autoFocus
                  style={{ flex: 1, minHeight: 70, maxHeight: 140, textAlignVertical: 'top', borderWidth: 1, borderColor: t.accent, backgroundColor: t.surface, borderRadius: 14, padding: 12, color: t.ink, fontFamily: fonts.bodySemi, fontSize: 15 }}
                />
                <Pressable
                  onPress={() => (voice.listening ? voice.stop() : voice.start())}
                  accessibilityLabel={voice.listening ? 'Stop listening' : 'Say the ingredients'}
                  style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: voice.listening ? t.warn : t.accentSoft, borderWidth: 1, borderColor: voice.listening ? t.warn : t.accent }}
                >
                  <Ionicons name={voice.listening ? 'stop' : 'mic'} size={20} color={voice.listening ? '#fff' : t.accent} />
                </Pressable>
              </View>
              {voice.error ? <Txt size={12.5} color={t.warn}>{voice.error}</Txt> : null}
              {reading ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <ActivityIndicator color={t.accent} />
                  <Txt size={13.5} color={t.muted}>Reading ingredients…</Txt>
                </View>
              ) : (
                <GhostButton label="Add these ingredients" onPress={() => addDescribed(describeText)} disabled={!describeText.trim()} />
              )}
            </View>
          ) : null}
          {note ? <Txt size={13} weight="bodyBold" color={t.muted}>{note}</Txt> : null}
        </View>

        {d.items.length ? (
          <Card style={{ gap: 10 }}>
            <Eyebrow>Per serving · {perLabel}</Eyebrow>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              {([['kcal', 'kcal', t.ink], ['p', 'protein g', t.protein], ['c', 'carbs g', t.carbs], ['f', 'fat g', t.fat]] as const).map(([k, label, color]) => (
                <View key={k} style={{ alignItems: 'center', flex: 1 }}>
                  <Txt weight="display" size={21} color={color} style={num}>{k === 'kcal' ? r0(totals.perServing[k]) : fmt(Math.round(totals.perServing[k] * 10) / 10)}</Txt>
                  <Txt size={11.5} color={t.muted}>{label}</Txt>
                </View>
              ))}
            </View>
            <Txt size={12.5} color={t.faint} style={num}>
              Whole recipe: {int(totals.total.kcal)} kcal · P {r0(totals.total.p)} g · C {r0(carbsShown(totals.total, store.profile.netCarbs))} g · F {r0(totals.total.f)} g · {r0(totals.totalG)} g{d.cookedG ? ' cooked' : ''}
            </Txt>
          </Card>
        ) : null}
        {err ? <Txt size={14} weight="bodyBold" color={t.warn}>{err}</Txt> : null}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: kb ? kb + 12 : insets.bottom + 12, borderTopWidth: 1, borderTopColor: t.line }}>
        {editing ? (
          <GhostButton
            label={confirmDelete ? 'Tap to confirm' : 'Delete'}
            color={t.warn}
            onPress={() => {
              if (!confirmDelete) return setConfirmDelete(true);
              store.deleteFood(d.id!);
              nav.toast('Recipe deleted');
              nav.done();
            }}
          />
        ) : null}
        <PrimaryButton label={editing ? 'Save changes' : 'Save recipe'} onPress={save} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
