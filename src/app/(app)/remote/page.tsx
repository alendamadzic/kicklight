import type { Metadata } from "next";
import { Suspense } from "react";
import { DataSeed } from "@/components/data/data-seed";
import { RemoteTab } from "@/components/remote/remote-tab";
import { shiftDateKey } from "@/lib/format";
import { fixturesKey } from "@/lib/swr-keys";
import { getFixtures } from "@/server/match-data";
import { visitorDay } from "@/server/visitor";

export const metadata: Metadata = {
  title: "Remote",
};

/** With nothing live, the tab shows your teams' next match: today's and tomorrow's fixtures. */
export default function RemotePage() {
  return (
    <Suspense fallback={<RemoteTab />}>
      <SeededRemote />
    </Suspense>
  );
}

async function SeededRemote() {
  const { today, timeZone } = await visitorDay();
  const days = [today, shiftDateKey(today, 1)];
  const fixtures = await Promise.all(
    days.map((d) => getFixtures(d).catch(() => null)),
  );
  return (
    <DataSeed
      today={today}
      timeZone={timeZone}
      entries={days.flatMap((d, i) => {
        const f = fixtures[i];
        return f
          ? [[fixturesKey(d), { ...f, source: "api", reason: null }] as const]
          : [];
      })}
    >
      <RemoteTab />
    </DataSeed>
  );
}
