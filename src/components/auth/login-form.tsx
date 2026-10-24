"use client";

import { MailIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LedBar } from "@/components/chrome/led-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/hooks/use-auth";
import { getSupabase } from "@/lib/supabase/safe-client";
import { cn } from "@/lib/utils";

/** Supabase's email one-time code length (the project default). */
const CODE_LENGTH = 6;

/**
 * Sign in with no password: we email a code and a link. Type the code here, or open
 * the link on any device; opening it in another tab here moves this page on by itself.
 * Used on /login and as the first step of setup.
 */
export function LoginForm({
  next,
  error,
  onSignedIn,
  className,
}: {
  /** Where to go after signing in, when `onSignedIn` isn't given. */
  next: string;
  error?: string;
  /** Called once signed in (setup moves to its next step instead of navigating). */
  onSignedIn?: () => void;
  className?: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [problem, setProblem] = useState<string | null>(
    error
      ? "That link didn't work. It may have expired. Ask for a fresh one."
      : null,
  );
  const [ios, setIos] = useState(false);
  const sb = getSupabase();
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    setIos(/iPhone|iPad|iPod/.test(navigator.userAgent));
  }, []);

  // Signed in another way (the link opened in another tab): move on.
  useEffect(() => {
    if (!sent || !user) return;
    if (onSignedIn) onSignedIn();
    else router.replace(next as Route);
  }, [sent, user, onSignedIn, next, router]);

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!sb || !email.trim()) return;
    setBusy(true);
    setProblem(null);
    const { error: err } = await sb.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (err) setProblem(err.message);
    else setSent(true);
  };

  const verify = async (token: string) => {
    if (!sb) return;
    setBusy(true);
    setProblem(null);
    const { error: err } = await sb.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });
    setBusy(false);
    if (err) {
      setProblem("That code didn't work. Check it, or ask for a new email.");
      setCode("");
    }
    // Success arrives through useAuth, which moves the page on.
  };

  if (sent) {
    return (
      <div className={cn("kl-panel flex flex-col gap-5 p-5", className)}>
        <div className="flex flex-col gap-2">
          <h2 className="kl-headline text-3xl">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            We sent a code and a sign-in link to{" "}
            <span className="font-medium text-foreground">{email}</span>. Type
            the code here, or open the link on any device.
          </p>
        </div>
        {problem ? (
          <Alert variant="destructive">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        ) : null}
        <InputOTP
          maxLength={CODE_LENGTH}
          value={code}
          onChange={setCode}
          onComplete={verify}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Code from the email"
          disabled={busy}
          autoFocus
        >
          <InputOTPGroup className="w-full justify-between gap-2">
            {Array.from({ length: CODE_LENGTH }, (_, i) => (
              <InputOTPSlot
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed code slots
                key={i}
                index={i}
                className="kl-display h-14 flex-1 rounded-xl! border text-2xl"
              />
            ))}
          </InputOTPGroup>
        </InputOTP>
        <div className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5 text-sm text-muted-foreground">
          <LedBar variant="chase" count={3} segmentClassName="w-2.5" />
          {busy ? "Checking…" : "Waiting for the code or the link…"}
        </div>
        {ios ? (
          <a
            href="message://"
            className={buttonVariants({
              size: "lg",
              className: "h-12 rounded-xl text-base",
            })}
          >
            <MailIcon data-icon="inline-start" />
            Open Mail
          </a>
        ) : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy}
            className="min-h-11 text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Send a new email
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setCode("");
              setProblem(null);
            }}
            className="min-h-11 text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={send}
      className={cn("kl-panel flex flex-col gap-5 p-5", className)}
    >
      {!sb ? (
        <Alert>
          <AlertTitle>Sign-in isn't configured here</AlertTitle>
          <AlertDescription>
            This copy has no Supabase project attached. The demo still works.
          </AlertDescription>
        </Alert>
      ) : null}
      {problem ? (
        <Alert variant="destructive">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : null}
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Your email</FieldLabel>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-base"
          />
          <FieldDescription>
            No password. We email you a code and a one-tap link.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        size="lg"
        disabled={busy || !sb}
        className="h-12 rounded-xl text-base font-semibold"
      >
        {busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <MailIcon data-icon="inline-start" />
        )}
        Email me a code
      </Button>
      <Link
        href="/demo"
        className={buttonVariants({
          variant: "ghost",
          className: "h-11 text-muted-foreground",
        })}
      >
        Watch a demo match first
      </Link>
    </form>
  );
}
