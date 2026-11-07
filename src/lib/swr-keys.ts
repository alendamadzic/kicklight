// SWR keys shared by the client hooks and the server components that seed them, so the
// server's answer lands in exactly the cache entry the hook reads.

/** One day's fixtures, YYYYMMDD. */
export const fixturesKey = (date: string) => ["fixtures", date] as const;

/** One match's preview. */
export const matchKey = (league: string, id: string) =>
  ["match", league, id] as const;
