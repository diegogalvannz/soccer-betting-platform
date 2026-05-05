import { League } from "@/types";

/**
 * Full league catalogue.
 *
 * source="football-data" → ingested via Football-Data.org free tier (v4).
 * source="coming-soon"   → shown on UI but not yet ingested (RapidAPI or future).
 *
 * FD.org free-tier competition codes:
 *   PL=Premier League, BL1=Bundesliga, SA=Serie A, PD=La Liga,
 *   FL1=Ligue 1, DED=Eredivisie, PPL=Primeira Liga, CL=Champions League,
 *   WC=FIFA World Cup, EC=UEFA Euro, ELC=Championship,
 *   BSA=Brasileirão, CLI=Copa Libertadores
 */

// ─── Ligas Nacionales Europa ───────────────────────────────────────────────────
const EUROPE_NATIONAL: League[] = [
  { code: "PL",   name: "Premier League",          country: "Inglaterra",  region: "Europa – Ligas", source: "football-data", footballDataId: 2021 },
  { code: "PD",   name: "LaLiga",                  country: "España",      region: "Europa – Ligas", source: "football-data", footballDataId: 2014 },
  { code: "SA",   name: "Serie A",                 country: "Italia",      region: "Europa – Ligas", source: "football-data", footballDataId: 2019 },
  { code: "BL1",  name: "Bundesliga",              country: "Alemania",    region: "Europa – Ligas", source: "football-data", footballDataId: 2002 },
  { code: "FL1",  name: "Ligue 1",                 country: "Francia",     region: "Europa – Ligas", source: "football-data", footballDataId: 2015 },
  { code: "PPL",  name: "Primeira Liga",           country: "Portugal",    region: "Europa – Ligas", source: "football-data", footballDataId: 2017 },
  { code: "DED",  name: "Eredivisie",              country: "Países Bajos",region: "Europa – Ligas", source: "football-data", footballDataId: 2003 },
  { code: "ELC",  name: "Championship",            country: "Inglaterra",  region: "Europa – Ligas", source: "football-data", footballDataId: 2016 },
  { code: "BSA",  name: "Pro League Bélgica",      country: "Bélgica",     region: "Europa – Ligas", source: "coming-soon" },
  { code: "SL",   name: "Süper Lig",               country: "Turquía",     region: "Europa – Ligas", source: "coming-soon" },
  { code: "GSL",  name: "Super League Grecia",     country: "Grecia",      region: "Europa – Ligas", source: "coming-soon" },
  { code: "SPR",  name: "Scottish Premiership",    country: "Escocia",     region: "Europa – Ligas", source: "coming-soon" },
  { code: "SSL",  name: "Swiss Super League",      country: "Suiza",       region: "Europa – Ligas", source: "coming-soon" },
  { code: "ABL",  name: "Bundesliga Austria",      country: "Austria",     region: "Europa – Ligas", source: "coming-soon" },
  { code: "EKS",  name: "Ekstraklasa",             country: "Polonia",     region: "Europa – Ligas", source: "coming-soon" },
  { code: "FCL",  name: "Primera Liga Checa",      country: "Rep. Checa",  region: "Europa – Ligas", source: "coming-soon" },
  { code: "RPL",  name: "Premier League Rusia",    country: "Rusia",       region: "Europa – Ligas", source: "coming-soon" },
  { code: "UPL",  name: "Premier League Ucrania",  country: "Ucrania",     region: "Europa – Ligas", source: "coming-soon" },
  { code: "ALL",  name: "Allsvenskan",             country: "Suecia",      region: "Europa – Ligas", source: "coming-soon" },
  { code: "ELT",  name: "Eliteserien",             country: "Noruega",     region: "Europa – Ligas", source: "coming-soon" },
  { code: "SLD",  name: "Superliga Dinamarca",     country: "Dinamarca",   region: "Europa – Ligas", source: "coming-soon" },
  { code: "VLG",  name: "Veikkausliiga",           country: "Finlandia",   region: "Europa – Ligas", source: "coming-soon" },
  { code: "HNL",  name: "HNL",                     country: "Croacia",     region: "Europa – Ligas", source: "coming-soon" },
  { code: "SSL2", name: "SuperLiga Serbia",        country: "Serbia",      region: "Europa – Ligas", source: "coming-soon" },
  { code: "LIG1", name: "Liga I",                  country: "Rumanía",     region: "Europa – Ligas", source: "coming-soon" },
  { code: "BFL",  name: "First League Bulgaria",   country: "Bulgaria",    region: "Europa – Ligas", source: "coming-soon" },
  { code: "HNB1", name: "OTP Bank Liga",           country: "Hungría",     region: "Europa – Ligas", source: "coming-soon" },
];

