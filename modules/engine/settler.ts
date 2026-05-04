/**
 * Pick settler.
 * Runs after matches finish — compares final score to pick selection,
 * marks picks WON/LOST/VOID, updates Bet records with profit/loss.
 * Called by /api/cron/settle-picks at midnight.
 */
import { prisma } from "@/lib/prisma";
import { runPostMortem } from "@/modules/engine/learning";

type PickWithMatch = {
  id: string;
  market: string;
  selection: string;
  odds: number;
  status: string;
  match: {
    id: string;
    status: string;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: { name: string; shortName: string | null };
    awayTeam: { name: string; shortName: string | null };
  };
  bets: Array<{
    id: string;
    stake: number;
    odds: number;
    result: string;
  }>;
};

/**
 * Normalize a team name for fuzzy comparison.
 * Strips FC/CF/SC suffixes, lowercases, collapses whitespace.
 */
function normalizeTeam(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/\b(fc|cf|sc|afc|bfc|fk|sk|sv|ac|as|ss|rc|cd|ud|cf|if|bk)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if selectionStr refers to teamName (or teamShort).
 * Uses exact match after normalization, then first-word prefix check.
 */
function selectionMatchesTeam(
  selectionStr: string,
  teamName: string,
  teamShort: string | null | undefined
): boolean {
  const sel = normalizeTeam(selectionStr);
  const fullName = normalizeTeam(teamName);
  const shortName = normalizeTeam(teamShort);

  if (sel === fullName) return true;
  if (shortName && sel === shortName) return true;

  // First significant word of the team appears in selection, or vice versa
  const firstWord = fullName.split(" ").find(w => w.length > 2) ?? "";
  if (firstWord && sel.includes(firstWord)) return true;
  if (firstWord && firstWord.length > 4 && fullName.includes(sel.split(" ")[0] ?? "")) return true;

  // "Arsenal Win" / "Nottingham Forest Win" style
  const stripped = sel.replace(/\bwin\b/g, "").trim();
  if (stripped && (normalizeTeam(teamName).includes(stripped) || stripped.includes(normalizeTeam(teamName).split(" ")[0]))) {
    return true;
  }

  return false;
}

/**
 * Evaluate a pick against a final score.
 * Returns "WON", "LOST", "VOID" (only for push/dead-heat), or null (= keep PENDING for manual review).
 * NEVER returns VOID just because evaluation failed — that keeps picks reviewable.
 */
function decidePickResult(
  pick: PickWithMatch,
  homeScore: number,
  awayScore: number
): "WON" | "LOST" | "VOID" | null {
  const { market, selection } = pick;
  const sel = selection.trim();
  const totalGoals = homeScore + awayScore;

  // ── 1X2 / Match Winner ────────────────────────────────────────────────────
  if (market === "1X2" || market === "Match Winner") {
    const selLower = sel.toLowerCase();

    // Explicit draw
    if (sel === "Draw" || sel === "X" || selLower === "empate") {
      return homeScore === awayScore ? "WON" : "LOST";
    }
    // Explicit home/away keywords
    if (selLower === "home" || selLower === "1") {
      return homeScore > awayScore ? "WON" : "LOST";
    }
    if (selLower === "away" || selLower === "2") {
      return awayScore > homeScore ? "WON" : "LOST";
    }

    // Team name matching — home first, then away
    if (selectionMatchesTeam(sel, pick.match.homeTeam.name, pick.match.homeTeam.shortName)) {
      return homeScore > awayScore ? "WON" : "LOST";
    }
    if (selectionMatchesTeam(sel, pick.match.awayTeam.name, pick.match.awayTeam.shortName)) {
      return awayScore > homeScore ? "WON" : "LOST";
    }

    // Could not resolve — log and keep PENDING
    console.warn(
      `[Settler] Cannot match selection "${sel}" to either team (${pick.match.homeTeam.name} vs ${pick.match.awayTeam.name}) — keeping PENDING`
    );
    return null;
  }

  // ── Over/Under ────────────────────────────────────────────────────────────
  if (market === "Over/Under" || market === "Goals Over/Under") {
    const m = sel.match(/([Oo]ver|[Uu]nder)\s*([\d.]+)/);
    if (m) {
      const direction = m[1].toLowerCase();
      const line = parseFloat(m[2]);
      if (direction === "over") return totalGoals > line ? "WON" : totalGoals === line ? "VOID" : "LOST";
      return totalGoals < line ? "WON" : totalGoals === line ? "VOID" : "LOST";
    }
    console.warn(`[Settler] Over/Under: cannot parse line from "${sel}" — keeping PENDING`);
    return null;
  }

  // ── BTTS ─────────────────────────────────────────────────────────────────
  if (market === "Both Teams to Score" || market === "BTTS") {
    const bttsYes = homeScore > 0 && awayScore > 0;
    const selLower = sel.toLowerCase();
    if (selLower.includes("yes") || sel === "BTTS - Yes") return bttsYes ? "WON" : "LOST";
    if (selLower.includes("no")  || sel === "BTTS - No")  return !bttsYes ? "WON" : "LOST";
    console.warn(`[Settler] BTTS: unrecognised selection "${sel}" — keeping PENDING`);
    return null;
  }

  // ── Double Chance ─────────────────────────────────────────────────────────
  if (market === "Double Chance") {
    if (sel === "1X" || sel === "Home or Draw") return homeScore >= awayScore ? "WON" : "LOST";
    if (sel === "X2" || sel === "Away or Draw") return awayScore >= homeScore ? "WON" : "LOST";
    if (sel === "12" || sel === "Home or Away") return homeScore !== awayScore ? "WON" : "LOST";
    console.warn(`[Settler] Double Chance: unrecognised selection "${sel}" — keeping PENDING`);
    return null;
  }

  // ── Asian Handicap ────────────────────────────────────────────────────────
  if (market === "Asian Handicap") {
    const m = sel.match(/([+-]?\d+\.?\d*)/);
    if (m) {
      const handicap = parseFloat(m[1]);
      const adjustedHome = homeScore + handicap;
      return adjustedHome > awayScore ? "WON" : adjustedHome === awayScore ? "VOID" : "LOST";
    }
    console.warn(`[Settler] Asian Handicap: cannot parse handicap from "${sel}" — keeping PENDING`);
    return null;
  }

  // ── Unknown market — do NOT void, keep PENDING for manual review ──────────
  console.warn(`[Settler] Unknown market "${market}" for pick ${pick.id} — keeping PENDING`);
  return null;
}

function calculateProfit(stake: number, odds: number, result: "WON" | "LOST" | "VOID"): number {
  if (result === "WON") return Math.round((stake * (odds - 1)) * 100) / 100;
  if (result === "LOST") return -stake;
  return 0; // VOID: stake returned
}

export async function settlePicks(): Promise<{
  settled: number;
  skipped: number;
  errors: string[];
}> {
  let settled = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Find all PENDING picks whose match is FINISHED
  const pendingPicks = await prisma.pick.findMany({
    where: {
      status: "PENDING",
      match: { status: "FINISHED" },
    },
    include: {
      match: {
        include: {
          homeTeam: { select: { name: true, shortName: true } },
          awayTeam: { select: { name: true, shortName: true } },
        },
      },
      bets: true,
    },
  });

  console.log(`[Settler] Found ${pendingPicks.length} pending picks to settle`);

  for (const pick of pendingPicks) {
    try {
      const homeScore = pick.match.homeScore;
      const awayScore = pick.match.awayScore;

      if (homeScore === null || awayScore === null) {
        skipped++;
        continue;
      }

      const pickResult = decidePickResult(
        pick as unknown as PickWithMatch,
        homeScore,
        awayScore
      );

      // null = evaluation failed — keep as PENDING for manual review
      if (pickResult === null) {
        skipped++;
        continue;
      }

      // Update pick status
      await prisma.pick.update({
        where: { id: pick.id },
        data: {
          status: pickResult,
          updatedAt: new Date(),
        },
      });

      // Update all associated bets
      for (const bet of pick.bets) {
        if (bet.result !== "PENDING") continue;
        const profit = calculateProfit(bet.stake, bet.odds, pickResult as "WON" | "LOST" | "VOID");
        await prisma.bet.update({
          where: { id: bet.id },
          data: {
            result: pickResult as "WON" | "LOST" | "VOID",
            profit,
            settledAt: new Date(),
          },
        });

        // Update user bankroll
        const betWithUser = await prisma.bet.findUnique({
          where: { id: bet.id },
          select: { userId: true, stake: true },
        });
        if (betWithUser) {
          const bankrollChange = pickResult === "WON" ? profit :
                                 pickResult === "LOST" ? -bet.stake : 0;
          if (bankrollChange !== 0) {
            await prisma.user.update({
              where: { id: betWithUser.userId },
              data: { bankrollCurrent: { increment: bankrollChange } },
            });
          }
        }
      }

      console.log(
        `[Settler] Pick ${pick.id} → ${pickResult} | ${pick.match.homeTeam.name} ${homeScore}-${awayScore} ${pick.match.awayTeam.name} | ${pick.selection}`
      );

      // Trigger post-mortem learning for LOST picks (non-blocking)
      if (pickResult === "LOST") {
        runPostMortem(pick.id).catch(() => {});
      }

      settled++;
    } catch (err) {
      errors.push(`Pick ${pick.id}: ${String(err)}`);
    }
  }

  await prisma.log.create({
    data: {
      type: "SETTLE",
      message: `Settled ${settled} picks, skipped ${skipped}, errors: ${errors.length}`,
      meta: { errors },
    },
  }).catch(() => {});

  return { settled, skipped, errors };
}

const FD_COMPETITIONS = ["PL", "BL1", "CL", "PD", "SA", "FL1", "DED", "PPL"];

function normalizeTeamName(name: string | null | undefined): string {
  if (!name) return "";
  return name.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function teamsMatch(fdName: string | null | undefined, dbName: string | null | undefined): boolean {
  const fd = normalizeTeamName(fdName);
  const db = normalizeTeamName(dbName);
  if (!fd || !db) return false;
  return fd === db || fd.includes(db.split(" ")[0]) || db.includes(fd.split(" ")[0]);
}

type FDMatchResult = {
  id: number;
  status: string;
  utcDate: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
};

/**
 * Fetch all recently finished matches from FD.org across tracked competitions.
 * Used as a fallback for matches that don't have real FD match IDs.
 */
async function fetchRecentFinishedFromCompetitions(
  apiKey: string,
  daysBack = 7
): Promise<FDMatchResult[]> {
  const dateFrom = new Date(Date.now() - daysBack * 86400000).toISOString().split("T")[0];
  const dateTo = new Date().toISOString().split("T")[0];
  const all: FDMatchResult[] = [];

  for (const comp of FD_COMPETITIONS) {
    try {
      const res = await fetch(
        `https://api.football-data.org/v4/competitions/${comp}/matches?status=FINISHED&dateFrom=${dateFrom}&dateTo=${dateTo}`,
        { headers: { "X-Auth-Token": apiKey } }
      );
      if (!res.ok) continue;
      const data = await res.json() as { matches?: FDMatchResult[] };
      all.push(...(data.matches ?? []));
      await new Promise(r => setTimeout(r, 7000));
    } catch {
      // Non-fatal
    }
  }
  return all;
}

/**
 * Also update match statuses from Football-Data.org for recently finished matches.
 * This ensures picks can be settled even if the ingest cron missed a result.
 * Handles both real FD match IDs (numeric) and custom/fake IDs (by team name lookup).
 */
export async function updateFinishedMatchScores(): Promise<void> {
  const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
  if (!FOOTBALL_DATA_API_KEY) return;

  // Find matches that should be finished (kickoff > 2 hours ago) but still SCHEDULED/LIVE
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const staleMatches = await prisma.match.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      matchDate: { lt: cutoff },
    },
    include: {
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    take: 15,
  });

  if (staleMatches.length === 0) return;

  // Separate: real FD IDs (numeric strings) vs custom/fake IDs
  const realIdMatches = staleMatches.filter(m => /^\d+$/.test(m.externalId));
  const fakeIdMatches = staleMatches.filter(m => !/^\d+$/.test(m.externalId));

  // --- Strategy 1: direct match lookup for real FD IDs ---
  for (const match of realIdMatches) {
    try {
      const res = await fetch(
        `https://api.football-data.org/v4/matches/${match.externalId}`,
        { headers: { "X-Auth-Token": FOOTBALL_DATA_API_KEY } }
      );
      if (!res.ok) continue;

      const data = await res.json() as {
        status: string;
        score: { fullTime: { home: number | null; away: number | null } };
      };

      if (data.status === "FINISHED") {
        await prisma.match.update({
          where: { id: match.id },
          data: {
            status: "FINISHED",
            homeScore: data.score.fullTime.home,
            awayScore: data.score.fullTime.away,
            updatedAt: new Date(),
          },
        });
        console.log(`[Settler] Updated score for match ${match.id}: ${data.score.fullTime.home}-${data.score.fullTime.away}`);
      }

      await new Promise(r => setTimeout(r, 7000));
    } catch {
      // Non-fatal, continue
    }
  }

  // --- Strategy 2: competition sweep for matches with fake/custom IDs ---
  if (fakeIdMatches.length > 0) {
    console.log(`[Settler] ${fakeIdMatches.length} matches have custom IDs — fetching competition results...`);
    const fdResults = await fetchRecentFinishedFromCompetitions(FOOTBALL_DATA_API_KEY);

    for (const match of fakeIdMatches) {
      const matchDate = new Date(match.matchDate);
      const fdMatch = fdResults.find(fdm => {
        const fdDate = new Date(fdm.utcDate);
        const dayDiff = Math.abs(fdDate.getTime() - matchDate.getTime()) / 86400000;
        return (
          dayDiff <= 2 &&
          teamsMatch(fdm.homeTeam.name, match.homeTeam.name) &&
          teamsMatch(fdm.awayTeam.name, match.awayTeam.name)
        );
      });

      if (fdMatch && fdMatch.status === "FINISHED") {
        await prisma.match.update({
          where: { id: match.id },
          data: {
            status: "FINISHED",
            homeScore: fdMatch.score.fullTime.home,
            awayScore: fdMatch.score.fullTime.away,
            updatedAt: new Date(),
          },
        });
        console.log(`[Settler] Resolved ${match.homeTeam.name} vs ${match.awayTeam.name}: ${fdMatch.score.fullTime.home}-${fdMatch.score.fullTime.away}`);
      } else if (!fdMatch) {
        console.log(`[Settler] No FD result found for ${match.homeTeam.name} vs ${match.awayTeam.name}`);
      }
    }
  }
}

