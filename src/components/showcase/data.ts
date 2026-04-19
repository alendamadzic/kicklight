import type { MatchStatus, Team } from "@/types";

export interface ShowcaseStats {
  shots: { home: number; away: number };
  shotsOnGoal: { home: number; away: number };
  shotsOffGoal: { home: number; away: number };
  cornerKicks: { home: number; away: number };
  freeKicks: { home: number; away: number };
  goalKicks: { home: number; away: number };
  throwIns: { home: number; away: number };
  offsides: { home: number; away: number };
  fouls: { home: number; away: number };
  saves: { home: number; away: number };
  yellowCards: { home: number; away: number };
  yellowRedCards: { home: number; away: number };
  redCards: { home: number; away: number };
}

export interface ShowcaseMatchup {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  competition: string;
  homeHex: string;
  awayHex: string;
}

export interface ShowcaseScenario {
  id: string;
  label: string;
  description: string;
  status: MatchStatus;
  homeGoals: number;
  awayGoals: number;
  minute: number | null;
  homePossession: number;
  stats: ShowcaseStats;
}

function team(id: number, name: string): Team {
  return { id, name, crest: "", clubColors: "" };
}

export const SHOWCASE_MATCHUPS: ShowcaseMatchup[] = [
  {
    id: "mci-ars",
    homeTeam: team(65, "Man City"),
    awayTeam: team(57, "Arsenal"),
    competition: "Premier League",
    homeHex: "#6CABDD",
    awayHex: "#EF0107",
  },
  {
    id: "liv-che",
    homeTeam: team(64, "Liverpool"),
    awayTeam: team(61, "Chelsea"),
    competition: "Premier League",
    homeHex: "#C8102E",
    awayHex: "#034694",
  },
  {
    id: "bay-bvb",
    homeTeam: team(5, "Bayern"),
    awayTeam: team(4, "Dortmund"),
    competition: "Champions League",
    homeHex: "#DC052D",
    awayHex: "#FDE100",
  },
  {
    id: "bar-rma",
    homeTeam: team(81, "Barcelona"),
    awayTeam: team(86, "Real Madrid"),
    competition: "Champions League",
    homeHex: "#004D98",
    awayHex: "#EDB72B",
  },
  {
    id: "mun-tot",
    homeTeam: team(66, "Man United"),
    awayTeam: team(73, "Tottenham"),
    competition: "Premier League",
    homeHex: "#DA291C",
    awayHex: "#132257",
  },
];

