-- Kicklight v2 initial schema.
-- Row-level security everywhere. Anything that holds a Hue credential lives in
-- hue_secrets, which has RLS on and no policies: only the service role can touch it.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Per-user settings ---------------------------------------------------------
create table public.preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  followed_teams text[] not null default '{}',
  tv_delay_ms integer not null default 0 check (tv_delay_ms between 0 and 120000),
  brightness smallint not null default 100 check (brightness between 1 and 100),
  default_stat text not null default 'auto',
  auto_start boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger preferences_updated_at before update on public.preferences
  for each row execute function public.set_updated_at();
alter table public.preferences enable row level security;
create policy preferences_select on public.preferences
  for select to authenticated using ((select auth.uid()) = user_id);
create policy preferences_insert on public.preferences
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy preferences_update on public.preferences
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Which bridge and light a user drives (no secrets) -------------------------
create table public.hue_links (
  user_id uuid primary key references auth.users (id) on delete cascade,
  transport text not null check (transport in ('remote', 'local')),
  bridge_id text,
  bridge_ip text,
  light_id text,
  light_name text,
  entertainment_config_id text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger hue_links_updated_at before update on public.hue_links
  for each row execute function public.set_updated_at();
alter table public.hue_links enable row level security;
create policy hue_links_select on public.hue_links
  for select to authenticated using ((select auth.uid()) = user_id);
-- Writes happen server-side with the service role (OAuth callback, light picker).
revoke insert, update, delete on public.hue_links from anon, authenticated;

-- Hue credentials, encrypted by the app before they get here ------------------
create table public.hue_secrets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  app_key_enc text,
  client_key_enc text,
  access_token_enc text,
  refresh_token_enc text,
  updated_at timestamptz not null default now()
);
create trigger hue_secrets_updated_at before update on public.hue_secrets
  for each row execute function public.set_updated_at();
alter table public.hue_secrets enable row level security;
revoke all on public.hue_secrets from anon, authenticated;

-- A match being followed -------------------------------------------------------
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  league text not null,
  event_id text not null,
  stat text not null default 'auto',
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  mode text not null default 'remote' check (mode in ('remote', 'local')),
  delay_ms integer not null default 0 check (delay_ms between 0 and 120000),
  runner_state jsonb not null default '{}'::jsonb,
  snapshot jsonb,
  light_snapshot jsonb,
  next_due_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index sessions_one_live_per_user
  on public.sessions (user_id) where status in ('active', 'paused');
create index sessions_due on public.sessions (next_due_at) where status = 'active';
create trigger sessions_updated_at before update on public.sessions
  for each row execute function public.set_updated_at();
alter table public.sessions enable row level security;
create policy sessions_select on public.sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy sessions_insert on public.sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sessions_update on public.sessions
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sessions_delete on public.sessions
  for delete to authenticated using ((select auth.uid()) = user_id);
-- Clients steer a session; only the worker writes runner state and snapshots.
revoke insert, update on public.sessions from anon, authenticated;
grant insert (league, event_id, stat, mode, delay_ms) on public.sessions to authenticated;
grant update (stat, status, delay_ms) on public.sessions to authenticated;
revoke all on public.sessions from anon;

-- The phone mirrors the strip by listening to its own session row.
alter publication supabase_realtime add table public.sessions;

-- Raw feed captures, for building replay fixtures ----------------------------------
create table public.recordings (
  id bigint generated always as identity primary key,
  league text not null,
  event_id text not null,
  captured_at timestamptz not null default now(),
  payload jsonb not null
);
create index recordings_match on public.recordings (league, event_id, captured_at);
alter table public.recordings enable row level security;
revoke all on public.recordings from anon, authenticated;
