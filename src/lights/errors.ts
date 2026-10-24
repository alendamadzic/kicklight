import { BridgeHttpError } from "./local/transport";
import { HueRemoteError } from "./remote";

/** The bridge (cloud or LAN) no longer accepts our credentials, so retrying won't help. */
export function isBridgeUnauthorized(e: unknown): boolean {
  if (e instanceof HueRemoteError) return e.unauthorized;
  if (e instanceof BridgeHttpError) return e.status === 401 || e.status === 403;
  return false;
}

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
]);

/** We couldn't reach the bridge at all (network down, timed out), as opposed to an HTTP error. */
export function isUnreachable(e: unknown): boolean {
  const err = e as {
    name?: string;
    code?: string;
    cause?: { code?: string };
  } | null;
  if (!err) return false;
  if (err.name === "TimeoutError") return true;
  const code = err.code ?? err.cause?.code;
  return !!code && NETWORK_CODES.has(code);
}
