/**
 * Pick resolution engine — driven by live API-Football data.
 * Fetches actual results and marks PENDING picks WON / LOST / VOID.
 * Shared by resolve-picks cron and daily-runner.
 */
import { prisma } from "@/lib/prisma";
import {
  getTodayFixtures,
  getFixtureById,
  isFinished,
  isCancelledOrPostponed,
  AFFixture,
} from "@/modules/stats/api-football-client";
import { runPostMortem } from "@/modules/engine/learning";

// ─── Resolution logic ─────────────────────────────────────────────────────────

function resolvePickResult(
  selection: string,
  market: string,
  homeTeamName: string,
  awayTeamName: string,
  homeScore: number,
  awayScore: number,
  cancelled: boolean
): "WON" | "LOST" | "VOID" | null {
  if (cancelled) return "VOID";

  const sel = selection.toLowerCase().trim();
  const home = homeTeamName.toLowerCase();
  const away = awayTeamName.toLowerCase();
  const homeWins  = homeScore > awayScore;
  const awayWins  = awayScore > homeScore;
  const draw      = homeScore === awayScore;
  const totalGoals = homeScore + awayScore;
  const bttsYes   = homeScore >= 1 && awayScore >= 1;
  const mkt = market.toLowerCase();

  if (mkt.includes("match winner") || mkt.includes("1x2") || mkt.includes("winner")) {
    const selMatchesHome = matchesTeam(sel, home, homeTeamName);
    const selMatchesAway = matchesTeam(sel, away, awayTeamName);
    const selMatchesDraw = sel === "draw" || sel === "empate" || sel === "x" || sel === "tie";
    if (selMatchesHome) return homeWins ? "WON" : "LOST";
    if (selMatchesAway) return awayWins ? "WON" : "LOST";
    if (selMatchesDraw) return draw ? "WON" : "LOST";
    return null;
  }

  if (mkt.includes("btts") || mkt.includes("both teams") || mkt.includes("ambos")) {
    const expectYes = sel.includes("yes") || sel.includes("sí") || sel.includes("si") || sel === "btts - yes";
    const expectNo  = sel.includes("no")  || sel === "btts - no";
    if (expectYes) return bttsYes ? "WON" : "LOST";
    if (expectNo)  return bttsYes ? "LOST" : "WON";
    return null;
  }

  if (mkt.includes("over") || mkt.includes("under") || mkt.includes("goals") || mkt.includes("goles")) {
    const lineMatch = sel.match(/(\d+\.?\d*)/);
    if (!lineMatch) return null;
    const line   = parseFloat(lineMatch[1]);
    const isOver  = sel.includes("over")  || sel.includes("más") || sel.includes("mas") || sel.startsWith("+");
    const isUnder = sel.includes("under") || sel.includes("menos");
    if (isOver)  return totalGoals > line ? "WON" : totalGoals === line ? "VOID" : "LOST";
    if (isUnder) return totalGoals < line ? "WON" : totalGoals === line ? "VOID" : "LOST";
    return null;
  }

  if (mkt.includes("double chance") || mkt.includes("doble")) {
    if (sel.includes("1x") || sel.includes("home or draw"))  return !awayWins ? "WON" : "LOST";
    if (sel.includes("x2") || sel.includes("away or draw"))  return !homeWins ? "WON" : "LOST";
    if (sel.includes("12") || sel.includes("home or away"))  return !draw     ? "WON" : "LOST";
    return null;
  }

  if (mkt.includes("asian handicap") || mkt.includes("handicap")) {
    const hcMatch = sel.match(/([+-]?\d+\.?\d*)/g);
    if (!hcMatch) return null;
    const hc = parseFloat(hcMatch[hcMatch.length - 1]);
    const selHome   = matchesTeam(sel, home, homeTeamName);
    const adjHome   = homeScore + (selHome ? hc : -hc);
    if (adjHome > awayScore) return "WON";
    if (adjHome < awayScore) return "LOST";
    return "VOID";
  }

  // Cards — requires actual card count injected by caller (passed as awayScore slot hack-free via context)
  // Resolution deferred: cards picks are marked VOID until card tracking is implemented.
  if (mkt.includes("tarjeta") || mkt.includes("card")) {
    // TODO: fetch match events to count cards and resolve properly.
    // For now, mark VOID so picks aren't counted as WON or LOST incorrectly.
    return "VOID";
  }

  return null;
}

