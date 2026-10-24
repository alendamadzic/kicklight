"use client";

import { type ReactNode, useEffect, useRef } from "react";
import type { Rgb } from "@/engine/colors";
import { rgba } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DIM, STRIP_POINTS } from "@/lights/compose";

export interface VirtualStripProps {
  /** A steady array of colours, one per LED. Cheapest option for pages that just show a state. */
  colors?: readonly Rgb[];
  /**
   * Pulled on every animation frame for live, engine-driven strips (demo, remote).
   * `reduced` is true when the viewer prefers reduced motion.
   */
  frame?: (now: number, reduced: boolean) => readonly Rgb[];
  /** LED count when neither `colors` nor `frame` is set. */
  count?: number;
  /** `tv` wraps the strip round a TV outline (3 sides); `linear` is a compact bar. */
  variant?: "tv" | "linear";
  label?: string;
  className?: string;
  /**
   * Drawn over the TV's screen (the `tv` variant only), e.g. the score bug in the
   * corner as on a real broadcast. Positioned to the screen the canvas draws.
   */
  screen?: ReactNode;
}

interface Geometry {
  w: number;
  h: number;
  dpr: number;
  leds: [number, number][];
  tv: { x: number; y: number; w: number; h: number } | null;
  radius: number;
}

const lift = (c: readonly number[]) =>
  c.map((v) => Math.min(255, v * 1.1 + 20));

function layout(
  w: number,
  h: number,
  dpr: number,
  n: number,
  variant: "tv" | "linear",
): Geometry {
  if (variant === "linear") {
    const cw = w / n;
    const leds = Array.from(
      { length: n },
      (_, i) => [i * cw + cw / 2, h / 2] as [number, number],
    );
    return { w, h, dpr, leds, tv: null, radius: h * 0.95 };
  }
  const tw = w * 0.58;
  const th = (tw * 9) / 16;
  const x = (w - tw) / 2;
  const y = (h - th) / 2 + h * 0.04;
  const off = Math.max(6, w * 0.014);
  const path: [number, number, number, number][] = [
    [x - off, y + th * 0.92, x - off, y - off],
    [x - off, y - off, x + tw + off, y - off],
    [x + tw + off, y - off, x + tw + off, y + th * 0.92],
  ];
  const lens = path.map((s) => Math.hypot(s[2] - s[0], s[3] - s[1]));
  const total = lens.reduce((a, b) => a + b, 0);
  const leds: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let d = ((i + 0.5) / n) * total;
    let k = 0;
    while (k < lens.length - 1 && d > lens[k]) {
      d -= lens[k];
      k++;
    }
    const s = path[k];
    const t = d / lens[k];
    leds.push([s[0] + (s[2] - s[0]) * t, s[1] + (s[3] - s[1]) * t]);
  }
  return { w, h, dpr, leds, tv: { x, y, w: tw, h: th }, radius: w * 0.14 };
}

function draw(
  ctx: CanvasRenderingContext2D,
  g: Geometry,
  cols: readonly Rgb[],
  variant: "tv" | "linear",
) {
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#07090d";
  ctx.fillRect(0, 0, g.w, g.h);

  // Glow spill. Additive so neighbouring LEDs blend like light does.
  ctx.globalCompositeOperation = "lighter";
  const n = Math.min(cols.length, g.leds.length);
  for (let i = 0; i < n; i++) {
    const [x, y] = g.leds[i];
    const c = cols[i];
    const r = g.radius;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, rgba(c, variant === "linear" ? 0.55 : 0.32));
    grad.addColorStop(0.4, rgba(c, variant === "linear" ? 0.2 : 0.11));
    grad.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalCompositeOperation = "source-over";

  if (g.tv) {
    const { x, y, w, h } = g.tv;
    ctx.fillStyle = "#05070a";
    ctx.strokeStyle = "#1b1f27";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 6);
    ctx.fill();
    ctx.stroke();
    // A faint pitch on the screen so it reads as a TV showing football.
    const pitch = ctx.createLinearGradient(0, y, 0, y + h);
    pitch.addColorStop(0, "#112b19");
    pitch.addColorStop(0.55, "#17391f");
    pitch.addColorStop(1, "#112e1a");
    ctx.fillStyle = pitch;
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + w * 0.08, y + h * 0.12, w * 0.84, h * 0.76);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * 0.12);
    ctx.lineTo(x + w / 2, y + h * 0.88);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, h * 0.14, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The LEDs themselves.
  const s = variant === "linear" ? 0 : Math.max(4, g.w * 0.011);
  for (let i = 0; i < n; i++) {
    const [x, y] = g.leds[i];
    ctx.fillStyle = rgba(lift(cols[i]), 0.98);
    if (variant === "linear") {
      const cw = g.w / n;
      ctx.fillRect(i * cw + 1, g.h / 2 - 4, Math.max(1, cw - 2), 8);
    } else {
      ctx.beginPath();
      ctx.roundRect(x - s / 2, y - s / 2, s, s, s / 3);
      ctx.fill();
    }
  }
}

