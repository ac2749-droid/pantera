import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { GrowingBar } from '../../components/motion';
import { Screen } from '../../components/Screen';
import { WeightCard } from '../../components/WeightCard';
import { burnedOn } from '../../exercise';
import { sum } from '../../foods';
import { useNav } from '../../nav';
import { useStore } from '../../store';
import { carbsShown, dayBudget } from '../../targets';
import { fonts, useTheme } from '../../theme';
import { Card, Chip, Eyebrow, num, Txt, useGradId } from '../../ui';
import { addDays, int, monthDay, r0, r1, shortDate, today, weekdayShort } from '../../util';

function niceStep(x: number) {
  const p = Math.pow(10, Math.floor(Math.log10(x || 1)));
  const m = x / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}

export default function Trends() {
  const t = useTheme();
  const store = useStore();
  const nav = useNav();
  const [range, setRange] = useState(7);
  const [w, setW] = useState(0);
  const barFill = useGradId();
  const td = today();

  const days = Array.from({ length: range }, (_, i) => {
    const d = addDays(td, -(range - 1 - i));
    const e = store.days[d] || [];
    return { d, tot: sum(e), logged: e.length > 0, goal: dayBudget(store.profile, d, burnedOn(store.exercise[d])) };
  });
  const logged = days.filter((x) => x.logged);
  const avg = (k: 'kcal' | 'p' | 'fib') => (logged.length ? logged.reduce((a, x) => a + x.tot[k], 0) / logged.length : 0);
  const within = logged.filter((x) => Math.abs(x.tot.kcal - x.goal.kcal) <= x.goal.kcal * 0.1).length;
  // Averages are compared with the average target of the days they cover
  const mean = (k: 'kcal' | 'p') => (logged.length ? logged : days).reduce((a, x) => a + x.goal[k], 0) / (logged.length || days.length);
  const T = { kcal: mean('kcal'), p: mean('p') };
  const varies = days.some((x) => x.goal.kcal !== days[0].goal.kcal);

  // Chart geometry
  const H = 220, pl = 42, pr = 8, pt = 12, pb = 26;
  const maxV = Math.max(...days.map((x) => x.goal.kcal * 1.25), ...days.map((x) => x.tot.kcal));
  const step = niceStep(maxV / 4);
  const top = Math.ceil(maxV / step) * step;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / top);
  const bw = w > 0 ? (w - pl - pr) / range : 0;
  const barW = Math.max(3, Math.min(28, bw * 0.62));
  const ticks: number[] = [];
  for (let v = 0; v <= top + 0.1; v += step) ticks.push(v);

  const stats: [string, string, string][] = [
    ['Avg calories', int(avg('kcal')), `Target ${int(T.kcal)}`],
    ['Avg protein', `${r0(avg('p'))} g`, `Target ${r0(T.p)} g`],
    ['Avg fiber', `${r1(avg('fib'))} g`, 'Daily value 28 g'],
    ['Days logged', `${logged.length} / ${range}`, `${within} within 10% of target`],
  ];

  return (
    <Screen>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <Txt weight="display" size={21}>Trends</Txt>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[7, 14, 30].map((v) => (
            <Chip key={v} label={`${v}d`} active={range === v} onPress={() => setRange(v)} />
          ))}
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/report')}
        accessibilityRole="button"
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? t.surface2 : t.surface, borderColor: t.accent, borderWidth: 1, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14 })}
      >
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="document-text" size={18} color={t.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt weight="bodyBold" size={15}>Weekly report</Txt>
          <Txt size={12.5} color={t.muted}>Averages, highlights, nutrient gaps and your top foods</Txt>
        </View>
        <Ionicons name="chevron-forward" size={18} color={t.faint} />
      </Pressable>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {stats.map(([l, v, s]) => (
          <Card key={l} style={{ flexBasis: '47%', flexGrow: 1, padding: 14 }}>
            <Txt size={12} color={t.muted}>{l}</Txt>
            <Txt weight="display" size={24} style={num}>{v}</Txt>
            <Txt size={11.5} color={t.faint}>{s}</Txt>
          </Card>
        ))}
      </View>

      <WeightCard />

      <Card>
        <Eyebrow>Calories per day</Eyebrow>
        <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
          {w > 0 ? (
            <Svg width={w} height={H}>
              <Defs>
                <LinearGradient id={barFill} x1="0" y1={pt} x2="0" y2={H - pb} gradientUnits="userSpaceOnUse">
                  <Stop offset="0" stopColor={t.accent} />
                  <Stop offset="1" stopColor={t.grad2} />
                </LinearGradient>
              </Defs>
              {ticks.map((v) => (
                <Line key={'g' + v} x1={pl} x2={w - pr} y1={y(v)} y2={y(v)} stroke={t.line} strokeWidth={1} />
              ))}
              {ticks.map((v) => (
                <SvgText key={'t' + v} x={pl - 6} y={y(v) + 4} fontSize={10} fill={t.muted} textAnchor="end" fontFamily={fonts.bodySemi}>
                  {v.toLocaleString()}
                </SvgText>
              ))}
              {days.map((x, i) => {
                const cx = pl + bw * i + bw / 2;
                const v = x.tot.kcal;
                const showLabel = range <= 7 || (range === 14 ? i % 2 === 1 : i % 5 === (range - 1) % 5);
                return (
                  <React.Fragment key={x.d}>
                    {v > 0 ? (
                      // Keyed by the range so the bars grow again when it changes
                      <GrowingBar key={`bar-${range}`} x={cx - barW / 2} top={y(v)} base={y(0)} width={barW} radius={Math.min(5, barW / 2)} fill={v > x.goal.kcal * 1.1 ? t.warn : `url(#${barFill})`} delay={i * Math.round(240 / range)} />
                    ) : null}
                    {showLabel ? (
                      <SvgText x={cx} y={H - 8} fontSize={10} fill={t.muted} textAnchor="middle" fontFamily={fonts.bodySemi}>
                        {range <= 7 ? weekdayShort(x.d) : monthDay(x.d)}
                      </SvgText>
                    ) : null}
                  </React.Fragment>
                );
              })}
              {varies ? (
                days.map((x, i) => <Line key={'t' + x.d} x1={pl + bw * i + 1} x2={pl + bw * (i + 1) - 1} y1={y(x.goal.kcal)} y2={y(x.goal.kcal)} stroke={t.ink} strokeWidth={1.5} />)
              ) : (
                <Line x1={pl} x2={w - pr} y1={y(T.kcal)} y2={y(T.kcal)} stroke={t.ink} strokeWidth={1.5} strokeDasharray="5 4" />
              )}
            </Svg>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 }}>
          {[[t.accent, 'Eaten'], [t.warn, '10%+ over target']].map(([c, l]) => (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: c }} />
              <Txt size={12} color={t.muted}>{l}</Txt>
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 14, borderTopWidth: 2, borderStyle: 'dashed', borderColor: t.ink }} />
            <Txt size={12} color={t.muted}>Target</Txt>
          </View>
        </View>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <View style={{ padding: 16, paddingBottom: 6 }}>
          <Eyebrow>Daily totals</Eyebrow>
        </View>
        {logged.length === 0 ? (
          <Txt size={14} color={t.muted} style={{ padding: 16, paddingTop: 0 }}>No days logged in this range yet. Log a few meals and your trends will show up here.</Txt>
        ) : (
          [...logged].reverse().map((x) => (
            <Pressable
              key={x.d}
              onPress={() => {
                nav.setDate(x.d);
                router.navigate('/');
              }}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: t.line, backgroundColor: pressed ? t.surface2 : 'transparent' })}
            >
              <Txt weight="bodyBold" size={14} color={t.accent} style={{ flex: 1 }}>{shortDate(x.d)}</Txt>
              <Txt size={13} color={t.muted} style={[num, { marginRight: 12 }]}>P {r0(x.tot.p)} · C {r0(carbsShown(x.tot, store.profile.netCarbs))} · F {r0(x.tot.f)}</Txt>
              <Txt weight="bodyHeavy" size={14} style={num}>{int(x.tot.kcal)}</Txt>
            </Pressable>
          ))
        )}
      </Card>
    </Screen>
  );
}