function matchesTeam(sel: string, teamLower: string, teamFull: string): boolean {
  if (sel.includes(teamFull.toLowerCase())) return true;
  const words = teamLower
    .replace(/\b(fc|cf|sc|ac|as|afc|bfc|united|city|athletic|club)\b/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.some((w) => w.length > 2 && sel.includes(w));
}

function calcProfit(stake: number, odds: number, result: "WON" | "LOST" | "VOID"): number {
  if (result === "WON")  return stake * (odds - 1);
  if (result === "LOST") return -stake;
  return 0;
}

function findByTeamNames(
  fixtures: AFFixture[],
  homeTeamName: string,
  awayTeamName: string
): AFFixture | null {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/\b(fc|cf|sc|ac|as|afc|bfc|united|city|athletic|club)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const normHome = normalize(homeTeamName);
  const normAway = normalize(awayTeamName);

  for (const f of fixtures) {
    const fHome = normalize(f.teams.home.name);
    const fAway = normalize(f.teams.away.name);
    const homeMatch = fHome.includes(normHome.split(" ")[0]) || normHome.includes(fHome.split(" ")[0]);
    const awayMatch = fAway.includes(normAway.split(" ")[0]) || normAway.includes(fAway.split(" ")[0]);
    if (homeMatch && awayMatch) return f;
  }
  return null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function resolvePicksFromApiFootball(): Promise<{
  resolved: number;
  skipped: number;
  errors: string[];
  elapsed: number;
}> {
  const start = Date.now();
  let resolved = 0;
  let skipped  = 0;
  const errors: string[] = [];

  const pendingMatches = await prisma.match.findMany({
    where: {
      status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
      picks:  { some: { status: "PENDING" } },
    },
    include: {
      homeTeam: { select: { id: true, name: true, shortName: true } },
      awayTeam: { select: { id: true, name: true, shortName: true } },
      picks: {
        where:   { status: "PENDING" },
        include: { bets: true },
      },
    },
  });

  if (pendingMatches.length === 0) {
    return { resolved: 0, skipped: 0, errors: [], elapsed: Date.now() - start };
  }

  const todayFixtures = await getTodayFixtures();
  const finishedByExternalId = new Map<string, AFFixture>();

  for (const fix of todayFixtures) {
    finishedByExternalId.set(String(fix.fixture.id), fix);
  }

  for (const match of pendingMatches) {
    try {
      let fixture: AFFixture | null = null;

      if (match.externalId && finishedByExternalId.has(match.externalId)) {
        fixture = finishedByExternalId.get(match.externalId)!;
      } else {
        fixture = findByTeamNames(todayFixtures, match.homeTeam.name, match.awayTeam.name);
      }

      if (!fixture && match.externalId && /^\d+$/.test(match.externalId)) {
        const numId = parseInt(match.externalId, 10);
        if (numId >= 1_000_000) {
          fixture = await getFixtureById(numId);
        }
      }

      if (!fixture) { skipped++; continue; }

      const cancelled = isCancelledOrPostponed(fixture);
      const finished  = isFinished(fixture);
      if (!finished && !cancelled) { skipped++; continue; }

      const homeScore = fixture.goals.home ?? 0;
      const awayScore = fixture.goals.away ?? 0;

      if (match.status !== "FINISHED") {
        await prisma.match.update({
          where: { id: match.id },
          data: {
            status: cancelled ? "CANCELLED" : "FINISHED",
            homeScore,
            awayScore,
          },
        });
      }

      for (const pick of match.picks) {
        try {
          const result = resolvePickResult(
            pick.selection,
            pick.market,
            match.homeTeam.name,
            match.awayTeam.name,
            homeScore,
            awayScore,
            cancelled
          );
          if (result === null) { skipped++; continue; }

          await prisma.pick.update({ where: { id: pick.id }, data: { status: result } });

          for (const bet of pick.bets) {
            if (bet.result !== "PENDING") continue;
            const profit = calcProfit(bet.stake, bet.odds, result);
            await prisma.bet.update({
              where: { id: bet.id },
              data: { result, profit, settledAt: new Date() },
            });
            if (result !== "VOID") {
              await prisma.user.update({
                where: { id: bet.userId },
                data: { bankrollCurrent: { increment: result === "WON" ? profit : -bet.stake } },
              });
            }
          }

          if (result === "LOST") runPostMortem(pick.id).catch(() => {});
          resolved++;
        } catch (e) {
          errors.push(`pick ${pick.id}: ${String(e)}`);
        }
      }
    } catch (e) {
      errors.push(`match ${match.id}: ${String(e)}`);
    }
  }

  const elapsed = Date.now() - start;

  await prisma.log.create({
    data: {
      type:    "RESOLVE",
      message: `resolve: ${resolved} resolved, ${skipped} skipped, ${errors.length} errors in ${elapsed}ms`,
      meta:    { resolved, skipped, errors: errors.slice(0, 10), elapsed },
    },
  }).catch(() => {});

  return { resolved, skipped, errors: errors.slice(0, 10), elapsed };
}
