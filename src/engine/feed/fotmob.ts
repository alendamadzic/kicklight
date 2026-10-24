import type { EventType, MatchEvent, Side } from "../model";

// FotMob's public web API: no key, no account. It only carries the key events (goals and
// cards), but posts them well before ESPN's commentary-driven feed does, so it runs alongside
// ESPN to get those to the strip sooner. Undocumented like ESPN's, so everything here reads
// defensively; a format change means FotMob adds nothing and ESPN carries on alone.

const BASE = "https://www.fotmob.com/api/data";

/** FotMob's edge turns away non-browser user agents. */
export const FOTMOB_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  accept: "application/json",
} as const;

/** `yyyymmdd` is the match's UTC date. */
export const fotmobMatchesUrl = (yyyymmdd: string) =>
  `${BASE}/matches?date=${yyyymmdd}`;
export const fotmobDetailsUrl = (matchId: string) =>
  `${BASE}/matchDetails?matchId=${matchId}`;

// biome-ignore lint/suspicious/noExplicitAny: FotMob's response is undocumented; every read below is defensive
type Json = any;

/** "Manchester City FC" → "manchester city"; accents and club suffixes dropped. */
export function normaliseTeam(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["fc", "afc", "cf", "sc", "the"].includes(w))
    .join(" ");
}

const sameTeam = (a: string, b: string) => {
  const x = normaliseTeam(a);
  const y = normaliseTeam(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

/**
 * FotMob's id for the match ESPN knows by kick-off and team names, from that day's list.
 * Both teams must match and kick off within two hours of each other, so a wrong guess is
 * rare and only ever costs the speed-up, never a wrong flash: the events still need a team.
 */
export function findFotmobMatch(
  list: Json,
  kickoffMs: number,
  home: string,
  away: string,
): string | null {
  for (const league of list?.leagues ?? []) {
    for (const m of league?.matches ?? []) {
      const at = Date.parse(m?.status?.utcTime ?? "");
      if (Number.isFinite(at) && Math.abs(at - kickoffMs) > 2 * 3_600_000)
        continue;
      const h = m?.home?.longName ?? m?.home?.name ?? "";
      const a = m?.away?.longName ?? m?.away?.name ?? "";
      if (sameTeam(h, home) && sameTeam(a, away) && m?.id != null)
        return String(m.id);
    }
  }
  return null;
}

/** A FotMob goal or card. It has no wallclock: the caller places it on the match clock. */
export interface FotmobEvent {
  id: string;
  type: EventType;
  side: Side;
  minute: number;
}

/** Goals and cards, in feed order. Shoot-out kicks are left to ESPN. */
export function parseFotmobEvents(json: Json): FotmobEvent[] {
  const out: FotmobEvent[] = [];
  for (const e of json?.content?.matchFacts?.events?.events ?? []) {
    if (typeof e?.isHome !== "boolean" || e?.isPenaltyShootoutEvent) continue;
    let type: EventType | null = null;
    if (e.type === "Goal") type = "goal";
    else if (e.type === "Card")
      type =
        e.card === "Yellow"
          ? "yellow_card"
          : e.card === "Red" || e.card === "YellowRed"
            ? "red_card"
            : null;
    if (!type) continue;
    let side: Side = e.isHome ? "home" : "away";
    // A goal belongs to the team whose score it raised, own goals included.
    const next = e.newScore;
    if (type === "goal" && Array.isArray(next) && next.length === 2) {
      const [h, a] = next.map(Number);
      if (h > Number(e.homeScore ?? h) && a === Number(e.awayScore ?? a))
        side = "home";
      else if (a > Number(e.awayScore ?? a) && h === Number(e.homeScore ?? h))
        side = "away";
    }
    const minute = Number(e.time ?? 0) + Number(e.overloadTime ?? 0);
    out.push({
      id: `f${e.eventId ?? e.reactKey ?? `${type}-${side}-${minute}`}`,
      type,
      side,
      minute: Number.isFinite(minute) ? minute : 0,
    });
  }
  return out;
}

/**
 * How long FotMob typically takes to show an event: a goal at 12:39:52 appeared at 12:40:10
 * (Villa v City, 24 Oct 2026), its edge caches for 10 s, and we poll every 3 s.
 */
export const FOTMOB_LAG_MS = 15_000;

/**
 * Place FotMob's events on the real-world clock. FotMob only gives the minute, so an event is
 * taken to have happened FOTMOB_LAG_MS before it was first seen, or in the middle of its
 * minute on ESPN's match clock if that's earlier (seen late, or an old event). The runner then
 * times them to the viewer's TV like any other event.
 */
export function placeFotmobEvents(
  events: FotmobEvent[],
  clock: { seconds: number; at: number; from: number } | undefined,
  observedAt: number,
): MatchEvent[] {
  return events.map((e) => {
    // A minute shown as 60' runs from 59:00; its middle is 59:30.
    const since = clock ? clock.seconds - (e.minute - 0.5) * 60 : 0;
    const wallclock = Math.min(
      observedAt - FOTMOB_LAG_MS,
      (clock?.at ?? observedAt) - since * 1000,
    );
    return { ...e, source: "fotmob", wallclock };
  });
}
