/**
 * Auto-settle cron — slot C (17:00 UTC).
 * Covers afternoon European league matches (kick-off 14:00–16:00 UTC → settled by 17:00).
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
  return autoSettle("slot-C");
}
