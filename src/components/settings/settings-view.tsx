"use client";

import { LogOutIcon, PlusIcon, UnlinkIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DelaySlider } from "@/components/match/delay-slider";
import { StatChannels } from "@/components/match/stat-channels";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Slider } from "@/components/ui/slider";
import { signOut, useAuth } from "@/hooks/use-auth";
import { useHueStatus } from "@/hooks/use-hue-status";
import { usePreferences } from "@/hooks/use-preferences";
import { api } from "@/lib/api";
import { type CachedTeam, knownTeams } from "@/lib/team-cache";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const { prefs, update } = usePreferences();
  const { user, ready } = useAuth();
  const { result, refresh } = useHueStatus();
  const [teams, setTeams] = useState<Record<string, CachedTeam>>({});
  const [picker, setPicker] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  useEffect(() => setTeams(knownTeams()), []);
  // Refresh the cache whenever the picker opens, in case fixtures loaded meanwhile.
  useEffect(() => {
    if (picker) setTeams(knownTeams());
  }, [picker]);

  const status = result.phase === "loading" ? null : result.status;
  const followed = prefs.followed_teams;

  const unlink = async () => {
    setUnlinking(true);
    try {
      await api.hueUnlink();
      toast("Hue unlinked");
      await refresh();
    } catch {
      toast.error("Couldn't unlink right now.");
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="kl-eyebrow">Settings</p>
        <h1 className="kl-display text-4xl leading-none sm:text-5xl">
          Your setup
        </h1>
      </header>

      <Block
        title="My teams"
        hint="Their matches are pinned first on the fixtures page."
      >
        <div className="flex flex-wrap gap-2">
          {followed.map((id) => {
            const t = teams[id];
            return (
              <span
                key={id}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-secondary pl-3 pr-1"
              >
                <span
                  aria-hidden
                  className="size-3 rounded-full ring-1 ring-black/20"
                  style={{ background: t?.color ?? "#8f9bb2" }}
                />
                <span className="kl-display text-lg leading-none">
                  {t?.name ?? `Team ${id}`}
                </span>
                <button
                  type="button"
                  aria-label={`Unfollow ${t?.name ?? id}`}
                  onClick={() =>
                    update({ followed_teams: followed.filter((f) => f !== id) })
                  }
                  className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                >
                  <XIcon className="size-4" />
                </button>
              </span>
            );
          })}
          <Button
            variant="outline"
            onClick={() => setPicker(true)}
            className="kl-display h-11 rounded-lg px-3 text-base"
          >
            <PlusIcon data-icon="inline-start" />
            Add team
          </Button>
        </div>
        {!followed.length ? (
          <p className="text-sm text-muted-foreground">
            No teams yet. Add one here or tap a star on the fixtures page.
          </p>
        ) : null}
      </Block>

      <Block
        title="Default stat"
        hint="What the lights follow when a match starts."
      >
        <StatChannels
          value={prefs.default_stat}
          onValueChange={(s) => update({ default_stat: s })}
        />
      </Block>

      <Block title="Brightness">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1 py-3">
            <Slider
              aria-label="Brightness"
              min={1}
              max={100}
              step={1}
              value={[prefs.brightness]}
              onValueChange={(v) =>
                update({ brightness: Array.isArray(v) ? v[0] : v })
              }
            />
          </div>
          <span className="kl-display w-14 text-right text-2xl leading-none tabular-nums text-amber">
            {prefs.brightness}%
          </span>
        </div>
      </Block>

      <Block
        title="TV delay default"
        hint="Applied to every new match. You can still change it live."
      >
        <DelaySlider
          valueMs={prefs.tv_delay_ms}
          onCommit={(ms) => update({ tv_delay_ms: ms })}
        />
      </Block>

      <Block title="Philips Hue">
        <div className="flex flex-wrap items-center gap-3">
          {status?.linked ? (
            <>
              <Badge variant="secondary" className="h-7 px-3">
                <span className="mr-1.5 inline-block size-2 rounded-full bg-success" />
                Linked
              </Badge>
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {status.lightName ?? "No strip chosen yet"} ·{" "}
                {status.transport === "local" ? "local bridge" : "Hue cloud"}
              </span>
            </>
          ) : (
            <Badge variant="outline" className="h-7 px-3">
              <span className="mr-1.5 inline-block size-2 rounded-full bg-muted-foreground" />
              {result.phase === "loading"
                ? "Checking…"
                : result.phase === "signed_out"
                  ? "Sign in to link"
                  : "Not linked"}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/onboarding"
            className={buttonVariants({
              variant: status?.linked ? "secondary" : "default",
              className: "kl-display h-11 rounded-lg px-4 text-base",
            })}
          >
            {status?.linked ? "Change strip" : "Set up Hue"}
          </Link>
          {status?.linked ? (
            <Button
              variant="destructive"
              onClick={unlink}
              disabled={unlinking}
              className="kl-display h-11 rounded-lg px-4 text-base"
            >
              <UnlinkIcon data-icon="inline-start" />
              Unlink
            </Button>
          ) : null}
        </div>
      </Block>

      <Block title="Account">
        {user ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {user.email ?? "Signed in"}
            </span>
            <Button
              variant="outline"
              onClick={async () => {
                await signOut();
                toast("Signed out");
              }}
              className="kl-display h-11 rounded-lg px-4 text-base"
            >
              <LogOutIcon data-icon="inline-start" />
              Sign out
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex-1 text-sm text-muted-foreground">
              {ready
                ? "You're not signed in. Settings are kept on this device."
                : "Checking…"}
            </span>
            {ready ? (
              <Link
                href="/login?next=/settings"
                className={buttonVariants({
                  className: "kl-display h-11 rounded-lg px-4 text-base",
                })}
              >
                Sign in
              </Link>
            ) : null}
          </div>
        )}
      </Block>

      <CommandDialog
        open={picker}
        onOpenChange={setPicker}
        title="Add a team"
        description="Teams from the fixtures you've browsed"
      >
        <CommandInput placeholder="Search teams" />
        <CommandList>
          <CommandEmpty>
            No teams to show yet. Open the fixtures page and they'll appear
            here.
          </CommandEmpty>
          <CommandGroup heading="Teams">
            {Object.values(teams)
              .filter((t) => !followed.includes(t.id))
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <CommandItem
                  key={t.id}
                  value={`${t.name} ${t.short}`}
                  onSelect={() => {
                    update({ followed_teams: [...followed, t.id] });
                    setPicker(false);
                  }}
                >
                  <span
                    aria-hidden
                    className="size-3 rounded-full"
                    style={{ background: t.color }}
                  />
                  {t.name}
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function Block({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("kl-panel flex flex-col gap-4 p-4")}>
      <div>
        <h2 className="kl-display text-2xl leading-none">{title}</h2>
        {hint ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
