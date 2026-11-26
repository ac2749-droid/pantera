import { useEffect } from 'react';
import { Platform } from 'react-native';
import { burnedOn } from '../exercise';
import { useStore } from '../store';
import { dayBudget } from '../targets';
import { today } from '../util';
import { buildWidgetData } from '../widget/data';

/** Refreshes the home-screen widget a moment after anything it shows changes. Android only. */
export function WidgetSync() {
  const { ready, days, water, profile, fasts, exercise } = useStore();
  useEffect(() => {
    if (!ready || Platform.OS !== 'android') return;
    const id = setTimeout(async () => {
      try {
        const { requestWidgetUpdate } = await import('react-native-android-widget');
        const { PanteraWidget } = await import('../widget/PanteraWidget');
        const d = today();
        const data = buildWidgetData({ entries: days[d] ?? [], targets: dayBudget(profile, d, burnedOn(exercise[d])), netCarbs: profile.netCarbs, waterMl: water[d] ?? 0, waterGoalMl: profile.waterGoalMl, units: profile.units, fast: fasts.current });
        await requestWidgetUpdate({ widgetName: 'Pantera', renderWidget: (info) => <PanteraWidget data={data} width={info.width} /> });
      } catch {
        // No widget on the home screen, or not supported: nothing to do
      }
    }, 1200);
    return () => clearTimeout(id);
  }, [ready, days, water, profile, fasts, exercise]);
  return null;
}
