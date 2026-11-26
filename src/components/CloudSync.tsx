import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { getSession, isConfigured, isSignedIn, syncNow } from '../cloud';
import { useStore } from '../store';

/** Keeps the cloud copy up to date in the background: on launch, when the app comes back, and shortly after changes. */
export function CloudSync() {
  const store = useStore();
  const { ready, days, profile, weights, water, reload } = store;
  const quietUntil = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useRef(async () => {
    try {
      const s = await getSession();
      if (!isConfigured(s) || !isSignedIn(s)) return;
      const r = await syncNow();
      if (r === 'downloaded' || r === 'merged') {
        quietUntil.current = Date.now() + 4000; // the reload below isn't a new change to upload
        await reload();
      }
    } catch {
      // Offline or signed out: try again next time. Settings shows the details.
    }
  });

  useEffect(() => {
    if (ready) run.current();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') run.current();
    });
    return () => sub.remove();
  }, [ready]);

  useEffect(() => {
    if (!ready || Date.now() < quietUntil.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => run.current(), 20000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ready, days, profile, weights, water, store.fasts]);

  return null;
}
