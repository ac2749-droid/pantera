import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACTIVITY, bmr, cmToFtIn, dailyTarget, ftInToCm, GOALS, kgToLb, lbToKg, macroGrams, Sex, SPLITS, Units } from '../calc';
import { useKeyboardHeight } from '../components/keyboard';
import { Arrive, Aura, GlideBar, useCountUp } from '../components/motion';
import { FOOD_COUNT } from '../foodIndex/foodCount';
import { useStore } from '../store';
import { fonts, useTheme } from '../theme';
import { Chip, Logo, num, PrimaryButton, Txt } from '../ui';
import { int } from '../util';

const STEPS = 4; // about you, activity, goal, plan

function NumField({ label, value, onChange, suffix, width }: { label: string; value: string; onChange: (v: string) => void; suffix: string; width?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6, flex: width ? undefined : 1, width }}>
      <Txt weight="bodyBold" size={12.5} color={t.muted}>{label}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: value ? t.accent : t.line, backgroundColor: t.surface, borderRadius: 14, paddingHorizontal: 14 }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={{ flex: 1, minWidth: 0, color: t.ink, fontFamily: fonts.display, fontSize: 20, paddingVertical: 12 }}
          accessibilityLabel={label}
        />
        <Txt size={14} color={t.muted} weight="bodySemi">{suffix}</Txt>
      </View>
    </View>
  );
}

function OptionCard({ title, hint, active, onPress }: { title: string; hint: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: active ? t.accent : t.line, backgroundColor: active ? t.accentSoft : pressed ? t.surface2 : t.surface, borderRadius: 16, padding: 16 })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="bodyBold" size={16}>{title}</Txt>
        <Txt size={13.5} color={t.muted}>{hint}</Txt>
      </View>
      <Ionicons name={active ? 'radio-button-on' : 'radio-button-off'} size={22} color={active ? t.accent : t.faint} />
    </Pressable>
  );
}

