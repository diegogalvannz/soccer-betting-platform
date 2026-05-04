import { prisma } from "@/lib/prisma";
import { Target, TrendingUp, Calendar, Trophy, DollarSign, ChevronRight } from "lucide-react";
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
    prisma.pick.count({ where: { status: "PENDING" } }),
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
    prisma.match.findMany({
      where: { status: "SCHEDULED", matchDate: { gt: now, lt: next48h } },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
      },
      orderBy: { matchDate: "asc" },
      take: 5,
    }),
    prisma.pick.findMany({
      where: { status: { in: ["WON", "LOST"] } },
      select: { status: true },
    }),
    prisma.bet.aggregate({
      where: { result: { in: ["WON", "LOST"] } },
      _sum: { profit: true, stake: true },
      _count: { id: true },
    }),
  ]);

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
    <div className="space-y-6">
      {/* Page title — hidden on mobile (top bar has logo) */}
      <div className="hidden md:block">
        <h1 className="text-3xl font-bold">Panel Principal</h1>
        <p className="text-muted-foreground mt-1 text-sm">Resumen de inteligencia de apuestas</p>
      </div>

      {/* ── Stat chips — horizontal scroll on mobile, grid on desktop ── */}
      <div className="flex gap-3 overflow-x-auto scroll-smooth-x pb-1 md:grid md:grid-cols-5 md:overflow-visible">
        <StatChip
          label="Pronósticos Activos"
          value={pendingPicksCount}
          sub="En espera"
          icon={<Target className="h-3.5 w-3.5" />}
          href="/picks?status=PENDING"
        />
        <StatChip
          label="% Aciertos"
          value={totalSettled > 0 ? `${winRate}%` : "—"}
          sub={totalSettled > 0 ? `${wonCount}G · ${totalSettled - wonCount}P` : "Sin datos"}
          icon={<Trophy className="h-3.5 w-3.5" />}
          highlight={winRate >= 55 && totalSettled > 0}
          href="/analytics"
        />
        <StatChip
          label="Próximos"
          value={upcomingMatches.length}
          sub="Próximas 48h"
          icon={<Calendar className="h-3.5 w-3.5" />}
          href="/matches"
        />
        <StatChip
          label="Total Picks"
          value={pendingPicksCount + totalSettled}
          sub="Historial completo"
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          href="/picks"
        />
        <StatChip
          label="Ganancia / ROI"
          value={totalStaked > 0 ? profitDisplay : "—"}
          sub={totalStaked > 0 ? `ROI ${roi > 0 ? "+" : ""}${roi}%` : "Sin apuestas"}
          icon={<DollarSign className="h-3.5 w-3.5" />}
          highlight={totalProfit > 0}
          negative={totalProfit < 0}
          href="/analytics"
        />
      </div>

      {/* ── Live Matches ── */}
      <LiveMatchesPanel />

      {/* ── 2-col grid: Picks + Upcoming ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Picks */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Pronósticos Activos</h2>
            <Link href="/picks" className="text-xs text-primary hover:underline font-medium">
              Ver todos
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentPicks.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                Sin pronósticos — se generan a las 00:40
              </p>
            ) : (
              recentPicks.map((pick) => (
                <Link key={pick.id} href={`/picks/${pick.id}`}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors cursor-pointer min-h-[56px]">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {pick.match.homeTeam.shortName ?? pick.match.homeTeam.name}{" "}
                        <span className="text-muted-foreground font-normal">vs</span>{" "}
                        {pick.match.awayTeam.shortName ?? pick.match.awayTeam.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {pick.selection} · {pick.market}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <span className="text-xs font-mono bg-muted/60 border border-border/60 rounded px-1.5 py-0.5">
                        {formatOdds(pick.americanOdds)}
                      </span>
                      <ConfidenceBadge score={pick.confidenceScore} />
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Matches */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-sm">Próximos Partidos</h2>
            <Link href="/matches" className="text-xs text-primary hover:underline font-medium">
              Ver todos
            </Link>
          </div>
          <div className="divide-y divide-border">
            {upcomingMatches.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">
                Sin partidos cargados — se actualizan a las 00:40
              </p>
            ) : (
              upcomingMatches.map((match) => (
                <Link key={match.id} href={`/matches/${match.id}`}>
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors cursor-pointer min-h-[56px]">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">
                        {match.homeTeam.shortName ?? match.homeTeam.name}{" "}
                        <span className="text-muted-foreground font-normal">vs</span>{" "}
                        {match.awayTeam.shortName ?? match.awayTeam.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{match.league}</p>
                    </div>
                    <p className="text-xs text-muted-foreground ml-3 shrink-0">
                      {formatMatchDate(match.matchDate)}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-[11px] text-muted-foreground/60 border border-border/50 rounded-xl p-3 leading-relaxed">
        ⚠️ Pronósticos generados por IA basados en datos. Nunca apuestes más de lo que puedes perder.
        El rendimiento pasado no garantiza resultados futuros.
      </p>
    </div>
  );
}

// ── Stat chip — mobile-friendly horizontal scroll card ──────────────────────

function StatChip({
  label, value, sub, icon, highlight, negative, href,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  highlight?: boolean;
  negative?: boolean;
  href: string;
}) {
  const valColor = highlight ? "text-primary" : negative ? "text-red-400" : "text-foreground";
  return (
    <Link href={href} className="shrink-0 md:shrink block">
      <div className="
        w-[150px] md:w-auto
        bg-card border border-border rounded-2xl p-4
        hover:border-primary/30 hover:bg-accent/30 transition-all duration-200
        cursor-pointer
      ">
        <div className="flex items-center justify-between mb-2">
          <span className="text-muted-foreground">{icon}</span>
          <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
        </div>
        <p className={`text-2xl font-black tabular-nums leading-none ${valColor}`}>{value}</p>
        <p className="text-[11px] font-medium text-muted-foreground mt-1.5 leading-tight">{label}</p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{sub}</p>
      </div>
    </Link>
  );
}

// ── Confidence badge ─────────────────────────────────────────────────────────

function ConfidenceBadge({ score }: { score: number }) {
  const cls =
    score >= 75 ? "bg-primary/15 text-primary border-primary/30" :
    score >= 62 ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" :
    "bg-red-500/20 text-red-400 border-red-500/30";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${cls}`}>
      {score}%
    </span>
  );
}
