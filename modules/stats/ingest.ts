/**
 * Match ingestion pipeline — powered by API-Football (api-sports.io v3).
 * Fetches upcoming + recent fixtures for all 24 tracked leagues and upserts
 * them into the DB.  Called by /api/cron/ingest-matches daily at 00:40 UTC.
 *
 * Strategy:
 *   - Per league: fetch last 3 days + next 7 days in one range call
 *   - Batch 4 leagues concurrently to stay well within 7,500 req/day limit
 *   - After ingest: auto-settle any newly-finished picks
 */
import { prisma } from "@/lib/prisma";
import {
  getFixturesByDateRange,
  getExpandedOdds,
  LEAGUE_IDS,
  LEAGUE_NAMES,
  AFFixture,
} from "./api-football-client";
import { settlePicks } from "@/modules/engine/settler";
import { sleep } from "@/lib/utils";
import { FOOTBALL_DATA_DELAY_MS } from "@/config/leagues";

// ─── Constants ────────────────────────────────────────────────────────────────

const NOW   = new Date();
const YEAR  = NOW.getFullYear();
const MONTH = NOW.getMonth() + 1; // 1-12

/**
 * European leagues use a split season that starts in August.
 *   Aug–Dec of YEAR  → season = YEAR    (e.g. Aug 2025 = season 2025)
 *   Jan–Jul of YEAR  → season = YEAR-1  (e.g. May 2026 = season 2025)
 *
 * Calendar-year leagues (Americas, Middle East, etc.) always use YEAR.
 */
const EU_SEASON   = MONTH >= 8 ? YEAR : YEAR - 1;  // 2025 during May 2026
const CAL_SEASON  = YEAR;                            // 2026 during May 2026

/** Leagues that follow a calendar year (season = current year) */
const CALENDAR_YEAR_LEAGUE_IDS = new Set<number>([
  LEAGUE_IDS.LIGA_MX,
  LEAGUE_IDS.MLS,
  LEAGUE_IDS.BRASILEIRAO,
  LEAGUE_IDS.LIGA_ARGENTINA,
  LEAGUE_IDS.COPA_LIBERTADORES,
  LEAGUE_IDS.COPA_SUDAMERICANA,
  LEAGUE_IDS.SAUDI_PRO_LEAGUE,
  LEAGUE_IDS.UAE_PRO_LEAGUE,
  LEAGUE_IDS.LEAGUES_CUP,
  LEAGUE_IDS.CONCACAF_CHAMPIONS,
  LEAGUE_IDS.GOLD_CUP,
]);

function seasonFor(leagueId: number): number {
  return CALENDAR_YEAR_LEAGUE_IDS.has(leagueId) ? CAL_SEASON : EU_SEASON;
}

/** All league IDs we track (24 leagues) */
const ALL_LEAGUE_IDS = Object.values(LEAGUE_IDS) as number[];

// ─── Status mapping ───────────────────────────────────────────────────────────

