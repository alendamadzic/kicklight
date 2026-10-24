import { describe, expect, test } from "bun:test";
import type { FetchLike } from "./agent";
import {
  deviceType,
  PairingError,
  pairBridge,
  pairOnce,
  pairWithRetry,
} from "./pairing";

const json = (b: unknown) => new Response(JSON.stringify(b));
const notPressed = () =>
  json([
    {
      error: { type: 101, address: "", description: "link button not pressed" },
    },
  ]);
const success = () =>
  json([
    {
      success: {
        username: "user-abc",
        clientkey: "00112233445566778899AABBCCDDEEFF",
      },
    },
  ]);

describe("pairOnce", () => {
  test("sends devicetype and generateclientkey, returns credentials", async () => {
    let seen: { url: string; body: unknown; method?: string } | null = null;
    const f: FetchLike = async (u, init) => {
      seen = {
        url: String(u),
        body: JSON.parse(String(init?.body)),
        method: init?.method,
      };
      return success();
    };
    const c = await pairOnce("10.0.0.2", f, "my server!");
    expect(c).toEqual({
      username: "user-abc",
      clientkey: "00112233445566778899AABBCCDDEEFF",
    });
    expect(seen as unknown).toEqual({
      url: "https://10.0.0.2/api",
      method: "POST",
      body: { devicetype: "kicklight#my server", generateclientkey: true },
    });
  });

  test("maps error 101 to link_button_not_pressed", async () => {
    const err = await pairOnce("10.0.0.2", async () => notPressed()).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(PairingError);
    expect(err.code).toBe("link_button_not_pressed");
  });

  test("other bridge errors are surfaced", async () => {
    const err = await pairOnce("x", async () =>
      json([{ error: { type: 7, description: "invalid value" } }]),
    ).catch((e) => e);
    expect(err.code).toBe("bridge_error");
    expect(err.hueType).toBe(7);
  });

  test("devicetype stays within Hue's 40 characters", () => {
    expect(deviceType("x".repeat(80)).length).toBe(40);
  });
});

describe("pairWithRetry", () => {
  test("polls every 2 s until the button is pressed", async () => {
    let t = 0;
    let calls = 0;
    const sleeps: number[] = [];
    const ticks: number[] = [];
    const f: FetchLike = async () => (++calls < 4 ? notPressed() : success());
    const c = await pairWithRetry("ip", f, {
      now: () => t,
      sleep: async (ms) => {
        sleeps.push(ms);
        t += ms;
      },
      onTick: (rem) => ticks.push(rem),
    });
    expect(c.username).toBe("user-abc");
    expect(calls).toBe(4);
    expect(sleeps).toEqual([2000, 2000, 2000]);
    expect(ticks).toEqual([30000, 28000, 26000, 24000]);
  });

  test("gives up after the timeout", async () => {
    let t = 0;
    let calls = 0;
    const err = await pairWithRetry(
      "ip",
      async () => {
        calls++;
        return notPressed();
      },
      {
        now: () => t,
        sleep: async (ms) => {
          t += ms;
        },
      },
    ).catch((e) => e);
    expect(err.code).toBe("link_button_not_pressed");
    expect(calls).toBe(16);
  });

  test("a zero timeout makes exactly one attempt (the pair route's mode)", async () => {
    let calls = 0;
    const err = await pairWithRetry(
      "ip",
      async () => {
        calls++;
        return notPressed();
      },
      { timeoutMs: 0, sleep: async () => {} },
    ).catch((e) => e);
    expect(calls).toBe(1);
    expect((err as PairingError).code).toBe("link_button_not_pressed");
  });

  test("a hard error stops immediately", async () => {
    let calls = 0;
    const err = await pairWithRetry("ip", async () => {
      calls++;
      throw new Error("ECONNREFUSED");
    }).catch((e) => e);
    expect(err.code).toBe("bridge_error");
    expect(calls).toBe(1);
  });
});

describe("pairBridge", () => {
  test("captures the certificate first, then pairs on a pinned fetch", async () => {
    const order: string[] = [];
    const r = await pairBridge("10.0.0.2", {
      sleep: async () => {},
      deps: {
        capture: async () => {
          order.push("capture");
          return {
            fingerprint: "ab".repeat(32),
            commonName: "c42996fffec6fcda",
            issuerCommonName: "root-bridge",
            validTo: "",
          };
        },
        makeFetch: (_ip, pin) => {
          order.push(`fetch:${pin.slice(0, 4)}`);
          return async () => success();
        },
      },
    });
    expect(order).toEqual(["capture", "fetch:abab"]);
    expect(r.bridgeId).toBe("C42996FFFEC6FCDA");
    expect(r.certFingerprint).toBe("ab".repeat(32));
    expect(r.clientkey).toHaveLength(32);
  });
});
