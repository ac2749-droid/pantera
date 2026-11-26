import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { loadWidgetData } from './data';
import { PanteraWidget } from './PanteraWidget';

/** Runs when Android asks for the widget (added, resized, every 30 minutes), even if the app is closed. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_DELETED') return;
  const data = await loadWidgetData();
  props.renderWidget(<PanteraWidget data={data} width={props.widgetInfo.width} />);
}
