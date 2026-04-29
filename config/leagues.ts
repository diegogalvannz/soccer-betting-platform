import { League } from "@/types";

export const TRACKED_LEAGUES: League[] = [
  { code: "PL",  name: "Premier League",   country: "England",     footballDataId: 2021 },
  { code: "PD",  name: "La Liga",          country: "Spain",       footballDataId: 2014 },
  { code: "BL1", name: "Bundesliga",       country: "Germany",     footballDataId: 2002 },
  { code: "SA",  name: "Serie A",          country: "Italy",       footballDataId: 2019 },
  { code: "FL1", name: "Ligue 1",          country: "France",      footballDataId: 2015 },
  { code: "CL",  name: "Champions League", country: "Europe",      footballDataId: 2001 },
];

export const MIN_AMERICAN_ODDS = -200;
export const MIN_DECIMAL_ODDS = 1.5;
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
