/**
 * Pick generation pipeline — multi-market edition.
 *
 * For each upcoming match (30h window):
 *   1. Gate checks: real odds, form depth ≥ 4
 *   2. Fetch: form (7 games), H2H (5 games), expanded odds, referee stats
 *   3. Score all markets via scoreAllMarkets()
 *   4. Save qualifying picks (conf ≥ MIN_CONFIDENCE_THRESHOLD)
 *
 * After the primary pass, if fewer than MIN_PICKS_PER_RUN picks were generated,
 * runs a fallback pass at FALLBACK_CONFIDENCE_THRESHOLD (60) over already-scored
 * candidates to meet the minimum — never publishes zero picks when matches exist.
 *
 * Window: now → now+30h (captures Liga MX, CONCACAF, Copa late-night UTC fixtures).
 * Called by /api/cron/daily-runner daily at 06:00 UTC.
 */

import { prisma } from "@/lib/prisma";
import { scoreAllMarkets, MultiMarketStats } from "./scorer";
import {
  MIN_CONFIDENCE_THRESHOLD,
  PICKS_CUTOFF_HOURS,
  MAX_PICKS_PER_RUN,
  MIN_FORM_MATCHES,
  MIN_PICKS_PER_RUN,
  FALLBACK_CONFIDENCE_THRESHOLD,
} from "./thresholds";
import {
  getTeamRecentFixtures,
  getH2H,
  getExpandedOdds,
  type AFFixture,
  type ExpandedOdds,
} from "../stats/api-football-client";
import { getRefereeStatsForFixture } from "../stats/referee-client";
import { sleep } from "@/lib/utils";
import { FOOTBALL_DATA_DELAY_MS } from "@/config/leagues";
import type { ScoreResult } from "@/types";

// ─── Form parser — API-Football format ───────────────────────────────────────

function parseAFForm(fixtures: AFFixture[], teamAfId: number): number[] {
  return fixtures
    .filter((f) => ["FT", "AET", "PEN"].includes(f.fixture.status.short))
    .slice(0, 5)
    .map((f) => {
      const isHome = f.teams.home.id === teamAfId;
      const winner = isHome ? f.teams.home.winner : f.teams.away.winner;
      if (winner === true)  return 3;
      if (winner === false) return 0;
      return 1; // draw
    });
}

function afTeamId(externalId: string): number | null {
  if (!externalId.startsWith("af_")) return null;
  const n = parseInt(externalId.slice(3), 10);
  return isNaN(n) ? null : n;
}

function afFixtureId(externalId: string): number | null {
  // Match externalId stored as plain numeric string from AF ingest
  const n = parseInt(externalId, 10);
  return isNaN(n) ? null : n;
}

// ─── Candidate (pre-threshold pick stored for fallback pass) ──────────────────

type Candidate = {
  matchId:  string;
  matchLabel: string;
  result:   ScoreResult;
  alreadySaved: boolean;
};

// ─── Main pipeline ────────────────────────────────────────────────────────────

