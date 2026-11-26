import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { ModalHeader } from '../components/Screen';
import { fastLength, fastStats, fastStreak, fmtDuration, PRESETS, reachedGoal } from '../fasting';
import { useNav } from '../nav';
import { cancelFastAlert, scheduleFastAlert } from '../notify';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Chip, Eyebrow, GhostButton, num, PrimaryButton, Txt, useGradId } from '../ui';

const H = 3600000;
const notInFuture = (ms: number) => Math.min(Date.now(), ms);
const clock = (ms: number, h12: boolean) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: h12 });
const dayLabel = (ms: number) => {
  const d = new Date(ms), now = new Date();
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
};

function Ring({ pct, done, size = 240 }: { pct: number; done: boolean; size?: number }) {
  const t = useTheme();
  const gid = useGradId();
  const R = size / 2 - 14, C = 2 * Math.PI * R;
  return (
    <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
      <Defs>
        <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={done ? t.good : t.accent} />
          <Stop offset="1" stopColor={done ? t.good : t.accent2} />
        </LinearGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={R} stroke={t.surface2} strokeWidth={16} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={R} stroke={`url(#${gid})`} strokeWidth={16} fill="none" strokeLinecap="round" strokeDasharray={`${C} ${C}`} strokeDashoffset={C * (1 - Math.min(1, pct))} />
    </Svg>
  );
}

