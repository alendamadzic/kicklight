// Pure match model shared by feeds, the stat modes, effects and the runner.
// No Next or Node imports: this runs in the cloud tick, the local loop and the browser.

export type Side = "home" | "away";

export type MatchPhase =
  | "scheduled"
  | "first_half"
  | "half_time"
  | "second_half"
  | "extra_time"
  | "shootout"
  | "full_time"
  | "suspended";

export type EventType =
  | "kickoff"
  | "goal"
  | "own_goal"
  | "penalty_awarded"
  | "penalty_scored"
  | "penalty_missed"
  | "yellow_card"
  | "red_card"
  | "var"
  | "var_overturned"
  | "corner"
  | "shot_on_target"
  | "shot"
  | "foul"
  | "substitution"
  | "half_time"
  | "second_half"
  | "full_time";

export interface MatchEvent {
  /** Stable id from the feed, used to de-duplicate across polls. */
  id: string;
  type: EventType;
  /** The team the event is attributed to; null for match-level events. */
  side: Side | null;
  /** Match minute, with added time folded in (45+3 = 48). */
  minute: number;
  /** Real-world time the event happened, ms since epoch. Drives TV-delay scheduling. */
  wallclock: number;
}

export interface TeamInfo {
  id: string;
  name: string;
  short: string;
  /** Primary kit colour, #rrggbb. */
  color: string;
  /** Alternate kit colour, used when the primaries clash. */
  alternateColor: string;
  crest?: string;
}

export interface SideStats {
  possession: number | null;
  shots: number;
  shotsOnTarget: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  offsides: number;
}

export interface MatchSnapshot {
  id: string;
  league: string;
  phase: MatchPhase;
  minute: number | null;
  /** Scheduled kick-off, ms since epoch, when the feed knows it. */
  kickoff?: number;
  home: TeamInfo;
  away: TeamInfo;
  score: { home: number; away: number };
  stats: { home: SideStats; away: SideStats };
}

export const EMPTY_SIDE_STATS: SideStats = {
  possession: null,
  shots: 0,
  shotsOnTarget: 0,
  corners: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  saves: 0,
  offsides: 0,
};
