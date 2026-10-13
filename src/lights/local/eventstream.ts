// Server-sent events from the bridge: `GET /eventstream/clip/v2`.
//
// Used to notice somebody else changing the strip mid-match (the Hue app, a wall
// switch, a routine) and the bridge going offline. The bridge opens with a `: hi`
// comment, sends a keepalive comment now and then, and emits frames like
//
//   id: 1634302345:0
//   data: [{"creationtime":"...","data":[{"id":"...","type":"light","on":{"on":false}}],"id":"...","type":"update"}]
//
// The parser is incremental because TCP chunks split frames anywhere.

import type { FetchLike } from "./agent";

export interface SseFrame {
  id: string | null;
  event: string;
  data: string;
}

/** Incremental text/event-stream parser. Feed it chunks, get complete frames back. */
export class SseParser {
  private buf = "";
  private id: string | null = null;
  private event = "";
  private data: string[] = [];
  /** Last id seen, for `Last-Event-ID` on reconnect. */
  lastEventId: string | null = null;

  push(chunk: string): SseFrame[] {
    this.buf += chunk;
    const out: SseFrame[] = [];
    // Lines end in \n, \r\n or \r. A trailing \r might be half of \r\n, so keep it.
    const re = /\r\n|\n|\r(?!$)/;
    for (;;) {
      const m = re.exec(this.buf);
      if (!m) break;
      const line = this.buf.slice(0, m.index);
      this.buf = this.buf.slice(m.index + m[0].length);
      const frame = this.line(line);
      if (frame) out.push(frame);
    }
    return out;
  }

  private line(line: string): SseFrame | null {
    if (line === "") {
      if (this.data.length === 0 && this.event === "") {
        this.id = null;
        return null;
      }
      const frame: SseFrame = {
        id: this.id,
        event: this.event || "message",
        data: this.data.join("\n"),
      };
      if (this.id != null) this.lastEventId = this.id;
      this.id = null;
      this.event = "";
      this.data = [];
      return frame;
    }
    if (line.startsWith(":")) return null; // comment / keepalive
    const i = line.indexOf(":");
    const field = i === -1 ? line : line.slice(0, i);
    let value = i === -1 ? "" : line.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") this.data.push(value);
    else if (field === "id") this.id = value;
    else if (field === "event") this.event = value;
    return null;
  }
}

/** One changed resource as the bridge reports it (only the changed fields are present). */
export interface ResourceUpdate {
  id: string;
  type: string;
  owner?: { rid: string; rtype: string };
  [field: string]: unknown;
}

interface BridgeEvent {
  type?: string;
  data?: ResourceUpdate[];
}

/** Pure: a frame's JSON payload to the resource updates inside "update" events. */
export function updatesFromFrame(frame: SseFrame): ResourceUpdate[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(frame.data);
  } catch {
    return [];
  }
  const events = (Array.isArray(parsed) ? parsed : [parsed]) as BridgeEvent[];
  const out: ResourceUpdate[] = [];
  for (const e of events) {
    if (e?.type !== "update" || !Array.isArray(e.data)) continue;
    for (const r of e.data) if (r?.id && r.type) out.push(r);
  }
  return out;
}

export interface EventStreamOptions {
  fetch: FetchLike;
  ip: string;
  applicationKey: string;
  onUpdate: (update: ResourceUpdate) => void;
  onStatus?: (status: "up" | "down") => void;
  /** Reconnect delays: starts at `minBackoffMs`, doubles up to `maxBackoffMs`. */
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** No bytes (not even a keepalive) for this long means the link is dead. Default 5 min. */
  idleTimeoutMs?: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export interface EventStream {
  stop(): void;
  readonly status: "up" | "down";
}

const abortableSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });

/** Connect and keep connected until `stop()`. Never throws; reports through callbacks. */
export function startEventStream(o: EventStreamOptions): EventStream {
  const ac = new AbortController();
  const sleep = o.sleep ?? abortableSleep;
  const minBackoff = o.minBackoffMs ?? 1000;
  const maxBackoff = o.maxBackoffMs ?? 30_000;
  const idleMs = o.idleTimeoutMs ?? 300_000;
  let status: "up" | "down" = "down";
  let lastEventId: string | null = null;

  const setStatus = (s: "up" | "down") => {
    if (s === status) return;
    status = s;
    o.onStatus?.(s);
  };

  async function once(): Promise<boolean> {
    const conn = new AbortController();
    const onAbort = () => conn.abort();
    ac.signal.addEventListener("abort", onAbort, { once: true });
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(() => conn.abort(), idleMs);
    };
    let connected = false;
    try {
      const headers: Record<string, string> = {
        "hue-application-key": o.applicationKey,
        accept: "text/event-stream",
      };
      if (lastEventId) headers["last-event-id"] = lastEventId;
      arm();
      const res = await o.fetch(`https://${o.ip}/eventstream/clip/v2`, {
        headers,
        signal: conn.signal,
        timeoutMs: 0,
      });
      if (!res.ok || !res.body) return false;
      connected = true;
      setStatus("up");
      const parser = new SseParser();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        for (const frame of parser.push(
          decoder.decode(value, { stream: true }),
        )) {
          if (parser.lastEventId) lastEventId = parser.lastEventId;
          for (const u of updatesFromFrame(frame)) {
            try {
              o.onUpdate(u);
            } catch {
              // a consumer bug must not drop the stream
            }
          }
        }
      }
    } catch {
      // network error, abort or idle timeout: handled by the caller's reconnect
    } finally {
      clearTimeout(idle);
      ac.signal.removeEventListener("abort", onAbort);
    }
    return connected;
  }

  (async () => {
    let backoff = minBackoff;
    while (!ac.signal.aborted) {
      const wasUp = await once();
      if (ac.signal.aborted) break;
      setStatus("down");
      if (wasUp) backoff = minBackoff;
      await sleep(backoff, ac.signal);
      backoff = Math.min(backoff * 2, maxBackoff);
    }
    setStatus("down");
  })();

  return {
    stop: () => ac.abort(),
    get status() {
      return status;
    },
  };
}
