// One door to the bridge. Hue recommends no more than about 10 light commands a
// second, and a goal effect landing on top of a stat drift must not interleave.
// Items of the same kind coalesce: a newer resting state replaces an older one that
// hasn't been sent yet. Effects are never dropped.

export interface Job<T> {
  key: string;
  /** Jobs with a `coalesce` group replace earlier unsent jobs of that group. */
  coalesce?: string;
  run: () => Promise<T> | T;
}

export interface QueueOptions {
  /** Minimum gap between sends, ms. 100 = 10 per second. */
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onError?: (key: string, err: unknown) => void;
}

export class CommandQueue {
  private jobs: Job<unknown>[] = [];
  private running = false;
  private lastSent = Number.NEGATIVE_INFINITY;
  private readonly minInterval: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onError: (key: string, err: unknown) => void;

  constructor(opts: QueueOptions = {}) {
    this.minInterval = opts.minIntervalMs ?? 100;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.onError = opts.onError ?? (() => {});
  }

  get size() {
    return this.jobs.length;
  }

  push<T>(job: Job<T>): void {
    if (job.coalesce) {
      this.jobs = this.jobs.filter((j) => j.coalesce !== job.coalesce);
    }
    this.jobs.push(job as Job<unknown>);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.jobs.length) {
        const wait = this.lastSent + this.minInterval - this.now();
        if (wait > 0) await this.sleep(wait);
        const job = this.jobs.shift();
        if (!job) break;
        this.lastSent = this.now();
        try {
          await job.run();
        } catch (err) {
          this.onError(job.key, err);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /** Resolves when everything queued so far has been sent. */
  async idle(): Promise<void> {
    while (this.running || this.jobs.length) {
      await new Promise((r) => setTimeout(r, 1));
    }
  }
}
