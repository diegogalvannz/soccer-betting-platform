/**
 * Pick generation pipeline.
 * For each upcoming match, fetches stats and runs the scorer.
 * Saves qualifying picks to the DB.
 * Called by /api/cron/generate-picks daily at 8am.
 */
import { prisma } from "@/lib/prisma";
import { scoreMatch } from "./scorer";
import { MIN_CONFIDENCE_THRESHOLD, PICKS_CUTOFF_HOURS, MAX_PICKS_PER_RUN } from "./thresholds";
import { getTeamRecentMatches, getHeadToHead } from "../stats/football-data-client";
import { sleep } from "@/lib/utils";
import { FOOTBALL_DATA_DELAY_MS } from "@/config/leagues";

function parseFormResults(
  matches: Array<{
    score: { fullTime: { home: number | null; away: number | null } };
    homeTeam: { id: number };
  }>,
  teamExternalId: string
): number[] {
  return matches.map((m) => {
    const isHome = String(m.homeTeam.id) === teamExternalId;
    const homeScore = m.score.fullTime.home ?? 0;
    const awayScore = m.score.fullTime.away ?? 0;
    if (isHome) {
      return homeScore > awayScore ? 3 : homeScore === awayScore ? 1 : 0;
    } else {
      return awayScore > homeScore ? 3 : homeScore === awayScore ? 1 : 0;
    }
  });
}

export async function generatePicks(): Promise<{
  generated: number;
  skipped: number;
  errors: string[];
}> {
  const cutoffTime = new Date(Date.now() + PICKS_CUTOFF_HOURS * 3600000);
  const lookAhead = new Date(Date.now() + 48 * 3600000);

  // Get upcoming matches without picks already
  const matches = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      matchDate: { gt: new Date(), lt: lookAhead },
      picks: { none: {} },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { matchDate: "asc" },
    take: 20,
  });

  let generated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const match of matches) {
    if (generated >= MAX_PICKS_PER_RUN) break;

    // Skip matches kicking off too soon
    if (match.matchDate < cutoffTime) {
      skipped++;
      continue;
    }

    try {
      // Fetch recent form for both teams
      const [homeMatches, awayMatches] = await Promise.allSettled([
        getTeamRecentMatches(parseInt(match.homeTeam.externalId), 5),
        getTeamRecentMatches(parseInt(match.awayTeam.externalId), 5),
      ]);

      await sleep(FOOTBALL_DATA_DELAY_MS);

      // Fetch H2H for the match (using the externalId as match ID)
      const h2hMatches = await getHeadToHead(parseInt(match.externalId)).catch(() => []);

      await sleep(FOOTBALL_DATA_DELAY_MS);

      const homeForm = homeMatches.status === "fulfilled"
        ? parseFormResults(homeMatches.value as Parameters<typeof parseFormResults>[0], match.homeTeam.externalId)
        : [1, 1, 1, 1, 1];

      const awayForm = awayMatches.status === "fulfilled"
        ? parseFormResults(awayMatches.value as Parameters<typeof parseFormResults>[0], match.awayTeam.externalId)
        : [1, 1, 1, 1, 1];

      // Count H2H results
      let h2hHomeWins = 0, h2hAwayWins = 0, h2hDraws = 0;
      for (const h of h2hMatches) {
        const homeGoals = h.score.fullTime.home ?? 0;
        const awayGoals = h.score.fullTime.away ?? 0;
        if (homeGoals > awayGoals) h2hHomeWins++;
        else if (awayGoals > homeGoals) h2hAwayWins++;
        else h2hDraws++;
      }

      const result = scoreMatch({
        homeTeamName: match.homeTeam.name,
        awayTeamName: match.awayTeam.name,
        homeOdds: match.homeOdds,
        drawOdds: match.drawOdds,
        awayOdds: match.awayOdds,
        homeForm,
        awayForm,
        h2hHomeWins,
        h2hAwayWins,
        h2hDraws,
        h2hTotal: h2hMatches.length,
        sentimentScore: 0.5, // Neutral until sentiment module is active
        newsScore: 0.5,
      });

      if (result.pick === "SKIP" || result.confidenceScore < MIN_CONFIDENCE_THRESHOLD) {
        skipped++;
        continue;
      }

      // Save pick to DB
      await prisma.pick.create({
        data: {
          matchId: match.id,
          market: result.market,
          selection: result.selection,
          odds: result.decimalOdds,
          americanOdds: result.americanOdds,
          confidenceScore: result.confidenceScore,
          reasoning: result.reasoning,
          sentimentSummary: result.sentimentSummary,
          status: "PENDING",
        },
      });

      generated++;
      console.log(
        `[Picker] Generated pick: ${result.selection} @ ${result.americanOdds > 0 ? "+" : ""}${result.americanOdds} (conf: ${result.confidenceScore})`
      );
    } catch (err) {
      errors.push(`Match ${match.id}: ${String(err)}`);
    }
  }

  await prisma.log.create({
    data: {
      type: "PICKS",
      message: `Generated ${generated} picks, skipped ${skipped}, errors: ${errors.length}`,
      meta: { errors },
    },
  });

  return { generated, skipped, errors };
}
