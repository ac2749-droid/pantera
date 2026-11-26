import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useStore } from '../store';
import { MILESTONES, newMilestone, streakStats } from '../streak';
import { useTheme } from '../theme';
import { Bar, Card, GhostButton, num, Txt } from '../ui';
import { today } from '../util';
import { Arrive } from './motion';

/** The logging streak: one line on the Diary, details on tap, and a moment when a milestone is reached. */
export function StreakCard() {
  const t = useTheme();
  const store = useStore();
  const [open, setOpen] = useState(false);
  const s = useMemo(() => streakStats(store.days, today()), [store.days]);
  const seen = store.profile.streakSeen ?? 0;
  const milestone = newMilestone(s, seen);

  if (!s.total) return null;

  if (milestone) {
    return (
      <Arrive from="pop">
        <Card style={{ gap: 10, borderColor: t.carbs, alignItems: 'center' }}>
          <Ionicons name="trophy" size={34} color={t.carbs} />
          <Txt weight="displayHeavy" size={22} style={{ textAlign: 'center' }}>{s.current} days in a row!</Txt>
          <Txt size={14} color={t.muted} style={{ textAlign: 'center' }}>
            You passed the {milestone}-day milestone. {s.next ? `Next stop: ${s.next} days.` : 'That’s the top one.'}
          </Txt>
          <GhostButton label="Keep going" onPress={() => store.setProfile({ streakSeen: milestone })} />
        </Card>
      </Arrive>
    );
  }

  const title = s.current ? `${s.current}-day streak` : 'Start a new streak';
  const hint = s.current === 0 ? `Your best is ${s.best} day${s.best === 1 ? '' : 's'}.` : s.loggedToday ? 'Today is counted.' : 'Log something today to keep it.';

  return (
    <Card style={{ gap: 12, paddingVertical: 13 }}>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${hint}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={s.current ? 'flame' : 'flame-outline'} size={20} color={s.current ? t.carbs : t.muted} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt weight="bodyBold" size={15} style={num}>{title}</Txt>
          <Txt size={12.5} color={t.muted}>{hint}</Txt>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={t.faint} />
      </Pressable>
      {open ? (
        <Arrive style={{ gap: 12 }}>
          {s.next ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={13}>Next milestone: {s.next} days</Txt>
                <Txt size={13} color={t.muted} style={num}>{s.current} / {s.next}</Txt>
              </View>
              <Bar value={s.current} max={s.next} color={t.carbs} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MILESTONES.map((m) => {
              const got = s.reached.includes(m);
              return (
                <View key={m} accessibilityLabel={`${m} days${got ? ', reached' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 99, borderWidth: 1, borderColor: got ? t.carbs : t.line, paddingVertical: 5, paddingHorizontal: 10 }}>
                  <Ionicons name={got ? 'trophy' : 'lock-closed-outline'} size={13} color={got ? t.carbs : t.faint} />
                  <Txt size={12.5} weight="bodyBold" color={got ? t.ink : t.faint} style={num}>{m}</Txt>
                </View>
              );
            })}
          </View>
          <Txt size={12.5} color={t.muted}>Best streak: {s.best} day{s.best === 1 ? '' : 's'} · {s.total} day{s.total === 1 ? '' : 's'} logged in all.</Txt>
        </Arrive>
      ) : null}
    </Card>
  );
}
