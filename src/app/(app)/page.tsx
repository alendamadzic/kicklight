import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LandingView } from "@/components/landing/landing-view";
import { readSupabaseEnv } from "@/lib/supabase/env";
import { getUser } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: { absolute: "Kicklight · Your Hue strip, lit by the match" },
  description:
    "Your Philips Hue gradient strip in both teams' colours, flashing for every goal, card and VAR check.",
};

/** Signed out: the landing page. Signed in: straight to the matches. */
export default async function HomePage() {
  const user = readSupabaseEnv() ? await getUser().catch(() => null) : null;
  if (user) redirect("/matches");
  return <LandingView />;
}
