"use client";

import { PauseIcon, PlayIcon, RotateCcwIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EventPad } from "@/components/demo/EventPad";
import { LiveReadout } from "@/components/match/LiveReadout";
import { ScoreBug } from "@/components/match/ScoreBug";
import { StatChannels } from "@/components/match/StatChannels";
import { Ticker } from "@/components/match/Ticker";
import { VirtualStrip } from "@/components/strip/VirtualStrip";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { rgbToHex } from "@/engine/colors";
import { SCENARIOS } from "@/engine/feed/scenarios";
import type { Side } from "@/engine/model";
import { type DemoSpeed, useDemoEngine } from "@/hooks/use-demo-engine";
import { useLightSender } from "@/hooks/use-light-sender";
import { isLivePhase, minuteLabel, PHASE_LABEL } from "@/lib/format";
import { effectLabel, TOAST_EFFECTS } from "@/lib/ticker";
import { cn } from "@/lib/utils";

const SPEEDS: DemoSpeed[] = [30, 60, 180];

const MARK_TYPES = new Set([
  "goal",
  "red_card",
  "yellow_card",
  "penalty_missed",
]);

/** The showpiece: the whole engine runs here in the browser, no bridge or network needed. */
export function DemoView() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [side, setSide] = useState<Side>("home");
  const sender = useLightSender();

  const { ui, frame, controls, current } = useDemoEngine({
    scenarioId,
    autoplay: true,
    speed: 60,
    onCommand: sender.send,
  });

  // Toast the big moments (match-sourced only; the pad is its own feedback).
  const lastToast = useRef<string | null>(null);
  const top = ui?.ticker[0];
  useEffect(() => {
    if (!ui || !top || top.pad || top.id === lastToast.current) return;
    lastToast.current = top.id;
    if (TOAST_EFFECTS.has(top.effect)) {
      const team = top.side ? ui.script[top.side].name : null;
      toast(effectLabel(top.effect), {
        description: team
          ? `${team} · ${Math.floor(top.minute ?? 0)}'`
          : undefined,
      });
    }
  }, [top, ui]);

  if (!ui) return <DemoSkeleton />;

  const homeHex = rgbToHex(ui.colors.home);
  const awayHex = rgbToHex(ui.colors.away);
  const home = { ...ui.script.home, color: homeHex };
  const away = { ...ui.script.away, color: awayHex };
  const live = isLivePhase(ui.snapshot.phase);
  const marks = ui.script.events.filter((e) => MARK_TYPES.has(e.type));

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

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="kl-eyebrow">Demo · runs in your browser</p>
        <h1 className="kl-display text-4xl leading-none sm:text-5xl">
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
              className="kl-display kl-press h-11 rounded-md bg-secondary px-4 text-base leading-none text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-foreground aria-pressed:text-background"
            >
              {s.title}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-col gap-4 max-lg:contents lg:sticky lg:top-[calc(4rem+env(safe-area-inset-top)+0.5rem)] lg:self-start">
          <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 flex flex-col gap-3 bg-background px-4 pb-3 pt-1 lg:static lg:mx-0 lg:bg-transparent lg:px-0 ">
            <ScoreBug
              compact
              home={home}
              away={away}
              score={ui.snapshot.score}
              clock={minuteLabel(ui.snapshot.minute, ui.snapshot.phase) || "KO"}
              live={live && ui.playing}
              sub={PHASE_LABEL[ui.snapshot.phase]}
            />

            <VirtualStrip
              frame={frame}
              label={`Virtual strip, ${ui.script.title}`}
              className="aspect-[5/2] lg:aspect-[16/10]"
            />
          </div>

          {/* Transport */}
          <div className="kl-panel flex flex-col gap-4 p-3">
            <div className="flex items-center gap-2">
              <Button
                size="lg"
                onClick={controls.toggle}
                aria-label={ui.playing ? "Pause" : ui.ended ? "Replay" : "Play"}
                className="kl-display h-12 flex-1 rounded-lg text-lg"
              >
                {ui.playing ? (
                  <PauseIcon data-icon="inline-start" />
                ) : (
                  <PlayIcon data-icon="inline-start" />
                )}
                {ui.playing ? "Pause" : ui.ended ? "Replay" : "Play"}
              </Button>
              <Button
                variant="secondary"
                size="icon-lg"
                aria-label="Restart"
                onClick={controls.restart}
                className="size-12 rounded-lg"
              >
                <RotateCcwIcon />
              </Button>
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
                  className="kl-display h-11 flex-1 rounded-md bg-secondary px-2.5 text-base leading-none text-muted-foreground aria-pressed:bg-foreground aria-pressed:text-background"
                >
                  {s}×
                </ToggleGroupItem>
              ))}
            </ToggleGroup>

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
              <div className="relative h-3" aria-hidden>
                {marks.map((m) => (
                  <span
                    key={`${m.minute}-${m.type}-${m.side}`}
                    className="absolute top-0 size-2 -translate-x-1/2 rounded-full"
                    style={{
                      left: `${(m.minute / ui.script.endMinute) * 100}%`,
                      background:
                        m.type === "goal"
                          ? "#fff"
                          : m.type === "red_card"
                            ? "#eb1414"
                            : m.type === "yellow_card"
                              ? "#ffce00"
                              : "#8f9bb2",
                    }}
                  />
                ))}
              </div>
              <div className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
                <span>0'</span>
                <span className="text-foreground">
                  {Math.floor(ui.minute)}'
                </span>
                <span>{ui.script.endMinute}'</span>
              </div>
            </div>
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
                className="kl-display block text-lg leading-none"
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

        <div className="flex flex-col gap-4 max-lg:contents">
          <section
            aria-labelledby="demo-channels"
            className="flex flex-col gap-2"
          >
            <h2 id="demo-channels" className="kl-eyebrow">
              Lights follow
            </h2>
            <StatChannels value={ui.stat} onValueChange={controls.setStat} />
          </section>
          <LiveReadout
            stat={ui.stat}
            autoPick={ui.activeStat}
            share={ui.share}
            values={ui.values}
            home={{ short: ui.script.home.short, color: homeHex }}
            away={{ short: ui.script.away.short, color: awayHex }}
          />
          <section aria-labelledby="demo-pad" className="flex flex-col gap-2">
            <h2 id="demo-pad" className="kl-eyebrow">
              Event pad
            </h2>
            <EventPad
              side={side}
              onSideChange={setSide}
              onFire={controls.fire}
              home={{ short: ui.script.home.short, color: homeHex }}
              away={{ short: ui.script.away.short, color: awayHex }}
            />
          </section>
          <section aria-labelledby="demo-feed" className="flex flex-col gap-2">
            <h2 id="demo-feed" className="kl-eyebrow">
              Hit the lights
            </h2>
            <Ticker
              items={ui.ticker}
              teams={{
                home: { short: ui.script.home.short, color: homeHex },
                away: { short: ui.script.away.short, color: awayHex },
              }}
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
      <div className="h-24 animate-pulse rounded-xl bg-muted" />
      <div className="aspect-[16/10] animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