function mapStatus(
  short: string
): "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED" {
  switch (short) {
    case "NS":   return "SCHEDULED";
    case "TBD":  return "SCHEDULED";
    case "1H":
    case "2H":
    case "HT":
    case "ET":
    case "BT":
    case "P":
    case "INT":  return "LIVE";
    case "FT":
    case "AET":
    case "PEN":  return "FINISHED";
    case "AWD":
    case "WO":   return "FINISHED";
    case "PST":  return "POSTPONED";
    case "SUSP": return "POSTPONED";
    case "CANC": return "CANCELLED";
    case "ABD":  return "CANCELLED";
    default:     return "SCHEDULED";
  }
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

async function upsertTeam(team: { id: number; name: string; logo?: string }) {
  return prisma.team.upsert({
    where:  { externalId: `af_${team.id}` },
    update: { name: team.name, logo: team.logo ?? null },
    create: {
      externalId: `af_${team.id}`,
      name:       team.name,
      shortName:  team.name,          // API-Football doesn't separate short names
      logo:       team.logo ?? null,
    },
  });
}

async function upsertFixture(f: AFFixture, leagueId: number) {
  const [homeTeam, awayTeam] = await Promise.all([
    upsertTeam(f.teams.home),
    upsertTeam(f.teams.away),
  ]);

  const status    = mapStatus(f.fixture.status.short);
  const homeScore = f.goals.home;
  const awayScore = f.goals.away;
  const externalId = String(f.fixture.id);
  const leagueName = LEAGUE_NAMES[leagueId] ?? f.league.name;

  await prisma.match.upsert({
    where:  { externalId },
    update: {
      status,
      homeScore,
      awayScore,
      matchDate: new Date(f.fixture.date),
    },
    create: {
      externalId,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      league:     leagueName,
      leagueCode: String(leagueId),
      matchDate:  new Date(f.fixture.date),
      status,
      homeScore,
      awayScore,
    },
  });
}

// ─── Date range helpers ───────────────────────────────────────────────────────

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// ─── Odds refresh ─────────────────────────────────────────────────────────────

/**
 * For every SCHEDULED match in the next 32 hours without odds,
 * fetch 1X2 + expanded odds from API-Football and update the DB.
 * Called after fixture ingest so the picker has real market odds to work with.
 */
export async function refreshOddsForUpcomingMatches(): Promise<{ updated: number; skipped: number }> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 32 * 3600_000);

  // Only matches without 1X2 odds that are in our pick window
  const matches = await prisma.match.findMany({
    where: {
      status:    "SCHEDULED",
      matchDate: { gte: now, lt: windowEnd },
      homeOdds:  null,
    },
    select: { id: true, externalId: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    take: 30,
  });

  let updated = 0, skipped = 0;

  for (const match of matches) {
    const fixtureId = parseInt(match.externalId, 10);
    if (isNaN(fixtureId)) { skipped++; continue; }

    try {
      const odds = await getExpandedOdds(fixtureId);
      if (!odds.homeOdds && !odds.awayOdds) { skipped++; continue; }

      await prisma.match.update({
        where: { id: match.id },
        data: {
          homeOdds:     odds.homeOdds,
          drawOdds:     odds.drawOdds,
          awayOdds:     odds.awayOdds,
          rawOddsCache: odds as unknown as import("@prisma/client").Prisma.InputJsonValue,
          oddsUpdatedAt: new Date(),
        },
      });
      updated++;
      console.log(`[OddsRefresh] ${match.homeTeam.name} vs ${match.awayTeam.name}: H=${odds.homeOdds} D=${odds.drawOdds} A=${odds.awayOdds}`);
    } catch (err) {
      console.error(`[OddsRefresh] Error for match ${match.id}:`, err);
      skipped++;
    }

    await sleep(FOOTBALL_DATA_DELAY_MS);
  }

  console.log(`[OddsRefresh] Updated ${updated} matches, skipped ${skipped}`);
  return { updated, skipped };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function ingestUpcomingMatches(): Promise<{
  processed: number;
  errors: string[];
}> {
  let processed = 0;
  const errors: string[] = [];

  const fromDate = dateStr(-3);   // 3 days ago (catch late-settled matches)
  const toDate   = dateStr(7);    // 7 days ahead

  // Process leagues in batches of 4 to stay safe on rate limits
  const BATCH_SIZE = 4;
  for (let i = 0; i < ALL_LEAGUE_IDS.length; i += BATCH_SIZE) {
    const batch = ALL_LEAGUE_IDS.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (leagueId) => {
        try {
          const season = seasonFor(leagueId);
          console.log(`[Ingest] Fetching ${LEAGUE_NAMES[leagueId] ?? leagueId} season=${season} (${fromDate}→${toDate})`);
          const fixtures = await getFixturesByDateRange(
            leagueId,
            season,
            fromDate,
            toDate
          );

          for (const f of fixtures) {
            try {
              await upsertFixture(f, leagueId);
              processed++;
            } catch (err) {
              errors.push(`fixture ${f.fixture.id}: ${String(err)}`);
            }
          }
        } catch (err) {
          errors.push(`league ${leagueId}: ${String(err)}`);
        }
      })
    );
  }

  // Log to DB
  await prisma.log.create({
    data: {
      type:    "INGEST",
      message: `Ingested ${processed} fixtures from API-Football with ${errors.length} errors`,
      meta:    { processed, errors: errors.slice(0, 20), fromDate, toDate },
    },
  }).catch(() => {});

  // Auto-settle: resolve any picks whose matches just became FINISHED
  try {
    const settlement = await settlePicks();
    if (settlement.settled > 0) {
      console.log(`[Ingest] Auto-settled ${settlement.settled} picks after ingest`);
    }
  } catch (err) {
    console.error("[Ingest] Auto-settle failed (non-fatal):", err);
  }

  return { processed, errors };
}
