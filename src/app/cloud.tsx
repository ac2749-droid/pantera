import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CLOUD_MESSAGES,
  CloudFail,
  CloudSession,
  deleteCloudData,
  getSession,
  isConfigured,
  isSignedIn,
  lastSyncTime,
  resetPassword,
  setServer,
  signIn,
  signOut,
  signUp,
  SyncResult,
  syncNow,
} from '../cloud';
import { useKeyboardHeight } from '../components/keyboard';
import { ModalHeader } from '../components/Screen';
import { useNav } from '../nav';
import { useStore } from '../store';
import { useTheme } from '../theme';
import { Card, Chip, Eyebrow, Field, GhostButton, PrimaryButton, Txt } from '../ui';

const RESULT: Record<SyncResult, string> = {
  up_to_date: 'Everything is up to date.',
  uploaded: 'Your data is saved to the cloud.',
  downloaded: 'Your data was downloaded to this phone.',
  merged: 'This phone and the cloud were combined. Nothing was lost.',
};

function ago(ms?: number) {
  if (!ms) return 'Not synced yet';
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'Synced just now';
  if (m < 60) return `Synced ${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `Synced ${h} h ago` : `Synced ${Math.round(h / 24)} d ago`;
}

export default function Cloud() {
  const t = useTheme();
  const nav = useNav();
  const store = useStore();
  const insets = useSafeAreaInsets();
  const kb = useKeyboardHeight();
  const [s, setS] = useState<CloudSession | null>(null);
  const [last, setLast] = useState<number | undefined>();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; good?: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editServer, setEditServer] = useState(false);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');

  const refresh = useCallback(async () => {
    const x = await getSession();
    setS(x);
    setEmail((e) => e || x.email || '');
    setUrl(x.url);
    setKey(x.key);
    setLast(await lastSyncTime());
  }, []);
  useEffect(() => {
    Promise.resolve().then(refresh);
  }, [refresh]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const fail = (e: unknown) => setMsg({ text: e instanceof CloudFail ? (e.code === 'weak_password' || e.code === 'server') && e.message !== e.code ? `${CLOUD_MESSAGES[e.code]} (${e.message})` : CLOUD_MESSAGES[e.code] : 'Something went wrong. Try again.' });

  const doSync = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await syncNow();
      if (r === 'downloaded' || r === 'merged') await store.reload();
      setMsg({ text: RESULT[r], good: true });
    } catch (e) {
      fail(e);
    }
    setBusy(false);
    refresh();
  };

  const submit = async () => {
    if (!/.+@.+\..+/.test(email.trim())) return setMsg({ text: 'Enter your email address.' });
    if (password.length < 6) return setMsg({ text: 'Passwords are at least 6 characters.' });
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'up') {
        const r = await signUp(email, password);
        if (r === 'confirm') {
          setMsg({ text: 'Account created. Check your email and tap the confirmation link, then sign in here.', good: true });
          setMode('in');
          setBusy(false);
          return;
        }
      } else {
        await signIn(email, password);
      }
      setPassword('');
      const r = await syncNow();
      if (r === 'downloaded' || r === 'merged') await store.reload();
      nav.toast(r === 'downloaded' ? 'Your data was downloaded' : r === 'merged' ? 'Your data was combined' : 'Cloud sync is on');
      setMsg({ text: RESULT[r], good: true });
    } catch (e) {
      fail(e);
    }
    setBusy(false);
    refresh();
  };

  const forgot = async () => {
    if (!/.+@.+\..+/.test(email.trim())) return setMsg({ text: 'Type your email above first.' });
    setBusy(true);
    try {
      await resetPassword(email);
      setMsg({ text: 'If there’s an account for that email, a reset link is on its way.', good: true });
    } catch (e) {
      fail(e);
    }
    setBusy(false);
  };

  if (!s) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  const configured = isConfigured(s);
  const signedIn = configured && isSignedIn(s);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ModalHeader title="Cloud sync" onClose={close} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: (kb || insets.bottom) + 32 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={signedIn ? 'cloud-done' : 'cloud-outline'} size={24} color={t.accent} />
          </View>
          <Txt size={13.5} color={t.muted} style={{ flex: 1 }}>
            Keep your diary, foods, meals, weight and water safe in your own private cloud account, and on every phone you sign in to.
          </Txt>
        </View>

        {!configured || editServer ? (
          <Card style={{ gap: 10 }}>
            <Eyebrow>Server</Eyebrow>
            <Txt size={13.5} color={t.muted}>
              {configured ? 'The Supabase project this app syncs to.' : 'Cloud sync needs a free Supabase project. Whoever set up this app pastes its details here once (see CLOUD_SETUP.md).'}
            </Txt>
            <Field label="Project URL" value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} placeholder="https://xxxx.supabase.co" />
            <Field label="Publishable key" value={key} onChangeText={setKey} autoCapitalize="none" autoCorrect={false} placeholder="sb_publishable_… or anon key" />
            <GhostButton
              label="Save server"
              onPress={async () => {
                if (!/^https:\/\/.+/.test(url.trim()) || key.trim().length < 20) return setMsg({ text: 'Enter the https:// project URL and the key.' });
                await setServer(url, key);
                setEditServer(false);
                setMsg(null);
                refresh();
              }}
            />
          </Card>
        ) : signedIn ? (
          <Card style={{ gap: 10 }}>
            <Eyebrow>Signed in</Eyebrow>
            <Txt weight="bodyBold" size={16}>{s.email}</Txt>
            <Txt size={13} color={t.muted}>{ago(last)} · Pantera syncs by itself when you open the app and after changes.</Txt>
            <PrimaryButton label={busy ? 'Syncing…' : 'Sync now'} onPress={doSync} disabled={busy} icon={<Ionicons name="sync" size={18} color={t.onGrad} />} />
            <GhostButton
              label="Sign out"
              onPress={async () => {
                await signOut();
                setMsg({ text: 'Signed out. Your data stays on this phone.', good: true });
                refresh();
              }}
            />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Chip label="Sign in" active={mode === 'in'} onPress={() => { setMode('in'); setMsg(null); }} />
              <Chip label="Create account" active={mode === 'up'} onPress={() => { setMode('up'); setMsg(null); }} />
            </View>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
            <Field label={mode === 'up' ? 'Choose a password' : 'Password'} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} placeholder="At least 6 characters" onSubmitEditing={submit} returnKeyType="go" />
            <PrimaryButton label={busy ? 'One moment…' : mode === 'up' ? 'Create account and sync' : 'Sign in and sync'} onPress={submit} disabled={busy} />
            {mode === 'in' ? (
              <Txt size={13.5} weight="bodyBold" color={t.accent} onPress={forgot} suppressHighlighting style={{ alignSelf: 'center', padding: 4 }}>
                Forgot password?
              </Txt>
            ) : (
              <Txt size={12.5} color={t.faint}>If this phone already has data, it’s uploaded to your new account. Signing in on another phone later combines both, so nothing is lost.</Txt>
            )}
          </Card>
        )}

        {busy ? <ActivityIndicator color={t.accent} /> : null}
        {msg ? <Txt size={14} weight="bodyBold" color={msg.good ? t.good : t.warn}>{msg.text}</Txt> : null}

        {signedIn ? (
          <Card style={{ gap: 10 }}>
            <Eyebrow>Cloud data</Eyebrow>
            <Txt size={13.5} color={t.muted}>Delete your data from the cloud. Everything stays on this phone, and you’ll be signed out.</Txt>
            <GhostButton
              label={confirmDelete ? 'Tap again to delete cloud data' : 'Delete my cloud data'}
              color={t.warn}
              onPress={async () => {
                if (!confirmDelete) return setConfirmDelete(true);
                setBusy(true);
                try {
                  await deleteCloudData();
                  await signOut();
                  setMsg({ text: 'Your cloud data was deleted.', good: true });
                } catch (e) {
                  fail(e);
                }
                setConfirmDelete(false);
                setBusy(false);
                refresh();
              }}
            />
          </Card>
        ) : null}

        {configured && !editServer ? (
          <Txt size={12.5} color={t.faint} onPress={() => setEditServer(true)} style={{ textAlign: 'center', padding: 6 }}>
            Server: {s.url.replace('https://', '')} · Change
          </Txt>
        ) : null}
      </ScrollView>
    </View>
  );
}
