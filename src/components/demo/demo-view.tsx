"use client";

import {
  CaptionsIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SendIcon,
  SkipForwardIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EventPad } from "@/components/demo/event-pad";
import { MomentOverlay } from "@/components/match/moment-overlay";
import { OnscreenBug } from "@/components/match/score-bug";
import { SplitReadout } from "@/components/match/split-readout";
import { StatPicker, type StatPreview } from "@/components/match/stat-picker";
import { Ticker } from "@/components/match/ticker";
import { VirtualStrip } from "@/components/strip/virtual-strip";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { rgbToHex } from "@/engine/colors";
import { SCENARIOS } from "@/engine/feed/scenarios";
import type { Side } from "@/engine/model";
import { STAT_MODES, type StatKey, statLabel } from "@/engine/stats";
import { type DemoSpeed, useDemoEngine } from "@/hooks/use-demo-engine";
import { useDevicePrefs } from "@/hooks/use-device-prefs";
import { useLightSender } from "@/hooks/use-light-sender";
import { useMomentFx } from "@/hooks/use-moment-fx";
import { useMomentToasts } from "@/hooks/use-moment-toasts";
import { usePreferences } from "@/hooks/use-preferences";
import { EFFECT_CAPTION, SPLIT_CAPTION } from "@/lib/effect-copy";
import { minuteLabel } from "@/lib/format";
import { MARKED, nextMoment, nextMomentMinute } from "@/lib/moments";
import { EFFECT_TINT, effectLabel } from "@/lib/ticker";
import { cn } from "@/lib/utils";

const SPEEDS: DemoSpeed[] = [30, 60, 180];

