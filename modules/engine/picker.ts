/**
 * Pick generation pipeline.
 * For each upcoming match, fetches stats from API-Football and runs the scorer.
 * Saves qualifying picks to the DB.
 * Called by /api/cron/daily-runner daily at 06:00 UTC.
 *
 * Window: now → now+30h so that late-night UTC fixtures (Liga MX, CONCACAF,
 * Copa Libertadores) are covered regardless of cron run time.
 */
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "./scorer";
import { MIN_CONFIDENCE_THRESHOLD, PICKS_CUTOFF_HOURS, MAX_PICKS_PER_RUN, MIN_H2H_MATCHES, MIN_FORM_MATCHES } from "./thresholds";
import {
  getTeamRecentFixtures,
  getH2H,
  type AFFixture,
} from "../stats/api-football-client";
import { sleep } from "@/lib/utils";
import { FOOTBALL_DATA_DELAY_MS } from "@/config/leagues";

// ─── Form parser — API-Football format ───────────────────────────────────────

function parseAFForm(fixtures: AFFixture[], teamAfId: number): number[] {
  return fixtures
    .filter((f) => {
      const s = f.fixture.status.short;
      return ["FT", "AET", "PEN"].includes(s);
    })
    .slice(0, 5)
    .map((f) => {
      const isHome  = f.teams.home.id === teamAfId;
      const winner  = isHome ? f.teams.home.winner : f.teams.away.winner;
      if (winner === true)  return 3;
      if (winner === false) return 0;
      return 1; // draw / null
    });
}

/**
 * Extract the numeric API-Football team ID from a stored externalId like "af_2279".
 * Returns null for IDs without the af_ prefix (old Football-Data.org format) —
 * those must NOT be sent to API-Football because they are different numbering systems.
 */
function afTeamId(externalId: string): number | null {
  if (!externalId.startsWith("af_")) return null;
  const n = parseInt(externalId.slice(3), 10);
  return isNaN(n) ? null : n;
}

