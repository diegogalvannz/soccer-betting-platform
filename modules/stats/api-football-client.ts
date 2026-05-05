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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next: opts?.next as any,
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
    next: { revalidate: 3600 },
  });

  const empty: ParsedOdds = { home: null, draw: null, away: null };
  if (!data.response[0]) return empty;

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

// ─── Expanded odds — all markets in one call ──────────────────────────────────

export type OverUnderLine = {
  line: number;
  overOdds: number;
  underOdds: number;
};

export type ExpandedOdds = {
  // 1X2
  homeOdds:    number | null;
  drawOdds:    number | null;
  awayOdds:    number | null;
  // Double Chance
  dc1xOdds:    number | null; // Home or Draw
  dcX2Odds:    number | null; // Away or Draw
  dc12Odds:    number | null; // Home or Away
  // BTTS
  bttsYesOdds: number | null;
  bttsNoOdds:  number | null;
  // Goals Over/Under (all lines found)
  goalsLines:  OverUnderLine[];
  // Cards Over/Under (if available)
  cardsLines:  OverUnderLine[];
};

function parseOddsValue(values: Array<{ value: string; odd: string }>, label: string): number | null {
  const v = values.find((x) => x.value.toLowerCase() === label.toLowerCase());
  if (!v) return null;
  const n = parseFloat(v.odd);
  return isNaN(n) ? null : n;
}

function parseOverUnderLines(
  values: Array<{ value: string; odd: string }>
): OverUnderLine[] {
  const lines: Map<number, { over?: number; under?: number }> = new Map();

  for (const v of values) {
    // e.g. "Over 2.5" or "Under 2.5"
    const m = v.value.match(/^(Over|Under)\s+(\d+\.?\d*)/i);
    if (!m) continue;
    const direction = m[1].toLowerCase();
    const line      = parseFloat(m[2]);
    const odd       = parseFloat(v.odd);
    if (isNaN(line) || isNaN(odd)) continue;

    if (!lines.has(line)) lines.set(line, {});
    const entry = lines.get(line)!;
    if (direction === "over")  entry.over  = odd;
    else                       entry.under = odd;
  }

  return Array.from(lines.entries())
    .filter(([, e]) => e.over !== undefined && e.under !== undefined)
    .map(([line, e]) => ({ line, overOdds: e.over!, underOdds: e.under! }))
    .sort((a, b) => a.line - b.line);
}

/**
 * Fetches all available odds markets for a fixture in a single API call.
 * Extracts: 1X2, Double Chance, BTTS, Goals Over/Under, Cards Over/Under.
 */
export async function getExpandedOdds(fixtureId: number): Promise<ExpandedOdds> {
  const empty: ExpandedOdds = {
    homeOdds: null, drawOdds: null, awayOdds: null,
    dc1xOdds: null, dcX2Odds: null, dc12Odds: null,
    bttsYesOdds: null, bttsNoOdds: null,
    goalsLines: [], cardsLines: [],
  };

  let data: Awaited<ReturnType<typeof apiFetch<AFOdds>>>;
  try {
    data = await apiFetch<AFOdds>(`/odds?fixture=${fixtureId}`, {
      next: { revalidate: 3600 },
    });
  } catch {
    return empty;
  }

  if (!data.response[0]) return empty;

  const result = { ...empty };

  for (const bk of data.response[0].bookmakers) {
    for (const bet of bk.bets) {
      const name = bet.name.toLowerCase();
      const vals = bet.values;

      // 1X2 Match Winner
      if ((bet.id === 1 || name.includes("match winner")) && result.homeOdds === null) {
        result.homeOdds = parseOddsValue(vals, "Home");
        result.drawOdds = parseOddsValue(vals, "Draw");
        result.awayOdds = parseOddsValue(vals, "Away");
      }

      // Double Chance
      if ((bet.id === 4 || name.includes("double chance")) && result.dc1xOdds === null) {
        result.dc1xOdds = parseOddsValue(vals, "Home/Draw") ?? parseOddsValue(vals, "1X");
        result.dcX2Odds = parseOddsValue(vals, "Draw/Away") ?? parseOddsValue(vals, "X2");
        result.dc12Odds = parseOddsValue(vals, "Home/Away") ?? parseOddsValue(vals, "12");
      }

      // Both Teams Score
      if ((bet.id === 8 || name.includes("both teams") || name.includes("btts")) && result.bttsYesOdds === null) {
        result.bttsYesOdds = parseOddsValue(vals, "Yes");
        result.bttsNoOdds  = parseOddsValue(vals, "No");
      }

      // Goals Over/Under
      if (
        (bet.id === 5 || name.includes("goals over") || name === "goals over/under") &&
        result.goalsLines.length === 0
      ) {
        result.goalsLines = parseOverUnderLines(vals);
      }

      // Cards Over/Under (bet id varies by bookmaker — scan by name)
      if (
        (name.includes("card") && (name.includes("over") || name.includes("under") || name.includes("total"))) &&
        result.cardsLines.length === 0
      ) {
        result.cardsLines = parseOverUnderLines(vals);
      }
    }
  }

  return result;
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
