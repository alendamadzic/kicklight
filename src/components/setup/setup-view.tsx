"use client";

import { LogOutIcon, PlusIcon, UnlinkIcon, XIcon, ZapIcon } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LedBar } from "@/components/chrome/led-bar";
import { ResponsiveOverlay } from "@/components/chrome/responsive-overlay";
import { HealthPill, type HueHealth } from "@/components/chrome/status-pill";
import { DelaySlider } from "@/components/match/delay-slider";
import { StatChannels } from "@/components/match/stat-channels";
import { VirtualStrip } from "@/components/strip/virtual-strip";
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
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  hexToRgb,
  type KitChoice,
  liftForGlow,
  type Rgb,
} from "@/engine/colors";
import { signOut, useAuth } from "@/hooks/use-auth";
import { useDevicePrefs } from "@/hooks/use-device-prefs";
import { useHueStatus } from "@/hooks/use-hue-status";
import { useLiveSession } from "@/hooks/use-live-session";
import { usePreferences } from "@/hooks/use-preferences";
import { ApiRequestError, api } from "@/lib/api";
import { healthProblem } from "@/lib/health";
import { type CachedTeam, knownTeams } from "@/lib/team-cache";
import { cn } from "@/lib/utils";
import { STRIP_POINTS } from "@/lights/compose";
import { KitPicker } from "./kit-picker";

const SEG =
  "h-10 flex-1 rounded-lg bg-secondary px-3 text-sm font-medium text-muted-foreground aria-pressed:bg-foreground aria-pressed:text-background";

/**
 * Setup, built around your strip: the hardware and its health first, then your teams
 * and their strip colours, the lights' defaults, this device, appearance and account.
 * Unlinking sits at the very bottom and says what it will do before it does it.
 */
