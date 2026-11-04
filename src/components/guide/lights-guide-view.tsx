"use client";

import { PlayIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { EffectCard } from "@/components/guide/effect-card";
import { SideToggle } from "@/components/match/side-toggle";
import { VirtualStrip } from "@/components/strip/virtual-strip";
import { buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { rgbToHex } from "@/engine/colors";
import type { Side } from "@/engine/model";
import { PREVIEW_SHARE, useEffectPreview } from "@/hooks/use-effect-preview";
import { useLightSender } from "@/hooks/use-light-sender";
import { useMediaQuery } from "@/hooks/use-media-query";
import { usePreferences } from "@/hooks/use-preferences";
import {
  EFFECT_GUIDE,
  type GuideEntry,
  SPLIT_CAPTION,
} from "@/lib/effect-copy";
import { EFFECT_TINT } from "@/lib/ticker";
import { cn } from "@/lib/utils";

const other = (s: Side): Side => (s === "home" ? "away" : "home");

/**
 * "What the lights do": every match event, what sets it off and what the strip does,
 * each one playable on a preview strip (and, if you like, on your own lights).
 */
export function LightsGuideView() {
  const { prefs } = usePreferences();
  const { script, colors, frame, playing, play, stop } = useEffectPreview(
    prefs.kit_overrides,
  );
  const [side, setSide] = useState<Side>("home");
  const sender = useLightSender();
  const wide = useMediaQuery("(min-width: 1024px)");

  const teams = {
    home: { short: script.home.short, color: rgbToHex(colors.home) },
    away: { short: script.away.short, color: rgbToHex(colors.away) },
  };

  const sideFor = (entry: GuideEntry, variant: "main" | "draw") => {
    if (entry.colour === "winner") return variant === "draw" ? null : side;
    if (entry.colour === "match") return null;
    return entry.plays?.otherSide ? other(side) : side;
  };

  const fire = (entry: GuideEntry, variant: "main" | "draw") => {
    if (!entry.plays) return;
    const fxSide = sideFor(entry, variant);
    play(`${entry.event}:${variant}`, entry.plays.effect, fxSide);
    sender.send({
      kind: "effect",
      effect: entry.plays.effect,
      side: fxSide,
      colors,
    });
  };

  const toggleSend = (on: boolean) => {
    sender.setEnabled(on);
    if (on) {
      sender.send({
        kind: "resting",
        cmd: { kind: "split", homeShare: PREVIEW_SHARE },
        colors,
      });
      toast("Playing on your lights too", {
        description: "Every example you play from here hits your real strip.",
      });
    }
  };

  const [playingEvent, playingVariant] = playing?.id.split(":") ?? [];
  const playingEntry = EFFECT_GUIDE.flatMap((s) => s.entries).find(
    (e) => e.event === playingEvent,
  );
  // Whose colour the row swatches show: the side each entry would play for.
  const swatchFor = (entry: GuideEntry) => {
    const s = entry.plays?.otherSide ? other(side) : side;
    return teams[s].color;
  };

  const sendPanel = (
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
        <label htmlFor="guide-send" className="block text-sm font-semibold">
          Play on my lights too
        </label>
        <p className="mt-1 text-xs text-muted-foreground">
          {sender.enabled
            ? sender.busy
              ? "Sending to your strip…"
              : "Live on your strip. Each example you play is sent to it."
            : "Try each one on your real Hue strip. Needs sign-in and a linked light."}{" "}
          {!sender.enabled ? (
            <Link href="/onboarding" className="underline underline-offset-2">
              Set up
            </Link>
          ) : null}
        </p>
      </div>
      <Switch
        id="guide-send"
        checked={sender.enabled}
        onCheckedChange={toggleSend}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Lights guide
        </p>
        <h1 className="kl-headline text-4xl sm:text-5xl">
          What the <span className="text-amber">lights</span> do
        </h1>
        <p className="max-w-[60ch] text-sm text-muted-foreground">
          Between moments your strip shows both kits, split by the stat you
          follow. When something happens, it plays one of these. Tap play to see
          any of them.
        </p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 flex flex-col gap-3 border-b border-border bg-background/90 px-4 pb-3 pt-2 backdrop-blur-md lg:top-[calc(4.5rem+env(safe-area-inset-top))] lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <VirtualStrip
            frame={frame}
            label={
              playingEntry
                ? `Preview strip playing ${playingEntry.label}`
                : "Preview strip resting on the split"
            }
            className="aspect-[16/10]"
            screen={
              <div className="grid size-full place-items-center p-2">
                {playingEntry ? (
                  <span
                    key={playing?.id + String(playing?.startedAt)}
                    className="kl-display kl-fx-flash text-center text-[clamp(1rem,4.5vw,2rem)] leading-none"
                    style={{
                      color: "#fff",
                      textShadow: `0 0 18px ${EFFECT_TINT[playingEntry.plays?.effect ?? ""] ?? "#fff"}`,
                    }}
                  >
                    {playingEntry.label}
                  </span>
                ) : null}
              </div>
            }
          />
          <SideToggle
            side={side}
            onSideChange={setSide}
            home={teams.home}
            away={teams.away}
            label="Play for which team"
          />
          {wide ? (
            <>
              <p className="flex gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-sm">
                <span
                  aria-hidden
                  className="w-1.5 shrink-0 rounded-full bg-amber"
                />
                <span>{SPLIT_CAPTION}</span>
              </p>
              {sendPanel}
            </>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-7 [&_button]:scroll-mt-[calc(62.5vw+9rem)] lg:[&_button]:scroll-mt-24">
          {EFFECT_GUIDE.map((section) => (
            <section
              key={section.id}
              aria-labelledby={`guide-${section.id}`}
              className="flex flex-col gap-2.5"
            >
              <h2 id={`guide-${section.id}`} className="kl-headline text-2xl">
                {section.title}
              </h2>
              <ul className="flex flex-col gap-2">
                {section.entries.map((entry) => (
                  <EffectCard
                    key={entry.event}
                    entry={entry}
                    playing={playingEvent === entry.event}
                    playingVariant={
                      playingEvent === entry.event
                        ? (playingVariant ?? null)
                        : null
                    }
                    onPlay={(v) => fire(entry, v)}
                    onStop={stop}
                    teamColor={swatchFor(entry)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {wide ? null : sendPanel}

          <Link
            href="/demo"
            className={buttonVariants({
              variant: "secondary",
              size: "lg",
              className: "h-12 self-start rounded-xl px-5",
            })}
          >
            <PlayIcon data-icon="inline-start" />
            See them in a demo match
          </Link>
        </div>
      </div>
    </div>
  );
}
