import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }

  try {
    const [user, bets] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.bet.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const totalBets = bets.length;
    const wonBets = bets.filter((b) => b.result === "WON").length;
    const lostBets = bets.filter((b) => b.result === "LOST").length;
    const pendingBets = bets.filter((b) => b.result === "PENDING").length;
    const settledBets = bets.filter((b) => b.result !== "PENDING" && b.result !== "VOID");
    const totalStaked = settledBets.reduce((sum, b) => sum + b.stake, 0);
    const totalProfit = bets.reduce((sum, b) => sum + (b.profit ?? 0), 0);
    const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
    const winRate = settledBets.length > 0 ? (wonBets / settledBets.length) * 100 : 0;

    // Monthly breakdown
    const monthlyMap = new Map<string, { bets: number; won: number; lost: number; profit: number; staked: number }>();

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
      .map(([month, data]) => ({
        month,
        bets: data.bets,
        won: data.won,
        lost: data.lost,
        profit: +data.profit.toFixed(2),
        roi: data.staked > 0 ? +((data.profit / data.staked) * 100).toFixed(1) : 0,
      }));

    return NextResponse.json({
      totalBets,
      wonBets,
      lostBets,
      pendingBets,
      totalStaked: +totalStaked.toFixed(2),
      totalProfit: +totalProfit.toFixed(2),
      roi: +roi.toFixed(1),
      winRate: +winRate.toFixed(1),
      bankrollStart: user.bankrollStart,
      bankrollCurrent: user.bankrollCurrent,
      monthlyBreakdown,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
