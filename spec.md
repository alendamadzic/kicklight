# Claude Code Prompt — kicklight.

> **Before running this prompt:** You should already have a Next.js project scaffolded with a `/src` directory, Tailwind CSS, and shadcn/ui configured. Open Claude Code in that project root. Also ensure a `.env.local` file exists with `FOOTBALL_DATA_API_KEY` set — do not overwrite it.

---

## Before writing any code — read the API documentation

Before implementing anything, fetch and study both API references. This ensures implementations match the actual current API contracts rather than assumptions.

**football-data.org:**
- Lookup tables, enums, request/response headers, and filters: `https://docs.football-data.org/general/v4/lookup_tables.html`
- Match resource (status values, score structure, statistics fields): `https://docs.football-data.org/general/v4/match.html`
- API policies including throttling behaviour: `https://docs.football-data.org/general/v4/policies.html`

**Philips Hue:**
- The official Hue API v2 docs are at `https://developers.meethue.com/develop/hue-api-v2/` — these require a free developer account to access fully
- As a fallback, the bridge exposes a live interactive API explorer at `https://{bridgeIp}/debug/clip.html` — use this during development to test endpoints directly against the real bridge
- Key reference: the CLIP v2 API light resource and gradient control, available via the bridge explorer under `/clip/v2/resource/light`

Only proceed with implementation after reviewing these. If any API behaviour in this prompt conflicts with what the live docs say, follow the live docs.

---

## Project brief

Build a locally-hosted Next.js web app called **kicklight.** (always lowercase, always with the trailing full stop as part of the brand) that syncs a Philips Hue gradient light strip with live football match statistics. The app runs on the user's home network, connects to their Hue Bridge locally, polls football-data.org for live stats, and translates those stats into a colour split across the light strip in real time.

