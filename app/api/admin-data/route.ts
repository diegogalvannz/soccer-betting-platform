/**
 * Admin data API — powers the /admin CEO dashboard.
 * Protected by ADMIN_PASSWORD env var.
 * GET /api/admin-data?section=overview|picks|users|apis|logs&password=<ADMIN_PASSWORD>
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function checkAuth(request: Request): boolean {
  const url = new URL(request.url);
  const pw = url.searchParams.get("password");
  return pw === (process.env.ADMIN_PASSWORD ?? "diego2024admin");
}

export async function GET(request: Request) {
  if (!checkAuth(request)) return unauthorized();

  const section = new URL(request.url).searchParams.get("section") ?? "overview";

  try {
    if (section === "overview") return overview();
    if (section === "picks")    return picksPerf();
    if (section === "users")    return usersActivity();
    if (section === "apis")     return apiMonitor();
    if (section === "logs")     return systemLogs(request);
    return NextResponse.json({ error: "Unknown section" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// ─── Section 1: Overview KPIs ─────────────────────────────────────────────────

async function overview() {
  const now = new Date();
  const sevenDaysAgo = subDays(now, 7);

  const [
    totalUsers,
    activeUsers,
    totalPicks,
    wonPicks,
    lostPicks,
    totalBets,
    betProfit,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { bets: { some: { createdAt: { gte: sevenDaysAgo } } } } }),
    prisma.pick.count(),
    prisma.pick.count({ where: { status: "WON" } }),
    prisma.pick.count({ where: { status: "LOST" } }),
    prisma.bet.count(),
    prisma.bet.aggregate({
      where: { result: { in: ["WON", "LOST"] } },
      _sum: { profit: true, stake: true },
    }),
  ]);

  const settled = wonPicks + lostPicks;
  const winRate = settled > 0 ? Math.round((wonPicks / settled) * 100) : 0;
  const totalProfit = betProfit._sum.profit ?? 0;
  const totalStaked = betProfit._sum.stake ?? 0;
  const roi = totalStaked > 0 ? +((totalProfit / totalStaked) * 100).toFixed(1) : 0;

  return NextResponse.json({
    totalUsers,
    activeUsers,
    totalPicks,
    wonPicks,
    lostPicks,
    pendingPicks: totalPicks - settled - (await prisma.pick.count({ where: { status: "VOID" } })),
    winRate,
    totalBets,
    totalProfit: +totalProfit.toFixed(2),
    totalStaked: +totalStaked.toFixed(2),
    roi,
  });
}

// ─── Section 2: Picks performance ─────────────────────────────────────────────

async function picksPerf() {
  const now = new Date();
  const thirtyDaysAgo = subDays(now, 30);

  // Picks per day last 30 days
  const recentPicks = await prisma.pick.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true, status: true, confidenceScore: true, market: true },
    orderBy: { createdAt: "asc" },
  });

  const days = eachDayOfInterval({ start: thirtyDaysAgo, end: now });
  const byDay = days.map((day) => {
    const dayStr = format(day, "MMM d");
    const dayPicks = recentPicks.filter(
      (p) => format(p.createdAt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")
    );
    return {
      date: dayStr,
      total: dayPicks.length,
      won: dayPicks.filter((p) => p.status === "WON").length,
      lost: dayPicks.filter((p) => p.status === "LOST").length,
    };
  });

  // Win rate by league
  const allPicks = await prisma.pick.findMany({
    where: { status: { in: ["WON", "LOST"] } },
    select: { status: true, market: true, confidenceScore: true, match: { select: { league: true } } },
    take: 500,
  });

  const leagueMap: Record<string, { won: number; total: number }> = {};
  const marketMap: Record<string, { won: number; total: number }> = {};
  const confBuckets = {
    "62-70": { won: 0, total: 0 },
    "71-80": { won: 0, total: 0 },
    "81+":   { won: 0, total: 0 },
  };

  for (const p of allPicks) {
    const league = p.match.league;
    if (!leagueMap[league]) leagueMap[league] = { won: 0, total: 0 };
    leagueMap[league].total++;
    if (p.status === "WON") leagueMap[league].won++;

    if (!marketMap[p.market]) marketMap[p.market] = { won: 0, total: 0 };
    marketMap[p.market].total++;
    if (p.status === "WON") marketMap[p.market].won++;

    const cs = p.confidenceScore;
    const bucket = cs >= 81 ? "81+" : cs >= 71 ? "71-80" : cs >= 62 ? "62-70" : null;
    if (bucket) {
      confBuckets[bucket as keyof typeof confBuckets].total++;
      if (p.status === "WON") confBuckets[bucket as keyof typeof confBuckets].won++;
    }
  }

  const byLeague = Object.entries(leagueMap)
    .map(([league, v]) => ({ league, ...v, winRate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const byMarket = Object.entries(marketMap)
    .map(([market, v]) => ({ market, ...v, winRate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  const byConfidence = Object.entries(confBuckets).map(([bucket, v]) => ({
    bucket,
    ...v,
    winRate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0,
  }));

  return NextResponse.json({ byDay, byLeague, byMarket, byConfidence });
}

// ─── Section 3: Users activity ────────────────────────────────────────────────

async function usersActivity() {
  const users = await prisma.user.findMany({
    include: {
      bets: {
        select: { result: true, profit: true, stake: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const userList = users.map((u) => {
    const settled = u.bets.filter((b) => b.result === "WON" || b.result === "LOST");
    const won = settled.filter((b) => b.result === "WON").length;
    const totalProfit = settled.reduce((s, b) => s + (b.profit ?? 0), 0);
    const totalStaked = settled.reduce((s, b) => s + b.stake, 0);
    const roi = totalStaked > 0 ? +((totalProfit / totalStaked) * 100).toFixed(1) : 0;
    const lastBet = u.bets.at(-1);
    const firstBet = u.bets.at(0);
    const retained = !!lastBet && !!firstBet && lastBet.createdAt.getTime() - firstBet.createdAt.getTime() > 86400000;
    return {
      id: u.id,
      email: u.email.replace(/(.{3}).+(@.+)/, "$1***$2"),
      joinedAt: u.createdAt.toISOString(),
      totalBets: u.bets.length,
      roi,
      retained,
    };
  });

  // Signups per day last 30 days
  const thirtyDaysAgo = subDays(new Date(), 30);
  const recentUsers = await prisma.user.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const days = eachDayOfInterval({ start: thirtyDaysAgo, end: new Date() });
  const signupsByDay = days.map((day) => ({
    date: format(day, "MMM d"),
    signups: recentUsers.filter(
      (u) => format(u.createdAt, "yyyy-MM-dd") === format(day, "yyyy-MM-dd")
    ).length,
  }));

  const retentionRate = userList.length > 0
    ? Math.round((userList.filter((u) => u.retained).length / userList.length) * 100)
    : 0;

  return NextResponse.json({ userList, signupsByDay, retentionRate });
}

// ─── Section 4: API monitor ───────────────────────────────────────────────────

async function apiMonitor() {
  const now = new Date();
  const startMonth = startOfMonth(now);
  const startDay = new Date(now); startDay.setHours(0, 0, 0, 0);

  const [
    rapidApiCalls,
    fdApiCalls,
    lastLogs,
    recentErrors,
    cronLogs,
  ] = await Promise.all([
    prisma.log.count({ where: { type: "RAPIDAPI_LIVE", createdAt: { gte: startMonth } } }),
    prisma.log.count({ where: { type: "FD_API", createdAt: { gte: startDay } } }),
    prisma.log.findMany({
      where: { type: { in: ["INGEST", "GENERATE", "SETTLE", "AUTO_SETTLE"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { type: true, message: true, createdAt: true },
    }),
    prisma.log.count({ where: { type: "ERROR", createdAt: { gte: subDays(now, 1) } } }),
    prisma.log.findMany({
      where: { type: { in: ["INGEST", "GENERATE", "SETTLE", "AUTO_SETTLE", "CRON"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { type: true, message: true, createdAt: true },
    }),
  ]);

  return NextResponse.json({
    rapidApi: { used: rapidApiCalls, limit: 100 },
    fdApi: { used: fdApiCalls, limit: 600 },
    lastCronRuns: cronLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    errorsLast24h: recentErrors,
    recentActivity: lastLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  });
}

// ─── Section 5: System logs ───────────────────────────────────────────────────

async function systemLogs(request: Request) {
  const typeFilter = new URL(request.url).searchParams.get("type");
  const where = typeFilter ? { type: typeFilter } : {};

  const logs = await prisma.log.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, type: true, message: true, createdAt: true, meta: true },
  });

  return NextResponse.json({
    logs: logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  });
}