export default function Welcome() {
  const t = useTheme();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const params = useLocalSearchParams<{ mode?: string }>();
  const editing = params.mode === 'edit';
  const p = store.profile;
  const c = p.calc;
  const lastKg = store.weights.length ? store.weights[store.weights.length - 1].kg : c?.weight;

  const [step, setStep] = useState(editing ? 1 : 0);
  const [units, setUnits] = useState<Units>(p.units);
  const [sex, setSex] = useState<Sex>(c?.sex ?? 'male');
  const [age, setAge] = useState(c ? String(c.age) : '');
  const hIn = c ? cmToFtIn(c.height) : null;
  const [ft, setFt] = useState(hIn ? String(hIn.ft) : '');
  const [inch, setInch] = useState(hIn ? String(hIn.inch) : '');
  const [cm, setCm] = useState(c ? String(Math.round(c.height)) : '');
  const [weight, setWeight] = useState(lastKg ? String(Math.round((p.units === 'us' ? kgToLb(lastKg) : lastKg) * 10) / 10) : '');
  const [activity, setActivity] = useState(c?.activity ?? 1.55);
  const [goal, setGoal] = useState(c?.goal ?? -500);
  const [goalWeight, setGoalWeight] = useState(p.goalWeightKg ? String(Math.round((p.units === 'us' ? kgToLb(p.goalWeightKg) : p.goalWeightKg) * 10) / 10) : '');
  const [split, setSplit] = useState('balanced');
  const [back, setBack] = useState(false); // which side the next setup step arrives from

  const n = (s: string) => parseFloat(s.replace(',', '.'));
  const switchUnits = (u: Units) => {
    if (u === units) return;
    // convert what's already typed
    const w = n(weight), gw = n(goalWeight);
    if (u === 'metric') {
      if (w > 0) setWeight(String(Math.round(lbToKg(w) * 10) / 10));
      if (gw > 0) setGoalWeight(String(Math.round(lbToKg(gw) * 10) / 10));
      if (n(ft) > 0) setCm(String(Math.round(ftInToCm(n(ft), n(inch) || 0))));
    } else {
      if (w > 0) setWeight(String(Math.round(kgToLb(w) * 10) / 10));
      if (gw > 0) setGoalWeight(String(Math.round(kgToLb(gw) * 10) / 10));
      if (n(cm) > 0) {
        const x = cmToFtIn(n(cm));
        setFt(String(x.ft));
        setInch(String(x.inch));
      }
    }
    setUnits(u);
  };

  const heightCm = units === 'us' ? ftInToCm(n(ft) || 0, n(inch) || 0) : n(cm);
  const weightKg = units === 'us' ? lbToKg(n(weight)) : n(weight);
  const goalKg = goalWeight ? (units === 'us' ? lbToKg(n(goalWeight)) : n(goalWeight)) : null;
  const aboutValid = n(age) >= 13 && n(age) <= 100 && heightCm >= 120 && heightCm <= 230 && weightKg >= 30 && weightKg <= 300;

  const plan = useMemo(() => {
    if (!aboutValid) return null;
    const rest = bmr(sex, n(age), heightCm, weightKg);
    const tdee = rest * activity;
    const kcal = dailyTarget(tdee, goal, sex);
    const s = SPLITS.find((x) => x.key === split) ?? SPLITS[0];
    return { tdee, kcal, ...macroGrams(kcal, s) };
  }, [aboutValid, sex, age, heightCm, weightKg, activity, goal, split]);

  const finish = () => {
    if (!plan) return;
    store.completeSetup(
      {
        units,
        targets: { kcal: plan.kcal, p: plan.p, c: plan.c, f: plan.f },
        calc: { sex, age: n(age), height: heightCm, weight: weightKg, activity, goal },
        goalWeightKg: goal === 0 ? null : goalKg && goalKg > 0 ? goalKg : null,
        waterGoalMl: p.onboarded ? p.waterGoalMl : units === 'us' ? 1893 : 2000,
      },
      weightKg,
    );
    if (editing && router.canGoBack()) router.back();
    else router.replace('/');
  };

  const next = () => {
    if (step >= STEPS) return finish();
    setBack(false);
    setStep(step + 1);
  };
  const previous = () => {
    setBack(true);
    if (step > 1) setStep(step - 1);
    else if (editing) router.back();
    else setStep(0);
  };
  const kcalShown = useCountUp(step === STEPS && plan ? Math.round(plan.kcal) : 0, 900);
  const canNext = step === 1 ? aboutValid : true;

  // ---------- step 0: welcome ----------
  if (step === 0) {
    const points: [React.ComponentProps<typeof Ionicons>['name'], string, string][] = [
      ['barcode-outline', 'Scan barcodes', 'Point your camera at a package and it’s logged.'],
      ['search-outline', `${FOOD_COUNT} foods`, 'Search by name or brand, even offline. Typos are fine.'],
      ['sparkles-outline', 'Just say what you ate', '“A chicken wrap and a coke” becomes diary entries.'],
    ];
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Aura height={520} />
        {/* Scrolls on small screens and with large text */}
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', gap: 28, paddingTop: insets.top + 40, paddingBottom: insets.bottom + 20, paddingHorizontal: 24 }}>
          <View style={{ gap: 28 }}>
            <View style={{ alignItems: 'flex-start', gap: 16 }}>
              <Arrive from="pop">
                <Logo size={104} />
              </Arrive>
              <Arrive from="left" delay={140}>
                <Txt weight="displayHeavy" size={40} style={{ letterSpacing: 6, paddingRight: 8, transform: [{ skewX: '-9deg' }] }}>PANTERA</Txt>
              </Arrive>
              <Arrive from="left" delay={220}>
                <Txt size={18} color={t.muted}>Track what you eat. Hit your goals.</Txt>
              </Arrive>
            </View>
            <View style={{ gap: 18 }}>
              {points.map(([icon, title, body], i) => (
                <Arrive key={title} delay={340 + i * 110} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                  <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={icon} size={21} color={t.accent} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="bodyBold" size={16}>{title}</Txt>
                    <Txt size={14} color={t.muted}>{body}</Txt>
                  </View>
                </Arrive>
              ))}
            </View>
          </View>
          <Arrive delay={720} style={{ gap: 12 }}>
            <PrimaryButton label="Set up my plan" onPress={next} />
            <Txt size={12.5} color={t.faint} style={{ textAlign: 'center' }}>Takes about a minute. Everything stays on your phone.</Txt>
          </Arrive>
        </ScrollView>
      </View>
    );
  }

  const titles = ['', 'About you', 'How active are you?', 'What’s your goal?', 'Your daily plan'];
  const subtitles = [
    '',
    'Used to estimate how many calories your body burns.',
    'Count everyday movement and exercise together.',
    'You can change this anytime in Settings.',
    'Based on the Mifflin–St Jeor equation. Adjust after a couple of weeks if your weight isn’t moving as expected.',
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Top bar with progress */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={previous}
            hitSlop={10}
            accessibilityLabel="Back"
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name={step === 1 && editing ? 'close' : 'chevron-back'} size={24} color={t.ink} />
          </Pressable>
          <Txt size={13} color={t.muted} weight="bodyBold">Step {step} of {STEPS}</Txt>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {Array.from({ length: STEPS }, (_, i) => (
            <View key={i} style={{ flex: 1 }}>
              <GlideBar fraction={i < step ? 1 : 0} color={t.accent} height={4} />
            </View>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 30 + kb }} keyboardShouldPersistTaps="handled">
        <Arrive key={step} from={back ? 'left' : 'right'} style={{ gap: 18 }}>
        <View style={{ gap: 6 }}>
          <Txt weight="display" size={28}>{titles[step]}</Txt>
          <Txt size={14.5} color={t.muted}>{subtitles[step]}</Txt>
        </View>

        {step === 1 ? (
          <View style={{ gap: 18 }}>
            <View style={{ gap: 8 }}>
              <Txt weight="bodyBold" size={12.5} color={t.muted}>Units</Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="lb · ft · oz" active={units === 'us'} onPress={() => switchUnits('us')} />
                <Chip label="kg · cm · ml" active={units === 'metric'} onPress={() => switchUnits('metric')} />
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <Txt weight="bodyBold" size={12.5} color={t.muted}>Sex (for the calorie formula)</Txt>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label="Male" active={sex === 'male'} onPress={() => setSex('male')} />
                <Chip label="Female" active={sex === 'female'} onPress={() => setSex('female')} />
              </View>
            </View>
            <NumField label="Age" value={age} onChange={setAge} suffix="years" />
            {units === 'us' ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <NumField label="Height" value={ft} onChange={setFt} suffix="ft" />
                <NumField label=" " value={inch} onChange={setInch} suffix="in" />
              </View>
            ) : (
              <NumField label="Height" value={cm} onChange={setCm} suffix="cm" />
            )}
            <NumField label="Current weight" value={weight} onChange={setWeight} suffix={units === 'us' ? 'lb' : 'kg'} />
            {!aboutValid && (age || weight) ? <Txt size={13} color={t.faint}>Fill in age, height and weight to continue.</Txt> : null}
          </View>
        ) : null}

        {step === 2 ? (
          <View style={{ gap: 10 }}>
            {ACTIVITY.map((a) => (
              <OptionCard key={a.v} title={a.label} hint={a.hint} active={activity === a.v} onPress={() => setActivity(a.v)} />
            ))}
          </View>
        ) : null}

        {step === 3 ? (
          <View style={{ gap: 10 }}>
            {GOALS.map((g) => (
              <OptionCard key={g.v} title={g.label} hint={g.hint} active={goal === g.v} onPress={() => setGoal(g.v)} />
            ))}
            {goal !== 0 ? (
              <View style={{ marginTop: 8 }}>
                <NumField label="Goal weight (optional)" value={goalWeight} onChange={setGoalWeight} suffix={units === 'us' ? 'lb' : 'kg'} />
              </View>
            ) : null}
          </View>
        ) : null}

        {step === 4 && plan ? (
          <View style={{ gap: 16 }}>
            <View style={{ backgroundColor: t.surface, borderColor: t.accent, borderWidth: 1, borderRadius: 20, padding: 20, alignItems: 'center', gap: 4 }}>
              <Txt size={14} color={t.muted} weight="bodyBold">Daily calories</Txt>
              <Txt weight="displayHeavy" size={52} color={t.accent} style={num}>{int(kcalShown)}</Txt>
              <Txt size={13.5} color={t.muted} style={num}>Maintenance is about {int(plan.tdee)} kcal</Txt>
            </View>
            <View style={{ gap: 8 }}>
              <Txt weight="bodyBold" size={12.5} color={t.muted}>Macro split</Txt>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {SPLITS.map((s) => (
                  <Chip key={s.key} label={s.label} active={split === s.key} onPress={() => setSplit(s.key)} />
                ))}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {([['Protein', plan.p, t.protein], ['Carbs', plan.c, t.carbs], ['Fat', plan.f, t.fat]] as const).map(([label, g, color]) => (
                <View key={label} style={{ flex: 1, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 16, padding: 14, gap: 2 }}>
                  <Txt size={12.5} color={t.muted}>{label}</Txt>
                  <Txt weight="display" size={22} color={color} style={num}>{g} g</Txt>
                </View>
              ))}
            </View>
            {goalKg && goal !== 0 ? (
              <Txt size={14} color={t.muted}>
                Goal weight: <Txt weight="bodyBold" size={14}>{goalWeight} {units === 'us' ? 'lb' : 'kg'}</Txt>. Track your progress in the Trends tab.
              </Txt>
            ) : null}
          </View>
        ) : null}
        </Arrive>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: kb ? kb + 10 : insets.bottom + 16 }}>
        <PrimaryButton label={step === STEPS ? (editing ? 'Save my plan' : 'Start tracking') : 'Continue'} onPress={next} disabled={!canNext} />
      </View>
    </View>
  );
}
