"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { getJerseyColor } from "@/lib/jersey-colors";
import { formatMatchDate, decimalToAmerican } from "@/lib/utils";
import Link from "next/link";
import type { League } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type SerializedMatch = {
  id: string;
  homeTeam: { name: string; shortName: string | null };
  awayTeam: { name: string; shortName: string | null };
  league: string;
  matchDate: string;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  picks: Array<{ id: string; status: string; selection: string; confidenceScore: number }>;
};

// ─── Jersey ───────────────────────────────────────────────────────────────────

function JerseyIcon({ color, size = 34 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 40" fill="none" aria-hidden>
      <path d="M13 2 Q18 7 23 2" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M13 2 L4 10 L8 14 L13 10" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M23 2 L32 10 L28 14 L23 10" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M13 2 Q12 8 11 10 L10 38 L26 38 L25 10 Q24 8 23 2 Q18 7 13 2Z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M17 12 L17 36" stroke="rgba(0,0,0,0.12)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

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
      {pick.status === "PENDING"
        ? `Pick: ${pick.selection.length > 14 ? pick.selection.slice(0, 14) + "…" : pick.selection}`
        : pick.status}
    </span>
  );
}

function MatchCard({ match, finished }: { match: SerializedMatch; finished?: boolean }) {
  const homeColor = getJerseyColor(match.homeTeam.name);
  const awayColor = getJerseyColor(match.awayTeam.name);
  const homeName = match.homeTeam.shortName ?? match.homeTeam.name;
  const awayName = match.awayTeam.shortName ?? match.awayTeam.name;

  return (
    <Link href={`/matches/${match.id}`}>
      <div className={`group relative bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer ${finished ? "opacity-80" : ""}`}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-muted/20">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide truncate">{match.league}</span>
          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{formatMatchDate(new Date(match.matchDate))}</span>
        </div>
        <div className="grid grid-cols-3 items-center gap-2 px-4 py-4">
          <div className="flex flex-col items-center gap-1.5">
            <JerseyIcon color={homeColor} />
            <p className="text-xs font-semibold text-center leading-tight line-clamp-2">{homeName}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            {finished ? (
              <span className="text-2xl font-black tabular-nums">{match.homeScore ?? 0} — {match.awayScore ?? 0}</span>
            ) : (
              <>
                <span className="text-lg font-bold text-muted-foreground">vs</span>
                {match.homeOdds ? (
                  <div className="flex gap-1 mt-1">
                    <OddsChip val={match.homeOdds} />
                    {match.drawOdds && <OddsChip val={match.drawOdds} />}
                    {match.awayOdds && <OddsChip val={match.awayOdds} />}
                  </div>
                ) : (
                  <span className="text-[9px] text-muted-foreground/50 mt-1 text-center leading-tight">Cuotas próximamente</span>
                )}
              </>
            )}
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <JerseyIcon color={awayColor} />
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

// ─── League catalogue card (for "coming soon" leagues) ────────────────────────

function LeagueCatalogCard({ league }: { league: League }) {
  const isSoon = league.source === "coming-soon";
  return (
    <div className={`px-3 py-2 rounded-lg border text-sm flex items-center justify-between gap-2 ${isSoon ? "border-border/40 opacity-60" : "border-primary/30 bg-primary/5"}`}>
      <span className="font-medium truncate">{league.name}</span>
      {isSoon
        ? <span className="text-[10px] text-muted-foreground shrink-0">Próximamente</span>
        : <span className="text-[10px] text-green-400 shrink-0">Activo</span>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  upcoming: SerializedMatch[];
  recent: SerializedMatch[];
  regions: string[];
  leaguesByRegion: Record<string, League[]>;
  allLeagues: League[];
};

type Tab = "partidos" | "ligas";
type MatchFilter = "todos" | string; // "todos" or a league name

export function MatchesClientFilters({ upcoming, recent, regions, leaguesByRegion, allLeagues }: Props) {
  const [tab, setTab] = useState<Tab>("partidos");
  const [selectedRegion, setSelectedRegion] = useState<string>("Todas");
  const [leagueFilter, setLeagueFilter] = useState<MatchFilter>("todos");

  // Unique league names present in the actual matches
  const matchLeagues = useMemo(() => {
    const set = new Set<string>();
    [...upcoming, ...recent].forEach(m => set.add(m.league));
    return Array.from(set).sort();
  }, [upcoming, recent]);

  const filteredUpcoming = useMemo(() => {
    if (leagueFilter === "todos") return upcoming;
    return upcoming.filter(m => m.league === leagueFilter);
  }, [upcoming, leagueFilter]);

  const filteredRecent = useMemo(() => {
    if (leagueFilter === "todos") return recent;
    return recent.filter(m => m.league === leagueFilter);
  }, [recent, leagueFilter]);

  const filteredRegions = useMemo(() => {
    if (selectedRegion === "Todas") return regions;
    return regions.filter(r => r === selectedRegion);
  }, [regions, selectedRegion]);

  return (
    <div className="space-y-6">
      {/* Top-level tabs: Partidos | Ligas */}
      <div className="flex gap-1 border-b border-border">
        {(["partidos", "ligas"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "partidos" ? "Partidos" : "Ligas y Competiciones"}
          </button>
        ))}
      </div>

      {/* ── PARTIDOS TAB ── */}
      {tab === "partidos" && (
        <div className="space-y-6">
          {/* League filter pills */}
          {matchLeagues.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setLeagueFilter("todos")}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  leagueFilter === "todos"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                Todas ({upcoming.length + recent.length})
              </button>
              {matchLeagues.map(league => {
                const count = [...upcoming, ...recent].filter(m => m.league === league).length;
                return (
                  <button
                    key={league}
                    onClick={() => setLeagueFilter(league)}
                    className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                      leagueFilter === league
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {league} ({count})
                  </button>
                );
              })}
            </div>
          )}

          {/* Upcoming matches */}
          <section>
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              Próximos
              <Badge variant="outline" className="text-xs">{filteredUpcoming.length}</Badge>
            </h2>
            {filteredUpcoming.length === 0 ? (
              <div className="rounded-xl border border-border bg-card py-12 text-center text-muted-foreground text-sm">
                Sin partidos próximos — se actualizan diariamente a las 12:40 AM
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredUpcoming.map(m => <MatchCard key={m.id} match={m} />)}
              </div>
            )}
          </section>

          {/* Recent results */}
          {filteredRecent.length > 0 && (
            <section>
              <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
                Resultados Recientes
                <Badge variant="outline" className="text-xs">{filteredRecent.length}</Badge>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredRecent.map(m => <MatchCard key={m.id} match={m} finished />)}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ── LIGAS TAB ── */}
      {tab === "ligas" && (
        <div className="space-y-6">
          {/* Region filter */}
          <div className="flex flex-wrap gap-2">
            {["Todas", ...regions].map(r => (
              <button
                key={r}
                onClick={() => setSelectedRegion(r)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  selectedRegion === r
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {/* League grid per region */}
          {filteredRegions.map(region => (
            <section key={region}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{region}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(leaguesByRegion[region] ?? []).map(league => (
                  <LeagueCatalogCard key={league.code} league={league} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
