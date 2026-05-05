/**
 * Referee analysis module.
 *
 * Fetches the assigned referee for a fixture from API-Football,
 * retrieves their last N matches, counts yellow + red cards per game,
 * and classifies the referee's strictness level.
 *
 * Results are cached in the `Log` table (type="REFEREE_CACHE") for 24 hours
 * so we don't repeat API calls on the same referee within a single day.
 */

import { prisma } from "@/lib/prisma";

const BASE = "https://v3.football.api-sports.io";
const KEY  = process.env.API_FOOTBALL_KEY!;

function afHeaders() {
  return { "x-apisports-key": KEY };
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type RefereeStats = {
  name: string;
  avgYellowCards: number;
  avgRedCards: number;
  avgTotalCards: number;
  gamesAnalyzed: number;
  /** "strict" = >4 cards/game, "normal" = 2.5–4, "permissive" = <2.5 */
  strictnessLevel: "strict" | "normal" | "permissive";
  /** Human-readable label for use in pick reasoning */
  label: string;
};

type AFFixtureRaw = {
  fixture: { id: number; referee?: string | null; status: { short: string } };
  teams: { home: { id: number }; away: { id: number } };
  events?: Array<{
    type: string;
    detail: string;
  }>;
};

// ─── League average cards (fallback when no referee data) ─────────────────────

export const LEAGUE_AVG_CARDS: Record<string, number> = {
  "Premier League":            3.6,
  "La Liga":                   4.3,
  "Serie A":                   4.0,
  "Bundesliga":                3.3,
  "Ligue 1":                   4.1,
  "Primeira Liga":             4.0,
  "Eredivisie":                3.5,
  "Champions League":          3.2,
  "Europa League":             3.8,
  "Conference League":         3.6,
  "Liga MX":                   4.5,
  "MLS":                       3.7,
  "Brasileirão":               4.8,
  "Liga Profesional Argentina": 5.0,
  "Copa Libertadores":         4.6,
  "Copa Sudamericana":         4.7,
  "Concacaf Champions Cup":    4.4,
  "Saudi Pro League":          4.2,
};

export function leagueAvgCards(league: string): number {
  return LEAGUE_AVG_CARDS[league] ?? 3.8; // global default
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 24 * 3600_000; // 24 hours
const CACHE_TYPE   = "REFEREE_CACHE";

async function getCachedRefereeStats(refereeName: string): Promise<RefereeStats | null> {
  try {
    const row = await prisma.log.findFirst({
      where: {
        type:    CACHE_TYPE,
        message: refereeName,
        createdAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row?.meta) return null;
    return row.meta as unknown as RefereeStats;
  } catch {
    return null;
  }
}

async function cacheRefereeStats(stats: RefereeStats): Promise<void> {
  try {
    await prisma.log.create({
      data: {
        type:    CACHE_TYPE,
        message: stats.name,
        meta:    stats as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── API helpers ───────────────────────────────────────────────────────────────

async function fetchFixtureRaw(fixtureId: number): Promise<AFFixtureRaw | null> {
  try {
    const res = await fetch(`${BASE}/fixtures?id=${fixtureId}`, {
      headers: afHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.response?.[0] ?? null;
  } catch {
    return null;
  }
}

async function fetchRefereeFixtures(refereeName: string, last = 15): Promise<AFFixtureRaw[]> {
  try {
    const encoded = encodeURIComponent(refereeName);
    const season  = new Date().getFullYear();
    const res = await fetch(
      `${BASE}/fixtures?referee=${encoded}&season=${season}&last=${last}`,
      { headers: afHeaders(), cache: "no-store" }
    );
    if (!res.ok) return [];
    const json = await res.json();
    return json.response ?? [];
  } catch {
    return [];
  }
}

async function fetchFixtureEvents(fixtureId: number): Promise<Array<{ type: string; detail: string }>> {
  try {
    const res = await fetch(`${BASE}/fixtures/events?fixture=${fixtureId}`, {
      headers: afHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.response ?? [];
  } catch {
    return [];
  }
}

// ─── Core analysis ─────────────────────────────────────────────────────────────

function classifyStrictness(avg: number): { level: "strict" | "normal" | "permissive"; label: string } {
  if (avg >= 4.0) return { level: "strict",     label: `árbitro estricto (${avg.toFixed(1)} tarjetas/partido)` };
  if (avg <= 2.5) return { level: "permissive", label: `árbitro permisivo (${avg.toFixed(1)} tarjetas/partido)` };
  return         { level: "normal",             label: `árbitro promedio (${avg.toFixed(1)} tarjetas/partido)` };
}

/**
 * Get the referee name assigned to a specific fixture.
 * Returns null if the fixture can't be fetched or has no referee assigned yet.
 */
export async function getRefereeForFixture(fixtureId: number): Promise<string | null> {
  const fixture = await fetchFixtureRaw(fixtureId);
  return fixture?.fixture?.referee ?? null;
}

/**
 * Full referee analysis.
 * Checks the 24-hour cache first; if not cached, fetches last 15 games
 * and their card events, computes averages, caches and returns.
 */
export async function analyzeReferee(refereeName: string): Promise<RefereeStats | null> {
  if (!refereeName?.trim()) return null;

  // 1. Cache hit
  const cached = await getCachedRefereeStats(refereeName);
  if (cached) {
    console.log(`[Referee] Cache hit: ${refereeName} — avg ${cached.avgTotalCards.toFixed(1)} cards`);
    return cached;
  }

  // 2. Fetch recent fixtures for this referee
  const fixtures = await fetchRefereeFixtures(refereeName, 15);
  const completed = fixtures.filter(
    (f) => ["FT", "AET", "PEN"].includes(f.fixture.status.short)
  );

  if (completed.length < 5) {
    console.log(`[Referee] Insufficient data for ${refereeName}: ${completed.length} completed games`);
    return null;
  }

  // 3. Fetch events for each completed fixture (batched, limited to 10 games)
  const sample = completed.slice(0, 10);
  let totalYellow = 0;
  let totalRed    = 0;
  let gamesCount  = 0;

  for (const fix of sample) {
    const events = await fetchFixtureEvents(fix.fixture.id);
    const yellows = events.filter((e) => e.type === "Card" && e.detail === "Yellow Card").length;
    const reds    = events.filter(
      (e) => e.type === "Card" && (e.detail === "Red Card" || e.detail === "Second Yellow card")
    ).length;
    totalYellow += yellows;
    totalRed    += reds;
    gamesCount++;
  }

  if (gamesCount === 0) return null;

  const avgYellow = totalYellow / gamesCount;
  const avgRed    = totalRed    / gamesCount;
  const avgTotal  = avgYellow + avgRed;
  const { level, label } = classifyStrictness(avgTotal);

  const stats: RefereeStats = {
    name:            refereeName,
    avgYellowCards:  +avgYellow.toFixed(2),
    avgRedCards:     +avgRed.toFixed(2),
    avgTotalCards:   +avgTotal.toFixed(2),
    gamesAnalyzed:   gamesCount,
    strictnessLevel: level,
    label,
  };

  console.log(`[Referee] Analyzed ${refereeName}: avg ${avgTotal.toFixed(1)} cards/game over ${gamesCount} matches → ${level}`);
  await cacheRefereeStats(stats);
  return stats;
}

/**
 * Convenience: get referee for fixture then fully analyze them.
 * Returns null if referee is not yet assigned or data is insufficient.
 */
export async function getRefereeStatsForFixture(fixtureId: number): Promise<RefereeStats | null> {
  const name = await getRefereeForFixture(fixtureId);
  if (!name) return null;
  return analyzeReferee(name);
}
