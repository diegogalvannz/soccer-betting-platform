import { NextResponse } from "next/server";
import { fetchAndCacheLiveMatches, getMatchById, getCache, secondsUntilRefresh } from "@/lib/rapidapi-cache";
import { prisma } from "@/lib/prisma";

export type TeamForm = { result: "W" | "D" | "L"; score: string; opponent: string; isHome: boolean };

export type H2HMatch = {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition: string;
};

export type MatchStats = {
  possession: { home: number | null; away: number | null };
  shots: { home: number | null; away: number | null };
  shotsOnTarget: { home: number | null; away: number | null };
  corners: { home: number | null; away: number | null };
  fouls: { home: number | null; away: number | null };
  yellowCards: { home: number | null; away: number | null };
  redCards: { home: number | null; away: number | null };
  offsides: { home: number | null; away: number | null };
  passes: { home: number | null; away: number | null };
  attacks: { home: number | null; away: number | null };
};

export type Player = {
  name: string;
  number: number | null;
  position: string | null; // GK, DEF, MID, FWD
  positionIndex?: number;  // ordering within position group
};

export type Lineup = {
  formation: string | null;
  startingXI: Player[];
  substitutes: Player[];
};

export type LiveMatchDetail = {
  id: number;
  homeTeam: string;
  homeTeamId: number;
  awayTeam: string;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  minute: string;
  minuteLong: string;
  period: string;
  homeRedCards: number;
  awayRedCards: number;
  isOngoing: boolean;
  utcTime: string;
  cachedAt: string;
  // Supplemental
  homeForm: TeamForm[];
  awayForm: TeamForm[];
  h2h: H2HMatch[];
  competition: string;
  source: "live" | "cache" | "error";
  nextRefreshIn: number;
  monthlyCallsUsed: number;
  // Extended data
  stats: MatchStats;
  homeLineup: Lineup;
  awayLineup: Lineup;
};

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getTeamForm(teamName: string): Promise<TeamForm[]> {
  try {
    const team = await prisma.team.findFirst({
      where: {
        OR: [
          { name: { equals: teamName, mode: "insensitive" } },
          { shortName: { equals: teamName, mode: "insensitive" } },
          { name: { contains: teamName.split(" ")[0], mode: "insensitive" } },
        ],
      },
    });
    if (!team) return [];

    const matches = await prisma.match.findMany({
      where: {
        status: "FINISHED",
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
      },
      orderBy: { matchDate: "desc" },
      take: 5,
    });

    return matches.map((m) => {
      const isHome = m.homeTeamId === team.id;
      const homeGoals = m.homeScore ?? 0;
      const awayGoals = m.awayScore ?? 0;
      const scored = isHome ? homeGoals : awayGoals;
      const conceded = isHome ? awayGoals : homeGoals;
      const result: "W" | "D" | "L" =
        scored > conceded ? "W" : scored === conceded ? "D" : "L";
      const opponent = isHome
        ? (m.awayTeam.shortName ?? m.awayTeam.name)
        : (m.homeTeam.shortName ?? m.homeTeam.name);
      return { result, score: `${scored}-${conceded}`, opponent, isHome };
    });
  } catch {
    return [];
  }
}

async function getH2HFromDB(homeTeamName: string, awayTeamName: string): Promise<H2HMatch[]> {
  try {
    const [homeTeam, awayTeam] = await Promise.all([
      prisma.team.findFirst({
        where: {
          OR: [
            { name: { equals: homeTeamName, mode: "insensitive" } },
            { name: { contains: homeTeamName.split(" ")[0], mode: "insensitive" } },
          ],
        },
      }),
      prisma.team.findFirst({
        where: {
          OR: [
            { name: { equals: awayTeamName, mode: "insensitive" } },
            { name: { contains: awayTeamName.split(" ")[0], mode: "insensitive" } },
          ],
        },
      }),
    ]);

    if (!homeTeam || !awayTeam) return [];

    const matches = await prisma.match.findMany({
      where: {
        status: "FINISHED",
        OR: [
          { homeTeamId: homeTeam.id, awayTeamId: awayTeam.id },
          { homeTeamId: awayTeam.id, awayTeamId: homeTeam.id },
        ],
      },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
      },
      orderBy: { matchDate: "desc" },
      take: 5,
    });

    return matches.map((m) => ({
      date: m.matchDate.toISOString().slice(0, 10),
      homeTeam: m.homeTeam.shortName ?? m.homeTeam.name,
      awayTeam: m.awayTeam.shortName ?? m.awayTeam.name,
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      competition: m.league,
    }));
  } catch {
    return [];
  }
}

