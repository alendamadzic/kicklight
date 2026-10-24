"use client";

import { useEffect, useState } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { LedBar } from "@/components/chrome/led-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAppConfig } from "@/hooks/use-app-config";
import { useAuth } from "@/hooks/use-auth";
import { useHueStatus } from "@/hooks/use-hue-status";
import { LinkStep } from "./link-step";
import { PickStep } from "./pick-step";
import { TestStep } from "./test-step";

const STEPS = ["Your email", "Link Hue", "Pick your strip", "Test it"] as const;
/** What the Hue sign-in sends back in `?error=` (see the OAuth callback route). */
const LINK_ERRORS: Record<string, string> = {
  state_mismatch:
    "The Hue sign-in expired or was opened in another tab. Try linking again.",
  not_configured: "Hue linking isn't set up on this server.",
  link_failed: "Hue didn't finish linking your bridge. Try again.",
};

/**
 * Set up your lights, honestly numbered: sign in, link Hue, pick the strip, test it.
 * Signed-in visitors start at Link Hue; a returning OAuth redirect lands where it left off.
 */
export function OnboardingView({ linkError }: { linkError?: string }) {
  const config = useAppConfig();
  const { user, ready } = useAuth();
  const { result, refresh } = useHueStatus();
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const [seeded, setSeeded] = useState(false);

  // Skip ahead: signed in skips the email step, an existing link skips linking.
  useEffect(() => {
    if (seeded || !ready || result.phase === "loading") return;
    setSeeded(true);
    if (!user) return;
    if (result.phase === "ok" && result.status.linked)
      setStep(result.status.lightId ? 3 : 2);
    else setStep(1);
  }, [ready, user, result, seeded]);

  const signedOut = result.phase === "signed_out";

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            Step {step + 1} of {STEPS.length} · {STEPS[step]}
          </p>
          <LedBar variant="progress" count={STEPS.length} step={step} />
        </div>
        <h1 className="kl-headline text-4xl sm:text-5xl">
          Set up your <span className="text-amber">lights</span>
        </h1>
      </header>

      {linkError && step === 1 ? (
        <Alert variant="destructive">
          <AlertTitle>Hue isn't linked yet</AlertTitle>
          <AlertDescription>
            {LINK_ERRORS[linkError] ?? LINK_ERRORS.link_failed}
          </AlertDescription>
        </Alert>
      ) : null}

      {step === 0 ? (
        <div className="flex flex-col gap-3">
          <LoginForm
            next="/onboarding"
            onSignedIn={() => {
              void refresh();
              setStep(1);
            }}
          />
          <button
            type="button"
            onClick={() => {
              setPreview(true);
              setStep(2);
            }}
            className="kl-press min-h-11 self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Preview the rest with a sample strip
          </button>
        </div>
      ) : null}
      {step === 1 ? (
        <LinkStep
          mode={config.mode}
          signedOut={signedOut}
          apiMissing={result.phase === "unavailable"}
          linked={result.phase === "ok" && result.status.linked}
          onLinked={() => {
            void refresh();
            setStep(2);
          }}
          onPreview={() => {
            setPreview(true);
            setStep(2);
          }}
          onNext={() => setStep(2)}
        />
      ) : null}
      {step === 2 ? (
        <PickStep
          preview={preview}
          selectedId={result.phase === "ok" ? result.status.lightId : null}
          onPicked={() => setStep(3)}
          onBack={() => setStep(preview ? 0 : 1)}
        />
      ) : null}
      {step === 3 ? (
        <TestStep preview={preview} onBack={() => setStep(2)} />
      ) : null}
    </div>
  );
}
