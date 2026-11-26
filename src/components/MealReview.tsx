/**
 * The "here's what I found" card shared by the Assistant and photo logging: check each food,
 * change its amount, swap or remove it, add one that was missed, then log everything at once.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ResultItem, searchFoods, toFood } from '../foodSearch';
import { Food, MealKey, MEALS, Portion, portionsOf } from '../foods';
import type { MealItem } from '../meal';
import { itemFromFood, swapFood } from '../meal/resolve';
import { SearchIndex } from '../search';
import { useStore } from '../store';
import { fonts, useTheme } from '../theme';
import { Chip, GhostButton, num, PrimaryButton, Txt } from '../ui';
import { dayTitle, int, r0, today } from '../util';
import { Badge } from './FoodRow';
import { Macros } from './Macros';

export type Draft = {
  id: string;
  items: MealItem[];
  meal: MealKey;
  date: string;
  source: 'ai' | 'reader' | 'photo';
  note?: string;
  status: 'open' | 'logged' | 'discarded';
  logged?: { ids: string[]; kcal: number };
};

/** How a screen brings a field in the card into view when it gets the cursor. */
export const RevealField = createContext<(input: TextInput | null) => void>(() => {});

const fmtCount = (n: number) => String(Math.round(n * 100) / 100);
const kcalOf = (it: MealItem) => (it.food ? (it.food.n.kcal * it.grams) / (it.food.g || 1) : 0);
const macro = (it: MealItem, k: 'p' | 'c' | 'f' | 'fib') => (it.food ? (it.food.n[k] * it.grams) / (it.food.g || 1) : 0);
const amountText = (it: MealItem) => {
  if (!it.food) return '';
  if (it.portion.label === '1 g') return `${r0(it.grams)} g`;
  const base = it.count === 1 ? it.portion.label : `${fmtCount(it.count)} × ${it.portion.label}`;
  return /\bg$/.test(it.portion.label) ? base : `${base} · ${r0(it.grams)} g`;
};
const loggableItems = (draft: Draft) => draft.items.filter((i) => i.food && i.grams > 0);

/** Put a draft in the diary, or take it back out again. Both return the draft as it should now show. */
export function useDraftLog() {
  const store = useStore();
  return {
    log: (d: Draft): Draft => {
      const items = loggableItems(d);
      const ids = items.map((i) => store.addEntry(d.date, i.food!, i.grams, d.meal, i.portion.label === '1 g' ? { label: '1 g', g: 1 } : i.portion));
      return { ...d, status: 'logged', logged: { ids, kcal: items.reduce((a, i) => a + kcalOf(i), 0) } };
    },
    undo: (d: Draft): Draft => {
      d.logged?.ids.forEach((id) => store.removeEntry(d.date, id));
      return { ...d, status: 'open', logged: undefined };
    },
  };
}

/** A small search over your foods and the app's database, for picking the right one. */
function FoodPicker({ personal, label, onPick }: { personal: SearchIndex<ResultItem>; label: string; onPick: (f: Food) => void }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const reveal = useContext(RevealField);
  const box = useRef<TextInput>(null);
  const found = useMemo(() => (q.trim().length > 1 ? searchFoods(q, personal, 'all', 6).map((h) => toFood(h.doc.item)) : []), [q, personal]);
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: q ? t.accent : t.line, borderRadius: 12, paddingHorizontal: 10, backgroundColor: t.surface }}>
        <Ionicons name="search" size={15} color={q ? t.accent : t.faint} />
        <TextInput
          ref={box}
          onFocus={() => reveal(box.current)}
          value={q}
          onChangeText={setQ}
          placeholder={label}
          placeholderTextColor={t.faint}
          accessibilityLabel={label}
          autoCorrect={false}
          style={{ flex: 1, paddingVertical: 9, color: t.ink, fontFamily: fonts.bodySemi, fontSize: 14.5 }}
        />
      </View>
      {found.map((f) => (
        <FoodChoice key={f.id + f.name} food={f} icon="add-circle-outline" onPress={() => { setQ(''); onPick(f); }} />
      ))}
      {q.trim().length > 1 && !found.length ? <Txt size={12.5} color={t.muted}>Nothing found. Try a simpler name.</Txt> : null}
    </View>
  );
}

function FoodChoice({ food, icon, onPress }: { food: Food; icon: 'swap-horizontal' | 'add-circle-outline'; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name={icon} size={15} color={t.accent} />
      <Txt size={13.5} color={t.ink} style={{ flex: 1 }} numberOfLines={1}>{food.name}</Txt>
      <Txt size={12} color={t.faint} style={num}>{r0(food.n.kcal)} kcal/{food.serving}</Txt>
    </Pressable>
  );
}

function RemoveButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityLabel="Remove item">
      <Ionicons name="trash-outline" size={16} color={t.warn} />
      <Txt size={13} weight="bodyBold" color={t.warn}>Remove</Txt>
    </Pressable>
  );
}

