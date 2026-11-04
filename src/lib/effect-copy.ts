import type { EffectKey } from "@/engine/effects";
import type { EventType } from "@/engine/model";

/**
 * What each effect does on the strip, in plain words: the demo's captions and the
 * help text for the event pad. UI copy, so it lives here rather than in the engine.
 */
export const EFFECT_CAPTION: Record<EffectKey, string> = {
  kickoff:
    "Kick-off: the strip goes dark, then both kits sweep in from the ends and meet in the middle.",
  goal: "Goal! The scorer's colour bursts out from the middle and floods the strip, then it settles back to the split.",
  own_goal:
    "Own goal: it plays as a goal for the team that benefits, in their colour.",
  penalty_awarded:
    "Penalty: a slow heartbeat pulses in the taker's colour while you wait.",
  penalty_scored:
    "Penalty scored: it lands as a goal for the team that took it.",
  penalty_missed:
    "Penalty missed: the taker's colour collapses inward to dark, then recovers.",
  yellow_card: "Yellow card: the whole strip pulses yellow twice.",
  red_card:
    "Red card: a yellow flicker, then red pours in from the offender's end and drains away.",
  var: "VAR check: the strip dims and a white scan bar sweeps back and forth until the decision.",
  var_overturned:
    "Decision overturned: the strip returns to the split without celebrating.",
  corner:
    "Corner: a flag flutters at the top corner and the ball whips across the top of the TV.",
  free_kick:
    "Free kick: a white wall lines up, the ball is struck over it and the far end lights up.",
  offside:
    "Offside: a runner dashes past a white line, which turns into a waving flag.",
  half_time: "Half time: the strip fades to a warm white for the break.",
  second_half: "Second half: back to the split.",
  full_time:
    "Full time: the winner's colour floods the strip and sparkles. A draw alternates both kits.",
  nerves:
    "Nerves: a slow dimming breath while a one-goal game runs into stoppage time.",
};

/** The demo also explains the split when it moves on its own. */
export const SPLIT_CAPTION =
  "The split follows the stat you picked: the team on top takes more of the strip.";

/** Whose colour an effect plays in, as the guide labels it. */
export type GuideColour = "team" | "end" | "winner" | "match";

export interface GuideEntry {
  /** The feed event this row is about. */
  event: EventType | "nerves";
  label: string;
  /** What sets it off, in a fan's words. */
  when: string;
  /** What the strip does. */
  does: string;
  colour: GuideColour;
  /** The effect it plays, and whether it plays for the other team (own goals). Absent: no effect. */
  plays?: { effect: EffectKey; otherSide?: boolean };
}

export interface GuideSection {
  id: string;
  title: string;
  entries: GuideEntry[];
}

/**
 * The "What the lights do" guide: every event the feed reports, what triggers it and what
 * the strip does. Mirrors `effectFor` in the runner: own goals and scored penalties fold
 * into a goal, and a few events deliberately do nothing.
 */
export const EFFECT_GUIDE: GuideSection[] = [
  {
    id: "goals",
    title: "Goals and penalties",
    entries: [
      {
        event: "goal",
        label: "Goal",
        when: "Someone scores.",
        does: "The scorer's colour strobes out from the middle, floods the whole strip three times, then eases back to the split.",
        colour: "team",
        plays: { effect: "goal" },
      },
      {
        event: "own_goal",
        label: "Own goal",
        when: "A player puts it in their own net.",
        does: "Plays as a goal for the team that benefits, in their colour.",
        colour: "team",
        plays: { effect: "goal", otherSide: true },
      },
      {
        event: "penalty_awarded",
        label: "Penalty",
        when: "The referee points to the spot.",
        does: "A slow heartbeat pulses in the taker's colour while you wait.",
        colour: "team",
        plays: { effect: "penalty_awarded" },
      },
      {
        event: "penalty_scored",
        label: "Penalty scored",
        when: "The penalty goes in.",
        does: "Lands as a goal for the team that took it.",
        colour: "team",
        plays: { effect: "goal" },
      },
      {
        event: "penalty_missed",
        label: "Penalty missed",
        when: "The penalty is saved or missed.",
        does: "The taker's colour collapses inward to dark, then the split comes back.",
        colour: "team",
        plays: { effect: "penalty_missed" },
      },
    ],
  },
  {
    id: "calls",
    title: "Cards and calls",
    entries: [
      {
        event: "yellow_card",
        label: "Yellow card",
        when: "A player is booked.",
        does: "The whole strip pulses yellow twice.",
        colour: "match",
        plays: { effect: "yellow_card" },
      },
      {
        event: "red_card",
        label: "Red card",
        when: "A player is sent off.",
        does: "A yellow flicker, then red pours in from the offender's end, holds and drains away.",
        colour: "end",
        plays: { effect: "red_card" },
      },
      {
        event: "var",
        label: "VAR check",
        when: "VAR is looking at something.",
        does: "The strip dims and a white scan bar sweeps back and forth.",
        colour: "match",
        plays: { effect: "var" },
      },
      {
        event: "offside",
        label: "Offside",
        when: "The flag goes up.",
        does: "A runner dashes past a white line, which turns into a waving yellow and red flag.",
        colour: "team",
        plays: { effect: "offside" },
      },
    ],
  },
  {
    id: "set-pieces",
    title: "Set pieces",
    entries: [
      {
        event: "corner",
        label: "Corner",
        when: "A corner is given.",
        does: "A flag flutters at the top corner of the TV, the ball whips across the top and the box lights up where it drops.",
        colour: "team",
        plays: { effect: "corner" },
      },
      {
        event: "free_kick",
        label: "Free kick",
        when: "A free kick in a dangerous spot.",
        does: "A white wall lines up, the ball throbs, then it's struck over the wall and the far end lights up.",
        colour: "team",
        plays: { effect: "free_kick" },
      },
    ],
  },
  {
    id: "clock",
    title: "The match clock",
    entries: [
      {
        event: "kickoff",
        label: "Kick-off",
        when: "The match kicks off.",
        does: "The strip goes dark, then both kits sweep in from the ends and meet in the middle.",
        colour: "match",
        plays: { effect: "kickoff" },
      },
      {
        event: "half_time",
        label: "Half time",
        when: "The half-time whistle.",
        does: "The strip fades to a warm white for the break.",
        colour: "match",
        plays: { effect: "half_time" },
      },
      {
        event: "nerves",
        label: "Nerves",
        when: "A one-goal game reaches stoppage time.",
        does: "A slow dimming breath, repeated until the whistle.",
        colour: "match",
        plays: { effect: "nerves" },
      },
      {
        event: "full_time",
        label: "Full time",
        when: "The final whistle.",
        does: "The winner's colour floods the strip and sparkles. A draw alternates both kits. Then your lights are handed back.",
        colour: "winner",
        plays: { effect: "full_time" },
      },
    ],
  },
  {
    id: "quiet",
    title: "Quiet on purpose",
    entries: [
      {
        event: "second_half",
        label: "Second half",
        when: "The second half kicks off.",
        does: "No effect. The strip just goes back to the split.",
        colour: "match",
      },
      {
        event: "var_overturned",
        label: "Decision overturned",
        when: "VAR overturns a call.",
        does: "No effect. Nothing to celebrate, so the strip stays on the split.",
        colour: "match",
      },
    ],
  },
];
