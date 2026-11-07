# Performance baseline (7 Nov 2026, before the speed work)

The starting point that the changes in `docs/perf-audit.html` are measured against.
Real-user numbers come from Vercel Speed Insights once it has collected a few days of data.

## Live site, signed out, from London

Time to first byte, five samples each (s). The first sample of a cold function is the slow one.

| URL | Samples | Typical |
|---|---|---|
| `/` (renders on every request to redirect signed-in users) | 1.18, 0.18, 0.20, 0.24, 0.18 | ~0.2, ~1.2 cold |
| `/matches` (static shell) | 0.07, 0.08, 0.06, 0.07, 0.07 | 0.07 |
| `/api/config` | 0.79, 0.23, 0.18, 0.16, 0.18 | ~0.18, ~0.8 cold |
| `/api/matches?league=eng.1&date=…` (CDN miss) | 0.24, 0.23, 0.21, 0.18, 0.18 | ~0.2 |
| `/api/hue/status` (401) | 0.19, 0.18, 0.16, 0.16, 0.17 | ~0.17 |

Every function response carries `x-vercel-id: lhr1::iad1::…`: the edge is in London and the
function runs in Virginia, while Supabase is in London (eu-west-2). Signed-in requests add a
Supabase Auth round trip in the proxy and another in the route, each crossing the Atlantic.

The Matches page asks for fixtures once per league: 22 requests on first load (the Remote tab:
44, today and tomorrow).

## JavaScript per page

`bash scripts/route-sizes.sh` after `bun run build` (legacy polyfills excluded):

| Route | Scripts | Raw | Gzip |
|---|---|---|---|
| _not-found | 14 | 966 KB | 279 KB |
| demo | 19 | 1156 KB | 347 KB |
| lights | 16 | 1019 KB | 300 KB |
| matches | 20 | 1183 KB | 354 KB |
| remote | 22 | 1237 KB | 377 KB |
| setup | 20 | 1208 KB | 363 KB |

Supabase (auth, Realtime, PostgREST) is a 254 KB raw chunk in every one of these, the 404 page included.

## After the speed work (local production build, 8 Nov 2026)

Same script, same exclusions. Live timings need a deploy; see the checklist below.

| Route | Before (gzip) | After (gzip) | Change |
|---|---|---|---|
| _not-found | 279 KB | 214 KB | −65 KB |
| demo | 347 KB | 292 KB | −55 KB |
| lights | 300 KB | 243 KB | −57 KB |
| matches | 354 KB | 272 KB | −82 KB |
| remote | 377 KB | 322 KB | −55 KB |
| setup | 363 KB | 310 KB | −53 KB |

Requests a first visit makes before the page shows data:

| Page | Before | After |
|---|---|---|
| Matches | 22 × `/api/matches` (each through an auth round trip when signed in) | none: fixtures arrive in the HTML |
| Remote, nothing live | 44 × `/api/matches` | none |
| A match | 1 × `/api/matches/…/…` after hydration | none |
| Signed in, any page | session check, then preferences and live session from Supabase | arrive with the page |

### To check after deploying
- `x-vercel-id` reads `lhr1::lhr1::…` (function in London, no `iad1`).
- Signed in: `/` redirects to `/matches`; ★ Mine and the live dot show without a flash.
- Speed Insights: compare LCP and INP for a week either side of the deploy.
