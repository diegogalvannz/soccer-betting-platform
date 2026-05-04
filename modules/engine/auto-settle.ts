/**
 * Auto-settle engine.
 *
 * Logic:
 *  1. Find all matches that kicked off 2+ hours ago but are still SCHEDULED/LIVE
 *     and have at least one PENDING pick.
 *  2. Fetch the final result from Football-Data.org for each such match.
 *  3. Mark the match FINISHED with the correct scores.
 *  4. Settle all PENDING picks for that match (WON/LOST).
 *  5. Also re-evaluate any VOID picks from finished matches (catches historical errors).
 *
 * Called by four daily cron slots (01:00 / 09:00 / 17:00 / 23:00 UTC) so that
 * any match that finishes within a 6-hour window gets settled automatically.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settlePicks, reEvaluateVoidPicks } from "./settler";

const FD_API = "https://api.football-data.org/v4";
const DELAY_MS = 7_000; // FD.org free tier: max 10 req/min

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

type FDMatch = {
  id: number;
  status: string;
  score: { fullTime: { home: number | null; away: number | null } };
};

async function fetchFDMatch(externalId: string, apiKey: string): Promise<FDMatch | null> {
  try {
    const res = await fetch(`${FD_API}/matches/${externalId}`, {
      headers: { "X-Auth-Token": apiKey },
    });
    if (!res.ok) return null;
    return (await res.json()) as FDMatch;
  } catch {
    return null;
  }
}

export async function autoSettle(slot: string): Promise<NextResponse> {
  const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
  if (!FOOTBALL_DATA_API_KEY) {
    return NextResponse.json({ error: "FOOTBALL_DATA_API_KEY not set" }, { status: 500 });
  }

  console.log(`[AutoSettle:${slot}] Starting…`);

  // Matches that kicked off 2+ hours ago but are not yet finished
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1_000);

  const staleMatches = await prisma.match.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      matchDate: { lt: twoHoursAgo },
      picks: { some: { status: "PENDING" } },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });

  console.log(`[AutoSettle:${slot}] Found ${staleMatches.length} stale matches with pending picks`);

  let matchesUpdated = 0;

  for (const match of staleMatches) {
    // Only direct FD.org lookup works reliably here (real numeric IDs)
    if (!/^\d+$/.test(match.externalId)) {
      console.log(`[AutoSettle:${slot}] Skipping ${match.homeTeam.name} vs ${match.awayTeam.name} — non-numeric ID`);
      continue;
    }

    const fdMatch = await fetchFDMatch(match.externalId, FOOTBALL_DATA_API_KEY);
    await sleep(DELAY_MS);

    if (!fdMatch) {
      console.log(`[AutoSettle:${slot}] No FD data for match ${match.externalId}`);
      continue;
    }

    if (fdMatch.status === "FINISHED") {
      const homeScore = fdMatch.score.fullTime.home;
      const awayScore = fdMatch.score.fullTime.away;

      if (homeScore === null || awayScore === null) continue;

      await prisma.match.update({
        where: { id: match.id },
        data: { status: "FINISHED", homeScore, awayScore, updatedAt: new Date() },
      });

      console.log(
        `[AutoSettle:${slot}] ${match.homeTeam.name} ${homeScore}-${awayScore} ${match.awayTeam.name} → FINISHED`
      );
      matchesUpdated++;
    } else if (fdMatch.status === "POSTPONED" || fdMatch.status === "CANCELLED") {
      // Mark match accordingly — picks will be voided by settler
      await prisma.match.update({
        where: { id: match.id },
        data: {
          status: fdMatch.status === "POSTPONED" ? "POSTPONED" : "CANCELLED",
          updatedAt: new Date(),
        },
      });
    }
  }

  // Settle all pending picks whose matches are now FINISHED
  const settlement = await settlePicks();

  // Also fix any historical VOID picks that were wrongly voided
  const reeval = await reEvaluateVoidPicks();

  console.log(
    `[AutoSettle:${slot}] Done — matchesUpdated=${matchesUpdated} settled=${settlement.settled} corrected=${reeval.corrected}`
  );

  await prisma.log.create({
    data: {
      type: "AUTO_SETTLE",
      message: `[${slot}] matchesUpdated=${matchesUpdated} settled=${settlement.settled} corrected=${reeval.corrected}`,
      meta: { slot, matchesUpdated, ...settlement, reeval },
    },
  }).catch(() => {});

  return NextResponse.json({
    success: true,
    slot,
    matchesUpdated,
    settled: settlement.settled,
    skipped: settlement.skipped,
    corrected: reeval.corrected,
    errors: [...settlement.errors, ...reeval.errors],
    timestamp: new Date().toISOString(),
  });
}
