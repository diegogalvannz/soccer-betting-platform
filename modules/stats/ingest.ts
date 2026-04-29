/**
 * Match ingestion pipeline.
 * Pulls upcoming fixtures from Football-Data.org and upserts them into the DB.
 * Called by the /api/cron/ingest-matches cron job daily at 6am.
 */
import { prisma } from "@/lib/prisma";
import { TRACKED_LEAGUES, FOOTBALL_DATA_DELAY_MS } from "@/config/leagues";
import { getUpcomingMatches, getRecentMatches } from "./football-data-client";
import { sleep } from "@/lib/utils";
import { FootballDataMatch } from "@/types";

function mapStatus(fdStatus: string): "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED" {
  const map: Record<string, "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED"> = {
    SCHEDULED: "SCHEDULED",
    TIMED: "SCHEDULED",
    IN_PLAY: "LIVE",
    PAUSED: "LIVE",
    FINISHED: "FINISHED",
    AWARDED: "FINISHED",
    POSTPONED: "POSTPONED",
    SUSPENDED: "POSTPONED",
    CANCELLED: "CANCELLED",
  };
  return map[fdStatus] ?? "SCHEDULED";
}

async function upsertTeam(team: FootballDataMatch["homeTeam"]) {
  return prisma.team.upsert({
    where: { externalId: String(team.id) },
    update: { name: team.name, shortName: team.shortName, logo: team.crest },
    create: {
      externalId: String(team.id),
      name: team.name,
      shortName: team.shortName,
      logo: team.crest,
    },
  });
}

async function upsertMatch(match: FootballDataMatch) {
  const homeTeam = await upsertTeam(match.homeTeam);
  const awayTeam = await upsertTeam(match.awayTeam);

  const status = mapStatus(match.status);
  const homeScore = match.score.fullTime.home;
  const awayScore = match.score.fullTime.away;

  await prisma.match.upsert({
    where: { externalId: String(match.id) },
    update: {
      status,
      homeScore,
      awayScore,
      matchDate: new Date(match.utcDate),
    },
    create: {
      externalId: String(match.id),
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      league: match.competition.name,
      leagueCode: match.competition.code,
      matchDate: new Date(match.utcDate),
      status,
      homeScore,
      awayScore,
    },
  });
}

export async function ingestUpcomingMatches(): Promise<{
  processed: number;
  errors: string[];
}> {
  let processed = 0;
  const errors: string[] = [];

  for (const league of TRACKED_LEAGUES) {
    try {
      console.log(`[Ingest] Fetching upcoming matches for ${league.code}...`);
      const matches = await getUpcomingMatches(league.code, 5);

      for (const match of matches) {
        try {
          await upsertMatch(match);
          processed++;
        } catch (err) {
          errors.push(`Match ${match.id}: ${String(err)}`);
        }
      }

      // Respect 10 req/min rate limit
      await sleep(FOOTBALL_DATA_DELAY_MS);
    } catch (err) {
      errors.push(`League ${league.code}: ${String(err)}`);
    }
  }

  // Also update recently finished matches
  for (const league of TRACKED_LEAGUES.slice(0, 3)) {
    try {
      const matches = await getRecentMatches(league.code, 7);
      for (const match of matches) {
        try {
          await upsertMatch(match);
        } catch {}
      }
      await sleep(FOOTBALL_DATA_DELAY_MS);
    } catch {}
  }

  await prisma.log.create({
    data: {
      type: "INGEST",
      message: `Ingested ${processed} matches with ${errors.length} errors`,
      meta: { errors },
    },
  });

  return { processed, errors };
}
