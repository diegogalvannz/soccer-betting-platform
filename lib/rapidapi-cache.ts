/**
 * Shared in-memory cache for RapidAPI live football data.
 * Module-level — survives across requests in the same server process.
 * Both /api/live-matches and /api/live-match/[id] share this to avoid
 * duplicate API calls that burn our 100 req/month budget.
 */

import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RawLiveTeam = {
  id: number;
  score: number;
  name: string;
  longName: string;
  redCards?: number;
};

export type RawLiveMatch = {
  id: number;
  leagueId: number;
  time: string;
  home: RawLiveTeam;
  away: RawLiveTeam;
  eliminatedTeamId: number | null;
  statusId: number;
  tournamentStage: string;
  status: {
    utcTime: string;
    halfs?: {
      firstHalfStarted?: string;
      secondHalfStarted?: string;
    };
    periodLength: number;
    scoreStr: string;
    finished: boolean;
    started: boolean;
    ongoing: boolean;
    cancelled: boolean;
    liveTime: {
      short: string;
      shortKey?: string;
      long: string;
      longKey?: string;
      maxTime: number;
      basePeriod: number;
      addedTime: number;
    };
    numberOfAwayRedCards?: number;
    numberOfHomeRedCards?: number;
  };
  timeTS: number;
};

export type LiveMatch = {
  id: number;
  leagueId: number;
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
};

export type LiveMatchesCache = {
  matches: LiveMatch[];
  cachedAt: number;
  monthlyCallsUsed: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes between real API calls
export const MONTHLY_BUDGET = 100;
export const MONTHLY_BUDGET_STOP = 92;

// ─── Module-Level Cache ───────────────────────────────────────────────────────

let _cache: LiveMatchesCache | null = null;

export function getCache(): LiveMatchesCache | null {
  return _cache;
}

export function isCacheFresh(): boolean {
  if (!_cache) return false;
  return Date.now() - _cache.cachedAt < CACHE_TTL_MS;
}

export function secondsUntilRefresh(): number {
  if (!_cache) return 0;
  const age = Date.now() - _cache.cachedAt;
  return Math.max(0, Math.round((CACHE_TTL_MS - age) / 1000));
}

// ─── API Call + Cache Update ──────────────────────────────────────────────────

export async function countMonthlyApiCalls(): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  return prisma.log.count({
    where: { type: "RAPIDAPI_LIVE", createdAt: { gte: startOfMonth } },
  });
}

function mapRawMatch(m: RawLiveMatch): LiveMatch {
  const maxTime = m.status.liveTime?.maxTime ?? 90;
  const period =
    m.status.liveTime?.long?.startsWith("HT") ? "Half Time" :
    m.status.liveTime?.long?.startsWith("FT") ? "Full Time" :
    maxTime <= 45 ? "1st Half" : "2nd Half";

  return {
    id: m.id,
    leagueId: m.leagueId,
    homeTeam: m.home.longName ?? m.home.name,
    homeTeamId: m.home.id,
    awayTeam: m.away.longName ?? m.away.name,
    awayTeamId: m.away.id,
    homeScore: m.home.score,
    awayScore: m.away.score,
    minute: m.status.liveTime?.short?.replace(/\u200e|\u200f/g, "").trim() ?? "?'",
    minuteLong: m.status.liveTime?.long ?? "",
    period,
    homeRedCards: m.status.numberOfHomeRedCards ?? m.home.redCards ?? 0,
    awayRedCards: m.status.numberOfAwayRedCards ?? m.away.redCards ?? 0,
    isOngoing: m.status.ongoing && !m.status.finished && !m.status.cancelled,
    utcTime: m.status.utcTime ?? m.time,
    cachedAt: new Date().toISOString(),
  };
}

export async function fetchAndCacheLiveMatches(): Promise<{
  matches: LiveMatch[];
  source: "live" | "cache" | "error";
  monthlyCallsUsed: number;
}> {
  // Return fresh cache immediately
  if (isCacheFresh() && _cache) {
    return { matches: _cache.matches, source: "cache", monthlyCallsUsed: _cache.monthlyCallsUsed };
  }

  // Check budget
  let monthlyCallsUsed = 0;
  try {
    monthlyCallsUsed = await countMonthlyApiCalls();
  } catch {
    if (_cache) return { matches: _cache.matches, source: "cache", monthlyCallsUsed: 0 };
  }

  if (monthlyCallsUsed >= MONTHLY_BUDGET_STOP) {
    return {
      matches: _cache?.matches ?? [],
      source: "cache",
      monthlyCallsUsed,
    };
  }

  // Fetch from RapidAPI
  try {
    const res = await fetch(
      "https://free-api-live-football-data.p.rapidapi.com/football-current-live",
      {
        headers: {
          "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
          "x-rapidapi-host": process.env.RAPIDAPI_HOST!,
        },
        cache: "no-store",
      }
    );

    if (!res.ok) throw new Error(`RapidAPI ${res.status}`);

    const data = await res.json() as {
      status: string;
      response: { live: RawLiveMatch[] };
    };

    const allMatches = Array.isArray(data.response?.live) ? data.response.live : [];
    const matches = allMatches.map(mapRawMatch);

    // Log to DB (non-blocking)
    prisma.log.create({
      data: {
        type: "RAPIDAPI_LIVE",
        message: `Live matches: ${matches.length} total`,
        meta: { count: matches.length, callNumber: monthlyCallsUsed + 1 },
      },
    }).catch(() => {});

    _cache = { matches, cachedAt: Date.now(), monthlyCallsUsed: monthlyCallsUsed + 1 };
    return { matches, source: "live", monthlyCallsUsed: monthlyCallsUsed + 1 };
  } catch (err) {
    console.error("[RapidAPI Cache] Fetch failed:", err);
    return {
      matches: _cache?.matches ?? [],
      source: "error",
      monthlyCallsUsed,
    };
  }
}

export function getMatchById(id: number): LiveMatch | undefined {
  return _cache?.matches.find((m) => m.id === id);
}
