// ESPN league slugs. Only `eng.1` has been verified against the live API so far;
// the rest follow ESPN's naming and are confirmed by the Phase 0 spike
// (see TASKS.md) before the picker ships.

export interface League {
  slug: string;
  name: string;
  group:
    | "England"
    | "Europe"
    | "Spain"
    | "Germany"
    | "Italy"
    | "France"
    | "Rest"
    | "International";
  verified: boolean;
}

export const LEAGUES: League[] = [
  { slug: "eng.1", name: "Premier League", group: "England", verified: true },
  { slug: "eng.2", name: "Championship", group: "England", verified: false },
  { slug: "eng.fa", name: "FA Cup", group: "England", verified: false },
  {
    slug: "eng.league_cup",
    name: "EFL Cup",
    group: "England",
    verified: false,
  },
  { slug: "esp.1", name: "La Liga", group: "Spain", verified: false },
  { slug: "ger.1", name: "Bundesliga", group: "Germany", verified: false },
  { slug: "ita.1", name: "Serie A", group: "Italy", verified: false },
  { slug: "fra.1", name: "Ligue 1", group: "France", verified: false },
  { slug: "ned.1", name: "Eredivisie", group: "Rest", verified: false },
  { slug: "por.1", name: "Primeira Liga", group: "Rest", verified: false },
  {
    slug: "sco.1",
    name: "Scottish Premiership",
    group: "Rest",
    verified: false,
  },
  { slug: "usa.1", name: "MLS", group: "Rest", verified: false },
  {
    slug: "uefa.champions",
    name: "Champions League",
    group: "Europe",
    verified: false,
  },
  {
    slug: "uefa.europa",
    name: "Europa League",
    group: "Europe",
    verified: false,
  },
  {
    slug: "uefa.europa.conf",
    name: "Conference League",
    group: "Europe",
    verified: false,
  },
  {
    slug: "uefa.euro",
    name: "European Championship",
    group: "International",
    verified: false,
  },
  {
    slug: "fifa.world",
    name: "World Cup",
    group: "International",
    verified: false,
  },
];

export const leagueName = (slug: string) =>
  LEAGUES.find((l) => l.slug === slug)?.name ?? slug;
