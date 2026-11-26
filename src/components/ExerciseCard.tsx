import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { burnedOn } from '../exercise';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Eyebrow, GhostButton, num, Txt } from '../ui';
import { int } from '../util';

/** The day's workouts on the Diary. */
export function ExerciseCard({ date }: { date: string }) {
  const t = useTheme();
  const store = useStore();
  const list = store.exercise[date] ?? [];
  const burned = burnedOn(list);

  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow inline>Exercise</Eyebrow>
        {burned ? <Txt size={13} color={t.muted} style={num}>{int(burned)} kcal</Txt> : null}
      </View>
      {list.map((x) => (
        <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Txt size={14.5} weight="bodyBold">{x.name}</Txt>
            <Txt size={12.5} color={t.muted}>{x.minutes ? `${x.minutes} min` : 'Added by hand'}</Txt>
          </View>
          <Txt size={14.5} weight="bodyHeavy" style={num}>{int(x.kcal)}</Txt>
          <Pressable hitSlop={10} accessibilityLabel={`Remove ${x.name}`} onPress={() => store.removeExercise(date, x.id)} style={{ padding: 4 }}>
            <Ionicons name="close" size={18} color={t.faint} />
          </Pressable>
        </View>
      ))}
      <GhostButton label="Add exercise" onPress={() => router.push('/exercise')} color={t.accent} />
    </Card>
  );
}