/**
 * Re-evaluate all picks currently marked VOID against their match's final score.
 * Corrects picks that were wrongly voided due to evaluation failures.
 * A VOID from a cancelled/postponed match is kept as-is (match status ≠ FINISHED).
 */
export async function reEvaluateVoidPicks(): Promise<{
  corrected: number;
  kept: number;
  errors: string[];
}> {
  let corrected = 0;
  let kept = 0;
  const errors: string[] = [];

  const voidPicks = await prisma.pick.findMany({
    where: {
      status: "VOID",
      match: { status: "FINISHED" }, // only finished matches — cancelled/postponed VOIDs are correct
    },
    include: {
      match: {
        include: {
          homeTeam: { select: { name: true, shortName: true } },
          awayTeam: { select: { name: true, shortName: true } },
        },
      },
      bets: true,
    },
  });

  console.log(`[Settler] Re-evaluating ${voidPicks.length} VOID picks from finished matches`);

  for (const pick of voidPicks) {
    try {
      const homeScore = pick.match.homeScore;
      const awayScore = pick.match.awayScore;
      if (homeScore === null || awayScore === null) { kept++; continue; }

      const newResult = decidePickResult(pick as unknown as PickWithMatch, homeScore, awayScore);

      // null = still can't evaluate — keep VOID (it was wrongly voided, but we can't fix it automatically)
      if (newResult === null || newResult === "VOID") { kept++; continue; }

      // Correct the pick
      await prisma.pick.update({
        where: { id: pick.id },
        data: { status: newResult, updatedAt: new Date() },
      });

      // Correct associated bets
      for (const bet of pick.bets) {
        const profit = calculateProfit(bet.stake, bet.odds, newResult);
        await prisma.bet.update({
          where: { id: bet.id },
          data: { result: newResult, profit, settledAt: new Date() },
        });
        // Adjust bankroll
        const betRecord = await prisma.bet.findUnique({
          where: { id: bet.id },
          select: { userId: true, stake: true },
        });
        if (betRecord) {
          // Previous VOID returned stake, now we need to apply the real result
          const bankrollAdjustment = newResult === "WON" ? profit : newResult === "LOST" ? -bet.stake : 0;
          if (bankrollAdjustment !== 0) {
            await prisma.user.update({
              where: { id: betRecord.userId },
              data: { bankrollCurrent: { increment: bankrollAdjustment } },
            });
          }
        }
      }

      console.log(
        `[Settler] Corrected VOID→${newResult} | ${pick.match.homeTeam.name} ${homeScore}-${awayScore} ${pick.match.awayTeam.name} | "${pick.selection}"`
      );
      corrected++;
    } catch (err) {
      errors.push(`Pick ${pick.id}: ${String(err)}`);
    }
  }

  return { corrected, kept, errors };
}
