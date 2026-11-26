import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { NutrientInfo, NutrientKey, Nutrients, NUTRIENTS } from '../foods';
import { useTheme } from '../theme';
import { dailyValue } from '../targets';
import { Bar, num, Txt } from '../ui';
import { fmtAmount, r0 } from '../util';

const GROUPS: [NutrientInfo['group'], string][] = [['general', 'General'], ['vitamins', 'Vitamins'], ['minerals', 'Minerals']];
let rememberAll = false; // keep the choice while the app is open

function Line({ x, value, compact, missing, onPress }: { x: NutrientInfo; value: number; compact?: boolean; missing?: boolean; onPress?: () => void }) {
  const t = useTheme();
  const p = x.dv ? value / x.dv : 0;
  const over = x.kind === 'limit' && p > 1;
  const color = x.kind === 'limit' ? (over ? t.warn : t.faint) : p >= 1 ? t.good : t.accent;
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityHint={onPress ? 'Shows where it came from' : undefined}
      style={({ pressed }) => ({ gap: 5, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <Txt size={compact ? 13.5 : 14} style={{ flexShrink: 1 }}>
          {x.label}
          {x.kind === 'limit' ? <Txt size={10} color={t.faint} weight="bodyBold">{'  LIMIT'}</Txt> : null}
        </Txt>
        <Txt size={12.5} color={over ? t.warn : t.muted} style={num}>
          {missing ? '–' : fmtAmount(value, x.unit)} {x.unit}
          {x.dv ? ` / ${x.dv.toLocaleString()}${missing ? '' : ` · ${r0(p * 100)}%`}` : ''}
        </Txt>
      </View>
      {x.dv ? <Bar value={value} max={x.dv} color={color} height={5} /> : null}
    </Pressable>
  );
}

/** Nutrients with % Daily Value: the key ones first, the full list (grouped) on demand. */
export function NutrientPanel({ n, coverage, scale = 1, unknown, onPick, targets }: { n: Nutrients; coverage?: number; scale?: number; unknown?: NutrientKey[]; onPick?: (k: NutrientKey) => void; targets?: Partial<Record<NutrientKey, number>> }) {
  const t = useTheme();
  const [all, setAll] = useState(rememberAll);
  const toggle = () => {
    rememberAll = !all;
    setAll(!all);
  };
  const v = (x: NutrientInfo) => (n[x.k] || 0) * scale;
  const partial = coverage !== undefined && coverage < 0.95;
  const pick = (k: NutrientKey) => (onPick ? () => onPick(k) : undefined);
  // Your own targets stand in for the daily values
  const own = (x: NutrientInfo) => ({ ...x, dv: dailyValue({ nutrientTargets: targets }, x.k, x.dv) });

  return (
    <View style={{ gap: 11 }}>
      {onPick ? <Txt size={12.5} color={t.muted} style={{ marginTop: -6 }}>Tap one to see where it came from and what would add more.</Txt> : null}
      {!all
        ? NUTRIENTS.filter((x) => x.key).map((x) => <Line key={x.k} x={own(x)} value={v(x)} missing={unknown?.includes(x.k)} onPress={pick(x.k)} />)
        : GROUPS.map(([g, title]) => (
            <View key={g} style={{ gap: 10 }}>
              <Txt weight="displaySemi" size={14} color={t.accent} style={{ marginTop: g === 'general' ? 0 : 6 }}>{title}</Txt>
              {NUTRIENTS.filter((x) => x.group === g).map((x) => (
                <Line key={x.k} x={own(x)} value={v(x)} compact missing={unknown?.includes(x.k)} onPress={pick(x.k)} />
              ))}
            </View>
          ))}
      {partial && all ? (
        <View style={{ flexDirection: 'row', gap: 8, backgroundColor: t.surface2, borderRadius: 10, padding: 10 }}>
          <Ionicons name="information-circle-outline" size={16} color={t.muted} style={{ marginTop: 1 }} />
          <Txt size={12} color={t.muted} style={{ flex: 1 }}>
            {coverage === 0
              ? 'These foods don’t list vitamins and minerals, so the full list can’t be filled in.'
              : `Vitamins and minerals are counted for ${r0((coverage ?? 0) * 100)}% of the calories here. Some foods (custom, scanned or mixed dishes) don’t list them, so real totals are likely higher.`}
          </Txt>
        </View>
      ) : null}
      <Pressable onPress={toggle} hitSlop={6} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 4 }}>
        <Txt size={13.5} weight="bodyBold" color={t.accent}>{all ? 'Show key nutrients' : `Show all ${NUTRIENTS.length} nutrients`}</Txt>
        <Ionicons name={all ? 'chevron-up' : 'chevron-down'} size={16} color={t.accent} />
      </Pressable>
    </View>
  );
}
