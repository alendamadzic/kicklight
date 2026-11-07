import type { Metadata } from "next";
import { Suspense } from "react";
import { DataSeed } from "@/components/data/data-seed";
import { FixturesView } from "@/components/fixtures/fixtures-view";
import { fixturesKey } from "@/lib/swr-keys";
import { getFixtures } from "@/server/match-data";
import { visitorDay } from "@/server/visitor";

export const metadata: Metadata = {
  title: "Matches",
  description: "Today's fixtures, your teams first.",
};

/** The page shell is static; today's fixtures stream into it from the shared cache. */
export default function MatchesPage() {
  return (
    <Suspense fallback={<FixturesView />}>
      <SeededFixtures />
    </Suspense>
  );
}

async function SeededFixtures() {
  const { today, timeZone } = await visitorDay();
  const fixtures = await getFixtures(today).catch(() => null);
  return (
    <DataSeed
      today={today}
      timeZone={timeZone}
      entries={
        fixtures
          ? [[fixturesKey(today), { ...fixtures, source: "api", reason: null }]]
          : []
      }
    >
      <FixturesView />
    </DataSeed>
  );
}
