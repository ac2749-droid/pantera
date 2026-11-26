# Setting up Pantera cloud sync (free, about 10 minutes, once)

Cloud sync uses a free Supabase project. You set it up once; after that, anyone using your copy of Pantera
can create an account in the app. Each person can only ever see their own data (row-level security).

## 1. Create the project

1. Go to https://supabase.com and sign up (free, no card).
2. **New project** → give it a name (e.g. `pantera`), set a database password (save it somewhere), pick the region closest to you → **Create**.
3. Wait a minute while it starts.

## 2. Create the table

In the project, open **SQL Editor** → **New query**, paste this, and press **Run**:

```sql
create table if not exists public.pantera_sync (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pantera_sync enable row level security;

create policy "Each person reads their own data" on public.pantera_sync
  for select using (auth.uid() = user_id);
create policy "Each person adds their own data" on public.pantera_sync
  for insert with check (auth.uid() = user_id);
create policy "Each person updates their own data" on public.pantera_sync
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Each person deletes their own data" on public.pantera_sync
  for delete using (auth.uid() = user_id);
```

It should say "Success. No rows returned".

## 3. Choose how sign-up works

**Authentication → Sign In / Providers → Email**:
- Leave **Email** enabled.
- **Confirm email**: on (default) means new users must tap a link in an email before signing in. Turn it off if you want sign-up to work instantly (fine for you and friends).

## 4. Copy the two values into the app

**Project Settings → API Keys** (or the **Connect** button at the top):
- **Project URL**, like `https://abcdefghijkl.supabase.co`
- **Publishable key**, starting with `sb_publishable_` (the legacy `anon` key also works)

Never use the **secret** / `service_role` key in the app.

Then either:
- **Quick test, no rebuild:** in Pantera open Settings → Cloud sync → paste both → Save server. (Friends would have to do the same.)
- **Built in for everyone:** open `src/cloud.ts` and fill in `CLOUD_URL` and `CLOUD_KEY` at the top, then rebuild the app.

## Good to know

- Free projects pause after about a week with no activity. If sync stops, open the Supabase dashboard and press **Restore project**.
- Free tier limits (500 MB database) are far more than Pantera needs: a year of daily logging is well under 1 MB per person.
- API keys you enter in Pantera (Gemini, Meta, USDA) are never uploaded.
