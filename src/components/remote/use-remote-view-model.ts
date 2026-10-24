"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { pickStripColors } from "@/engine/colors";
import type { MatchSnapshot } from "@/engine/model";
import { STAT_MODES, type StatKey } from "@/engine/stats";
import { useDemoEngine } from "@/hooks/use-demo-engine";
import { useLiveSession } from "@/hooks/use-live-session";
import { useMatchPreview } from "@/hooks/use-match-preview";
import { useMomentToasts } from "@/hooks/use-moment-toasts";
import { useNow } from "@/hooks/use-now";
import { usePreferences } from "@/hooks/use-preferences";
import { ApiRequestError, api } from "@/lib/api";
import { HUE_SETUP_ERRORS, type MirroredCommand } from "@/lib/api-types";
import { scenarioById } from "@/lib/sample-data";
import type { TickerItem } from "@/lib/ticker";
import {
  frameFromMirror,
  resolveMirror,
  restingFor,
  STRIP_POINTS,
} from "@/lights/compose";

/** Where the remote's picture comes from. */
export type RemoteMode = "live" | "sim" | "preview";

/**
 * Everything the remote shows and does, from one of three sources: the user's live session
 * for this match (mirrored over Realtime), a local simulation of a scripted match when there's
 * no backend, or a preview of the match with the lights off.
 */
export function useRemoteViewModel(league: string, id: string) {
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
      // Newest by match minute: commentary events land late and in batches,
      // so the order the lights fired them isn't the order they happened.
      return mirror.recent
        .filter((c) => c.kind === "effect" && c.effect && c.at <= now)
        .sort((a, b) => (b.minute ?? -1) - (a.minute ?? -1) || b.at - a.at)
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

  useMomentToasts(
    ticker[0],
    (side) => snapshot?.[side].name,
    mode !== "preview",
  );

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
      } else if (err && HUE_SETUP_ERRORS.has(err.code)) {
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

  const running = mode !== "preview";
  const paused =
    (mode === "live" && session?.status === "paused") ||
    (mode === "sim" && !!sim.ui && !sim.ui.playing);
  /** The lights are following a different match than this one. */
  const otherLive = !!session && !isMine;

  return {
    mode,
    running,
    paused,
    otherLive,
    session,
    sessionLoading,
    preview,
    sim,
    mirror,
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
  };
}
