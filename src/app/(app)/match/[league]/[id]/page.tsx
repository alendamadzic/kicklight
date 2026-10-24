import type { Metadata } from "next";
import { MatchRemote } from "@/components/remote/match-remote";

export const metadata: Metadata = {
  title: "Remote",
};

export default async function MatchPage(
  props: PageProps<"/match/[league]/[id]">,
) {
  const { league, id } = await props.params;
  return (
    <MatchRemote
      league={decodeURIComponent(league)}
      id={decodeURIComponent(id)}
    />
  );
}
