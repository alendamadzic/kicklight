// The leagues the fixtures page offers, by ESPN slug. Every slug was checked against the
// live API (13 Oct 2026); FotMob matching works off team names, so it needs no slugs.

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
}

export const LEAGUES: League[] = [
  { slug: "eng.1", name: "Premier League", group: "England" },
  { slug: "eng.2", name: "Championship", group: "England" },
  { slug: "eng.fa", name: "FA Cup", group: "England" },
  {
    slug: "eng.league_cup",
    name: "EFL Cup",
    group: "England",
  },
  { slug: "esp.1", name: "La Liga", group: "Spain" },
  { slug: "ger.1", name: "Bundesliga", group: "Germany" },
  { slug: "ita.1", name: "Serie A", group: "Italy" },
  { slug: "fra.1", name: "Ligue 1", group: "France" },
  { slug: "ned.1", name: "Eredivisie", group: "Rest" },
  { slug: "por.1", name: "Primeira Liga", group: "Rest" },
  {
    slug: "sco.1",
    name: "Scottish Premiership",
    group: "Rest",
  },
  { slug: "usa.1", name: "MLS", group: "Rest" },
  {
    slug: "uefa.champions",
    name: "Champions League",
    group: "Europe",
  },
  {
    slug: "uefa.europa",
    name: "Europa League",
    group: "Europe",
  },
  {
    slug: "uefa.europa.conf",
    name: "Conference League",
    group: "Europe",
  },
  {
    slug: "uefa.euro",
    name: "European Championship",
    group: "International",
  },
  {
    slug: "fifa.world",
    name: "World Cup",
    group: "International",
  },
];

export const leagueName = (slug: string) =>
  LEAGUES.find((l) => l.slug === slug)?.name ?? slug;
