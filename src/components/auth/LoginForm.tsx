"use client";

import { MailCheckIcon, MailIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getSupabase } from "@/lib/supabase/safe-client";

export function LoginForm({ next, error }: { next: string; error?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<string | null>(
    error
      ? "That link didn't work. It may have expired. Ask for a fresh one."
      : null,
  );
  const sb = getSupabase();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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

  if (sent) {
    return (
      <div className="kl-panel flex flex-col items-center gap-3 p-8 text-center">
        <MailCheckIcon className="size-10 text-amber" />
        <h2 className="kl-display text-3xl leading-none">Check your inbox</h2>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to{" "}
          <span className="text-foreground">{email}</span>. Open it on this
          device.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="min-h-11 text-sm text-muted-foreground underline underline-offset-4"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="kl-panel flex flex-col gap-5 p-5">
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
          <FieldLabel htmlFor="email">Email</FieldLabel>
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
            No password. We email you a one-tap link.
          </FieldDescription>
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        size="lg"
        disabled={busy || !sb}
        className="kl-display h-12 rounded-xl text-lg"
      >
        {busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <MailIcon data-icon="inline-start" />
        )}
        Email me a link
      </Button>
      <Link
        href="/demo"
        className={buttonVariants({
          variant: "ghost",
          className: "h-11 text-muted-foreground",
        })}
      >
        Try the demo first
      </Link>
    </form>
  );
}
