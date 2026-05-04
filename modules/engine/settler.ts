/**
 * Pick settler.
 * Runs after matches finish — compares final score to pick selection,
 * marks picks WON/LOST/VOID, updates Bet records with profit/loss.
 * Called by /api/cron/settle-picks at midnight.
 */
import { prisma } from "@/lib/prisma";

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

function decidePickResult(
  pick: PickWithMatch,
  homeScore: number,
  awayScore: number
): "WON" | "LOST" | "VOID" {
  const { market, selection } = pick;
  const totalGoals = homeScore + awayScore;

  // 1X2 market
  if (market === "1X2") {
    if (selection.toLowerCase().includes("home") ||
        selection === pick.match.homeTeam.shortName ||
        selection === pick.match.homeTeam.name ||
        selection.endsWith(" Win") && selection.includes(pick.match.homeTeam.name.split(" ")[0])) {
      return homeScore > awayScore ? "WON" : "LOST";
    }
    if (selection === "Draw" || selection === "X") {
      return homeScore === awayScore ? "WON" : "LOST";
    }
    if (selection.toLowerCase().includes("away") ||
        selection === pick.match.awayTeam.shortName ||
        selection === pick.match.awayTeam.name) {
      return awayScore > homeScore ? "WON" : "LOST";
    }
    // Match team name in selection
    if (selection.includes(pick.match.homeTeam.name.split(" ")[0])) {
      return homeScore > awayScore ? "WON" : "LOST";
    }
    if (selection.includes(pick.match.awayTeam.name.split(" ")[0])) {
      return awayScore > homeScore ? "WON" : "LOST";
    }
    // "Arsenal Win" style
    if (selection.endsWith(" Win")) {
      const teamPart = selection.replace(" Win", "").trim();
      if (pick.match.homeTeam.name.includes(teamPart) || pick.match.homeTeam.shortName?.includes(teamPart)) {
        return homeScore > awayScore ? "WON" : "LOST";
      }
      if (pick.match.awayTeam.name.includes(teamPart) || pick.match.awayTeam.shortName?.includes(teamPart)) {
        return awayScore > homeScore ? "WON" : "LOST";
      }
    }
  }

  // Over/Under market
  if (market === "Over/Under") {
    const match = selection.match(/([Oo]ver|[Uu]nder)\s+([\d.]+)/);
    if (match) {
      const direction = match[1].toLowerCase();
      const line = parseFloat(match[2]);
      if (direction === "over") return totalGoals > line ? "WON" : totalGoals === line ? "VOID" : "LOST";
      if (direction === "under") return totalGoals < line ? "WON" : totalGoals === line ? "VOID" : "LOST";
    }
    // "Under 2.5 Goals" style
    if (selection.toLowerCase().includes("under")) {
      const lineMatch = selection.match(/([\d.]+)/);
      if (lineMatch) {
        const line = parseFloat(lineMatch[1]);
        return totalGoals < line ? "WON" : totalGoals === line ? "VOID" : "LOST";
      }
    }
    if (selection.toLowerCase().includes("over")) {
      const lineMatch = selection.match(/([\d.]+)/);
      if (lineMatch) {
        const line = parseFloat(lineMatch[1]);
        return totalGoals > line ? "WON" : totalGoals === line ? "VOID" : "LOST";
      }
    }
  }

  // BTTS (Both Teams to Score)
  if (market === "Both Teams to Score") {
    const bttsYes = homeScore > 0 && awayScore > 0;
    if (selection.toLowerCase().includes("yes") || selection === "BTTS - Yes") {
      return bttsYes ? "WON" : "LOST";
    }
    if (selection.toLowerCase().includes("no") || selection === "BTTS - No") {
      return !bttsYes ? "WON" : "LOST";
    }
  }

  // Double Chance
  if (market === "Double Chance") {
    if (selection === "1X") return homeScore >= awayScore ? "WON" : "LOST";
    if (selection === "X2") return awayScore >= homeScore ? "WON" : "LOST";
    if (selection === "12") return homeScore !== awayScore ? "WON" : "LOST";
  }

  // Asian Handicap — simplified
  if (market === "Asian Handicap") {
    const match = selection.match(/([+-]?\d+\.?\d*)/);
    if (match) {
      const handicap = parseFloat(match[1]);
      const adjustedHome = homeScore + handicap;
      return adjustedHome > awayScore ? "WON" : adjustedHome === awayScore ? "VOID" : "LOST";
    }
  }

  return "VOID"; // Unknown market — void it
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

/**
 * Also update match statuses from Football-Data.org for recently finished matches.
 * This ensures picks can be settled even if the ingest cron missed a result.
 */
export async function updateFinishedMatchScores(): Promise<void> {
  const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
  if (!FOOTBALL_DATA_API_KEY) return;

  // Find matches that should be finished (kickoff > 2.5 hours ago) but still SCHEDULED/LIVE
  const cutoff = new Date(Date.now() - 2.5 * 60 * 60 * 1000);
  const staleMatches = await prisma.match.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE"] },
      matchDate: { lt: cutoff },
    },
    select: { id: true, externalId: true },
    take: 10,
  });

  for (const match of staleMatches) {
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
      }

      // Respect rate limit
      await new Promise((r) => setTimeout(r, 7000));
    } catch {
      // Non-fatal, continue
    }
  }
}
