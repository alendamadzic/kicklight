import type { Metadata } from "next";
import { LandingView } from "@/components/landing/landing-view";

export const metadata: Metadata = {
  title: { absolute: "Kicklight · Your Hue strip, lit by the match" },
  description:
    "Your Philips Hue gradient strip in both teams' colours, flashing for every goal, card and VAR check.",
};

/** Signed out: the landing page. Signed-in visitors are sent to /matches by the proxy. */
export default function HomePage() {
  return <LandingView />;
}
