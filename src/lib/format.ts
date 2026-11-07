import { hexToRgb, luminance } from "@/engine/colors";
import type { MatchPhase } from "@/engine/model";

/** "63'" style minute label; "HT" / "FT" for the breaks. */
export function minuteLabel(minute: number | null, phase?: MatchPhase): string {
  if (phase === "half_time") return "HT";
  if (phase === "full_time") return "FT";
  if (phase === "scheduled" || minute == null) return "";
  return `${Math.floor(minute)}'`;
}

export const PHASE_LABEL: Record<MatchPhase, string> = {
  scheduled: "Upcoming",
  first_half: "1st half",
  half_time: "Half time",
  second_half: "2nd half",
  extra_time: "Extra time",
  shootout: "Penalties",
  full_time: "Full time",
  suspended: "Suspended",
};

export const isLivePhase = (p: MatchPhase) =>
  p === "first_half" ||
  p === "second_half" ||
  p === "extra_time" ||
  p === "shootout" ||
  p === "half_time";

export function kickoffLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) return time;
  return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/** YYYYMMDD for ESPN, local time. */
export function dateKey(offsetDays = 0, now = Date.now()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${m}${day}`;
}

/** The YYYYMMDD key `offsetDays` after (or before) another one. */
export function shiftDateKey(key: string, offsetDays: number): string {
  const d = new Date(
    Date.UTC(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8)),
  );
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

/** YYYYMMDD for ESPN as the day is in `timeZone` (an IANA name), for rendering on the server. */
export function dateKeyIn(
  timeZone: string,
  offsetDays = 0,
  now = Date.now(),
): string {
  let key: string;
  try {
    // en-CA formats as YYYY-MM-DD.
    key = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .format(now)
      .replaceAll("-", "");
  } catch {
    // Unknown zone name: fall back to UTC.
    key = new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
  }
  return offsetDays ? shiftDateKey(key, offsetDays) : key;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

/** Black or white, whichever reads on this kit colour. */
export function readableOn(hex: string): string {
  return luminance(hexToRgb(hex)) > 150 ? "#0b0e14" : "#ffffff";
}

/** CSS colour for an RGB triple, with optional alpha. */
export const rgba = (c: readonly number[], a = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
