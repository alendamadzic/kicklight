# Kicklight v2 contracts

Who owns what, so parallel tracks don't collide. Read `TASKS.md` for status and `AGENTS.md` for
the Next.js 16 warning (it is not the Next.js you know; read `node_modules/next/dist/docs/`).

## Ownership

| Area | Owner | Others may |
|---|---|---|
| `src/engine/**` (pure model, stats, effects, runner, feeds) | core | import, never edit |
| `src/lights/{xy,render,queue,transport}.ts` | core | import, never edit |
| `src/lib/api-types.ts` | core | import; propose changes in your report |
| `src/app/api/**`, `src/lib/supabase/{server,admin}.ts`, `src/proxy.ts`, `supabase/**` | core | never edit |
| UI: `src/app/(app)/**`, `src/components/**`, `src/hooks/**` | **UI track** | n/a |
| `src/lights/local/**`, `src/server/local/**` | **local-lights track** | core wires it up |

## Product decisions (final)

- Hosted app: Vercel + Supabase, Hue Remote API. Self-hosted on the home network = **local mode**.
- Phone is a remote. The match loop runs on the server, never in the browser tab.
- Approved: broadcast-scorebug UI, three-tap onboarding with a live strip test, "my teams first"
  fixtures, a virtual strip everywhere, replays + event pad + scenarios, wallclock TV delay (a
  plain slider), eight curated stats + auto-director.
- **Not wanted:** ambient remote UI, pitch UI, my-team goal bias, per-event intensity, a calm mode,
  tap-to-calibrate, a "feed is slower than your TV" warning.

## Data the UI reads (Supabase, RLS enforced)

- `preferences` (own row): `followed_teams text[]`, `tv_delay_ms`, `brightness`, `default_stat`, `auto_start`.
- `hue_links` (own row, read only): `transport`, `light_id`, `light_name`, `bridge_id`, `token_expires_at`.
- `sessions` (own rows): subscribe to the live row over Realtime. `snapshot` is a `SessionMirror`
  (see `src/lib/api-types.ts`). Steer it by updating only `stat`, `status`, `delay_ms`.
- Auth: Supabase magic link (`signInWithOtp`). Use `src/lib/supabase/client.ts`. The server
  client (`src/lib/supabase/server.ts`) lands with the core track; until then, pages that need
  a server user can be client components.

## HTTP API (all JSON; 401 `{error:"unauthenticated"}` without a session)

Types are in `src/lib/api-types.ts`.

| Route | Purpose |
|---|---|
| `GET /api/config` | `{mode: "cloud"|"local", siteUrl}` |
| `GET /api/matches?league=&date=` | fixtures for a league/day |
| `GET /api/matches/[league]/[id]` | live snapshot + events, no session needed |
| `POST /api/sessions/start` | start following a match (or `league:"replay"` scenario) |
| `POST /api/sessions/stop` | end the live session and restore the strip |
| `GET /api/hue/status` | link state |
| `GET /api/hue/oauth/start` | 302 to the Hue login (cloud mode) |
| `GET /api/hue/lights` | gradient-capable lights on the linked bridge |
| `PUT /api/hue/light` | choose the strip |
| `POST /api/hue/test` | paint a segment-by-segment test pattern on the strip |
| `POST /api/hue/unlink` | forget the link |
| `POST /api/lights/set` | steady gradient `{colors, transitionMs}` (demo, "send to my lights") |
| `POST /api/lights/effect` | fire one effect (demo event pad) |
| `POST /api/hue/local/discover`, `/pair` | local mode only |

Until a route exists, build against a typed client in `src/lib/api.ts` (UI track owns it) and
fall back to fixtures so every page works in the browser preview with no backend.

## Engine usage cheatsheet (for the UI)

```ts
import { SCENARIOS } from "@/engine/feed/scenarios";   // scripted matches
import { replayAt } from "@/engine/feed/replay";        // match as of minute m
import { initialState, tick } from "@/engine/runner";   // pure brain
import { EFFECTS, PAD_ORDER } from "@/engine/effects";  // frame(t, base, ctx) → colours
import { pickStripColors } from "@/engine/colors";      // kit colours → what the strip shows
import { splitPoints, fillPoints } from "@/lights/render";
import { STAT_ORDER, STAT_MODES } from "@/engine/stats";
import { LEAGUES } from "@/engine/feed/leagues";
```

The `/demo` page runs the whole engine in the browser: a replay at 30×/60×/180× through `tick()`
into a `VirtualStrip`, with the event pad firing `EFFECTS`. It must work with no bridge and no
network, and optionally mirror to the real strip through `/api/lights/*`.

## Local-lights track: module boundary

Pure-ish libraries with injected dependencies (fetch, clock, store). No Supabase, no Next imports.
Tests with `bun test`. See the track brief for the file list. Core wires it into
`instrumentation.ts` and the routes.
