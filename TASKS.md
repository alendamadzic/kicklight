# Kicklight v2 tasks

Source of truth for the v2 build. Full rationale lives in the plan and the Kicklight Lab artifact:
https://claude.ai/artifact/AKQ5V2Ldz5HDo4eG97XQ7d

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · **(you)** needs the owner

## Decisions

- Hosted on Vercel + Supabase via the Hue Remote API (anyone can sign up).
- Self-hosted on a home network = local mode, which unlocks Entertainment API streaming.
- ESPN site API is the primary feed, football-data.org the fallback.
- Rejected: ambient UI, pitch UI, my-team bias, per-event intensity / calm mode, tap-to-calibrate, feed-lag warning, separate relay package.

## Phase 0: Spikes

- [ ] ESPN: record 2–3 live matches as fixtures; catalogue event type slugs; measure lag vs `wallclock`
- [x] **(you)** Hue Remote API app registered. Callback `https://kicklight.alen.world/api/hue/oauth/callback`; credentials in `.env.local` (gitignored)
- [x] Hue remote (`scripts/hue-remote-spike.ts`, run 13 Oct 2026). Verified end to end on the real strip:
  - OAuth: authorize at `api.meethue.com/v2/oauth2/authorize`, token at `/v2/oauth2/token` with Basic auth + `redirect_uri`. Codes are single-use and expire fast. Tokens last ~7 days (`expires_in` 604790), `scope: offline bridge`, refresh token supplied
  - Linking: `PUT /route/api/0/config {linkbutton:true}` then `POST /route/api` returns an app key, no physical button needed
  - CLIP v2 works remotely at `/route/clip/v2/resource/...` with `Authorization: Bearer` + `hue-application-key`
  - `gradient.mode: segmented_palette` with 5 points, `signaling: alternating`, and `dynamics.duration` all work remotely; readback confirmed
  - Latency ~120-220 ms per call. 12 back-to-back PUTs all 200 in 1.8 s (~7/s), no 429 and no rate-limit headers seen
  - Side effect: the bridge now has an app key named `kicklight#spike` (remove in the Hue app if unwanted)
- [x] Hue local: read the strip (13 Oct 2026). Findings:
  - Device: Hue Flux strip light (929004610403), fw 1.163.5, archetype `hue_lightstrip`, gamut C
  - `gradient`: `points_capable: 5`, `pixel_count: 27`, `mode_values`: interpolated_palette, interpolated_palette_mirrored, random_pixelated, **segmented_palette**
  - `signaling.signal_values`: no_signal, on_off, on_off_color, **alternating** (so the cloud fallback is viable)
  - `effects_v2`: candle, fire, prism, sparkle, opal, glisten, underwater, cosmos, sunbeam, enchant
  - Entertainment: no `entertainment_configuration` exists yet; the light's entertainment service has `max_segments: 10` and fixed segments (3,3,5,5,5…), so ~10 channels, not 27. The configuration has to be created (needs an area for the strip)
  - Bridge time zone Europe/London
- [ ] DTLS-PSK library works under Bun (otherwise local mode runs under Node)

## Phase 1: Engine core

- [x] `bun test` set up
- [x] `src/engine/model.ts` snapshot + event types
- [x] `src/engine/colors.ts` ESPN hex, clash detection, can't-glow lift
- [x] `src/engine/stats/` eight modes, auto-director; match clock handled in the runner
- [x] `src/engine/effects/` 14 effects + nerves (frames + signaling fallback)
- [x] `src/engine/scheduler.ts` wallclock + TV delay
- [x] `src/engine/runner.ts` `tick()` (replayed a real match end to end)
- [x] `src/engine/feed/` espn, replay, leagues, recorder. football-data.org fallback dropped: its free tier has no stats or events, so it can't back the modes (reconsider only for fixture lists). League slugs other than eng.1 are unverified
- [x] Scripted scenarios (3); recorder: `KICKLIGHT_RECORD=1` captures payloads, `src/engine/feed/recorder.ts` + `scripts/export-recording.ts` turn them into replays (tested on the real fixture; the live capture path itself has not run yet)
- [x] Remove global TLS override, old stat code, debug logs, colour-name deps (done at the UI merge)

## Phase 2: Platform contracts

- [x] Supabase project `kicklight` (ref `nblzexgtutfxrxadcwav`, eu-west-2, free). `supabase/migrations/20261013160000_initial_schema.sql` applied: preferences, hue_links, hue_secrets, sessions (Realtime), recordings. RLS on; security advisor clean apart from the two intentional service-role-only tables
- [ ] Magic-link auth config (Site URL `https://kicklight.alen.world`, redirect URLs) in the Supabase dashboard
- [ ] **(you)** `SUPABASE_SERVICE_ROLE_KEY` from the dashboard → `.env.local` and Vercel (Sensitive)
- [x] Supabase client helpers (`src/lib/supabase/{client,server,admin}.ts`) + `src/proxy.ts`
- [x] `LightTransport` interface (`src/lights/transport.ts`), command queue with rate limit + coalescing, xy conversion with gamut C clamping, split/fill rendering onto 5 points
- [x] `/api/cron/tick` (atomic claim, per-session processing) ; [~] pg_cron migration written (`20261013170000_cron_tick.sql`), applied after first deploy
- [x] **(you)** Vercel project created manually; domain `kicklight.alen.world`
- [ ] **(you)** Add `HUE_CLIENT_ID`, `HUE_CLIENT_SECRET`, Supabase keys as Vercel env vars (mark the secrets Sensitive)
- [x] DB-backed config (hue_links/hue_secrets/preferences); old file config removed at merge

