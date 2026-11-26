import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { kgToLb } from '../calc';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { ACTIVITIES, caloriesBurned } from '../exercise';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Chip, Field, num, PrimaryButton, Txt } from '../ui';
import { dayTitle, int, today } from '../util';

const FALLBACK_KG = 70;
const MINUTES = [15, 30, 45, 60, 90];

export default function AddExercise() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const date = nav.date;

  const [activity, setActivity] = useState<string>('');
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState('30');
  const [own, setOwn] = useState(''); // calories typed by hand, e.g. from a watch

  // The latest weigh-in, else the weight from setup
  const kg = store.weights.length ? store.weights[store.weights.length - 1].kg : (store.profile.calc?.weight ?? FALLBACK_KG);
  const known = store.weights.length > 0 || !!store.profile.calc?.weight;
  const min = Math.max(0, Math.round(parseFloat(minutes.replace(',', '.')) || 0));
  const met = ACTIVITIES.find((a) => a.name === activity)?.met;
  const estimate = met ? caloriesBurned(met, kg, min) : 0;
  const typed = Math.round(parseFloat(own.replace(',', '.')) || 0);
  const kcal = typed > 0 ? typed : estimate;
  const title = activity || name.trim();
  const ready = !!title && kcal > 0 && kcal < 10000;

  const add = () => {
    if (!ready) return;
    store.addExercise(date, { name: title, minutes: min, kcal });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    nav.toast(`${title} added`);
    nav.done();
  };

  const shownWeight = store.profile.units === 'us' ? `${Math.round(kgToLb(kg))} lb` : `${Math.round(kg)} kg`;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title={date === today() ? 'Add exercise' : `Exercise · ${dayTitle(date)}`} onClose={nav.done} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {ACTIVITIES.map((a) => (
            <Chip key={a.name} label={a.name} active={activity === a.name} onPress={() => { setActivity(activity === a.name ? '' : a.name); setName(''); }} />
          ))}
        </View>
        {activity ? null : <Field label="Something else" value={name} onChangeText={setName} placeholder="e.g. Gardening, padel" maxLength={40} />}

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" selectTextOnFocus />
            <Field label="Calories (from your watch)" value={own} onChangeText={setOwn} keyboardType="number-pad" placeholder={estimate ? String(estimate) : 'Optional'} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MINUTES.map((m) => (
              <Chip key={m} label={`${m} min`} active={min === m} onPress={() => setMinutes(String(m))} />
            ))}
          </View>
        </View>

        <Card style={{ alignItems: 'center', gap: 4 }}>
          <Txt weight="displayHeavy" size={38} color={t.accent} style={num}>{int(kcal)}</Txt>
          <Txt size={13} color={t.muted} style={{ textAlign: 'center' }}>
            {typed > 0 ? 'calories, as you entered them' : met ? `estimated calories beyond resting, for ${shownWeight}${known ? '' : ' (add your weight for a better estimate)'}` : 'Pick an activity, or type the calories.'}
          </Txt>
        </Card>

        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Txt weight="bodyBold" size={15} style={{ flex: 1 }}>Add these calories to my daily budget</Txt>
            <Switch
              value={!!store.profile.exerciseAddsCalories}
              onValueChange={(v) => store.setProfile({ exerciseAddsCalories: v })}
              trackColor={{ true: t.accent, false: t.surface2 }}
              thumbColor={t.ink}
              accessibilityLabel="Add exercise calories to my daily budget"
            />
          </View>
          <Txt size={12.5} color={t.muted}>Leave this off if your target already counts your workouts, which it does if you chose an active level at setup.</Txt>
        </Card>
      </ScrollView>
      <View style={{ padding: 16, paddingBottom: kb ? kb + 12 : insets.bottom + 12, borderTopWidth: 1, borderTopColor: t.line }}>
        <PrimaryButton label={ready ? `Add ${int(kcal)} kcal burned` : 'Add exercise'} onPress={add} disabled={!ready} />
      </View>
    </View>
  );
}
