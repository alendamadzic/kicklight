import type { Metadata } from "next";
import { OnboardingView } from "@/components/onboarding/onboarding-view";
import { appMode } from "@/server/config";

export const metadata: Metadata = {
  title: "Set up",
};

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const { error } = await props.searchParams;
  return (
    <OnboardingView
      linkError={typeof error === "string" ? error : undefined}
      mode={appMode()}
    />
  );
}
