import { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import { DayTargetsCard } from '../../components/DayTargetsCard';
import { Screen } from '../../components/Screen';
import { SmartTargetCard } from '../../components/SmartTargetCard';
import { useNav } from '../../nav';
import { CalcInputs, useStore } from '../../store';
import { useTheme } from '../../theme';
import { Card, Chip, Eyebrow, Field, GhostButton, num, PrimaryButton, Txt } from '../../ui';
import { int, r0 } from '../../util';

const ACTIVITY: [number, string][] = [
  [1.2, 'Mostly sitting'],
  [1.375, 'Light 1–3×/wk'],
  [1.55, 'Moderate 3–5×/wk'],
  [1.725, 'Hard 6–7×/wk'],
  [1.9, 'Athlete'],
];
const GOALS: [number, string][] = [
  [-500, 'Lose 1 lb/wk'],
  [-250, 'Lose slowly'],
  [0, 'Maintain'],
  [250, 'Gain slowly'],
];

const parse = (s: string) => parseFloat(s.replace(',', '.'));

// Re-mount the form when targets change (e.g. after applying a smart target) so the fields refresh
export default function TargetsTab() {
  const T = useStore().profile.targets;
  return <Targets key={`${T.kcal}-${T.p}-${T.c}-${T.f}`} />;
}

function Targets() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const T = store.profile.targets;
  const c = store.profile.calc;

  const [kcal, setKcal] = useState(String(r0(T.kcal)));
  const [p, setP] = useState(String(r0(T.p)));
  const [cb, setC] = useState(String(r0(T.c)));
  const [f, setF] = useState(String(r0(T.f)));

  const [units, setUnits] = useState<'us' | 'metric'>('us');
  const [sex, setSex] = useState<'male' | 'female'>(c?.sex ?? 'male');
  const [age, setAge] = useState(c ? String(c.age) : '30');
  const [ft, setFt] = useState(c ? String(Math.floor(c.height / 2.54 / 12)) : '5');
  const [inch, setIn] = useState(c ? String(r0((c.height / 2.54) % 12)) : '10');
  const [cm, setCm] = useState(c ? String(r0(c.height)) : '178');
  const [lb, setLb] = useState(c ? String(r0(c.weight / 0.4536)) : '170');
  const [kg, setKg] = useState(c ? String(r0(c.weight)) : '77');
  const [activity, setActivity] = useState(c?.activity ?? 1.55);
  const [goal, setGoal] = useState(c?.goal ?? 0);

  const macroKcal = (parse(p) || 0) * 4 + (parse(cb) || 0) * 4 + (parse(f) || 0) * 9;

  const calc = useMemo(() => {
    const a = parse(age);
    const h = units === 'us' ? ((parse(ft) || 0) * 12 + (parse(inch) || 0)) * 2.54 : parse(cm);
    const w = units === 'us' ? parse(lb) * 0.4536 : parse(kg);
    if (!(a > 0 && h > 0 && w > 0)) return null;
    const bmr = 10 * w + 6.25 * h - 5 * a + (sex === 'male' ? 5 : -161);
    const tdee = bmr * activity;
    const inputs: CalcInputs = { sex, age: a, height: h, weight: w, activity, goal };
    return { tdee, target: Math.max(1200, Math.round((tdee + goal) / 10) * 10), inputs };
  }, [age, ft, inch, cm, lb, kg, units, sex, activity, goal]);

  const split = (pp: number, cc: number, ff: number) => {
    const k = parse(kcal) || 2000;
    setP(String(r0((k * pp) / 400)));
    setC(String(r0((k * cc) / 400)));
    setF(String(r0((k * ff) / 900)));
  };

  const useCalc = () => {
    if (!calc) return;
    const k = calc.target;
    const curK = macroKcal || k;
    setKcal(String(k));
    setP(String(r0((((parse(p) || 0) * 4) / curK) * k / 4)));
    setC(String(r0((((parse(cb) || 0) * 4) / curK) * k / 4)));
    setF(String(r0((((parse(f) || 0) * 9) / curK) * k / 9)));
    nav.toast('Filled in. Tap Save targets to keep it.');
  };

  const save = () => {
    const k = parse(kcal);
    if (!(k > 0)) return nav.toast('Enter a calorie target above 0');
    store.setTargets({ kcal: k, p: parse(p) || 0, c: parse(cb) || 0, f: parse(f) || 0 }, calc?.inputs ?? null);
    nav.toast('Targets saved');
  };

  const kNum = parse(kcal) || 0;
  return (
    <Screen>
      <Txt weight="display" size={21}>Targets</Txt>
      <SmartTargetCard />

      <Card style={{ gap: 12 }}>
        <Eyebrow>Daily targets</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Calories (kcal)" value={kcal} onChangeText={setKcal} keyboardType="number-pad" />
          <Field label="Protein (g)" value={p} onChangeText={setP} keyboardType="number-pad" />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Carbs (g)" value={cb} onChangeText={setC} keyboardType="number-pad" />
          <Field label="Fat (g)" value={f} onChangeText={setF} keyboardType="number-pad" />
        </View>
        <Txt size={12.5} color={Math.abs(macroKcal - kNum) > kNum * 0.05 ? t.warn : t.muted} style={num}>
          Your macros add up to {int(macroKcal)} kcal{kNum ? ` (${macroKcal - kNum >= 0 ? '+' : ''}${int(macroKcal - kNum)} vs. calorie target)` : ''}.
        </Txt>
        <Txt size={12.5} weight="bodyBold" color={t.muted}>Split my calories</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="Balanced 30/40/30" onPress={() => split(30, 40, 30)} />
          <Chip label="High protein 35/35/30" onPress={() => split(35, 35, 30)} />
          <Chip label="Low carb 30/20/50" onPress={() => split(30, 20, 50)} />
        </View>
        <PrimaryButton label="Save targets" onPress={save} />
      </Card>

      <DayTargetsCard />

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <Eyebrow inline>Net carbs</Eyebrow>
          <Switch
            value={!!store.profile.netCarbs}
            onValueChange={(v) => store.setProfile({ netCarbs: v })}
            trackColor={{ true: t.accent, false: t.surface2 }}
            thumbColor={t.ink}
            accessibilityLabel="Show net carbs"
          />
        </View>
        <Txt size={13.5} color={t.muted}>Show carbs with fiber taken out, and count your carb target that way. Calories don’t change.</Txt>
        <Txt size={13.5} color={t.muted}>To set your own vitamin and mineral targets, tap any nutrient at the bottom of the Diary.</Txt>
      </Card>

      <Card style={{ gap: 12 }}>
        <Eyebrow>Estimate my calories</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Chip label="Male" active={sex === 'male'} onPress={() => setSex('male')} />
          <Chip label="Female" active={sex === 'female'} onPress={() => setSex('female')} />
          <View style={{ width: 8 }} />
          <Chip label="lb · ft" active={units === 'us'} onPress={() => setUnits('us')} />
          <Chip label="kg · cm" active={units === 'metric'} onPress={() => setUnits('metric')} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field label="Age" value={age} onChangeText={setAge} keyboardType="number-pad" style={{ minWidth: 80 }} />
          {units === 'us' ? (
            <>
              <Field label="Height (ft)" value={ft} onChangeText={setFt} keyboardType="number-pad" style={{ minWidth: 80 }} />
              <Field label="(in)" value={inch} onChangeText={setIn} keyboardType="number-pad" style={{ minWidth: 70 }} />
            </>
          ) : (
            <Field label="Height (cm)" value={cm} onChangeText={setCm} keyboardType="number-pad" style={{ minWidth: 80 }} />
          )}
        </View>
        {units === 'us' ? (
          <Field label="Weight (lb)" value={lb} onChangeText={setLb} keyboardType="decimal-pad" />
        ) : (
          <Field label="Weight (kg)" value={kg} onChangeText={setKg} keyboardType="decimal-pad" />
        )}
        <Txt size={12.5} weight="bodyBold" color={t.muted}>Activity</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ACTIVITY.map(([v, l]) => (
            <Chip key={v} label={l} active={activity === v} onPress={() => setActivity(v)} />
          ))}
        </View>
        <Txt size={12.5} weight="bodyBold" color={t.muted}>Goal</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {GOALS.map(([v, l]) => (
            <Chip key={v} label={l} active={goal === v} onPress={() => setGoal(v)} />
          ))}
        </View>
        <View style={{ backgroundColor: t.surface2, borderRadius: 12, padding: 14, gap: 10 }}>
          {calc ? (
            <Txt size={14} style={num}>
              Maintenance ≈ <Txt weight="bodyHeavy" size={14}>{int(calc.tdee)}</Txt> kcal · Suggested <Txt weight="bodyHeavy" size={14} color={t.accent}>{int(calc.target)}</Txt> kcal
            </Txt>
          ) : (
            <Txt size={14} color={t.muted}>Fill in age, height and weight.</Txt>
          )}
          <GhostButton label="Use this target" onPress={useCalc} disabled={!calc} />
        </View>
        <Txt size={12} color={t.faint}>Uses the Mifflin–St Jeor equation. It’s an estimate, so adjust after a couple of weeks based on how your weight changes.</Txt>
      </Card>
    </Screen>
  );
}
