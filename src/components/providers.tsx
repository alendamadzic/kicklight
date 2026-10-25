"use client";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster
        position="top-center"
        offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      />
    </>
  );
}
