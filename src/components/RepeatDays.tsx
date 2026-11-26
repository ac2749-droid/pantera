import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { repeatDates } from '../repeat';
import { useTheme } from '../theme';
import { Chip, Txt } from '../ui';
import { addDays, monthDay, today, weekdayShort } from '../util';
import { Arrive } from './motion';

/** "Also log this on…": pick later days to put the same food on. Closed until asked for. */
export function RepeatDays({ base, selected, onChange }: { base: string; selected: string[]; onChange: (days: string[]) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const now = today();
  const days = repeatDates(base, now);
  if (!days.length) return null;

  const label = (d: string) => (d === now ? 'Today' : d === addDays(now, 1) ? 'Tomorrow' : `${weekdayShort(d)} ${monthDay(d)}`);
  const toggle = (d: string) => onChange(selected.includes(d) ? selected.filter((x) => x !== d) : [...selected, d]);
  const all = selected.length === days.length;

  return (
    <View style={{ gap: 8 }}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}
      >
        <Ionicons name="repeat" size={18} color={t.accent} />
        <Txt weight="bodyBold" size={14} color={t.accent} style={{ flex: 1 }}>
          {selected.length ? `Also on ${selected.length} more day${selected.length === 1 ? '' : 's'}` : 'Also log on other days'}
        </Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={t.accent} />
      </Pressable>
      {open ? (
        <Arrive style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {days.map((d) => (
            <Chip key={d} label={label(d)} active={selected.includes(d)} onPress={() => toggle(d)} />
          ))}
          <Chip label={all ? 'Clear' : 'All'} onPress={() => onChange(all ? [] : days)} />
        </Arrive>
      ) : null}
    </View>
  );
}