// ─── Competiciones Europeas de Clubes ─────────────────────────────────────────
const EUROPE_CLUBS: League[] = [
  { code: "CL",   name: "UEFA Champions League",   country: "Europa",  region: "Europa – Clubes", source: "football-data", footballDataId: 2001 },
  { code: "EL",   name: "UEFA Europa League",      country: "Europa",  region: "Europa – Clubes", source: "coming-soon" },
  { code: "UECL", name: "UEFA Conference League",  country: "Europa",  region: "Europa – Clubes", source: "coming-soon" },
  { code: "USC",  name: "UEFA Super Cup",          country: "Europa",  region: "Europa – Clubes", source: "coming-soon" },
  { code: "CWC",  name: "FIFA Club World Cup",     country: "Mundial", region: "Europa – Clubes", source: "coming-soon" },
];

// ─── Selecciones Europeas ──────────────────────────────────────────────────────
const EUROPE_NATIONAL_TEAMS: League[] = [
  { code: "EC",   name: "UEFA Eurocopa",           country: "Europa",  region: "Europa – Selecciones", source: "football-data", footballDataId: 2018 },
  { code: "UNL",  name: "UEFA Nations League",     country: "Europa",  region: "Europa – Selecciones", source: "coming-soon" },
  { code: "WCQ",  name: "Clasificación Mundial UEFA", country: "Europa", region: "Europa – Selecciones", source: "coming-soon" },
];

// ─── México ───────────────────────────────────────────────────────────────────
const MEXICO: League[] = [
  { code: "LMX",  name: "Liga MX",                 country: "México",  region: "México", source: "coming-soon" },
  { code: "EXP",  name: "Liga de Expansión MX",    country: "México",  region: "México", source: "coming-soon" },
  { code: "LMF",  name: "Liga MX Femenil",         country: "México",  region: "México", source: "coming-soon" },
  { code: "CCM",  name: "Campeón de Campeones",    country: "México",  region: "México", source: "coming-soon" },
  { code: "SMX",  name: "Supercopa MX",            country: "México",  region: "México", source: "coming-soon" },
];

// ─── USA y Canadá ─────────────────────────────────────────────────────────────
const USA_CANADA: League[] = [
  { code: "MLS",  name: "MLS",                     country: "USA/Canadá", region: "USA y Canadá", source: "coming-soon" },
  { code: "USL",  name: "USL Championship",        country: "USA",        region: "USA y Canadá", source: "coming-soon" },
  { code: "USL1", name: "USL League One",          country: "USA",        region: "USA y Canadá", source: "coming-soon" },
  { code: "MNP",  name: "MLS Next Pro",            country: "USA",        region: "USA y Canadá", source: "coming-soon" },
  { code: "USC",  name: "US Open Cup",             country: "USA",        region: "USA y Canadá", source: "coming-soon" },
  { code: "LGC",  name: "Leagues Cup",             country: "USA/México", region: "USA y Canadá", source: "coming-soon" },
  { code: "CPL",  name: "Canadian Premier League", country: "Canadá",     region: "USA y Canadá", source: "coming-soon" },
  { code: "CCH",  name: "Canadian Championship",   country: "Canadá",     region: "USA y Canadá", source: "coming-soon" },
];

