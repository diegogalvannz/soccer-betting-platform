/**
 * Live match detail — powered by API-Football (api-sports.io v3).
 * GET /api/live-match/[id]
 *
 * Returns stats, lineups, events, H2H and team form for a single live fixture.
 * Falls back to DB for form/H2H if API-Football returns nothing.
 */
import { NextResponse } from "next/server";
import {
  getFixtureById,
  getMatchStatistics,
  getMatchLineups,
  getMatchEvents,
  getH2H,
  getTeamRecentFixtures,
  parseStat,
  AFFixture,
  AFEvent,
} from "@/modules/stats/api-football-client";
import { prisma } from "@/lib/prisma";

// ─── Public types (consumed by the frontend) ──────────────────────────────────

export type TeamForm = {
  result: "W" | "D" | "L";
  score:  string;
  opponent: string;
  isHome: boolean;
};

export type H2HMatch = {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition: string;
};

export type MatchStats = {
  possession:    { home: number | null; away: number | null };
  shots:         { home: number | null; away: number | null };
  shotsOnTarget: { home: number | null; away: number | null };
  corners:       { home: number | null; away: number | null };
  fouls:         { home: number | null; away: number | null };
  yellowCards:   { home: number | null; away: number | null };
  redCards:      { home: number | null; away: number | null };
  offsides:      { home: number | null; away: number | null };
  passes:        { home: number | null; away: number | null };
  attacks:       { home: number | null; away: number | null };
};

export type Player = {
  name: string;
  number: number | null;
  position: string | null;
  positionIndex?: number;
};

export type Lineup = {
  formation: string | null;
  startingXI: Player[];
  substitutes: Player[];
};

