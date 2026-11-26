/** Thin wrapper around expo-notifications for Pantera's local reminders. Does nothing on web. */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PlannedNotification } from './reminders';

const native = Platform.OS !== 'web';
const CHANNEL = 'reminders';
let ready = false;

async function setup() {
  if (!native || ready) return;
  ready = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders',
      description: 'Meal, water and weigh-in reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 180],
      lightColor: '#3EE7FF',
    }).catch(() => {});
  }
}

export type Permission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function permissionStatus(): Promise<Permission> {
  if (!native) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

export async function askPermission(): Promise<Permission> {
  if (!native) return 'unsupported';
  await setup();
  const p = await Notifications.requestPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

/** Replace all scheduled reminders with this plan. */
export async function applyPlan(plan: PlannedNotification[]): Promise<void> {
  if (!native) return;
  await setup();
  // Only replace reminders; other alerts (like the fasting timer) stay scheduled
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  for (const n of scheduled) if (n.identifier.startsWith('pantera-')) await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {});
  if (!plan.length || (await permissionStatus()) !== 'granted') return;
  for (const n of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: { title: n.title, body: n.body, data: n.data },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.date, channelId: CHANNEL },
    }).catch(() => {});
  }
}

/** A sample reminder a few seconds from now, so you can see what they look like. */
export async function sendTest(): Promise<boolean> {
  if (!native) return false;
  await setup();
  if ((await permissionStatus()) !== 'granted') return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Pantera reminders are on ✅', body: 'This is how your reminders will look. Tap to open the app.', data: { kind: 'water' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: CHANNEL },
  });
  return true;
}

/** Alert when a fast reaches its goal. Replaces any earlier fasting alert. */
export async function scheduleFastAlert(at: Date, hours: number): Promise<void> {
  if (!native) return;
  await setup();
  await Notifications.cancelScheduledNotificationAsync('fast-goal').catch(() => {});
  if (at.getTime() <= Date.now() + 5000) return;
  if ((await permissionStatus()) !== 'granted') {
    if ((await askPermission()) !== 'granted') return;
  }
  await Notifications.scheduleNotificationAsync({
    identifier: 'fast-goal',
    content: { title: 'Fast complete 🎉', body: `You reached your ${hours}-hour goal. Tap to end your fast.`, data: { kind: 'fast' } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL },
  }).catch(() => {});
}
export async function cancelFastAlert(): Promise<void> {
  if (!native) return;
  await Notifications.cancelScheduledNotificationAsync('fast-goal').catch(() => {});
}

export { Notifications };
