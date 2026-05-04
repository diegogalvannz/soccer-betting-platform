import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";

export async function GET() {
  try {
    // All picks + all bets — global app performance, no user filter
    const [picks, bets] = await Promise.all([
      prisma.pick.findMany({
        select: {
          id: true,
          status: true,
          market: true,
          confidenceScore: true,
          odds: true,
          match: { select: { league: true, leagueCode: true } },
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.bet.findMany({
        select: {
          id: true,
          stake: true,
          odds: true,
          result: true,
          profit: true,
          createdAt: true,
          settledAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    // ── Pick stats ──────────────────────────────────────────────────────────
    const totalPicks   = picks.length;
    const pendingPicks = picks.filter((p) => p.status === "PENDING").length;
    const wonPicks     = picks.filter((p) => p.status === "WON").length;
    const lostPicks    = picks.filter((p) => p.status === "LOST").length;
    const voidPicks    = picks.filter((p) => p.status === "VOID").length;
    const settledPicks = wonPicks + lostPicks;
    const pickWinRate  = settledPicks > 0 ? +(((wonPicks / settledPicks) * 100).toFixed(1)) : 0;

    // ── Bet stats ───────────────────────────────────────────────────────────
    const totalBets   = bets.length;
    const wonBets     = bets.filter((b) => b.result === "WON").length;
    const lostBets    = bets.filter((b) => b.result === "LOST").length;
    const pendingBets = bets.filter((b) => b.result === "PENDING").length;
    const settledBets = bets.filter((b) => b.result !== "PENDING" && b.result !== "VOID");
    const totalStaked = settledBets.reduce((s, b) => s + b.stake, 0);
    const totalProfit = bets.reduce((s, b) => s + (b.profit ?? 0), 0);
    const roi         = totalStaked > 0 ? +((totalProfit / totalStaked) * 100).toFixed(1) : 0;
    const betWinRate  = settledBets.length > 0 ? +(((wonBets / settledBets.length) * 100).toFixed(1)) : 0;

    // ── Monthly breakdown (by bet date) ────────────────────────────────────
    const monthlyMap = new Map<string, {
      bets: number; won: number; lost: number; profit: number; staked: number;
    }>();
    for (const bet of bets) {
      if (bet.result === "PENDING") continue;
      const month = format(new Date(bet.createdAt), "yyyy-MM");
      const entry = monthlyMap.get(month) ?? { bets: 0, won: 0, lost: 0, profit: 0, staked: 0 };
      entry.bets++;
      if (bet.result === "WON") entry.won++;
      if (bet.result === "LOST") entry.lost++;
      entry.profit += bet.profit ?? 0;
      entry.staked += bet.stake;
      monthlyMap.set(month, entry);
    }
    const monthlyBreakdown = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        bets: d.bets,
        won: d.won,
        lost: d.lost,
        profit: +d.profit.toFixed(2),
        roi: d.staked > 0 ? +((d.profit / d.staked) * 100).toFixed(1) : 0,
      }));

    // ── Running P&L curve (cumulative profit per pick settle date) ─────────
    const settled = picks
      .filter((p) => p.status === "WON" || p.status === "LOST")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let cumulative = 0;
    const performanceCurve = settled.map((p) => {
      // Rough: each won pick = +1 unit, lost = -1 unit (for display w/o exact stake)
      cumulative += p.status === "WON" ? 1 : -1;
      return {
        date: format(new Date(p.createdAt), "yyyy-MM-dd"),
        cumulative,
        result: p.status,
      };
    });

    // ── By league ───────────────────────────────────────────────────────────
    const leagueMap = new Map<string, { total: number; won: number; lost: number }>();
    for (const p of picks) {
      if (p.status !== "WON" && p.status !== "LOST") continue;
      const league = p.match.league;
      const entry = leagueMap.get(league) ?? { total: 0, won: 0, lost: 0 };
      entry.total++;
      if (p.status === "WON") entry.won++;
      else entry.lost++;
      leagueMap.set(league, entry);
    }
    const byLeague = Array.from(leagueMap.entries())
      .map(([league, d]) => ({
        league,
        total: d.total,
        won: d.won,
        lost: d.lost,
        winRate: d.total > 0 ? +((d.won / d.total) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.winRate - a.winRate);

    // ── By market ───────────────────────────────────────────────────────────
    const marketMap = new Map<string, { total: number; won: number; lost: number }>();
    for (const p of picks) {
      if (p.status !== "WON" && p.status !== "LOST") continue;
      const market = p.market;
      const entry = marketMap.get(market) ?? { total: 0, won: 0, lost: 0 };
      entry.total++;
      if (p.status === "WON") entry.won++;
      else entry.lost++;
      marketMap.set(market, entry);
    }
    const byMarket = Array.from(marketMap.entries())
      .map(([market, d]) => ({
        market,
        total: d.total,
        won: d.won,
        lost: d.lost,
        winRate: d.total > 0 ? +((d.won / d.total) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    return NextResponse.json({
      // Picks
      totalPicks, pendingPicks, wonPicks, lostPicks, voidPicks, pickWinRate,
      // Bets
      totalBets, wonBets, lostBets, pendingBets,
      totalStaked: +totalStaked.toFixed(2),
      totalProfit: +totalProfit.toFixed(2),
      roi, betWinRate,
      // Breakdowns
      monthlyBreakdown,
      performanceCurve,
      byLeague,
      byMarket,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
