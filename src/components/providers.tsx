"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDevicePrefs } from "@/hooks/use-device-prefs";

/** True black is a per-device choice layered on the dark theme. */
function TrueBlack() {
  const { prefs } = useDevicePrefs();
  useEffect(() => {
    document.documentElement.classList.toggle("oled", prefs.trueBlack);
  }, [prefs.trueBlack]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <TrueBlack />
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster
        position="top-center"
        offset={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
      />
    </ThemeProvider>
  );
}
