import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useDeferredValue, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FoodRow } from '../components/FoodRow';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { sections } from '../foodIndex/sections';
import { FOOD_COUNT } from '../foodIndex/foodCount';
import { useFoodSearch } from '../foodIndex/useFoodSearch';
import { buildPersonalIndex, getUsdaIndex, Scope, searchFoods, toFood } from '../foodSearch';
import { BUILTIN, Food, MEALS, sum } from '../foods';
import { searchOnline } from '../lookup';
import { useNav } from '../nav';
import { orderOnline } from '../onlineOrder';
import { addedSummary, QuickAmount, quickAmount } from '../quickAdd';
import { addingDay } from '../repeat';
import { normalize } from '../search';
import { SavedMeal, useStore } from '../store';
import { fonts, useTheme } from '../theme';
import { Chip, GhostButton, num, PrimaryButton, Slash, Txt } from '../ui';
import { r0, today } from '../util';

type Row =
  | { type: 'header'; key: string; title: string; note?: string }
  | { type: 'food'; key: string; food: Food; matched?: Set<string> }
  | { type: 'meal'; key: string; meal: SavedMeal }
  | { type: 'empty'; key: string; text: string; suggestion?: string | null }
  | { type: 'online'; key: string }
  | { type: 'searching'; key: string; text: string }
  | { type: 'notice'; key: string; text: string }
  | { type: 'create'; key: string }
  | { type: 'import'; key: string };

const NO_MEALS: SavedMeal[] = [];

type Online = { status: 'idle' } | { status: 'loading'; q: string } | { status: 'done'; q: string; foods: Food[]; failed: string[] } | { status: 'error'; q: string };

