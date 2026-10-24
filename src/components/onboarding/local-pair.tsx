"use client";

import { RadioIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiRequestError, api } from "@/lib/api";
import { CountdownRing } from "./countdown-ring";

/** Local mode: find the bridge on the network, then wait for its link button to be pressed. */
export function LocalPair({ onLinked }: { onLinked: () => void }) {
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
              className="h-12 rounded-xl text-base font-semibold"
            >
              Try again
            </Button>
          </>
        ) : (
          <>
            <CountdownRing seconds={30} runId={run} onDone={onExpire} />
            <p className="text-base font-semibold leading-tight">
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
                  <span className="block text-base font-semibold leading-tight">
                    Hue bridge
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {b.ip}
                  </span>
                </span>
                <span className="text-sm font-semibold text-amber">Pair</span>
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
        className="h-12 rounded-xl text-base font-semibold"
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
