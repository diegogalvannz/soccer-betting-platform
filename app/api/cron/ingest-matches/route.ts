import { NextResponse } from "next/server";
import { ingestUpcomingMatches } from "@/modules/stats/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  // Verify this is called by Vercel Cron or our own secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Starting match ingestion...");
    const result = await ingestUpcomingMatches();
    console.log("[Cron] Match ingestion complete:", result);

    return NextResponse.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Cron] Match ingestion failed:", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 }
    );
  }
}
