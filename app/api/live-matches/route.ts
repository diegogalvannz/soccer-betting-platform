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
 * Pull live/in-progress matches from our own DB (Football-Data.org feed).
 * Covers leagues RapidAPI free tier may not include (Premier League, etc.).
 *
 * Logic:
 *  - status=LIVE: already confirmed live by FD.org
 *  - status=SCHEDULED AND matchDate in last 115 minutes: almost certainly in-progress
 *    (90 min play + 25 min extra/stoppages). We haven't yet fetched the update.
 */
async function getDbLiveMatches(): Promise<LiveMatch[]> {
  try {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 115 * 60 * 1000); // 115 min ago

    const dbMatches = await prisma.match.findMany({
      where: {
        OR: [
          // Already confirmed live by FD.org
          { status: "LIVE" },
          // Kicked off within last 115 minutes but not yet updated to LIVE in our DB
          {
            status: "SCHEDULED",
            matchDate: { lte: now, gte: twoHoursAgo },
          },
        ],
      },
      include: {
        homeTeam: { select: { id: true, name: true, shortName: true } },
        awayTeam: { select: { id: true, name: true, shortName: true } },
      },
      orderBy: { matchDate: "asc" },
      take: 30,
    });

    return dbMatches.map((m) => {
      const kickoffMs = m.matchDate.getTime();
      const elapsedMin = Math.floor((now.getTime() - kickoffMs) / 60000);
      const displayMin = elapsedMin <= 45 ? `${elapsedMin}'` : `${Math.min(elapsedMin, 90)}'`;
      const period = elapsedMin <= 45 ? "1ª Parte" : elapsedMin <= 60 ? "Descanso" : "2ª Parte";

      return {
        id: parseInt(m.externalId ?? "0", 10) || 0,
        leagueId: 0,
        homeTeam: m.homeTeam.shortName ?? m.homeTeam.name,
        homeTeamId: 0,
        awayTeam: m.awayTeam.shortName ?? m.awayTeam.name,
        awayTeamId: 0,
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
        minute: m.status === "LIVE" ? "En Vivo" : displayMin,
        minuteLong: "",
        period,
        homeRedCards: 0,
        awayRedCards: 0,
        isOngoing: true,
        utcTime: m.matchDate.toISOString(),
        cachedAt: new Date().toISOString(),
      };
    });
  } catch {
    return [];
  }
}

/** Merge RapidAPI matches with DB fallback, deduplicating by team-name pair */
function mergeMatches(rapidOngoing: LiveMatch[], dbMatches: LiveMatch[]): LiveMatch[] {
  const rapidKeys = new Set([
    ...rapidOngoing.map((m) => m.id.toString()),
    ...rapidOngoing.map((m) => normalKey(m.homeTeam, m.awayTeam)),
  ]);
  const extras = dbMatches.filter(
    (m) =>
      !rapidKeys.has(m.id.toString()) &&
      !rapidKeys.has(normalKey(m.homeTeam, m.awayTeam))
  );
  return [...rapidOngoing, ...extras];
}

function normalKey(home: string, away: string) {
  return `${home.toLowerCase().split(" ")[0]}|${away.toLowerCase().split(" ")[0]}`;
}

export async function GET(request: Request): Promise<NextResponse<LiveMatchesResponse>> {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("force") === "1";

  const cache = getCache();
  const fresh = isCacheFresh() && !forceRefresh;

  // Always fetch DB matches (fast, free)
  const dbMatchesPromise = getDbLiveMatches();

  if (cache && fresh) {
    const dbMatches = await dbMatchesPromise;
    const rapidOngoing = cache.matches.filter((m) => m.isOngoing);
    const merged = mergeMatches(rapidOngoing, dbMatches);
    return NextResponse.json({
      matches: merged,
      cachedAt: new Date(cache.cachedAt).toISOString(),
      source: "cache",
      nextRefreshIn: secondsUntilRefresh(),
      monthlyCallsUsed: cache.monthlyCallsUsed,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  // Cache stale or forced refresh — hit RapidAPI
  const [{ matches, source, monthlyCallsUsed }, dbMatches] = await Promise.all([
    fetchAndCacheLiveMatches(),
    dbMatchesPromise,
  ]);
  const updatedCache = getCache();
  const rapidOngoing = matches.filter((m) => m.isOngoing);
  const merged = mergeMatches(rapidOngoing, dbMatches);

  return NextResponse.json({
    matches: merged,
    cachedAt: updatedCache ? new Date(updatedCache.cachedAt).toISOString() : new Date().toISOString(),
    source: monthlyCallsUsed >= MONTHLY_BUDGET_STOP ? "cache" : source,
    nextRefreshIn: source === "live" ? Math.round(CACHE_TTL_MS / 1000) : secondsUntilRefresh(),
    monthlyCallsUsed,
  }, { headers: { "Cache-Control": "no-store" } });
}
