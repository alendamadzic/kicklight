# Deploying kicklight (cloud mode)

Vercel hosts the app, Supabase holds data and runs the 5-second cron, Philips' Remote API
reaches the bridge. Local mode (self-hosted on your network) is in `docs/local-mode.md`.

## 1. Environment variables (Vercel, all environments)

| Variable | Value | Sensitive |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://kicklight.alen.world` | no |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nblzexgtutfxrxadcwav.supabase.co` | no |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the `sb_publishable_…` key | no |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret / service_role key | **yes** |
| `HUE_CLIENT_ID` | from developers.meethue.com | no |
| `HUE_CLIENT_SECRET` | from developers.meethue.com | **yes** |
| `HUE_TOKEN_KEY` | `openssl rand -base64 32`; **never change it** or stored tokens become unreadable | **yes** |
| `CRON_SECRET` | `openssl rand -hex 32` | **yes** |

The same values live in `.env.local` for local development.

## 2. Supabase

1. Authentication → URL Configuration: Site URL `https://kicklight.alen.world`; add
   `https://kicklight.alen.world/auth/callback` (and `http://localhost:3000/auth/callback` for dev)
   to Redirect URLs.
2. The initial schema (`supabase/migrations/20261013160000_initial_schema.sql`) is already applied.
3. After the first successful deploy, store the two Vault secrets and apply the cron migration:

```sql
select vault.create_secret('https://kicklight.alen.world', 'site_url');
select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
```

then apply `supabase/migrations/20261013170000_cron_tick.sql` and
`supabase/migrations/20261024130000_cron_tick_5s.sql`.

While the ball is in play each cron call runs a ~12 s pass that re-reads the feed every 3 s, so
an event reaches the strip within a few seconds of the feed publishing it.

`.env.local` points at the production database. `next dev` does not drive live sessions unless
`KICKLIGHT_DEV_LOOP=1`; with it on, the dev server competes with the deployed site for them.

## 3. Hue Remote API app

Callback URL must be exactly `https://kicklight.alen.world/api/hue/oauth/callback`.

## 4. Smoke test

1. Sign in with a magic link, link Hue, pick the strip, run the strip test.
2. Open `/demo`, turn on "Send to my lights".
3. Start the "Derby day" replay from a match page: the strip should follow it in about 95 s.
4. Supabase → Logs / Vercel runtime logs: `/api/cron/tick` returning `{processed, failed:0}`.
