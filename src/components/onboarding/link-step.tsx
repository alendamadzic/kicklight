"use client";

import { CheckIcon, LinkIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { startHueOAuth } from "@/lib/api";
import type { AppMode } from "@/lib/api-types";
import { LocalPair } from "./local-pair";

/** Step 1: link the bridge, through Hue's cloud login or by pairing on the LAN. */
export function LinkStep({
  mode,
  signedOut,
  apiMissing,
  linked,
  onLinked,
  onPreview,
  onNext,
}: {
  mode: AppMode;
  signedOut: boolean;
  apiMissing: boolean;
  linked: boolean;
  onLinked: () => void;
  onPreview: () => void;
  onNext: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const linkCloud = async () => {
    setBusy(true);
    const ok = await startHueOAuth();
    if (!ok) {
      setBusy(false);
      setUnavailable(true);
      toast.error("Hue linking isn't available on this server yet.");
    }
  };

  return (
    <section
      className="kl-panel flex flex-col gap-5 p-5"
      aria-labelledby="link-h"
    >
      <div>
        <h2 id="link-h" className="kl-headline text-2xl">
          {mode === "local" ? "Find your bridge" : "Link your Philips Hue"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "local"
            ? "Kicklight finds the Hue bridge on your network. You'll press its link button once."
            : "Sign in with Hue and approve Kicklight. It only drives the strip you pick."}
        </p>
      </div>

      {signedOut ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Sign in first so the link is saved to your account.
          </p>
          <Link
            href="/login?next=/onboarding"
            className={buttonVariants({
              size: "lg",
              className: "h-12 rounded-xl text-base font-semibold",
            })}
          >
            Sign in
          </Link>
        </div>
      ) : linked ? (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckIcon className="size-4" /> Hue is linked.
          </p>
          <Button
            size="lg"
            onClick={onNext}
            className="h-12 rounded-xl text-base font-semibold"
          >
            Continue
          </Button>
        </div>
      ) : mode === "local" ? (
        <LocalPair onLinked={onLinked} />
      ) : (
        <Button
          size="lg"
          onClick={linkCloud}
          disabled={busy}
          className="h-12 rounded-xl text-base font-semibold"
        >
          {busy ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <LinkIcon data-icon="inline-start" />
          )}
          Link Philips Hue
        </Button>
      )}

      {unavailable || signedOut || apiMissing ? (
        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={onPreview}
            className="kl-press min-h-11 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Preview the rest with a sample strip
          </button>
        </div>
      ) : null}
    </section>
  );
}
