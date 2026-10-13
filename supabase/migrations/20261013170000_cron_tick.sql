-- Drives cloud sessions: every 10 s, if any remote session is due, call the app's
-- /api/cron/tick. Apply this only after the site is deployed (docs/deploy.md).
--
-- Two Vault secrets must exist first (values are NOT stored in this file):
--   select vault.create_secret('https://kicklight.alen.world', 'site_url');
--   select vault.create_secret('<same value as CRON_SECRET in Vercel>', 'cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'kicklight-tick',
  '10 seconds',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'site_url') || '/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 25000
  )
  where exists (
    select 1 from public.sessions
    where status = 'active' and mode = 'remote' and next_due_at <= now()
  );
  $$
);
