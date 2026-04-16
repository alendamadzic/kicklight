import type { MatchStatus, Team } from "@/types";

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
  },
];
