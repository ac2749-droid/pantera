/**
 * Cloud sync through Supabase (free tier): email + password accounts, and one private row per person
 * holding their Pantera snapshot. Plain HTTPS calls, no extra native code.
 *
 * Setup (once, by whoever publishes the app): see CLOUD_SETUP.md. Paste the project URL and the
 * publishable/anon key below, or into Settings → Cloud sync → Server on the phone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { asSnapshot, isEmptySnapshot, mergeSnapshots, readSnapshot, Snapshot, writeSnapshot } from './backup';

export const CLOUD_URL = '';
export const CLOUD_KEY = ''; // a publishable key is safe to ship in the app; never a secret one

const K_CLOUD = 'pantera.cloud';
const K_SYNC = 'pantera.sync';
const TABLE = 'pantera_sync';

export type CloudSession = { url: string; key: string; email?: string; userId?: string; access?: string; refresh?: string; expiresAt?: number };
type SyncMeta = { remoteAt?: string; hash?: string; lastSync?: number };

export type CloudError = 'not_configured' | 'network' | 'bad_login' | 'unconfirmed' | 'exists' | 'weak_password' | 'signed_out' | 'server' | 'no_table';
export class CloudFail extends Error {
  constructor(public code: CloudError, message?: string) {
    super(message ?? code);
  }
}

export async function getSession(): Promise<CloudSession> {
  let s: Partial<CloudSession> = {};
  try {
    const raw = await AsyncStorage.getItem(K_CLOUD);
    if (raw) s = JSON.parse(raw);
  } catch {}
  return { ...s, url: s.url || CLOUD_URL, key: s.key || CLOUD_KEY };
}
async function saveSession(s: CloudSession) {
  await AsyncStorage.setItem(K_CLOUD, JSON.stringify(s));
}
async function getMeta(): Promise<SyncMeta> {
  try {
    return JSON.parse((await AsyncStorage.getItem(K_SYNC)) || '{}');
  } catch {
    return {};
  }
}
const setMeta = (m: SyncMeta) => AsyncStorage.setItem(K_SYNC, JSON.stringify(m));

export const isConfigured = (s: CloudSession) => /^https:\/\/.+/.test(s.url) && s.key.length > 20;
export const isSignedIn = (s: CloudSession) => !!(s.refresh && s.userId);

/** Save a different server (for testing before it's built into the app). */
export async function setServer(url: string, key: string) {
  const s = await getSession();
  await saveSession({ url: url.trim().replace(/\/+$/, ''), key: key.trim(), email: s.email });
  await AsyncStorage.removeItem(K_SYNC);
}

