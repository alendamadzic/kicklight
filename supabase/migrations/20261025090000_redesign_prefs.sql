-- Redesign: strip direction and kit colour choices in preferences, and why a session
-- was paused (or is struggling) so the remote can explain it.

alter table public.preferences
  add column strip_reversed boolean not null default false,
  add column kit_overrides jsonb not null default '{}'::jsonb
    check (jsonb_typeof(kit_overrides) = 'object');

-- Written by the server (service role) only. Users already may only update stat,
-- status and delay_ms, so the existing column grants keep this read-only for them.
alter table public.sessions
  add column pause_reason text
    check (pause_reason in ('no_link', 'bridge_unauthorized', 'bridge_unreachable'));
