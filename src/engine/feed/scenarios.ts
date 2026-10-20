import type { TeamInfo } from "../model";
import type { ReplayScript } from "./replay";

const team = (
  id: string,
  name: string,
  short: string,
  color: string,
  alternateColor = "#ffffff",
): TeamInfo => ({
  id,
  name,
  short,
  color,
  alternateColor,
});

const CITY = team("mci", "Manchester City", "MCI", "#6cabdd");
const LIVERPOOL = team("liv", "Liverpool", "LIV", "#c8102e");
const ARSENAL = team("ars", "Arsenal", "ARS", "#ef0107");
const SPURS = team("tot", "Tottenham", "TOT", "#132257", "#ffffff");
const BARCA = team("bar", "Barcelona", "BAR", "#a50044", "#004d98");
const MADRID = team("rma", "Real Madrid", "RMA", "#ffffff", "#febe10");

export const SCENARIOS: ReplayScript[] = [
  {
    id: "derby-day",
    title: "Derby day",
    blurb:
      "End to end: a goal each, a booking, a missed penalty and a late winner.",
    league: "eng.1",
    home: CITY,
    away: LIVERPOOL,
    endMinute: 95,
    possession: [
      [0, 50],
      [15, 62],
      [40, 58],
      [55, 46],
      [75, 56],
      [95, 54],
    ],
    events: [
      { minute: 0, type: "kickoff", side: null },
      { minute: 7, type: "shot_on_target", side: "home" },
      { minute: 9, type: "corner", side: "home" },
      { minute: 16, type: "offside", side: "away" },
      { minute: 21, type: "yellow_card", side: "away" },
      { minute: 23, type: "free_kick", side: "home" },
      { minute: 24, type: "goal", side: "home" },
      { minute: 29, type: "shot_on_target", side: "away" },
      { minute: 38, type: "var", side: "home" },
      { minute: 45.5, type: "half_time", side: null },
      { minute: 47, type: "second_half", side: null },
      { minute: 55, type: "goal", side: "away" },
      { minute: 66, type: "penalty_awarded", side: "home" },
      { minute: 67, type: "penalty_missed", side: "home" },
      { minute: 75, type: "red_card", side: "away" },
      { minute: 83, type: "goal", side: "home" },
      { minute: 95, type: "full_time", side: null },
    ],
  },
  {
    id: "late-winner",
    title: "Last-gasp winner",
    blurb: "Level for ninety minutes. Then stoppage time.",
    league: "eng.1",
    home: ARSENAL,
    away: SPURS,
    endMinute: 97,
    possession: [
      [0, 55],
      [45, 60],
      [80, 66],
      [97, 68],
    ],
    events: [
      { minute: 0, type: "kickoff", side: null },
      { minute: 12, type: "goal", side: "away" },
      { minute: 38, type: "goal", side: "home" },
      { minute: 45.5, type: "half_time", side: null },
      { minute: 47, type: "second_half", side: null },
      { minute: 71, type: "shot_on_target", side: "home" },
      { minute: 88, type: "corner", side: "home" },
      { minute: 93, type: "goal", side: "home" },
      { minute: 97, type: "full_time", side: null },
    ],
  },
  {
    id: "var-heartbreak",
    title: "VAR heartbreak",
    blurb: "A goal, a long look at a monitor, and a decision.",
    league: "uefa.champions",
    home: BARCA,
    away: MADRID,
    endMinute: 94,
    possession: [
      [0, 52],
      [30, 58],
      [60, 49],
      [94, 51],
    ],
    events: [
      { minute: 0, type: "kickoff", side: null },
      { minute: 33, type: "goal", side: "home" },
      { minute: 45.5, type: "half_time", side: null },
      { minute: 47, type: "second_half", side: null },
      { minute: 64, type: "goal", side: "away" },
      { minute: 64.5, type: "var", side: "away" },
      { minute: 69, type: "var_overturned", side: "away" },
      { minute: 94, type: "full_time", side: null },
    ],
  },
];
