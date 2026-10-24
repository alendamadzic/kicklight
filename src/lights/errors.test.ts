import { expect, test } from "bun:test";
import { isBridgeUnauthorized, isUnreachable } from "./errors";
import { BridgeHttpError } from "./local/transport";
import { HueRemoteError } from "./remote";

test("cloud and LAN credential rejections count as unauthorised", () => {
  expect(isBridgeUnauthorized(new HueRemoteError("nope", 401))).toBe(true);
  expect(isBridgeUnauthorized(new BridgeHttpError(403, "nope"))).toBe(true);
});

test("busy bridges, outages and other errors don't", () => {
  expect(isBridgeUnauthorized(new HueRemoteError("busy", 503))).toBe(false);
  expect(isBridgeUnauthorized(new BridgeHttpError(429, "busy"))).toBe(false);
  expect(isBridgeUnauthorized(new Error("ECONNREFUSED"))).toBe(false);
});

test("network failures count as unreachable, HTTP errors don't", () => {
  const refused = Object.assign(new Error("fetch failed"), {
    cause: { code: "ECONNREFUSED" },
  });
  expect(isUnreachable(refused)).toBe(true);
  expect(isUnreachable(new DOMException("t", "TimeoutError"))).toBe(true);
  expect(isUnreachable(new HueRemoteError("busy", 503))).toBe(false);
  expect(isUnreachable(new Error("boom"))).toBe(false);
  expect(isUnreachable(null)).toBe(false);
});
