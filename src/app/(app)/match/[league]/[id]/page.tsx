import type { Metadata } from "next";
import { Suspense } from "react";
import { DataSeed } from "@/components/data/data-seed";
import {
  MatchRemote,
  MatchRemoteSkeleton,
} from "@/components/remote/match-remote";
import { REPLAY_LEAGUE } from "@/lib/sample-data";
import { matchKey } from "@/lib/swr-keys";
import { getMatch } from "@/server/match-data";
import { isKnownLeague } from "@/server/validate";
import { visitorDay } from "@/server/visitor";

export const metadata: Metadata = {
  title: "Remote",
};

type Props = PageProps<"/match/[league]/[id]">;

export default function MatchPage(props: Props) {
  return (
    <Suspense fallback={<MatchRemoteSkeleton />}>
      <Match params={props.params} />
    </Suspense>
  );
}

/** The match streams in from the shared cache; scripted replays load in the browser. */
async function Match({ params }: { params: Props["params"] }) {
  const p = await params;
  const league = decodeURIComponent(p.league);
  const id = decodeURIComponent(p.id);
  const { today, timeZone } = await visitorDay();
  const feedMatch =
    league !== REPLAY_LEAGUE && isKnownLeague(league) && /^\d{1,12}$/.test(id);
  const match = feedMatch ? await getMatch(league, id).catch(() => null) : null;
  return (
    <DataSeed
      today={today}
      timeZone={timeZone}
      entries={match ? [[matchKey(league, id), { match, source: "api" }]] : []}
    >
      <MatchRemote league={league} id={id} />
    </DataSeed>
  );
}
