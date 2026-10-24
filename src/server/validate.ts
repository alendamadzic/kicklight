import { isKitChoice, type KitOverrides, type Rgb } from "@/engine/colors";
import { EFFECTS, type EffectKey } from "@/engine/effects";
import { LEAGUES } from "@/engine/feed/leagues";
import { SCENARIOS } from "@/engine/feed/scenarios";
import type { Side } from "@/engine/model";
import { STAT_ORDER, type StatKey } from "@/engine/stats";
import type {
  FireEffectBody,
  IdentifyLightBody,
  SelectLightBody,
  SetLightsBody,
  StartSessionBody,
} from "@/lib/api-types";

// Request body parsers. Each takes whatever JSON arrived and returns a clean, typed body,
// or null when it isn't one. Pure, so they're unit-tested without a server.

// biome-ignore lint/suspicious/noExplicitAny: untrusted input, every field is checked below
type Body = any;

export function isRgb(v: unknown): v is Rgb {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every(
      (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 255,
    )
  );
}

export function isRgbList(v: unknown, max = 27): v is Rgb[] {
  return Array.isArray(v) && v.length >= 1 && v.length <= max && v.every(isRgb);
}

export const isKnownLeague = (slug: string) =>
  LEAGUES.some((l) => l.slug === slug);

export const isScenario = (id: string) => SCENARIOS.some((s) => s.id === id);

const STATS = new Set<string>([...STAT_ORDER, "auto", "clock"]);
const MAX_DELAY_MS = 120_000;

const sideOf = (v: unknown): Side | null =>
  v === "home" || v === "away" ? v : null;

/** A live match (a known league) or a scripted one (league "replay" + scenario id). */
export function parseStartSession(b: Body): StartSessionBody | null {
  const league = typeof b?.league === "string" ? b.league : "";
  const eventId = typeof b?.eventId === "string" ? b.eventId : "";
  const known =
    league === "replay" ? isScenario(eventId) : isKnownLeague(league);
  if (!known || !/^[\w.-]{1,40}$/.test(eventId)) return null;
  return {
    league,
    eventId,
    stat:
      typeof b.stat === "string" && STATS.has(b.stat)
        ? (b.stat as StatKey)
        : undefined,
    delayMs:
      typeof b.delayMs === "number" &&
      b.delayMs >= 0 &&
      b.delayMs <= MAX_DELAY_MS
        ? Math.round(b.delayMs)
        : undefined,
  };
}

export function parseFireEffect(b: Body): FireEffectBody | null {
  const effect = typeof b?.effect === "string" ? b.effect : "";
  if (!EFFECTS[effect as EffectKey] || !isRgb(b.home) || !isRgb(b.away))
    return null;
  return {
    effect: effect as EffectKey,
    side: sideOf(b.side),
    home: b.home,
    away: b.away,
  };
}

export function parseSetLights(b: Body): Required<SetLightsBody> | null {
  if (!isRgbList(b?.colors)) return null;
  return {
    colors: b.colors,
    transitionMs:
      typeof b.transitionMs === "number" && Number.isFinite(b.transitionMs)
        ? Math.min(5000, Math.max(0, b.transitionMs))
        : 300,
  };
}

/** Hue CLIP v2 resource ids are UUIDs. */
const isLightId = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

export function parseSelectLight(b: Body): SelectLightBody | null {
  if (!isLightId(b?.lightId)) return null;
  return {
    lightId: b.lightId,
    lightName: typeof b.lightName === "string" ? b.lightName.slice(0, 80) : "",
  };
}

export function parseIdentifyLight(b: Body): IdentifyLightBody | null {
  return isLightId(b?.lightId) ? { lightId: b.lightId } : null;
}

/** Keeps only well-formed kit choices from stored preferences JSON. */
export function parseKitOverrides(raw: unknown): KitOverrides {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).filter(([, v]) =>
      isKitChoice(v),
    ),
  ) as KitOverrides;
}
