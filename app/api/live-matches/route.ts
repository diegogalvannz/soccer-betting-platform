import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

type RawLiveTeam = {
  id: number;
  score: number;
  name: string;
  longName: string;
  redCards?: number;
};

type RawLiveMatch = {
  id: number;
  leagueId: number;
  home: RawLiveTeam;
  away: RawLiveTeam;
  status: {
    scoreStr: string;
    finished: boolean;
    started: boolean;
    ongoing: boolean;
    cancelled: boolean;
    liveTime: {
      short: string;
      long: string;
      maxTime: number;
      addedTime: number;
    };
    numberOfAwayRedCards?: number;
    numberOfHomeRedCards?: number;
  };
  timeTS: number;
};

export type LiveMatch = {
  id: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  minute: string;
  period: string;
  homeRedCards: number;
  awayRedCards: number;
  isOngoing: boolean;
  cachedAt: string;
};

export type LiveMatchesResponse = {
  matches: LiveMatch[];
  cachedAt: string;
  source: "live" | "cache" | "error";
  nextRefreshIn: number; // seconds until next RapidAPI call is allowed
  monthlyCallsUsed: number;
};

// ─── Server-Side In-Memory Cache ──────────────────────────────────────────────

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes between RapidAPI calls
const MONTHLY_BUDGET = 100;
const MONTHLY_BUDGET_STOP = 92; // stop at 92 to keep 8 in reserve

type CacheEntry = {
  matches: LiveMatch[];
  cachedAt: number;
  monthlyCallsUsed: number;
};

// Module-level cache — persists across requests in the same server process
let cache: CacheEntry | null = null;

async function countMonthlyApiCalls(): Promise<number> {
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const count = await prisma.log.count({
    where: {
      type: "RAPIDAPI_LIVE",
      createdAt: { gte: startOfMonth },
    },
  });
  return count;
}

async function fetchLiveMatchesFromRapidApi(): Promise<LiveMatch[]> {
  const res = await fetch(
    "https://free-api-live-football-data.p.rapidapi.com/football-current-live",
    {
      headers: {
        "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
        "x-rapidapi-host": process.env.RAPIDAPI_HOST!,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`RapidAPI error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json() as {
    status: string;
    response: { live: RawLiveMatch[] };
  };

  if (data.status !== "success" || !Array.isArray(data.response?.live)) {
    return [];
  }

  return data.response.live
    .filter((m) => m.status?.ongoing && !m.status?.finished && !m.status?.cancelled)
    .map((m): LiveMatch => ({
      id: m.id,
      homeTeam: m.home.longName ?? m.home.name,
      awayTeam: m.away.longName ?? m.away.name,
      homeScore: m.home.score,
      awayScore: m.away.score,
      minute: m.status.liveTime?.short?.replace(/\u200e/g, "").trim() ?? "?'",
      period: m.status.liveTime?.maxTime === 45 ? "1st Half" : "2nd Half",
      homeRedCards: m.status.numberOfHomeRedCards ?? m.home.redCards ?? 0,
      awayRedCards: m.status.numberOfAwayRedCards ?? m.away.redCards ?? 0,
      isOngoing: true,
      cachedAt: new Date().toISOString(),
    }));
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse<LiveMatchesResponse>> {
  const now = Date.now();
  const cacheAge = cache ? now - cache.cachedAt : Infinity;
  const isCacheFresh = cacheAge < CACHE_TTL_MS;
  const secondsUntilRefresh = isCacheFresh
    ? Math.round((CACHE_TTL_MS - cacheAge) / 1000)
    : 0;

  // Serve from cache if still fresh
  if (cache && isCacheFresh) {
    return NextResponse.json({
      matches: cache.matches,
      cachedAt: new Date(cache.cachedAt).toISOString(),
      source: "cache",
      nextRefreshIn: secondsUntilRefresh,
      monthlyCallsUsed: cache.monthlyCallsUsed,
    });
  }

  // Check monthly budget before calling RapidAPI
  let monthlyCallsUsed = 0;
  try {
    monthlyCallsUsed = await countMonthlyApiCalls();
  } catch {
    // DB unavailable — serve stale cache if we have it
    if (cache) {
      return NextResponse.json({
        matches: cache.matches,
        cachedAt: new Date(cache.cachedAt).toISOString(),
        source: "cache",
        nextRefreshIn: 60,
        monthlyCallsUsed: 0,
      });
    }
  }

  if (monthlyCallsUsed >= MONTHLY_BUDGET_STOP) {
    console.warn(`[LiveMatches] Monthly budget reached (${monthlyCallsUsed}/${MONTHLY_BUDGET}). Serving stale cache.`);
    return NextResponse.json({
      matches: cache?.matches ?? [],
      cachedAt: cache ? new Date(cache.cachedAt).toISOString() : new Date().toISOString(),
      source: "cache",
      nextRefreshIn: 86400, // try again tomorrow
      monthlyCallsUsed,
    });
  }

  // Fetch from RapidAPI
  try {
    console.log(`[LiveMatches] Calling RapidAPI (call ${monthlyCallsUsed + 1}/${MONTHLY_BUDGET})`);
    const matches = await fetchLiveMatchesFromRapidApi();

    // Log this call to track budget
    await prisma.log.create({
      data: {
        type: "RAPIDAPI_LIVE",
        message: `Live matches fetched: ${matches.length} ongoing`,
        meta: { count: matches.length, callNumber: monthlyCallsUsed + 1 },
      },
    }).catch(() => {}); // non-blocking

    // Update in-memory cache
    cache = { matches, cachedAt: now, monthlyCallsUsed: monthlyCallsUsed + 1 };

    return NextResponse.json({
      matches,
      cachedAt: new Date(now).toISOString(),
      source: "live",
      nextRefreshIn: Math.round(CACHE_TTL_MS / 1000),
      monthlyCallsUsed: monthlyCallsUsed + 1,
    });
  } catch (err) {
    console.error("[LiveMatches] RapidAPI fetch failed:", err);

    // Serve stale cache on error
    if (cache) {
      return NextResponse.json({
        matches: cache.matches,
        cachedAt: new Date(cache.cachedAt).toISOString(),
        source: "cache",
        nextRefreshIn: 300,
        monthlyCallsUsed,
      });
    }

    return NextResponse.json({
      matches: [],
      cachedAt: new Date().toISOString(),
      source: "error",
      nextRefreshIn: 300,
      monthlyCallsUsed,
    });
  }
}
