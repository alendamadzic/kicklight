# kicklight.

Your TV's Philips Hue gradient strip, lit by the match. The strip splits into the two teams'
kit colours in proportion to a live stat (possession, momentum, dominance, shots…), flashes for
goals, cards and VAR, and can be delayed to land when the moment lands on *your* telly.

- **Hosted** (Vercel + Supabase): sign in, link your Hue account, pick a match. The phone is a remote;
  the lights keep running with the screen off.
- **Local mode** (self-hosted on your network): the same app talking to the bridge directly, with
  optional 50 Hz Entertainment streaming for crisp, fast animations.
- **Demo**: a whole simulated match runs in the browser with a virtual strip, no bridge or
  account needed.

## How it works

```
ESPN + FotMob (stats, events) ─▶ pure engine (stats, effects, TV-delay scheduler)
                                      │ commands
             ┌────────────────────────┼────────────────────────┐
     Hue Remote API            LAN CLIP v2             Entertainment (DTLS, 50 Hz)
     (cloud mode)              (local mode)            (local mode, opt-in)
```

- `src/engine/`: the pure brain. Match model, stat modes, event effects, the scheduler that
  delays everything by your TV lag, scripted replays and the ESPN/FotMob parsers. No framework imports.
- `src/lights/`: turning commands into colours and talking to a bridge (remote, local,
  Entertainment), plus the virtual strip's frame composer.
- `src/server/`: one polling cycle (`processSession`) shared by the cloud cron and the local loop,
  and the helpers the routes are built on.
- `src/app/api/`: HTTP routes; `src/app/(app)/`: the mobile-first UI.

Match data comes from ESPN's public site API, with FotMob's quicker goals and cards merged in
while the ball is in play. Neither needs a key; both are undocumented and covered by recorded
fixtures. [docs/architecture.md](docs/architecture.md) has the module map and conventions.

## Develop

```bash
bun install
cp .env.example .env.local     # fill it in, see docs/deploy.md
bun run dev                    # http://localhost:3000, try /demo first
bun run check                  # lint, types and tests (what CI runs)
```

Useful scripts:

| Script | What it does |
|---|---|
| `scripts/hue-remote-spike.ts` | link a bridge through the Hue Remote API and probe what it can do |
| `scripts/e2e-cloud.ts` | drive a replay through the real cron route and your real strip |
| `scripts/export-recording.ts` | turn captured live matches into replays |

## Deploy (cloud mode)

See [docs/deploy.md](docs/deploy.md): environment variables, Supabase auth URLs, the cron job,
and a smoke test. You need a [Hue developer](https://developers.meethue.com) Remote API app whose
callback URL is `https://<your-domain>/api/hue/oauth/callback`.

## Self-host (local mode)

```bash
KICKLIGHT_MODE=local bun run build && KICKLIGHT_MODE=local bun start
```

Run it on any machine on the same network as the bridge (a Mac, Pi or NAS). It still uses
Supabase for accounts and settings. Pairing happens in the app: press the bridge's link
button, tap Pair. The bridge's certificate is pinned at pairing; nothing disables TLS checks.
Details, and the optional Entertainment streaming, are in [docs/local-mode.md](docs/local-mode.md).

## Supported strips

Any gradient strip the bridge reports with `gradient` support: Hue Flux, Gradient Lightstrip,
Play Gradient. Single-colour lights are not offered.

## Contributing

[docs/architecture.md](docs/architecture.md) describes the layers, conventions and the HTTP API.
`TASKS.md` is the build log.
