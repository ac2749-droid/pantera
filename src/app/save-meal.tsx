import Ionicons from '@expo/vector-icons/Ionicons';
import { Macros } from '../components/Macros';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { amountLabel } from '../components/helpers';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { MEALS, sum } from '../foods';
import { useNav } from '../nav';
import { useStore } from '../store';
import { carbsShown } from '../targets';
import { useTheme } from '../theme';
import { Card, Field, num, PrimaryButton, Txt } from '../ui';
import { int, r0 } from '../util';

export default function SaveMeal() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const p = nav.payload('saveMeal');
  const mealLabel = MEALS.find((m) => m[0] === p?.meal)?.[1] ?? 'Meal';
  const entries = p ? store.entriesFor(p.date).filter((e) => e.meal === p.meal && !e.sample) : [];
  const [name, setName] = useState(() => {
    // Suggest a name from the biggest items, e.g. "Oatmeal & banana"
    const short = (n: string) => (n.length > 26 ? n.split(',')[0] : n).replace(/\s*\(.*\)$/, '');
    const top = [...entries].sort((a, b) => b.n.kcal - a.n.kcal).map((e) => short(e.name));
    if (!top.length) return `My ${mealLabel.toLowerCase()}`;
    if (top.length === 1) return top[0];
    const two = `${top[0]} & ${top[1]}`;
    return two.length <= 40 ? two + (top.length > 2 ? ' +' : '') : `${top[0]} & more`;
  });
  const [picked, setPicked] = useState<Set<string>>(() => new Set(entries.map((e) => e.id)));
  const chosen = entries.filter((e) => picked.has(e.id));
  const tot = sum(chosen);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = () => {
    if (!chosen.length) return;
    store.saveMeal(name.trim() || `My ${mealLabel.toLowerCase()}`, chosen);
    nav.toast('Meal saved. Find it under Saved in Add food.');
    nav.done();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Save meal" onClose={nav.done} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <Txt size={13.5} color={t.muted}>Save these foods together so you can log them again in one tap from Add food.</Txt>
        <Field label="Meal name" value={name} onChangeText={setName} maxLength={50} placeholder="e.g. Usual breakfast" selectTextOnFocus />
        {entries.length === 0 ? (
          <Card>
            <Txt size={14} color={t.muted}>There’s nothing logged in this meal yet.</Txt>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {entries.map((e, i) => {
              const on = picked.has(e.id);
              return (
                <Pressable
                  key={e.id}
                  onPress={() => toggle(e.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent', opacity: on ? 1 : 0.55 })}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? t.accent : t.faint} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="bodyBold" size={15}>{e.name}</Txt>
                    <Txt size={12.5} color={t.muted}>{amountLabel(e)}</Txt>
                    <Macros n={e.n} />
                  </View>
                  <Txt weight="bodyHeavy" size={14} style={num}>{r0(e.n.kcal)}</Txt>
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: kb ? kb + 12 : insets.bottom + 12, borderTopWidth: 1, borderTopColor: t.line, gap: 8 }}>
        <Txt size={13} color={t.muted} style={[num, { textAlign: 'center' }]}>
          {chosen.length} {chosen.length === 1 ? 'item' : 'items'} · {int(tot.kcal)} kcal · P {r0(tot.p)} · C {r0(carbsShown(tot, store.profile.netCarbs))} · F {r0(tot.f)}
        </Txt>
        <PrimaryButton label="Save meal" onPress={save} disabled={!chosen.length} />
      </View>
    </View>
  );
}
