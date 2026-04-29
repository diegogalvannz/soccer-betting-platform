import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMatchDate, formatOdds } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { BetButton } from "@/components/picks/BetButton";

export const revalidate = 60;

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  WON:     "bg-green-500/20 text-green-400 border-green-500/30",
  LOST:    "bg-red-500/20 text-red-400 border-red-500/30",
  VOID:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default async function PickDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pick = await prisma.pick.findUnique({
    where: { id },
    include: {
      match: {
        include: {
          homeTeam: true,
          awayTeam: true,
        },
      },
    },
  });

  if (!pick) notFound();

  const confColor =
    pick.confidenceScore >= 75 ? "text-green-400" :
    pick.confidenceScore >= 62 ? "text-yellow-400" : "text-orange-400";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/picks" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Pick Detail</h1>
      </div>

      {/* Match Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">{pick.match.league}</p>
            <h2 className="text-2xl font-bold">
              {pick.match.homeTeam.name} vs {pick.match.awayTeam.name}
            </h2>
            <p className="text-muted-foreground">{formatMatchDate(pick.match.matchDate)}</p>
            {pick.match.status === "FINISHED" && (
              <p className="text-lg font-semibold">
                {pick.match.homeScore} — {pick.match.awayScore}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pick Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recommendation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Selection</p>
              <p className="text-xl font-bold">{pick.selection}</p>
              <p className="text-sm text-muted-foreground">{pick.market}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Odds</p>
              <p className="text-2xl font-mono font-bold">{formatOdds(pick.americanOdds)}</p>
              <p className="text-xs text-muted-foreground">{pick.odds.toFixed(2)} decimal</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Confidence</p>
              <p className={`text-3xl font-bold ${confColor}`}>{pick.confidenceScore}/100</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <span className={`text-sm px-3 py-1 rounded-full border ${STATUS_COLORS[pick.status] ?? STATUS_COLORS.VOID}`}>
                {pick.status}
              </span>
            </div>
          </div>

          {/* Confidence bar */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>Confidence Score</span>
              <span>{pick.confidenceScore}/100</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  pick.confidenceScore >= 75 ? "bg-green-500" :
                  pick.confidenceScore >= 62 ? "bg-yellow-500" : "bg-orange-500"
                }`}
                style={{ width: `${pick.confidenceScore}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reasoning */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Analysis & Reasoning</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{pick.reasoning}</p>
          {pick.sentimentSummary && (
            <div className="mt-4 p-3 rounded-lg bg-accent">
              <p className="text-xs font-medium text-muted-foreground mb-1">Sentiment</p>
              <p className="text-sm">{pick.sentimentSummary}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Odds Breakdown */}
      {pick.match.homeOdds && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Market Odds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <OddsCell
                label={pick.match.homeTeam.shortName ?? pick.match.homeTeam.name}
                value={pick.match.homeOdds}
                highlight={pick.selection === pick.match.homeTeam.name}
              />
              <OddsCell
                label="Draw"
                value={pick.match.drawOdds}
                highlight={pick.selection === "Draw"}
              />
              <OddsCell
                label={pick.match.awayTeam.shortName ?? pick.match.awayTeam.name}
                value={pick.match.awayOdds}
                highlight={pick.selection === pick.match.awayTeam.name}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Log Bet Button */}
      {pick.status === "PENDING" && (
        <BetButton pickId={pick.id} odds={pick.odds} americanOdds={pick.americanOdds} />
      )}

      <p className="text-xs text-muted-foreground text-center">
        Single bets only. This is data analysis — not financial advice. Never bet more than you can afford to lose.
      </p>
    </div>
  );
}

function OddsCell({ label, value, highlight }: { label: string; value: number | null; highlight: boolean }) {
  return (
    <div className={`p-3 rounded-lg ${highlight ? "bg-primary/20 border border-primary/30" : "bg-accent"}`}>
      <p className="text-xs text-muted-foreground truncate">{label}</p>
      <p className="text-lg font-mono font-bold mt-1">{value ? value.toFixed(2) : "—"}</p>
    </div>
  );
}
