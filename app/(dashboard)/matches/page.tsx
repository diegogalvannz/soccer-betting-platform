import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMatchDate, formatOdds, decimalToAmerican } from "@/lib/utils";
import Link from "next/link";

export const revalidate = 60;

export default async function MatchesPage() {
  const [upcoming, recent] = await Promise.all([
    prisma.match.findMany({
      where: { status: "SCHEDULED", matchDate: { gt: new Date() } },
      include: {
        homeTeam: { select: { name: true, shortName: true, logo: true } },
        awayTeam: { select: { name: true, shortName: true, logo: true } },
        picks: { select: { id: true, confidenceScore: true, selection: true } },
      },
      orderBy: { matchDate: "asc" },
      take: 30,
    }),
    prisma.match.findMany({
      where: { status: "FINISHED" },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
        picks: { select: { id: true, status: true, selection: true } },
      },
      orderBy: { matchDate: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Matches</h1>
        <p className="text-muted-foreground mt-1">Upcoming and recent fixtures</p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          Upcoming
          <Badge variant="outline">{upcoming.length}</Badge>
        </h2>
        {upcoming.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No upcoming matches loaded yet. Matches are ingested daily at 6am.</CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {upcoming.map((match) => (
              <Link key={match.id} href={`/matches/${match.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">
                            {match.homeTeam.shortName ?? match.homeTeam.name}
                            <span className="text-muted-foreground font-normal mx-2">vs</span>
                            {match.awayTeam.shortName ?? match.awayTeam.name}
                          </p>
                          {match.picks.length > 0 && (
                            <Badge className="text-xs bg-primary/20 text-primary border-primary/30">
                              Pick available
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {match.league} · {formatMatchDate(match.matchDate)}
                        </p>
                      </div>
                      {match.homeOdds && (
                        <div className="flex gap-2 text-xs font-mono ml-4">
                          <span className="px-2 py-1 bg-accent rounded">{decimalToAmerican(match.homeOdds) > 0 ? "+" : ""}{decimalToAmerican(match.homeOdds)}</span>
                          <span className="px-2 py-1 bg-accent rounded">{match.drawOdds ? (decimalToAmerican(match.drawOdds) > 0 ? "+" : "") + decimalToAmerican(match.drawOdds) : "—"}</span>
                          <span className="px-2 py-1 bg-accent rounded">{match.awayOdds ? (decimalToAmerican(match.awayOdds) > 0 ? "+" : "") + decimalToAmerican(match.awayOdds) : "—"}</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Recent Results</h2>
          <div className="grid gap-3">
            {recent.map((match) => (
              <Link key={match.id} href={`/matches/${match.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer opacity-80">
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">
                          {match.homeTeam.shortName ?? match.homeTeam.name}
                          <span className="font-bold mx-2">{match.homeScore ?? 0} — {match.awayScore ?? 0}</span>
                          {match.awayTeam.shortName ?? match.awayTeam.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {match.league} · {formatMatchDate(match.matchDate)}
                        </p>
                      </div>
                      {match.picks.map((p) => (
                        <span key={p.id} className={`text-xs px-2 py-1 rounded-full border ${
                          p.status === "WON" ? "bg-green-500/20 text-green-400 border-green-500/30" :
                          p.status === "LOST" ? "bg-red-500/20 text-red-400 border-red-500/30" :
                          "bg-gray-500/20 text-gray-400 border-gray-500/30"
                        }`}>
                          {p.status}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