## Phase 3: Parallel tracks

- [x] A · UI scorebug: merged. Fixtures (my teams, search, day picker), match remote (sticky virtual strip, stat channels incl. auto, ticker, delay slider), `/demo` (runs fully in the browser), onboarding (cloud + local), login (magic link), settings. 70 UI-side tests (strip composition etc.)
  - Verified in the browser preview: demo, fixtures and match preview on live ESPN data at 375px. Not yet: signed-in flows against real auth/Realtime
- [x] B · Cloud lights (Hue OAuth routes, RemoteTransport, token refresh, link/lights/light/test/unlink/set/effect routes) — done by core
- [x] C · Local lights: merged. Pinned LAN TLS, mDNS discovery, pairing, LocalTransport, event stream, HueStream v2 + DTLS-PSK, 50 Hz renderer; core wired local routes (`/api/hue/local/{discover,pair}`), `instrumentation.ts` loop and an opt-in streaming transport (`KICKLIGHT_ENTERTAINMENT=1`)
  - Verified: everything unit-tested; DTLS handshake against an independent PSK test server; read-only GETs, cert pin, mDNS and event stream against the real bridge
  - **Not yet verified on the real bridge:** creating the entertainment configuration (POST body), start/stop, the DTLS handshake with the bridge itself. Needs the bridge re-paired through Kicklight (the old config has no clientkey) and a supervised run
  - Findings: PSK identity is the `hue-application-id` header (not the app key); the strip has 7 Entertainment channels (3,3,5,5,5,3,3)

## Phase 4: Integration

- [~] Merge tracks: done (both tracks merged, v1 code removed, build/tsc/biome/188 tests green). e2e on the real strip:
  - [x] Cloud, replay: full Derby day through `/api/cron/tick`, strip followed and restored (auto-director switched to Scoreline at 86')
  - [x] Cloud, live: Lens v Sporting (Champions League, half time) through the real ESPN feed
  - [x] Signed-in UI flow against real Supabase auth + Realtime, driving the real strip: magic-link callback, preferences write under RLS, not-linked error path, Start from the UI, goal/yellow/possession mirrored live to the page, Stop restored the strip (checked on the bridge)
  - [ ] Local mode on the LAN, incl. Entertainment (needs bridge re-pair + a supervised run)
- [x] README rewrite
- [ ] **(you)** Production deploy: Vercel env vars, Supabase auth URLs, then apply the cron migration (docs/deploy.md). The Vercel connector can't create/deploy here, so this is yours

## Findings worth remembering

- ESPN 403s the `Bun/x.y` user-agent and version-token/URL-style agents; it accepts `node`, browsers and `Mozilla/5.0 (compatible; Kicklight)`. We always send the latter (`ESPN_HEADERS`).
- All 17 ESPN league slugs in `leagues.ts` verified against the live API (13 Oct 2026).
- Hue Remote API: tokens last ~7 days; refresh is the standard grant but has not been exercised live yet (first refresh will happen ~6 days after linking).
- The strip has 7 Entertainment channels (3,3,5,5,5,3,3), not 27.

## Phase 5: Code review cleanup (24 Oct 2026)

- [x] Bugs: OAuth link errors now shown on onboarding; local pairing is one quick attempt per call
  (the app polls); a restore no longer strands a queued gradient's caller; sessions whose bridge
  rejects our key are paused (local mode too); light routes always answer JSON; preferences no
  longer carry over between accounts on one device; relinking clears the other mode's fields;
  DB writes are checked; per-process caches are pruned; dev loop needs `CRON_SECRET`
- [x] Structure: shared `TeamColors`, `ParsedMatch`, `leaderOf`, `statLabel`, `lights/gradient.ts`;
  server split into `http`, `config`, `hue-link`, `live-sessions`, `with-transport`, `validate`;
  typed `ApiErrorCode`
- [x] Client: SWR data hooks, onboarding and remote split into focused files, kebab-case file names
- [x] Next.js: `error.tsx`, `not-found.tsx`, `global-error.tsx`, `typedRoutes`, `RouteContext`
- [x] Removed unused code (event stream client, EntertainmentTransport, openssl factory, 7 shadcn
  components); `bun run check` + GitHub Actions CI; `docs/architecture.md` replaces `docs/contracts.md`

## Phase 6: UI/UX redesign (25 Oct 2026)

Decided on the Kicklight Redesign Board (https://claude.ai/artifact/GF9aT4dWuLA26HECsDB65F):
"Broadcast, refined", 33 ideas approved, 13 denied.

- [x] Foundations: type roles, LED bar, status pill, responsive overlay, motion, true black, copy
- [x] Data: `strip_reversed`, `kit_overrides`, `sessions.pause_reason` (migration applied), auto
  reasons, identify, red→purple strip test
- [x] Navigation: tabs Matches · Remote · Setup, landing page, `/remote`, shared live session
- [x] Matches: live first, league chips / sidebar, ★ Mine, kit-edge cards with a ⋯ menu
- [x] Remote: TV-first hero, goal moments, stat picker with previews, timeline, TV-sync chip,
  brightness, hold-to-stop with undo, problem banners, switch confirmation
- [x] Setup flow: email code, Identify, test that fixes direction
- [x] Demo: captions, next moment, glowing pad with number keys
- [x] Setup page: strip card, kit colours, undo, inline confirmations
- [ ] **(you)** Add `{{ .Token }}` to the Supabase magic-link email template so the code shows
- [ ] **(you)** Signed-in checks on the real strip: Remote tab dot, brightness mid-match, strip
  direction flip, Identify, hold-to-stop restore, ⋯ follow menu