export default function Fasting() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const { current, history } = store.fasts;
  const h12 = store.profile.units === 'us';
  const [goalH, setGoalH] = useState(current?.goalH ?? history[0]?.goalH ?? 16);
  const [now, setNow] = useState(() => Date.now());
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    if (!current) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [current]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const elapsed = current ? now - current.start : 0;
  const goalMs = (current?.goalH ?? goalH) * H;
  const done = !!current && elapsed >= goalMs;
  const streak = fastStreak(history, new Date(now));
  const stats = fastStats(history);

  const start = () => {
    const at = Date.now();
    store.startFast(goalH, at);
    setNow(at);
    scheduleFastAlert(new Date(at + goalH * H), goalH).catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    nav.toast(`Fast started · goal ${goalH} hours`);
  };
  const shiftStart = (mins: number) => {
    if (!current) return;
    const next = notInFuture(current.start + mins * 60000);
    store.updateFast({ start: next });
    scheduleFastAlert(new Date(next + current.goalH * H), current.goalH).catch(() => {});
  };
  const changeGoal = (h: number) => {
    setGoalH(h);
    if (current) {
      store.updateFast({ goalH: h });
      scheduleFastAlert(new Date(current.start + h * H), h).catch(() => {});
    }
  };
  const end = () => {
    if (!current) return;
    if (!done && !confirmEnd) return setConfirmEnd(true);
    const len = Date.now() - current.start;
    store.endFast();
    cancelFastAlert().catch(() => {});
    setConfirmEnd(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    nav.toast(len >= current.goalH * H ? `Fasted ${fmtDuration(len)} · goal reached 🎉` : `Fasted ${fmtDuration(len)}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Fasting" onClose={close} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}>
        <Card style={{ alignItems: 'center', gap: 14, paddingVertical: 22 }}>
          <View style={{ width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute' }}>
              <Ring pct={current ? elapsed / goalMs : 0} done={done} />
            </View>
            <Txt size={12.5} weight="bodyBold" color={done ? t.good : t.muted} style={{ letterSpacing: 1.2 }}>{current ? (done ? 'GOAL REACHED' : 'FASTING') : 'READY'}</Txt>
            <Txt weight="displayHeavy" size={38} style={num}>{current ? fmtDuration(elapsed, true) : `${goalH}:00`}</Txt>
            <Txt size={13} color={t.muted}>
              {current ? (done ? `+${fmtDuration(elapsed - goalMs)} past your goal` : `${fmtDuration(goalMs - elapsed)} to go`) : `hour fast`}
            </Txt>
          </View>

          {current ? (
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <View style={{ alignItems: 'center' }}>
                <Txt size={11.5} color={t.muted}>Started</Txt>
                <Txt weight="bodyBold" size={15}>{dayLabel(current.start)} {clock(current.start, h12)}</Txt>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Txt size={11.5} color={t.muted}>Goal</Txt>
                <Txt weight="bodyBold" size={15}>{dayLabel(current.start + goalMs)} {clock(current.start + goalMs, h12)}</Txt>
              </View>
            </View>
          ) : null}

          {current ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt size={12.5} color={t.muted}>Started earlier?</Txt>
              {[-60, -15].map((m) => (
                <Chip key={m} label={`${m} min`} onPress={() => shiftStart(m)} />
              ))}
              <Chip label="+15 min" onPress={() => shiftStart(15)} />
            </View>
          ) : null}
        </Card>

        <View style={{ gap: 8 }}>
          <Eyebrow>Fasting goal</Eyebrow>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {PRESETS.map((h) => (
              <Chip key={h} label={`${h}h${h === 16 ? ' · 16:8' : h === 14 ? ' · 14:10' : ''}`} active={(current?.goalH ?? goalH) === h} onPress={() => changeGoal(h)} />
            ))}
          </View>
        </View>

        {current ? (
          <View style={{ gap: 8 }}>
            <PrimaryButton label={confirmEnd ? 'Tap again to end early' : done ? 'End fast' : 'End fast'} onPress={end} icon={<Ionicons name="stop-circle-outline" size={18} color={t.onGrad} />} />
            {confirmEnd ? <Txt size={12.5} color={t.muted} style={{ textAlign: 'center' }}>You’re {fmtDuration(goalMs - elapsed)} short of your goal. It still counts in your history.</Txt> : null}
            <GhostButton label="Cancel this fast (don’t save it)" onPress={() => { store.cancelFast(); cancelFastAlert().catch(() => {}); }} />
          </View>
        ) : (
          <PrimaryButton label={`Start ${goalH}-hour fast`} onPress={start} icon={<Ionicons name="play-circle-outline" size={18} color={t.onGrad} />} />
        )}

        {stats ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              ['Streak', `${streak} day${streak === 1 ? '' : 's'}`],
              ['Average', fmtDuration(stats.avgMs)],
              ['Longest', fmtDuration(stats.longestMs)],
            ].map(([l, v]) => (
              <View key={l} style={{ flex: 1, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 14, padding: 12 }}>
                <Txt size={11.5} color={t.muted}>{l}</Txt>
                <Txt weight="display" size={17} style={num}>{v}</Txt>
              </View>
            ))}
          </View>
        ) : null}

        {history.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ padding: 16, paddingBottom: 6 }}>
              <Eyebrow>Recent fasts</Eyebrow>
            </View>
            {history.slice(0, 14).map((f) => {
              const ok = reachedGoal(f, now);
              return (
                <View key={f.start} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: t.line }}>
                  <Ionicons name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={ok ? t.good : t.faint} />
                  <View style={{ flex: 1 }}>
                    <Txt size={14} weight="bodySemi">{dayLabel(f.end ?? f.start)}</Txt>
                    <Txt size={12} color={t.muted}>{clock(f.start, h12)} – {clock(f.end ?? f.start, h12)} · goal {f.goalH}h</Txt>
                  </View>
                  <Txt weight="bodyHeavy" size={14} style={num}>{fmtDuration(fastLength(f, now))}</Txt>
                  <Pressable hitSlop={8} onPress={() => store.deleteFast(f.start)} accessibilityLabel="Delete this fast" style={{ padding: 4 }}>
                    <Ionicons name="close" size={16} color={t.faint} />
                  </Pressable>
                </View>
              );
            })}
          </Card>
        ) : (
          <Txt size={13} color={t.muted}>Start a fast when you finish eating for the day. Pantera tracks the time, notifies you at your goal, and keeps your history and streak.</Txt>
        )}
        <Txt size={11.5} color={t.faint}>Fasting isn’t right for everyone. If you’re pregnant, diabetic, have a history of disordered eating or take medication, talk to a doctor first.</Txt>
      </ScrollView>
    </View>
  );
}