export async function generatePicks(): Promise<{
  generated: number;
  skipped: number;
  errors: string[];
}> {
  const now        = new Date();
  const windowEnd  = new Date(now.getTime() + 30 * 3600_000);
  const cutoffTime = new Date(Date.now() + PICKS_CUTOFF_HOURS * 3600_000);

  const matches = await prisma.match.findMany({
    where: {
      status:    "SCHEDULED",
      matchDate: { gte: now, lt: windowEnd },
      picks:     { none: {} },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy:  { matchDate: "asc" },
    take:     25,
  });

  let generated = 0;
  let skipped   = 0;
  const errors: string[] = [];
  const candidates: Candidate[] = []; // for fallback pass

  // ── Primary pass (threshold = MIN_CONFIDENCE_THRESHOLD) ──────────────────
  for (const match of matches) {
    if (generated >= MAX_PICKS_PER_RUN) break;

    if (match.matchDate < cutoffTime) {
      skipped++;
      console.log(`[Picker] CUTOFF: ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      continue;
    }

    const homeAfId = afTeamId(match.homeTeam.externalId);
    const awayAfId = afTeamId(match.awayTeam.externalId);
    if (homeAfId === null || awayAfId === null) {
      skipped++;
      console.log(`[Picker] SKIP (legacy IDs): ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      continue;
    }

    // Gate 1: real market odds required
    if (match.homeOdds === null || match.awayOdds === null) {
      skipped++;
      console.log(`[Picker] SKIP (no odds): ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      continue;
    }

    try {
      console.log(`[Picker] Analyzing: ${match.homeTeam.name} vs ${match.awayTeam.name} — ${match.league}`);

      // Fetch form + H2H in parallel
      const [homeRes, awayRes] = await Promise.allSettled([
        getTeamRecentFixtures(homeAfId, 7),
        getTeamRecentFixtures(awayAfId, 7),
      ]);
      await sleep(FOOTBALL_DATA_DELAY_MS);

      const h2hFixtures = await getH2H(homeAfId, awayAfId, 5).catch(() => [] as AFFixture[]);
      await sleep(FOOTBALL_DATA_DELAY_MS);

      const homeFixtures = homeRes.status === "fulfilled" ? homeRes.value : [];
      const awayFixtures = awayRes.status === "fulfilled" ? awayRes.value : [];

      const homeForm = parseAFForm(homeFixtures, homeAfId);
      const awayForm = parseAFForm(awayFixtures, awayAfId);

      // Gate 2: form depth
      if (homeForm.length < MIN_FORM_MATCHES || awayForm.length < MIN_FORM_MATCHES) {
        skipped++;
        console.log(`[Picker] SKIP (thin form): ${match.homeTeam.name}(${homeForm.length}) vs ${match.awayTeam.name}(${awayForm.length}) need ${MIN_FORM_MATCHES}+`);
        continue;
      }

      // H2H (no minimum now — weighted less when thin)
      let h2hHomeWins = 0, h2hAwayWins = 0, h2hDraws = 0;
      const h2hCompleted: AFFixture[] = [];
      for (const f of h2hFixtures) {
        if (!["FT", "AET", "PEN"].includes(f.fixture.status.short)) continue;
        h2hCompleted.push(f);
        const homeIsActualHome = f.teams.home.id === homeAfId;
        const winner = homeIsActualHome ? f.teams.home.winner : f.teams.away.winner;
        if (winner === true)       h2hHomeWins++;
        else if (winner === false) h2hAwayWins++;
        else                       h2hDraws++;
      }

      // Fetch expanded odds + referee in parallel
      const fixtureNumId = afFixtureId(match.externalId);
      const [expandedOdds, refereeStats] = await Promise.allSettled([
        fixtureNumId ? getExpandedOdds(fixtureNumId) : Promise.resolve(null as unknown as ExpandedOdds),
        fixtureNumId ? getRefereeStatsForFixture(fixtureNumId) : Promise.resolve(null),
      ]);
      await sleep(FOOTBALL_DATA_DELAY_MS);

      const odds: ExpandedOdds = (expandedOdds.status === "fulfilled" && expandedOdds.value)
        ? expandedOdds.value
        : { homeOdds: null, drawOdds: null, awayOdds: null, dc1xOdds: null, dcX2Odds: null, dc12Odds: null, bttsYesOdds: null, bttsNoOdds: null, goalsLines: [], cardsLines: [] };

      const referee = refereeStats.status === "fulfilled" ? refereeStats.value : null;

      const stats: MultiMarketStats = {
        homeTeamName:  match.homeTeam.name,
        awayTeamName:  match.awayTeam.name,
        league:        match.league,
        homeOdds:      match.homeOdds,
        drawOdds:      match.drawOdds,
        awayOdds:      match.awayOdds,
        homeForm,
        awayForm,
        homeFixtures,
        awayFixtures,
        h2hHomeWins,
        h2hAwayWins,
        h2hDraws,
        h2hTotal:      h2hCompleted.length,
        bttsYesOdds:   odds.bttsYesOdds,
        bttsNoOdds:    odds.bttsNoOdds,
        goalsLines:    odds.goalsLines,
        cardsLines:    odds.cardsLines,
        dc1xOdds:      odds.dc1xOdds,
        dcX2Odds:      odds.dcX2Odds,
        dc12Odds:      odds.dc12Odds,
        refereeStats:  referee,
        sentimentScore: 0.5,
        newsScore:      0.5,
      };

      const allResults = scoreAllMarkets(stats);
      const label = `${match.homeTeam.name} vs ${match.awayTeam.name}`;

      console.log(`[Picker]   Form H:[${homeForm.join(",")}] A:[${awayForm.join(",")}] | H2H:${h2hHomeWins}W-${h2hDraws}D-${h2hAwayWins}L(${h2hCompleted.length})`);
      console.log(`[Picker]   Odds 1X2: H=${match.homeOdds} D=${match.drawOdds} A=${match.awayOdds} | BTTS:${odds.bttsYesOdds ?? "N/D"} | O/U lines:${odds.goalsLines.length} | Cards:${odds.cardsLines.length} | Referee:${referee?.name ?? "unknown"}`);
      console.log(`[Picker]   Markets scored: ${allResults.length} (best conf=${allResults[0]?.confidenceScore ?? 0})`);

      let matchGenerated = 0;
      for (const result of allResults) {
        if (generated + matchGenerated >= MAX_PICKS_PER_RUN) break;

        // Store every candidate for fallback pass
        candidates.push({ matchId: match.id, matchLabel: label, result, alreadySaved: false });

        if (result.pick === "SKIP" || result.confidenceScore < MIN_CONFIDENCE_THRESHOLD) {
          console.log(`[Picker]   → SKIP market=${result.market} conf=${result.confidenceScore} (< ${MIN_CONFIDENCE_THRESHOLD})`);
          continue;
        }

        await savePick(match.id, result);
        candidates[candidates.length - 1].alreadySaved = true;
        matchGenerated++;
        generated++;
        console.log(`[Picker] ✓ ${result.market}: ${result.selection} @ ${result.americanOdds > 0 ? "+" : ""}${result.americanOdds} (conf:${result.confidenceScore})`);
      }

      if (matchGenerated === 0) {
        skipped++;
        console.log(`[Picker]   → No qualifying picks for this match`);
      }

    } catch (err) {
      errors.push(`Match ${match.id}: ${String(err)}`);
      console.error(`[Picker] Error on match ${match.id}:`, err);
    }
  }

  // ── Fallback pass: meet MIN_PICKS_PER_RUN at lower threshold ─────────────
  if (generated < MIN_PICKS_PER_RUN && candidates.length > 0) {
    console.log(`[Picker] Fallback pass: only ${generated}/${MIN_PICKS_PER_RUN} picks — trying threshold ${FALLBACK_CONFIDENCE_THRESHOLD}`);

    // Sort remaining candidates by confidence descending
    const unsaved = candidates
      .filter((c) => !c.alreadySaved && c.result.pick !== "SKIP")
      .sort((a, b) => b.result.confidenceScore - a.result.confidenceScore);

    for (const c of unsaved) {
      if (generated >= MIN_PICKS_PER_RUN || generated >= MAX_PICKS_PER_RUN) break;
      if (c.result.confidenceScore < FALLBACK_CONFIDENCE_THRESHOLD) continue;

      try {
        await savePick(c.matchId, c.result);
        c.alreadySaved = true;
        generated++;
        console.log(`[Picker] ✓ Fallback: ${c.result.market}: ${c.result.selection} @ ${c.result.americanOdds > 0 ? "+" : ""}${c.result.americanOdds} (conf:${c.result.confidenceScore}) — ${c.matchLabel}`);
      } catch (err) {
        errors.push(`Fallback pick ${c.matchId}: ${String(err)}`);
      }
    }

    if (generated < MIN_PICKS_PER_RUN) {
      console.log(`[Picker] Fallback exhausted: only ${generated} qualifying picks found. Publishing ${generated} (zero inflation avoided).`);
    }
  }

  await prisma.log.create({
    data: {
      type:    "PICKS",
      message: `Generated ${generated} picks, skipped ${skipped}, errors: ${errors.length}`,
      meta:    { errors, windowStart: now.toISOString(), windowEnd: windowEnd.toISOString() },
    },
  });

  return { generated, skipped, errors };
}

// ─── DB write ─────────────────────────────────────────────────────────────────

async function savePick(matchId: string, result: ScoreResult): Promise<void> {
  await prisma.pick.create({
    data: {
      matchId,
      market:          result.market,
      selection:       result.selection,
      odds:            result.decimalOdds,
      americanOdds:    result.americanOdds,
      confidenceScore: result.confidenceScore,
      reasoning:       result.reasoning,
      sentimentSummary: result.sentimentSummary,
      status:          "PENDING",
    },
  });
}
