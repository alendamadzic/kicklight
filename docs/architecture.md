# Architecture

How the code is laid out, which way dependencies point, and the conventions that keep it easy
to find your way around. `README.md` has the product overview; `docs/deploy.md` and
`docs/local-mode.md` cover running it.

> This is Next.js 16 with breaking changes from earlier versions. Read the guide in
> `node_modules/next/dist/docs/` before relying on memory (see `AGENTS.md`).

## The flow

```
ESPN summary ─┐                                     ┌─ RemoteTransport  (Hue Remote API, cloud)
              ├─ ParsedMatch ─▶ runner.tick() ─▶ Commands ─┼─ LocalTransport   (CLIP v2 on the LAN)
FotMob goals ─┘   (feed)        (engine)                    └─ StreamingTransport (50 Hz Entertainment)
                                       │
                                       └─▶ SessionMirror ─▶ Supabase Realtime ─▶ the phone's virtual strip
```

One pass over a live session is `processSession` (`src/server/session.ts`). The cloud runs it
from `/api/cron/tick` (Supabase Cron, every ~10 s); local mode runs it in-process every second
(`src/server/local-loop.ts`). The `/demo` page runs the same engine entirely in the browser.

## Layers

| Folder | What lives there | May import |
|---|---|---|
| `src/engine/` | The pure brain: match model, kit colours, stat modes, effects, the TV-delay scheduler, the runner, and the feeds (ESPN, FotMob, scripted replays). No I/O except the small `fetch*` helpers in `feed/`. | nothing outside `engine` |
| `src/lights/` | Turning commands into colours and talking to a bridge: rendering, gradient helpers, the virtual-strip composer, cloud and LAN transports. `local/` is LAN-only (TLS pinning, discovery, pairing, Entertainment). | `engine`, plus types from `lib/api-types` |
| `src/server/` | Server-only orchestration: the session pass and tick, the Hue link store, live sessions, route helpers, config. | `engine`, `lights`, `lib` |
| `src/app/` | Pages (`(app)/`) and route handlers (`api/`). Route files stay thin: parse, call `server/`, answer. | everything |
| `src/lib/` | Shared by browser and server: the typed API client and its types, formatting, sample data, Supabase clients. | `engine` |
| `src/hooks/` | Client state and data: auth, preferences, SWR data hooks, the demo engine. | `engine`, `lights`, `lib` |
| `src/components/` | UI by feature (`remote/`, `onboarding/`, `match/`, `setup/`, `landing/`, …); `chrome/` holds the shared pieces (LED bar, status pill, responsive overlay, hold button); `ui/` is shadcn and edited only through the shadcn CLI. | everything client-safe |

Server-only modules start with `import "server-only"`. Pure modules that tests import
(`session.ts`, `validate.ts`, `streaming-transport.ts`, …) leave it out so `bun test` can load them.

## Conventions

- **Files** are kebab-case everywhere (`match-remote.tsx`, `use-live-session.ts`); components
  and types inside them are PascalCase, everything else camelCase.
- **One component per file** for anything over a screenful. A view's state and actions live in
  a `use-…-view-model.ts` hook next to it (see `components/remote/`).
- **Client data** goes through SWR hooks in `src/hooks/` that call the typed client in
  `src/lib/api.ts`. Pages keep working with no backend by falling back to `lib/sample-data.ts`.
- **API errors** are `{ error: ApiErrorCode, message? }`. Add a code to `ApiErrorCode` in
  `lib/api-types.ts` before using it; the client branches on codes, never on message text.
- **Request bodies** are parsed by the pure functions in `server/validate.ts` (unit-tested);
  routes never trust `request.json()` directly.
- **Database writes** check `{ error }` and throw; routes turn that into `db_error`.
- **Tests** sit next to the code (`*.test.ts`, `bun test`). Recorded feed payloads live in
  `src/engine/feed/__fixtures__/`.
- `bun run check` runs lint (Biome), types and tests; CI runs it and a production build.

## Pages

| Route | What it is |
|---|---|
| `/` | Landing page with a looping demo strip when signed out; signed-in visitors go to `/matches` |
| `/matches` | Fixtures: live first, day toggle, league chips (a sidebar on desktop), ★ Mine |
| `/remote` | The running lights, or your teams' next match when nothing is on |
| `/match/[league]/[id]` | The remote for one match (preview with the lights off until started) |
| `/setup` | Your strip, teams and strip colours, lights defaults, device, appearance, account (`/settings` redirects here) |
| `/onboarding` | Setup flow: email (code or link), link Hue, pick the strip, test it |
| `/demo` | A scripted match run entirely in the browser, with captions and the event pad |

## UI language

