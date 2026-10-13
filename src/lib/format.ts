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

export function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 5) return "now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ago`;
}

/** Black or white, whichever reads on this kit colour. */
export function readableOn(hex: string): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (Number.isNaN(n)) return "#fff";
  const lum =
    0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? "#0b0e14" : "#ffffff";
}

export const rgbCss = (c: readonly number[], a = 1) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
