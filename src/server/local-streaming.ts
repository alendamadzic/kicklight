import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decrypt } from "@/lib/crypto";
import { createBridgeFetch } from "@/lights/local/agent";
import {
  EntertainmentSession,
  ensureConfiguration,
  fetchApplicationId,
} from "@/lights/local/entertainment";
import { createRenderer } from "@/lights/local/renderer";
import type { LightTransport } from "@/lights/transport";
import { localTransportFor } from "./hue-link";
import { StreamingTransport } from "./streaming-transport";

// Local mode: REST by default, upgraded to a 50 Hz Entertainment stream when
// KICKLIGHT_ENTERTAINMENT=1 and the bridge was paired by Kicklight (so we hold a clientkey).
// One long-lived StreamingTransport per user while a match runs; anything that goes
// wrong on the way falls back to plain REST for that match.

const live = new Map<string, StreamingTransport>();

export async function localTransportWithStreaming(
  admin: SupabaseClient,
  userId: string,
): Promise<LightTransport | null> {
  const base = await localTransportFor(admin, userId);
  if (!base) return null;
  if (process.env.KICKLIGHT_ENTERTAINMENT !== "1") return base.transport;

  const existing = live.get(userId);
  if (existing) return existing;

  try {
    const { data: sec } = await admin
      .from("hue_secrets")
      .select("app_key_enc, client_key_enc")
      .eq("user_id", userId)
      .maybeSingle();
    if (!sec?.client_key_enc || !sec.app_key_enc) return base.transport; // paired elsewhere: no clientkey
    const { link } = base;
    if (!link.bridge_ip || !link.cert_fingerprint || !link.light_id)
      return base.transport;

    const api = {
      fetch: createBridgeFetch({
        ip: link.bridge_ip,
        trust: { pin: link.cert_fingerprint },
      }),
      ip: link.bridge_ip,
      applicationKey: decrypt(sec.app_key_enc as string),
    };
    const config = await ensureConfiguration(api, link.light_id, {
      name: "Kicklight",
    });
    if (config.id !== link.entertainment_config_id) {
      await admin
        .from("hue_links")
        .update({ entertainment_config_id: config.id })
        .eq("user_id", userId);
    }
    const session = new EntertainmentSession({
      api,
      config,
      identity: await fetchApplicationId(api),
      clientKey: decrypt(sec.client_key_enc as string),
      onClose: (err) =>
        console.error(
          "[kicklight] entertainment stream closed",
          err?.message ?? "",
        ),
    });
    const st = new StreamingTransport({
      rest: base.transport,
      handle: {
        channelCount: config.channelIds.length,
        start: (source) => session.start(source),
        stop: () => session.stop(),
      },
      makeRenderer: (channels, colors) => createRenderer({ channels, colors }),
      onClosed: () => live.delete(userId),
      onError: (e) =>
        console.error(
          "[kicklight] entertainment unavailable, using REST:",
          (e as Error).message,
        ),
    });
    live.set(userId, st);
    return st;
  } catch (e) {
    console.error(
      "[kicklight] entertainment setup failed, using REST:",
      (e as Error).message,
    );
    return base.transport;
  }
}
