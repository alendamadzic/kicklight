import type { EffectKey } from "@/engine/effects";

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
