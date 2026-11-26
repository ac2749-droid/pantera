/* Simulates two phones syncing through a fake Supabase server. */
const Module = require('module');
let store: Record<string, string> = {};
const mem = {
  getAllKeys: async () => Object.keys(store),
  getItem: async (k: string) => store[k] ?? null,
  setItem: async (k: string, v: string) => void (store[k] = v),
  removeItem: async (k: string) => void delete store[k],
  multiGet: async (ks: string[]) => ks.map((k) => [k, store[k] ?? null]),
  multiSet: async (ps: [string, string][]) => ps.forEach(([k, v]) => (store[k] = v)),
  multiRemove: async (ks: string[]) => ks.forEach((k) => delete store[k]),
};
const origLoad = Module._load;
Module._load = function (req: string, ...rest: any[]) {
  if (req === '@react-native-async-storage/async-storage') return { __esModule: true, default: mem };
  return origLoad.call(this, req, ...rest);
};

// Fake Supabase: auth + one table
let row: any = null;
const users: Record<string, string> = {};
let tick = 0;
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  const u = new URL(url);
  const body = init.body ? JSON.parse(init.body) : null;
  const json = (status: number, b: any) => ({ ok: status < 300, status, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.pathname === '/auth/v1/signup') {
    if (users[body.email]) return json(422, { error_code: 'user_already_exists', msg: 'User already registered' });
    users[body.email] = body.password;
    return json(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { id: 'uid-1' } });
  }
  if (u.pathname === '/auth/v1/token') {
    if (u.searchParams.get('grant_type') === 'password' && users[body.email] !== body.password) return json(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return json(200, { access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { id: 'uid-1' } });
  }
  if (u.pathname === '/rest/v1/pantera_sync') {
    if (init.headers?.Authorization !== 'Bearer a') return json(401, { message: 'JWT expired' });
    if (!init.method || init.method === 'GET') return json(200, row ? [row] : []);
    if (init.method === 'POST') {
      row = { ...body, updated_at: `2026-09-28T21:00:${String(++tick).padStart(2, '0')}Z` };
      return json(201, [row]);
    }
    if (init.method === 'DELETE') { row = null; return json(204, null); }
  }
  return json(404, {});
};

(async () => {
  const cloud = await import('../src/cloud');
  const entry = (id: string, name: string, kcal: number) => ({ id, name, serving: '1', sg: 100, grams: 100, meal: 'lunch', n: { kcal }, t: Number(id.replace(/\D/g, '')) });
  const day = 'pantera.day.2026-09-28';
  const phoneA: Record<string, string> = {};
  const phoneB: Record<string, string> = {};
  const use = (p: Record<string, string>) => (store = p);
  const names = (p: Record<string, string>) => JSON.parse(p[day] || '[]').map((e: any) => e.name).join(', ');
  const ok = (label: string, cond: boolean) => console.log(cond ? 'PASS' : 'FAIL', label);

  // Phone A has data, creates an account
  use(phoneA);
  phoneA['pantera.profile'] = JSON.stringify({ targets: { kcal: 2300 }, geminiKey: 'SECRET', customFoods: [{ id: 'c1', name: 'My shake' }], meals: [], favorites: [] });
  phoneA[day] = JSON.stringify([entry('e1', 'Eggs', 140)]);
  await cloud.setServer('https://demo.supabase.co', 'sb_publishable_xxxxxxxxxxxxxxxxxxxx');
  let r: any = await cloud.signUp('me@x.com', 'secret1');
  ok('sign up signs in', r === 'signed_in');
  r = await cloud.syncNow();
  ok('first sync uploads', r === 'uploaded');
  ok('API key not uploaded', !JSON.stringify(row).includes('SECRET'));
  ok('second sync is a no-op', (await cloud.syncNow()) === 'up_to_date');

  // Phone B: new install, signs in -> downloads
  use(phoneB);
  await cloud.setServer('https://demo.supabase.co', 'sb_publishable_xxxxxxxxxxxxxxxxxxxx');
  let err = '';
  try { await cloud.signIn('me@x.com', 'wrong'); } catch (e: any) { err = e.code; }
  ok('wrong password -> bad_login', err === 'bad_login');
  await cloud.signIn('me@x.com', 'secret1');
  r = await cloud.syncNow();
  ok('new phone downloads', r === 'downloaded' && names(phoneB) === 'Eggs');
  ok('custom food arrived', JSON.parse(phoneB['pantera.profile']).customFoods[0].name === 'My shake');

  // B logs toast; A (offline meanwhile) logs rice -> both changed -> merge
  phoneB[day] = JSON.stringify([...JSON.parse(phoneB[day]), entry('e2', 'Toast', 80)]);
  ok('B uploads its change', (await cloud.syncNow()) === 'uploaded');
  use(phoneA);
  phoneA[day] = JSON.stringify([...JSON.parse(phoneA[day]), entry('e3', 'Rice', 200)]);
  r = await cloud.syncNow();
  ok('A merges both changes', r === 'merged' && names(phoneA) === 'Eggs, Toast, Rice');
  ok('A keeps its own API key', JSON.parse(phoneA['pantera.profile']).geminiKey === 'SECRET');
  use(phoneB);
  r = await cloud.syncNow();
  ok('B gets the merged day', r === 'downloaded' && names(phoneB) === 'Eggs, Toast, Rice');

  // Deletion on B propagates (no conflict)
  phoneB[day] = JSON.stringify(JSON.parse(phoneB[day]).filter((e: any) => e.name !== 'Toast'));
  await cloud.syncNow();
  use(phoneA);
  await cloud.syncNow();
  ok('deleting on one phone deletes on the other', names(phoneA) === 'Eggs, Rice');

  await cloud.signOut();
  err = '';
  try { await cloud.syncNow(); } catch (e: any) { err = e.code; }
  ok('signed out -> no sync', err === 'signed_out');
})();
