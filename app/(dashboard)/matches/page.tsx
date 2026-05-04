import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { formatMatchDate, decimalToAmerican } from "@/lib/utils";
import { getJerseyColor } from "@/lib/jersey-colors";
import { ALL_LEAGUES, REGIONS, LEAGUES_BY_REGION } from "@/config/leagues";
import Link from "next/link";
import { MatchesClientFilters } from "@/components/matches/MatchesClientFilters";

export const revalidate = 60;

// ─── Jersey SVG ───────────────────────────────────────────────────────────────

function JerseyIcon({ color, size = 36 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M13 2 Q18 7 23 2" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M13 2 L4 10 L8 14 L13 10" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M23 2 L32 10 L28 14 L23 10" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M13 2 Q12 8 11 10 L10 38 L26 38 L25 10 Q24 8 23 2 Q18 7 13 2Z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M17 12 L17 36" stroke="rgba(0,0,0,0.12)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// ─── Match Card ───────────────────────────────────────────────────────────────

type MatchWithTeams = {
  id: string;
  homeTeam: { name: string; shortName: string | null };
  awayTeam: { name: string; shortName: string | null };
  league: string;
  matchDate: Date;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  picks: Array<{ id: string; status: string; selection: string; confidenceScore: number }>;
};

function OddsChip({ val }: { val: number }) {
  const american = decimalToAmerican(val);
  return (
    <span className="text-[11px] font-mono px-1.5 py-0.5 bg-muted/60 rounded border border-border/60">
      {american > 0 ? "+" : ""}{american}
    </span>
  );
}

function PickBadge({ pick }: { pick: { status: string; selection: string } }) {
  const cls =
    pick.status === "WON"  ? "bg-green-500/15 text-green-400 border-green-500/30" :
    pick.status === "LOST" ? "bg-red-500/15 text-red-400 border-red-500/30" :
    pick.status === "VOID" ? "bg-gray-500/15 text-gray-400 border-gray-500/30" :
                             "bg-primary/15 text-primary border-primary/30";
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${cls}`}>
      {pick.status === "PENDING" ? `Pick: ${pick.selection.length > 14 ? pick.selection.slice(0, 14) + "…" : pick.selection}` : pick.status}
    </span>
  );
}

export function MatchCard({ match, finished }: { match: MatchWithTeams; finished?: boolean }) {
  const homeColor = getJerseyColor(match.homeTeam.name);
  const awayColor = getJerseyColor(match.awayTeam.name);
  const homeName = match.homeTeam.shortName ?? match.homeTeam.name;
  const awayName = match.awayTeam.shortName ?? match.awayTeam.name;

  return (
    <Link href={`/matches/${match.id}`}>
      <div className={`group relative bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer ${finished ? "opacity-80" : ""}`}>

        {/* League + date header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-muted/20">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide truncate">
            {match.league}
          </span>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
            {formatMatchDate(match.matchDate)}
          </span>
        </div>

        {/* Teams + score row */}
        <div className="grid grid-cols-3 items-center gap-2 px-4 py-4">
          <div className="flex flex-col items-center gap-1.5">
            <JerseyIcon color={homeColor} size={34} />
            <p className="text-xs font-semibold text-center leading-tight line-clamp-2">{homeName}</p>
          </div>

          <div className="flex flex-col items-center gap-1">
            {finished ? (
              <span className="text-2xl font-black tabular-nums">
                {match.homeScore ?? 0} — {match.awayScore ?? 0}
              </span>
            ) : (
              <>
                <span className="text-lg font-bold text-muted-foreground">vs</span>
                {match.homeOdds && (
                  <div className="flex flex-col items-center gap-0.5 mt-1">
                    <div className="flex gap-1">
                      <OddsChip val={match.homeOdds} />
                      {match.drawOdds && <OddsChip val={match.drawOdds} />}
                      {match.awayOdds && <OddsChip val={match.awayOdds} />}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <JerseyIcon color={awayColor} size={34} />
            <p className="text-xs font-semibold text-center leading-tight line-clamp-2">{awayName}</p>
          </div>
        </div>

        {match.picks.length > 0 && (
          <div className="flex flex-wrap gap-1 px-4 pb-3">
            {match.picks.map((p) => <PickBadge key={p.id} pick={p} />)}
          </div>
        )}

        <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MatchesPage() {
  const [upcoming, recent] = await Promise.all([
    prisma.match.findMany({
      where: { status: { in: ["SCHEDULED", "LIVE"] }, matchDate: { gt: new Date() } },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
        picks: { select: { id: true, status: true, selection: true, confidenceScore: true } },
      },
      orderBy: { matchDate: "asc" },
      take: 100,
    }),
    prisma.match.findMany({
      where: { status: "FINISHED" },
      include: {
        homeTeam: { select: { name: true, shortName: true } },
        awayTeam: { select: { name: true, shortName: true } },
        picks: { select: { id: true, status: true, selection: true, confidenceScore: true } },
      },
      orderBy: { matchDate: "desc" },
      take: 40,
    }),
  ]);

  // Serialize dates for client component
  const upcomingSerialized = upcoming.map(m => ({ ...m, matchDate: m.matchDate.toISOString() }));
  const recentSerialized = recent.map(m => ({ ...m, matchDate: m.matchDate.toISOString() }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Partidos</h1>
        <p className="text-muted-foreground mt-1">Próximos partidos y resultados recientes</p>
      </div>

      <MatchesClientFilters
        upcoming={upcomingSerialized}
        recent={recentSerialized}
        regions={REGIONS}
        leaguesByRegion={LEAGUES_BY_REGION}
        allLeagues={ALL_LEAGUES}
      />
    </div>
  );
}
