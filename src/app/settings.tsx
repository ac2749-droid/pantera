import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACTIVITY, GLASS_ML, GOALS, showWater, showWeight, Units } from '../calc';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { mergeSnapshots, readSnapshot, Snapshot, summarize, writeSnapshot } from '../backup';
import { exportBackupFile, pickBackupFile } from '../backupFile';
import { getSession, isConfigured, isSignedIn, lastSyncTime } from '../cloud';
import { anyOn } from '../reminders';
import { AiFailure, testKey } from '../meal/ai';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Chip, Eyebrow, Field, GhostButton, IconButton, num, Txt } from '../ui';
import { int, shortDate } from '../util';

type TestState = 'idle' | 'busy' | 'ok' | AiFailure;
const TEST_MSG: Record<string, string> = {
  ok: 'Key works. The assistant will use AI when it can.',
  bad_key: 'This key was rejected. Copy it again and make sure there are no extra spaces.',
  rate_limit: 'The key works, but its limit is used up right now. Try again later.',
  no_credit: 'The key works, but your Meta account has no credit. Add credit at dev.meta.ai → Billing.',
  network: 'Couldn’t reach the AI service. Check your internet and try again.',
  region: 'This key can’t be used from your country. In the EEA, UK and Switzerland, Google needs a paid key.',
  overloaded: 'The AI service is busy right now. The key is saved; try again later.',
  bad_response: 'Saved, but the test didn’t get a clear answer. The assistant will fall back to the built-in reader if needed.',
};

function Row({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 }}>
      <Txt size={14} color={t.muted}>{label}</Txt>
      <Txt size={14} weight="bodyBold" style={num}>{value}</Txt>
    </View>
  );
}

