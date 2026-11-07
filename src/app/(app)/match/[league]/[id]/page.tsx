import type { Metadata } from "next";
import { Suspense } from "react";
import {
  MatchRemote,
  MatchRemoteSkeleton,
} from "@/components/remote/match-remote";

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

async function Match({ params }: { params: Props["params"] }) {
  const { league, id } = await params;
  return (
    <MatchRemote
      league={decodeURIComponent(league)}
      id={decodeURIComponent(id)}
    />
  );
}
