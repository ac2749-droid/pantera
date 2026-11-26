import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { GLASS_ML, showWater } from '../calc';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Bar, Card, Eyebrow, IconButton, num, Txt } from '../ui';

/** Water for one day: tap a glass or use −/+ to log 8 fl oz (US) or 250 ml (metric) at a time. */
export function WaterCard({ date }: { date: string }) {
  const t = useTheme();
  const store = useStore();
  const { units, waterGoalMl } = store.profile;
  const glass = GLASS_ML(units);
  const ml = store.water[date] || 0;
  const count = Math.round(ml / glass);
  const goalGlasses = Math.max(1, Math.round(waterGoalMl / glass));
  const slots = Math.max(goalGlasses, count);
  const done = ml >= waterGoalMl;

  const setCount = (n: number) => {
    const target = Math.max(0, n) * glass;
    if (Math.round(target) === Math.round(ml)) return;
    Haptics.selectionAsync().catch(() => {});
    store.addWater(date, target - ml);
  };

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow inline>Water</Eyebrow>
        <Txt size={13} color={done ? t.good : t.muted} weight={done ? 'bodyBold' : 'body'} style={num}>
          {showWater(ml, units)} / {showWater(waterGoalMl, units)}
          {done ? '  ✓' : ''}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label="Remove a glass" onPress={() => setCount(count - 1)} disabled={count <= 0}>
          <Ionicons name="remove" size={20} color={t.ink} />
        </IconButton>
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 3 }}>
          {Array.from({ length: slots }, (_, i) => {
            const filled = i < count;
            return (
              <Pressable
                key={i}
                hitSlop={3}
                accessibilityLabel={`Set water to ${i + 1} glass${i ? 'es' : ''}`}
                // Tapping the last filled glass empties it; any other glass fills up to it
                onPress={() => setCount(filled && i === count - 1 ? i : i + 1)}
                style={{ padding: 1 }}
              >
                <Ionicons name={filled ? 'water' : 'water-outline'} size={21} color={filled ? t.accent : t.faint} />
              </Pressable>
            );
          })}
        </View>
        <IconButton label="Add a glass" onPress={() => setCount(count + 1)}>
          <Ionicons name="add" size={20} color={t.ink} />
        </IconButton>
      </View>
      <Bar value={ml} max={waterGoalMl} color={done ? t.good : t.accent} height={5} />
      <Txt size={12} color={t.faint}>
        {count} of {goalGlasses} glasses · 1 glass = {units === 'us' ? '8 fl oz' : '250 ml'}
      </Txt>
    </Card>
  );
}
