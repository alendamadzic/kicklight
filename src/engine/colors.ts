// Kit colour handling for a light strip: what looks right on a TV wall is not what looks right on a shirt.

import { rgbToXy } from "./xy";

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return [136, 136, 136];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Perceptual-ish brightness, 0-255. */
export function luminance([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * How different two colours look on a Hue strip. The strip shows chromaticity and one
 * brightness for the whole run, so a dark red and a bright red glow as the same red:
 * compare in CIE xy, not RGB.
 */
function stripDistance(a: Rgb, b: Rgb): number {
  const p = rgbToXy(a);
  const q = rgbToXy(b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/**
 * Below this two colours read as the same on the strip. Tuned on real kits: every red v
 * red pair (Man Utd v Liverpool 0.008, v Atlético 0.039, v Roma 0.053) and blue v blue
 * (Chelsea v Everton 0.099) fall under it; red v orange (0.127) and claret v red (0.143)
 * stay apart.
 */
const CLASH_THRESHOLD = 0.11;

/** True when the strip would show the two colours as one. */
export const clashes = (a: Rgb, b: Rgb): boolean =>
  stripDistance(a, b) < CLASH_THRESHOLD;

const WARM_WHITE: Rgb = [255, 244, 230];
/** Below this a colour is effectively invisible on an LED strip. */
const MIN_LUMINANCE = 48;

/**
 * Lift near-black kit colours so they still glow. Black becomes warm white;
 * dark navy is brightened but keeps its hue.
 */
export function liftForGlow(rgb: Rgb): Rgb {
  const lum = luminance(rgb);
  if (lum >= MIN_LUMINANCE) return rgb;
  const max = Math.max(...rgb);
  // Truly neutral dark (black, charcoal): go warm white.
  if (max - Math.min(...rgb) < 24) return WARM_WHITE;
  // Dark but saturated (navy, maroon): scale up to the minimum.
  const k = MIN_LUMINANCE / Math.max(lum, 1);
  return [rgb[0] * k, rgb[1] * k, rgb[2] * k].map((v) =>
    Math.min(255, v),
  ) as Rgb;
}

/** True when a colour is too dark to glow and the strip will show a lifted version. */
export function needsLift(rgb: Rgb): boolean {
  return luminance(rgb) < MIN_LUMINANCE;
}

/**
 * A viewer's choice of strip colour for one team: its primary kit colour, its
 * alternate, or a colour of their own (`#rrggbb`).
 */
export type KitChoice = "primary" | "alternate" | `#${string}`;
/**
 * Kit choices as stored in preferences. A bare team id holds for every match; a
 * `matchKitKey` holds for one match and wins over it.
 */
export type KitOverrides = Readonly<Record<string, KitChoice>>;

const HEX = /^#[0-9a-f]{6}$/i;

export const isKitChoice = (v: unknown): v is KitChoice =>
  v === "primary" ||
  v === "alternate" ||
  (typeof v === "string" && HEX.test(v));

/** The overrides key for a choice that holds for one match only. */
export const matchKitKey = (matchId: string, teamId: string): string =>
  `${matchId}:${teamId}`;

/** A team's colours as the strip picker sees them. */
export interface KitTeam {
  color: string;
  alternateColor: string;
  /** Chosen for this match by the viewer: the clash rule leaves it alone. */
  pinned?: boolean;
}

/**
 * Apply the viewer's kit choice to a team before the strip colours are picked.
 * A choice made for this match (`matchId`) wins and is pinned, so the clash rule
 * won't undo it. An every-match choice still gives way to a clash: a custom
 * colour keeps the team's own primary as its fallback.
 */
export function applyKitOverride<
  T extends { id: string; color: string; alternateColor: string },
>(
  team: T,
  overrides?: KitOverrides | null,
  matchId?: string | null,
): T & { pinned?: boolean } {
  const forMatch = matchId
    ? overrides?.[matchKitKey(matchId, team.id)]
    : undefined;
  if (forMatch && isKitChoice(forMatch))
    return { ...choose(team, forMatch), pinned: true };
  const choice = overrides?.[team.id];
  if (!choice || !isKitChoice(choice)) return team;
  return choose(team, choice);
}

function choose<T extends { color: string; alternateColor: string }>(
  team: T,
  choice: KitChoice,
): T {
  if (choice === "primary") return team;
  if (choice === "alternate")
    return { ...team, color: team.alternateColor, alternateColor: team.color };
  return { ...team, color: choice, alternateColor: team.color };
}

/** The two team colours the strip is drawn in. */
export interface TeamColors {
  home: Rgb;
  away: Rgb;
}

export interface StripColors extends TeamColors {
  /** True when the away side had to switch to its alternate colour. */
  awaySwitched: boolean;
  /** True when the home side had to switch (the away side couldn't). */
  homeSwitched: boolean;
}

/**
 * Pick the two colours the strip will show. When they'd glow alike, away switches
 * to its alternate; if that can't separate them (or the viewer pinned away's
 * colour), home switches instead. A side the viewer pinned for this match never
 * switches, even when that leaves the two alike.
 */
export function pickStripColors(home: KitTeam, away: KitTeam): StripColors {
  const h = liftForGlow(hexToRgb(home.color));
  const a = liftForGlow(hexToRgb(away.color));
  const out = { home: h, away: a, awaySwitched: false, homeSwitched: false };
  if (!clashes(h, a)) return out;
  const awayAlt = away.pinned
    ? null
    : liftForGlow(hexToRgb(away.alternateColor));
  const homeAlt = home.pinned
    ? null
    : liftForGlow(hexToRgb(home.alternateColor));
  // Prefer a switch that separates them: away first, then home.
  if (awayAlt && !clashes(h, awayAlt))
    return { ...out, away: awayAlt, awaySwitched: true };
  if (homeAlt && !clashes(homeAlt, a))
    return { ...out, home: homeAlt, homeSwitched: true };
  // Neither does: take whatever helps most, if anything.
  if (awayAlt && stripDistance(h, awayAlt) > stripDistance(h, a))
    return { ...out, away: awayAlt, awaySwitched: true };
  return out;
}