// ─── América del Sur – Ligas ──────────────────────────────────────────────────
const SOUTH_AMERICA_NATIONAL: League[] = [
  { code: "BSA",  name: "Brasileirão Serie A",     country: "Brasil",    region: "América del Sur – Ligas", source: "football-data", footballDataId: 2013 },
  { code: "ARG",  name: "Liga Profesional Argentina", country: "Argentina", region: "América del Sur – Ligas", source: "coming-soon" },
  { code: "CHI",  name: "Primera División Chile",  country: "Chile",     region: "América del Sur – Ligas", source: "coming-soon" },
  { code: "COL",  name: "Liga BetPlay Colombia",   country: "Colombia",  region: "América del Sur – Ligas", source: "coming-soon" },
  { code: "ECU",  name: "LigaPro Ecuador",         country: "Ecuador",   region: "América del Sur – Ligas", source: "coming-soon" },
  { code: "PER",  name: "Liga 1 Perú",             country: "Perú",      region: "América del Sur – Ligas", source: "coming-soon" },
  { code: "URU",  name: "Primera División Uruguay", country: "Uruguay",   region: "América del Sur – Ligas", source: "coming-soon" },
  { code: "PAR",  name: "División Profesional Paraguay", country: "Paraguay", region: "América del Sur – Ligas", source: "coming-soon" },
  { code: "BOL",  name: "División Profesional Bolivia", country: "Bolivia",  region: "América del Sur – Ligas", source: "coming-soon" },
  { code: "VEN",  name: "Primera División Venezuela", country: "Venezuela", region: "América del Sur – Ligas", source: "coming-soon" },
];

// ─── América del Sur – Internacional ─────────────────────────────────────────
const SOUTH_AMERICA_INTL: League[] = [
  { code: "CLI",  name: "Copa Libertadores",       country: "América del Sur", region: "América del Sur – Internacional", source: "football-data", footballDataId: 2152 },
  { code: "CSA",  name: "Copa Sudamericana",       country: "América del Sur", region: "América del Sur – Internacional", source: "coming-soon" },
  { code: "RSA",  name: "Recopa Sudamericana",     country: "América del Sur", region: "América del Sur – Internacional", source: "coming-soon" },
  { code: "CA",   name: "Copa América",            country: "América del Sur", region: "América del Sur – Internacional", source: "coming-soon" },
  { code: "WCQ2", name: "Clasif. Mundial CONMEBOL", country: "América del Sur", region: "América del Sur – Internacional", source: "coming-soon" },
];

// ─── CONCACAF ─────────────────────────────────────────────────────────────────
const CONCACAF: League[] = [
  { code: "CCL",  name: "Concacaf Champions Cup",  country: "CONCACAF", region: "CONCACAF", source: "coming-soon" },
  { code: "CAC",  name: "Concacaf Central American Cup", country: "CONCACAF", region: "CONCACAF", source: "coming-soon" },
  { code: "CCB",  name: "Concacaf Caribbean Cup",  country: "CONCACAF", region: "CONCACAF", source: "coming-soon" },
  { code: "GC",   name: "Gold Cup",                country: "CONCACAF", region: "CONCACAF", source: "coming-soon" },
  { code: "CNL",  name: "Concacaf Nations League", country: "CONCACAF", region: "CONCACAF", source: "coming-soon" },
];

// ─── Medio Oriente ────────────────────────────────────────────────────────────
const MIDDLE_EAST: League[] = [
  { code: "SPL",  name: "Saudi Pro League",        country: "Arabia Saudí",  region: "Medio Oriente", source: "coming-soon" },
  { code: "KC",   name: "King Cup Arabia Saudí",   country: "Arabia Saudí",  region: "Medio Oriente", source: "coming-soon" },
  { code: "UAPL", name: "UAE Pro League",          country: "EAU",           region: "Medio Oriente", source: "coming-soon" },
  { code: "QSL",  name: "Qatar Stars League",      country: "Qatar",         region: "Medio Oriente", source: "coming-soon" },
  { code: "ISL",  name: "Iraq Stars League",       country: "Irak",          region: "Medio Oriente", source: "coming-soon" },
  { code: "IPGL", name: "Persian Gulf Pro League", country: "Irán",          region: "Medio Oriente", source: "coming-soon" },
  { code: "JPL",  name: "Jordanian Pro League",    country: "Jordania",      region: "Medio Oriente", source: "coming-soon" },
  { code: "KPL",  name: "Kuwait Premier League",   country: "Kuwait",        region: "Medio Oriente", source: "coming-soon" },
];

