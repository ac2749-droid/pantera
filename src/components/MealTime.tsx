import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';
import { Entry } from '../foods';
import { clockText, entryMinutes, stepTime } from '../mealTime';
import { useTheme } from '../theme';
import { IconButton, num, Txt } from '../ui';

const now = () => new Date().getHours() * 60 + new Date().getMinutes();

/** When a diary entry was eaten, adjustable in quarter hours. */
export function MealTime({ entry, date, value, onChange }: { entry?: Entry; date: string; value: number | undefined; onChange: (minutes: number) => void }) {
  const t = useTheme();
  if (!entry) return null;
  const shown = value ?? entryMinutes(entry, date);
  const step = (direction: 1 | -1) => onChange(stepTime(shown ?? now(), direction));
  return (
    <View style={{ gap: 6 }}>
      <Txt weight="bodyBold" size={12.5} color={t.muted}>Time</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton label="Earlier" onPress={() => step(-1)}>
          <Ionicons name="remove" size={20} color={t.ink} />
        </IconButton>
        <Txt weight="display" size={20} color={shown === null ? t.faint : t.ink} style={[num, { flex: 1, textAlign: 'center' }]}>
          {shown === null ? 'Not set' : clockText(shown)}
        </Txt>
        <IconButton label="Later" onPress={() => step(1)}>
          <Ionicons name="add" size={20} color={t.ink} />
        </IconButton>
      </View>
    </View>
  );
}
