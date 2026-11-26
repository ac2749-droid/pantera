import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { kgToLb } from '../calc';
import { coach, CoachResult, rescaleMacros } from '../coach';
import { useNav } from '../nav';
import { useStore } from '../store';
import { shiftDayTargets } from '../targets';
import { useTheme } from '../theme';
import { Bar, Card, Eyebrow, GhostButton, num, PrimaryButton, Txt } from '../ui';
import { int, today } from '../util';

/** The coach result for the current data, shared by the Targets card and the Diary nudge. */
export function useCoach(): CoachResult {
  const store = useStore();
  const { profile, days, weights } = store;
  const us = profile.units === 'us';
  return useMemo(
    () => coach({ days, weights, today: today(), targetKcal: profile.targets.kcal, calc: profile.calc, showWeight: (kg) => (us ? `${(Math.round(kgToLb(kg) * 10) / 10).toFixed(1)} lb` : `${(Math.round(kg * 100) / 100).toFixed(2)} kg`) }),
    [days, weights, profile.targets.kcal, profile.calc, us],
  );
}

export function SmartTargetCard() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const r = useCoach();
  const [how, setHow] = useState(false);
  const us = store.profile.units === 'us';
  const rate = (kgWeek: number) => (us ? `${(Math.round(kgToLb(Math.abs(kgWeek)) * 10) / 10).toFixed(1)} lb` : `${(Math.round(Math.abs(kgWeek) * 100) / 100).toFixed(2)} kg`);

  const apply = () => {
    if (r.status !== 'ready') return;
    const next = rescaleMacros(store.profile.targets, r.suggested);
    store.setTargets(next, store.profile.calc);
    store.setProfile({ dayTargets: shiftDayTargets(store.profile.dayTargets, store.profile.targets.kcal, next.kcal), coachLog: [{ date: today(), tdee: Math.round(r.tdee), target: r.suggested }, ...(store.profile.coachLog ?? [])].slice(0, 26) });
    nav.toast(`Daily target set to ${int(r.suggested)} kcal`);
  };

  return (
    <Card style={{ gap: 12, borderColor: t.accent }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Eyebrow inline>Smart target</Eyebrow>
        <View style={{ flex: 1 }} />
        {r.status === 'ready' ? (
          <Txt size={11.5} weight="bodyBold" color={r.confidence > 0.75 ? t.good : t.muted}>{r.confidence > 0.75 ? 'High confidence' : r.confidence > 0.4 ? 'Medium confidence' : 'Early estimate'}</Txt>
        ) : (
          <Txt size={11.5} weight="bodyBold" color={t.muted}>Learning</Txt>
        )}
      </View>

      {r.status === 'need-data' ? (
        <>
          <Txt size={13.5} color={t.muted}>{r.message}</Txt>
          <View style={{ gap: 8 }}>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={13}>Fully logged days</Txt>
                <Txt size={13} color={t.muted} style={num}>{Math.min(r.loggedDays, 10)} / 10</Txt>
              </View>
              <Bar value={r.loggedDays} max={10} color={t.accent} height={5} />
            </View>
            <View style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Txt size={13}>Weigh-ins</Txt>
                <Txt size={13} color={t.muted} style={num}>{Math.min(r.weighIns, 4)} / 4</Txt>
              </View>
              <Bar value={r.weighIns} max={4} color={t.accent} height={5} />
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: t.surface2, borderRadius: 12, padding: 10 }}>
              <Txt size={11.5} color={t.muted}>You really burn</Txt>
              <Txt weight="display" size={20} style={num}>{int(r.tdee)}</Txt>
              <Txt size={11} color={t.faint}>kcal a day</Txt>
            </View>
            <View style={{ flex: 1, backgroundColor: t.surface2, borderRadius: 12, padding: 10 }}>
              <Txt size={11.5} color={t.muted}>Trend</Txt>
              <Txt weight="display" size={20} style={num}>{Math.abs(r.trendKgPerWeek) < 0.05 ? 'Steady' : `${r.trendKgPerWeek < 0 ? '−' : '+'}${rate(r.trendKgPerWeek)}`}</Txt>
              <Txt size={11} color={t.faint}>per week · plan {r.expectedKgPerWeek === 0 ? 'steady' : `${r.expectedKgPerWeek < 0 ? '−' : '+'}${rate(r.expectedKgPerWeek)}`}</Txt>
            </View>
          </View>
          <Txt size={13.5}>{r.message}</Txt>
          {Math.abs(r.change) >= 50 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Txt size={12} color={t.muted}>Suggested daily target</Txt>
                <Txt weight="displayHeavy" size={22} color={t.accent} style={num}>
                  {int(r.suggested)} <Txt size={13} color={t.muted}>kcal ({r.change > 0 ? '+' : '−'}{Math.abs(r.change)})</Txt>
                </Txt>
              </View>
              <PrimaryButton label="Apply" onPress={apply} style={{ minWidth: 110 }} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="checkmark-circle" size={18} color={t.good} />
              <Txt size={13.5} weight="bodyBold" color={t.good}>Your target is on point</Txt>
            </View>
          )}
          <Txt size={11.5} color={t.faint}>Based on {r.loggedDays} fully logged days and {r.weighIns} weigh-ins from the last 4 weeks.</Txt>
        </>
      )}

      <Pressable onPress={() => setHow(!how)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt size={13} weight="bodyBold" color={t.accent}>How it works</Txt>
        <Ionicons name={how ? 'chevron-up' : 'chevron-down'} size={14} color={t.accent} />
      </Pressable>
      {how ? (
        <Txt size={12.5} color={t.muted}>
          Formulas guess your daily burn from age, height, weight and activity, but everyone is different. Pantera compares what you actually eat with how your weight trend moves (about 7,700 kcal per kg of body weight) to measure your real burn. The trend line smooths out daily water-weight swings, days that look partly logged are skipped, and with little data the estimate leans on the formula. Changes are capped at 250 kcal per check-in. For best results, log every day and weigh in 3+ times a week, same time, same scale.
        </Txt>
      ) : null}
      {r.status === 'ready' && store.profile.coachLog?.length ? (
        <GhostButton label={`Last applied ${store.profile.coachLog[0].date} · ${int(store.profile.coachLog[0].target)} kcal`} onPress={() => setHow(true)} />
      ) : null}
    </Card>
  );
}
