import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMatchDate, formatOdds } from "@/lib/utils";
import Link from "next/link";

export const revalidate = 60;

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  WON:     "bg-green-500/20 text-green-400 border-green-500/30",
  LOST:    "bg-red-500/20 text-red-400 border-red-500/30",
  VOID:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
  SKIPPED: "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

const STATUS_ES: Record<string, string> = {
  PENDING: "PENDIENTE",
  WON:     "GANADO",
  LOST:    "PERDIDO",
  VOID:    "NULO",
  SKIPPED: "OMITIDO",
};

export default async function PicksPage() {
  const picks = await prisma.pick.findMany({
    include: {
      match: {
        include: {
          homeTeam: { select: { name: true, shortName: true, logo: true } },
          awayTeam: { select: { name: true, shortName: true, logo: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const pending = picks.filter((p) => p.status === "PENDING");
  const settled = picks.filter((p) => p.status !== "PENDING");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Pronósticos</h1>
        <p className="text-muted-foreground mt-1">
          Pronósticos generados por IA — apuestas simples — cuotas -200 o mejores
        </p>
      </div>

      {/* Active Picks */}
      <section>
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          Pronósticos Activos
          <Badge variant="outline">{pending.length}</Badge>
        </h2>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Sin pronósticos activos. Se generan diariamente a las 00:40.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {pending.map((pick) => (
              <PickRow key={pick.id} pick={pick} />
            ))}
          </div>
        )}
      </section>

      {/* Settled Picks */}
      {settled.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Historial de Pronósticos</h2>
          <div className="grid gap-3">
            {settled.map((pick) => (
              <PickRow key={pick.id} pick={pick} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

type PickRowProps = {
  pick: {
    id: string;
    selection: string;
    market: string;
    americanOdds: number;
    confidenceScore: number;
    status: string;
    createdAt: Date;
    match: {
      matchDate: Date;
      league: string;
      homeTeam: { name: string; shortName: string | null };
      awayTeam: { name: string; shortName: string | null };
    };
  };
};

function PickRow({ pick }: PickRowProps) {
  const statusColor = STATUS_COLORS[pick.status] ?? STATUS_COLORS.VOID;
  const confColor =
    pick.confidenceScore >= 75 ? "text-green-400" :
    pick.confidenceScore >= 62 ? "text-yellow-400" : "text-red-400";

  return (
    <Link href={`/picks/${pick.id}`}>
      <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">
                  {pick.match.homeTeam.shortName ?? pick.match.homeTeam.name} vs{" "}
                  {pick.match.awayTeam.shortName ?? pick.match.awayTeam.name}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor}`}>
                  {STATUS_ES[pick.status] ?? pick.status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                Pronóstico: <span className="text-foreground font-medium">{pick.selection}</span>
                {" · "}
                {pick.market}
                {" · "}
                {pick.match.league}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {formatMatchDate(pick.match.matchDate)}
              </p>
            </div>
            <div className="flex items-center gap-4 ml-4">
              <div className="text-right">
                <p className="font-mono font-bold">{formatOdds(pick.americanOdds)}</p>
                <p className="text-xs text-muted-foreground">cuota</p>
              </div>
              <div className="text-right">
                <p className={`font-bold ${confColor}`}>{pick.confidenceScore}</p>
                <p className="text-xs text-muted-foreground">conf.</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
