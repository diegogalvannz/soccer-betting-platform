/**
 * Admin endpoint: re-evaluate all VOID picks that came from finished matches.
 * Corrects picks that were wrongly voided due to evaluation logic failures.
 * Also runs updateFinishedMatchScores first to ensure scores are populated.
 *
 * GET /api/admin/re-evaluate-picks?secret=<CRON_SECRET>
 */
import { NextResponse } from "next/server";
import { reEvaluateVoidPicks, updateFinishedMatchScores } from "@/modules/engine/settler";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get("secret");
  const authHeader = request.headers.get("authorization");

  const isAuthorized =
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    secret === process.env.CRON_SECRET;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Admin] Updating finished match scores before re-evaluation...");
    await updateFinishedMatchScores();

    console.log("[Admin] Re-evaluating VOID picks...");
    const result = await reEvaluateVoidPicks();

    return NextResponse.json({
      success: true,
      corrected: result.corrected,
      kept: result.kept,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Admin] Re-evaluation failed:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
