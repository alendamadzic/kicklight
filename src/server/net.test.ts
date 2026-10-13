import { describe, expect, test } from "bun:test";
import { isPrivateLanIpv4 } from "./net";

describe("isPrivateLanIpv4", () => {
  test("accepts RFC1918 addresses", () => {
    for (const ip of [
      "192.168.1.225",
      "10.0.0.5",
      "172.16.4.2",
      "172.31.255.1",
    ]) {
      expect(isPrivateLanIpv4(ip)).toBe(true);
    }
  });
  test("rejects public, loopback, link-local, metadata and malformed", () => {
    for (const ip of [
      "8.8.8.8",
      "127.0.0.1",
      "169.254.169.254",
      "172.32.0.1",
      "192.169.0.1",
      "0.0.0.0",
      "192.168.1.256",
      "192.168.1",
      "example.com",
      "192.168.1.1:80",
      "::1",
    ]) {
      expect(isPrivateLanIpv4(ip)).toBe(false);
    }
  });
});
