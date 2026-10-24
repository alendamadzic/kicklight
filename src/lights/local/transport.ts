// LightTransport over the bridge's local CLIP v2 API (HTTPS on the LAN).
//
// One strip, one queue. Resting states coalesce under the key "gradient" so a burst of
// stat drift collapses to the newest value; effects (`signal`) are never dropped.
// Rate limiting: the queue spaces calls 100 ms apart, and a 429/503 from the bridge is
// retried with exponential backoff, honouring Retry-After.

import type { Rgb } from "@/engine/colors";
import type { SignalFallback } from "@/engine/effects";
import { brightnessFor, resampleNearest } from "../gradient";
import { CommandQueue } from "../queue";
import type { LightTransport } from "../transport";
import { GAMUT_C, type Gamut, rgbToXy } from "../xy";
import type { FetchLike } from "./agent";

export interface LocalTransportOptions {
  fetch: FetchLike;
  ip: string;
  /** The application key (`username` from pairing). */
  applicationKey: string;
  /** CLIP v2 light resource id of the strip. */
  lightId: string;
  /** Gradient points the strip accepts. `LocalTransport.connect` reads it from the light. */
  points?: number;
  gamut?: Gamut;
  /** Master brightness 1-100 applied on top of the colours. Default 100. */
  brightness?: number;
  queue?: CommandQueue;
  sleep?: (ms: number) => Promise<void>;
  /** Retries on 429/503 before giving up. Default 4. */
  maxRetries?: number;
  onError?: (key: string, err: unknown) => void;
}

type XyColor = { x: number; y: number };
type GradientPoint = { color: { xy: XyColor } };

export interface LightState {
  on: boolean;
  brightness: number;
  gradient: { mode: string; points: GradientPoint[] } | null;
  xy: { x: number; y: number } | null;
  mirek: number | null;
  effect: string | null;
}

export class BridgeHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BridgeHttpError";
  }
}

export interface GradientLight {
  id: string;
  name: string;
  /** Points the strip accepts (5 on a Flux). */
  pointsCapable: number;
  pixelCount: number | null;
  modes: string[];
  gamutType: string | null;
}

interface RawLight {
  id: string;
  metadata?: { name?: string };
  on?: { on: boolean };
  dimming?: { brightness: number };
  color?: {
    xy?: XyColor;
    gamut_type?: string;
    gamut?: { red: XyColor; green: XyColor; blue: XyColor };
  };
  color_temperature?: { mirek: number | null; mirek_valid?: boolean };
  gradient?: {
    points?: GradientPoint[];
    mode?: string;
    points_capable?: number;
    pixel_count?: number;
    mode_values?: string[];
  };
  effects_v2?: { status?: { effect?: string } };
}

const sleepReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

export class LocalTransport implements LightTransport {
  readonly kind = "local" as const;
  readonly points: number;

  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly queue: CommandQueue;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;
  private readonly gamut: Gamut;
  private readonly onError: (key: string, err: unknown) => void;
  private brightness: number;
  private wanted: { colors: Rgb[]; ms: number } | null = null;
  private waiters: { resolve: () => void; reject: (e: unknown) => void }[] = [];

  constructor(private readonly o: LocalTransportOptions) {
    this.points = o.points ?? 5;
    this.base = `https://${o.ip}/clip/v2/resource`;
    this.headers = {
      "hue-application-key": o.applicationKey,
      "content-type": "application/json",
    };
    this.sleep = o.sleep ?? sleepReal;
    this.maxRetries = o.maxRetries ?? 4;
    this.gamut = o.gamut ?? GAMUT_C;
    this.brightness = o.brightness ?? 100;
    this.onError = o.onError ?? (() => {});
    this.queue =
      o.queue ??
      new CommandQueue({
        sleep: this.sleep,
        onError: (k, e) => this.onError(k, e),
      });
  }

  /** Read the light once to learn its point count and gamut, then build the transport. */
  static async connect(o: LocalTransportOptions): Promise<LocalTransport> {
    const probe = new LocalTransport(o);
    const light = await probe.getLight();
    const points = light.gradient?.points_capable;
    if (!points || points < 1) {
      throw new Error(`light ${o.lightId} is not a gradient light`);
    }
    const g = light.color?.gamut;
    const gamut =
      o.gamut ?? (g ? { r: g.red, g: g.green, b: g.blue } : GAMUT_C);
    return new LocalTransport({ ...o, points, gamut });
  }

  setBrightness(percent: number): void {
    this.brightness = clamp(Math.round(percent), 1, 100);
  }

  // -- LightTransport ------------------------------------------------------

