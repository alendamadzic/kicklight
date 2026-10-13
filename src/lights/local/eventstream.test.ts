import { describe, expect, test } from "bun:test";
import type { FetchLike } from "./agent";
import {
  type ResourceUpdate,
  SseParser,
  startEventStream,
  updatesFromFrame,
} from "./eventstream";

const FRAME = `id: 1634302345:0
data: [{"creationtime":"2026-10-13T10:00:00Z","data":[{"id":"light-1","type":"light","on":{"on":false}}],"id":"e1","type":"update"}]

`;

describe("SseParser", () => {
  test("keepalive comments produce no frames", () => {
    const p = new SseParser();
    expect(p.push(": hi\n\n")).toEqual([]);
    expect(p.push(":\n\n")).toEqual([]);
  });

  test("parses a whole frame", () => {
    const p = new SseParser();
    const f = p.push(`: hi\n\n${FRAME}`);
    expect(f).toHaveLength(1);
    expect(f[0].id).toBe("1634302345:0");
    expect(p.lastEventId).toBe("1634302345:0");
    expect(updatesFromFrame(f[0])).toEqual([
      { id: "light-1", type: "light", on: { on: false } },
    ]);
  });

  test("frames split at every byte boundary give the same result", () => {
    const text = `: hi\n\n${FRAME}${FRAME.replace("1634302345:0", "1634302345:1")}`;
    for (let cut = 1; cut < text.length; cut += 7) {
      const p = new SseParser();
      const frames = [
        ...p.push(text.slice(0, cut)),
        ...p.push(text.slice(cut)),
      ];
      expect(frames.map((f) => f.id)).toEqual(["1634302345:0", "1634302345:1"]);
    }
    const p = new SseParser();
    const bytewise: string[] = [];
    for (const ch of text)
      for (const f of p.push(ch)) bytewise.push(f.id ?? "");
    expect(bytewise).toEqual(["1634302345:0", "1634302345:1"]);
  });

  test("handles CRLF and multi-line data", () => {
    const p = new SseParser();
    const f = p.push("id: 7\r\ndata: a\r\ndata: b\r\n\r\n");
    expect(f).toEqual([{ id: "7", event: "message", data: "a\nb" }]);
  });

  test("a trailing CR waits for its LF", () => {
    const p = new SseParser();
    expect(p.push("data: x\r")).toEqual([]);
    expect(p.push("\n\r\n")).toHaveLength(1);
  });

  test("non-update events and bad JSON are ignored", () => {
    expect(
      updatesFromFrame({
        id: null,
        event: "message",
        data: '[{"type":"add","data":[{"id":"x","type":"light"}]}]',
      }),
    ).toEqual([]);
    expect(
      updatesFromFrame({ id: null, event: "message", data: "{oops" }),
    ).toEqual([]);
  });
});

function controllable() {
  const enc = new TextEncoder();
  const streams: {
    push: (s: string) => void;
    end: () => void;
    error: () => void;
  }[] = [];
  const headers: Record<string, string>[] = [];
  const fetch: FetchLike = async (_u, init) => {
    headers.push(Object.fromEntries(new Headers(init?.headers)));
    let ctl!: ReadableStreamDefaultController<Uint8Array>;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        ctl = c;
      },
    });
    init?.signal?.addEventListener("abort", () => {
      try {
        ctl.error(new Error("aborted"));
      } catch {}
    });
    streams.push({
      push: (s) => ctl.enqueue(enc.encode(s)),
      end: () => ctl.close(),
      error: () => ctl.error(new Error("reset")),
    });
    return new Response(body, {
      headers: { "content-type": "text/event-stream" },
    });
  };
  return { fetch, streams, headers };
}

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("startEventStream", () => {
  test("reports up, delivers updates, reconnects with backoff and Last-Event-ID", async () => {
    const c = controllable();
    const updates: ResourceUpdate[] = [];
    const status: string[] = [];
    const sleeps: number[] = [];
    const es = startEventStream({
      fetch: c.fetch,
      ip: "192.168.1.225",
      applicationKey: "k",
      onUpdate: (u) => updates.push(u),
      onStatus: (s) => status.push(s),
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    await tick();
    expect(c.headers[0]["hue-application-key"]).toBe("k");
    expect(c.headers[0].accept).toBe("text/event-stream");
    c.streams[0].push(": hi\n\n");
    c.streams[0].push(FRAME.slice(0, 30));
    await tick();
    expect(status).toEqual(["up"]);
    expect(updates).toHaveLength(0);
    c.streams[0].push(FRAME.slice(30));
    await tick();
    expect(updates).toHaveLength(1);

    c.streams[0].error();
    await tick(20);
    expect(status).toEqual(["up", "down", "up"]);
    expect(c.streams).toHaveLength(2);
    expect(c.headers[1]["last-event-id"]).toBe("1634302345:0");
    expect(sleeps[0]).toBe(1000);

    es.stop();
    await tick();
    expect(es.status).toBe("down");
  });

  test("backoff doubles while the bridge stays unreachable and caps", async () => {
    const sleeps: number[] = [];
    let attempts = 0;
    const status: string[] = [];
    let stop: () => void = () => {};
    const es = startEventStream({
      fetch: async () => {
        attempts++;
        throw new Error("EHOSTUNREACH");
      },
      ip: "x",
      applicationKey: "k",
      onUpdate: () => {},
      onStatus: (s) => status.push(s),
      maxBackoffMs: 4000,
      sleep: async (ms) => {
        sleeps.push(ms);
        if (sleeps.length === 5) stop();
      },
    });
    stop = es.stop;
    await tick(30);
    expect(sleeps.slice(0, 5)).toEqual([1000, 2000, 4000, 4000, 4000]);
    expect(attempts).toBeGreaterThanOrEqual(5);
    expect(status).toEqual([]); // never went up, never reported down
  });

  test("a stalled connection is dropped after the idle timeout", async () => {
    const c = controllable();
    const status: string[] = [];
    const es = startEventStream({
      fetch: c.fetch,
      ip: "x",
      applicationKey: "k",
      onUpdate: () => {},
      onStatus: (s) => status.push(s),
      idleTimeoutMs: 30,
      sleep: async () => {
        await tick(500);
      },
    });
    await tick(10);
    expect(status).toEqual(["up"]);
    await tick(80);
    expect(status).toEqual(["up", "down"]);
    es.stop();
  });

  test("a throwing consumer does not drop the stream", async () => {
    const c = controllable();
    let n = 0;
    const es = startEventStream({
      fetch: c.fetch,
      ip: "x",
      applicationKey: "k",
      onUpdate: () => {
        n++;
        throw new Error("consumer bug");
      },
    });
    await tick();
    c.streams[0].push(FRAME + FRAME);
    await tick();
    expect(n).toBe(2);
    es.stop();
  });
});
