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

// Re-export LiveMatch type for components that import it from here
export type { LiveMatch };

export type LiveMatchesResponse = {
  matches: LiveMatch[];
  cachedAt: string;
  source: "live" | "cache" | "error";
  nextRefreshIn: number;
  monthlyCallsUsed: number;
};

export async function GET(): Promise<NextResponse<LiveMatchesResponse>> {
  const cache = getCache();
  const fresh = isCacheFresh();

  if (cache && fresh) {
    return NextResponse.json({
      matches: cache.matches.filter((m) => m.isOngoing),
      cachedAt: new Date(cache.cachedAt).toISOString(),
      source: "cache",
      nextRefreshIn: secondsUntilRefresh(),
      monthlyCallsUsed: cache.monthlyCallsUsed,
    });
  }

  const { matches, source, monthlyCallsUsed } = await fetchAndCacheLiveMatches();
  const updatedCache = getCache();

  return NextResponse.json({
    matches: matches.filter((m) => m.isOngoing),
    cachedAt: updatedCache ? new Date(updatedCache.cachedAt).toISOString() : new Date().toISOString(),
    source: monthlyCallsUsed >= MONTHLY_BUDGET_STOP ? "cache" : source,
    nextRefreshIn: source === "live" ? Math.round(CACHE_TTL_MS / 1000) : secondsUntilRefresh(),
    monthlyCallsUsed,
  });
}
