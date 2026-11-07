import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingView } from "@/components/onboarding/onboarding-view";
import { appMode } from "@/server/config";

export const metadata: Metadata = {
  title: "Set up",
};

type Props = PageProps<"/onboarding">;

/** The steps render from the static shell; a Hue link error from the URL streams in. */
export default function OnboardingPage(props: Props) {
  return (
    <Suspense fallback={<OnboardingView mode={appMode()} />}>
      <Onboarding searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Onboarding({
  searchParams,
}: {
  searchParams: Props["searchParams"];
}) {
  const { error } = await searchParams;
  return (
    <OnboardingView
      linkError={typeof error === "string" ? error : undefined}
      mode={appMode()}
    />
  );
}
