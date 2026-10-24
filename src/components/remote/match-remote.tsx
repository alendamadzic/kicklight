"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { DelaySlider } from "@/components/match/delay-slider";
import { LiveReadout } from "@/components/match/live-readout";
import { ScoreBug } from "@/components/match/score-bug";
import { StatChannels } from "@/components/match/stat-channels";
import { Ticker } from "@/components/match/ticker";
import { TvClock } from "@/components/match/tv-clock";
import { VirtualStrip } from "@/components/strip/virtual-strip";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { rgbToHex } from "@/engine/colors";
import { leagueName } from "@/engine/feed/leagues";
import { statLabel } from "@/engine/stats";
import { isLivePhase, minuteLabel, PHASE_LABEL } from "@/lib/format";
import { REPLAY_LEAGUE } from "@/lib/sample-data";
import { RemoteControls } from "./remote-controls";
import { StatusChip } from "./status-chip";
import { useRemoteViewModel } from "./use-remote-view-model";

/**
 * THE REMOTE. Subscribes to the user's live session and mirrors the strip locally;
 * with no session it shows the match preview and a big Start button. Scripted
 * matches can also run as a local simulation when there's no backend.
 */
export function MatchRemote({ league, id }: { league: string; id: string }) {
  const {
    mode,
    session,
    sessionLoading,
    preview,
    mirror,
    running,
    paused,
    otherLive,
    switching,
    stat,
    activeStat,
    delayMs,
    snapshot,
    kit,
    colors,
    share,
    values,
    ticker,
    stripProps,
    starting,
    start,
    togglePause,
    stop,
    changeStat,
    replay,
    commitDelay,
  } = useRemoteViewModel(league, id);

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
  const league_ =
    snapshot.league === REPLAY_LEAGUE
      ? "Sample match"
      : leagueName(snapshot.league);
  const chosen =
    stat === "auto" ? `Auto · ${statLabel(activeStat)}` : statLabel(stat);

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
          paused={paused}
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
                  {statLabel(stat)}
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
            {/* Scripted matches run minutes as seconds, so there's no clock to match. */}
            {mode === "sim" ||
            league === REPLAY_LEAGUE ||
            preview.source === "sample" ? (
              <DelaySlider valueMs={delayMs} onCommit={commitDelay} />
            ) : (
              <TvClock
                clock={snapshot.clock}
                phase={snapshot.phase}
                delayMs={delayMs}
                onCommit={commitDelay}
              />
            )}
          </section>
        </div>
      </div>

      <RemoteControls
        running={running}
        paused={paused}
        starting={starting}
        finished={snapshot.phase === "full_time"}
        otherLive={otherLive}
        onStart={start}
        onTogglePause={togglePause}
        onStop={stop}
      />
    </div>
  );
}
