-- A pass now polls the feed every few seconds for ~12 s and is due again as soon as it ends,
-- so the gap until cron next looks is the only time nobody is watching the match. Look every
-- 5 s to halve it. A pass can run to ~27 s finishing an effect, so give the request longer
-- than the old 25 s before pg_net gives up on it.

select cron.unschedule('kicklight-tick');

select cron.schedule(
  'kicklight-tick',
  '5 seconds',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'site_url') || '/api/cron/tick',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 55000
  )
  where exists (
    select 1 from public.sessions
    where status = 'active' and mode = 'remote' and next_due_at <= now()
  );
  $$
);
