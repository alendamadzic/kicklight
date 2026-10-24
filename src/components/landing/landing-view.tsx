"use client";

import { PlayIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { LedBar } from "@/components/chrome/led-bar";
import { OnscreenBug } from "@/components/match/score-bug";
import { VirtualStrip } from "@/components/strip/virtual-strip";
import { buttonVariants } from "@/components/ui/button";
import { rgbToHex } from "@/engine/colors";
import { useDemoEngine } from "@/hooks/use-demo-engine";
import { minuteLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

const BEATS = [
  {
    title: "Link your Hue",
    body: "Sign in with Philips Hue and pick the gradient strip behind your TV.",
  },
  {
    title: "Pick a match",
    body: "Your teams first. The strip splits into both kits, sized by possession or the stat you choose.",
  },
  {
    title: "Watch",
    body: "Goals, cards and VAR flash on the strip, delayed to land when they land on your telly.",
  },
];

/**
 * Signed-out home: the strip doing its thing before anyone is asked for anything.
 * A scripted match plays fast on a loop behind the pitch.
 */
export function LandingView() {
  const { ui, frame, controls } = useDemoEngine({
    scenarioId: "late-winner",
    autoplay: true,
    speed: 180,
  });

  // Loop the match so the hero never goes still.
  const { restart, play } = controls;
  useEffect(() => {
    if (!ui?.ended) return;
    const t = setTimeout(() => {
      restart();
      play();
    }, 2500);
    return () => clearTimeout(t);
  }, [ui?.ended, restart, play]);

  const home = ui && {
    short: ui.script.home.short,
    color: rgbToHex(ui.colors.home),
  };
  const away = ui && {
    short: ui.script.away.short,
    color: rgbToHex(ui.colors.away),
  };

  return (
    <div className="flex flex-col gap-12 py-2 lg:gap-16 lg:py-8">
      <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
        <div className="order-2 flex flex-col gap-5 lg:order-1">
          <h1 className="kl-headline text-5xl sm:text-6xl">
            Your Hue strip,
            <br />
            lit by the <span className="text-amber">match</span>.
          </h1>
          <p className="max-w-[48ch] text-base text-muted-foreground">
            Kit colours split by possession. A flash for every goal. Delayed to
            match your telly.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/onboarding"
              className={buttonVariants({
                size: "lg",
                className: "h-12 rounded-xl px-6 text-base",
              })}
            >
              Get started
            </Link>
            <Link
              href="/demo"
              className={buttonVariants({
                size: "lg",
                variant: "secondary",
                className: "h-12 rounded-xl px-6 text-base",
              })}
            >
              <PlayIcon data-icon="inline-start" />
              Watch a demo match
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            Already set up?{" "}
            <Link
              href="/login"
              className="text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </p>
        </div>

        <div className="order-1 lg:order-2">
          <VirtualStrip
            frame={frame}
            label="A Kicklight strip following a scripted match"
            className="aspect-[16/10]"
            screen={
              ui && home && away ? (
                <OnscreenBug
                  home={home}
                  away={away}
                  score={ui.snapshot.score}
                  clock={minuteLabel(ui.snapshot.minute, ui.snapshot.phase)}
                />
              ) : null
            }
          />
        </div>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <LedBar colors={["#6cabdd", "#ffb547", "#c8102e"]} count={3} />
          <h2 id="how" className="kl-headline text-3xl">
            How it works
          </h2>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {BEATS.map((b, i) => (
            <li key={b.title} className="kl-panel flex flex-col gap-2 p-5">
              <span className="kl-display text-2xl leading-none text-amber">
                {i + 1}
              </span>
              <h3 className="text-base font-semibold">{b.title}</h3>
              <p className="text-sm text-muted-foreground">{b.body}</p>
            </li>
          ))}
        </ol>
        <p className={cn("text-sm text-muted-foreground")}>
          Works with Hue Gradient lightstrips, Play gradient bars and Flux.
          Single-colour lights aren't supported.
        </p>
      </section>
    </div>
  );
}