/** The showpiece: the whole engine runs here in the browser, no bridge or network needed. */
export function DemoView() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [side, setSide] = useState<Side>("home");
  const sender = useLightSender();
  const { prefs } = usePreferences();
  const { prefs: device, update: updateDevice } = useDevicePrefs();

  const { ui, frame, controls, current } = useDemoEngine({
    scenarioId,
    autoplay: true,
    speed: 60,
    kitOverrides: prefs.kit_overrides,
    onCommand: sender.send,
  });

  const top = ui?.ticker[0];
  const fx = useMomentFx(top, device.celebrations);
  useMomentToasts(
    top,
    (s) => ui?.script[s].name,
    !device.celebrations && !device.captions,
  );

  // The caption sticks with the last moment until the next one, so it can be read.
  const [caption, setCaption] = useState(SPLIT_CAPTION);
  useEffect(() => {
    if (top) setCaption(EFFECT_CAPTION[top.effect] ?? SPLIT_CAPTION);
    else setCaption(SPLIT_CAPTION);
  }, [top]);

  if (!ui) return <DemoSkeleton />;

  const homeHex = rgbToHex(ui.colors.home);
  const awayHex = rgbToHex(ui.colors.away);
  const teams = {
    home: {
      name: ui.script.home.name,
      short: ui.script.home.short,
      color: homeHex,
    },
    away: {
      name: ui.script.away.name,
      short: ui.script.away.short,
      color: awayHex,
    },
  };
  const marks = ui.script.events.filter((e) => MARKED.has(e.type));
  const next = nextMoment(ui.script.events, ui.minute);
  const nextAt = nextMomentMinute(ui.script.events, ui.minute);

  const preview = (key: StatKey): StatPreview | null => {
    if (key === "auto" || key === "clock") return null;
    const ctx = { snapshot: ui.snapshot, events: ui.events };
    const m = STAT_MODES[key];
    return { share: m.homeShare(ctx), values: m.values?.(ctx) ?? null };
  };

  const toggleSend = (on: boolean) => {
    sender.setEnabled(on);
    if (on) {
      const cur = current();
      if (cur?.cmd)
        sender.send({ kind: "resting", cmd: cur.cmd, colors: cur.colors });
      toast("Mirroring to your lights", {
        description: "Every effect from here on hits your real strip.",
      });
    }
  };

  const label =
    ui.stat === "auto"
      ? `Auto · ${statLabel(ui.activeStat)}`
      : statLabel(ui.stat);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">
          Demo · runs in your browser, no lights needed
        </p>
        <h1 className="kl-headline text-4xl sm:text-5xl">
          Watch the <span className="text-amber">lights</span> play a match
        </h1>
      </header>

      <div className="kl-scroll-x -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ToggleGroup
          value={[scenarioId]}
          onValueChange={(v) => v[0] && setScenarioId(v[0])}
          spacing={1}
          aria-label="Scenario"
          className="w-max"
        >
          {SCENARIOS.map((s) => (
            <ToggleGroupItem
              key={s.id}
              value={s.id}
              className="kl-press h-10 rounded-full bg-secondary px-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {s.title}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-4 lg:sticky lg:top-[calc(4.5rem+env(safe-area-inset-top))]">
          <VirtualStrip
            frame={frame}
            label={`Virtual strip, ${ui.script.title}`}
            className="aspect-[16/10]"
            screen={
              <>
                <OnscreenBug
                  home={teams.home}
                  away={teams.away}
                  score={ui.snapshot.score}
                  clock={
                    minuteLabel(ui.snapshot.minute, ui.snapshot.phase) || "KO"
                  }
                />
                <MomentOverlay
                  fx={fx}
                  teams={teams}
                  score={ui.snapshot.score}
                />
              </>
            }
          />

          {device.captions ? (
            <p
              aria-live="polite"
              className="flex min-h-14 gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm"
            >
              <span
                aria-hidden
                className="w-1.5 shrink-0 rounded-full"
                style={{
                  background: top
                    ? (EFFECT_TINT[top.effect] ?? "#8f9bb2")
                    : "var(--amber)",
                }}
              />
              <span>{caption}</span>
            </p>
          ) : null}

          <SplitReadout
            label={label}
            share={ui.share}
            values={ui.values}
            home={teams.home}
            away={teams.away}
          />

          {/* Transport */}
          <div className="kl-panel flex flex-col gap-4 p-3">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-2">
              <Button
                size="icon-lg"
                onClick={controls.toggle}
                aria-label={ui.playing ? "Pause" : ui.ended ? "Replay" : "Play"}
                className="size-12 rounded-xl"
              >
                {ui.playing ? <PauseIcon /> : <PlayIcon />}
              </Button>
              <Button
                variant="secondary"
                onClick={() => nextAt != null && controls.seek(nextAt)}
                disabled={nextAt == null}
                className="h-12 min-w-0 rounded-xl text-sm font-semibold"
              >
                <span className="truncate">
                  {next ? (
                    <>
                      <span className="sm:hidden">Next · </span>
                      <span className="hidden sm:inline">Next moment · </span>
                      {Math.floor(next.minute)}'{" "}
                      {effectLabel(next.type).toLowerCase()}
                    </>
                  ) : (
                    "No more moments"
                  )}
                </span>
                <SkipForwardIcon data-icon="inline-end" />
              </Button>
              <Button
                variant="secondary"
                size="icon-lg"
                aria-label="Restart"
                onClick={controls.restart}
                className="size-12 rounded-xl"
              >
                <RotateCcwIcon />
              </Button>
              <Button
                variant={device.captions ? "default" : "secondary"}
                size="icon-lg"
                aria-label="Captions"
                aria-pressed={device.captions}
                onClick={() => updateDevice({ captions: !device.captions })}
                className="size-12 rounded-xl"
              >
                <CaptionsIcon />
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 px-1">
              <Slider
                aria-label="Match minute"
                min={0}
                max={ui.script.endMinute}
                step={0.5}
                value={[ui.minute]}
                onValueChange={(v) =>
                  controls.seek(Array.isArray(v) ? v[0] : v)
                }
              />
              <div className="relative h-8">
                {marks.map((m) => {
                  const ring = m.side ? teams[m.side].color : "transparent";
                  return (
                    <button
                      key={`${m.minute}-${m.type}-${m.side}`}
                      type="button"
                      onClick={() =>
                        controls.seek(Math.max(0, m.minute - 0.75))
                      }
                      aria-label={`Jump to ${Math.floor(m.minute)}' ${effectLabel(m.type)}`}
                      className="absolute top-0 grid size-8 -translate-x-1/2 place-items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{
                        left: `${(m.minute / ui.script.endMinute) * 100}%`,
                      }}
                    >
                      <span
                        className="block size-3 rounded-[3px]"
                        style={{
                          background: EFFECT_TINT[m.type] ?? "#8f9bb2",
                          boxShadow: `0 0 0 2px ${ring}`,
                        }}
                      />
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
                <span>0'</span>
                <span className="text-foreground">
                  {Math.floor(ui.minute)}'
                </span>
                <span>{ui.script.endMinute}'</span>
              </div>
            </div>

            <ToggleGroup
              value={[String(ui.speed)]}
              onValueChange={(v) =>
                v[0] && controls.setSpeed(Number(v[0]) as DemoSpeed)
              }
              spacing={1}
              aria-label="Playback speed"
              className="w-full"
            >
              {SPEEDS.map((s) => (
                <ToggleGroupItem
                  key={s}
                  value={String(s)}
                  className="h-10 flex-1 rounded-lg bg-secondary px-2.5 text-sm font-medium tabular-nums text-muted-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {s}× speed
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* Send to my lights */}
          <div
            className={cn(
              "kl-panel flex items-center gap-3 p-4 transition-colors",
              sender.enabled && "border-amber/60",
            )}
          >
            <SendIcon
              className={cn(
                "size-5 shrink-0",
                sender.enabled ? "text-amber" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0 flex-1">
              <label
                htmlFor="send-lights"
                className="block text-sm font-semibold"
              >
                Send to my lights
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                {sender.enabled
                  ? sender.busy
                    ? "Sending to your strip…"
                    : "Live on your strip. Pad hits and match events are mirrored."
                  : "Mirror this demo onto your real Hue strip. Needs sign-in and a linked light."}{" "}
                {!sender.enabled ? (
                  <Link
                    href="/onboarding"
                    className="underline underline-offset-2"
                  >
                    Set up
                  </Link>
                ) : null}
              </p>
            </div>
            <Switch
              id="send-lights"
              checked={sender.enabled}
              onCheckedChange={toggleSend}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="demo-follow"
            className="flex flex-col gap-2"
          >
            <h2 id="demo-follow" className="text-sm font-semibold">
              Lights follow
            </h2>
            <StatPicker
              value={ui.stat}
              activeStat={ui.activeStat}
              autoReason={ui.autoReason}
              autoSide={ui.autoSide}
              teams={teams}
              preview={preview}
              onChange={controls.setStat}
            />
          </section>
          <section aria-labelledby="demo-pad" className="flex flex-col gap-2">
            <h2 id="demo-pad" className="text-sm font-semibold">
              Event pad
              <span className="ml-2 font-normal text-muted-foreground">
                fire any moment on the strip
              </span>
            </h2>
            <EventPad
              side={side}
              onSideChange={setSide}
              onFire={controls.fire}
              home={teams.home}
              away={teams.away}
            />
          </section>
          <section aria-labelledby="demo-feed" className="flex flex-col gap-2">
            <h2 id="demo-feed" className="text-sm font-semibold">
              Moments
            </h2>
            <Ticker
              items={ui.ticker}
              teams={teams}
              emptyHint="Press play or tap the pad."
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function DemoSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      <div className="h-10 animate-pulse rounded-xl bg-muted" />
      <div className="aspect-[16/10] animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
