import type { Metadata } from "next";
import Link from "next/link";
import { AppChrome } from "@/components/chrome/app-chrome";
import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata: Metadata = {
  title: "Not found",
};

/** Any address that matches no route. It sits outside the (app) group, so it brings the chrome. */
export default function NotFound() {
  return (
    <AppChrome>
      <Empty className="kl-panel">
        <EmptyHeader>
          <EmptyTitle className="kl-display text-2xl">Offside</EmptyTitle>
          <EmptyDescription>There's no page at this address.</EmptyDescription>
        </EmptyHeader>
        <div className="flex gap-2">
          <Link href="/" className={buttonVariants()}>
            All matches
          </Link>
          <Link href="/demo" className={buttonVariants({ variant: "outline" })}>
            Try the demo
          </Link>
        </div>
      </Empty>
    </AppChrome>
  );
}
