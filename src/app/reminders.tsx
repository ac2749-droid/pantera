import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModalHeader } from '../components/Screen';
import { useNav } from '../nav';
import { askPermission, Permission, permissionStatus, sendTest } from '../notify';
import { anyOn, fromMinutes, ReminderSettings, showTime, TimeStr, toMinutes } from '../reminders';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Chip, Eyebrow, GhostButton, PrimaryButton, Txt } from '../ui';

/** − 9:00 AM + in 15-minute steps */
function TimeStepper({ value, onChange, h12, disabled }: { value: TimeStr; onChange: (t: TimeStr) => void; h12: boolean; disabled?: boolean }) {
  const t = useTheme();
  const step = (d: number) => onChange(fromMinutes(toMinutes(value) + d));
  const btn = (icon: 'remove' | 'add', d: number, label: string) => (
    <Pressable onPress={() => step(d)} onLongPress={() => step(d * 4)} disabled={disabled} hitSlop={6} accessibilityLabel={label} style={({ pressed }) => ({ width: 34, height: 34, borderRadius: 10, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? t.surface2 : 'transparent', opacity: disabled ? 0.4 : 1 })}>
      <Ionicons name={icon} size={16} color={t.ink} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn('remove', -15, 'Earlier')}
      <Txt weight="bodyBold" size={15} style={{ minWidth: 76, textAlign: 'center', opacity: disabled ? 0.4 : 1 }}>{showTime(value, h12)}</Txt>
      {btn('add', 15, 'Later')}
    </View>
  );
}

function Row({ title, hint, on, onToggle, children }: { title: string; hint?: string; on: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 10, paddingVertical: 12, borderTopWidth: 1, borderTopColor: t.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Txt weight="bodyBold" size={15}>{title}</Txt>
          {hint ? <Txt size={12.5} color={t.muted}>{hint}</Txt> : null}
        </View>
        <Switch value={on} onValueChange={onToggle} trackColor={{ true: t.accent, false: t.surface2 }} thumbColor={t.ink} accessibilityLabel={title} />
      </View>
      {children}
    </View>
  );
}

