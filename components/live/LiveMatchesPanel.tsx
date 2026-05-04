"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { LiveMatch, LiveMatchesResponse } from "@/app/api/live-matches/route";
import { getJerseyColor } from "@/lib/jersey-colors";

function JerseyIcon({ color, size = 26 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 40" fill="none" aria-hidden>
      <path d="M13 2 Q18 7 23 2" stroke={color} strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M13 2 L4 10 L8 14 L13 10" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M23 2 L32 10 L28 14 L23 10" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
      <path d="M13 2 Q12 8 11 10 L10 38 L26 38 L25 10 Q24 8 23 2 Q18 7 13 2Z" fill={color} stroke={color} strokeWidth="0.5" strokeLinejoin="round" />
    </svg>
  );
}

const POLL_MS = 30_000;

function PulsingDot({ size = "sm" }: { size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-3 w-3" : "h-2 w-2";
  return (
    <span className={`relative flex ${dim}`}>
      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75`} />
      <span className={`relative inline-flex rounded-full ${dim} bg-red-500`} />
    </span>
  );
}

function RedCards({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="flex gap-0.5 ml-0.5">
      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
        <span key={i} className="inline-block w-1.5 h-2.5 bg-red-600 rounded-[1px]" />
      ))}
    </span>
  );
}

/** Compact card for mobile horizontal scroll + desktop grid */
function LiveCard({ match }: { match: LiveMatch }) {
  const hc = getJerseyColor(match.homeTeam);
  const ac = getJerseyColor(match.awayTeam);
  const homeName = match.homeTeam.split(" ").slice(0, 2).join(" ");
  const awayName = match.awayTeam.split(" ").slice(0, 2).join(" ");

  return (
    <Link href={`/matches/live/${match.id}`} className="block">
      <div className="
        w-[200px] md:w-auto
        bg-card border border-border rounded-2xl p-3
        hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10
        hover:scale-[1.02] transition-all duration-200 cursor-pointer
        shrink-0 md:shrink
      ">
        {/* EN VIVO badge + minute */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <PulsingDot />
            <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">EN VIVO</span>
          </div>
          <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{match.minute}</span>
        </div>

        {/* Teams + Score */}
        <div className="grid grid-cols-3 items-center gap-1">
          {/* Home */}
          <div className="flex flex-col items-center gap-1">
            <JerseyIcon color={hc} size={24} />
            <p className="text-[10px] font-semibold text-center leading-tight line-clamp-2 w-full">
              {homeName}
            </p>
            <RedCards count={match.homeRedCards} />
          </div>

          {/* Score */}
          <div className="flex flex-col items-center">
            <span className="text-xl font-black tabular-nums leading-none">
              {match.homeScore}–{match.awayScore}
            </span>
            <span className="text-[9px] text-muted-foreground mt-0.5 truncate max-w-full px-1 text-center">
              {match.period}
            </span>
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-1">
            <JerseyIcon color={ac} size={24} />
            <p className="text-[10px] font-semibold text-center leading-tight line-clamp-2 w-full">
              {awayName}
            </p>
            <RedCards count={match.awayRedCards} />
          </div>
        </div>

        {/* Tap to open */}
        <p className="text-[9px] text-center text-muted-foreground/50 mt-2">Ver partido →</p>
      </div>
    </Link>
  );
}

export function LiveMatchesPanel() {
  const [data, setData] = useState<LiveMatchesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/live-matches", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
    const t = setInterval(fetchLive, POLL_MS);
    return () => clearInterval(t);
  }, [fetchLive]);

  if (loading) {
    return (
      <section>
        <SectionHeader count={0} />
        <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          Cargando partidos en vivo...
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section>
        <SectionHeader count={0} />
        <p className="text-sm text-muted-foreground py-4">
          No se pudo cargar datos en vivo. Reintentando en 30s.
        </p>
      </section>
    );
  }

  if (data.matches.length === 0) {
    return (
      <section>
        <SectionHeader count={0} />
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-muted-foreground text-sm">Sin partidos en vivo ahora mismo</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Se actualiza cada 30s · Próxima API refresh en {Math.round(data.nextRefreshIn / 60)}m
          </p>
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader count={data.matches.length} />
      {/* Mobile: horizontal scroll · Desktop: 3-col grid */}
      <div className="
        flex gap-3 overflow-x-auto scroll-smooth-x pb-1
        md:grid md:grid-cols-3 md:overflow-visible
      ">
        {data.matches.map((m) => <LiveCard key={m.id} match={m} />)}
      </div>
      <p className="text-[10px] text-muted-foreground/40 mt-2">
        {data.totalLive} en vivo · {data.source === "live" ? "API-Football" : data.source === "error" ? "fuente BD" : "caché"} · actualiza cada 30s
      </p>
    </section>
  );
}

function SectionHeader({ count }: { count: number }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <PulsingDot size="md" />
        <h2 className="text-base font-bold">Partidos en Vivo</h2>
        {count > 0 && (
          <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full px-2 py-0.5 font-medium">
            {count}
          </span>
        )}
      </div>
    </div>
  );
}
