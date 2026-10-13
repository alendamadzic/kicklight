"use client";

import { PlayIcon, SettingsIcon, TvMinimalPlayIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/chrome/Logo";
import { ThemeToggle } from "@/components/chrome/ThemeToggle";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-user";
import { cn } from "@/lib/utils";

const NAV = [
  {
    href: "/",
    label: "Matches",
    icon: TvMinimalPlayIcon,
    match: (p: string) => p === "/" || p.startsWith("/match"),
  },
  {
    href: "/demo",
    label: "Demo",
    icon: PlayIcon,
    match: (p: string) => p.startsWith("/demo"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    match: (p: string) => p.startsWith("/settings"),
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

/** Slim top bar (logo, desktop nav, theme, sign in) plus a thumb-reach tab bar on phones. */
export function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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
                  className={cn(
                    "kl-display rounded-md px-3 py-2 text-base leading-none transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <AuthLink />
            <ThemeToggle />
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
                  className={cn(
                    "kl-press flex h-full flex-col items-center justify-center gap-1 outline-none transition-colors focus-visible:bg-muted",
                    active ? "text-amber" : "text-muted-foreground",
                  )}
                >
                  <Icon className="size-[1.375rem]" />
                  <span className="kl-display text-[0.8125rem] leading-none">
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