export default function Reminders() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const r = store.profile.reminders;
  const h12 = store.profile.units === 'us';
  const [perm, setPerm] = useState<Permission>('undetermined');
  const [tested, setTested] = useState(false);

  useEffect(() => {
    permissionStatus().then(setPerm).catch(() => {});
  }, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const save = async (next: ReminderSettings) => {
    // Ask for permission the first time a reminder is turned on
    if (anyOn(next) && perm !== 'granted') {
      const p = await askPermission();
      setPerm(p);
      if (p !== 'granted' && p !== 'unsupported') {
        nav.toast('Notifications are blocked for Pantera');
      }
    }
    store.setProfile({ reminders: next });
  };
  const setMeal = (m: keyof ReminderSettings['meals'], patch: Partial<ReminderSettings['meals']['lunch']>) => save({ ...r, meals: { ...r.meals, [m]: { ...r.meals[m], ...patch } } });

  const recommended = () =>
    save({
      meals: { breakfast: { on: true, time: r.meals.breakfast.time }, lunch: { on: true, time: r.meals.lunch.time }, dinner: { on: true, time: r.meals.dinner.time } },
      water: { ...r.water, on: true },
      weigh: { ...r.weigh, on: true, weekly: true },
      weekly: { on: true },
    });

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Reminders" onClose={close} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}>
        <Txt size={13.5} color={t.muted}>Pantera only nudges you when it’s useful. A meal reminder is skipped if you’ve already logged that meal, and water reminders stop once you reach your goal.</Txt>

        {perm === 'denied' ? (
          <View style={{ backgroundColor: t.surface, borderColor: t.warn, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
            <Txt weight="bodyBold" size={14.5} color={t.warn}>Notifications are turned off for Pantera</Txt>
            <Txt size={13} color={t.muted}>Turn them on in your phone’s settings: Apps → Pantera → Notifications.</Txt>
            <GhostButton label="Open phone settings" onPress={() => Linking.openSettings()} />
          </View>
        ) : null}
        {Platform.OS === 'web' ? <Txt size={13} color={t.warn}>Reminders work in the phone app, not in this web preview.</Txt> : null}

        {!anyOn(r) ? <PrimaryButton label="Turn on suggested reminders" icon={<Ionicons name="notifications" size={18} color={t.onGrad} />} onPress={recommended} /> : null}

        <Card style={{ paddingTop: 8, paddingBottom: 4 }}>
          <Eyebrow>Meals</Eyebrow>
          {(['breakfast', 'lunch', 'dinner'] as const).map((m) => (
            <Row key={m} title={m[0].toUpperCase() + m.slice(1)} hint="Only if you haven’t logged it yet" on={r.meals[m].on} onToggle={(v) => setMeal(m, { on: v })}>
              {r.meals[m].on ? <TimeStepper value={r.meals[m].time} onChange={(time) => setMeal(m, { time })} h12={h12} /> : null}
            </Row>
          ))}
        </Card>

        <Card style={{ paddingTop: 8, paddingBottom: 4 }}>
          <Eyebrow>Water</Eyebrow>
          <Row title="Drink water" hint="Stops for the day when you reach your goal" on={r.water.on} onToggle={(v) => save({ ...r, water: { ...r.water, on: v } })}>
            {r.water.on ? (
              <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt size={13.5} color={t.muted}>From</Txt>
                  <TimeStepper value={r.water.from} onChange={(from) => save({ ...r, water: { ...r.water, from } })} h12={h12} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Txt size={13.5} color={t.muted}>Until</Txt>
                  <TimeStepper value={r.water.to} onChange={(to) => save({ ...r, water: { ...r.water, to } })} h12={h12} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Txt size={13.5} color={t.muted}>Every</Txt>
                  {[1, 1.5, 2, 3].map((h) => (
                    <Chip key={h} label={`${h} h`} active={r.water.every === h} onPress={() => save({ ...r, water: { ...r.water, every: h } })} />
                  ))}
                </View>
              </View>
            ) : null}
          </Row>
        </Card>

        <Card style={{ paddingTop: 8, paddingBottom: 4 }}>
          <Eyebrow>Progress</Eyebrow>
          <Row title="Weigh-in" hint="Skipped if you’ve already logged your weight that day" on={r.weigh.on} onToggle={(v) => save({ ...r, weigh: { ...r.weigh, on: v } })}>
            {r.weigh.on ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Chip label="Every day" active={!r.weigh.weekly} onPress={() => save({ ...r, weigh: { ...r.weigh, weekly: false } })} />
                  <Chip label="Mondays" active={r.weigh.weekly} onPress={() => save({ ...r, weigh: { ...r.weigh, weekly: true } })} />
                </View>
                <TimeStepper value={r.weigh.time} onChange={(time) => save({ ...r, weigh: { ...r.weigh, time } })} h12={h12} />
              </View>
            ) : null}
          </Row>
          <Row title="Weekly report" hint="Monday at 9:00 AM: how last week went" on={r.weekly.on} onToggle={(v) => save({ ...r, weekly: { on: v } })} />
        </Card>

        {anyOn(r) && perm === 'granted' ? (
          <GhostButton
            label={tested ? 'Sent. It arrives in about 5 seconds' : 'Send a test reminder'}
            onPress={async () => {
              const ok = await sendTest();
              setTested(ok);
              if (!ok) nav.toast('Couldn’t send a test reminder');
            }}
          />
        ) : null}
        <Txt size={12} color={t.faint}>Hold − or + to jump an hour. Reminders are planned on your phone for the next week and updated as you log, so they work offline.</Txt>
      </ScrollView>
    </View>
  );
}
