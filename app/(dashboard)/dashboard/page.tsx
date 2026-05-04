import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, TrendingUp, Calendar, Trophy, DollarSign } from "lucide-react";
import { formatMatchDate, formatOdds } from "@/lib/utils";
import Link from "next/link";
import { LiveMatchesPanel } from "@/components/live/LiveMatchesPanel";

export const revalidate = 60;

export default async function DashboardPage() {
  const now = new Date();
  const next48h = new Date(now.getTime() + 48 * 3600000);

  const [
    pendingPicksCount,
    recentPicks,
    upcomingMatches,
    allSettledPicks,
    betStats,
  ] = await Promise.all([
    // Active (pending) picks
    prisma.pick.count({ where: { status: "PENDING" } }),

    // Latest 5 pending picks with match details
    prisma.pick.findMany({
      where: { status: "PENDING" },
      include: {
        match: {
          include: {
            homeTeam: { select: { name: true, shortName: true } },
            awayTeam: { select: { name: true, shortName: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),

    // Matches in next 48 hours
    prisma.match.findMany({
      where: { status: "SCHEDULED", matchDate: { gt: now, lt: next48h } },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
      },
      orderBy: { matchDate: "asc" },
      take: 5,
    }),

    // All settled picks for win rate
    prisma.pick.findMany({
      where: { status: { in: ["WON", "LOST"] } },
      select: { status: true },
    }),

    // Bet profit/loss aggregate
    prisma.bet.aggregate({
      where: { result: { in: ["WON", "LOST"] } },
      _sum: { profit: true, stake: true },
      _count: { id: true },
    }),
  ]);

  // Compute stats
  const totalSettled = allSettledPicks.length;
  const wonCount = allSettledPicks.filter((p) => p.status === "WON").length;
  const winRate = totalSettled > 0 ? Math.round((wonCount / totalSettled) * 100) : 0;

  const totalProfit = betStats._sum.profit ?? 0;
  const totalStaked = betStats._sum.stake ?? 0;
  const roi = totalStaked > 0 ? Math.round((totalProfit / totalStaked) * 100) : 0;
  const profitDisplay =
    totalProfit === 0 ? "$0.00" :
    totalProfit > 0 ? `+$${totalProfit.toFixed(2)}` :
    `-$${Math.abs(totalProfit).toFixed(2)}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Your betting intelligence overview</p>
      </div>

      {/* Stats Row — 5 cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard
          title="Active Picks"
          value={pendingPicksCount}
          icon={<Target className="h-4 w-4 text-muted-foreground" />}
          description="Awaiting results"
        />
        <StatCard
          title="Win Rate"
          value={totalSettled > 0 ? `${winRate}%` : "—"}
          icon={<Trophy className="h-4 w-4 text-muted-foreground" />}
          description={totalSettled > 0 ? `${wonCount}W / ${totalSettled - wonCount}L` : "No settled picks yet"}
          highlight={winRate >= 55}
        />
        <StatCard
          title="Upcoming"
          value={upcomingMatches.length}
          icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
          description="Next 48 hours"
        />
        <StatCard
          title="Total Picks"
          value={pendingPicksCount + totalSettled}
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
          description="All time"
        />
        <StatCard
          title="Profit / ROI"
          value={totalStaked > 0 ? profitDisplay : "—"}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          description={totalStaked > 0 ? `ROI: ${roi > 0 ? "+" : ""}${roi}%` : "No bets tracked yet"}
          highlight={totalProfit > 0}
          negative={totalProfit < 0}
        />
      </div>

      {/* Live Matches — real-time panel, polls every 30s */}
      <LiveMatchesPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Picks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Active Picks</CardTitle>
            <Link href="/picks" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentPicks.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No picks yet — runs at 8am daily
              </p>
            ) : (
              recentPicks.map((pick: typeof recentPicks[number]) => (
                <Link key={pick.id} href={`/picks/${pick.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">
                        {pick.match.homeTeam.shortName ?? pick.match.homeTeam.name} vs{" "}
                        {pick.match.awayTeam.shortName ?? pick.match.awayTeam.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {pick.selection} · {pick.market}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono border rounded px-2 py-0.5">
                        {formatOdds(pick.americanOdds)}
                      </span>
                      <ConfidenceBadge score={pick.confidenceScore} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        {/* Upcoming Matches */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Upcoming Matches</CardTitle>
            <Link href="/matches" className="text-sm text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingMatches.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-6">
                No matches loaded — runs at 6am daily
              </p>
            ) : (
              upcomingMatches.map((match: typeof upcomingMatches[number]) => (
                <Link key={match.id} href={`/matches/${match.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors cursor-pointer">
                    <div>
                      <p className="font-medium text-sm">
                        {match.homeTeam.shortName ?? match.homeTeam.name} vs{" "}
                        {match.awayTeam.shortName ?? match.awayTeam.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{match.league}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatMatchDate(match.matchDate)}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground border border-border rounded-lg p-3">
        ⚠️ This platform provides data-driven analysis only. All picks are single bets only.
        Never bet more than you can afford to lose. Past performance does not guarantee future results.
      </p>
    </div>
  );
}

function StatCard({
  title, value, icon, description, highlight, negative,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description: string;
  highlight?: boolean;
  negative?: boolean;
}) {
  const valueColor = highlight ? "text-green-500" : negative ? "text-red-400" : "";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon}
        </div>
        <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

function ConfidenceBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? "bg-green-500/20 text-green-400 border-green-500/30" :
    score >= 62 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${color}`}>
      {score}%
    </span>
  );
}
