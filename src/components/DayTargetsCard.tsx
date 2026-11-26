import { useState } from 'react';
import { View } from 'react-native';
import { useNav } from '../nav';
import { Targets, useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Chip, Eyebrow, Field, GhostButton, PrimaryButton, Txt } from '../ui';
import { WEEKDAYS } from '../targets';
import { r0 } from '../util';

const parse = (s: string) => parseFloat(s.replace(',', '.'));
const FIELDS: [keyof Targets, string][] = [['kcal', 'Calories (kcal)'], ['p', 'Protein (g)'], ['c', 'Carbs (g)'], ['f', 'Fat (g)']];
const asText = (t: Targets) => ({ kcal: String(r0(t.kcal)), p: String(r0(t.p)), c: String(r0(t.c)), f: String(r0(t.f)) });

/** Different targets on some weekdays, such as training days. */
export function DayTargetsCard() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const { targets, dayTargets } = store.profile;
  const [days, setDays] = useState<string[]>([]);
  const [form, setForm] = useState(asText(targets));

  const own = Object.keys(dayTargets ?? {});
  const toggle = (day: string) => {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    // The first day picked fills the boxes with what it has now
    if (!days.length && next.length) setForm(asText(dayTargets?.[day] ?? targets));
    setDays(next);
  };
  const names = WEEKDAYS.filter(([k]) => days.includes(k)).map(([, n]) => n).join(', ');

  const save = () => {
    const kcal = parse(form.kcal);
    if (!(kcal > 0)) return nav.toast('Enter a calorie target above 0');
    const value: Targets = { kcal, p: parse(form.p) || 0, c: parse(form.c) || 0, f: parse(form.f) || 0 };
    store.setProfile({ dayTargets: { ...dayTargets, ...Object.fromEntries(days.map((d) => [d, value])) } });
    nav.toast(`Saved for ${names}`);
    setDays([]);
  };
  const reset = () => {
    const left = Object.fromEntries(Object.entries(dayTargets ?? {}).filter(([k]) => !days.includes(k)));
    store.setProfile({ dayTargets: Object.keys(left).length ? left : undefined });
    nav.toast(`${names} use your usual targets`);
    setDays([]);
  };

  return (
    <Card style={{ gap: 12 }}>
      <Eyebrow inline>Different days</Eyebrow>
      <Txt size={13.5} color={t.muted}>
        Pick the days that need their own numbers, such as training days. A dot marks days that have them.
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {WEEKDAYS.map(([key, name]) => (
          <Chip key={key} label={own.includes(key) ? `${name} •` : name} active={days.includes(key)} onPress={() => toggle(key)} />
        ))}
      </View>
      {days.length ? (
        <>
          {[0, 2].map((from) => (
            <View key={from} style={{ flexDirection: 'row', gap: 10 }}>
              {FIELDS.slice(from, from + 2).map(([k, label]) => (
                <Field key={k} label={label} value={form[k]} onChangeText={(v) => setForm((f) => ({ ...f, [k]: v }))} keyboardType="number-pad" selectTextOnFocus />
              ))}
            </View>
          ))}
          <PrimaryButton label={`Save for ${names}`} onPress={save} />
          {days.some((d) => own.includes(d)) ? <GhostButton label="Use usual targets" onPress={reset} /> : null}
        </>
      ) : own.length ? (
        <View style={{ gap: 4 }}>
          {WEEKDAYS.filter(([k]) => dayTargets?.[k]).map(([k, name]) => (
            <Txt key={k} size={13} color={t.muted}>
              {name}: {r0(dayTargets![k]!.kcal)} kcal · P {r0(dayTargets![k]!.p)} · C {r0(dayTargets![k]!.c)} · F {r0(dayTargets![k]!.f)}
            </Txt>
          ))}
        </View>
      ) : null}
    </Card>
  );
}
