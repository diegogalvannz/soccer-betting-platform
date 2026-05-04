import { NextResponse } from "next/server";
import { settlePicks, updateFinishedMatchScores } from "@/modules/engine/settler";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Starting pick settlement...");

    // First: update any stale match scores from Football-Data.org
    await updateFinishedMatchScores();

    // Then: settle pending picks against finished matches
    const result = await settlePicks();

    console.log("[Cron] Settlement complete:", result);
    return NextResponse.json({
      success: true,
      settled: result.settled,
      skipped: result.skipped,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Cron] Settlement failed:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