// ─── RapidAPI helpers ─────────────────────────────────────────────────────────

const RAPIDAPI_BASE = "https://free-api-live-football-data.p.rapidapi.com";

function rapidHeaders() {
  return {
    "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
    "x-rapidapi-host": process.env.RAPIDAPI_HOST ?? "free-api-live-football-data.p.rapidapi.com",
  };
}

const EMPTY_STATS: MatchStats = {
  possession:    { home: null, away: null },
  shots:         { home: null, away: null },
  shotsOnTarget: { home: null, away: null },
  corners:       { home: null, away: null },
  fouls:         { home: null, away: null },
  yellowCards:   { home: null, away: null },
  redCards:      { home: null, away: null },
  offsides:      { home: null, away: null },
  passes:        { home: null, away: null },
  attacks:       { home: null, away: null },
};

const EMPTY_LINEUP: Lineup = { formation: null, startingXI: [], substitutes: [] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseStats(home: any[], away: any[]): MatchStats {
  const get = (arr: any[], key: string): number | null => {
    const item = arr?.find((s: any) =>
      String(s.name ?? s.type ?? "").toLowerCase().includes(key.toLowerCase())
    );
    if (!item) return null;
    const val = item.value ?? item.stats ?? item.stat ?? 0;
    if (typeof val === "string") {
      const n = parseFloat(val.replace("%", ""));
      return isNaN(n) ? null : n;
    }
    return typeof val === "number" ? val : null;
  };

  return {
    possession:    { home: get(home, "possession"), away: get(away, "possession") },
    shots:         { home: get(home, "total shot"),  away: get(away, "total shot") },
    shotsOnTarget: { home: get(home, "on target"),   away: get(away, "on target") },
    corners:       { home: get(home, "corner"),      away: get(away, "corner") },
    fouls:         { home: get(home, "foul"),        away: get(away, "foul") },
    yellowCards:   { home: get(home, "yellow"),      away: get(away, "yellow") },
    redCards:      { home: get(home, "red card"),    away: get(away, "red card") },
    offsides:      { home: get(home, "offside"),     away: get(away, "offside") },
    passes:        { home: get(home, "pass"),        away: get(away, "pass") },
    attacks:       { home: get(home, "attack"),      away: get(away, "attack") },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseLineup(teamData: any): Lineup {
  if (!teamData) return EMPTY_LINEUP;

  const formation = teamData.formation ?? teamData.formationUsed ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapPlayer = (p: any): Player => ({
    name: p.name ?? p.playerName ?? p.player?.name ?? "—",
    number: p.shirtNo ?? p.jerseyNumber ?? p.number ?? null,
    position: p.position ?? p.pos ?? null,
    positionIndex: p.positionIndex ?? p.order ?? 0,
  });

  const starters = Array.isArray(teamData.lineup)       ? teamData.lineup.map(mapPlayer)
                 : Array.isArray(teamData.startingXI)   ? teamData.startingXI.map(mapPlayer)
                 : Array.isArray(teamData.startEleven)  ? teamData.startEleven.map(mapPlayer)
                 : [];

  const subs = Array.isArray(teamData.substitutes)  ? teamData.substitutes.map(mapPlayer)
             : Array.isArray(teamData.bench)         ? teamData.bench.map(mapPlayer)
             : [];

  return { formation, startingXI: starters, substitutes: subs };
}

async function fetchMatchStats(matchId: number): Promise<MatchStats> {
  try {
    const res = await fetch(
      `${RAPIDAPI_BASE}/football-match-statistics?matchId=${matchId}`,
      { headers: rapidHeaders(), cache: "no-store" }
    );
    if (!res.ok) return EMPTY_STATS;

    const data = await res.json();
    // Various response shapes from this API
    const stats = data?.response ?? data?.statistics ?? data;
    if (!stats) return EMPTY_STATS;

    // Shape 1: { home: [...], away: [...] }
    if (Array.isArray(stats.home) && Array.isArray(stats.away)) {
      return parseStats(stats.home, stats.away);
    }
    // Shape 2: array of { team: {...}, statistics: [...] }
    if (Array.isArray(stats)) {
      const homeStats = stats.find((s: { team?: { id?: number }; home?: boolean }) => s.home === true || s.team?.id !== undefined)?.statistics ?? [];
      const awayStats = stats.find((s: { team?: { id?: number }; home?: boolean }) => s.home === false)?.statistics ?? [];
      return parseStats(homeStats, awayStats);
    }

    return EMPTY_STATS;
  } catch {
    return EMPTY_STATS;
  }
}

async function fetchMatchLineups(matchId: number): Promise<{ home: Lineup; away: Lineup }> {
  try {
    const res = await fetch(
      `${RAPIDAPI_BASE}/football-match-lineups?matchId=${matchId}`,
      { headers: rapidHeaders(), cache: "no-store" }
    );
    if (!res.ok) return { home: EMPTY_LINEUP, away: EMPTY_LINEUP };

    const data = await res.json();
    const resp = data?.response ?? data?.lineups ?? data;

    if (!resp) return { home: EMPTY_LINEUP, away: EMPTY_LINEUP };

    // Shape 1: { home: {...}, away: {...} }
    if (resp.home !== undefined) {
      return { home: parseLineup(resp.home), away: parseLineup(resp.away) };
    }
    // Shape 2: array of two team objects
    if (Array.isArray(resp) && resp.length >= 2) {
      return { home: parseLineup(resp[0]), away: parseLineup(resp[1]) };
    }

    return { home: EMPTY_LINEUP, away: EMPTY_LINEUP };
  } catch {
    return { home: EMPTY_LINEUP, away: EMPTY_LINEUP };
  }
}

async function fetchH2HFromRapid(homeTeamId: number, awayTeamId: number): Promise<H2HMatch[]> {
  try {
    const res = await fetch(
      `${RAPIDAPI_BASE}/football-head-2-head?homeTeamId=${homeTeamId}&awayTeamId=${awayTeamId}`,
      { headers: rapidHeaders(), cache: "no-store" }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const matches = data?.response?.matches ?? data?.h2h ?? data?.matches ?? data?.response ?? [];

    if (!Array.isArray(matches)) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return matches.slice(0, 5).map((m: any) => ({
      date: (m.utcTime ?? m.date ?? "").slice(0, 10),
      homeTeam: m.home?.longName ?? m.home?.name ?? m.homeTeam ?? "—",
      awayTeam: m.away?.longName ?? m.away?.name ?? m.awayTeam ?? "—",
      homeScore: m.home?.score ?? m.homeScore ?? 0,
      awayScore: m.away?.score ?? m.awayScore ?? 0,
      competition: m.tournament ?? m.competition ?? m.league ?? "—",
    }));
  } catch {
    return [];
  }
}

// ─── League name map ──────────────────────────────────────────────────────────

const LEAGUE_NAMES: Record<number, string> = {
  47:   "Premier League",
  87:   "La Liga",
  54:   "Bundesliga",
  55:   "Serie A",
  53:   "Ligue 1",
  2:    "Champions League",
  530:  "Botola Pro",
};

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const matchId = parseInt(id, 10);

  if (isNaN(matchId)) {
    return NextResponse.json({ error: "Invalid match ID" }, { status: 400 });
  }

  // Ensure live cache is populated
  const { source, monthlyCallsUsed } = await fetchAndCacheLiveMatches();
  const match = getMatchById(matchId);

  if (!match) {
    return NextResponse.json({ error: "Match not found or no longer live" }, { status: 404 });
  }

  // Fetch all supplemental data in parallel (DB + RapidAPI)
  const [homeForm, awayForm, h2hDB, statsData, lineupsData, h2hRapid] = await Promise.all([
    getTeamForm(match.homeTeam),
    getTeamForm(match.awayTeam),
    getH2HFromDB(match.homeTeam, match.awayTeam),
    fetchMatchStats(matchId),
    fetchMatchLineups(matchId),
    fetchH2HFromRapid(match.homeTeamId, match.awayTeamId),
  ]);

  // Merge stats — overlay live redCards/goals onto stats object
  const mergedStats: MatchStats = {
    ...statsData,
    redCards: {
      home: statsData.redCards.home ?? match.homeRedCards,
      away: statsData.redCards.away ?? match.awayRedCards,
    },
  };

  // Prefer RapidAPI H2H (more comprehensive) over DB H2H
  const h2h = h2hRapid.length > 0 ? h2hRapid : h2hDB;

  const cache = getCache();
  const competition = LEAGUE_NAMES[match.leagueId] ?? `Competición ${match.leagueId}`;

  const detail: LiveMatchDetail = {
    ...match,
    homeForm,
    awayForm,
    h2h,
    competition,
    source,
    nextRefreshIn: secondsUntilRefresh(),
    monthlyCallsUsed,
    stats: mergedStats,
    homeLineup: lineupsData.home,
    awayLineup: lineupsData.away,
  };

  return NextResponse.json(detail, {
    headers: { "Cache-Control": "no-store" },
  });
}
