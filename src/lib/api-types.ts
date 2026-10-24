// Shared request/response shapes between the API routes and the UI.
// The server owns these; the UI imports them. Change both sides together.

import type { Rgb, TeamColors } from "@/engine/colors";
import type { EffectKey } from "@/engine/effects";
import type { ScoreboardMatch } from "@/engine/feed/espn-scoreboard";
import type { MatchEvent, MatchSnapshot, Side } from "@/engine/model";
import type { StatKey } from "@/engine/stats";

export type AppMode = "cloud" | "local";

/** One row of a fixture list (GET /api/matches). */
export type MatchListItem = ScoreboardMatch;

/** GET /api/config */
export interface AppConfig {
  mode: AppMode;
  siteUrl: string;
}

/** GET /api/matches?league=eng.1&date=YYYYMMDD */
export interface MatchesResponse {
  matches: MatchListItem[];
}

/** GET /api/matches/[league]/[id] */
export interface MatchResponse {
  snapshot: MatchSnapshot;
  events: MatchEvent[];
}

/** POST /api/sessions/start */
export interface StartSessionBody {
  /** ESPN league slug, or "replay" to run a scripted scenario. */
  league: string;
  /** ESPN event id, or a scenario id when league is "replay". */
  eventId: string;
  stat?: StatKey;
  delayMs?: number;
}
export interface StartSessionResponse {
  sessionId: string;
}

/** A command the lights ran, mirrored to the phone so the virtual strip can match. */
export interface MirroredCommand {
  /** ms since epoch the command ran (or is due). */
  at: number;
  kind: "split" | "fill" | "effect" | "restore";
  homeShare?: number;
  fraction?: number;
  lead?: Side | null;
  effect?: EffectKey;
  side?: Side | null;
  /** Match minute of the event behind an effect (absent on older rows). */
  minute?: number;
}

/**
 * The `snapshot` column of a `sessions` row, subscribed to over Supabase Realtime.
 * Written only by the worker.
 */
export interface SessionMirror {
  match: MatchSnapshot;
  /** The viewer's choice this mirror was drawn with (absent on older rows). */
  stat?: StatKey;
  activeStat: StatKey;
  colors: TeamColors;
  recent: MirroredCommand[];
  updatedAt: number;
}

/** GET /api/hue/status */
export interface HueStatus {
  linked: boolean;
  transport: "remote" | "local" | null;
  lightId: string | null;
  lightName: string | null;
  bridgeId: string | null;
  /** Remote token expiry, ISO. */
  tokenExpiresAt: string | null;
}

export interface HueLightInfo {
  id: string;
  name: string;
  archetype: string;
  /** Gradient points the strip accepts. */
  pointsCapable: number;
}
/** GET /api/hue/lights */
export interface HueLightsResponse {
  lights: HueLightInfo[];
}

/** PUT /api/hue/light */
export interface SelectLightBody {
  lightId: string;
  lightName: string;
}

/** POST /api/lights/set: show a steady gradient on the user's strip. */
export interface SetLightsBody {
  colors: Rgb[];
  transitionMs?: number;
}

/** POST /api/lights/effect: fire one effect on the user's strip. */
export interface FireEffectBody {
  effect: EffectKey;
  side: Side | null;
  home: Rgb;
  away: Rgb;
}

/** POST /api/hue/local/discover (local mode only) */
export interface DiscoverResponse {
  bridges: { id: string | null; ip: string }[];
}
/** POST /api/hue/local/pair (local mode only) */
export interface PairBody {
  ip: string;
}
export type PairResponse =
  | { ok: true; bridgeId: string | null }
  | {
      ok: false;
      error: "link_button_not_pressed" | "unreachable" | "failed";
      message?: string;
    };

/** Every `error` code the API answers with. */
export type ApiErrorCode =
  // Request
  | "unauthenticated"
  | "forbidden"
  | "bad_request"
  | "unknown_league"
  | "unknown_scenario"
  // Hue link
  | "not_linked"
  | "no_light"
  | "hue_unauthorized"
  | "hue_unavailable"
  | "not_available"
  | "not_configured"
  // Upstream and storage
  | "feed_unavailable"
  | "discovery_failed"
  | "db_error"
  | "tick_failed";

/** Codes that mean the user has Hue setup to do (link, relink or pick a strip). */
export const HUE_SETUP_ERRORS: ReadonlySet<string> = new Set<ApiErrorCode>([
  "not_linked",
  "no_light",
  "hue_unauthorized",
]);

export interface ApiError {
  error: ApiErrorCode;
  message?: string;
}
