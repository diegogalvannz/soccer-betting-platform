/**
 * Auto-settle cron — slot B (09:00 UTC).
 * Covers overnight results, early kick-offs.
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
  return autoSettle("slot-B");
}
