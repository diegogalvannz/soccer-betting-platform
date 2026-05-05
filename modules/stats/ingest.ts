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
  LEAGUE_IDS,
  LEAGUE_NAMES,
  AFFixture,
} from "./api-football-client";
import { settlePicks } from "@/modules/engine/settler";

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
