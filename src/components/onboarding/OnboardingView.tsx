"use client";

import { CheckIcon, LinkIcon, RadioIcon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CountdownRing } from "@/components/onboarding/CountdownRing";
import { STRIP_POINTS } from "@/components/strip/compose";
import { VirtualStrip } from "@/components/strip/VirtualStrip";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Rgb } from "@/engine/colors";
import { useConfig, useHueStatus } from "@/hooks/use-api-data";
import { ApiRequestError, api, startHueOAuth } from "@/lib/api";
import type { HueLightInfo } from "@/lib/api-types";
import { FIXTURE_LIGHTS } from "@/lib/fixtures";
import { cn } from "@/lib/utils";

const STEPS = ["Link Hue", "Pick strip", "Test it"] as const;
const SEGMENTS = 5;
const SEGMENT_COLORS: Rgb[] = [
  [255, 82, 82],
  [255, 181, 71],
  [79, 209, 139],
  [111, 183, 255],
  [181, 140, 255],
];
const STEP_MS = 520;

export function OnboardingView() {
  const config = useConfig();
  const { result, refresh } = useHueStatus();
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Skip ahead when the Hue link already exists (e.g. back from the OAuth redirect).
  useEffect(() => {
    if (seeded || result.phase === "loading") return;
    setSeeded(true);
    if (result.phase === "ok" && result.status.linked) {
      setStep(result.status.lightId ? 2 : 1);
    }
  }, [result, seeded]);

  const signedOut = result.phase === "signed_out";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="kl-eyebrow">Set up · three taps</p>
        <h1 className="kl-display text-4xl leading-none sm:text-5xl">
          Wire up the <span className="text-amber">strip</span>
        </h1>
      </header>

      <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <div
              className={cn(
                "h-1.5 rounded-full transition-colors",
                i < step ? "bg-success" : i === step ? "bg-amber" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "kl-display mt-1.5 block text-base leading-none",
                i === step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <LinkStep
          mode={config.mode}
          signedOut={signedOut}
          apiMissing={result.phase === "unavailable"}
          linked={result.phase === "ok" && result.status.linked}
          onLinked={() => {
            void refresh();
            setStep(1);
          }}
          onPreview={() => {
            setPreview(true);
            setStep(1);
          }}
          onNext={() => setStep(1)}
        />
      ) : null}
      {step === 1 ? (
        <PickStep
          preview={preview}
          selectedId={result.phase === "ok" ? result.status.lightId : null}
          onPicked={() => setStep(2)}
          onBack={() => setStep(0)}
        />
      ) : null}
      {step === 2 ? (
        <TestStep preview={preview} onBack={() => setStep(1)} />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- step 1 */

function LinkStep({
  mode,
  signedOut,
  apiMissing,
  linked,
  onLinked,
  onPreview,
  onNext,
}: {
  mode: "cloud" | "local";
  signedOut: boolean;
  apiMissing: boolean;
  linked: boolean;
  onLinked: () => void;
  onPreview: () => void;
  onNext: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const linkCloud = async () => {
    setBusy(true);
    const ok = await startHueOAuth();
    if (!ok) {
      setBusy(false);
      setUnavailable(true);
      toast.error("Hue linking isn't available on this server yet.");
    }
  };

  return (
    <section
      className="kl-panel flex flex-col gap-5 p-5"
      aria-labelledby="link-h"
    >
      <div>
        <h2 id="link-h" className="kl-display text-2xl leading-none">
          {mode === "local" ? "Find your bridge" : "Link your Philips Hue"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "local"
            ? "Kicklight finds the Hue bridge on your network. You'll press its link button once."
            : "Sign in with Hue and approve Kicklight. It only drives the strip you pick."}
        </p>
      </div>

      {signedOut ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Sign in first so the link is saved to your account.
          </p>
          <Link
            href="/login?next=/onboarding"
            className={buttonVariants({
              size: "lg",
              className: "kl-display h-12 rounded-xl text-lg",
            })}
          >
            Sign in
          </Link>
        </div>
      ) : linked ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckIcon className="size-4" /> Hue is linked.
          </p>
          <Button
            size="lg"
            onClick={onNext}
            className="kl-display h-12 rounded-xl text-lg"
          >
            Continue
          </Button>
        </div>
      ) : mode === "local" ? (
        <LocalPair onLinked={onLinked} />
      ) : (
        <Button
          size="lg"
          onClick={linkCloud}
          disabled={busy}
          className="kl-display h-12 rounded-xl text-lg"
        >
          {busy ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <LinkIcon data-icon="inline-start" />
          )}
          Link Philips Hue
        </Button>
      )}

      {unavailable || signedOut || apiMissing ? (
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={onPreview}
            className="kl-press min-h-11 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Preview the rest with a sample strip
          </button>
        </div>
      ) : null}
    </section>
  );
}

function LocalPair({ onLinked }: { onLinked: () => void }) {
  const [bridges, setBridges] = useState<
    { id: string | null; ip: string }[] | null
  >(null);
  const [finding, setFinding] = useState(false);
  const [pairing, setPairing] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [expired, setExpired] = useState(false);
  const done = useRef(false);

  const discover = async () => {
    setFinding(true);
    try {
      const res = await api.localDiscover();
      setBridges(res.bridges);
      if (!res.bridges.length)
        toast("No bridge found. Is it on the same network?");
    } catch (e) {
      toast.error(
        e instanceof ApiRequestError && e.unauthenticated
          ? "Sign in first."
          : "Couldn't search the network.",
      );
    } finally {
      setFinding(false);
    }
  };

  // While the ring runs, poll pair every 2s until the link button was pressed.
  useEffect(() => {
    if (!pairing || expired) return;
    // `run` restarts polling after a timed-out attempt.
    void run;
    done.current = false;
    let stop = false;
    const attempt = async () => {
      if (stop || done.current) return;
      try {
        const res = await api.localPair({ ip: pairing });
        if (res.ok) {
          done.current = true;
          toast.success("Bridge linked");
          onLinked();
          return;
        }
      } catch {
        // keep trying until the ring runs out
      }
      if (!stop) setTimeout(attempt, 2000);
    };
    void attempt();
    return () => {
      stop = true;
    };
  }, [pairing, expired, run, onLinked]);

  const onExpire = useCallback(() => setExpired(true), []);

  if (pairing) {
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        {expired ? (
          <>
            <p className="text-sm text-muted-foreground">
              Time ran out before the button was pressed.
            </p>
            <Button
              size="lg"
              onClick={() => {
                setExpired(false);
                setRun((r) => r + 1);
              }}
              className="kl-display h-12 rounded-xl text-lg"
            >
              Try again
            </Button>
          </>
        ) : (
          <>
            <CountdownRing seconds={30} runId={run} onDone={onExpire} />
            <p className="kl-display text-xl leading-tight">
              Press the round button on your bridge
            </p>
            <p className="text-sm text-muted-foreground">
              Waiting for it. Kicklight checks every two seconds.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {bridges?.length ? (
        <ul className="flex flex-col gap-2">
          {bridges.map((b) => (
            <li key={b.ip}>
              <button
                type="button"
                onClick={() => setPairing(b.ip)}
                className="kl-press flex min-h-14 w-full items-center gap-3 rounded-xl border border-border bg-background px-4 text-left transition-colors hover:border-foreground/30"
              >
                <RadioIcon className="size-5 text-amber" />
                <span className="flex-1">
                  <span className="kl-display block text-lg leading-none">
                    Hue bridge
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {b.ip}
                  </span>
                </span>
                <span className="kl-display text-sm text-amber">Pair</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button
        size="lg"
        variant={bridges?.length ? "secondary" : "default"}
        onClick={discover}
        disabled={finding}
        className="kl-display h-12 rounded-xl text-lg"
      >
        {finding ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <RadioIcon data-icon="inline-start" />
        )}
        {bridges ? "Search again" : "Find my bridge"}
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------- step 2 */

function PickStep({
  preview,
  selectedId,
  onPicked,
  onBack,
}: {
  preview: boolean;
  selectedId: string | null;
  onPicked: () => void;
  onBack: () => void;
}) {
  const [lights, setLights] = useState<HueLightInfo[] | null>(null);
  const [sample, setSample] = useState(false);
  const [choosing, setChoosing] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      if (preview) {
        setLights(FIXTURE_LIGHTS);
        setSample(true);
        return;
      }
      try {
        const res = await api.hueLights();
        if (live) setLights(res.lights);
      } catch {
        if (live) {
          setLights(FIXTURE_LIGHTS);
          setSample(true);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [preview]);

  const pick = async (light: HueLightInfo) => {
    setChoosing(light.id);
    if (!sample) {
      try {
        await api.selectLight({ lightId: light.id, lightName: light.name });
      } catch {
        toast.error("Couldn't save that strip. Try again.");
        setChoosing(null);
        return;
      }
    }
    setChoosing(null);
    onPicked();
  };

  return (
    <section
      className="kl-panel flex flex-col gap-4 p-5"
      aria-labelledby="pick-h"
    >
      <div>
        <h2 id="pick-h" className="kl-display text-2xl leading-none">
          Which strip is behind your TV?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Only gradient-capable lights show up. Kicklight needs 5 colour points.
        </p>
      </div>
      {sample ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Sample lights shown. Your bridge's lights appear here once it's
          linked.
        </p>
      ) : null}
      {lights === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner /> Looking for strips…
        </div>
      ) : lights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No gradient strips found on this bridge. Gradient lightstrips and Play
          bars work best.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lights.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => pick(l)}
                disabled={choosing !== null}
                aria-pressed={selectedId === l.id}
                className={cn(
                  "kl-press flex min-h-16 w-full items-center gap-3 rounded-xl border bg-background px-4 text-left transition-colors hover:border-foreground/30 disabled:opacity-60",
                  selectedId === l.id ? "border-amber" : "border-border",
                )}
              >
                <ZapIcon className="size-5 shrink-0 text-amber" />
                <span className="min-w-0 flex-1">
                  <span className="kl-display block truncate text-xl leading-none">
                    {l.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {l.pointsCapable} colour points
                  </span>
                </span>
                {choosing === l.id ? (
                  <Spinner />
                ) : (
                  <span className="kl-display text-sm text-amber">Use</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onBack}
        className="kl-press min-h-11 self-start text-sm text-muted-foreground underline underline-offset-4"
      >
        Back
      </button>
    </section>
  );
}

/* ---------------------------------------------------------------- step 3 */

function TestStep({
  preview,
  onBack,
}: {
  preview: boolean;
  onBack: () => void;
}) {
  const startRef = useRef<number | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");

  const frame = useCallback((now: number): Rgb[] => {
    const start = startRef.current;
    const n = STRIP_POINTS;
    const dim: Rgb = [14, 14, 18];
    if (start === null) return Array.from({ length: n }, () => dim);
    const lit = Math.min(SEGMENTS, Math.floor((now - start) / STEP_MS) + 1);
    return Array.from({ length: n }, (_, i) => {
      const seg = Math.min(SEGMENTS - 1, Math.floor((i / n) * SEGMENTS));
      return seg < lit ? SEGMENT_COLORS[seg] : dim;
    });
  }, []);

  const run = async () => {
    startRef.current = Date.now();
    setState("running");
    if (!preview) {
      api.hueTest().catch((e) => {
        if (e instanceof ApiRequestError && !e.unavailable)
          toast.error("Your strip didn't answer the test.");
      });
    }
    setTimeout(() => setState("done"), SEGMENTS * STEP_MS + 600);
  };

  return (
    <section
      className="kl-panel flex flex-col gap-4 p-5"
      aria-labelledby="test-h"
    >
      <div>
        <h2 id="test-h" className="kl-display text-2xl leading-none">
          Light it up
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Five colour segments will fire one after another, on the strip and
          below.
        </p>
      </div>
      <VirtualStrip frame={frame} label="Virtual strip test pattern" />
      {state === "done" ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckIcon className="size-4" /> Did all five segments light in
            order? You're set.
          </p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Link
              href="/"
              className={buttonVariants({
                size: "lg",
                className: "kl-display h-12 rounded-xl text-lg",
              })}
            >
              Go to matches
            </Link>
            <Button
              variant="secondary"
              size="lg"
              onClick={run}
              className="kl-display h-12 rounded-xl text-lg"
            >
              Run again
            </Button>
          </div>
        </div>
      ) : (
        <Button
          size="lg"
          onClick={run}
          disabled={state === "running"}
          className="kl-display h-12 rounded-xl text-lg"
        >
          {state === "running" ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <ZapIcon data-icon="inline-start" />
          )}
          {state === "running" ? "Testing…" : "Test my strip"}
        </Button>
      )}
      <button
        type="button"
        onClick={onBack}
        className="kl-press min-h-11 self-start text-sm text-muted-foreground underline underline-offset-4"
      >
        Back
      </button>
    </section>
  );
}
