"use client";

import { Sparkles } from "lucide-react";

export function ShowcaseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed bottom-14 right-5 z-40 flex items-center gap-1.5 rounded-full border bg-card/90 px-3.5 py-2 text-xs font-medium shadow-lg backdrop-blur-sm transition-colors hover:bg-card"
    >
      <Sparkles className="size-3.5 text-muted-foreground" />
      <span>Showcase</span>
    </button>
  );
}