  setGradient(colors: Rgb[], transitionMs = 400): Promise<void> {
    this.wanted = { colors, ms: transitionMs };
    return new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.queue.push({
        key: "gradient",
        coalesce: "gradient",
        run: () => this.sendGradient(),
      });
    });
  }

  signal(s: SignalFallback): Promise<void> {
    const colors = s.colors.slice(0, 2).map((c) => ({
      xy: rgbToXy(c, this.gamut),
    }));
    // Hue wants whole seconds.
    const duration = Math.max(1000, Math.round(s.durationMs / 1000) * 1000);
    return this.enqueue("signal", () =>
      this.put(`/light/${this.o.lightId}`, {
        signaling: { signal: s.signal, duration, colors },
      }).then(() => undefined),
    );
  }

  async snapshot(): Promise<LightState> {
    return this.enqueue("snapshot", async () => {
      const l = await this.getLight();
      const effect = l.effects_v2?.status?.effect ?? null;
      return {
        on: l.on?.on ?? true,
        brightness: l.dimming?.brightness ?? 100,
        gradient:
          l.gradient?.points && l.gradient.points.length > 0
            ? {
                mode: l.gradient.mode ?? "interpolated_palette",
                points: l.gradient.points,
              }
            : null,
        xy: l.color?.xy ?? null,
        mirek: l.color_temperature?.mirek_valid
          ? (l.color_temperature.mirek ?? null)
          : null,
        effect: effect && effect !== "no_effect" ? effect : null,
      } satisfies LightState;
    });
  }

  async restore(snapshot: unknown): Promise<void> {
    const s = snapshot as LightState;
    // A restore replaces any resting state still waiting in the queue. That gradient will
    // never be sent, so settle its callers now instead of leaving them waiting forever.
    this.wanted = null;
    const superseded = this.waiters;
    this.waiters = [];
    for (const w of superseded) w.resolve();
    const body: Record<string, unknown> = {
      on: { on: s.on },
      dimming: { brightness: s.brightness },
      dynamics: { duration: 800 },
    };
    if (s.gradient) body.gradient = s.gradient;
    else if (s.mirek != null) body.color_temperature = { mirek: s.mirek };
    else if (s.xy) body.color = { xy: s.xy };
    if (s.effect) body.effects_v2 = { action: { effect: s.effect } };
    await this.enqueue(
      "restore",
      () => this.put(`/light/${this.o.lightId}`, body),
      "gradient",
    );
  }

  // -- extras --------------------------------------------------------------

  /** Gradient-capable lights on this bridge, for the "pick your strip" step. */
  listGradientLights(): Promise<GradientLight[]> {
    return listGradientLights(this.o.fetch, this.o.ip, this.o.applicationKey);
  }

  /** Resolves once everything queued so far has been sent. */
  idle(): Promise<void> {
    return this.queue.idle();
  }

  // -- internals -----------------------------------------------------------

  private async sendGradient(): Promise<void> {
    const w = this.wanted;
    const waiters = this.waiters;
    this.waiters = [];
    if (!w) {
      for (const x of waiters) x.resolve();
      return;
    }
    const pts = resampleNearest(w.colors, this.points).map((c) => ({
      color: { xy: rgbToXy(c, this.gamut) },
    }));
    try {
      await this.put(`/light/${this.o.lightId}`, {
        on: { on: true },
        dimming: { brightness: brightnessFor(w.colors, this.brightness) },
        gradient: { mode: "segmented_palette", points: pts },
        dynamics: { duration: Math.max(0, Math.round(w.ms)) },
      });
      for (const x of waiters) x.resolve();
    } catch (e) {
      for (const x of waiters) x.reject(e);
      throw e;
    }
  }

  private enqueue<T>(
    key: string,
    fn: () => Promise<T>,
    coalesce?: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        key,
        coalesce,
        run: async () => {
          try {
            resolve(await fn());
          } catch (e) {
            reject(e);
            throw e;
          }
        },
      });
    });
  }

  private async getLight(): Promise<RawLight> {
    const res = await this.call("GET", `/light/${this.o.lightId}`);
    const body = (await res.json()) as { data?: RawLight[] };
    const l = body.data?.[0];
    if (!l) throw new BridgeHttpError(res.status, "light not found");
    return l;
  }

  private put(path: string, body: unknown): Promise<Response> {
    return this.call("PUT", path, body);
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    let delay = 500;
    for (let attempt = 0; ; attempt++) {
      const res = await this.o.fetch(`${this.base}${path}`, {
        method,
        headers: this.headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 429 || res.status === 503) {
        if (attempt >= this.maxRetries) {
          throw new BridgeHttpError(res.status, `bridge busy (${res.status})`);
        }
        const ra = Number(res.headers.get("retry-after"));
        await res.text().catch(() => "");
        await this.sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : delay);
        delay = Math.min(delay * 2, 8000);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new BridgeHttpError(
          res.status,
          `HTTP ${res.status} ${text.slice(0, 200)}`,
        );
      }
      return res;
    }
  }
}

/** Gradient-capable lights, without needing a transport yet (onboarding). */
export async function listGradientLights(
  fetchFn: FetchLike,
  ip: string,
  applicationKey: string,
): Promise<GradientLight[]> {
  const res = await fetchFn(`https://${ip}/clip/v2/resource/light`, {
    headers: { "hue-application-key": applicationKey },
  });
  if (!res.ok) throw new BridgeHttpError(res.status, `HTTP ${res.status}`);
  const body = (await res.json()) as { data?: RawLight[] };
  return (body.data ?? [])
    .filter((l) => (l.gradient?.points_capable ?? 0) > 0)
    .map((l) => ({
      id: l.id,
      name: l.metadata?.name ?? l.id,
      pointsCapable: l.gradient?.points_capable ?? 0,
      pixelCount: l.gradient?.pixel_count ?? null,
      modes: l.gradient?.mode_values ?? [],
      gamutType: l.color?.gamut_type ?? null,
    }));
}
