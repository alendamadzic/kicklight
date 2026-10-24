import type { ParsedMatch } from "@/engine/feed/espn";
import {
  FOTMOB_HEADERS,
  findFotmobMatch,
  fotmobDetailsUrl,
  fotmobMatchesUrl,
  parseFotmobEvents,
  placeFotmobEvents,
} from "@/engine/feed/fotmob";
import type { MatchPhase } from "@/engine/model";

// Adds FotMob's goals and cards to an ESPN read, so they reach the strip as soon as either
// feed has them (the runner drops whichever copy comes second). Best effort: any failure
// leaves the ESPN read as it was.

/** Only worth asking while the ball is in play. */
const IN_PLAY: ReadonlySet<MatchPhase> = new Set([
  "first_half",
  "second_half",
  "extra_time",
]);
/** A slow FotMob must not hold up the ESPN read it decorates. */
const TIMEOUT_MS = 2_500;
/** A match FotMob couldn't be matched to is looked up again after this long. */
const RETRY_MS = 600_000;

/** ESPN event → FotMob match id (or null, and when to try again). Per server instance. */
const ids = new Map<string, { id: string | null; until: number }>();

async function getJson(url: string, fetchImpl: typeof fetch): Promise<unknown> {
  const res = await fetchImpl(url, {
    cache: "no-store",
    headers: FOTMOB_HEADERS,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`FotMob ${res.status}`);
  return res.json();
}

async function matchIdFor(
  key: string,
  parsed: ParsedMatch,
  fetchImpl: typeof fetch,
  now: number,
): Promise<string | null> {
  const known = ids.get(key);
  if (known && (known.id || now < known.until)) return known.id;
  const { kickoff, home, away } = parsed.snapshot;
  if (!kickoff) return null;
  const day = new Date(kickoff).toISOString().slice(0, 10).replace(/-/g, "");
  const list = await getJson(fotmobMatchesUrl(day), fetchImpl);
  const id = findFotmobMatch(list, kickoff, home.name, away.name);
  ids.set(key, { id, until: now + RETRY_MS });
  return id;
}

export async function withFotmob(
  key: string,
  parsed: ParsedMatch,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<ParsedMatch> {
  if (!IN_PLAY.has(parsed.snapshot.phase)) return parsed;
  try {
    const id = await matchIdFor(key, parsed, fetchImpl, now);
    if (!id) return parsed;
    const events = placeFotmobEvents(
      parseFotmobEvents(await getJson(fotmobDetailsUrl(id), fetchImpl)),
      parsed.snapshot.clock,
      now,
    );
    return { ...parsed, events: [...parsed.events, ...events] };
  } catch (e) {
    console.warn("[kicklight] fotmob:", (e as Error).message);
    return parsed;
  }
}