export type MatchEvent = {
  minute: number;
  team: "home" | "away";
  player: string;
  type: "goal" | "yellow" | "red" | "sub" | "var" | "other";
  detail: string;
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
  competition: string;
  // Supplemental
  homeForm: TeamForm[];
  awayForm: TeamForm[];
  h2h: H2HMatch[];
  events: MatchEvent[];
  stats: MatchStats;
  homeLineup: Lineup;
  awayLineup: Lineup;
  source: "live" | "cache" | "error";
  nextRefreshIn: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function buildStats(fixture: AFFixture, statsArr: Awaited<ReturnType<typeof getMatchStatistics>>): MatchStats {
  if (statsArr.length < 2) return EMPTY_STATS;

  const homeStats = statsArr[0]?.statistics ?? [];
  const awayStats = statsArr[1]?.statistics ?? [];

  return {
    possession:    { home: parseStat(homeStats, "ball possession"), away: parseStat(awayStats, "ball possession") },
    shots:         { home: parseStat(homeStats, "total shots"),     away: parseStat(awayStats, "total shots") },
    shotsOnTarget: { home: parseStat(homeStats, "shots on goal"),   away: parseStat(awayStats, "shots on goal") },
    corners:       { home: parseStat(homeStats, "corner kicks"),    away: parseStat(awayStats, "corner kicks") },
    fouls:         { home: parseStat(homeStats, "fouls"),           away: parseStat(awayStats, "fouls") },
    yellowCards:   { home: parseStat(homeStats, "yellow cards"),    away: parseStat(awayStats, "yellow cards") },
    redCards:      { home: parseStat(homeStats, "red cards"),       away: parseStat(awayStats, "red cards") },
    offsides:      { home: parseStat(homeStats, "offsides"),        away: parseStat(awayStats, "offsides") },
    passes:        { home: parseStat(homeStats, "total passes"),    away: parseStat(awayStats, "total passes") },
    attacks:       {
      home: parseStat(homeStats, "expected goals") ?? null,
      away: parseStat(awayStats, "expected goals") ?? null,
    },
  };
}

function buildLineup(data: Awaited<ReturnType<typeof getMatchLineups>>): { home: Lineup; away: Lineup } {
  if (data.length < 2) return { home: EMPTY_LINEUP, away: EMPTY_LINEUP };

  const map = (lineupData: typeof data[0]): Lineup => ({
    formation: lineupData.formation ?? null,
    startingXI: lineupData.startXI.map((p, i) => ({
      name:          p.player.name,
      number:        p.player.number,
      position:      p.player.pos,
      positionIndex: i,
    })),
    substitutes: lineupData.substitutes.map((p, i) => ({
      name:          p.player.name,
      number:        p.player.number,
      position:      p.player.pos,
      positionIndex: i,
    })),
  });

  return { home: map(data[0]), away: map(data[1]) };
}

function buildEvents(
  events: AFEvent[],
  homeTeamId: number
): MatchEvent[] {
  return events.map((e) => {
    const isHome = e.team.id === homeTeamId;
    let type: MatchEvent["type"] = "other";
    if (e.type === "Goal")                          type = "goal";
    else if (e.type === "Card" && e.detail.toLowerCase().includes("yellow")) type = "yellow";
    else if (e.type === "Card" && e.detail.toLowerCase().includes("red"))    type = "red";
    else if (e.type === "subst")                    type = "sub";
    else if (e.type === "Var")                      type = "var";

    return {
      minute:  e.time.elapsed,
      team:    isHome ? "home" : "away",
      player:  e.player.name,
      type,
      detail:  e.detail,
    };
  });
}

function buildH2H(fixtures: AFFixture[]): H2HMatch[] {
  return fixtures.map((f) => ({
    date:        f.fixture.date.slice(0, 10),
    homeTeam:    f.teams.home.name,
    awayTeam:    f.teams.away.name,
    homeScore:   f.goals.home ?? 0,
    awayScore:   f.goals.away ?? 0,
    competition: f.league.name,
  }));
}

function buildFormFromFixtures(fixtures: AFFixture[], teamId: number): TeamForm[] {
  return fixtures.map((f) => {
    const isHome = f.teams.home.id === teamId;
    const scored   = isHome ? (f.goals.home ?? 0)  : (f.goals.away ?? 0);
    const conceded = isHome ? (f.goals.away ?? 0)  : (f.goals.home ?? 0);
    const result: "W" | "D" | "L" =
      scored > conceded ? "W" : scored === conceded ? "D" : "L";
    const opponent = isHome ? f.teams.away.name : f.teams.home.name;
    return { result, score: `${scored}-${conceded}`, opponent, isHome };
  });
}

/** DB fallback for team form when API-Football returns nothing */
async function getTeamFormFromDB(teamName: string): Promise<TeamForm[]> {
  try {
    const team = await prisma.team.findFirst({
      where: {
        OR: [
          { name:      { equals: teamName, mode: "insensitive" } },
          { shortName: { equals: teamName, mode: "insensitive" } },
          { name:      { contains: teamName.split(" ")[0], mode: "insensitive" } },
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
      const isHome   = m.homeTeamId === team.id;
      const scored   = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
      const conceded = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
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

/** DB fallback for H2H */
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
      date:      m.matchDate.toISOString().slice(0, 10),
      homeTeam:  m.homeTeam.shortName ?? m.homeTeam.name,
      awayTeam:  m.awayTeam.shortName ?? m.awayTeam.name,
      homeScore: m.homeScore ?? 0,
      awayScore: m.awayScore ?? 0,
      competition: m.league,
    }));
  } catch {
    return [];
  }
}

function buildMinute(fixture: AFFixture): string {
  const s = fixture.fixture.status;
  if (s.short === "HT") return "HT";
  return s.elapsed ? `${s.elapsed}'` : "?'";
}

function buildPeriod(fixture: AFFixture): string {
  const { short, elapsed } = fixture.fixture.status;
  if (short === "HT") return "Descanso";
  if (short === "ET") return "Prórroga";
  if (short === "BT") return "Descanso (Prórroga)";
  if (short === "P")  return "Penales";
  return (elapsed ?? 0) <= 45 ? "1ª Parte" : "2ª Parte";
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const fixtureId = parseInt(id, 10);

  if (isNaN(fixtureId)) {
    return NextResponse.json({ error: "Invalid match ID" }, { status: 400 });
  }

  // Fetch fixture + supplemental data in parallel
  const [fixture, statsArr, lineupsArr, eventsArr] = await Promise.all([
    getFixtureById(fixtureId),
    getMatchStatistics(fixtureId),
    getMatchLineups(fixtureId),
    getMatchEvents(fixtureId),
  ]);

  if (!fixture) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const homeTeamId = fixture.teams.home.id;
  const awayTeamId = fixture.teams.away.id;

  // H2H + recent form in parallel (API-Football, fallback to DB)
  const [h2hFixtures, homeFormFixtures, awayFormFixtures, h2hDB, homeFormDB, awayFormDB] =
    await Promise.all([
      getH2H(homeTeamId, awayTeamId, 5),
      getTeamRecentFixtures(homeTeamId, 5),
      getTeamRecentFixtures(awayTeamId, 5),
      getH2HFromDB(fixture.teams.home.name, fixture.teams.away.name),
      getTeamFormFromDB(fixture.teams.home.name),
      getTeamFormFromDB(fixture.teams.away.name),
    ]);

  const h2h      = h2hFixtures.length > 0 ? buildH2H(h2hFixtures) : h2hDB;
  const homeForm = homeFormFixtures.length > 0
    ? buildFormFromFixtures(homeFormFixtures, homeTeamId)
    : homeFormDB;
  const awayForm = awayFormFixtures.length > 0
    ? buildFormFromFixtures(awayFormFixtures, awayTeamId)
    : awayFormDB;

  const stats   = buildStats(fixture, statsArr);
  const lineups = buildLineup(lineupsArr);
  const events  = buildEvents(eventsArr, homeTeamId);

  // Count red cards from events
  const homeRedCards = eventsArr.filter(
    (e) => e.team.id === homeTeamId && e.type === "Card" && e.detail.toLowerCase().includes("red")
  ).length;
  const awayRedCards = eventsArr.filter(
    (e) => e.team.id === awayTeamId && e.type === "Card" && e.detail.toLowerCase().includes("red")
  ).length;

  const elapsed = fixture.fixture.status.elapsed ?? 0;

  const detail: LiveMatchDetail = {
    id:           fixture.fixture.id,
    homeTeam:     fixture.teams.home.name,
    homeTeamId,
    awayTeam:     fixture.teams.away.name,
    awayTeamId,
    homeScore:    fixture.goals.home ?? 0,
    awayScore:    fixture.goals.away ?? 0,
    minute:       buildMinute(fixture),
    minuteLong:   `${elapsed}:00`,
    period:       buildPeriod(fixture),
    homeRedCards,
    awayRedCards,
    isOngoing:    ["1H", "2H", "HT", "ET", "BT", "P", "INT"].includes(fixture.fixture.status.short),
    utcTime:      fixture.fixture.date,
    cachedAt:     new Date().toISOString(),
    competition:  fixture.league.name,
    homeForm,
    awayForm,
    h2h,
    events,
    stats,
    homeLineup:   lineups.home,
    awayLineup:   lineups.away,
    source:       "live",
    nextRefreshIn: 30,
  };

  return NextResponse.json(detail, {
    headers: { "Cache-Control": "no-store" },
  });
}
