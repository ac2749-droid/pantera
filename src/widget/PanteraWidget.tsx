import { FlexWidget, OverlapWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetData } from './data';

const C = { bg1: '#1D1147', bg2: '#0B0720', track: '#2C1F63', accent: '#3EE7FF', ink: '#F4F0FF', muted: '#B1A5DA', faint: '#7D72A8', warn: '#FF7A63', good: '#45F0B5', p: '#5B8CFF', c: '#F2BF4E', f: '#B38CFF' } as const;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

function ring(size: number, pct: number, over: boolean) {
  const r = size / 2 - 6, circ = 2 * Math.PI * r, off = circ * (1 - Math.min(1, Math.max(0, pct)));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${C.track}" stroke-width="8" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${over ? C.warn : C.accent}" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="${circ} ${circ}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

function MacroBar({ label, v, t, color, width }: { label: string; v: number; t: number; color: `#${string}`; width: number }) {
  const fill = Math.max(2, Math.min(1, t ? v / t : 0) * width);
  return (
    <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
      <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
        <TextWidget text={label} style={{ fontSize: 10, color: C.muted }} />
        <TextWidget text={`${fmt(v)} / ${fmt(t)} g`} style={{ fontSize: 10, color: C.ink }} />
      </FlexWidget>
      <FlexWidget style={{ width, height: 4, borderRadius: 2, backgroundColor: C.track, marginTop: 2 }}>
        <FlexWidget style={{ width: fill, height: 4, borderRadius: 2, backgroundColor: color }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function Button({ text, uri }: { text: string; uri: string }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }} style={{ flex: 1, height: 28, borderRadius: 14, backgroundColor: '#241A53', alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text={text} style={{ fontSize: 11, color: C.accent, fontWeight: '700' }} />
    </FlexWidget>
  );
}

/** Home-screen widget: calories left, macros, water/fasting, and quick actions. */
export function PanteraWidget({ data, width = 300 }: { data: WidgetData; width?: number }) {
  const left = data.target - data.kcal;
  const over = left < 0;
  const ringSize = 74;
  const barW = Math.max(80, width - ringSize - 12 * 2 - 12);
  const glasses = Math.round(data.waterMl / data.glassMl), goalGlasses = Math.max(1, Math.round(data.waterGoalMl / data.glassMl));
  let extra = `💧 ${glasses}/${goalGlasses} glasses`;
  if (data.fast) {
    const el = data.now - data.fast.start;
    const h = Math.floor(el / 3600000), m = Math.floor((el % 3600000) / 60000);
    extra += `   ⏳ ${h}h ${String(m).padStart(2, '0')}m / ${data.fast.goalH}h`;
  }
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'space-between', padding: 12, borderRadius: 24, backgroundGradient: { from: C.bg1, to: C.bg2, orientation: 'TL_BR' } }}
    >
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', alignItems: 'center', flexGap: 12 }}>
        <OverlapWidget style={{ width: ringSize, height: ringSize }}>
          <SvgWidget svg={ring(ringSize, data.target ? data.kcal / data.target : 0, over)} style={{ width: ringSize, height: ringSize }} />
          <FlexWidget style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
            <TextWidget text={fmt(Math.abs(left))} style={{ fontSize: 17, color: over ? C.warn : C.ink, fontWeight: '800' }} />
            <TextWidget text={over ? 'kcal over' : 'kcal left'} style={{ fontSize: 9, color: C.muted }} />
          </FlexWidget>
        </OverlapWidget>
        <FlexWidget style={{ flex: 1, flexDirection: 'column', flexGap: 3 }}>
          <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
            <TextWidget text="PANTERA" style={{ fontSize: 10, color: C.accent, fontWeight: '800' }} />
            <TextWidget text={`${fmt(data.kcal)} / ${fmt(data.target)}`} style={{ fontSize: 10, color: C.muted }} />
          </FlexWidget>
          <MacroBar label="Protein" v={data.p} t={data.tp} color={C.p} width={barW} />
          <MacroBar label="Carbs" v={data.c} t={data.tc} color={C.c} width={barW} />
          <MacroBar label="Fat" v={data.f} t={data.tf} color={C.f} width={barW} />
          <TextWidget text={extra} style={{ fontSize: 10, color: C.muted }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', flexGap: 8 }}>
        <Button text="🎙 Say it" uri="pantera://assistant?voice=1" />
        <Button text="▦ Scan" uri="pantera://scan" />
        <Button text="⚡ Quick add" uri="pantera://quick-add" />
      </FlexWidget>
    </FlexWidget>
  );
}
