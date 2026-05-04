/**
 * Auto-settle cron — slot A (01:00 UTC).
 * Checks for any matches that kicked off 2+ hours ago that still have PENDING picks,
 * fetches their results from Football-Data.org, and settles the picks.
 * Runs daily at 01:00 UTC — covers late-night Asian / early European games.
 */
import { NextResponse } from "next/server";
import { autoSettle } from "@/modules/engine/auto-settle";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return autoSettle("slot-A");
}
