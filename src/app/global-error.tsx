"use client";

import "./globals.css";

/**
 * The last resort, when the root layout itself fails. It replaces that layout, so it brings
 * its own document and keeps to plain markup that can't fail the same way.
 */
export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-dvh items-center justify-center bg-background p-6 text-foreground">
        <title>Something went wrong · Kicklight</title>
        <main className="kl-panel flex max-w-sm flex-col items-center gap-4 p-8 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            Kicklight couldn't load. Your lights carry on following the match.
          </p>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="h-11 rounded-lg bg-primary px-5 text-primary-foreground"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
