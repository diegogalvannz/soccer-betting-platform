/**
 * API-Football client (api-sports.io v3)
 * 7,500 requests/day — much more generous than previous sources.
 *
 * All methods cache results in-memory with configurable TTLs.
 * Use the prisma Log table to track daily usage.
 */

const BASE = "https://v3.football.api-sports.io";
const KEY  = process.env.API_FOOTBALL_KEY!;

function headers() {
  return { "x-apisports-key": KEY };
}

// ─── League IDs ───────────────────────────────────────────────────────────────

export const LEAGUE_IDS = {
  PREMIER_LEAGUE:       39,
  LALIGA:              140,
  SERIE_A:             135,
  BUNDESLIGA:           78,
  LIGUE_1:              61,
  PRIMEIRA_LIGA:        94,
  EREDIVISIE:           88,
  PRO_LEAGUE_BELGIUM:  144,
  SUPER_LIG:           203,
  SCOTTISH_PREM:       179,
  CHAMPIONS_LEAGUE:      2,
  EUROPA_LEAGUE:         3,
  CONFERENCE_LEAGUE:   848,
  LIGA_MX:             262,
  MLS:                 253,
  BRASILEIRAO:          71,
  LIGA_ARGENTINA:      128,
  COPA_LIBERTADORES:    13,
  COPA_SUDAMERICANA:    11,
  SAUDI_PRO_LEAGUE:    307,
  UAE_PRO_LEAGUE:      188,
  LEAGUES_CUP:         667,
  CONCACAF_CHAMPIONS:   16,
  GOLD_CUP:             22,
} as const;

export type LeagueId = (typeof LEAGUE_IDS)[keyof typeof LEAGUE_IDS];

// Human-readable names for league IDs
export const LEAGUE_NAMES: Record<number, string> = {
  39:  "Premier League",
  140: "La Liga",
  135: "Serie A",
  78:  "Bundesliga",
  61:  "Ligue 1",
  94:  "Primeira Liga",
  88:  "Eredivisie",
  144: "Pro League Belgium",
  203: "Süper Lig",
  179: "Scottish Premiership",
  2:   "Champions League",
  3:   "Europa League",
  848: "Conference League",
  262: "Liga MX",
  253: "MLS",
  71:  "Brasileirão",
  128: "Liga Profesional Argentina",
  13:  "Copa Libertadores",
  11:  "Copa Sudamericana",
  307: "Saudi Pro League",
  188: "UAE Pro League",
  667: "Leagues Cup",
  16:  "Concacaf Champions Cup",
  22:  "Gold Cup",
};

// ─── Raw API types ─────────────────────────────────────────────────────────────

export type AFFixture = {
  fixture: {
    id: number;
    date: string;   // ISO
    status: { short: string; elapsed: number | null; long: string };
    venue?: { name?: string; city?: string };
  };
  league: { id: number; name: string; country: string; logo?: string; season?: number };
  teams: {
    home: { id: number; name: string; logo?: string; winner?: boolean | null };
    away: { id: number; name: string; logo?: string; winner?: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime:  { home: number | null; away: number | null };
    fulltime:  { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty:   { home: number | null; away: number | null };
  };
};

export type AFStatItem = { type: string; value: string | number | null };

export type AFTeamStats = {
  team: { id: number; name: string };
  statistics: AFStatItem[];
};

export type AFPlayer = {
  player: { id: number; name: string; number: number; pos: string; grid: string | null };
};

export type AFLineup = {
  team: { id: number; name: string; logo?: string };
  formation: string;
  startXI: AFPlayer[];
  substitutes: AFPlayer[];
};

export type AFEvent = {
  time: { elapsed: number; extra: number | null };
  team: { id: number; name: string };
  player: { id: number; name: string };
  assist: { id: number | null; name: string | null };
  type: string;   // "Goal", "Card", "subst", "Var"
  detail: string; // "Normal Goal", "Yellow Card", "Red Card", etc.
  comments: string | null;
};

export type AFOdds = {
  fixture: { id: number };
  bookmakers: Array<{
    id: number;
    name: string;
    bets: Array<{
      id: number;
      name: string;
      values: Array<{ value: string; odd: string }>;
    }>;
  }>;
};

// ─── Core fetch with error handling ──────────────────────────────────────────

async function apiFetch<T = unknown>(
  path: string,
  opts?: { cache?: RequestCache; next?: { revalidate?: number } }
): Promise<{ response: T[]; errors: Record<string, string> | string[]; results: number }> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: headers(),
    cache: opts?.cache ?? "no-store",
    // @ts-expect-error next revalidate
    next: opts?.next,
  });

  if (!res.ok) {
    console.error(`[API-Football] ${res.status} for ${path}`);
    return { response: [], errors: { general: `HTTP ${res.status}` }, results: 0 };
  }

  const data = await res.json();
  return data;
}

// ─── Live Fixtures ────────────────────────────────────────────────────────────

export async function getLiveFixtures(): Promise<AFFixture[]> {
  const data = await apiFetch<AFFixture>("/fixtures?live=all");
  return data.response;
}

// ─── Today's Fixtures (optionally filter by league) ───────────────────────────

