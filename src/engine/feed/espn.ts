import {
  EMPTY_SIDE_STATS,
  type EventType,
  type MatchEvent,
  type MatchPhase,
  type MatchSnapshot,
  type Side,
  type SideStats,
  type TeamInfo,
} from "../model";

// ESPN's public site API is undocumented. Everything here reads defensively and
// the parser is tested against recorded real responses, so a format change shows
// up as a failing fixture test, not as silently wrong lights.

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

/**
 * ESPN's edge answers 403 to some default client user-agents (Bun's `Bun/x.y`, and strings
 * with a version token or URL such as `kicklight/2.0 (+https://…)`), while Node, browsers and
 * this one pass. Always send it explicitly so behaviour doesn't depend on the runtime.
 */
export const ESPN_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; Kicklight)",
  accept: "application/json",
} as const;

export const espnSummaryUrl = (league: string, eventId: string) =>
  `${BASE}/${league}/summary?event=${eventId}`;
export const espnScoreboardUrl = (league: string, yyyymmdd?: string) =>
  `${BASE}/${league}/scoreboard${yyyymmdd ? `?dates=${yyyymmdd}` : ""}`;

// biome-ignore lint/suspicious/noExplicitAny: ESPN's response is undocumented; every read below is defensive
type Json = any;

const num = (v: unknown): number => {
  const n = typeof v === "string" ? Number.parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

/** "45'+3'" → 48, "67'" → 67, "90'+4'" → 94. */
export function parseMinute(display: string | undefined | null): number | null {
  if (!display) return null;
  const m = /(\d+)'?(?:\s*\+\s*(\d+))?/.exec(display);
  if (!m) return null;
  return Number.parseInt(m[1], 10) + (m[2] ? Number.parseInt(m[2], 10) : 0);
}

export function phaseFrom(statusName: string | undefined): MatchPhase {
  const s = (statusName ?? "").toUpperCase();
  if (s.includes("SCHEDULED") || s.includes("PRE")) return "scheduled";
  if (s.includes("HALFTIME")) return "half_time";
  if (s.includes("FIRST_HALF")) return "first_half";
  if (s.includes("SECOND_HALF")) return "second_half";
  if (s.includes("EXTRA")) return "extra_time";
  if (s.includes("SHOOTOUT") || s.includes("PENALT")) return "shootout";
  if (s.includes("FULL_TIME") || s.includes("FINAL") || s.includes("END"))
    return "full_time";
  if (
    s.includes("POSTPONED") ||
    s.includes("SUSPENDED") ||
    s.includes("CANCEL") ||
    s.includes("ABANDON")
  )
    return "suspended";
  if (s.includes("IN_PROGRESS") || s.includes("PLAY")) return "first_half";
  return "scheduled";
}

function team(t: Json): TeamInfo {
  const hex = (v: unknown, fallback: string) =>
    typeof v === "string" && /^[0-9a-f]{6}$/i.test(v)
      ? `#${v.toLowerCase()}`
      : fallback;
  return {
    id: String(t?.id ?? ""),
    name: t?.displayName ?? t?.name ?? "",
    short: t?.abbreviation ?? t?.shortDisplayName ?? "",
    color: hex(t?.color, "#888888"),
    alternateColor: hex(t?.alternateColor, "#ffffff"),
    crest: t?.logo ?? t?.logos?.[0]?.href,
  };
}

function sideStats(statistics: Json[] | undefined): SideStats {
  const by = new Map<string, unknown>();
  for (const s of statistics ?? []) by.set(s.name, s.value ?? s.displayValue);
  const possession = by.has("possessionPct")
    ? num(by.get("possessionPct"))
    : null;
  return {
    ...EMPTY_SIDE_STATS,
    possession: possession != null && possession > 0 ? possession : null,
    shots: num(by.get("totalShots")),
    shotsOnTarget: num(by.get("shotsOnTarget")),
    corners: num(by.get("wonCorners")),
    fouls: num(by.get("foulsCommitted")),
    yellowCards: num(by.get("yellowCards")),
    redCards: num(by.get("redCards")),
    saves: num(by.get("saves")),
    offsides: num(by.get("offsides")),
  };
}

/** Map a key-event type slug to our event type. Unknown slugs return null (ignored). */
export function keyEventType(
  slug: string,
  scoringPlay: boolean,
): EventType | null {
  const s = slug.toLowerCase();
  if (s === "kickoff") return "kickoff";
  if (s === "halftime") return "half_time";
  if (s === "start-2nd-half") return "second_half";
  if (s === "end-regular-time" || s === "full-time" || s === "end-extra-time")
    return "full_time";
  if (s.includes("own-goal")) return "own_goal";
  if (s.startsWith("penalty")) {
    if (scoringPlay || s.includes("scored")) return "goal";
    if (s.includes("missed") || s.includes("saved") || s.includes("hit"))
      return "penalty_missed";
    return "penalty_awarded";
  }
  if (s === "goal" || scoringPlay) return "goal";
  if (s === "yellow-card") return "yellow_card";
  if (s === "red-card" || s === "yellow-red-card" || s === "second-yellow")
    return "red_card";
  if (s.includes("var"))
    return s.includes("overturn") || s.includes("cancel")
      ? "var_overturned"
      : "var";
  if (s === "substitution") return "substitution";
  return null;
}

/** Commentary lines carry the fine-grained stuff: corners, fouls, attempts. */
function commentaryType(text: string): EventType | null {
  const t = text.toLowerCase();
  if (t.startsWith("attempt saved")) return "shot_on_target";
  if (t.startsWith("attempt blocked") || t.startsWith("attempt missed"))
    return "shot";
  if (t.startsWith("corner")) return "corner";
  if (t.startsWith("foul")) return "foul";
  return null;
}

export interface ParsedMatch {
  snapshot: MatchSnapshot;
  events: MatchEvent[];
}

export function parseEspnSummary(json: Json, league: string): ParsedMatch {
  const comp = json?.header?.competitions?.[0];
  const competitors: Json[] = comp?.competitors ?? [];
  const homeC = competitors.find((c) => c.homeAway === "home");
  const awayC = competitors.find((c) => c.homeAway === "away");
  const boxTeams: Json[] = json?.boxscore?.teams ?? [];
  const boxFor = (id: string) =>
    boxTeams.find((t) => String(t.team?.id) === id);

  const home = team(
    homeC?.team ?? boxTeams.find((t) => t.homeAway === "home")?.team,
  );
  const away = team(
    awayC?.team ?? boxTeams.find((t) => t.homeAway === "away")?.team,
  );

  const phase = phaseFrom(comp?.status?.type?.name);
  const kickoffMs = Date.parse(comp?.date ?? "") || 0;
  const minuteFromClock = parseMinute(comp?.status?.displayClock);
  const minute =
    minuteFromClock ??
    (phase === "full_time" ? 90 : phase === "half_time" ? 45 : null);

  const sideOf = (teamId: unknown): Side | null => {
    const id = String(teamId ?? "");
    if (!id) return null;
    return id === home.id ? "home" : id === away.id ? "away" : null;
  };

  const events: MatchEvent[] = [];
  const seen = new Set<string>();
  const push = (e: MatchEvent) => {
    if (seen.has(e.id)) return;
    seen.add(e.id);
    events.push(e);
  };
  const wallclockOf = (iso: unknown, minuteAt: number) => {
    const ms = typeof iso === "string" ? Date.parse(iso) : Number.NaN;
    return Number.isFinite(ms) ? ms : kickoffMs + minuteAt * 60_000;
  };

  for (const k of json?.keyEvents ?? []) {
    const type = keyEventType(k?.type?.type ?? "", Boolean(k?.scoringPlay));
    if (!type) continue;
    const m = parseMinute(k?.clock?.displayValue) ?? 0;
    push({
      id: `k${k.id}`,
      type,
      side: sideOf(k?.team?.id),
      minute: m,
      wallclock: wallclockOf(k?.wallclock, m),
    });
  }

  const goalMinutes = new Set(
    events.filter((e) => e.type === "goal").map((e) => e.minute),
  );
  for (const c of json?.commentary ?? []) {
    const play = c?.play;
    const text: string = play?.type?.text ?? c?.text ?? "";
    const type = commentaryType(text);
    if (!type || play?.scoringPlay) continue;
    const m =
      parseMinute(play?.clock?.displayValue ?? c?.time?.displayValue) ?? 0;
    if (
      type === "shot_on_target" &&
      goalMinutes.has(m) &&
      /goal/i.test(c?.text ?? "")
    )
      continue;
    push({
      id: `c${play?.id ?? c?.sequence}`,
      type,
      side: sideOf(play?.team?.id),
      minute: m,
      wallclock: wallclockOf(play?.wallclock, m),
    });
  }

  events.sort((a, b) => a.wallclock - b.wallclock || a.minute - b.minute);

  const snapshot: MatchSnapshot = {
    id: String(json?.header?.id ?? comp?.id ?? ""),
    league,
    phase,
    minute,
    kickoff: kickoffMs || undefined,
    home,
    away,
    score: { home: num(homeC?.score), away: num(awayC?.score) },
    stats: {
      home: sideStats(boxFor(home.id)?.statistics),
      away: sideStats(boxFor(away.id)?.statistics),
    },
  };
  return { snapshot, events };
}

/** The raw ESPN summary payload, for parsing and for the opt-in recorder. */
export async function fetchEspnRaw(
  league: string,
  eventId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const res = await fetchImpl(espnSummaryUrl(league, eventId), {
    cache: "no-store",
    headers: ESPN_HEADERS,
  });
  if (!res.ok) throw new Error(`ESPN summary ${res.status}`);
  return res.json();
}

export async function fetchEspnMatch(
  league: string,
  eventId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ParsedMatch> {
  return parseEspnSummary(
    await fetchEspnRaw(league, eventId, fetchImpl),
    league,
  );
}
