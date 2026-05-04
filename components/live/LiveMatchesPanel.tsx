"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LiveMatch, LiveMatchesResponse } from "@/app/api/live-matches/route";
import { getJerseyColor } from "@/lib/jersey-colors";

function JerseyIcon({ color, size = 32 }: { color: string; size?: number }) {
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

const POLL_INTERVAL_MS = 30_000; // frontend polls every 30 seconds

function PulsingDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
    </span>
  );
}

function StatRow({ label, home, away }: { label: string; home: string | number; away: string | number }) {
  return (
    <div className="grid grid-cols-3 text-xs py-0.5">
      <span className="text-right font-medium text-foreground">{home}</span>
      <span className="text-center text-muted-foreground">{label}</span>
      <span className="text-left font-medium text-foreground">{away}</span>
    </div>
  );
}

function RedCardBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5 ml-1">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="inline-block w-2 h-3 bg-red-600 rounded-[1px]" title="Red card" />
      ))}
    </span>
  );
}

function LiveMatchCard({ match }: { match: LiveMatch }) {
  return (
    <Link href={`/matches/live/${match.id}`} className="block">
    <div className="border border-border rounded-xl p-4 bg-card hover:bg-accent/30 transition-colors cursor-pointer">
      {/* Header: live badge + minute */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <PulsingDot />
          <span className="text-xs font-bold text-red-500 uppercase tracking-wider">En Vivo</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold tabular-nums">{match.minute}</span>
          <span className="text-xs text-muted-foreground ml-1">{match.period}</span>
        </div>
      </div>

      {/* Teams + Score */}
      <div className="grid grid-cols-3 items-center gap-2 mb-4">
        {/* Home */}
        <div className="flex flex-col items-center gap-1">
          <JerseyIcon color={getJerseyColor(match.homeTeam)} size={30} />
          <p className="font-semibold text-xs leading-tight text-center line-clamp-2">
            {match.homeTeam}
          </p>
          <RedCardBadge count={match.homeRedCards} />
        </div>

        {/* Score */}
        <div className="text-center">
          <span className="text-2xl font-black tabular-nums">
            {match.homeScore} — {match.awayScore}
          </span>
        </div>

        {/* Away */}
        <div className="flex flex-col items-center gap-1">
          <JerseyIcon color={getJerseyColor(match.awayTeam)} size={30} />
          <p className="font-semibold text-xs leading-tight text-center line-clamp-2">
            {match.awayTeam}
          </p>
          <RedCardBadge count={match.awayRedCards} />
        </div>
      </div>

      {/* Stats section */}
      <div className="border-t border-border/50 pt-3 mt-3 space-y-0.5">
        <div className="grid grid-cols-3 text-[10px] font-medium text-muted-foreground mb-1">
          <span className="text-right">{match.homeTeam.split(" ")[0]}</span>
          <span className="text-center">Estad.</span>
          <span className="text-left">{match.awayTeam.split(" ")[0]}</span>
        </div>
        <StatRow label="Goles" home={match.homeScore} away={match.awayScore} />
        <StatRow label="Tarj. Rojas" home={match.homeRedCards || "—"} away={match.awayRedCards || "—"} />
        <div className="pt-1 text-[10px] text-center text-muted-foreground/60">
          Ver centro de partido →
        </div>
      </div>
    </div>
    </Link>
  );
}

export function LiveMatchesPanel() {
  const [data, setData] = useState<LiveMatchesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState(false);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/live-matches", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const json: LiveMatchesResponse = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const interval = setInterval(fetchLive, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchLive]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PulsingDot />
            <CardTitle className="text-lg">Partidos en Vivo</CardTitle>
          </div>
          <div className="text-right">
            {lastUpdated && (
              <p className="text-xs text-muted-foreground">
                Actualizado {lastUpdated.toLocaleTimeString()}
              </p>
            )}
            {data && (
              <p className="text-[10px] text-muted-foreground/60">
                Llamadas API este mes: {data.monthlyCallsUsed}/100
                {data.source === "cache" && " · caché"}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span className="text-sm">Cargando partidos en vivo...</span>
            </div>
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">No se pudo cargar datos en vivo. Reintentando en 30s.</p>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {data.matches.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">Sin partidos en vivo ahora mismo</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Próxima verificación en {Math.round(data.nextRefreshIn / 60)}m · se actualiza cada 30s
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.matches.map((match) => (
                  <LiveMatchCard key={match.id} match={match} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
