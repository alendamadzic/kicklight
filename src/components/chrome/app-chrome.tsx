"use client";

import {
  SlidersHorizontalIcon,
  TvMinimalIcon,
  TvMinimalPlayIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/chrome/logo";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useLiveSession } from "@/hooks/use-live-session";
import { cn } from "@/lib/utils";

const NAV = [
  {
    href: "/matches",
    label: "Matches",
    icon: TvMinimalIcon,
    match: (p: string) => p.startsWith("/matches"),
  },
  {
    href: "/remote",
    label: "Remote",
    icon: TvMinimalPlayIcon,
    match: (p: string) => p.startsWith("/remote") || p.startsWith("/match/"),
  },
  {
    href: "/setup",
    label: "Setup",
    icon: SlidersHorizontalIcon,
    match: (p: string) => p.startsWith("/setup") || p.startsWith("/onboarding"),
  },
] as const;

function AuthLink() {
  const { user, ready } = useAuth();
  if (!ready || user) return null;
  return (
    <Link
      href="/login"
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      Sign in
    </Link>
  );
}

/** A small LED on the Remote tab while the lights are following a match. */
function LiveDot({ paused }: { paused: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute -top-0.5 -right-1 size-2 rounded-full ring-2 ring-background",
        paused ? "bg-amber" : "kl-live-dot bg-live",
      )}
    />
  );
}

/** Slim top bar (logo, desktop nav, sign in) plus a thumb-reach tab bar on phones. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useLiveSession();
  const lights = session ? { paused: session.status === "paused" } : null;
  const label = (item: (typeof NAV)[number]) =>
    item.href === "/remote" && lights
      ? `Remote, lights ${lights.paused ? "paused" : "on"}`
      : item.label;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <Logo />
          <nav
            aria-label="Primary"
            className="ml-6 hidden items-center gap-1 sm:flex"
          >
            {NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label(item)}
                  className={cn(
                    "relative rounded-lg px-3 py-2 text-sm font-medium leading-none transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                  {item.href === "/remote" && lights ? (
                    <LiveDot paused={lights.paused} />
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <AuthLink />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom)+1.5rem)] pt-4 sm:pb-12 sm:pt-6">
        {children}
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-md grid-cols-3">
          {NAV.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  aria-label={label(item)}
                  className={cn(
                    "kl-press flex h-full flex-col items-center justify-center gap-1 outline-none transition-colors focus-visible:bg-muted",
                    active ? "text-amber" : "text-muted-foreground",
                  )}
                >
                  <span className="relative">
                    <Icon className="size-[1.375rem]" />
                    {item.href === "/remote" && lights ? (
                      <LiveDot paused={lights.paused} />
                    ) : null}
                  </span>
                  <span className="text-[0.6875rem] font-medium leading-none">
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
