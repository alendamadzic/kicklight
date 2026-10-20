"use client";

import { ArrowLeftIcon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DelaySlider } from "@/components/match/DelaySlider";
import { LivePill } from "@/components/match/LivePill";
import { LiveReadout } from "@/components/match/LiveReadout";
import { ScoreBug } from "@/components/match/ScoreBug";
import { STAT_LABEL, StatChannels } from "@/components/match/StatChannels";
import { Ticker } from "@/components/match/Ticker";
import {
  frameFromMirror,
  resolveMirror,
  restingFor,
  STRIP_POINTS,
} from "@/components/strip/compose";
import { VirtualStrip } from "@/components/strip/VirtualStrip";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { pickStripColors, rgbToHex } from "@/engine/colors";
import { leagueName } from "@/engine/feed/leagues";
import type { MatchSnapshot } from "@/engine/model";
import { STAT_MODES, type StatKey } from "@/engine/stats";
import { useDemoEngine } from "@/hooks/use-demo-engine";
import { useLiveSession } from "@/hooks/use-live-session";
import { useMatchPreview } from "@/hooks/use-match-preview";
import { usePreferences } from "@/hooks/use-preferences";
import { ApiRequestError, api } from "@/lib/api";
import type { MirroredCommand } from "@/lib/api-types";
import { REPLAY_LEAGUE, scenarioById } from "@/lib/fixtures";
import { isLivePhase, minuteLabel, PHASE_LABEL } from "@/lib/format";
import { effectLabel, type TickerItem, TOAST_EFFECTS } from "@/lib/ticker";
import { cn } from "@/lib/utils";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * THE REMOTE. Subscribes to the user's live session and mirrors the strip locally;
 * with no session it shows the match preview and a big Start button. Scripted
 * matches can also run as a local simulation when there's no backend.
 */
