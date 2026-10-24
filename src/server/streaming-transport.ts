import type { Rgb, TeamColors } from "@/engine/colors";
import type { Command } from "@/engine/runner";
import type { LightTransport } from "@/lights/transport";

// Wraps a REST transport and an Entertainment stream. While streaming it renders
// the runner's commands at 50 Hz; if the stream can't start it quietly stays on REST.

export interface StreamHandle {
  /** Handshake and begin sending frames pulled from `source`. */
  start(source: (now: number) => Rgb[]): Promise<void>;
  stop(): Promise<void>;
  readonly channelCount: number;
}

export interface FrameRenderer {
  apply(cmd: Command, now: number): void;
  frame(now: number): Rgb[];
}

export interface StreamingDeps {
  rest: LightTransport;
  handle: StreamHandle;
  makeRenderer: (channels: number, colors: TeamColors) => FrameRenderer;
  now?: () => number;
  onClosed?: () => void;
  onError?: (e: unknown) => void;
}

export class StreamingTransport implements LightTransport {
  readonly kind = "entertainment" as const;
  private renderer: FrameRenderer | null = null;
  private state: "idle" | "streaming" | "failed" = "idle";
  private starting: Promise<void> | null = null;
  private readonly now: () => number;

  constructor(private readonly d: StreamingDeps) {
    this.now = d.now ?? Date.now;
  }

  get points() {
    return this.d.rest.points;
  }

  get isStreaming() {
    return this.state === "streaming";
  }

  private async start(colors: TeamColors): Promise<void> {
    if (this.state !== "idle") return;
    if (!this.starting) {
      this.starting = (async () => {
        try {
          const r = this.d.makeRenderer(this.d.handle.channelCount, colors);
          await this.d.handle.start((now) => r.frame(now));
          this.renderer = r;
          this.state = "streaming";
        } catch (e) {
          this.state = "failed"; // stay on REST for the rest of this match
          this.d.onError?.(e);
        }
      })();
    }
    await this.starting;
  }

  async applyCommand(cmd: Command, colors: TeamColors): Promise<boolean> {
    await this.start(colors);
    if (this.state !== "streaming" || !this.renderer) return false;
    this.renderer.apply(cmd, this.now());
    return true;
  }

  setGradient(colors: Rgb[], transitionMs?: number) {
    return this.d.rest.setGradient(colors, transitionMs);
  }

  signal(s: Parameters<NonNullable<LightTransport["signal"]>>[0]) {
    return this.d.rest.signal ? this.d.rest.signal(s) : Promise.resolve();
  }

  snapshot() {
    return this.d.rest.snapshot();
  }

  /** Stop streaming first, otherwise the bridge ignores REST writes. Then put the strip back. */
  async restore(snapshot: unknown): Promise<void> {
    if (this.state === "streaming") {
      this.renderer?.apply({ kind: "restore" }, this.now());
      await this.d.handle.stop().catch((e) => this.d.onError?.(e));
    }
    this.state = "idle";
    this.renderer = null;
    this.starting = null;
    this.d.onClosed?.();
    await this.d.rest.restore(snapshot);
  }
}