The core visual concept: the left portion of the strip shows the home team's colour, the right portion shows the away team's colour — the proportion mirrors a chosen live stat (e.g. 72% possession = 72% of the strip in the home team's colour).

---

## Tech stack

- **Framework:** Next.js (App Router), TypeScript, `/src` directory structure
- **Styling:** Tailwind CSS + shadcn/ui components
- **Server logic:** Next.js Server Actions — use these throughout instead of API routes
- **Hue API:** Philips Hue Local API v2 — HTTPS to bridge IP on local network, SSL verification disabled for self-signed cert
- **Football data:** football-data.org REST API v4 — free tier, key read from `FOOTBALL_DATA_API_KEY` in `.env.local`
- **State / polling:** React state + `setInterval` client-side, calling Server Actions at a user-configurable interval (default 60s)
- **Colour mode:** light / dark / system via `next-themes`

---

## Branding & design

The app is called **kicklight.** — always lowercase, always with the trailing full stop. Render the logotype as styled text, not an image.

Design direction: **dark, immersive, stadium-atmosphere**. Think matchday night under floodlights. The UI should feel like a live dashboard — purposeful, data-forward, with just enough visual drama.

### Colour modes

- **Dark mode (primary):** near-black background (`#0a0a0f`), team colour accents applied fully — glow effects, coloured borders, tinted stat cards
- **Light mode:** clean light background, team colour accents applied at reduced opacity/intensity (e.g. tinted borders and subtle background washes rather than glows) — readable and professional, not garish
- **System:** follows OS preference via `next-themes`
- A theme toggle (light / dark / system) should be present in the header using a shadcn `DropdownMenu` with sun/moon/monitor icons

### Typography

- Load a bold, characterful display font via `next/font` for headings — e.g. Barlow Condensed, Oswald, or similar. Avoid Inter, Roboto, and system fonts.
- Pair with a clean readable font for body/UI text

### Layout principles

- The live stat split (`<StatBar />`) is the visual centrepiece — wide, prominent, with team colours on each side
- Team colours bleed into the UI as dynamic CSS custom properties — update them when a match is selected so the whole page subtly shifts
- Smooth transitions when the stat split updates (CSS transition on width)
- Responsive but optimised for desktop — this is a "second monitor during the match" app
- shadcn components for all interactive elements, customised to theme

---

## Project structure

```
kicklight/
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout — theme provider, fonts
│   │   └── page.tsx               # Single-page app shell
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx         # Logotype, theme toggle, bridge status dot
│   │   │   └── StatusBar.tsx      # Fixed footer — bridge IP, light name, poll countdown
│   │   ├── setup/
│   │   │   ├── SetupWizard.tsx    # Multi-step setup overlay (coordinator)
│   │   │   ├── SetupStep.tsx      # Reusable single step wrapper (title, description, actions)
│   │   │   └── LightSelector.tsx  # List of gradient-capable lights to choose from
│   │   ├── match/
│   │   │   ├── MatchSelector.tsx  # Search + list of today's matches
│   │   │   ├── MatchCard.tsx      # Single match row (reused in selector list)
│   │   │   ├── ActiveMatch.tsx    # Active match panel (coordinator)
│   │   │   ├── ScoreDisplay.tsx   # Large score + status badge
│   │   │   ├── StatBar.tsx        # Colour split bar (centrepiece)
│   │   │   └── StatModeSelector.tsx # Dropdown to switch stat mode
│   │   └── ui/
│   │       ├── TeamChip.tsx       # Team name + colour swatch — reused everywhere
│   │       ├── StatusDot.tsx      # Coloured dot + label (connected/disconnected/live)
│   │       └── CountdownTimer.tsx # Poll countdown, accepts target time prop
│   ├── lib/
│   │   ├── hue.ts                 # Hue bridge helpers: discovery, register, lights, colour push
│   │   ├── football.ts            # football-data.org API client functions
│   │   ├── teamColors.ts          # clubColors string → hex conversion
│   │   └── config.ts              # Read/write kicklight.config.json
│   ├── actions/
│   │   ├── hue.ts                 # Server Actions: discoverBridge, registerApp, getLights, updateLight
│   │   └── football.ts            # Server Actions: getMatches, getLiveMatch
│   └── types/
│       └── index.ts               # Shared TypeScript types
├── .env.local                     # FOOTBALL_DATA_API_KEY — do not overwrite
├── kicklight.config.json          # Generated at runtime — gitignored
└── README.md
```

---

## Component design principles

- **Keep components small and focused** — each component does one thing
- **`SetupStep`** is a generic wrapper used for every step in the setup flow — it accepts `title`, `description`, `children`, and optional `footer` props
- **`TeamChip`** is used in the match selector list, active match header, and stat bar labels — never duplicate team name + swatch rendering
- **`StatusDot`** is used in both the header (bridge status) and status bar — accepts a `status` prop (`'connected' | 'disconnected' | 'live' | 'paused'`) and a `label` string
- **`CountdownTimer`** is a self-contained client component that counts down to a given timestamp — used in the status bar for next poll
- Avoid prop drilling — use React context for active match state and Hue connection state if needed across multiple components

---

## Server Actions

All Hue and football API calls happen in Server Actions inside `src/actions/`. Client components call these directly — no API routes.

### `src/actions/hue.ts`

```typescript
'use server'

export async function discoverBridge(): Promise<{ ip: string } | { error: string }>
export async function registerApp(): Promise<{ username: string } | { error: string }>
export async function getGradientLights(): Promise<Light[]>
export async function updateLightGradient(lightId: string, homeHex: string, awayHex: string, homePct: number): Promise<void>
export async function resetLight(lightId: string): Promise<void>  // Resets to white on stop
```

### `src/actions/football.ts`

```typescript
'use server'

export async function getTodaysMatches(): Promise<Match[]>
export async function getLiveMatch(matchId: number): Promise<LiveMatch>
```

Config is read inside each Server Action via `lib/config.ts` — never pass credentials from the client.

---

## Config file (`kicklight.config.json`)

Stored in project root, gitignored. Schema:

```json
{
  "bridgeIp": "192.168.1.x",
  "username": "hue-api-token",
  "lightId": "abc123",
  "lightName": "Hue Flux gradient strip",
  "pollIntervalSeconds": 60
}
```

`lib/config.ts` exports `readConfig()` and `writeConfig(partial)` functions. These are called only from Server Actions — never from client components directly.

---

## First-run setup flow

On initial load, if no config exists or is incomplete, show the **SetupWizard** as a full-screen overlay.

The wizard has 4 steps, each rendered using the reusable `<SetupStep />` component:

**Step 1 — Discover Bridge**
- Calls `discoverBridge()` Server Action on mount
- Shows bridge IP if found, or error + retry button if not
- "Next" proceeds to step 2

**Step 2 — Connect**
- Instructs user to press the physical link button on the Hue Bridge
- "I've pressed it" button calls `registerApp()` Server Action
- On success, saves `bridgeIp` + `username` to config and proceeds
- On failure, shows error with retry

**Step 3 — Select Light**
- Calls `getGradientLights()` and renders `<LightSelector />`
- Shows only gradient-capable lights (those with a `gradient` property in the Hue v2 response)
- User selects one; selection saved to config

**Step 4 — Settings**
- Polling interval: a shadcn `Slider` or number `Input` — range 30–300s, default 60s, with a label showing the current value in seconds
- Saved to config as `pollIntervalSeconds`
- "Finish setup" completes the wizard and shows the main UI

---

## Light control logic

### Identifying gradient lights

```
GET https://{bridgeIp}/clip/v2/resource/light
```

Filter for lights where the response object includes a `gradient` property.

### Pushing colours — `updateLightGradient`

```
PUT https://{bridgeIp}/clip/v2/resource/light/{lightId}
```

Use 4 gradient points to create a sharp colour boundary approximating the stat split:
- Points 1 & 2: home team colour
- Points 3 & 4: away team colour

The Hue v2 gradient API distributes points evenly, so the split is approximated — document this in a code comment.

```json
{
  "gradient": {
    "points": [
      { "color": { "xy": { "x": 0.675, "y": 0.322 } } },
      { "color": { "xy": { "x": 0.675, "y": 0.322 } } },
      { "color": { "xy": { "x": 0.167, "y": 0.04 } } },
      { "color": { "xy": { "x": 0.167, "y": 0.04 } } }
    ]
  },
  "on": { "on": true }
}
```

### RGB to CIE XY conversion — implement in `lib/hue.ts`

```typescript
export function rgbToXy(r: number, g: number, b: number): { x: number; y: number } {
  const toLinear = (c: number) => {
    c = c / 255
    return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92
  }
  const R = toLinear(r), G = toLinear(g), B = toLinear(b)
  const X = R * 0.664511 + G * 0.154324 + B * 0.162028
  const Y = R * 0.283881 + G * 0.668433 + B * 0.047685
  const Z = R * 0.000088 + G * 0.072310 + B * 0.986039
  const sum = X + Y + Z
  if (sum === 0) return { x: 0, y: 0 }
  return { x: X / sum, y: Y / sum }
}
```

### Goal flash

When a goal is detected (score changes between polls):
- Trigger 3 rapid brightness pulses over ~2 seconds using `setTimeout` chains
- Return to the stat split colours after
- Implement as a standalone `flashGoal(lightId, scoringTeamHex)` function in `lib/hue.ts`, called from the polling logic

### SSL

All Hue requests use `https.Agent` with `rejectUnauthorized: false`. Suppress related warnings silently — never surface to the user.

---

## Football data integration

**Base URL:** `https://api.football-data.org/v4/`
**Auth header:** `X-Auth-Token` from `FOOTBALL_DATA_API_KEY` env var — read only in Server Actions

### `getTodaysMatches`

Calls:
```
GET /v4/matches?status=IN_PLAY,PAUSED,SCHEDULED&dateFrom={today}&dateTo={today}
```

Returns simplified array of `Match` objects: `{ id, homeTeam, awayTeam, competition, status, score, utcDate }`

Each `homeTeam` / `awayTeam` includes `name`, `crest`, and `clubColors` — pass all three through so the client can display the crest and resolve the colour.

### `getLiveMatch`

Calls:
```
GET /v4/matches/{matchId}
```

Include the `X-Unfold-Goals: true` request header to receive fully expanded goal event data in the response — useful for detecting goal scorers and own goals. Returns `LiveMatch`: `{ homeTeam, awayTeam, score, statistics, status, minute }`

### Stat modes

| Mode | Calculation |
|------|-------------|
| Possession % (default) | Direct from API |
| Corners | `homeCorners / totalCorners * 100` |
| Shots | `homeShots / totalShots * 100` |
| Goals | `homeGoals / totalGoals * 100` |

Default to 50/50 when total is 0, or stats are absent. Show a notice in the UI when falling back.

---

## Team colours (`src/lib/teamColors.ts`)

Parse the `clubColors` field from the API (e.g. `"Sky Blue / White"`). Take the first segment, resolve it to hex using `tinycolor2` extended with `color-name-list`.

```typescript
import tinycolor from 'tinycolor2'
import { colorNames } from 'color-name-list'

const nameMap: Record<string, string> = {}
for (const { name, hex } of colorNames) {
  nameMap[name.toLowerCase()] = hex
}

export function clubColorToHex(clubColors: string): string {
  const primary = clubColors.split(' / ')[0].trim()
  const fromExtended = nameMap[primary.toLowerCase()]
  if (fromExtended) return fromExtended
  const color = tinycolor(primary)
  if (color.isValid()) return color.toHexString()
  return '#888888'
}
```

Add `tinycolor2` and `color-name-list` to dependencies. This is purely synchronous — no async required.

---

## UI components — detailed spec

### `<Header />`
- Left: **kicklight.** logotype in display font
- Right: theme toggle (`<DropdownMenu />` with Light / Dark / System options, using lucide icons) + `<StatusDot />` for bridge connection

### `<MatchSelector />`
- shadcn `Input` for filtering matches client-side by team name
- Matches grouped by competition name
- Each match rendered as `<MatchCard />` — shows `<TeamChip />` for home, "vs", `<TeamChip />` for away, kick-off time, and a "Watch" button
- Empty state if no matches returned

### `<MatchCard />`
- Reusable — used in the selector list
- Props: `match: Match`, `onSelect: (match: Match) => void`

### `<ActiveMatch />`
- Coordinator component — manages polling via `setInterval` using `pollIntervalSeconds` from config
- Renders `<ScoreDisplay />`, `<StatBar />`, `<StatModeSelector />`, stop button, last-updated timestamp + manual refresh

### `<ScoreDisplay />`
- Large home score — away score
- `<StatusDot />` for match status (LIVE / HT / FT)
- `<TeamChip />` for each team above the score

### `<StatBar />`
- Full-width bar, two coloured segments
- Left width = home %, right width = away % — animated with `transition: width 0.8s ease`
- Overlaid text: home team name + % on left, away team name + % on right
- **Dark mode:** glow effect using team colour as `box-shadow`
- **Light mode:** tinted border using team colour at ~35% opacity — no glow
- Label below: e.g. "Possession — live" or "Stats unavailable — showing 50/50"

### `<TeamChip />`
- Small coloured circle/swatch + team name
- Optional `size` prop: `'sm' | 'md' | 'lg'`
- Used in: MatchCard, ScoreDisplay, StatBar, ActiveMatch header

### `<StatusDot />`
- Coloured dot + text label
- `status` prop: `'connected' | 'disconnected' | 'live' | 'paused' | 'finished'`
- Colour mapping: connected/live = green, paused/scheduled = amber, disconnected/finished = muted

### `<CountdownTimer />`
- Client component — accepts `targetTime: Date` prop
- Counts down in real time, displays "Next update in Xs"
- Resets when `targetTime` changes

### `<StatusBar />`
- Fixed to bottom of viewport
- Shows: bridge IP, light strip name, `<CountdownTimer />` for next poll
- `<StatusDot />` for Hue connection status

---

## Polling logic

Inside `<ActiveMatch />`:

```typescript
const intervalMs = config.pollIntervalSeconds * 1000  // passed as prop from config
useEffect(() => {
  const tick = async () => {
    const data = await getLiveMatch(match.id)  // Server Action
    // detect goal, update state, push to Hue
  }
  tick() // immediate first call
  const id = setInterval(tick, intervalMs)
  return () => clearInterval(id)
}, [match.id, intervalMs])
```

On each tick:
1. Fetch live match data via `getLiveMatch` Server Action
2. Compare score to previous — if changed, call `flashGoal`
3. Calculate stat split from selected mode
4. Call `updateLightGradient` Server Action with home hex, away hex, home %
5. Update React state to re-render UI

---

## Error handling

- **No stats from API:** 50/50 split, show notice in `<StatBar />`
- **Hue bridge unreachable:** Show in `<StatusDot />` in header and status bar. Do not crash. Retry on next tick.
- **SSL errors from Hue:** Suppressed silently via `rejectUnauthorized: false`
- **Rate limits:** Read `X-RequestsAvailable` and `X-RequestCounter-Reset` response headers on every football API call and back off proactively — see rate limit handling below

### Match status handling

The football-data.org API returns the following status values — handle all of them explicitly. Do not treat unrecognised statuses as errors.

| Status | Behaviour |
|--------|-----------|
| `SCHEDULED` / `TIMED` | Show kick-off time. Do not activate lights. Poll every 5 minutes to detect kick-off. |
| `IN_PLAY` | Normal polling at configured interval. Lights active. |
| `PAUSED` | Half time. Suspend polling for 10 minutes then resume. Show "Half Time" badge. Lights hold last position. |
| `EXTRA_TIME` | Continue polling normally. Show "Extra Time" badge. Lights remain active. |
| `PENALTY_SHOOTOUT` | Continue polling. Show "Penalties" badge. Alternate slow pulse between both team colours on the strip. |
| `FINISHED` | Stop polling. Show "Full Time" badge. Hold lights for 30 seconds, then reset to white. |
| `SUSPENDED` | Stop polling. Show "Suspended" badge. Reset lights to white immediately. |
| `POSTPONED` / `CANCELLED` / `AWARDED` | Stop polling. Show appropriate badge. Reset lights to white immediately. |

### Rate limit handling

Every response from football-data.org includes these headers — read and act on them:

```
X-RequestsAvailable: 21        // remaining requests before being blocked
X-RequestCounter-Reset: 23     // seconds until the counter resets
```

In `src/lib/football.ts`, wrap all API calls to capture these headers and:
- If `X-RequestsAvailable` drops to 3 or below, temporarily double the effective poll interval until the counter resets
- If a `429` response is received, pause all polling for `X-RequestCounter-Reset` seconds then resume automatically
- Show a subtle "Rate limit — slowing polls" notice in the status bar while throttling is active

---

## Theme implementation

Use `next-themes` with `ThemeProvider` in `src/app/layout.tsx`. Set `attribute="class"` and `defaultTheme="system"`.

Team colour accents are applied via CSS custom properties set on the `<body>` or a wrapper element when a match is active:

```css
--team-home: #C8102E;
--team-away: #034694;
```

- **Dark mode:** use these at full saturation for glow effects and coloured borders
- **Light mode:** use these at 30–40% opacity for border and background tints — no full-saturation glows

Use Tailwind's `dark:` variant throughout for mode-specific styles. Do not use inline style overrides where a Tailwind class will do.

---

## `.gitignore` additions

```
kicklight.config.json
.env.local
```

---

## README

Include:
1. What kicklight. is — one paragraph
2. Prerequisites: Node.js 18+, Philips Hue Bridge on local network, football-data.org API key
3. How to get a free API key (register at football-data.org)
4. Setup: `npm install`, add `FOOTBALL_DATA_API_KEY` to `.env.local`, run `npm run dev`, open `http://localhost:3000`
5. First-run: the in-app setup wizard handles bridge connection — machine and Bridge must be on the same network
6. Supported strips: gradient-capable only (Hue Flux, Hue Ambiance Gradient, Hue Play Gradient). Single-colour strips will not appear in setup.
7. Polling interval: configurable in setup (30–300s), default 60s