/**
 * A glowing LED strip, wrapped round a TV or as a compact bar. Pass either a
 * steady `colors` array or a `frame` function for live strips. Pauses itself
 * when off screen or hidden.
 */
export function VirtualStrip({
  colors,
  frame,
  count = STRIP_POINTS,
  variant = "tv",
  label = "Virtual light strip",
  className,
  screen,
}: VirtualStripProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const colorsRef = useRef(colors);
  const frameRef = useRef(frame);
  const wakeRef = useRef<() => void>(() => {});

  useEffect(() => {
    colorsRef.current = colors;
    frameRef.current = frame;
    wakeRef.current();
  }, [colors, frame]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mq.matches;
    const onMq = () => {
      reduced = mq.matches;
      wake();
    };
    mq.addEventListener("change", onMq);

    let geom: Geometry | null = null;
    let shown: Rgb[] = [];
    let raf = 0;
    let last = 0;
    let visible = true;
    let n = colorsRef.current?.length ?? count;

    const measure = () => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      geom = layout(r.width, r.height, dpr, n, variant);
      const box = screenRef.current;
      if (box && geom.tv) {
        box.style.left = `${geom.tv.x}px`;
        box.style.top = `${geom.tv.y}px`;
        box.style.width = `${geom.tv.w}px`;
        box.style.height = `${geom.tv.h}px`;
        box.style.visibility = "visible";
      }
      wake();
    };

    const step = (ts: number) => {
      raf = 0;
      if (!geom || !visible) return;
      const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0.016;
      last = ts;
      const live = frameRef.current;
      const target = live
        ? live(Date.now(), reduced)
        : (colorsRef.current ?? Array.from({ length: count }, () => DIM));
      if (target.length !== n) {
        n = target.length;
        geom = layout(geom.w, geom.h, geom.dpr, n, variant);
        shown = [];
      }
      if (shown.length !== n)
        shown = target.map((c) => [c[0], c[1], c[2]] as Rgb);
      const tau = live ? 0.035 : 0.12;
      const a = reduced ? 1 : 1 - Math.exp(-dt / tau);
      let settled = true;
      for (let i = 0; i < n; i++) {
        const s = shown[i];
        const t = target[i];
        for (let k = 0; k < 3; k++) {
          const d = t[k] - s[k];
          if (Math.abs(d) > 0.6) {
            s[k] += d * a;
            settled = false;
          } else s[k] = t[k];
        }
      }
      draw(ctx, geom, shown, variant);
      if (live || !settled) raf = requestAnimationFrame(step);
      else last = 0;
    };

    function wake() {
      if (!raf && visible) raf = requestAnimationFrame(step);
    }
    wakeRef.current = wake;

    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) wake();
    });
    io.observe(canvas);
    const onVis = () => wake();
    document.addEventListener("visibilitychange", onVis);
    measure();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      mq.removeEventListener("change", onMq);
      document.removeEventListener("visibilitychange", onVis);
      wakeRef.current = () => {};
    };
  }, [count, variant]);

  const canvas = (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className={cn(
        "block w-full max-w-full rounded-xl bg-stage",
        variant === "tv" ? "aspect-[16/10]" : "h-14",
        className,
      )}
    />
  );
  // The tv variant always keeps the same tree, so the canvas the draw loop holds
  // never gets swapped out when a screen overlay appears.
  if (variant !== "tv") return canvas;
  return (
    <div className="relative">
      {canvas}
      <div
        ref={screenRef}
        className="invisible absolute overflow-hidden rounded-[4px]"
      >
        {screen}
      </div>
    </div>
  );
}
