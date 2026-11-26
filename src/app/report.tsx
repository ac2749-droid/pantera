import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';
import { GLASS_ML, showWater, showWeight } from '../calc';
import { NutrientPanel } from '../components/NutrientPanel';
import { ModalHeader } from '../components/Screen';
import { useNav } from '../nav';
import { buildWeek, insights, thisWeek } from '../report';
import { shareReportPdf } from '../reportFile';
import { weekPdfLines } from '../reportPdf';
import { carbsShown } from '../targets';
import { useStore } from '../store';
import { fonts, useTheme } from '../theme';
import { Card, Eyebrow, GhostButton, IconButton, num, Txt, PrimaryButton } from '../ui';
import { addDays, int, monthDay, r0, weekdayShort, today } from '../util';

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  const t = useTheme();
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1, padding: 14, gap: 2 }}>
      <Txt size={12} color={t.muted}>{label}</Txt>
      <Txt weight="display" size={22} color={tone ?? t.ink} style={num} numberOfLines={1} adjustsFontSizeToFit>{value}</Txt>
      {sub ? <Txt size={11.5} color={t.faint}>{sub}</Txt> : null}
    </Card>
  );
}

export default function Report() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ week?: string }>();
  const current = thisWeek();
  const [start, setStart] = useState(params.week === 'last' ? addDays(current, -7) : current);
  const { profile } = store;
  const units = profile.units;

  const input = useMemo(
    () => ({ days: store.days, weights: store.weights, water: store.water, exercise: store.exercise, targets: profile.targets, dayTargets: profile.dayTargets, nutrientTargets: profile.nutrientTargets, exerciseAddsCalories: profile.exerciseAddsCalories, waterGoalMl: profile.waterGoalMl }),
    [store.days, store.weights, store.water, store.exercise, profile.targets, profile.dayTargets, profile.nutrientTargets, profile.exerciseAddsCalories, profile.waterGoalMl],
  );
  const r = useMemo(() => buildWeek(input, start), [input, start]);
  const T = r.target; // the average target of the days logged
  const prev = useMemo(() => buildWeek(input, addDays(start, -7)), [input, start]);
  const notes = useMemo(() => insights(r, T, { goal: profile.calc?.goal ?? 0, showWeight: (kg) => showWeight(kg, units), prev }), [r, T, profile.calc, units, prev]);
  const isCurrent = start === current;
  const [w, setW] = useState(0);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const range = `${monthDay(r.start)} – ${monthDay(r.end)}`;
  const glass = GLASS_ML(units);
  const delta = r.avg.kcal - T.kcal;
  const vsPrev = prev.logged && r.logged ? r.avg.kcal - prev.avg.kcal : null;

  const share = () => {
    const lines = [
      `📊 My Pantera week · ${range}`,
      `Calories: ${int(r.avg.kcal)} avg (target ${int(T.kcal)}) · ${r.onTarget}/${r.logged} days on target`,
      `Protein: ${r0(r.avg.p)} g avg · goal hit ${r.proteinDays} days`,
      r.weight.change !== undefined ? `Weight: ${r.weight.change <= 0 ? '−' : '+'}${showWeight(Math.abs(r.weight.change), units)}` : '',
      `Days logged: ${r.logged}/${r.elapsed}`,
    ].filter(Boolean);
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  const savePdf = async () => {
    const lines = weekPdfLines(r, { days: store.days, exercise: store.exercise, units, netCarbs: profile.netCarbs, today: today() });
    const saved = await shareReportPdf(`Pantera-week-${r.start}`, lines, units === 'us' ? 'letter' : 'a4');
    if (!saved.ok) nav.toast(saved.reason);
  };

  // Daily calories chart
  const H = 150, pl = 34, pr = 6, pt = 10, pb = 22;
  const maxV = Math.max(...r.daily.map((d) => d.target * 1.3), ...r.daily.map((d) => d.kcal));
  const varies = r.daily.some((d) => d.target !== r.daily[0].target);
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / maxV);
  const bw = w > 0 ? (w - pl - pr) / 7 : 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Weekly report" onClose={close} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton label="Previous week" onPress={() => setStart(addDays(start, -7))}>
            <Ionicons name="chevron-back" size={20} color={t.ink} />
          </IconButton>
          <View style={{ alignItems: 'center' }}>
            <Txt weight="display" size={19}>{range}</Txt>
            <Txt size={12.5} color={t.muted}>{isCurrent ? 'This week so far' : start === addDays(current, -7) ? 'Last week' : `${r.logged} of 7 days logged`}</Txt>
          </View>
          <IconButton label="Next week" disabled={isCurrent} onPress={() => setStart(addDays(start, 7))}>
            <Ionicons name="chevron-forward" size={20} color={t.ink} />
          </IconButton>
        </View>

        {r.logged === 0 ? (
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 28 }}>
            <Ionicons name="calendar-outline" size={34} color={t.faint} />
            <Txt size={14.5} color={t.muted} style={{ textAlign: 'center' }}>Nothing logged this week{isCurrent ? ' yet' : ''}. Your report fills in as you log meals.</Txt>
          </Card>
        ) : (
          <>
            <Card style={{ gap: 10 }}>
              <Eyebrow>Average calories</Eyebrow>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <Txt weight="displayHeavy" size={34} style={num}>{int(r.avg.kcal)}</Txt>
                <Txt size={14} color={Math.abs(delta) <= T.kcal * 0.1 ? t.good : t.warn} weight="bodyBold">
                  {Math.abs(delta) <= T.kcal * 0.1 ? 'On target' : `${int(Math.abs(delta))} ${delta > 0 ? 'over' : 'under'}`}
                </Txt>
                {vsPrev !== null ? (
                  <Txt size={13} color={t.muted}>
                    {vsPrev >= 0 ? '▲' : '▼'} {int(Math.abs(vsPrev))} vs last week
                  </Txt>
                ) : null}
              </View>
              <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: H }}>
                {w > 0 ? (
                  <Svg width={w} height={H}>
                    {[0, T.kcal].map((v) => (
                      <SvgText key={v} x={pl - 6} y={y(v) + 4} fontSize={9.5} fill={t.muted} textAnchor="end" fontFamily={fonts.bodySemi}>{v.toLocaleString()}</SvgText>
                    ))}
                    {r.daily.map((d, i) => {
                      const cx = pl + bw * i + bw / 2;
                      const bW = Math.min(26, bw * 0.6);
                      const over = d.kcal > d.target * 1.1;
                      return (
                        <G key={d.d}>
                          {d.logged ? <Rect x={cx - bW / 2} y={y(d.kcal)} width={bW} height={Math.max(2, y(0) - y(d.kcal))} rx={4} fill={over ? t.warn : t.accent} /> : <Rect x={cx - bW / 2} y={y(0) - 2} width={bW} height={2} rx={1} fill={t.line} />}
                          <SvgText x={cx} y={H - 6} fontSize={10} fill={t.muted} textAnchor="middle" fontFamily={fonts.bodySemi}>{weekdayShort(d.d)}</SvgText>
                        </G>
                      );
                    })}
                    {varies ? (
                      r.daily.map((d, i) => <Line key={'t' + d.d} x1={pl + bw * i + 1} x2={pl + bw * (i + 1) - 1} y1={y(d.target)} y2={y(d.target)} stroke={t.ink} strokeWidth={1.2} />)
                    ) : (
                      <Line x1={pl} x2={w - pr} y1={y(T.kcal)} y2={y(T.kcal)} stroke={t.ink} strokeWidth={1.2} strokeDasharray="5 4" />
                    )}
                  </Svg>
                ) : null}
              </View>
            </Card>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Tile label="Days logged" value={`${r.logged} / ${r.elapsed}`} sub={`${r.onTarget} within 10% of target`} />
              <Tile label="Protein" value={`${r0(r.avg.p)} g`} sub={`Goal ${r0(T.p)} g · hit ${r.proteinDays} day${r.proteinDays === 1 ? '' : 's'}`} tone={r.avg.p >= T.p * 0.9 ? t.good : undefined} />
              <Tile label="Weight" value={r.weight.change !== undefined ? `${r.weight.change <= 0 ? '−' : '+'}${showWeight(Math.abs(r.weight.change), units)}` : r.weight.end !== undefined ? showWeight(r.weight.end, units) : '—'} sub={r.weight.change !== undefined ? `Now ${showWeight(r.weight.end!, units)}` : 'Log weigh-ins on Trends'} />
              <Tile label="Water" value={r.water.daysTracked ? `${Math.round(r.water.avgMl / glass)} glasses` : '—'} sub={r.water.daysTracked ? `${showWater(r.water.avgMl, units)} avg · goal met ${r.water.goalDays}×` : 'Tap the drops on the Diary'} />
            </View>

            <Card style={{ gap: 10 }}>
              <Eyebrow>Where your calories came from</Eyebrow>
              <View style={{ flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: t.surface2 }}>
                <View style={{ flex: r.split.p || 0.01, backgroundColor: t.protein }} />
                <View style={{ flex: r.split.c || 0.01, backgroundColor: t.carbs }} />
                <View style={{ flex: r.split.f || 0.01, backgroundColor: t.fat }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {([['Protein', r.split.p, t.protein, r.avg.p], [profile.netCarbs ? 'Net carbs' : 'Carbs', r.split.c, t.carbs, carbsShown(r.avgN, profile.netCarbs)], ['Fat', r.split.f, t.fat, r.avg.f]] as const).map(([l, pct, c, g]) => (
                  <View key={l} style={{ alignItems: 'center', flex: 1 }}>
                    <Txt weight="bodyHeavy" size={15} color={c} style={num}>{pct}%</Txt>
                    <Txt size={12} color={t.muted}>{l} · {r0(g)} g</Txt>
                  </View>
                ))}
              </View>
            </Card>

            {notes.length ? (
              <Card style={{ gap: 12 }}>
                <Eyebrow>Highlights</Eyebrow>
                {notes.map((n, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <Ionicons name={n.kind === 'win' ? 'checkmark-circle' : 'flag'} size={18} color={n.kind === 'win' ? t.good : t.carbs} style={{ marginTop: 1 }} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt size={14}>{n.text}</Txt>
                      {n.tip ? <Txt size={12.5} color={t.muted}>{n.tip}</Txt> : null}
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            <Card style={{ gap: 11 }}>
              <Eyebrow>Nutrients · daily average</Eyebrow>
              <NutrientPanel n={r.avgN} coverage={r.coverage} targets={profile.nutrientTargets} />
            </Card>

            {r.topFoods.length ? (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <View style={{ padding: 16, paddingBottom: 6 }}>
                  <Eyebrow>Biggest calorie sources</Eyebrow>
                </View>
                {r.topFoods.map((f, i) => (
                  <View key={f.name} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.line, gap: 10 }}>
                    <Txt weight="bodyHeavy" size={13} color={t.faint} style={{ width: 16 }}>{i + 1}</Txt>
                    <Txt size={14} weight="bodySemi" style={{ flex: 1 }} numberOfLines={1}>{f.name}</Txt>
                    <Txt size={12.5} color={t.muted}>{f.times}×</Txt>
                    <Txt size={14} weight="bodyHeavy" style={[num, { minWidth: 60, textAlign: 'right' }]}>{int(f.kcal)}</Txt>
                  </View>
                ))}
              </Card>
            ) : null}

            <PrimaryButton label="Save or print as PDF" onPress={savePdf} />
            <GhostButton label="Share a short summary" onPress={share} />
          </>
        )}
      </ScrollView>
    </View>
  );
}
