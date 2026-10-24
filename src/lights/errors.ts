import { BridgeHttpError } from "./local/transport";
import { HueRemoteError } from "./remote";

/** The bridge (cloud or LAN) no longer accepts our credentials, so retrying won't help. */
export function isBridgeUnauthorized(e: unknown): boolean {
  if (e instanceof HueRemoteError) return e.unauthorized;
  if (e instanceof BridgeHttpError) return e.status === 401 || e.status === 403;
  return false;
}
