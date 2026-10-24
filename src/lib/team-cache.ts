// A small id -> team cache in local storage, filled as fixtures load, so settings can show
// names and colours for followed team ids without asking the feed again.

export interface CachedTeam {
  id: string;
  name: string;
  short: string;
  color: string;
  /** Second kit colour, once a match summary has shown it (fixture lists don't carry it). */
  alternateColor?: string;
}

const KEY = "kl:teams";

export function knownTeams(): Record<string, CachedTeam> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<
      string,
      CachedTeam
    >;
  } catch {
    return {};
  }
}

export function rememberTeams(teams: readonly CachedTeam[]) {
  try {
    const cur = knownTeams();
    for (const t of teams)
      cur[t.id] = {
        id: t.id,
        name: t.name,
        short: t.short,
        color: t.color,
        alternateColor: t.alternateColor ?? cur[t.id]?.alternateColor,
      };
    localStorage.setItem(KEY, JSON.stringify(cur));
  } catch {
    // Storage can be blocked; the cache is a nicety.
  }
}
