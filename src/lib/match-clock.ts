import type { ClockReading, MatchPhase } from "@/engine/model";

/** Seconds on the match clock at `t`, run on from a reading. Never before its period began. */
export function clockAt(r: ClockReading, t: number): number {
  if (!r.running) return r.seconds;
  return Math.max(r.from, r.seconds + (t - r.at) / 1000);
}

/**
 * Which reading to run the clock from once a new one lands. Polls come in with feed
 * jitter, and in added time only to the minute, so a reading a little behind where the
 * clock has run to is ignored: the clock on screen never ticks backwards for it. A
 * reading ahead, a big correction, or a new period takes over.
 */
export function nextAnchor(
  prev: ClockReading | null,
  next: ClockReading,
): ClockReading {
  if (!prev || prev.running !== next.running || prev.from !== next.from)
    return next;
  if (!next.running) return next.seconds === prev.seconds ? prev : next;
  const projected = clockAt(prev, next.at);
  if (next.seconds > projected + 1 || next.seconds < projected - 90)
    return next;
  return prev;
}

export interface ClockMark {
  reading: ClockReading;
  phase: MatchPhase;
}

/** The reading the clock runs from, and the one before it for a TV still behind it. */
export interface ClockTrack {
  cur: ClockMark;
  prev: ClockMark | null;
}

export function trackClock(
  track: ClockTrack | null,
  reading: ClockReading,
  phase: MatchPhase,
): ClockTrack {
  const anchor = nextAnchor(track?.cur.reading ?? null, reading);
  if (track && anchor === track.cur.reading) return track;
  return { cur: { reading: anchor, phase }, prev: track?.cur ?? null };
}

/**
 * What the clock showed at `t`. A delayed TV can still be in the first half when the
 * feed has gone to half time, so until `t` reaches the newest reading, the one before holds.
 */
export function markAt(track: ClockTrack, t: number): ClockMark {
  return t < track.cur.reading.at && track.prev ? track.prev : track.cur;
}

/** 3725 → "62:05". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
