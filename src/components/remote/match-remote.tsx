"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { type LightsState, StatusPill } from "@/components/chrome/status-pill";
import { MomentOverlay } from "@/components/match/moment-overlay";
import { MomentsTimeline } from "@/components/match/moments-timeline";
import { OnscreenBug } from "@/components/match/score-bug";
import { SplitReadout } from "@/components/match/split-readout";
import { StatPicker } from "@/components/match/stat-picker";
import { Ticker } from "@/components/match/ticker";
import { TvSync } from "@/components/match/tv-sync";
import { VirtualStrip } from "@/components/strip/virtual-strip";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { rgbToHex } from "@/engine/colors";
import { leagueName } from "@/engine/feed/leagues";
import { statLabel } from "@/engine/stats";
import { useHueStatus } from "@/hooks/use-hue-status";
import { isLivePhase, minuteLabel, PHASE_LABEL } from "@/lib/format";
import { healthProblem } from "@/lib/health";
import { timelineEnd, timelineMarkers } from "@/lib/moments";
import { REPLAY_LEAGUE } from "@/lib/sample-data";
import { RemoteControls } from "./remote-controls";
import { RemoteHealthBanner } from "./remote-health-banner";
import { useRemoteViewModel } from "./use-remote-view-model";

/**
 * THE REMOTE. The TV with its strip is the hero, the score on its screen as on a
 * broadcast; below it what the lights follow and the match's moments; the controls
 * sit in a dock in thumb reach. With no session it previews the match, lights off.
 */
