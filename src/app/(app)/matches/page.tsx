import type { Metadata } from "next";
import { FixturesView } from "@/components/fixtures/fixtures-view";

export const metadata: Metadata = {
  title: "Matches",
  description: "Today's fixtures, your teams first.",
};

export default function MatchesPage() {
  return <FixturesView />;
}
