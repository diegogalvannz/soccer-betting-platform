/**
 * Admin: force-resolve a specific match with known final score.
 * Used when crons haven't run yet but the match is definitively finished.
 * POST /api/admin/force-resolve?secret=<CRON_SECRET>
 * Body: { matchId, homeScore, awayScore }
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { settlePicks } from "@/modules/engine/settler";

export async function POST(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { matchId, homeScore, awayScore } = await request.json();
  if (!matchId || homeScore === undefined || awayScore === undefined) {
    return NextResponse.json({ error: "matchId, homeScore, awayScore required" }, { status: 400 });
  }

  // Update match to FINISHED with the correct score
  const updated = await prisma.match.update({
    where: { id: matchId },
    data: { status: "FINISHED", homeScore, awayScore, updatedAt: new Date() },
  });

  // Now run the settler which will pick up this newly-finished match
  const result = await settlePicks();

  await prisma.log.create({
    data: {
      type: "ADMIN_FORCE_RESOLVE",
      message: `Force-resolved match ${matchId} (${updated.homeScore}-${updated.awayScore}). Settled ${result.settled} picks.`,
      meta: { matchId, homeScore, awayScore, ...result },
    },
  });

  return NextResponse.json({ success: true, match: updated, settle: result });
}