export const SHOWCASE_SCENARIOS: ShowcaseScenario[] = [
  {
    id: "kickoff",
    label: "Kick off",
    description: "0–0 just started",
    status: "IN_PLAY",
    homeGoals: 0,
    awayGoals: 0,
    minute: 1,
    homePossession: 50,
    stats: {
      shots: { home: 0, away: 0 },
      shotsOnGoal: { home: 0, away: 0 },
      shotsOffGoal: { home: 0, away: 0 },
      cornerKicks: { home: 0, away: 0 },
      freeKicks: { home: 0, away: 0 },
      goalKicks: { home: 0, away: 0 },
      throwIns: { home: 0, away: 0 },
      offsides: { home: 0, away: 0 },
      fouls: { home: 0, away: 0 },
      saves: { home: 0, away: 0 },
      yellowCards: { home: 0, away: 0 },
      yellowRedCards: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
    },
  },
  {
    id: "home_lead",
    label: "Home lead",
    description: "1–0 after 23'",
    status: "IN_PLAY",
    homeGoals: 1,
    awayGoals: 0,
    minute: 23,
    homePossession: 58,
    stats: {
      shots: { home: 5, away: 3 },
      shotsOnGoal: { home: 3, away: 1 },
      shotsOffGoal: { home: 2, away: 2 },
      cornerKicks: { home: 3, away: 1 },
      freeKicks: { home: 8, away: 6 },
      goalKicks: { home: 5, away: 4 },
      throwIns: { home: 12, away: 10 },
      offsides: { home: 1, away: 2 },
      fouls: { home: 7, away: 5 },
      saves: { home: 1, away: 2 },
      yellowCards: { home: 0, away: 1 },
      yellowRedCards: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
    },
  },
  {
    id: "halftime",
    label: "Half time",
    description: "1–0 at the break",
    status: "PAUSED",
    homeGoals: 1,
    awayGoals: 0,
    minute: null,
    homePossession: 56,
    stats: {
      shots: { home: 7, away: 5 },
      shotsOnGoal: { home: 4, away: 2 },
      shotsOffGoal: { home: 3, away: 3 },
      cornerKicks: { home: 4, away: 2 },
      freeKicks: { home: 11, away: 9 },
      goalKicks: { home: 7, away: 6 },
      throwIns: { home: 18, away: 16 },
      offsides: { home: 2, away: 3 },
      fouls: { home: 9, away: 7 },
      saves: { home: 2, away: 3 },
      yellowCards: { home: 1, away: 1 },
      yellowRedCards: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
    },
  },
  {
    id: "level",
    label: "Level",
    description: "1–1 after equaliser",
    status: "IN_PLAY",
    homeGoals: 1,
    awayGoals: 1,
    minute: 55,
    homePossession: 50,
    stats: {
      shots: { home: 10, away: 9 },
      shotsOnGoal: { home: 4, away: 4 },
      shotsOffGoal: { home: 6, away: 5 },
      cornerKicks: { home: 5, away: 4 },
      freeKicks: { home: 14, away: 13 },
      goalKicks: { home: 9, away: 8 },
      throwIns: { home: 22, away: 21 },
      offsides: { home: 3, away: 3 },
      fouls: { home: 11, away: 10 },
      saves: { home: 3, away: 3 },
      yellowCards: { home: 2, away: 1 },
      yellowRedCards: { home: 0, away: 0 },
      redCards: { home: 0, away: 0 },
    },
  },
  {
    id: "thriller",
    label: "Thriller",
    description: "3–2 with 10' to go",
    status: "IN_PLAY",
    homeGoals: 3,
    awayGoals: 2,
    minute: 80,
    homePossession: 44,
    stats: {
      shots: { home: 18, away: 14 },
      shotsOnGoal: { home: 8, away: 6 },
      shotsOffGoal: { home: 10, away: 8 },
      cornerKicks: { home: 8, away: 5 },
      freeKicks: { home: 20, away: 18 },
      goalKicks: { home: 12, away: 11 },
      throwIns: { home: 32, away: 29 },
      offsides: { home: 4, away: 5 },
      fouls: { home: 16, away: 14 },
      saves: { home: 3, away: 5 },
      yellowCards: { home: 2, away: 3 },
      yellowRedCards: { home: 0, away: 1 },
      redCards: { home: 0, away: 0 },
    },
  },
  {
    id: "penalties",
    label: "Penalties",
    description: "1–1 AET, shootout",
    status: "PENALTY_SHOOTOUT",
    homeGoals: 1,
    awayGoals: 1,
    minute: null,
    homePossession: 50,
    stats: {
      shots: { home: 24, away: 21 },
      shotsOnGoal: { home: 10, away: 9 },
      shotsOffGoal: { home: 14, away: 12 },
      cornerKicks: { home: 11, away: 8 },
      freeKicks: { home: 27, away: 24 },
      goalKicks: { home: 16, away: 14 },
      throwIns: { home: 42, away: 38 },
      offsides: { home: 5, away: 6 },
      fouls: { home: 22, away: 20 },
      saves: { home: 8, away: 9 },
      yellowCards: { home: 3, away: 3 },
      yellowRedCards: { home: 0, away: 1 },
      redCards: { home: 0, away: 0 },
    },
  },
  {
    id: "fulltime",
    label: "Full time",
    description: "Final whistle",
    status: "FINISHED",
    homeGoals: 2,
    awayGoals: 1,
    minute: null,
    homePossession: 54,
    stats: {
      shots: { home: 21, away: 17 },
      shotsOnGoal: { home: 9, away: 7 },
      shotsOffGoal: { home: 12, away: 10 },
      cornerKicks: { home: 9, away: 6 },
      freeKicks: { home: 24, away: 21 },
      goalKicks: { home: 13, away: 12 },
      throwIns: { home: 36, away: 33 },
      offsides: { home: 4, away: 5 },
      fouls: { home: 18, away: 17 },
      saves: { home: 4, away: 6 },
      yellowCards: { home: 2, away: 3 },
      yellowRedCards: { home: 0, away: 1 },
      redCards: { home: 0, away: 0 },
    },
  },
];
