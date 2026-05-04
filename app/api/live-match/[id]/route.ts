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
};

async function getTeamForm(teamName: string): Promise<TeamForm[]> {
  try {
    // Try exact name match first, then partial
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
      return {
        result,
        score: `${scored}-${conceded}`,
        opponent,
        isHome,
      };
    });
  } catch {
    return [];
  }
}

async function getH2H(homeTeamName: string, awayTeamName: string): Promise<H2HMatch[]> {
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

// Rough league name map from leagueId
const LEAGUE_NAMES: Record<number, string> = {
  47:   "Premier League",
  87:   "La Liga",
  54:   "Bundesliga",
  55:   "Serie A",
  53:   "Ligue 1",
  2:    "Champions League",
  530:  "Botola Pro",
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const matchId = parseInt(id, 10);

  if (isNaN(matchId)) {
    return NextResponse.json({ error: "Invalid match ID" }, { status: 400 });
  }

  // Ensure cache is populated
  const { source, monthlyCallsUsed } = await fetchAndCacheLiveMatches();
  const match = getMatchById(matchId);

  if (!match) {
    return NextResponse.json({ error: "Match not found or no longer live" }, { status: 404 });
  }

  // Fetch supplemental data from our DB in parallel
  const [homeForm, awayForm, h2h] = await Promise.all([
    getTeamForm(match.homeTeam),
    getTeamForm(match.awayTeam),
    getH2H(match.homeTeam, match.awayTeam),
  ]);

  const cache = getCache();
  const competition = LEAGUE_NAMES[match.leagueId] ?? `League ${match.leagueId}`;

  const detail: LiveMatchDetail = {
    ...match,
    homeForm,
    awayForm,
    h2h,
    competition,
    source,
    nextRefreshIn: secondsUntilRefresh(),
    monthlyCallsUsed,
  };

  return NextResponse.json(detail, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