export function MatchRemote({ league, id }: { league: string; id: string }) {
  const router = useRouter();
  const { prefs, update } = usePreferences();
  const {
    session,
    loading: sessionLoading,
    steer,
    clear,
    reload,
  } = useLiveSession();
  const preview = useMatchPreview(league, id);
  const now = useNow(1000);

  const scenario = scenarioById(id);
  const sim = useDemoEngine({ scenarioId: scenario?.id, speed: 60 });
  const [simOn, setSimOn] = useState(false);
  const [starting, setStarting] = useState(false);
  const [localStat, setLocalStat] = useState<StatKey | null>(null);
  const [delayOverride, setDelayOverride] = useState<number | null>(null);

  const isMine =
    !!session && session.league === league && session.event_id === id;
  const mode: "live" | "sim" | "preview" = isMine
    ? "live"
    : simOn
      ? "sim"
      : "preview";
  const mirror = isMine ? session.snapshot : null;
  // The phone saves a new stat at once; the lights (and so the mirror) follow on the
  // session's next tick. Until then, say so rather than show the old stat as the new one.
  const switching =
    isMine &&
    session.status === "active" &&
    !!mirror?.stat &&
    mirror.stat !== session.stat;

  // ---------- one view model, three sources ----------
  const stat: StatKey =
    mode === "live"
      ? (session?.stat ?? "auto")
      : mode === "sim"
        ? (sim.ui?.stat ?? "auto")
        : (localStat ?? prefs.default_stat);
  const delayMs =
    mode === "live"
      ? (session?.delay_ms ?? 0)
      : (delayOverride ?? prefs.tv_delay_ms);

  let snapshot: MatchSnapshot | null = preview.data?.snapshot ?? null;
  if (mode === "live" && mirror) snapshot = mirror.match;
  if (mode === "sim" && sim.ui) snapshot = sim.ui.snapshot;

  const kit = useMemo(
    () => (snapshot ? pickStripColors(snapshot.home, snapshot.away) : null),
    [snapshot],
  );
  const colors = mode === "live" && mirror ? mirror.colors : kit;

  const mirrorView = useMemo(
    () => (mirror ? resolveMirror(mirror, now) : null),
    [mirror, now],
  );

  const activeStat: StatKey =
    mode === "live" && mirror
      ? mirror.activeStat
      : mode === "sim" && sim.ui
        ? sim.ui.activeStat
        : stat === "auto"
          ? "possession"
          : stat;

  const share: number | null = (() => {
    if (mode === "sim" && sim.ui) return sim.ui.share;
    if (mode === "live" && mirrorView?.share != null) return mirrorView.share;
    if (!snapshot) return null;
    const key =
      activeStat === "auto" || activeStat === "clock"
        ? "possession"
        : activeStat;
    return STAT_MODES[key].homeShare({
      snapshot,
      events: preview.data?.events ?? [],
    });
  })();

  const values: [string, string] | null = (() => {
    if (mode === "sim" && sim.ui) return sim.ui.values;
    if (!snapshot) return null;
    const key =
      activeStat === "auto" || activeStat === "clock"
        ? "possession"
        : activeStat;
    return (
      STAT_MODES[key].values?.({
        snapshot,
        events: preview.data?.events ?? [],
      }) ?? null
    );
  })();

  const ticker: TickerItem[] = useMemo(() => {
    if (mode === "sim" && sim.ui) return sim.ui.ticker;
    if (mode === "live" && mirror) {
      return mirror.recent
        .filter((c) => c.kind === "effect" && c.effect && c.at <= now)
        .sort((a, b) => b.at - a.at)
        .map((c) => ({
          id: `${c.at}-${c.effect}`,
          effect: c.effect as TickerItem["effect"],
          side: c.side ?? null,
          at: c.at,
          minute: c.minute ?? null,
        }));
    }
    return [];
  }, [mode, mirror, sim.ui, now]);

  // Effects the viewer replayed from the ticker, drawn on the virtual strip too.
  const [replays, setReplays] = useState<MirroredCommand[]>([]);

  // The strip: live and sim are pulled per frame, a preview is a steady state.
  const mirrorFrame = useCallback(
    (t: number, reduced: boolean) =>
      mirror
        ? frameFromMirror(
            { ...mirror, recent: [...mirror.recent, ...replays] },
            t,
            STRIP_POINTS,
            reduced,
          )
        : [],
    [mirror, replays],
  );
  const previewColors = useMemo(
    () =>
      kit && snapshot
        ? restingFor(
            share != null ? { kind: "split", homeShare: share } : null,
            STRIP_POINTS,
            kit,
          )
        : undefined,
    [kit, snapshot, share],
  );
  const stripProps =
    mode === "sim"
      ? { frame: sim.frame }
      : mode === "live" && mirror
        ? { frame: mirrorFrame }
        : { colors: previewColors };

  // Toast the big moments once.
  const lastToast = useRef<string | null>(null);
  const top = ticker[0];
  useEffect(() => {
    if (mode === "preview" || !top || top.pad) return;
    if (lastToast.current === null) {
      lastToast.current = top.id; // don't replay history on load
      return;
    }
    if (top.id === lastToast.current) return;
    lastToast.current = top.id;
    if (TOAST_EFFECTS.has(top.effect)) {
      toast(effectLabel(top.effect), {
        description: top.side && snapshot ? snapshot[top.side].name : undefined,
      });
    }
  }, [top, mode, snapshot]);

  // ---------- actions ----------
  const startSim = useCallback(() => {
    setSimOn(true);
    sim.controls.restart();
    toast("Running as a local simulation", {
      description:
        "No lights are connected. The strip above shows what they'd do.",
    });
  }, [sim.controls]);

  const start = async () => {
    setStarting(true);
    try {
      if (session && !isMine) await api.stopSession().catch(() => null);
      await api.startSession({ league, eventId: id, stat, delayMs });
      toast.success("Your lights are following this match");
      setTimeout(reload, 1200);
    } catch (e) {
      const err = e instanceof ApiRequestError ? e : null;
      if (scenario && (err?.unauthenticated || err?.unavailable || !err)) {
        startSim();
      } else if (err?.unauthenticated) {
        toast("Sign in to start", {
          description: "The lights need an account to follow a match.",
          action: {
            label: "Sign in",
            onClick: () =>
              router.push(
                `/login?next=${encodeURIComponent(`/match/${league}/${id}`)}`,
              ),
          },
        });
      } else if (err && /hue|link|light/i.test(err.code)) {
        toast("Link your Hue strip first", {
          action: {
            label: "Set up",
            onClick: () => router.push("/onboarding"),
          },
        });
      } else {
        toast.error(
          err?.message && err.message !== err.code
            ? err.message
            : "Couldn't start. Try again.",
        );
      }
    } finally {
      setStarting(false);
    }
  };

  const togglePause = async () => {
    if (mode === "sim") return sim.controls.toggle();
    if (!session) return;
    await steer({ status: session.status === "paused" ? "active" : "paused" });
  };

  const stop = async () => {
    if (mode === "sim") {
      setSimOn(false);
      sim.controls.restart();
      sim.controls.pause();
      return;
    }
    try {
      await api.stopSession();
    } catch {
      await steer({ status: "ended" });
    }
    clear();
    toast("Lights handed back");
  };

  const changeStat = (next: StatKey) => {
    if (mode === "live") void steer({ stat: next });
    else if (mode === "sim") sim.controls.setStat(next);
    else setLocalStat(next);
  };

  const replay = (item: TickerItem) => {
    if (mode === "sim") return sim.controls.fire(item.effect, item.side);
    if (mode !== "live" || !colors) return;
    const at = Date.now();
    setReplays((prev) => [
      ...prev.filter((c) => at - c.at < 10_000),
      { at, kind: "effect", effect: item.effect, side: item.side },
    ]);
    api
      .fireEffect({
        effect: item.effect,
        side: item.side,
        home: colors.home,
        away: colors.away,
      })
      .catch(() => toast.error("Your strip didn't answer."));
  };

  const commitDelay = (ms: number) => {
    update({ tv_delay_ms: ms });
    if (mode === "live") void steer({ delay_ms: ms });
    else setDelayOverride(ms);
  };

  // ---------- render ----------
  if (!snapshot || !kit || !colors) {
    return preview.loading || sessionLoading ? (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="aspect-[2/1] w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    ) : (
      <Empty className="kl-panel">
        <EmptyHeader>
          <EmptyTitle className="kl-display text-2xl">
            Can't load this match
          </EmptyTitle>
          <EmptyDescription>
            The match feed didn't answer. Check your connection and try again.
          </EmptyDescription>
        </EmptyHeader>
        <div className="flex gap-2">
          <Button onClick={preview.retry}>Try again</Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            All matches
          </Link>
        </div>
      </Empty>
    );
  }

  const homeHex = rgbToHex(colors.home);
  const awayHex = rgbToHex(colors.away);
  const bugHome = { ...snapshot.home, color: homeHex };
  const bugAway = { ...snapshot.away, color: awayHex };
  const live = isLivePhase(snapshot.phase);
  const paused =
    (mode === "live" && session?.status === "paused") ||
    (mode === "sim" && sim.ui && !sim.ui.playing);
  const running = mode !== "preview";
  const league_ =
    snapshot.league === REPLAY_LEAGUE
      ? "Sample match"
      : leagueName(snapshot.league);
  const otherLive = !!session && !isMine;
  const chosen =
    stat === "auto" ? `Auto · ${STAT_LABEL(activeStat)}` : STAT_LABEL(stat);

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="kl-display -ml-2 inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-base text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Matches
        </Link>
        <StatusChip
          mode={mode}
          paused={!!paused}
          starting={mode === "live" && !mirror}
          preview={preview.source === "sample"}
        />
      </div>

      {otherLive && session ? (
        <div className="kl-panel flex items-center justify-between gap-3 border-amber/50 p-3 text-sm">
          <span>Your lights are following another match.</span>
          <Link
            href={`/match/${encodeURIComponent(session.league)}/${encodeURIComponent(session.event_id)}`}
            className="kl-display shrink-0 text-base text-amber underline-offset-2 hover:underline"
          >
            Open it
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-6">
        {/* Bug + strip stay in view while you steer. */}
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 flex flex-col gap-3 bg-background px-4 pb-3 pt-1 lg:top-[calc(4rem+env(safe-area-inset-top))] lg:mx-0 lg:self-start lg:bg-transparent lg:px-0 ">
          <ScoreBug
            compact
            home={bugHome}
            away={bugAway}
            score={snapshot.phase === "scheduled" ? null : snapshot.score}
            clock={minuteLabel(snapshot.minute, snapshot.phase) || "KO"}
            live={live && running && !paused}
            sub={`${league_} · ${PHASE_LABEL[snapshot.phase]}`}
          />
          <VirtualStrip
            {...stripProps}
            label={`Virtual strip: ${snapshot.home.name} v ${snapshot.away.name}`}
            className="aspect-[5/2] lg:aspect-[16/10]"
          />
          <p
            className="flex items-center justify-between gap-2 px-0.5 text-xs text-muted-foreground"
            aria-live="polite"
          >
            {switching ? (
              <span className="inline-flex items-center gap-1.5">
                <Spinner className="size-3" aria-hidden />
                Switching lights to{" "}
                <span className="kl-display text-sm text-foreground">
                  {STAT_LABEL(stat)}
                </span>
              </span>
            ) : (
              <span>
                Lights follow{" "}
                <span className="kl-display text-sm text-foreground">
                  {chosen}
                </span>
              </span>
            )}
            {delayMs > 0 ? (
              <span className="font-mono tabular-nums">
                delay {Math.round(delayMs / 1000)}s
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <section aria-labelledby="r-channels" className="flex flex-col gap-2">
            <h2 id="r-channels" className="kl-eyebrow">
              Channels
            </h2>
            <StatChannels
              value={stat}
              pending={switching}
              onValueChange={changeStat}
            />
          </section>

          <LiveReadout
            stat={switching && mirror?.stat ? mirror.stat : stat}
            pending={switching}
            autoPick={activeStat}
            share={share}
            values={values}
            home={{ short: snapshot.home.short, color: homeHex }}
            away={{ short: snapshot.away.short, color: awayHex }}
          />

          <section aria-labelledby="r-feed" className="flex flex-col gap-2">
            <h2 id="r-feed" className="kl-eyebrow">
              Hit the lights
            </h2>
            <Ticker
              items={ticker}
              onReplay={mode === "preview" ? undefined : replay}
              teams={{
                home: { short: snapshot.home.short, color: homeHex },
                away: { short: snapshot.away.short, color: awayHex },
              }}
              emptyHint={
                running
                  ? "Goals, cards and big moments land here as they hit your lights."
                  : "Start the lights and events land here as they hit the strip."
              }
            />
          </section>

          <section className="kl-panel p-4" aria-label="TV delay">
            <DelaySlider valueMs={delayMs} onCommit={commitDelay} />
          </section>
        </div>
      </div>

      {/* Thumb-reach controls: Start, or Pause + Stop. */}
      <div className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+0.5rem)] z-30 -mx-4 mt-2 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-1 pt-4 sm:bottom-4 sm:mx-0 sm:px-0">
        {running ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              size="lg"
              variant="secondary"
              onClick={togglePause}
              className="kl-display h-14 rounded-xl text-xl"
            >
              {paused ? (
                <PlayIcon data-icon="inline-start" />
              ) : (
                <PauseIcon data-icon="inline-start" />
              )}
              {paused ? "Resume lights" : "Pause lights"}
            </Button>
            <Button
              size="lg"
              variant="destructive"
              onClick={stop}
              aria-label="Stop and hand the lights back"
              className="kl-display h-14 rounded-xl px-5 text-xl"
            >
              <SquareIcon data-icon="inline-start" />
              Stop
            </Button>
          </div>
        ) : (
          <Button
            size="lg"
            onClick={start}
            disabled={starting || snapshot.phase === "full_time"}
            className={cn(
              "kl-display h-14 w-full rounded-xl text-xl",
              starting && "opacity-80",
            )}
          >
            <PlayIcon data-icon="inline-start" />
            {snapshot.phase === "full_time"
              ? "Match finished"
              : starting
                ? "Starting…"
                : otherLive
                  ? "Switch lights to this match"
                  : "Start lights"}
          </Button>
        )}
      </div>
    </div>
  );
}

function StatusChip({
  mode,
  paused,
  starting,
  preview,
}: {
  mode: "live" | "sim" | "preview";
  paused: boolean;
  starting: boolean;
  preview: boolean;
}) {
  if (mode === "preview") {
    return (
      <span className="kl-display rounded-md bg-muted px-2.5 py-1.5 text-sm leading-none text-muted-foreground">
        {preview ? "Sample preview" : "Preview · lights off"}
      </span>
    );
  }
  if (starting) {
    return (
      <span className="kl-display rounded-md bg-muted px-2.5 py-1.5 text-sm leading-none text-muted-foreground">
        Starting…
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 rounded-md bg-muted px-2.5 py-1.5">
      {paused ? (
        <span className="kl-display text-sm leading-none text-amber">
          Paused
        </span>
      ) : (
        <LivePill label={mode === "sim" ? "Simulation" : "Lights live"} />
      )}
    </span>
  );
}
