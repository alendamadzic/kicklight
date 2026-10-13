import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "./crypto";

describe("crypto", () => {
  const k = randomBytes(32);
  test("round trips, and never produces the same ciphertext twice", () => {
    const a = encrypt("secret-token", k);
    const b = encrypt("secret-token", k);
    expect(a).not.toBe(b);
    expect(a).not.toContain("secret-token");
    expect(decrypt(a, k)).toBe("secret-token");
  });
  test("tampering is detected", () => {
    const parts = encrypt("secret-token", k).split(".");
    parts[3] = Buffer.from("x".repeat(12)).toString("base64url");
    expect(() => decrypt(parts.join("."), k)).toThrow();
  });
  test("a different key cannot decrypt", () => {
    expect(() =>
      decrypt(encrypt("secret-token", k), randomBytes(32)),
    ).toThrow();
  });
});