async function req(s: CloudSession, path: string, init: RequestInit & { auth?: boolean } = {}): Promise<Response> {
  if (!isConfigured(s)) throw new CloudFail('not_configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    return await fetch(s.url + path, {
      ...init,
      signal: ctrl.signal,
      headers: { apikey: s.key, 'Content-Type': 'application/json', ...(init.auth && s.access ? { Authorization: `Bearer ${s.access}` } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new CloudFail('network');
  } finally {
    clearTimeout(timer);
  }
}

function authError(status: number, body: any): CloudFail {
  const text = `${body?.error_code ?? ''} ${body?.msg ?? ''} ${body?.error_description ?? ''} ${body?.message ?? ''}`.toLowerCase();
  if (/email_not_confirmed|not confirmed/.test(text)) return new CloudFail('unconfirmed');
  if (/user_already_exists|already registered|already been registered/.test(text)) return new CloudFail('exists');
  if (/weak_password|password should be|at least/.test(text)) return new CloudFail('weak_password', body?.msg || body?.message);
  if (/invalid_credentials|invalid login|invalid_grant/.test(text) || status === 400) return new CloudFail('bad_login');
  return new CloudFail('server', body?.msg || body?.message);
}

function sessionFrom(s: CloudSession, body: any, email: string): CloudSession {
  return { url: s.url, key: s.key, email, userId: body.user?.id, access: body.access_token, refresh: body.refresh_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
}

/** Create an account. Returns 'confirm' when the project requires clicking an email link first. */
export async function signUp(email: string, password: string): Promise<'signed_in' | 'confirm'> {
  const s = await getSession();
  const res = await req(s, '/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw authError(res.status, body);
  if (body.access_token) {
    await saveSession(sessionFrom(s, body, email.trim()));
    await AsyncStorage.removeItem(K_SYNC);
    return 'signed_in';
  }
  // Some projects hide "already registered" by returning a user with no identities
  if (Array.isArray(body.identities) && body.identities.length === 0) throw new CloudFail('exists');
  return 'confirm';
}

export async function signIn(email: string, password: string): Promise<void> {
  const s = await getSession();
  const res = await req(s, '/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw authError(res.status, body);
  await saveSession(sessionFrom(s, body, email.trim()));
  await AsyncStorage.removeItem(K_SYNC);
}

export async function resetPassword(email: string): Promise<void> {
  const s = await getSession();
  const res = await req(s, '/auth/v1/recover', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
  if (!res.ok) throw authError(res.status, await res.json().catch(() => ({})));
}

export async function signOut(): Promise<void> {
  const s = await getSession();
  if (s.access) req(s, '/auth/v1/logout', { method: 'POST', auth: true }).catch(() => {});
  await saveSession({ url: s.url, key: s.key, email: s.email });
  await AsyncStorage.removeItem(K_SYNC);
}

/** A valid access token, refreshing it when it's about to expire. */
async function fresh(): Promise<CloudSession> {
  const s = await getSession();
  if (!isSignedIn(s)) throw new CloudFail('signed_out');
  if (s.access && (s.expiresAt ?? 0) > Date.now() + 60_000) return s;
  const res = await req(s, '/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: s.refresh }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 400 || res.status === 401) {
      await saveSession({ url: s.url, key: s.key, email: s.email });
      throw new CloudFail('signed_out');
    }
    throw new CloudFail('server');
  }
  const next = sessionFrom(s, body, s.email ?? '');
  await saveSession(next);
  return next;
}

function tableError(status: number, body: any): CloudFail {
  const text = JSON.stringify(body ?? '').toLowerCase();
  if (status === 404 || /pgrst205|does not exist|could not find the table/.test(text)) return new CloudFail('no_table');
  if (status === 401 || /jwt expired/.test(text)) return new CloudFail('signed_out');
  return new CloudFail('server', body?.message);
}

async function pull(s: CloudSession): Promise<{ snap: Snapshot; updatedAt: string } | null> {
  const res = await req(s, `/rest/v1/${TABLE}?select=data,updated_at&user_id=eq.${s.userId}`, { auth: true });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw tableError(res.status, body);
  const row = Array.isArray(body) ? body[0] : null;
  const snap = row ? asSnapshot(row.data) : null;
  return snap ? { snap, updatedAt: String(row.updated_at) } : null;
}

async function push(s: CloudSession, snap: Snapshot): Promise<string> {
  const now = new Date().toISOString();
  const res = await req(s, `/rest/v1/${TABLE}?on_conflict=user_id`, {
    method: 'POST',
    auth: true,
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ user_id: s.userId, data: { ...snap, at: now }, updated_at: now }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw tableError(res.status, body);
  return String((Array.isArray(body) ? body[0]?.updated_at : null) ?? now);
}

// Small stable fingerprint of the data, to tell whether this phone changed since the last sync
function fingerprint(snap: Snapshot): string {
  const stable = (v: unknown): string =>
    Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);
  const str = stable(snap.data);
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return `${str.length}:${(h >>> 0).toString(36)}`;
}

export type SyncResult = 'up_to_date' | 'uploaded' | 'downloaded' | 'merged';

/**
 * Two-way sync. If only this phone changed, upload. If only the cloud changed, download.
 * If both changed (or this phone is joining an account that already has data), combine them so nothing is lost.
 * After 'downloaded' or 'merged', call store.reload().
 */
let running: Promise<SyncResult> | null = null;
/** Runs one sync at a time; a second call while one is running waits for it. */
export function syncNow(): Promise<SyncResult> {
  if (!running) running = doSync().finally(() => (running = null));
  return running;
}

async function doSync(): Promise<SyncResult> {
  const s = await fresh();
  const meta = await getMeta();
  const local = await readSnapshot();
  const localHash = fingerprint(local);
  const remote = await pull(s);

  if (!remote) {
    const at = await push(s, local);
    await setMeta({ remoteAt: at, hash: localHash, lastSync: Date.now() });
    return 'uploaded';
  }
  const localChanged = localHash !== meta.hash;
  const remoteChanged = remote.updatedAt !== meta.remoteAt;

  if (!remoteChanged && !localChanged) {
    await setMeta({ ...meta, lastSync: Date.now() });
    return 'up_to_date';
  }
  if (!remoteChanged && localChanged) {
    const at = await push(s, local);
    await setMeta({ remoteAt: at, hash: localHash, lastSync: Date.now() });
    return 'uploaded';
  }
  if (!localChanged || isEmptySnapshot(local)) {
    await writeSnapshot(remote.snap);
    await setMeta({ remoteAt: remote.updatedAt, hash: fingerprint(await readSnapshot()), lastSync: Date.now() });
    return 'downloaded';
  }
  // Both sides changed: keep everything from both
  await writeSnapshot(mergeSnapshots(local, remote.snap));
  const merged = await readSnapshot();
  const at = await push(s, merged);
  await setMeta({ remoteAt: at, hash: fingerprint(merged), lastSync: Date.now() });
  return 'merged';
}

export async function lastSyncTime(): Promise<number | undefined> {
  return (await getMeta()).lastSync;
}

/** Remove this person's data from the cloud (the account itself stays; sign out after). */
export async function deleteCloudData(): Promise<void> {
  const s = await fresh();
  const res = await req(s, `/rest/v1/${TABLE}?user_id=eq.${s.userId}`, { method: 'DELETE', auth: true });
  if (!res.ok) throw tableError(res.status, await res.json().catch(() => null));
  await AsyncStorage.removeItem(K_SYNC);
}

export const CLOUD_MESSAGES: Record<CloudError, string> = {
  not_configured: 'Cloud sync isn’t set up for this copy of Pantera yet.',
  network: 'Couldn’t reach the cloud. Check your internet and try again.',
  bad_login: 'That email and password don’t match.',
  unconfirmed: 'Check your email and tap the confirmation link, then sign in.',
  exists: 'There’s already an account with that email. Sign in instead.',
  weak_password: 'Use a longer password (at least 6 characters).',
  signed_out: 'You’ve been signed out. Sign in again to keep syncing.',
  server: 'The cloud had a problem. Try again in a minute.',
  no_table: 'The cloud server is missing its Pantera table. Run the setup SQL from CLOUD_SETUP.md.',
};
