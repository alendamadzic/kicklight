"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

/** Any page that throws lands here, inside the app chrome, with a way to try again. */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Empty className="kl-panel">
      <EmptyHeader>
        <EmptyTitle className="kl-display text-2xl">
          Something went wrong
        </EmptyTitle>
        <EmptyDescription>
          This page hit a problem. Your lights carry on following the match.
        </EmptyDescription>
      </EmptyHeader>
      <div className="flex gap-2">
        <Button onClick={() => unstable_retry()}>Try again</Button>
        <Link
          href="/matches"
          className={buttonVariants({ variant: "outline" })}
        >
          All matches
        </Link>
      </div>
    </Empty>
  );
}
