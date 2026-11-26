import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { fmtDuration } from '../fasting';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Bar, num, Txt } from '../ui';

/** Compact fasting status for the Diary; opens the full timer. */
export function FastingCard() {
  const t = useTheme();
  const { fasts, profile } = useStore();
  const [now, setNow] = useState(() => Date.now());
  const cur = fasts.current;
  useEffect(() => {
    if (!cur) return;
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [cur]);
  if (!cur && !profile.showFasting) return null;
  const goal = (cur?.goalH ?? 16) * 3600000;
  const el = cur ? now - cur.start : 0;
  const done = el >= goal;
  return (
    <Pressable onPress={() => router.push('/fasting')} accessibilityRole="button" style={({ pressed }) => ({ backgroundColor: pressed ? t.surface2 : t.surface, borderColor: cur ? (done ? t.good : t.accent) : t.line, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Ionicons name={cur ? 'hourglass' : 'hourglass-outline'} size={20} color={done ? t.good : t.accent} />
        <View style={{ flex: 1 }}>
          <Txt weight="bodyBold" size={15}>{cur ? (done ? 'Fasting goal reached' : 'Fasting') : 'Fasting timer'}</Txt>
          <Txt size={12.5} color={t.muted}>{cur ? (done ? 'Tap to end your fast' : `${fmtDuration(goal - el)} to go · goal ${cur.goalH}h`) : 'Tap to start a fast'}</Txt>
        </View>
        {cur ? <Txt weight="displayHeavy" size={18} color={done ? t.good : t.ink} style={num}>{fmtDuration(el)}</Txt> : <Ionicons name="chevron-forward" size={18} color={t.faint} />}
      </View>
      {cur ? <Bar value={el} max={goal} color={done ? t.good : t.accent} height={6} /> : null}
    </Pressable>
  );
}
