import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { GLASS_ML } from '../calc';
import { MealKey } from '../foods';
import { useNav } from '../nav';
import { applyPlan, Notifications } from '../notify';
import { anyOn, planNotifications } from '../reminders';
import { burnedOn } from '../exercise';
import { dayBudget } from '../targets';
import { today } from '../util';
import { useStore } from '../store';

/** Keeps the phone's scheduled reminders in step with your diary, and opens the right screen when one is tapped. */
export function ReminderSync() {
  const { ready, days, water, weights, profile, exercise } = useStore();
  const nav = useNav();
  const last = useRef('');
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);

  // Re-plan shortly after anything relevant changes
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return;
    const id = setTimeout(() => {
      const r = profile.reminders;
      const plan = anyOn(r)
        ? planNotifications(r, { now: new Date(), days, water, waterGoalMl: profile.waterGoalMl, glassMl: GLASS_ML(profile.units), weights, kcalTarget: dayBudget(profile, today(), burnedOn(exercise[today()])).kcal })
        : [];
      const sig = plan.map((p) => p.id + p.body).join('|');
      if (sig === last.current) return;
      last.current = sig;
      applyPlan(plan).catch(() => {});
    }, 1500);
    return () => clearTimeout(id);
  }, [ready, days, water, weights, exercise, profile]);

  // Tapping a reminder opens the matching screen
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const open = (data: { kind?: string; meal?: MealKey } | undefined) => {
      if (!data?.kind) return;
      setTimeout(() => {
        if (data.kind === 'meal' && data.meal) navRef.current.go({ type: 'add', meal: data.meal });
        else if (data.kind === 'weekly') router.push('/report?week=last');
        else if (data.kind === 'weigh') router.navigate('/trends');
        else if (data.kind === 'fast') router.push('/fasting');
        else router.navigate('/');
      }, 300);
    };
    const sub = Notifications.addNotificationResponseReceivedListener((resp) => open(resp.notification.request.content.data as never));
    Notifications.getLastNotificationResponseAsync()
      .then((resp) => {
        if (resp) open(resp.notification.request.content.data as never);
      })
      .catch(() => {});
    return () => sub.remove();
  }, []);

  return null;
}
