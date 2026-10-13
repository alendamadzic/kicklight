import type { Metadata } from "next";
import { FixturesView } from "@/components/fixtures/FixturesView";

export const metadata: Metadata = {
  title: "Matches",
  description: "Today's fixtures, your teams first.",
};

export default function FixturesPage() {
  return <FixturesView />;
}
