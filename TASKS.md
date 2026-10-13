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
- [~] Hue remote (`scripts/hue-remote-spike.ts`; needs you to authorize once): confirm OAuth + remote linkbutton + `route/clip/v2`, remote `signaling` / `gradient.mode`, throttle limits
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
- [~] `src/engine/feed/` espn, replay, leagues done; footballData fallback pending. League slugs other than eng.1 are unverified (Phase 0)
- [~] Scripted scenarios done (3); recorder + `scripts/export-recording.ts` need the Supabase `recordings` table
- [ ] Remove global TLS override, old stat code, debug logs, colour-name deps (do when the UI track swaps over, so the app keeps running until then)

## Phase 2: Platform contracts

- [~] Supabase project `kicklight` created (ref `nblzexgtutfxrxadcwav`, eu-west-2, free); migrations, RLS, magic-link auth pending
- [ ] Supabase client helpers + `proxy.ts`
- [ ] `LightTransport` interface + command queue
- [ ] `/api/cron/tick` + pg_cron job
- [x] **(you)** Vercel project created manually; domain `kicklight.alen.world`
- [ ] **(you)** Add `HUE_CLIENT_ID`, `HUE_CLIENT_SECRET`, Supabase keys as Vercel env vars (mark the secrets Sensitive)
- [ ] Replace file config with DB config

## Phase 3: Parallel tracks

- [ ] A · UI scorebug (fixtures, onboarding, match remote, demo, settings)
- [ ] B · Cloud lights (Hue OAuth, RemoteTransport)
- [ ] C · Local lights (LocalTransport, scoped TLS, mDNS, eventstream, Entertainment, instrumentation loop)

## Phase 4: Integration

- [ ] Merge tracks, e2e on the real strip in both modes, live match test
- [ ] README rewrite, production deploy