export function SetupView() {
  const { prefs, update } = usePreferences();
  const { prefs: device, update: updateDevice } = useDevicePrefs();
  const { user, ready } = useAuth();
  const { result, refresh } = useHueStatus();
  const { session } = useLiveSession();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [teams, setTeams] = useState<Record<string, CachedTeam>>({});
  const [picker, setPicker] = useState(false);
  const [kitFor, setKitFor] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState<"unlink" | "signout" | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setTeams(knownTeams());
  }, []);
  useEffect(() => {
    if (picker || kitFor) setTeams(knownTeams());
  }, [picker, kitFor]);

  const status = result.phase === "ok" ? result.status : null;
  const followed = prefs.followed_teams;
  const live = session?.snapshot?.match;
  const liveName = live ? `${live.home.name} v ${live.away.name}` : null;

  const problem = healthProblem(status, session?.pause_reason ?? null);
  const health: HueHealth =
    result.phase === "loading"
      ? "checking"
      : !status?.linked
        ? "not_linked"
        : session?.pause_reason === "bridge_unreachable" ||
            session?.pause_reason === "bridge_unauthorized"
          ? "unreachable"
          : problem?.tone === "warn"
            ? "expiring"
            : "connected";

  // The strip card glows in your first team's colour, or the demo's two kits.
  const first = followed.map((id) => teams[id]).find(Boolean);
  const stripColors = useMemo<Rgb[]>(() => {
    if (first) {
      const o = prefs.kit_overrides[first.id];
      const hex =
        o && o !== "primary"
          ? o === "alternate"
            ? (first.alternateColor ?? first.color)
            : o
          : first.color;
      const c = liftForGlow(hexToRgb(hex));
      return Array.from({ length: STRIP_POINTS }, () => c);
    }
    const h = hexToRgb("#6cabdd");
    const a = hexToRgb("#c8102e");
    return Array.from({ length: STRIP_POINTS }, (_, i) =>
      i < STRIP_POINTS / 2 ? h : a,
    );
  }, [first, prefs.kit_overrides]);

  const runTest = async () => {
    setTesting(true);
    try {
      await api.hueTest();
    } catch (e) {
      toast.error(
        e instanceof ApiRequestError && e.message !== e.code
          ? e.message
          : "Your strip didn't answer the test.",
      );
    } finally {
      setTesting(false);
    }
  };

  const unfollow = (id: string) => {
    const before = followed;
    update({ followed_teams: followed.filter((f) => f !== id) });
    toast(`Unfollowed ${teams[id]?.name ?? "team"}`, {
      action: {
        label: "Undo",
        onClick: () => update({ followed_teams: before }),
      },
    });
  };

  const setKit = (id: string, choice: KitChoice) =>
    update({ kit_overrides: { ...prefs.kit_overrides, [id]: choice } });

  const unlink = async () => {
    setBusy(true);
    try {
      await api.hueUnlink();
      toast("Hue unlinked");
      setConfirm(null);
      await refresh();
    } catch {
      toast.error("Couldn't unlink right now. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    await signOut();
    setConfirm(null);
    toast("Signed out");
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="kl-headline text-4xl sm:text-5xl">Setup</h1>
        <p className="text-sm text-muted-foreground">
          Your strip, your teams and how the lights behave.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-5 lg:sticky lg:top-[calc(4.5rem+env(safe-area-inset-top))]">
          {/* Your strip */}
          <section
            aria-labelledby="s-strip"
            className="kl-panel flex flex-col gap-4 p-4"
          >
            <VirtualStrip colors={stripColors} label="Your strip" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 id="s-strip" className="truncate text-base font-semibold">
                  {status?.lightName ??
                    (status?.linked
                      ? "No strip chosen yet"
                      : "No strip linked")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {status?.linked
                    ? status.transport === "local"
                      ? "Local bridge on your network"
                      : "Hue cloud"
                    : result.phase === "signed_out"
                      ? "Sign in to link your Hue bridge"
                      : "Link your Hue bridge to get started"}
                </p>
              </div>
              <HealthPill health={health} />
            </div>
            {problem ? (
              <p className="text-sm text-muted-foreground">
                {problem.text}{" "}
                <Link href={problem.href} className="font-semibold text-amber">
                  {problem.fix} ›
                </Link>
              </p>
            ) : null}
            {status?.linked ? (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={runTest}
                  disabled={testing || !status.lightId}
                  className="h-11 rounded-xl text-sm font-semibold"
                >
                  {testing ? (
                    <LedBar variant="chase" count={3} segmentClassName="w-2" />
                  ) : (
                    <ZapIcon data-icon="inline-start" />
                  )}
                  {testing ? "Testing…" : "Test strip"}
                </Button>
                <Link
                  href="/onboarding"
                  className={buttonVariants({
                    variant: "secondary",
                    className: "h-11 rounded-xl text-sm font-semibold",
                  })}
                >
                  Change strip
                </Link>
              </div>
            ) : (
              <Link
                href="/onboarding"
                className={buttonVariants({
                  size: "lg",
                  className: "h-12 rounded-xl text-base font-semibold",
                })}
              >
                Set up your lights
              </Link>
            )}
          </section>

          {/* Teams */}
          <Block
            id="s-teams"
            title="Your teams"
            hint="Tap a team to choose its strip colour."
          >
            <div className="flex flex-wrap gap-2">
              {followed.map((id) => {
                const t = teams[id];
                const o = prefs.kit_overrides[id];
                const swatch = o?.startsWith("#")
                  ? o
                  : o === "alternate"
                    ? t?.alternateColor
                    : t?.color;
                return (
                  <span
                    key={id}
                    className="inline-flex h-11 items-center rounded-xl bg-secondary"
                  >
                    {t ? (
                      <ResponsiveOverlay
                        open={kitFor === id}
                        onOpenChange={(o) => setKitFor(o ? id : null)}
                        align="start"
                        title={`${t.name} on your strip`}
                        description="Pick the colour this team glows in."
                        trigger={
                          <button
                            type="button"
                            aria-label={`Strip colour for ${t.name}`}
                            className="inline-flex h-full items-center gap-2 rounded-l-xl pl-3 pr-2 text-sm font-semibold hover:bg-accent"
                          >
                            <span
                              aria-hidden
                              className="size-3.5 rounded-full ring-1 ring-black/20"
                              style={{ background: swatch ?? t.color }}
                            />
                            {t.name}
                          </button>
                        }
                      >
                        <KitPicker
                          team={t}
                          value={prefs.kit_overrides[id]}
                          onChange={(c) => setKit(id, c)}
                        />
                      </ResponsiveOverlay>
                    ) : (
                      <span className="pl-3 pr-2 text-sm font-semibold">
                        Team {id}
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label={`Unfollow ${t?.name ?? id}`}
                      onClick={() => unfollow(id)}
                      className="grid h-full w-9 place-items-center rounded-r-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <XIcon className="size-4" />
                    </button>
                  </span>
                );
              })}
              <Button
                variant="outline"
                onClick={() => setPicker(true)}
                className="h-11 rounded-xl px-3 text-sm font-semibold"
              >
                <PlusIcon data-icon="inline-start" />
                Add team
              </Button>
            </div>
            {!followed.length ? (
              <p className="text-sm text-muted-foreground">
                No teams yet. Add one here, or use a match card's ⋯ menu.
              </p>
            ) : null}
          </Block>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Block id="s-lights" title="Lights">
            <Row
              label="Lights follow"
              hint="What the lights follow when a match starts."
            >
              <StatChannels
                value={prefs.default_stat}
                onValueChange={(s) => update({ default_stat: s })}
              />
            </Row>
            <Row label="Brightness">
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
                <span className="w-12 text-right text-sm font-semibold tabular-nums">
                  {prefs.brightness}%
                </span>
              </div>
            </Row>
            <DelaySlider
              valueMs={prefs.tv_delay_ms}
              onCommit={(ms) => update({ tv_delay_ms: ms })}
            />
            <Row
              label="Strip direction"
              hint="Set by the strip test. Flip it if home colours show on the right."
            >
              <ToggleGroup
                value={[prefs.strip_reversed ? "rtl" : "ltr"]}
                onValueChange={(v) =>
                  v[0] && update({ strip_reversed: v[0] === "rtl" })
                }
                spacing={1}
                aria-label="Strip direction"
                className="w-full"
              >
                <ToggleGroupItem value="ltr" className={SEG}>
                  Left to right
                </ToggleGroupItem>
                <ToggleGroupItem value="rtl" className={SEG}>
                  Right to left
                </ToggleGroupItem>
              </ToggleGroup>
            </Row>
            <SwitchRow
              id="auto-start"
              label="Start 10 minutes before kick-off"
              hint="Your lights join in on their own when one of your teams is about to play."
              checked={prefs.auto_start}
              onChange={(v) => update({ auto_start: v })}
            />
          </Block>

          <Block id="s-device" title="On this device">
            <SwitchRow
              id="celebrations"
              label="Goal celebrations"
              hint="Goals flood the remote's TV in the scorer's colours."
              checked={device.celebrations}
              onChange={(v) => updateDevice({ celebrations: v })}
            />
            <SwitchRow
              id="vibrate"
              label="Vibrate on goals"
              hint="On phones that support it."
              checked={device.vibrate}
              onChange={(v) => updateDevice({ vibrate: v })}
            />
            <SwitchRow
              id="captions"
              label="Demo captions"
              hint="Explain each moment while the demo plays."
              checked={device.captions}
              onChange={(v) => updateDevice({ captions: v })}
            />
          </Block>

          <Block id="s-look" title="Appearance">
            <ToggleGroup
              value={[mounted ? (theme ?? "dark") : "dark"]}
              onValueChange={(v) => v[0] && setTheme(v[0])}
              spacing={1}
              aria-label="Theme"
              className="w-full"
            >
              <ToggleGroupItem value="dark" className={SEG}>
                Dark
              </ToggleGroupItem>
              <ToggleGroupItem value="light" className={SEG}>
                Light
              </ToggleGroupItem>
              <ToggleGroupItem value="system" className={SEG}>
                System
              </ToggleGroupItem>
            </ToggleGroup>
            {mounted && resolvedTheme === "dark" ? (
              <SwitchRow
                id="true-black"
                label="True black"
                hint="Saves battery on OLED phones."
                checked={device.trueBlack}
                onChange={(v) => updateDevice({ trueBlack: v })}
              />
            ) : null}
          </Block>

          <Block id="s-account" title="Account">
            {user ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {user.email ?? "Signed in"}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      liveName ? setConfirm("signout") : void doSignOut()
                    }
                    className="h-11 rounded-xl px-4 text-sm font-semibold"
                  >
                    <LogOutIcon data-icon="inline-start" />
                    Sign out
                  </Button>
                </div>
                {confirm === "signout" ? (
                  <Confirm
                    text={`Your lights keep following ${liveName} after you sign out, but this device won't control them until you sign back in.`}
                    action="Sign out"
                    onCancel={() => setConfirm(null)}
                    onConfirm={doSignOut}
                  />
                ) : null}
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
                    href="/login?next=/setup"
                    className={buttonVariants({
                      className: "h-11 rounded-xl px-4 text-sm font-semibold",
                    })}
                  >
                    Sign in
                  </Link>
                ) : null}
              </div>
            )}
          </Block>

          {status?.linked ? (
            <section className="flex flex-col gap-3 rounded-2xl border border-destructive/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">
                    Unlink Philips Hue
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Kicklight forgets your bridge. You can link it again any
                    time.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setConfirm("unlink")}
                  className="h-11 rounded-xl px-4 text-sm font-semibold"
                >
                  <UnlinkIcon data-icon="inline-start" />
                  Unlink
                </Button>
              </div>
              {confirm === "unlink" ? (
                <Confirm
                  text={
                    liveName
                      ? `This stops your lights on ${liveName}, restores the strip and forgets your bridge.`
                      : "This forgets your bridge and the strip you picked."
                  }
                  action={busy ? "Unlinking…" : "Unlink"}
                  disabled={busy}
                  onCancel={() => setConfirm(null)}
                  onConfirm={unlink}
                />
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      <CommandDialog
        open={picker}
        onOpenChange={setPicker}
        title="Add a team"
        description="Teams from the matches you've browsed"
      >
        <CommandInput placeholder="Search teams" />
        <CommandList>
          <CommandEmpty>
            No teams to show yet. Open Matches and they'll appear here.
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
  id,
  title,
  hint,
  children,
}: {
  id: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="kl-panel flex flex-col gap-4 p-4">
      <div>
        <h2 id={id} className="kl-headline text-2xl">
          {title}
        </h2>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-sm font-semibold">{label}</span>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-semibold">
          {label}
        </label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Confirm({
  text,
  action,
  disabled,
  onCancel,
  onConfirm,
}: {
  text: string;
  action: string;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={action}
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3",
      )}
    >
      <p className="text-sm">{text}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={onCancel}
          className="h-11 rounded-xl text-sm font-semibold"
        >
          Keep it
        </Button>
        <Button
          variant="destructive"
          onClick={onConfirm}
          disabled={disabled}
          className="h-11 rounded-xl text-sm font-semibold"
        >
          {action}
        </Button>
      </div>
    </div>
  );
}