export default function Settings() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const { profile } = store;
  const [usdaKey, setUsdaKey] = useState(profile.usdaKey);
  const provider = profile.aiProvider;
  const savedKey = provider === 'meta' ? profile.metaKey : profile.geminiKey;
  const [gKey, setGKey] = useState(savedKey);
  const [testing, setTesting] = useState<TestState>('idle');
  const [confirmErase, setConfirmErase] = useState(false);
  const [restore, setRestore] = useState<Snapshot | null>(null);
  const [dataBusy, setDataBusy] = useState(false);
  const [cloud, setCloud] = useState<{ on: boolean; email?: string; last?: number; configured: boolean } | null>(null);
  useEffect(() => {
    // Refresh the cloud status each time Settings is shown
    let alive = true;
    const load = async () => {
      const c = await getSession();
      const last = await lastSyncTime();
      if (alive) setCloud({ on: isConfigured(c) && isSignedIn(c), email: c.email, last, configured: isConfigured(c) });
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const backup = async () => {
    setDataBusy(true);
    const r = await exportBackupFile();
    setDataBusy(false);
    if (!r.ok) nav.toast(r.reason);
  };
  const pickRestore = async () => {
    const r = await pickBackupFile();
    if (!r) return;
    if (!r.ok) return nav.toast(r.reason);
    setRestore(r.snap);
  };
  const applyRestore = async (combine: boolean) => {
    if (!restore) return;
    setDataBusy(true);
    const next = combine ? mergeSnapshots(await readSnapshot(), restore) : restore;
    await writeSnapshot(next);
    await store.reload();
    setDataBusy(false);
    setRestore(null);
    nav.toast(combine ? 'Backup combined with this phone' : 'Backup restored');
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const glass = GLASS_ML(profile.units);
  const glasses = Math.round(profile.waterGoalMl / glass);
  const setGlasses = (n: number) => store.setProfile({ waterGoalMl: Math.round(Math.max(4, Math.min(20, n)) * glass) });
  const setUnits = (u: Units) => {
    if (u === profile.units) return;
    // Keep the same number of glasses when switching glass size
    store.setProfile({ units: u, waterGoalMl: Math.round(glasses * GLASS_ML(u)) });
  };

  const switchProvider = (p: 'gemini' | 'meta') => {
    if (p === provider) return;
    store.setAi({ aiProvider: p });
    setGKey(p === 'meta' ? profile.metaKey : profile.geminiKey);
    setTesting('idle');
  };
  const saveGemini = async () => {
    const k = gKey.trim();
    store.setAi(provider === 'meta' ? { metaKey: k } : { geminiKey: k });
    if (!k) {
      setTesting('idle');
      nav.toast('AI boost turned off');
      return;
    }
    setTesting('busy');
    const r = await testKey(k, provider);
    setTesting(r.ok ? 'ok' : r.reason);
  };

  const calc = profile.calc;
  const activity = calc ? ACTIVITY.find((a) => a.v === calc.activity)?.label : undefined;
  const goal = calc ? GOALS.find((g) => g.v === calc.goal)?.label : undefined;
  const { targets } = profile;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Settings" onClose={close} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: (kb || insets.bottom) + 32 }} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: 8 }}>
          <Eyebrow>Your plan</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Txt weight="displayHeavy" size={30} style={num}>{int(targets.kcal)}</Txt>
            <Txt size={14} color={t.muted}>kcal a day</Txt>
          </View>
          <Row label="Protein · Carbs · Fat" value={`${targets.p} g · ${targets.c} g · ${targets.f} g`} />
          {goal ? <Row label="Goal" value={goal} /> : null}
          {activity ? <Row label="Activity" value={activity} /> : null}
          {calc ? <Row label="Weight at setup" value={showWeight(calc.weight, profile.units)} /> : null}
          {profile.goalWeightKg ? <Row label="Goal weight" value={showWeight(profile.goalWeightKg, profile.units)} /> : null}
          <GhostButton label="Update my plan" onPress={() => router.push('/welcome?mode=edit')} style={{ marginTop: 6 }} />
          <Txt size={12.5} color={t.faint}>You can also type exact targets on the Targets tab.</Txt>
        </Card>

        <Card style={{ gap: 10 }}>
          <Eyebrow>Units</Eyebrow>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="US · lb, fl oz" active={profile.units === 'us'} onPress={() => setUnits('us')} />
            <Chip label="Metric · kg, ml" active={profile.units === 'metric'} onPress={() => setUnits('metric')} />
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <Eyebrow>Daily water goal</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <IconButton label="Fewer glasses" onPress={() => setGlasses(glasses - 1)} disabled={glasses <= 4}>
              <Ionicons name="remove" size={20} color={t.ink} />
            </IconButton>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Txt weight="displayHeavy" size={24} style={num}>{glasses} glasses</Txt>
              <Txt size={13} color={t.muted}>{showWater(profile.waterGoalMl, profile.units)} · 1 glass = {profile.units === 'us' ? '8 fl oz' : '250 ml'}</Txt>
            </View>
            <IconButton label="More glasses" onPress={() => setGlasses(glasses + 1)} disabled={glasses >= 20}>
              <Ionicons name="add" size={20} color={t.ink} />
            </IconButton>
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow inline>Assistant AI boost</Eyebrow>
            <Switch
              value={profile.aiEnabled}
              onValueChange={(v) => store.setAi({ aiEnabled: v })}
              trackColor={{ true: t.accent, false: t.surface2 }}
              thumbColor={t.ink}
              accessibilityLabel="Use AI when available"
            />
          </View>
          <Txt size={13.5} color={t.muted}>The assistant works without this. An AI key makes it better at vague descriptions and restaurant meals, and adds logging from a photo. Your key stays on this phone.</Txt>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Chip label="Google Gemini · free" active={provider === 'gemini'} onPress={() => switchProvider('gemini')} />
            <Chip label="Meta AI · paid" active={provider === 'meta'} onPress={() => switchProvider('meta')} />
          </View>
          <Txt size={12.5} color={t.faint}>
            {provider === 'gemini'
              ? 'Get a key at aistudio.google.com (Get API key), no card needed. On Google’s free tier, what you send (words and photos) may be used to improve their products and may be read by people. Google’s keys are for people 18 or older. In the EEA, UK and Switzerland you need a paid key.'
              : 'Get a key at dev.meta.ai → API keys. Meta charges per use (well under a cent per meal) and needs credit on your account.'}
          </Txt>
          <Field label={provider === 'meta' ? 'Meta API key (optional)' : 'Gemini API key (optional)'} value={gKey} onChangeText={(v) => { setGKey(v); setTesting('idle'); }} autoCapitalize="none" autoCorrect={false} secureTextEntry placeholder="Paste your key" />
          <GhostButton label={testing === 'busy' ? 'Testing…' : gKey.trim() ? 'Save and test key' : 'Save'} disabled={testing === 'busy' || (gKey.trim() === savedKey && testing !== 'idle')} onPress={saveGemini} />
          {testing === 'busy' ? <ActivityIndicator color={t.accent} /> : testing !== 'idle' ? <Txt size={13} weight="bodyBold" color={testing === 'ok' ? t.good : t.warn}>{TEST_MSG[testing]}</Txt> : null}
        </Card>

        <Card style={{ gap: 10 }}>
          <Eyebrow>Barcode lookups</Eyebrow>
          <Txt size={13.5} color={t.muted}>
            Scans check your saved foods, then the database in the app, then Open Food Facts and USDA online. USDA works without a key for light use. For heavier use, get a free key at fdc.nal.usda.gov and paste it here.
          </Txt>
          <Field label="USDA API key (optional)" value={usdaKey} onChangeText={setUsdaKey} autoCapitalize="none" autoCorrect={false} placeholder="Paste your key" />
          <GhostButton label="Save key" disabled={usdaKey.trim() === profile.usdaKey} onPress={() => { store.setUsdaKey(usdaKey.trim()); nav.toast('Key saved'); }} />
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Eyebrow inline>Fasting</Eyebrow>
            <Switch value={!!profile.showFasting} onValueChange={(v) => store.setProfile({ showFasting: v })} trackColor={{ true: t.accent, false: t.surface2 }} thumbColor={t.ink} accessibilityLabel="Show fasting timer on the Diary" />
          </View>
          <Txt size={13.5} color={t.muted}>Show the fasting timer on your Diary. It always appears while a fast is running.</Txt>
          <GhostButton label={store.fasts.current ? 'Open fasting timer (running)' : 'Open fasting timer'} onPress={() => router.push('/fasting')} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Eyebrow>Reminders</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name={anyOn(profile.reminders) ? 'notifications' : 'notifications-off-outline'} size={22} color={anyOn(profile.reminders) ? t.accent : t.faint} />
            <Txt size={13.5} color={t.muted} style={{ flex: 1 }}>
              {anyOn(profile.reminders)
                ? [profile.reminders.meals.breakfast.on || profile.reminders.meals.lunch.on || profile.reminders.meals.dinner.on ? 'Meals' : '', profile.reminders.water.on ? 'Water' : '', profile.reminders.weigh.on ? 'Weigh-in' : '', profile.reminders.weekly.on ? 'Weekly report' : ''].filter(Boolean).join(' · ')
                : 'Gentle nudges to log meals, drink water and weigh in. Off for now.'}
            </Txt>
          </View>
          <GhostButton label={anyOn(profile.reminders) ? 'Edit reminders' : 'Set up reminders'} onPress={() => router.push('/reminders')} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Eyebrow>Cloud sync</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name={cloud?.on ? 'cloud-done' : 'cloud-offline-outline'} size={22} color={cloud?.on ? t.good : t.faint} />
            <View style={{ flex: 1 }}>
              <Txt weight="bodyBold" size={14.5}>{cloud?.on ? `On · ${cloud.email}` : 'Off'}</Txt>
              <Txt size={12.5} color={t.muted}>
                {cloud?.on ? (cloud.last ? `Last synced ${new Date(cloud.last).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : 'Not synced yet') : 'Back up automatically and use Pantera on more than one phone.'}
              </Txt>
            </View>
          </View>
          <GhostButton label={cloud?.on ? 'Manage cloud sync' : cloud?.configured === false ? 'Set up cloud sync' : 'Sign in or create account'} onPress={() => router.push('/cloud')} />
        </Card>

        <Card style={{ gap: 10 }}>
          <Eyebrow>Backup file</Eyebrow>
          <Txt size={13.5} color={t.muted}>Save everything to a file (Google Drive, Files, email…) and restore it on any phone. API keys are never included.</Txt>
          {restore ? (
            (() => {
              const sum = summarize(restore);
              return (
                <View style={{ gap: 10, backgroundColor: t.surface2, borderRadius: 12, padding: 12 }}>
                  <Txt weight="bodyBold" size={14.5}>Backup from {new Date(restore.at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</Txt>
                  <Txt size={13} color={t.muted}>
                    {sum.days} days logged ({sum.entries} entries){sum.first ? `, ${shortDate(sum.first)} to ${shortDate(sum.last!)}` : ''} · {sum.foods} foods · {sum.meals} saved meals · {sum.weights} weigh-ins{sum.workouts ? ` · ${sum.workouts} workouts` : ''}
                  </Txt>
                  <GhostButton label="Combine with this phone" onPress={() => applyRestore(true)} disabled={dataBusy} />
                  <GhostButton label="Replace this phone’s data" color={t.warn} onPress={() => applyRestore(false)} disabled={dataBusy} />
                  <Txt size={13} weight="bodyBold" color={t.muted} onPress={() => setRestore(null)} style={{ alignSelf: 'center', padding: 4 }}>Cancel</Txt>
                </View>
              );
            })()
          ) : (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <GhostButton label={dataBusy ? 'Preparing…' : 'Back up now'} onPress={backup} disabled={dataBusy} style={{ flex: 1 }} />
              <GhostButton label="Restore" onPress={pickRestore} disabled={dataBusy} style={{ flex: 1 }} />
            </View>
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <Eyebrow>Erase</Eyebrow>
          <Txt size={13.5} color={t.muted}>Remove your diary, foods, saved meals, weight and water history, and settings from this phone. Your cloud copy (if any) is not touched.</Txt>
          <GhostButton
            label={confirmErase ? 'Tap again to erase everything' : 'Erase all data'}
            color={t.warn}
            onPress={async () => {
              if (!confirmErase) return setConfirmErase(true);
              await store.eraseAll();
              router.replace('/welcome');
            }}
          />
          {confirmErase ? <Txt size={12.5} color={t.warn}>This can’t be undone.</Txt> : null}
        </Card>

        <Card style={{ gap: 6 }}>
          <Eyebrow>About</Eyebrow>
          <Txt weight="bodyBold" size={15}>Pantera 3.0</Txt>
          <Txt size={13} color={t.muted}>
            Food data comes from USDA FoodData Central (public domain) and Open Food Facts (openfoodfacts.org), made available under the Open Database License (ODbL 1.0). The food database in this app is built from them and shared under the same license. Values are estimates, can contain mistakes and are not medical advice.
          </Txt>
        </Card>
      </ScrollView>
    </View>
  );
}
