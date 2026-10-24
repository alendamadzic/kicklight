import { expect, test } from "bun:test";
import { isBridgeUnauthorized } from "./errors";
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
