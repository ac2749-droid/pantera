// App entry: Expo Router, plus the Android home-screen widget handler (runs even when the app is closed)
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  const { registerWidgetTaskHandler } = require('react-native-android-widget');
  const { widgetTaskHandler } = require('./src/widget/task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