export function MatchRemote({ league, id }: { league: string; id: string }) {
  const vm = useRemoteViewModel(league, id);
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
  } = vm;
  const { result: hue } = useHueStatus();

  const markers = useMemo(
    () => timelineMarkers(ticker, timelineEnd(snapshot?.minute)),
    [ticker, snapshot?.minute],
  );

  if (!snapshot || !kit || !colors) {
    return preview.loading || sessionLoading ? (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="aspect-[16/10] w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    ) : (
      <Empty className="kl-panel">
        <EmptyHeader>
          <EmptyTitle className="kl-headline text-2xl">
            Can't load this match
          </EmptyTitle>
          <EmptyDescription>
            The match feed didn't answer. Check your connection and try again.
          </EmptyDescription>
        </EmptyHeader>
        <div className="flex gap-2">
          <Button onClick={preview.retry}>Try again</Button>
          <Link
            href="/matches"
            className={buttonVariants({ variant: "outline" })}
          >
            All matches
          </Link>
        </div>
      </Empty>
    );
  }

  const homeHex = rgbToHex(colors.home);
  const awayHex = rgbToHex(colors.away);
  const teams = {
    home: {
      name: snapshot.home.name,
      short: snapshot.home.short,
      color: homeHex,
    },
    away: {
      name: snapshot.away.name,
      short: snapshot.away.short,
      color: awayHex,
    },
  };
  const scripted =
    mode === "sim" || league === REPLAY_LEAGUE || preview.source === "sample";
  const leagueLabel =
    snapshot.league === REPLAY_LEAGUE
      ? "Sample match"
      : leagueName(snapshot.league);
  const label =
    stat === "auto" ? `Auto · ${statLabel(activeStat)}` : statLabel(stat);
  const score = snapshot.phase === "scheduled" ? null : snapshot.score;

  const lights: LightsState =
    mode === "preview"
      ? "off"
      : mode === "live" && !mirror
        ? "starting"
        : paused
          ? "paused"
          : mode === "sim"
            ? "sim"
            : "live";
  const problem =
    mode === "live"
      ? healthProblem(
          hue.phase === "ok" ? hue.status : null,
          session?.pause_reason ?? null,
        )
      : null;
  const otherMatch = session?.snapshot?.match;

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/matches"
          className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Matches
        </Link>
        <div className="flex items-center gap-2">
          <TvSync
            delayMs={delayMs}
            clock={snapshot.clock}
            phase={snapshot.phase}
            scripted={scripted}
            onCommit={vm.commitDelay}
          />
          <StatusPill
            state={lights}
            label={
              mode === "preview" && preview.source === "sample"
                ? "Sample preview"
                : undefined
            }
          />
        </div>
      </div>

      <RemoteHealthBanner problem={problem} />

      {otherLive && session ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber/50 bg-amber/10 px-3 py-2.5 text-sm">
          <span>
            Your lights are on{" "}
            {otherMatch
              ? `${otherMatch.home.name} v ${otherMatch.away.name}`
              : "another match"}
            .
          </span>
          <Link
            href={`/match/${encodeURIComponent(session.league)}/${encodeURIComponent(session.event_id)}`}
            className="shrink-0 font-semibold text-amber underline-offset-2 hover:underline"
          >
            Open it
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8">
        {/* On desktop the TV stays pinned while the controls scroll. */}
        <div className="flex flex-col gap-3 lg:sticky lg:top-[calc(4.5rem+env(safe-area-inset-top))] lg:self-start">
          <VirtualStrip
            {...stripProps}
            label={`Virtual strip: ${snapshot.home.name} v ${snapshot.away.name}`}
            className="aspect-[16/10]"
            screen={
              <>
                <OnscreenBug
                  home={teams.home}
                  away={teams.away}
                  score={score}
                  clock={minuteLabel(snapshot.minute, snapshot.phase) || "KO"}
                />
                <MomentOverlay fx={vm.fx} teams={teams} score={score} />
              </>
            }
          />
          <SplitReadout
            label={label}
            share={share}
            values={values}
            pending={switching}
            home={teams.home}
            away={teams.away}
          />
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            {isLivePhase(snapshot.phase) ? (
              <span className="kl-live-dot size-1.5 rounded-full bg-live" />
            ) : null}
            {leagueLabel} · {PHASE_LABEL[snapshot.phase]}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section aria-labelledby="r-follow" className="flex flex-col gap-2">
            <h2 id="r-follow" className="text-sm font-semibold">
              Lights follow
            </h2>
            <StatPicker
              value={stat}
              activeStat={activeStat}
              autoReason={vm.autoReason}
              autoSide={vm.autoSide}
              teams={teams}
              pending={switching}
              preview={vm.previewFor}
              onChange={vm.changeStat}
            />
          </section>

          <section aria-labelledby="r-moments" className="flex flex-col gap-3">
            <h2 id="r-moments" className="text-sm font-semibold">
              Moments
            </h2>
            <MomentsTimeline
              markers={markers}
              minute={snapshot.minute}
              teams={teams}
              onReplay={
                mode === "preview"
                  ? undefined
                  : (m) =>
                      vm.replay({
                        id: m.id,
                        effect: m.effect,
                        side: m.side,
                        at: Date.now(),
                        minute: m.minute,
                      })
              }
            />
            {/* The timeline already says when it's quiet; the list is the detail. */}
            {ticker.length ? (
              <Ticker
                items={ticker}
                onReplay={mode === "preview" ? undefined : vm.replay}
                teams={teams}
              />
            ) : null}
          </section>
        </div>
      </div>

      <RemoteControls
        running={running}
        paused={paused}
        starting={starting}
        finished={snapshot.phase === "full_time"}
        otherLive={
          otherLive
            ? {
                from: otherMatch
                  ? `${otherMatch.home.short} v ${otherMatch.away.short}`
                  : "another match",
                to: `${snapshot.home.short} v ${snapshot.away.short}`,
                delaySec: Math.round(delayMs / 1000),
              }
            : null
        }
        brightness={vm.brightness}
        onBrightness={vm.setBrightness}
        onStart={vm.start}
        onTogglePause={vm.togglePause}
        onStop={vm.stop}
      />
    </div>
  );
}
