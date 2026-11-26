import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { showWeight, weightFrom, weightIn } from '../calc';
import { useNav } from '../nav';
import { useStore } from '../store';
import { fonts, useTheme } from '../theme';
import { Card, Chip, Eyebrow, Field, GhostButton, num, Txt, useGradId } from '../ui';
import { addDays, monthDay, parseYmd, shortDate, today } from '../util';

const RANGES: [string, number][] = [['1M', 30], ['3M', 91], ['All', 0]];

/** Body weight: log today’s weight, see the trend against your goal. */
export function WeightCard() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const gid = useGradId();
  const { units, goalWeightKg } = store.profile;
  const unit = units === 'us' ? 'lb' : 'kg';
  const [range, setRange] = useState(30);
  const [w, setW] = useState(0);
  const [input, setInput] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  const all = useMemo(() => [...store.weights].sort((a, b) => (a.date < b.date ? -1 : 1)), [store.weights]);
  const td = today();
  const from = range ? addDays(td, -(range - 1)) : all[0]?.date ?? td;
  const shown = all.filter((x) => x.date >= from);
  const latest = all[all.length - 1];
  const first = all[0];
  const change = latest && first && all.length > 1 ? latest.kg - first.kg : 0;
  const todays = all.find((x) => x.date === td);

  const save = () => {
    const v = parseFloat(input.replace(',', '.'));
    const kg = weightFrom(v, units);
    if (!(kg > 20 && kg < 400)) return nav.toast(`Enter your weight in ${unit}`);
    store.logWeight(td, kg);
    setInput('');
    nav.toast(todays ? 'Today’s weight updated' : 'Weight logged');
  };

  // Chart geometry
  const H = 170, pl = 40, pr = 10, pt = 12, pb = 24;
  const vals = shown.map((x) => weightIn(x.kg, units));
  const goalV = goalWeightKg ? weightIn(goalWeightKg, units) : null;
  const pool = goalV !== null && vals.length ? [...vals, goalV] : vals;
  let lo = Math.min(...pool), hi = Math.max(...pool);
  if (hi - lo < 4) {
    const mid = (hi + lo) / 2;
    lo = mid - 2;
    hi = mid + 2;
  }
  const pad = (hi - lo) * 0.12;
  lo = Math.floor(lo - pad);
  hi = Math.ceil(hi + pad);
  const t0 = parseYmd(from).getTime();
  const t1 = Math.max(parseYmd(td).getTime(), t0 + 86400000);
  const x = (d: string) => pl + ((parseYmd(d).getTime() - t0) / (t1 - t0)) * (w - pl - pr);
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo || 1));
  const line = shown.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(' ');
  const area = shown.length > 1 ? `${line} L${x(shown[shown.length - 1].date).toFixed(1)},${H - pb} L${x(shown[0].date).toFixed(1)},${H - pb} Z` : '';
  const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v));

  const recent = [...all].reverse().slice(0, showAll ? 60 : 5);

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Eyebrow inline>Weight</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {RANGES.map(([l, v]) => (
            <Chip key={l} label={l} active={range === v} onPress={() => setRange(v)} />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[
          ['Current', latest ? showWeight(latest.kg, units) : '—'],
          ['Change', all.length > 1 ? `${change > 0 ? '+' : change < 0 ? '−' : ''}${showWeight(Math.abs(change), units)}` : '—'],
          ['To goal', goalWeightKg && latest ? (Math.abs(latest.kg - goalWeightKg) < 0.25 ? 'Reached' : showWeight(Math.abs(latest.kg - goalWeightKg), units)) : '—'],
        ].map(([l, v]) => (
          <View key={l} style={{ flex: 1, backgroundColor: t.surface2, borderRadius: 12, padding: 10 }}>
            <Txt size={11.5} color={t.muted}>{l}</Txt>
            <Txt weight="displaySemi" size={16} style={num} numberOfLines={1} adjustsFontSizeToFit>{v}</Txt>
          </View>
        ))}
      </View>

      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: shown.length ? H : 60, justifyContent: 'center' }}>
        {shown.length === 0 ? (
          <Txt size={13.5} color={t.muted} style={{ textAlign: 'center' }}>{all.length ? 'No weigh-ins in this range.' : 'Log your weight to start your trend.'}</Txt>
        ) : w > 0 ? (
          <Svg width={w} height={H}>
            <Defs>
              <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={t.accent} stopOpacity={0.28} />
                <Stop offset="1" stopColor={t.accent} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {ticks.map((v) => (
              <Line key={'g' + v} x1={pl} x2={w - pr} y1={y(v)} y2={y(v)} stroke={t.line} strokeWidth={1} />
            ))}
            {ticks.map((v) => (
              <SvgText key={'t' + v} x={pl - 6} y={y(v) + 4} fontSize={10} fill={t.muted} textAnchor="end" fontFamily={fonts.bodySemi}>
                {v}
              </SvgText>
            ))}
            {goalV !== null ? (
              <>
                <Line x1={pl} x2={w - pr} y1={y(goalV)} y2={y(goalV)} stroke={t.good} strokeWidth={1.5} strokeDasharray="5 4" />
                <SvgText x={w - pr} y={y(goalV) - 5} fontSize={10} fill={t.good} textAnchor="end" fontFamily={fonts.bodyBold}>
                  Goal
                </SvgText>
              </>
            ) : null}
            {area ? <Path d={area} fill={`url(#${gid})`} /> : null}
            {shown.length > 1 ? <Path d={line} stroke={t.accent} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" /> : null}
            {shown.map((p, i) => (
              <Circle key={p.date} cx={x(p.date)} cy={y(vals[i])} r={i === shown.length - 1 ? 4.5 : 3} fill={i === shown.length - 1 ? t.accent : t.surface} stroke={t.accent} strokeWidth={2} />
            ))}
            <SvgText x={pl} y={H - 6} fontSize={10} fill={t.muted} textAnchor="start" fontFamily={fonts.bodySemi}>
              {monthDay(from)}
            </SvgText>
            <SvgText x={w - pr} y={H - 6} fontSize={10} fill={t.muted} textAnchor="end" fontFamily={fonts.bodySemi}>
              Today
            </SvgText>
          </Svg>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field
            label={todays ? `Today: ${showWeight(todays.kg, units)} · update (${unit})` : `Today’s weight (${unit})`}
            value={input}
            onChangeText={setInput}
            keyboardType="decimal-pad"
            placeholder={latest ? String(weightIn(latest.kg, units)) : units === 'us' ? 'e.g. 172.4' : 'e.g. 78.2'}
            returnKeyType="done"
            onSubmitEditing={save}
          />
        </View>
        <GhostButton label={todays ? 'Update' : 'Log'} onPress={save} disabled={!input.trim()} style={{ minWidth: 84 }} />
      </View>

      {recent.length ? (
        <View>
          {recent.map((p) => (
            <View key={p.date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.line }}>
              <Txt size={13.5} color={t.muted} style={{ flex: 1 }}>{p.date === td ? 'Today' : shortDate(p.date)}</Txt>
              <Txt size={14} weight="bodyBold" style={[num, { marginRight: 10 }]}>{showWeight(p.kg, units)}</Txt>
              <Pressable
                hitSlop={8}
                accessibilityLabel={pending === p.date ? 'Confirm delete' : `Delete weigh-in from ${shortDate(p.date)}`}
                onPress={() => {
                  if (pending !== p.date) return setPending(p.date);
                  store.removeWeight(p.date);
                  setPending(null);
                }}
                style={{ padding: 4 }}
              >
                {pending === p.date ? <Txt size={12} weight="bodyHeavy" color={t.warn}>Delete?</Txt> : <Ionicons name="close" size={17} color={t.faint} />}
              </Pressable>
            </View>
          ))}
          {all.length > 5 ? (
            <Txt size={13} weight="bodyBold" color={t.accent} onPress={() => setShowAll(!showAll)} style={{ paddingTop: 8 }}>
              {showAll ? 'Show less' : `Show all ${all.length}`}
            </Txt>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
