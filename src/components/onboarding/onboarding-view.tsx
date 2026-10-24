"use client";

import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppConfig } from "@/hooks/use-app-config";
import { useHueStatus } from "@/hooks/use-hue-status";
import { cn } from "@/lib/utils";
import { LinkStep } from "./link-step";
import { PickStep } from "./pick-step";
import { TestStep } from "./test-step";

const STEPS = ["Link Hue", "Pick strip", "Test it"] as const;
/** What the Hue sign-in sends back in `?error=` (see the OAuth callback route). */
const LINK_ERRORS: Record<string, string> = {
  state_mismatch:
    "The Hue sign-in expired or was opened in another tab. Try linking again.",
  not_configured: "Hue linking isn't set up on this server.",
  link_failed: "Hue didn't finish linking your bridge. Try again.",
};

export function OnboardingView({ linkError }: { linkError?: string }) {
  const config = useAppConfig();
  const { result, refresh } = useHueStatus();
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Skip ahead when the Hue link already exists (e.g. back from the OAuth redirect).
  useEffect(() => {
    if (seeded || result.phase === "loading") return;
    setSeeded(true);
    if (result.phase === "ok" && result.status.linked) {
      setStep(result.status.lightId ? 2 : 1);
    }
  }, [result, seeded]);

  const signedOut = result.phase === "signed_out";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="kl-eyebrow">Set up · three taps</p>
        <h1 className="kl-display text-4xl leading-none sm:text-5xl">
          Wire up the <span className="text-amber">strip</span>
        </h1>
      </header>

      <ol className="grid grid-cols-3 gap-2" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined}>
            <div
              className={cn(
                "h-1.5 rounded-full transition-colors",
                i < step ? "bg-success" : i === step ? "bg-amber" : "bg-muted",
              )}
            />
            <span
              className={cn(
                "kl-display mt-1.5 block text-base leading-none",
                i === step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      {linkError && step === 0 ? (
        <Alert variant="destructive">
          <AlertTitle>Hue isn't linked yet</AlertTitle>
          <AlertDescription>
            {LINK_ERRORS[linkError] ?? LINK_ERRORS.link_failed}
          </AlertDescription>
        </Alert>
      ) : null}

      {step === 0 ? (
        <LinkStep
          mode={config.mode}
          signedOut={signedOut}
          apiMissing={result.phase === "unavailable"}
          linked={result.phase === "ok" && result.status.linked}
          onLinked={() => {
            void refresh();
            setStep(1);
          }}
          onPreview={() => {
            setPreview(true);
            setStep(1);
          }}
          onNext={() => setStep(1)}
        />
      ) : null}
      {step === 1 ? (
        <PickStep
          preview={preview}
          selectedId={result.phase === "ok" ? result.status.lightId : null}
          onPicked={() => setStep(2)}
          onBack={() => setStep(0)}
        />
      ) : null}
      {step === 2 ? (
        <TestStep preview={preview} onBack={() => setStep(1)} />
      ) : null}
    </div>
  );
}