function ItemEditor({ item, personal, onChange, onRemove }: { item: MealItem; personal: SearchIndex<ResultItem>; onChange: (it: MealItem) => void; onRemove: () => void }) {
  const t = useTheme();
  const food = item.food!;
  const units: Portion[] = useMemo(() => {
    const list = portionsOf(food).filter((p) => !/^\d+(\.\d+)? ?g$/.test(p.label));
    if (item.portion.label !== '1 g' && !list.some((p) => p.label === item.portion.label)) list.unshift(item.portion);
    return [...list, { label: '1 g', g: 1 }];
  }, [food, item.portion]);
  const [text, setText] = useState(fmtCount(item.count));
  const reveal = useContext(RevealField);
  const amount = useRef<TextInput>(null);

  const setCount = (c: number) => {
    const count = Math.max(0, Math.round(c * 100) / 100);
    setText(fmtCount(count));
    onChange({ ...item, count, grams: Math.round(count * item.portion.g * 10) / 10 });
  };
  const setUnit = (p: Portion) => {
    const count = p.label === '1 g' ? Math.round(item.grams) : Math.round((item.grams / p.g) * 4) / 4 || 1;
    setText(fmtCount(count));
    onChange({ ...item, portion: p, count, grams: Math.round(count * p.g * 10) / 10 });
  };
  const step = item.portion.label === '1 g' ? 10 : 0.5;

  return (
    <View style={{ gap: 10, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={() => setCount(item.count - step)} style={{ width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Less">
          <Ionicons name="remove" size={18} color={t.ink} />
        </Pressable>
        <TextInput
          ref={amount}
          onFocus={() => reveal(amount.current)}
          value={text}
          onChangeText={(v) => {
            setText(v);
            const n = parseFloat(v.replace(',', '.'));
            if (n >= 0) onChange({ ...item, count: n, grams: Math.round(n * item.portion.g * 10) / 10 });
          }}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel="Amount"
          style={{ width: 70, textAlign: 'center', borderWidth: 1, borderColor: t.accent, borderRadius: 10, paddingVertical: 7, color: t.ink, fontFamily: fonts.bodyBold, fontSize: 16, backgroundColor: t.surface }}
        />
        <Pressable onPress={() => setCount(item.count + step)} style={{ width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="More">
          <Ionicons name="add" size={18} color={t.ink} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <RemoveButton onPress={onRemove} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {units.map((u) => (
          <Chip key={u.label} label={u.label === '1 g' ? 'grams' : u.label} active={u.label === item.portion.label} onPress={() => setUnit(u)} />
        ))}
      </View>
      <View style={{ gap: 2 }}>
        <Txt size={12} weight="bodyBold" color={t.muted} style={{ marginTop: 4 }}>Not this food?</Txt>
        {item.alternatives.slice(0, 4).map((f: Food) => (
          <FoodChoice key={f.id} food={f} icon="swap-horizontal" onPress={() => onChange(swapFood(item, f))} />
        ))}
        <View style={{ marginTop: 4 }}>
          <FoodPicker personal={personal} label="Search for another food" onPick={(f) => onChange(swapFood(item, f))} />
        </View>
      </View>
    </View>
  );
}

const SOURCE_BADGE = { ai: 'AI', reader: 'BUILT-IN READER', photo: 'FROM PHOTO' } as const;

function sourceLine(item: MealItem, source: Draft['source']) {
  if (!item.said) return 'Added by you';
  return source === 'photo' ? `In the photo: ${item.said}` : `You said: “${item.said}”`;
}

export function DraftCard({ draft, personal, onUpdate, onLog, onUndo }: { draft: Draft; personal: SearchIndex<ResultItem>; onUpdate: (d: Draft) => void; onLog: () => void; onUndo: () => void }) {
  const t = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const loggable = loggableItems(draft);
  const total = loggable.reduce((a, i) => a + kcalOf(i), 0);
  const sumOf = (k: 'p' | 'c' | 'f' | 'fib') => loggable.reduce((a, i) => a + macro(i, k), 0);
  const mealLabel = MEALS.find((m) => m[0] === draft.meal)?.[1] ?? '';
  const change = (next: MealItem) => onUpdate({ ...draft, items: draft.items.map((x) => (x.id === next.id ? next : x)) });
  const remove = (id: string) => {
    setOpen(null);
    onUpdate({ ...draft, items: draft.items.filter((x) => x.id !== id) });
  };

  if (draft.status === 'logged') {
    return (
      <View style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name="checkmark-circle" size={22} color={t.good} />
        <Txt size={14.5} style={{ flex: 1 }}>
          Logged {draft.logged?.ids.length} item{draft.logged?.ids.length === 1 ? '' : 's'} to {mealLabel}
          {draft.date !== today() ? ` (${dayTitle(draft.date).toLowerCase()})` : ''} · <Txt weight="bodyHeavy" size={14.5}>{int(draft.logged?.kcal ?? 0)} kcal</Txt>
        </Txt>
        <Txt size={14} weight="bodyBold" color={t.accent} onPress={onUndo} suppressHighlighting>Undo</Txt>
      </View>
    );
  }
  if (draft.status === 'discarded') {
    return <Txt size={13.5} color={t.faint}>Discarded.</Txt>;
  }

  return (
    <View style={{ backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 16, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, paddingBottom: 6 }}>
        <Txt weight="displaySemi" size={16}>Here’s what I found</Txt>
        <Badge label={SOURCE_BADGE[draft.source]} tone={draft.source === 'reader' ? 'muted' : 'accent'} />
      </View>
      {draft.note ? <Txt size={12.5} color={t.muted} style={{ paddingHorizontal: 14, paddingBottom: 4 }}>{draft.note}</Txt> : null}
      {draft.items.map((it) => {
        const expanded = open === it.id;
        return (
          <View key={it.id} style={{ borderTopWidth: 1, borderTopColor: t.line, paddingHorizontal: 14, paddingVertical: 11 }}>
            <Pressable onPress={() => setOpen(expanded ? null : it.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} accessibilityHint="Tap to change the amount or food">
              <View style={{ flex: 1, gap: 2 }}>
                {it.food ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Txt weight="bodyBold" size={14.5} numberOfLines={2} style={{ flexShrink: 1 }}>{it.food.name}</Txt>
                      {it.confidence === 'check' ? <Badge label="CHECK" /> : null}
                    </View>
                    <Txt size={12.5} color={t.muted}>{amountText(it)}</Txt>
                    <Txt size={11.5} color={t.faint} numberOfLines={1}>{sourceLine(it, draft.source)}</Txt>
                  </>
                ) : (
                  <>
                    <Txt weight="bodyBold" size={14.5} color={t.warn}>Couldn’t find “{it.query}”</Txt>
                    <Txt size={12.5} color={t.muted}>Tap to search for it, or remove it.</Txt>
                  </>
                )}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {it.food ? <Txt weight="bodyHeavy" size={15} style={num}>{r0(kcalOf(it))}</Txt> : null}
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={t.faint} />
              </View>
            </Pressable>
            {expanded && it.food ? <ItemEditor key={it.food.id} item={it} personal={personal} onChange={change} onRemove={() => remove(it.id)} /> : null}
            {expanded && !it.food ? (
              <View style={{ gap: 10, paddingTop: 10 }}>
                <FoodPicker personal={personal} label="Search for this food" onPick={(f) => change(swapFood(it, f))} />
                <View style={{ alignSelf: 'flex-end' }}>
                  <RemoveButton onPress={() => remove(it.id)} />
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
      <View style={{ borderTopWidth: 1, borderTopColor: t.line, paddingHorizontal: 14, paddingVertical: 11, gap: 8 }}>
        <Pressable onPress={() => setAdding((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessibilityRole="button">
          <Ionicons name={adding ? 'close' : 'add'} size={17} color={t.accent} />
          <Txt size={13.5} weight="bodyBold" color={t.accent}>{adding ? 'Cancel adding' : 'Add a food it missed'}</Txt>
        </Pressable>
        {adding ? (
          <FoodPicker
            personal={personal}
            label="Search foods to add"
            onPick={(f) => {
              const item = itemFromFood(f);
              setAdding(false);
              setOpen(item.id); // open it so the amount can be set
              onUpdate({ ...draft, items: [...draft.items, item] });
            }}
          />
        ) : null}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: t.line, padding: 14, gap: 12, backgroundColor: t.surface2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Txt weight="bodyBold" size={14} color={t.muted}>Total</Txt>
          <Txt weight="display" size={20} style={num}>{int(total)} kcal</Txt>
        </View>
        <Macros n={{ p: sumOf('p'), c: sumOf('c'), f: sumOf('f'), fib: sumOf('fib') }} size={13} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {MEALS.map(([k, l]) => (
            <Chip key={k} label={l} active={draft.meal === k} onPress={() => onUpdate({ ...draft, meal: k })} />
          ))}
        </View>
        {draft.date !== today() ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="calendar-outline" size={14} color={t.muted} />
            <Txt size={13} color={t.muted}>Logging to {dayTitle(draft.date)}</Txt>
            <Txt size={13} weight="bodyBold" color={t.accent} onPress={() => onUpdate({ ...draft, date: today() })} suppressHighlighting>  Use today</Txt>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GhostButton label="Discard" onPress={() => onUpdate({ ...draft, status: 'discarded' })} />
          <PrimaryButton label={loggable.length ? `Log ${loggable.length} item${loggable.length === 1 ? '' : 's'} to ${mealLabel}` : 'Nothing to log'} onPress={onLog} disabled={!loggable.length} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}
