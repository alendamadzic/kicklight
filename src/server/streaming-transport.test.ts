import { describe, expect, test } from "bun:test";
import type { Rgb } from "@/engine/colors";
import type { LightTransport } from "@/lights/transport";
import { type StreamHandle, StreamingTransport } from "./streaming-transport";

const colors = { home: [1, 2, 3] as Rgb, away: [4, 5, 6] as Rgb };

function make(opts: { failStart?: boolean } = {}) {
  const log: string[] = [];
  const rest: LightTransport = {
    kind: "local",
    points: 5,
    setGradient: async () => void log.push("rest.gradient"),
    snapshot: async () => "snap",
    restore: async (s) => void log.push(`rest.restore:${s}`),
  };
  const handle: StreamHandle = {
    channelCount: 7,
    start: async () => {
      log.push("stream.start");
      if (opts.failStart) throw new Error("dtls failed");
    },
    stop: async () => void log.push("stream.stop"),
  };
  const errors: unknown[] = [];
  let closed = 0;
  const t = new StreamingTransport({
    rest,
    handle,
    makeRenderer: (n) => ({
      apply: (c) => void log.push(`render:${c.kind}`),
      frame: () => Array.from({ length: n }, () => [0, 0, 0] as Rgb),
    }),
    now: () => 0,
    onError: (e) => errors.push(e),
    onClosed: () => {
      closed++;
    },
  });
  return { t, log, errors, closed: () => closed };
}

describe("StreamingTransport", () => {
  test("streams once, renders commands, and stops before restoring over REST", async () => {
    const { t, log, closed } = make();
    expect(
      await t.applyCommand({ kind: "split", homeShare: 0.6 }, colors),
    ).toBe(true);
    expect(
      await t.applyCommand(
        { kind: "effect", effect: "goal", side: "home" },
        colors,
      ),
    ).toBe(true);
    expect(log.filter((l) => l === "stream.start")).toHaveLength(1);
    await t.restore("snap");
    const stopAt = log.indexOf("stream.stop");
    expect(stopAt).toBeGreaterThan(-1);
    expect(log.indexOf("rest.restore:snap")).toBeGreaterThan(stopAt);
    expect(closed()).toBe(1);
  });

  test("if streaming cannot start it falls back to REST and does not retry every command", async () => {
    const { t, log, errors } = make({ failStart: true });
    expect(
      await t.applyCommand({ kind: "split", homeShare: 0.5 }, colors),
    ).toBe(false);
    expect(
      await t.applyCommand({ kind: "split", homeShare: 0.4 }, colors),
    ).toBe(false);
    expect(log.filter((l) => l === "stream.start")).toHaveLength(1);
    expect(errors).toHaveLength(1);
    await t.setGradient([colors.home]);
    expect(log).toContain("rest.gradient");
  });

  test("restore without streaming just restores REST", async () => {
    const { t, log } = make({ failStart: true });
    await t.applyCommand({ kind: "split", homeShare: 0.5 }, colors);
    await t.restore("snap");
    expect(log).not.toContain("stream.stop");
    expect(log).toContain("rest.restore:snap");
  });
});
