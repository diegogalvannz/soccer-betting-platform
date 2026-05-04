import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMatchDate, decimalToAmerican, formatOdds } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const revalidate = 60;

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await prisma.match.findUnique({
    where: { id },
    include: {
      homeTeam: true,
      awayTeam: true,
      picks: true,
    },
  });

  if (!match) notFound();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/matches" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Análisis del Partido</h1>
      </div>

      {/* Match Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">{match.league} · {match.leagueCode}</p>
            <div className="flex items-center justify-center gap-6 my-4">
              <div className="text-center">
                <p className="text-xl font-bold">{match.homeTeam.shortName ?? match.homeTeam.name}</p>
                <p className="text-xs text-muted-foreground">Local</p>
              </div>
              {match.status === "FINISHED" ? (
                <div className="text-center">
                  <p className="text-3xl font-bold">{match.homeScore} — {match.awayScore}</p>
                  <Badge variant="outline" className="mt-1 text-xs">FT</Badge>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-2xl font-bold text-muted-foreground">vs</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatMatchDate(match.matchDate)}</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-xl font-bold">{match.awayTeam.shortName ?? match.awayTeam.name}</p>
                <p className="text-xs text-muted-foreground">Visitante</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Odds */}
      {match.homeOdds && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Cuotas del Mercado</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: match.homeTeam.shortName ?? match.homeTeam.name, decimal: match.homeOdds },
                { label: "Empate", decimal: match.drawOdds },
                { label: match.awayTeam.shortName ?? match.awayTeam.name, decimal: match.awayOdds },
              ].map(({ label, decimal }) => (
                <div key={label} className="bg-accent rounded-lg p-3">
                  <p className="text-xs text-muted-foreground truncate">{label}</p>
                  <p className="text-lg font-mono font-bold">{decimal ? decimal.toFixed(2) : "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    {decimal ? formatOdds(decimalToAmerican(decimal)) : ""}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Associated Picks */}
      {match.picks.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Pronósticos Generados</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {match.picks.map((pick) => (
              <Link key={pick.id} href={`/picks/${pick.id}`}>
                <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent transition-colors">
                  <div>
                    <p className="font-medium">{pick.selection}</p>
                    <p className="text-xs text-muted-foreground">{pick.market}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold">{formatOdds(pick.americanOdds)}</span>
                    <span className="text-sm text-muted-foreground">{pick.confidenceScore}/100</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      pick.status === "WON" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                      pick.status === "LOST" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                      "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    }`}>{pick.status}</span>
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      {match.picks.length === 0 && match.status === "SCHEDULED" && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Sin pronóstico generado para este partido aún. Los pronósticos se generan diariamente a las 00:40.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
