/**
 * Admin endpoint: run post-mortem analysis on all LOST picks not yet analyzed.
 * GET /api/admin/run-learning?secret=<CRON_SECRET>
 */
import { NextResponse } from "next/server";
import { runPendingPostMortems } from "@/modules/engine/learning";

export async function GET(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runPendingPostMortems();
  return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
}
