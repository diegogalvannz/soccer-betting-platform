/**
 * Master daily cron — runs once at 06:00 UTC (00:00 Monterrey / CST = UTC-6).
 * Vercel free plan only allows one cron at daily frequency.
 *
 * Sequence:
 *   1. Ingest matches  — fetches -3d … +7d from API-Football, upserts DB
 *   2. Resolve picks   — fetches finished results, marks picks WON/LOST/VOID
 *   3. Generate picks  — runs the recommendation engine on upcoming matches
 *   4. Post-mortems    — learns from all LOST picks not yet analyzed
 *
 * Manual trigger: GET /api/cron/daily-runner?secret=<CRON_SECRET>
 */
import { NextResponse } from "next/server";
import { ingestUpcomingMatches, refreshOddsForUpcomingMatches } from "@/modules/stats/ingest";
import { resolvePicksFromApiFootball } from "@/modules/engine/resolver";
import { generatePicks } from "@/modules/engine/picker";
import { runPendingPostMortems } from "@/modules/engine/learning";
import { prisma } from "@/lib/prisma";

export const runtime     = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const secret     = new URL(request.url).searchParams.get("secret");

  const isVercelCron   = authHeader === `Bearer ${process.env.CRON_SECRET}`;
  const isManualTrigger = secret === process.env.CRON_SECRET;

  if (!isVercelCron && !isManualTrigger) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runStart = Date.now();
  const summary: Record<string, unknown> = {};

  // ── 1. Ingest matches ──────────────────────────────────────────────────────
  console.log("[DailyRunner] Step 1 — ingest matches");
  try {
    const ingest = await ingestUpcomingMatches();
    summary.ingest = { processed: ingest.processed, errors: ingest.errors.length };
    console.log(`[DailyRunner] Ingest done: ${ingest.processed} fixtures`);
  } catch (err) {
    summary.ingest = { error: String(err) };
    console.error("[DailyRunner] Ingest failed:", err);
  }

  // ── 1b. Odds refresh — fetch real market odds for all upcoming matches ────
  console.log("[DailyRunner] Step 1b — refresh odds for upcoming matches");
  try {
    const oddsRefresh = await refreshOddsForUpcomingMatches();
    summary.oddsRefresh = { updated: oddsRefresh.updated, skipped: oddsRefresh.skipped };
    console.log(`[DailyRunner] Odds refresh done: ${oddsRefresh.updated} updated`);
  } catch (err) {
    summary.oddsRefresh = { error: String(err) };
    console.error("[DailyRunner] Odds refresh failed:", err);
  }

  // ── 2. Resolve picks via API-Football ──────────────────────────────────────
  console.log("[DailyRunner] Step 2 — resolve pending picks");
  try {
    const resolve = await resolvePicksFromApiFootball();
    summary.resolve = { resolved: resolve.resolved, skipped: resolve.skipped, errors: resolve.errors.length };
    console.log(`[DailyRunner] Resolve done: ${resolve.resolved} resolved`);
  } catch (err) {
    summary.resolve = { error: String(err) };
    console.error("[DailyRunner] Resolve failed:", err);
  }

  // ── 3. Generate picks ──────────────────────────────────────────────────────
  console.log("[DailyRunner] Step 3 — generate picks");
  try {
    const picks = await generatePicks();
    summary.picks = { generated: picks.generated, skipped: picks.skipped, errors: picks.errors };
    console.log(`[DailyRunner] Picks done: ${picks.generated} generated`);
  } catch (err) {
    summary.picks = { error: String(err) };
    console.error("[DailyRunner] Pick generation failed:", err);
  }

  // ── 4. Post-mortem learning ────────────────────────────────────────────────
  console.log("[DailyRunner] Step 4 — post-mortem learning");
  try {
    const learning = await runPendingPostMortems();
    summary.learning = learning;
    console.log(`[DailyRunner] Learning done: ${learning.analyzed} analyzed`);
  } catch (err) {
    summary.learning = { error: String(err) };
    console.error("[DailyRunner] Learning failed:", err);
  }

  const elapsed = Date.now() - runStart;
  summary.elapsed = elapsed;

  await prisma.log.create({
    data: {
      type:    "DAILY_RUNNER",
      message: `daily-runner completed in ${elapsed}ms`,
      meta:    summary as unknown as import("@prisma/client").Prisma.InputJsonValue,
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, timestamp: new Date().toISOString(), ...summary });
}
