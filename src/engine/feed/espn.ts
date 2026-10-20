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

/** Extra evidence for the half when the status name is ambiguous (e.g. "IN_PROGRESS"). */
export interface PhaseHints {
  period?: number | null;
  /** The match clock as displayed, e.g. "47'" or "45'+2'". */
  clock?: string | null;
}

export function phaseFrom(
  statusName: string | undefined,
  hints: PhaseHints = {},
): MatchPhase {
  const s = (statusName ?? "").toUpperCase();
  if (s.includes("SCHEDULED") || s.endsWith("_PRE")) return "scheduled";
  if (s.includes("HALFTIME")) return "half_time";
  if (s.includes("FULL_TIME") || s.includes("FINAL") || s.endsWith("_FT"))
    return "full_time";
  if (
    s.includes("POSTPONED") ||
    s.includes("SUSPENDED") ||
    s.includes("CANCEL") ||
    s.includes("ABANDON")
  )
    return "suspended";
  if (s.includes("FIRST_HALF")) return "first_half";
  if (s.includes("SECOND_HALF")) return "second_half";
  if (s.includes("EXTRA")) return "extra_time";
  if (s.includes("SHOOTOUT") || s.includes("PENALT")) return "shootout";

  // Anything else that is live ("IN_PROGRESS", end-of-period markers...): decide the
  // half from the period, then from the clock, never from a guess at the name.
  const { period } = hints;
  if (period === 1) return "first_half";
  if (period === 2) return "second_half";
  if (period === 3 || period === 4) return "extra_time";
  if (period === 5) return "shootout";
  const base = hints.clock ? Number.parseInt(hints.clock, 10) : Number.NaN;
  if (Number.isFinite(base)) return base > 45 ? "second_half" : "first_half";
  return s ? "first_half" : "scheduled";
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

/** Commentary lines carry the fine-grained stuff: corners, free kicks, offsides, fouls. */
function commentaryType(text: string, slug: string): EventType | null {
  const t = text.toLowerCase();
  const s = slug.toLowerCase();
  // Penalties come through the key events; their commentary lines are fouls too.
  if (t.startsWith("penalty")) return null;
  if (t.startsWith("corner") || s === "corner-awarded") return "corner";
  if (t.startsWith("offside") || s === "offside") return "offside";
  if (t.startsWith("foul") || t.includes("wins a free kick") || s === "foul")
    return "foul";
  return null;
}

/** A free kick worth lighting up: one that puts the ball near the box, not a reset in midfield. */
const dangerousFreeKick = (text: string) =>
  /wins a free kick (in the attacking half|on the (left|right) wing)/i.test(
    text,
  );

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

  const phase = phaseFrom(comp?.status?.type?.name, {
    period: comp?.status?.period,
    clock: comp?.status?.displayClock,
  });
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

  // Commentary rarely carries a team id, but every line names the team it's about
  // first: "Corner, Newcastle United.", "Foul by X (Coventry City).", "X (Leeds) wins…".
  const sideIn = (text: string): Side | null => {
    const h = home.name ? text.indexOf(home.name) : -1;
    const a = away.name ? text.indexOf(away.name) : -1;
    if (h < 0 && a < 0) return null;
    return a < 0 || (h >= 0 && h <= a) ? "home" : "away";
  };
  const other = (s: Side | null): Side | null =>
    s === "home" ? "away" : s === "away" ? "home" : null;

  // A foul is two lines sharing a play: "Foul by X (A)." and "Y (B) wins a free kick…".
  const freeKicks = new Map<string, string>();
  for (const c of json?.commentary ?? []) {
    const text: string = c?.text ?? "";
    if (c?.play?.id != null && /wins a free kick/i.test(text))
      freeKicks.set(String(c.play.id), text);
  }

  for (const c of json?.commentary ?? []) {
    const play = c?.play;
    const line: string = c?.text ?? "";
    let type = commentaryType(line, play?.type?.type ?? "");
    if (!type || play?.scoringPlay) continue;
    const m =
      parseMinute(play?.clock?.displayValue ?? c?.time?.displayValue) ?? 0;
    let side = sideIn(line) ?? sideOf(play?.team?.id);
    if (type === "foul") {
      const won = play?.id != null ? freeKicks.get(String(play.id)) : undefined;
      if (won && dangerousFreeKick(won)) {
        // The free kick belongs to the team taking it.
        type = "free_kick";
        side = sideIn(won) ?? side;
      } else if (won) {
        // A foul belongs to the team that committed it.
        side = other(sideIn(won)) ?? side;
      }
    }
    push({
      id: `c${play?.id ?? c?.sequence}`,
      type,
      side,
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