export default function AddFood() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const meal = nav.payload('add')?.meal ?? 'snacks';
  // Picking an ingredient for a recipe instead of logging to the diary
  const pick = !!nav.payload('add')?.pick;
  const mealLabel = MEALS.find((m) => m[0] === meal)?.[1] ?? 'Snacks';

  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [online, setOnline] = useState<Online>({ status: 'idle' });
  const query = useDeferredValue(q);
  // Your own lists are re-read only as you type, so adding a food never moves a row under your finger
  const { custom, recent, favorites } = useMemo(
    () => ({ custom: store.profile.customFoods, recent: store.recentFoods(), favorites: store.profile.favorites }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, scope],
  );
  // Foods logged with + during this visit, newest last
  const [added, setAdded] = useState<{ id: string; date: string; kcal: number }[]>([]);
  const savedMeals = pick ? NO_MEALS : store.profile.meals;

  const personal = useMemo(() => buildPersonalIndex(custom, recent, scope, favorites), [custom, recent, scope, favorites]);
  // Saved meals match when every word of the query appears in the meal name or its foods
  const mealHits = useMemo(() => {
    const words = normalize(query).split(' ').filter(Boolean);
    if (!words.length || scope === 'recent' || scope === 'custom') return [];
    return savedMeals.filter((m) => {
      const hay = normalize(`${m.name} ${m.items.map((i) => i.name).join(' ')}`);
      return words.every((w) => hay.includes(w));
    });
  }, [query, savedMeals, scope]);
  const hits = useMemo(() => (query.trim() ? searchFoods(query, personal, scope) : []), [query, personal, scope]);
  const completions = useMemo(() => (query.trim() && scope === 'all' ? getUsdaIndex().complete(query, hits.filter((h) => h.doc.item.kind === 'usda')) : []), [query, hits, scope]);
  const suggestion = useMemo(() => (query.trim().length > 2 && hits.length === 0 ? getUsdaIndex().didYouMean(query) : null), [query, hits]);

  const onlineForQuery = online.status !== 'idle' && online.q === query.trim() ? online : null;

  const { server, local, preparing, unavailable, hold } = useFoodSearch(query, scope === 'all');
  // Results from the food index, split into sections; null when this screen works from the phone alone
  const indexed = useMemo(() => {
    if (server.status === 'off' || scope !== 'all' || !query.trim()) return null;
    const matched = new Map<string, Set<string>>();
    const yours: Food[] = [];
    const device: Food[] = [];
    hits.forEach((h) => {
      const food = toFood(h.doc.item);
      matched.set(food.id, h.matched);
      const mine = h.doc.item.kind === 'food' && (food.src !== 'builtin' || store.isFavorite(food));
      (mine ? yours : device).push(food);
    });
    return { ...sections({ query, yours, device, curated: BUILTIN, server }), matched };
  }, [server, scope, query, hits, store]);

  const rows: Row[] = useMemo(() => {
    const r: Row[] = [];
    const trimmed = query.trim();
    if (!trimmed) {
      if (scope === 'custom') {
        if (custom.length) custom.forEach((f) => r.push({ type: 'food', key: f.id, food: { ...f, src: 'custom' } }));
        else r.push({ type: 'empty', key: 'e', text: 'You have no saved foods yet. Scan a barcode or create a food and it will show up here.' });
      } else if (scope === 'saved') {
        if (!pick) r.push({ type: 'import', key: 'import' });
        if (savedMeals.length) {
          r.push({ type: 'header', key: 'h-m', title: 'Saved meals' });
          savedMeals.forEach((m) => r.push({ type: 'meal', key: 'm' + m.id, meal: m }));
        }
        if (favorites.length) {
          r.push({ type: 'header', key: 'h-f', title: 'Favorites' });
          favorites.forEach((f) => r.push({ type: 'food', key: 'f' + f.id + f.name, food: f }));
        }
        if (!savedMeals.length && !favorites.length) r.push({ type: 'empty', key: 'e', text: 'Tap the star on a food to make it a favorite, or tap Save meal on a diary meal to log the whole thing in one tap.' });
      } else {
        if (scope === 'all' && savedMeals.length) {
          r.push({ type: 'header', key: 'h-m', title: 'Saved meals' });
          savedMeals.slice(0, 3).forEach((m) => r.push({ type: 'meal', key: 'm' + m.id, meal: m }));
        }
        if (scope === 'all' && favorites.length) {
          r.push({ type: 'header', key: 'h-f', title: 'Favorites' });
          favorites.slice(0, 8).forEach((f) => r.push({ type: 'food', key: 'f' + f.id + f.name, food: f }));
        }
        if (recent.length) {
          r.push({ type: 'header', key: 'h-r', title: 'Recent' });
          recent.forEach((f) => r.push({ type: 'food', key: 'r' + f.id + f.name, food: f }));
        } else if (scope === 'recent') {
          r.push({ type: 'empty', key: 'e', text: 'Foods you log will show up here for quick re-adding.' });
        }
        if (scope === 'all') {
          r.push({ type: 'header', key: 'h-c', title: 'Common foods', note: `Type to search ${FOOD_COUNT} foods` });
          BUILTIN.forEach((f) => r.push({ type: 'food', key: f.id, food: f }));
        }
      }
      r.push({ type: 'create', key: 'create' });
      return r;
    }
    if (scope === 'all' && preparing) {
      r.push({ type: 'searching', key: 'preparing', text: 'Setting up the food database. This happens once.' });
    } else if (scope === 'all' && unavailable) {
      r.push({ type: 'notice', key: 'unavailable', text: 'The full food database couldn’t be set up. Free up about 400 MB of space, then open this screen again.' });
    }
    const onlineRows = () => {
      r.push({ type: 'online', key: 'online' });
      if (onlineForQuery?.status === 'done') orderOnline(trimmed, onlineForQuery.foods).forEach((f) => r.push({ type: 'food', key: 'o' + f.id, food: f }));
    };
    if (!indexed && scope === 'all' && onlineForQuery) onlineRows();
    if (mealHits.length) {
      r.push({ type: 'header', key: 'h-m', title: 'Saved meals' });
      mealHits.forEach((m) => r.push({ type: 'meal', key: 'm' + m.id, meal: m }));
      if (hits.length && !indexed) r.push({ type: 'header', key: 'h-foods', title: 'Foods' });
    }
    if (indexed) {
      if (indexed.offline) {
        r.push({ type: 'notice', key: 'offline', text: local ? 'That search didn’t work. Showing basic foods.' : 'Food search is offline. Showing foods on this phone.' });
      }
      const group = (key: string, title: string, foods: Food[], note?: string) => {
        if (!foods.length) return;
        r.push({ type: 'header', key: 'h-' + key, title, note });
        foods.forEach((f) => r.push({ type: 'food', key: `${key}:${f.id}:${f.name}`, food: f, matched: indexed.matched.get(f.id) }));
      };
      group('yours', 'Your foods', indexed.yours);
      group('best', 'Best matches', indexed.best, indexed.corrected ? `Showing results for “${indexed.corrected}”` : undefined);
      group('close', 'Close matches', indexed.close);
      const waiting = server.status === 'waiting';
      const found = indexed.yours.length + indexed.best.length + indexed.close.length + mealHits.length;
      if (indexed.searching) r.push({ type: 'searching', key: 'searching', text: 'Searching…' });
      if (!found && !waiting) r.push({ type: 'empty', key: 'e', text: `No matches for “${trimmed}”.`, suggestion });
      // The database on the phone can't have everything, so the online search stays within reach
      if (indexed.offline || (!waiting && (local || !found))) onlineRows();
      r.push({ type: 'create', key: 'create' });
      return r;
    }
    if (hits.length) {
      hits.forEach((h) => r.push({ type: 'food', key: h.doc.key, food: toFood(h.doc.item), matched: h.matched }));
    } else if (!mealHits.length) {
      r.push({ type: 'empty', key: 'e', text: `No matches for “${trimmed}”${scope !== 'all' ? ' in this list' : ''}.`, suggestion });
    }
    if (scope === 'all' && !onlineForQuery) onlineRows();
    r.push({ type: 'create', key: 'create' });
    return r;
  }, [query, hits, scope, custom, recent, suggestion, onlineForQuery, favorites, savedMeals, mealHits, pick, indexed, server.status, local, preparing, unavailable]);

  const runOnline = async () => {
    const term = query.trim();
    if (!term) return;
    setOnline({ status: 'loading', q: term });
    try {
      const res = await searchOnline(term, store.profile.usdaKey);
      setOnline(res.failed.length === 2 ? { status: 'error', q: term } : { status: 'done', q: term, foods: res.foods, failed: res.failed });
    } catch {
      setOnline({ status: 'error', q: term });
    }
  };

  const open = (food: Food) => nav.go({ type: 'detail', food, mode: pick ? 'pick' : 'add', meal });
  const quickAdd = (food: Food, amount: QuickAmount) => {
    const date = addingDay(nav.date, today());
    if (food.src === 'online') store.saveFood(food); // keep it in My foods for next time
    const id = store.addEntry(date, food, amount.grams, meal, amount.portion);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setAdded((list) => [...list, { id, date, kcal: amount.kcal }]);
  };
  const undo = () => {
    const last = added[added.length - 1];
    if (!last) return;
    store.removeEntry(last.date, last.id);
    setAdded((list) => list.slice(0, -1));
  };
  const summary = addedSummary(added);
  const logMeal = (m: SavedMeal) => {
    const ids = store.logSavedMeal(nav.date, m.id, meal);
    if (!ids.length) return;
    nav.toast(`${m.name} added to ${mealLabel}`);
    nav.done();
  };

  const renderRow = ({ item }: { item: Row }) => {
    switch (item.type) {
      case 'header':
        return (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingTop: 16, paddingBottom: 4, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Slash color={t.grad1} />
              <Txt weight="displaySemi" size={14}>{item.title}</Txt>
            </View>
            {item.note ? <Txt size={12} color={t.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{item.note}</Txt> : null}
          </View>
        );
      case 'food':
      {
        // Ingredients are measured on the next screen, so recipes have no one-tap add
        const quick = pick ? undefined : quickAmount(store.days, item.food);
        return (
          <FoodRow
            food={item.food}
            matched={item.matched}
            starred={store.isFavorite(item.food)}
            onPress={() => open(item.food)}
            quick={quick}
            onQuickAdd={quick ? () => quickAdd(item.food, quick) : undefined}
          />
        );
      }
      case 'meal': {
        const m = item.meal;
        const tot = sum(m.items);
        return (
          <Pressable
            onPress={() => logMeal(m)}
            accessibilityRole="button"
            accessibilityLabel={`Log saved meal ${m.name}, ${r0(tot.kcal)} calories`}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 12, backgroundColor: pressed ? t.surface2 : 'transparent', borderRadius: 10 })}
          >
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="albums" size={18} color={t.accent} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt size={15} weight="bodyBold" numberOfLines={1}>{m.name}</Txt>
              <Txt size={12.5} color={t.muted} numberOfLines={1}>{m.items.length} {m.items.length === 1 ? 'item' : 'items'} · {m.items.map((x) => x.name).join(', ')}</Txt>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Txt weight="bodyHeavy" size={15} style={num}>{r0(tot.kcal)}</Txt>
              <Txt size={11} color={t.accent} weight="bodyBold">Tap to log</Txt>
            </View>
          </Pressable>
        );
      }
      case 'empty':
        return (
          <View style={{ paddingVertical: 18, paddingHorizontal: 4, gap: 10 }}>
            <Txt size={14.5} color={t.muted}>{item.text}</Txt>
            {item.suggestion ? (
              <Pressable onPress={() => setQ(item.suggestion!)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Txt size={14.5} color={t.muted}>Did you mean</Txt>
                <Txt size={14.5} weight="bodyHeavy" color={t.accent}>{item.suggestion}</Txt>
                <Txt size={14.5} color={t.muted}>?</Txt>
              </Pressable>
            ) : null}
          </View>
        );
      case 'online': {
        const st = onlineForQuery;
        return (
          <View style={{ marginTop: 10, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.line, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
              <Ionicons name="globe-outline" size={16} color={t.accent} />
              <Txt weight="displaySemi" size={14} style={{ flex: 1 }}>Online databases</Txt>
            </View>
            {!st ? (
              <GhostButton label={`Search online for “${query.trim()}”`} onPress={runOnline} color={t.accent} />
            ) : st.status === 'loading' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
                <ActivityIndicator color={t.accent} />
                <Txt size={14} color={t.muted}>Searching USDA and Open Food Facts…</Txt>
              </View>
            ) : st.status === 'error' ? (
              <View style={{ gap: 8, paddingHorizontal: 4 }}>
                <Txt size={14} color={t.muted}>Couldn’t reach the online databases. Check your connection and try again.</Txt>
                <GhostButton label="Try again" onPress={runOnline} />
              </View>
            ) : st.foods.length === 0 ? (
              <Txt size={14} color={t.muted} style={{ paddingHorizontal: 4 }}>Nothing found online either. You can create it as your own food below.</Txt>
            ) : (
              <Txt size={12.5} color={t.faint} style={{ paddingHorizontal: 4 }}>
                {st.foods.length} results from USDA and Open Food Facts{st.failed.length ? ' (one source didn’t respond)' : ''}. Foods you log are saved to My foods.
              </Txt>
            )}
          </View>
        );
      }
      case 'searching':
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 }}>
            <ActivityIndicator color={t.accent} />
            <Txt size={14} color={t.muted}>{item.text}</Txt>
          </View>
        );
      case 'notice':
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.surface2, borderRadius: 12, padding: 10, marginTop: 8 }}>
            <Ionicons name="cloud-offline-outline" size={16} color={t.muted} />
            <Txt size={13} color={t.muted} style={{ flex: 1 }}>{item.text}</Txt>
          </View>
        );
      case 'import':
        return (
          <Pressable onPress={() => nav.go({ type: 'importMeal' }, { replace: true })} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}>
            <Ionicons name="download-outline" size={18} color={t.accent} />
            <Txt size={14} weight="bodyBold" color={t.accent} style={{ flex: 1 }}>Import a meal a friend shared</Txt>
            <Ionicons name="chevron-forward" size={16} color={t.faint} />
          </Pressable>
        );
      case 'create':
        return (
          <Pressable onPress={() => nav.go({ type: 'form', prefill: query.trim() ? { name: query.trim() } : undefined, returnMeal: meal, pick })} style={{ paddingVertical: 20, alignItems: 'center' }}>
            <Txt color={t.muted} size={14}>
              Can’t find it? <Txt weight="bodyBold" color={t.accent} size={14}>Create a custom food</Txt>
            </Txt>
          </Pressable>
        );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title={pick ? 'Add ingredient' : `Add to ${mealLabel}`} onClose={pick ? nav.backToRecipe : nav.done} />
      <View style={{ paddingHorizontal: 16, paddingTop: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: q ? t.accent : t.line, backgroundColor: t.surface, borderRadius: 14, paddingHorizontal: 12 }}>
            <Ionicons name="search" size={18} color={q ? t.accent : t.faint} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search foods, e.g. spaghetti, eggs"
              placeholderTextColor={t.faint}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (scope === 'all' && !onlineForQuery && (!indexed || indexed.offline)) runOnline();
              }}
              submitBehavior="submit"
              style={{ flex: 1, color: t.ink, fontFamily: fonts.bodySemi, fontSize: 16, paddingVertical: 12 }}
            />
            {q ? (
              <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={t.faint} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            accessibilityLabel="Scan a barcode"
            onPress={() => nav.go({ type: 'scan', meal, pick }, { replace: true })}
            style={({ pressed }) => ({ width: 50, borderRadius: 14, borderWidth: 1, borderColor: t.accent, backgroundColor: pressed ? t.surface2 : t.accentSoft, alignItems: 'center', justifyContent: 'center' })}
          >
            <Ionicons name="barcode-outline" size={24} color={t.accent} />
          </Pressable>
        </View>

        {!q && !pick ? (
          // The whole meal at once: from a photo, or in words
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([
              ['camera', 'Photo of meal', () => nav.go({ type: 'photo', meal }, { replace: true })],
              ['sparkles', 'Describe meal', () => nav.go({ type: 'assistant', meal }, { replace: true })],
            ] as const).map(([icon, label, onPress]) => (
              <Pressable
                key={label}
                onPress={onPress}
                accessibilityRole="button"
                style={({ pressed }) => ({ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: pressed ? t.surface2 : t.surface, paddingVertical: 11, paddingHorizontal: 8 })}
              >
                <Ionicons name={icon} size={17} color={t.accent} />
                <Txt size={14} weight="bodyBold" color={t.accent} numberOfLines={1} style={{ flexShrink: 1 }}>{label}</Txt>
              </Pressable>
            ))}
          </View>
        ) : null}
        {!q && !pick ? (
          <Pressable
            onPress={() => nav.go({ type: 'quick', meal }, { replace: true })}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: pressed ? t.surface2 : t.surface, paddingVertical: 11, paddingHorizontal: 12, marginTop: -4 })}
          >
            <Ionicons name="flash" size={17} color={t.accent} />
            <Txt size={14} weight="bodyBold" color={t.accent} style={{ flex: 1 }}>Quick add calories</Txt>
            <Ionicons name="chevron-forward" size={16} color={t.faint} />
          </Pressable>
        ) : null}
        {completions.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 8 }}>
            {completions.map((c) => (
              <Pressable
                key={c}
                onPress={() => setQ(c + ' ')}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 12, backgroundColor: pressed ? t.surface2 : t.accentSoft })}
              >
                <Ionicons name="search" size={13} color={t.accent} />
                <Txt size={13.5} weight="bodyBold" color={t.accent}>{c}</Txt>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="All" active={scope === 'all'} onPress={() => setScope('all')} />
            <Chip label="Saved" active={scope === 'saved'} onPress={() => setScope('saved')} />
            <Chip label="Recent" active={scope === 'recent'} onPress={() => setScope('recent')} />
            <Chip label="My foods" active={scope === 'custom'} onPress={() => setScope('custom')} />
          </View>
        )}
      </View>
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // Search results wait until the finger lifts, so a row never moves under a tap
        onTouchStart={() => hold(true)}
        onTouchEnd={() => hold(false)}
        onTouchCancel={() => hold(false)}
        onScrollBeginDrag={() => hold(true)}
        onScrollEndDrag={() => hold(false)}
        onMomentumScrollEnd={() => hold(false)}
        initialNumToRender={14}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: summary ? 24 : (kb || insets.bottom) + 24 }}
      />
      {summary ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12, paddingBottom: kb ? kb + 12 : insets.bottom + 12, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.grad2 }}>
          <View style={{ flex: 1 }} accessibilityLiveRegion="polite">
            <Txt weight="displaySemi" size={15} style={num}>{summary}</Txt>
            <Txt size={12} color={t.muted}>to {mealLabel}</Txt>
          </View>
          <GhostButton label="Undo" onPress={undo} />
          <PrimaryButton label="Done" onPress={nav.done} style={{ minWidth: 100 }} />
        </View>
      ) : null}
    </View>
  );
}