export async function generatePicks(): Promise<{
  generated: number;
  skipped: number;
  errors: string[];
}> {
  const now = new Date();

  // 30-hour window: captures same-UTC-day afternoon matches AND
  // late-night UTC fixtures (Liga MX, CONCACAF, Copa Libertadores kickoffs)
  const windowStart = now;
  const windowEnd   = new Date(now.getTime() + 30 * 3600_000);

  // Cutoff: don't generate picks for matches kicking off in less than PICKS_CUTOFF_HOURS
  const cutoffTime = new Date(Date.now() + PICKS_CUTOFF_HOURS * 3600_000);

  // Get upcoming matches without picks already
  const matches = await prisma.match.findMany({
    where: {
      status:    "SCHEDULED",
      matchDate: { gte: windowStart, lt: windowEnd },
      picks:     { none: {} },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { matchDate: "asc" },
    take: 20,
  });

  let generated = 0;
  let skipped   = 0;
  const errors: string[] = [];

  for (const match of matches) {
    if (generated >= MAX_PICKS_PER_RUN) break;

    // Skip matches kicking off too soon
    if (match.matchDate < cutoffTime) {
      skipped++;
      console.log(`[Picker] CUTOFF: ${match.homeTeam.name} vs ${match.awayTeam.name} (kicks off in <${PICKS_CUTOFF_HOURS}h)`);
      continue;
    }

    try {
      const homeAfId = afTeamId(match.homeTeam.externalId);
      const awayAfId = afTeamId(match.awayTeam.externalId);

      // Teams without af_ prefix are old Football-Data.org records — their numeric IDs
      // are incompatible with API-Football and would return wrong/empty form data.
      // Skip these matches; they'll be replaced by new AF-ingested records.
      if (homeAfId === null || awayAfId === null) {
        skipped++;
        console.log(`[Picker] SKIP (legacy FD IDs): ${match.homeTeam.name} (${match.homeTeam.externalId}) vs ${match.awayTeam.name} (${match.awayTeam.externalId})`);
        continue;
      }

      // ── Quality gate 1: real market odds required ─────────────────────────
      // Null odds → we would use default placeholders (1.85/2.20) which are NOT
      // real market pricing → genuine value cannot be assessed → hard skip.
      if (match.homeOdds === null || match.awayOdds === null) {
        skipped++;
        console.log(`[Picker] SKIP (no real odds): ${match.homeTeam.name} vs ${match.awayTeam.name} — odds not in DB`);
        continue;
      }

      console.log(`[Picker] Scoring: ${match.homeTeam.name} (af_${homeAfId}) vs ${match.awayTeam.name} (af_${awayAfId}) — ${match.league}`);

      // Fetch recent form — /fixtures?team=ID&last=7
      const [homeFixtures, awayFixtures] = await Promise.allSettled([
        getTeamRecentFixtures(homeAfId, 7),
        getTeamRecentFixtures(awayAfId, 7),
      ]);

      await sleep(FOOTBALL_DATA_DELAY_MS);

      // Fetch H2H — /fixtures/headtohead?h2h=TEAM1-TEAM2
      const h2hFixtures = await getH2H(homeAfId, awayAfId, 5).catch(() => [] as AFFixture[]);

      await sleep(FOOTBALL_DATA_DELAY_MS);

      const homeForm = homeFixtures.status === "fulfilled"
        ? parseAFForm(homeFixtures.value, homeAfId)
        : [];

      const awayForm = awayFixtures.status === "fulfilled"
        ? parseAFForm(awayFixtures.value, awayAfId)
        : [];

      // ── Quality gate 2: minimum completed form matches ────────────────────
      // Fewer than MIN_FORM_MATCHES completed results → unreliable form signal.
      // Never fall back to neutral [1,1,1,1,1] — that produces fake confidence.
      if (homeForm.length < MIN_FORM_MATCHES || awayForm.length < MIN_FORM_MATCHES) {
        skipped++;
        console.log(`[Picker] SKIP (thin form): ${match.homeTeam.name} (${homeForm.length} games) vs ${match.awayTeam.name} (${awayForm.length} games) — need ${MIN_FORM_MATCHES}+`);
        continue;
      }

      // Count H2H results from home team's perspective
      let h2hHomeWins = 0, h2hAwayWins = 0, h2hDraws = 0;
      const h2hCompleted: AFFixture[] = [];
      for (const f of h2hFixtures) {
        const s = f.fixture.status.short;
        if (!["FT", "AET", "PEN"].includes(s)) continue;
        h2hCompleted.push(f);
        const homeIsActualHome = f.teams.home.id === homeAfId;
        const winner = homeIsActualHome ? f.teams.home.winner : f.teams.away.winner;
        if (winner === true)       h2hHomeWins++;
        else if (winner === false) h2hAwayWins++;
        else                       h2hDraws++;
      }

      // ── Quality gate 3: minimum completed H2H matches ────────────────────
      // Fewer than MIN_H2H_MATCHES head-to-head results → H2H signal is noise.
      // Skip rather than score with unreliable historical data.
      if (h2hCompleted.length < MIN_H2H_MATCHES) {
        skipped++;
        console.log(`[Picker] SKIP (thin H2H): ${match.homeTeam.name} vs ${match.awayTeam.name} — only ${h2hCompleted.length} completed H2H (need ${MIN_H2H_MATCHES}+)`);
        continue;
      }

      console.log(`[Picker]   Home form: [${homeForm.join(",")}] | Away form: [${awayForm.join(",")}] | H2H: ${h2hHomeWins}W-${h2hDraws}D-${h2hAwayWins}L (${h2hCompleted.length} games)`);
      console.log(`[Picker]   Odds: H=${match.homeOdds} D=${match.drawOdds} A=${match.awayOdds}`);

      const result = scoreMatch({
        homeTeamName: match.homeTeam.name,
        awayTeamName: match.awayTeam.name,
        homeOdds:     match.homeOdds,
        drawOdds:     match.drawOdds,
        awayOdds:     match.awayOdds,
        homeForm,
        awayForm,
        h2hHomeWins,
        h2hAwayWins,
        h2hDraws,
        h2hTotal:     h2hCompleted.length,
        sentimentScore: 0.5,
        newsScore:      0.5,
      });

      console.log(`[Picker]   Score: pick=${result.pick} conf=${result.confidenceScore} odds=${result.americanOdds}`);

      if (result.pick === "SKIP" || result.confidenceScore < MIN_CONFIDENCE_THRESHOLD) {
        skipped++;
        console.log(`[Picker]   → SKIP (conf ${result.confidenceScore} < ${MIN_CONFIDENCE_THRESHOLD} or no clear edge)`);
        continue;
      }

      // Save pick to DB
      await prisma.pick.create({
        data: {
          matchId:         match.id,
          market:          result.market,
          selection:       result.selection,
          odds:            result.decimalOdds,
          americanOdds:    result.americanOdds,
          confidenceScore: result.confidenceScore,
          reasoning:       result.reasoning,
          sentimentSummary: result.sentimentSummary,
          status:          "PENDING",
        },
      });

      generated++;
      console.log(`[Picker] ✓ Generated: ${result.selection} @ ${result.americanOdds > 0 ? "+" : ""}${result.americanOdds} (conf: ${result.confidenceScore})`);
    } catch (err) {
      errors.push(`Match ${match.id}: ${String(err)}`);
      console.error(`[Picker] Error on match ${match.id}:`, err);
    }
  }

  await prisma.log.create({
    data: {
      type:    "PICKS",
      message: `Generated ${generated} picks, skipped ${skipped}, errors: ${errors.length}`,
      meta:    { errors, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString() },
    },
  });

  return { generated, skipped, errors };
}