- **Type roles.** `kl-display` (condensed caps) is the scoreboard: scores, clocks, team codes,
  big stats. `kl-headline` (condensed, sentence case) is for page and section titles. Everything
  else (buttons, chips, rows, labels) is the body face.
- **The LED bar** (`components/chrome/led-bar.tsx`) is the one recurring device: logo, loader
  (`chase`), setup progress, lights live (`live`).
- **Kit colours** mark anything that belongs to a team; amber is the app's own actions.
- **Overlays** use `ResponsiveOverlay`: a bottom sheet on phones, a popover on desktop.
- **Copy.** Say it the way a fan would: "Moments", "Lights follow", "Set up your lights",
  "Lights off", "Stop and restore lights", "Lights restored". Buttons say exactly what happens.
- Settings that belong to the device rather than the account (goal celebrations, vibration,
  demo captions, true black) live in `hooks/use-device-prefs.ts` (localStorage).

## Data the UI reads (Supabase, RLS enforced)

- `preferences` (own row): `followed_teams text[]`, `tv_delay_ms`, `brightness`, `default_stat`, `auto_start`,
  `strip_reversed` (strip runs right to left; flips every gradient at the transport), `kit_overrides jsonb`
  (`{ [teamId]: "primary" | "alternate" | "#rrggbb" }`, applied before clash detection). Brightness, direction
  and kit choices are read fresh on every tick, so changes reach a running session.
- `hue_links` (own row, read only): `transport`, `light_id`, `light_name`, `bridge_id`, `token_expires_at`.
- `sessions` (own rows): subscribe to the live row over Realtime (`hooks/use-live-session.ts` keeps one
  shared subscription). `snapshot` is a `SessionMirror` (see `src/lib/api-types.ts`), including Auto's
  `autoReason`. `pause_reason` says why the server paused it (`no_link`, `bridge_unauthorized`) or that the
  bridge isn't answering (`bridge_unreachable`, session still active); the server writes it. Clients may only
  update `stat`, `status` and `delay_ms`.
- `hue_secrets` and `recordings` are service-role only.

## HTTP API

All JSON. Without a session, user routes answer 401 `{ "error": "unauthenticated" }`. Types are
in `src/lib/api-types.ts`.

| Route | Purpose |
|---|---|
| `GET /api/config` | `{ mode: "cloud" \| "local", siteUrl }` |
| `GET /api/matches?league=&date=` | fixtures for a league and day (CDN-cached for 15 s) |
| `GET /api/matches/[league]/[id]` | live snapshot and events, no session needed |
| `POST /api/sessions/start` | start following a match (or `league: "replay"` scenario) |
| `POST /api/sessions/stop` | end the live session and restore the strip |
| `GET /api/hue/status` | link state |
| `GET /api/hue/oauth/start` | 302 to the Hue login (cloud mode); the callback lands on `/onboarding` |
| `GET /api/hue/lights` | gradient-capable lights on the linked bridge |
| `PUT /api/hue/light` | choose the strip |
| `POST /api/hue/test` | paint red, amber, green, blue, purple left to right on the strip (`lib/strip-test.ts`) |
| `POST /api/hue/identify` | blink one light `{ lightId }` on the linked bridge, before a strip is chosen |
| `POST /api/hue/unlink` | end live sessions, then forget the link |
| `POST /api/lights/set` | steady gradient `{ colors, transitionMs }` (demo "send to my lights") |
| `POST /api/lights/effect` | fire one effect (event pad, ticker replays) |
| `POST /api/hue/local/discover` | find bridges on the LAN (local mode only) |
| `POST /api/hue/local/pair` | one pairing attempt; the app polls it while you press the link button |
| `POST /api/cron/tick` | run due sessions (Supabase Cron, `Bearer CRON_SECRET`) |

## Product decisions

- Hosted app: Vercel + Supabase, Hue Remote API. Self-hosted on the home network = local mode.
- The phone is a remote. The match loop runs on the server, never in the browser tab.
- In: broadcast-scorebug UI (refined in the Oct 2026 redesign: score on the virtual TV, sentence-case
  type, LED motif), a four-step setup with an email code, Identify and a strip test that fixes
  direction, tabs Matches · Remote · Setup, a signed-out landing page, a virtual strip everywhere,
  replays + event pad + captioned scenarios, wallclock TV delay (a header chip on the remote),
  eight curated stats + an auto-director that explains itself, hold-to-stop, kit colour overrides.
- Out: ambient remote UI, pitch UI, my-team goal bias, per-event intensity, a calm mode,
  tap-to-calibrate, a "feed is slower than your TV" warning. Also ruled out in the redesign review:
  a now-playing bar, a live-now rail, a week scroller, a my-teams crest row, team picking in setup,
  a full-time recap, an installable app with kick-off alerts, sharing the remote, multiple strips.
