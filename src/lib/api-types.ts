// Shared request/response shapes between the API routes and the UI.
// The server owns these; the UI imports them. Change both sides together.

import type { Rgb } from "@/engine/colors";
import type { EffectKey } from "@/engine/effects";
import type {
  MatchEvent,
  MatchPhase,
  MatchSnapshot,
  Side,
} from "@/engine/model";
import type { StatKey } from "@/engine/stats";

export type AppMode = "cloud" | "local";

export interface MatchListItem {
  id: string;
  league: string;
  /** ISO kick-off time. */
  kickoff: string;
  phase: MatchPhase;
  minute: number | null;
  home: {
    id: string;
    name: string;
    short: string;
    color: string;
    crest?: string;
  };
  away: {
    id: string;
    name: string;
    short: string;
    color: string;
    crest?: string;
  };
  score: { home: number; away: number };
}

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
  colors: { home: Rgb; away: Rgb };
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

export interface ApiError {
  error: string;
  message?: string;
}
