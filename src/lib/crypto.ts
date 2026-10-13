import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM for Hue tokens at rest. Format: v1.<iv>.<tag>.<ciphertext>, all base64url.

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.HUE_TOKEN_KEY;
  if (!raw) throw new Error("HUE_TOKEN_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32)
    throw new Error("HUE_TOKEN_KEY must be 32 bytes, base64 encoded");
  return buf;
}

export function encrypt(plain: string, k: Buffer = key()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ct]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decrypt(blob: string, k: Buffer = key()): string {
  const [v, iv, tag, ct] = blob.split(".");
  if (v !== VERSION || !iv || !tag || !ct)
    throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    k,
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ct, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
