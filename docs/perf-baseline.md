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
