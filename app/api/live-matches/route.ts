/**
 * Live matches endpoint — powered by API-Football /fixtures?live=all
 * Returns ALL currently live matches worldwide.
 * Falls back to DB (matches that kicked off ≤115 min ago) if API is down.
 * Cache-Control: no-store (client polls every 30s)
 */
import { NextResponse } from "next/server";
import { getLiveFixtures, isLive, LEAGUE_NAMES, AFFixture } from "@/modules/stats/api-football-client";
import { prisma } from "@/lib/prisma";

export type LiveMatch = {
  id: number;
  leagueId: number;
  leagueName: string;
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
  source: "api-football" | "db";
};

export type LiveMatchesResponse = {
  matches: LiveMatch[];
  cachedAt: string;
  source: "live" | "cache" | "error";
  nextRefreshIn: number;
  totalLive: number;
};

function mapAFFixtureToLiveMatch(f: AFFixture): LiveMatch {
  const status = f.fixture.status;
  const elapsed = status.elapsed ?? 0;

  const period =
    status.short === "HT" ? "Descanso" :
    status.short === "ET" ? "Prórroga" :
    status.short === "BT" ? "Descanso (Prórroga)" :
    status.short === "P"  ? "Penales" :
    elapsed <= 45  ? "1ª Parte" : "2ª Parte";

  const minute = status.short === "HT" ? "HT" :
    elapsed > 0 ? `${elapsed}'` : "?'";

  return {
    id: f.fixture.id,
    leagueId: f.league.id,
    leagueName: LEAGUE_NAMES[f.league.id] ?? f.league.name,
    homeTeam: f.teams.home.name,
    homeTeamId: f.teams.home.id,
    awayTeam: f.teams.away.name,
    awayTeamId: f.teams.away.id,
    homeScore: f.goals.home ?? 0,
    awayScore: f.goals.away ?? 0,
    minute,
    minuteLong: `${elapsed}:00`,
    period,
    homeRedCards: 0,
    awayRedCards: 0,
    isOngoing: true,
    utcTime: f.fixture.date,
    cachedAt: new Date().toISOString(),
    source: "api-football",
  };
}

/** DB fallback: matches that kicked off ≤115 minutes ago */
async function getDbFallbackMatches(): Promise<LiveMatch[]> {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 115 * 60 * 1000);

    const dbMatches = await prisma.match.findMany({
      where: {
        OR: [
          { status: "LIVE" },
          { status: "SCHEDULED", matchDate: { lte: now, gte: cutoff } },
        ],
      },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
      },
      orderBy: { matchDate: "asc" },
      take: 20,
    });

    return dbMatches.map((m) => {
      const elapsed = Math.min(90, Math.floor((now.getTime() - m.matchDate.getTime()) / 60000));
      return {
        id: parseInt(m.externalId ?? "0", 10) || 0,
        leagueId: 0,
        leagueName: m.league,
        homeTeam: m.homeTeam.shortName ?? m.homeTeam.name,
        homeTeamId: 0,
        awayTeam: m.awayTeam.shortName ?? m.awayTeam.name,
        awayTeamId: 0,
        homeScore: m.homeScore ?? 0,
        awayScore: m.awayScore ?? 0,
        minute: `~${elapsed}'`,
        minuteLong: "",
        period: elapsed <= 45 ? "1ª Parte" : "2ª Parte",
        homeRedCards: 0,
        awayRedCards: 0,
        isOngoing: true,
        utcTime: m.matchDate.toISOString(),
        cachedAt: new Date().toISOString(),
        source: "db" as const,
      };
    });
  } catch {
    return [];
  }
}

export async function GET(request: Request): Promise<NextResponse<LiveMatchesResponse>> {
  const force = new URL(request.url).searchParams.get("force") === "1";
  const now = new Date().toISOString();

  try {
    const [apiFixtures, dbMatches] = await Promise.all([
      getLiveFixtures(),
      getDbFallbackMatches(),
    ]);

    const apiLive = apiFixtures.filter((f) => isLive(f)).map(mapAFFixtureToLiveMatch);

    // Merge: prefer API-Football; add DB matches not already covered
    const apiIds  = new Set(apiLive.map((m) => m.id));
    const apiKeys = new Set(apiLive.map((m) =>
      `${m.homeTeam.toLowerCase().split(" ")[0]}|${m.awayTeam.toLowerCase().split(" ")[0]}`
    ));

    const extraDb = dbMatches.filter((m) => {
      if (apiIds.has(m.id)) return false;
      const key = `${m.homeTeam.toLowerCase().split(" ")[0]}|${m.awayTeam.toLowerCase().split(" ")[0]}`;
      return !apiKeys.has(key);
    });

    const matches = [...apiLive, ...extraDb];

    return NextResponse.json({
      matches,
      cachedAt: now,
      source: "live",
      nextRefreshIn: 60,
      totalLive: matches.length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[live-matches] API-Football failed:", err);

    // Full fallback to DB only
    const dbMatches = await getDbFallbackMatches();
    return NextResponse.json({
      matches: dbMatches,
      cachedAt: now,
      source: "error",
      nextRefreshIn: 60,
      totalLive: dbMatches.length,
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
