/**
 * Resolve-picks cron — runs every 10 minutes.
 *
 * Logic:
 * 1. Fetch today's fixtures from API-Football that are FT (full-time)
 * 2. Match them to DB matches with PENDING picks
 * 3. Apply bulletproof resolution logic
 * 4. Mark picks WON / LOST / VOID and update bets + bankrolls
 * 5. Trigger post-mortem learning for LOST picks
 *
 * Resolution rules:
 *   Match Winner / 1X2:
 *     home wins → home pick WON, away pick LOST
 *     away wins → away pick WON, home pick LOST
 *     draw      → draw pick WON, home/away picks LOST
 *   BTTS (Both Teams to Score):
 *     both teams ≥1 goal → BTTS Yes WON, BTTS No LOST
 *     either team 0      → BTTS Yes LOST, BTTS No WON
 *   Over/Under N.5:
 *     total goals > N → Over WON, Under LOST
 *     total goals < N → Under WON, Over LOST
 *     total goals = N → VOID (push — only integer lines)
 *   VOID: match status CANC, PST, ABD, AWD, WO
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTodayFixtures, getFixtureById, isFinished, isCancelledOrPostponed, AFFixture } from "@/modules/stats/api-football-client";
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
  const homeWins = homeScore > awayScore;
  const awayWins = awayScore > homeScore;
  const draw     = homeScore === awayScore;
  const totalGoals = homeScore + awayScore;
  const bttsYes = homeScore >= 1 && awayScore >= 1;

  const mkt = market.toLowerCase();

  // ── Match Winner / 1X2 ───────────────────────────────────────────────────
  if (mkt.includes("match winner") || mkt.includes("1x2") || mkt.includes("winner")) {
    // Does selection match the home team?
    const selMatchesHome = matchesTeam(sel, home, homeTeamName);
    const selMatchesAway = matchesTeam(sel, away, awayTeamName);
    const selMatchesDraw = sel === "draw" || sel === "empate" || sel === "x" || sel === "tie";

    if (selMatchesHome) return homeWins ? "WON" : "LOST";
    if (selMatchesAway) return awayWins ? "WON" : "LOST";
    if (selMatchesDraw) return draw ? "WON" : "LOST";
    return null; // unknown selection
  }

  // ── Both Teams to Score ──────────────────────────────────────────────────
  if (mkt.includes("btts") || mkt.includes("both teams") || mkt.includes("ambos")) {
    const expectYes = sel.includes("yes") || sel.includes("sí") || sel.includes("si") || sel === "btts - yes";
    const expectNo  = sel.includes("no") || sel === "btts - no";
    if (expectYes) return bttsYes ? "WON" : "LOST";
    if (expectNo)  return bttsYes ? "LOST" : "WON";
    return null;
  }

  // ── Over / Under ─────────────────────────────────────────────────────────
  if (mkt.includes("over") || mkt.includes("under") || mkt.includes("goals") || mkt.includes("goles")) {
    const lineMatch = sel.match(/(\d+\.?\d*)/);
    if (!lineMatch) return null;
    const line = parseFloat(lineMatch[1]);
    const isOver = sel.includes("over") || sel.includes("más") || sel.includes("mas") || sel.startsWith("+");
    const isUnder = sel.includes("under") || sel.includes("menos");

    if (isOver)  return totalGoals > line ? "WON" : totalGoals === line ? "VOID" : "LOST";
    if (isUnder) return totalGoals < line ? "WON" : totalGoals === line ? "VOID" : "LOST";
    return null;
  }

  // ── Double Chance ────────────────────────────────────────────────────────
  if (mkt.includes("double chance") || mkt.includes("doble")) {
    if (sel.includes("1x") || sel.includes("home or draw"))  return !awayWins ? "WON" : "LOST";
    if (sel.includes("x2") || sel.includes("away or draw"))  return !homeWins ? "WON" : "LOST";
    if (sel.includes("12") || sel.includes("home or away"))  return !draw ? "WON" : "LOST";
    return null;
  }

  // ── Asian Handicap ───────────────────────────────────────────────────────
  if (mkt.includes("asian handicap") || mkt.includes("handicap")) {
    const hcMatch = sel.match(/([+-]?\d+\.?\d*)/g);
    if (!hcMatch) return null;
    const hc = parseFloat(hcMatch[hcMatch.length - 1]);
    const selHome = matchesTeam(sel, home, homeTeamName);
    const adjHome = homeScore + (selHome ? hc : -hc);
    if (adjHome > awayScore) return "WON";
    if (adjHome < awayScore) return "LOST";
    return "VOID"; // push
  }

  return null; // unrecognized market
}

function matchesTeam(sel: string, teamLower: string, teamFull: string): boolean {
  // Exact full name match
  if (sel.includes(teamFull.toLowerCase())) return true;
  // First significant word (strips FC/CF/SC/etc.)
  const words = teamLower.replace(/\b(fc|cf|sc|ac|as|afc|bfc|united|city|athletic|club)\b/g, "").trim().split(/\s+/).filter(Boolean);
  return words.some((w) => w.length > 2 && sel.includes(w));
}

function calcProfit(stake: number, odds: number, result: "WON" | "LOST" | "VOID"): number {
  if (result === "WON") return stake * (odds - 1);
  if (result === "LOST") return -stake;
  return 0;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Allow both cron (no secret) and manual calls (with secret)
  const secret = new URL(request.url).searchParams.get("secret");
  if (secret && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  let resolved = 0;
  let skipped  = 0;
  const errors: string[] = [];

  try {
    // 1. Find all DB matches with PENDING picks
    const pendingMatches = await prisma.match.findMany({
      where: {
        status: { in: ["SCHEDULED", "LIVE", "FINISHED"] },
        picks: { some: { status: "PENDING" } },
      },
      include: {
        homeTeam: { select: { id: true, name: true, shortName: true } },
        awayTeam: { select: { id: true, name: true, shortName: true } },
        picks: {
          where: { status: "PENDING" },
          include: { bets: true },
        },
      },
    });

    if (pendingMatches.length === 0) {
      return NextResponse.json({ resolved: 0, skipped: 0, message: "No pending picks found" });
    }

    // 2. Fetch today's finished fixtures from API-Football
    const todayFixtures = await getTodayFixtures();
    const finishedByExternalId = new Map<string, AFFixture>();
    const finishedByTeamPair   = new Map<string, AFFixture>();

    for (const fix of todayFixtures) {
      const extId = String(fix.fixture.id);
      finishedByExternalId.set(extId, fix);
      const teamKey = `${fix.teams.home.id}|${fix.teams.away.id}`;
      finishedByTeamPair.set(teamKey, fix);
    }

    // 3. For each pending match, find its API-Football result
    for (const match of pendingMatches) {
      try {
        let fixture: AFFixture | null = null;

        // Try matching by externalId first
        if (match.externalId && finishedByExternalId.has(match.externalId)) {
          fixture = finishedByExternalId.get(match.externalId)!;
        } else {
          // Fallback: fetch by date + team name fuzzy match from today's results
          fixture = findByTeamNames(
            todayFixtures,
            match.homeTeam.name,
            match.awayTeam.name
          );
        }

        // If not in today's fixtures, try fetching by externalId directly
        if (!fixture && match.externalId && /^\d+$/.test(match.externalId)) {
          fixture = await getFixtureById(parseInt(match.externalId, 10));
        }

        if (!fixture) {
          skipped++;
          continue;
        }

        const cancelled = isCancelledOrPostponed(fixture);
        const finished  = isFinished(fixture);

        if (!finished && !cancelled) {
          skipped++;
          continue;
        }

        const homeScore = fixture.goals.home ?? 0;
        const awayScore = fixture.goals.away ?? 0;

        // Update match in DB if not already FINISHED
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

        // 4. Resolve each pending pick
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

            if (result === null) {
              skipped++;
              continue;
            }

            // Update pick
            await prisma.pick.update({
              where: { id: pick.id },
              data: { status: result },
            });

            // Update bets + bankrolls
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

            // Post-mortem for LOST picks
            if (result === "LOST") {
              runPostMortem(pick.id).catch(() => {});
            }

            resolved++;
          } catch (e) {
            errors.push(`pick ${pick.id}: ${String(e)}`);
          }
        }
      } catch (e) {
        errors.push(`match ${match.id}: ${String(e)}`);
      }
    }
  } catch (e) {
    errors.push(`fatal: ${String(e)}`);
  }

  const elapsed = Date.now() - start;

  // Log to DB
  await prisma.log.create({
    data: {
      type: "RESOLVE",
      message: `resolve-picks: ${resolved} resolved, ${skipped} skipped, ${errors.length} errors in ${elapsed}ms`,
      meta: { resolved, skipped, errors: errors.slice(0, 10), elapsed },
    },
  }).catch(() => {});

  return NextResponse.json({ resolved, skipped, errors: errors.slice(0, 10), elapsed });
}

// ─── Fuzzy team name matcher ──────────────────────────────────────────────────

function findByTeamNames(
  fixtures: AFFixture[],
  homeTeamName: string,
  awayTeamName: string
): AFFixture | null {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/\b(fc|cf|sc|ac|as|afc|bfc|united|city|athletic|club)\b/g, "")
      .replace(/\s+/g, " ").trim();

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
