import { NextResponse } from "next/server";
import {
  fetchAndCacheLiveMatches,
  isCacheFresh,
  getCache,
  secondsUntilRefresh,
  CACHE_TTL_MS,
  MONTHLY_BUDGET_STOP,
  LiveMatch,
} from "@/lib/rapidapi-cache";
import { prisma } from "@/lib/prisma";

// Re-export LiveMatch type for components that import it from here
export type { LiveMatch };

export type LiveMatchesResponse = {
  matches: LiveMatch[];
  cachedAt: string;
  source: "live" | "cache" | "error";
  nextRefreshIn: number;
  monthlyCallsUsed: number;
};

/**
 * Pull matches marked LIVE in our own DB (Football-Data.org) and convert
 * them to the LiveMatch shape so they show alongside RapidAPI matches.
 * This covers leagues RapidAPI free tier may not include (e.g. Premier League).
 */
async function getDbLiveMatches(): Promise<LiveMatch[]> {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const now = new Date();
    const dbMatches = await prisma.match.findMany({
      where: {
        status: { in: ["LIVE"] },
        matchDate: { lte: now, gte: twoHoursAgo },
      },
      include: {
        homeTeam: { select: { id: true, name: true, shortName: true } },
        awayTeam: { select: { id: true, name: true, shortName: true } },
      },
      take: 20,
    });

    return dbMatches.map((m) => ({
      id: parseInt(m.externalId ?? "0", 10) || 0,
      leagueId: 0,
      homeTeam: m.homeTeam.shortName ?? m.homeTeam.name,
      homeTeamId: 0,
      awayTeam: m.awayTeam.shortName ?? m.awayTeam.name,
      awayTeamId: 0,
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      minute: "?'",
      minuteLong: "",
      period: "En Vivo",
      homeRedCards: 0,
      awayRedCards: 0,
      isOngoing: true,
      utcTime: m.matchDate.toISOString(),
      cachedAt: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function GET(): Promise<NextResponse<LiveMatchesResponse>> {
  const cache = getCache();
  const fresh = isCacheFresh();

  // Fetch DB live matches in parallel with cache check
  const dbMatchesPromise = getDbLiveMatches();

  if (cache && fresh) {
    const dbMatches = await dbMatchesPromise;
    const rapidMatches = cache.matches.filter((m) => m.isOngoing);
    // Merge: prefer RapidAPI matches; add DB matches not already present by team name
    const rapidIds = new Set(rapidMatches.map((m) => m.id));
    const rapidTeams = new Set(rapidMatches.map((m) => `${m.homeTeam}|${m.awayTeam}`));
    const extraDb = dbMatches.filter(
      (m) => !rapidIds.has(m.id) && !rapidTeams.has(`${m.homeTeam}|${m.awayTeam}`)
    );
    return NextResponse.json({
      matches: [...rapidMatches, ...extraDb],
      cachedAt: new Date(cache.cachedAt).toISOString(),
      source: "cache",
      nextRefreshIn: secondsUntilRefresh(),
      monthlyCallsUsed: cache.monthlyCallsUsed,
    });
  }

  const [{ matches, source, monthlyCallsUsed }, dbMatches] = await Promise.all([
    fetchAndCacheLiveMatches(),
    dbMatchesPromise,
  ]);
  const updatedCache = getCache();

  const rapidMatches = matches.filter((m) => m.isOngoing);
  const rapidIds = new Set(rapidMatches.map((m) => m.id));
  const rapidTeams = new Set(rapidMatches.map((m) => `${m.homeTeam}|${m.awayTeam}`));
  const extraDb = dbMatches.filter(
    (m) => !rapidIds.has(m.id) && !rapidTeams.has(`${m.homeTeam}|${m.awayTeam}`)
  );

  return NextResponse.json({
    matches: [...rapidMatches, ...extraDb],
    cachedAt: updatedCache ? new Date(updatedCache.cachedAt).toISOString() : new Date().toISOString(),
    source: monthlyCallsUsed >= MONTHLY_BUDGET_STOP ? "cache" : source,
    nextRefreshIn: source === "live" ? Math.round(CACHE_TTL_MS / 1000) : secondsUntilRefresh(),
    monthlyCallsUsed,
  });
}