export async function getTodayFixtures(leagueIds?: number[]): Promise<AFFixture[]> {
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  if (leagueIds && leagueIds.length === 1) {
    const data = await apiFetch<AFFixture>(
      `/fixtures?date=${today}&league=${leagueIds[0]}&season=${currentYear}`
    );
    return data.response;
  }

  // Fetch all today's fixtures then filter
  const data = await apiFetch<AFFixture>(`/fixtures?date=${today}`);
  if (!leagueIds) return data.response;
  return data.response.filter((f) => leagueIds.includes(f.league.id));
}

// ─── Fixtures by date range for ingestion ─────────────────────────────────────

export async function getFixturesByDateRange(
  leagueId: number,
  season: number,
  fromDate: string,
  toDate: string
): Promise<AFFixture[]> {
  const data = await apiFetch<AFFixture>(
    `/fixtures?league=${leagueId}&season=${season}&from=${fromDate}&to=${toDate}`,
    { next: { revalidate: 3600 } }
  );
  return data.response;
}

// ─── Single fixture by ID ─────────────────────────────────────────────────────

export async function getFixtureById(fixtureId: number): Promise<AFFixture | null> {
  const data = await apiFetch<AFFixture>(`/fixtures?id=${fixtureId}`);
  return data.response[0] ?? null;
}

// ─── Match statistics ─────────────────────────────────────────────────────────

export async function getMatchStatistics(fixtureId: number): Promise<AFTeamStats[]> {
  const data = await apiFetch<AFTeamStats>(`/fixtures/statistics?fixture=${fixtureId}`);
  return data.response;
}

// ─── Lineups ──────────────────────────────────────────────────────────────────

export async function getMatchLineups(fixtureId: number): Promise<AFLineup[]> {
  const data = await apiFetch<AFLineup>(`/fixtures/lineups?fixture=${fixtureId}`);
  return data.response;
}

// ─── Match events ─────────────────────────────────────────────────────────────

export async function getMatchEvents(fixtureId: number): Promise<AFEvent[]> {
  const data = await apiFetch<AFEvent>(`/fixtures/events?fixture=${fixtureId}`);
  return data.response;
}

// ─── Head to Head ─────────────────────────────────────────────────────────────

export async function getH2H(team1Id: number, team2Id: number, last = 5): Promise<AFFixture[]> {
  const data = await apiFetch<AFFixture>(
    `/fixtures/headtohead?h2h=${team1Id}-${team2Id}&last=${last}`,
    { next: { revalidate: 86400 } }  // cache H2H for 24h
  );
  return data.response;
}

// ─── Odds (Match Winner / 1X2) ───────────────────────────────────────────────

export type ParsedOdds = { home: number | null; draw: number | null; away: number | null };

export async function getMatchOdds(fixtureId: number): Promise<ParsedOdds> {
  const data = await apiFetch<AFOdds>(`/odds?fixture=${fixtureId}`, {
    next: { revalidate: 3600 },  // cache odds for 1 hour
  });

  const empty: ParsedOdds = { home: null, draw: null, away: null };
  if (!data.response[0]) return empty;

  // Find "Match Winner" bet (bet id=1) from any bookmaker
  for (const bk of data.response[0].bookmakers) {
    const mw = bk.bets.find((b) => b.id === 1 || b.name === "Match Winner");
    if (!mw) continue;
    const home = parseFloat(mw.values.find((v) => v.value === "Home")?.odd ?? "");
    const draw = parseFloat(mw.values.find((v) => v.value === "Draw")?.odd ?? "");
    const away = parseFloat(mw.values.find((v) => v.value === "Away")?.odd ?? "");
    return {
      home: isNaN(home) ? null : home,
      draw: isNaN(draw) ? null : draw,
      away: isNaN(away) ? null : away,
    };
  }
  return empty;
}

// ─── Team recent form (last N fixtures) ──────────────────────────────────────

export async function getTeamRecentFixtures(teamId: number, last = 5): Promise<AFFixture[]> {
  const data = await apiFetch<AFFixture>(
    `/fixtures?team=${teamId}&last=${last}`,
    { next: { revalidate: 3600 } }
  );
  return data.response;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

/** True if the match is definitively finished (full-time, not just HT) */
export function isFinished(fixture: AFFixture): boolean {
  const s = fixture.fixture.status.short;
  return ["FT", "AET", "PEN"].includes(s);
}

/** True if the match was cancelled / postponed / abandoned */
export function isCancelledOrPostponed(fixture: AFFixture): boolean {
  const s = fixture.fixture.status.short;
  return ["CANC", "PST", "ABD", "AWD", "WO"].includes(s);
}

/** True if the match is currently live */
export function isLive(fixture: AFFixture): boolean {
  const s = fixture.fixture.status.short;
  return ["1H", "HT", "2H", "ET", "BT", "P", "INT"].includes(s);
}

/** Parse stat value from AFStatItem */
export function parseStat(items: AFStatItem[], type: string): number | null {
  const item = items.find(
    (i) => i.type.toLowerCase().includes(type.toLowerCase())
  );
  if (!item || item.value === null) return null;
  if (typeof item.value === "number") return item.value;
  const n = parseFloat(String(item.value).replace("%", ""));
  return isNaN(n) ? null : n;
}
