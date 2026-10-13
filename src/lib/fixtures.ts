import { hexToRgb, type Rgb } from "@/engine/colors";
import { type ReplayScript, replayAt } from "@/engine/feed/replay";
import { SCENARIOS } from "@/engine/feed/scenarios";
import type { MatchSnapshot, TeamInfo } from "@/engine/model";
import type {
  AppConfig,
  HueLightInfo,
  HueStatus,
  MatchListItem,
  MatchResponse,
} from "@/lib/api-types";

// Sample data so every page renders without a backend. Built from the scripted scenarios,
// so a fixture match is the same match the demo page plays.

export const REPLAY_LEAGUE = "replay";

export const FALLBACK_CONFIG: AppConfig = { mode: "cloud", siteUrl: "" };

export const FIXTURE_HUE_STATUS: HueStatus = {
  linked: false,
  transport: null,
  lightId: null,
  lightName: null,
  bridgeId: null,
  tokenExpiresAt: null,
};

export const FIXTURE_LIGHTS: HueLightInfo[] = [
  {
    id: "fixture-flux",
    name: "Hue Flux strip (sample)",
    archetype: "hue_lightstrip",
    pointsCapable: 5,
  },
  {
    id: "fixture-play",
    name: "Hue Play gradient lightstrip (sample)",
    archetype: "hue_lightstrip_tv",
    pointsCapable: 7,
  },
];

export function scenarioById(id: string): ReplayScript | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

const teamItem = (t: TeamInfo) => ({
  id: t.id,
  name: t.name,
  short: t.short,
  color: t.color,
  crest: t.crest,
});

function toItem(
  script: ReplayScript,
  snapshot: MatchSnapshot,
  kickoffMs: number,
): MatchListItem {
  return {
    id: script.id,
    league: REPLAY_LEAGUE,
    kickoff: new Date(kickoffMs).toISOString(),
    phase: snapshot.phase,
    minute: snapshot.minute,
    home: teamItem(script.home),
    away: teamItem(script.away),
    score: snapshot.score,
  };
}

/** Minute a "live" fixture is at: one match minute per real minute, looping. */
function liveMinute(script: ReplayScript, now: number): number {
  return (now / 60_000) % script.endMinute;
}

/** Where each scenario sits on the fixture board: one live, one upcoming, one finished. */
function minuteFor(script: ReplayScript, idx: number, now: number): number {
  if (idx === 0) return Math.max(1, liveMinute(script, now));
  if (idx === 1) return -1;
  return script.endMinute;
}

export function fixtureMatches(now = Date.now()): MatchListItem[] {
  return SCENARIOS.map((script, idx) => {
    const minute = minuteFor(script, idx, now);
    const start = now - (minute < 0 ? -120 : minute) * 60_000;
    const snap = replayAt(script, minute, start).snapshot;
    const kickoff = minute < 0 ? now + 2 * 3_600_000 : start;
    return toItem(script, snap, kickoff);
  });
}

export function fixtureMatch(
  id: string,
  now = Date.now(),
): MatchResponse | null {
  const idx = SCENARIOS.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const script = SCENARIOS[idx];
  const minute = minuteFor(script, idx, now);
  const start = now - Math.max(minute, 0) * 60_000;
  const { snapshot, events } = replayAt(script, minute, start);
  return { snapshot, events };
}

export const kitRgb = (hex: string): Rgb => hexToRgb(hex);
