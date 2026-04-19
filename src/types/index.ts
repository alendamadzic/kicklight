// kicklight. shared types

export interface KicklightConfig {
  bridgeIp: string;
  username: string;
  lightId: string;
  lightName: string;
  pollIntervalSeconds: number;
}

export interface HueLight {
  id: string;
  name: string;
  archetype: string;
  hasGradient: boolean;
}

export interface Team {
  id: number;
  name: string;
  crest: string;
  clubColors: string;
}

export interface Competition {
  name: string;
  emblem: string;
}

export type MatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "EXTRA_TIME"
  | "PENALTY_SHOOTOUT"
  | "FINISHED"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED"
  | "AWARDED";

export interface Score {
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
}

export interface Match {
  id: number;
  homeTeam: Team;
  awayTeam: Team;
  competition: Competition;
  status: MatchStatus;
  score: Score;
  utcDate: string;
}

export interface LiveMatch extends Match {
  minute: number | null;
  possession: { home: number; away: number } | null;
  shots: { home: number; away: number } | null;
  shotsOnGoal: { home: number; away: number } | null;
  shotsOffGoal: { home: number; away: number } | null;
  cornerKicks: { home: number; away: number } | null;
  freeKicks: { home: number; away: number } | null;
  goalKicks: { home: number; away: number } | null;
  throwIns: { home: number; away: number } | null;
  offsides: { home: number; away: number } | null;
  fouls: { home: number; away: number } | null;
  saves: { home: number; away: number } | null;
  yellowCards: { home: number; away: number } | null;
  yellowRedCards: { home: number; away: number } | null;
  redCards: { home: number; away: number } | null;
}

export interface RateLimitInfo {
  requestsAvailable: number;
  counterReset: number;
}
