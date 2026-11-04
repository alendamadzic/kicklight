import type { Metadata } from "next";
import { LightsGuideView } from "@/components/guide/lights-guide-view";

export const metadata: Metadata = {
  title: "What the lights do",
  description:
    "Every match moment that lights up your strip, what sets it off, and what it looks like.",
};

export default function LightsGuidePage() {
  return <LightsGuideView />;
}