// ─── Copas Nacionales ─────────────────────────────────────────────────────────
const NATIONAL_CUPS: League[] = [
  { code: "FAC",  name: "FA Cup",                  country: "Inglaterra",  region: "Copas Nacionales", source: "coming-soon" },
  { code: "EFL",  name: "EFL Cup",                 country: "Inglaterra",  region: "Copas Nacionales", source: "coming-soon" },
  { code: "CDR",  name: "Copa del Rey",            country: "España",      region: "Copas Nacionales", source: "coming-soon" },
  { code: "SCE",  name: "Supercopa de España",     country: "España",      region: "Copas Nacionales", source: "coming-soon" },
  { code: "CI",   name: "Coppa Italia",            country: "Italia",      region: "Copas Nacionales", source: "coming-soon" },
  { code: "SCI",  name: "Supercoppa Italiana",     country: "Italia",      region: "Copas Nacionales", source: "coming-soon" },
  { code: "DFB",  name: "DFB-Pokal",              country: "Alemania",    region: "Copas Nacionales", source: "coming-soon" },
  { code: "CDF",  name: "Coupe de France",         country: "Francia",     region: "Copas Nacionales", source: "coming-soon" },
  { code: "TCP",  name: "Taça de Portugal",        country: "Portugal",    region: "Copas Nacionales", source: "coming-soon" },
  { code: "KNVB", name: "KNVB Beker",             country: "Países Bajos",region: "Copas Nacionales", source: "coming-soon" },
];

// ─── Torneos FIFA ─────────────────────────────────────────────────────────────
const FIFA: League[] = [
  { code: "WC",   name: "FIFA World Cup",          country: "Mundial",  region: "FIFA", source: "football-data", footballDataId: 2000 },
  { code: "WWC",  name: "FIFA Women's World Cup",  country: "Mundial",  region: "FIFA", source: "coming-soon" },
  { code: "FU20", name: "FIFA U-20 World Cup",     country: "Mundial",  region: "FIFA", source: "coming-soon" },
  { code: "FU17", name: "FIFA U-17 World Cup",     country: "Mundial",  region: "FIFA", source: "coming-soon" },
  { code: "FCWC", name: "FIFA Club World Cup",     country: "Mundial",  region: "FIFA", source: "coming-soon" },
  { code: "FIC",  name: "FIFA Intercontinental Cup", country: "Mundial", region: "FIFA", source: "coming-soon" },
  { code: "OLY",  name: "Olympic Football",        country: "Mundial",  region: "FIFA", source: "coming-soon" },
];

// ─── Combined export ──────────────────────────────────────────────────────────

/** All leagues shown in the UI (including coming-soon ones). */
export const ALL_LEAGUES: League[] = [
  ...EUROPE_NATIONAL,
  ...EUROPE_CLUBS,
  ...EUROPE_NATIONAL_TEAMS,
  ...MEXICO,
  ...USA_CANADA,
  ...SOUTH_AMERICA_NATIONAL,
  ...SOUTH_AMERICA_INTL,
  ...CONCACAF,
  ...MIDDLE_EAST,
  ...NATIONAL_CUPS,
  ...FIFA,
];

/** Only leagues actively ingested from Football-Data.org. */
export const TRACKED_LEAGUES: League[] = ALL_LEAGUES.filter(
  (l) => l.source === "football-data" && l.footballDataId
);

/** Grouped by region for the UI. */
export const LEAGUES_BY_REGION: Record<string, League[]> = ALL_LEAGUES.reduce(
  (acc, league) => {
    if (!acc[league.region]) acc[league.region] = [];
    acc[league.region].push(league);
    return acc;
  },
  {} as Record<string, League[]>
);

export const REGIONS = Object.keys(LEAGUES_BY_REGION);

// ─── Betting constants ────────────────────────────────────────────────────────
export const MIN_AMERICAN_ODDS = -200;
export const MIN_DECIMAL_ODDS = 1.5;

/**
 * Minimum confidence score required to save a pick.
 * Primary threshold: 62. Fallback threshold: 60 (used only when fewer than
 * MIN_PICKS_PER_RUN picks have been generated to meet the daily minimum).
 */
export const MIN_CONFIDENCE_THRESHOLD = 62;

export const SCORING_WEIGHTS = {
  form: 0.30,
  headToHead: 0.20,
  homeAway: 0.15,
  oddsValue: 0.20,
  sentiment: 0.10,
  news: 0.05,
} as const;

export const ODDS_CACHE_MAX_AGE_HOURS = 6;
export const FIXTURES_CACHE_MAX_AGE_HOURS = 2;
export const FOOTBALL_DATA_DELAY_MS = 7000;
export const RAPIDAPI_MONTHLY_LIMIT = 100;
