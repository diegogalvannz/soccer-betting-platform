"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Zap } from "lucide-react";
import type { LiveMatchDetail, TeamForm, H2HMatch } from "@/app/api/live-match/[id]/route";

const POLL_MS = 3_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Small atoms ─────────────────────────────────────────────────────────────

function PulsingDot() {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
    </span>
  );
}

function RedCard({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="flex gap-0.5 ml-1 items-center">
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} className="inline-block w-2.5 h-3.5 bg-red-600 rounded-[2px]" />
      ))}
    </span>
  );
}

function FormBadge({ result }: { result: "W" | "D" | "L" }) {
  const cls =
    result === "W" ? "bg-green-500/20 text-green-400 border-green-500/40" :
    result === "D" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" :
                    "bg-red-500/20 text-red-400 border-red-500/40";
  return (
    <span className={cn("text-xs font-bold px-2 py-0.5 rounded border", cls)}>
      {result}
    </span>
  );
}

// ─── Score header ─────────────────────────────────────────────────────────────

function ScoreHeader({
  match,
  prevScore,
}: {
  match: LiveMatchDetail;
  prevScore: { home: number; away: number } | null;
}) {
  const homeChanged = prevScore !== null && match.homeScore !== prevScore.home;
  const awayChanged = prevScore !== null && match.awayScore !== prevScore.away;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Competition bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs text-muted-foreground font-medium tracking-wide uppercase">
          {match.competition}
        </span>
        <div className="flex items-center gap-2">
          <PulsingDot />
          <span className="text-xs font-bold text-red-500 uppercase tracking-wider">En Vivo</span>
        </div>
      </div>

      {/* Score row */}
      <div className="grid grid-cols-3 items-center gap-4 px-6 py-8">
        {/* Home */}
        <div className="text-right space-y-1">
          <p className="text-xl font-bold leading-tight">{match.homeTeam}</p>
          {match.homeRedCards > 0 && (
            <div className="flex justify-end">
              <RedCard count={match.homeRedCards} />
            </div>
          )}
        </div>

        {/* Score + clock */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-3">
            <span
              className={cn(
                "text-5xl font-black tabular-nums transition-all duration-300",
                homeChanged && "text-green-400 scale-110"
              )}
            >
              {match.homeScore}
            </span>
            <span className="text-3xl font-light text-muted-foreground">—</span>
            <span
              className={cn(
                "text-5xl font-black tabular-nums transition-all duration-300",
                awayChanged && "text-green-400 scale-110"
              )}
            >
              {match.awayScore}
            </span>
          </div>
          <div className="mt-3 flex flex-col items-center gap-1">
            <span className="text-2xl font-bold tabular-nums text-primary">
              {match.minute}
            </span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest">
              {match.period}
            </span>
          </div>
        </div>

        {/* Away */}
        <div className="text-left space-y-1">
          <p className="text-xl font-bold leading-tight">{match.awayTeam}</p>
          {match.awayRedCards > 0 && (
            <div className="flex justify-start">
              <RedCard count={match.awayRedCards} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Team form row ────────────────────────────────────────────────────────────

function FormRow({ homeForm, awayForm }: { homeForm: TeamForm[]; awayForm: TeamForm[] }) {
  if (homeForm.length === 0 && awayForm.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium">Forma Local</p>
          <div className="flex gap-1">
            {homeForm.length > 0 ? (
              homeForm.map((f, i) => <FormBadge key={i} result={f.result} />)
            ) : (
              <span className="text-xs text-muted-foreground">Sin datos</span>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium">Forma Visitante</p>
          <div className="flex gap-1">
            {awayForm.length > 0 ? (
              awayForm.map((f, i) => <FormBadge key={i} result={f.result} />)
            ) : (
              <span className="text-xs text-muted-foreground">Sin datos</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "facts" | "stats" | "lineup" | "h2h";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "facts", label: "Eventos" },
    { id: "stats", label: "Estadísticas" },
    { id: "lineup", label: "Alineación" },
    { id: "h2h", label: "Head to Head" },
  ];
  return (
    <div className="flex border border-border rounded-xl overflow-hidden">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex-1 py-2.5 text-sm font-medium transition-colors",
            active === t.id
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Facts Tab ────────────────────────────────────────────────────────────────

function FactsTab({ match }: { match: LiveMatchDetail }) {
  // Build a synthetic event list from what we know
  const events: { type: string; minute: string; team: "home" | "away"; label: string }[] = [];

  if (match.homeRedCards > 0) {
    events.push({ type: "red", minute: "—", team: "home", label: `${match.homeTeam} — Red Card` });
  }
  if (match.awayRedCards > 0) {
    events.push({ type: "red", minute: "—", team: "away", label: `${match.awayTeam} — Red Card` });
  }

  return (
    <div className="space-y-4">
      {/* Premium notice */}
      <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
        <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Eventos en Vivo — Próximamente</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Goles, asistencias, tarjetas amarillas y sustituciones requieren nuestro feed de datos premium.
            Los eventos detallados aparecerán aquí automáticamente una vez habilitados.
          </p>
        </div>
      </div>

      {/* What we know */}
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-card border border-border rounded-lg">
              <span className="w-8 text-xs font-mono text-muted-foreground text-center">{e.minute}</span>
              <span className="w-4 h-5 bg-red-600 rounded-[2px] shrink-0" />
              <span className="text-sm">{e.label}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Timeline skeleton showing what it will look like */}
      <div className="space-y-2 opacity-40 pointer-events-none select-none" aria-hidden>
        <p className="text-xs text-muted-foreground px-1 font-medium">Vista previa (eventos de ejemplo)</p>
        {[
          { icon: "⚽", min: "23'", text: "Goal — Striker Name (Assist: Midfielder)", color: "border-green-500/30 bg-green-500/5" },
          { icon: "🟡", min: "37'", text: "Yellow Card — Defender Name", color: "border-yellow-500/30 bg-yellow-500/5" },
          { icon: "🔄", min: "46'", text: "Sub — Player In ↔ Player Out", color: "border-blue-500/30 bg-blue-500/5" },
          { icon: "⚽", min: "71'", text: "Goal — Forward Name (Penalty)", color: "border-green-500/30 bg-green-500/5" },
        ].map((e, i) => (
          <div key={i} className={cn("flex items-center gap-3 px-3 py-2.5 border rounded-lg", e.color)}>
            <span className="w-8 text-xs font-mono text-center">{e.min}</span>
            <span className="text-base">{e.icon}</span>
            <span className="text-sm">{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────

function StatBar({
  label,
  home,
  away,
  homeVal,
  awayVal,
  premium,
}: {
  label: string;
  home: string | number;
  away: string | number;
  homeVal?: number;
  awayVal?: number;
  premium?: boolean;
}) {
  const total = (homeVal ?? 0) + (awayVal ?? 0);
  const homePercent = total > 0 ? Math.round(((homeVal ?? 0) / total) * 100) : 50;

  return (
    <div className={cn("space-y-1", premium && "opacity-40 pointer-events-none select-none")}>
      <div className="flex justify-between text-xs font-medium">
        <span className={cn(premium && "blur-[2px]")}>{home}</span>
        <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</span>
        <span className={cn(premium && "blur-[2px]")}>{away}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/30">
        <div
          className="bg-blue-500 transition-all duration-500"
          style={{ width: `${homePercent}%` }}
        />
        <div
          className="bg-orange-500 flex-1 transition-all duration-500"
        />
      </div>
    </div>
  );
}

function StatsTab({ match }: { match: LiveMatchDetail }) {
  return (
    <div className="space-y-5">
      {/* Legend */}
      <div className="flex justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full bg-blue-500" />
          <span>{match.homeTeam.split(" ")[0]}</span>
        </div>
        <span className="font-medium">Estadísticas</span>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-1.5 rounded-full bg-orange-500" />
          <span>{match.awayTeam.split(" ")[0]}</span>
        </div>
      </div>

      {/* Live stats (from what we have) */}
      <div className="space-y-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Disponible Ahora</p>
        <StatBar
          label="Goles"
          home={match.homeScore}
          away={match.awayScore}
          homeVal={match.homeScore}
          awayVal={match.awayScore}
        />
        <StatBar
          label="Tarj. Rojas"
          home={match.homeRedCards || 0}
          away={match.awayRedCards || 0}
          homeVal={match.homeRedCards}
          awayVal={match.awayRedCards}
        />
      </div>

      {/* Premium placeholder stats */}
      <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
        <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Estadísticas Detalladas — Próximamente</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Posesión, tiros, córneres, faltas, pases y ataques requieren nuestro feed de datos premium.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Próximamente</p>
        {[
          { label: "Posesión", home: "52%", away: "48%", homeVal: 52, awayVal: 48 },
          { label: "Tiros Totales", home: "8", away: "5", homeVal: 8, awayVal: 5 },
          { label: "Tiros a Portería", home: "4", away: "2", homeVal: 4, awayVal: 2 },
          { label: "Córneres", home: "5", away: "3", homeVal: 5, awayVal: 3 },
          { label: "Faltas", home: "11", away: "14", homeVal: 11, awayVal: 14 },
          { label: "Tarj. Amarillas", home: "2", away: "3", homeVal: 2, awayVal: 3 },
          { label: "Fueras de Lugar", home: "2", away: "1", homeVal: 2, awayVal: 1 },
          { label: "Pases", home: "312", away: "278", homeVal: 312, awayVal: 278 },
        ].map((s) => (
          <StatBar key={s.label} premium {...s} />
        ))}
      </div>
    </div>
  );
}

// ─── Lineup Tab ───────────────────────────────────────────────────────────────

function LineupTab({ match }: { match: LiveMatchDetail }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
        <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Alineaciones — Próximamente</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Titulares, formaciones y suplentes requieren nuestro feed de datos premium.
            Las alineaciones se confirman normalmente 1 hora antes del partido.
          </p>
        </div>
      </div>

      {/* Pitch visualization placeholder */}
      <div className="relative bg-green-950/40 border border-green-900/40 rounded-xl overflow-hidden" style={{ aspectRatio: "2/3" }}>
        {/* Pitch markings */}
        <div className="absolute inset-[8%] border border-green-800/40 rounded" />
        <div className="absolute left-[8%] right-[8%] top-1/2 -translate-y-px h-px bg-green-800/40" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-green-800/40" />
        {/* Top penalty box */}
        <div className="absolute top-[8%] left-[25%] right-[25%] h-[15%] border border-green-800/40" />
        {/* Bottom penalty box */}
        <div className="absolute bottom-[8%] left-[25%] right-[25%] h-[15%] border border-green-800/40" />

        {/* Team labels */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center">
          <p className="text-xs font-semibold text-green-300/80">{match.homeTeam}</p>
        </div>
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
          <p className="text-xs font-semibold text-green-300/80">{match.awayTeam}</p>
        </div>

        {/* Placeholder player dots */}
        {[
          // Home team (top half) — 4-3-3
          [50, 12], [20, 28], [37, 28], [63, 28], [80, 28],
          [30, 42], [50, 40], [70, 42],
          [20, 53], [50, 56], [80, 53],
        ].map(([x, y], i) => (
          <div
            key={`h${i}`}
            className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/40 border border-blue-400/60 flex items-center justify-center"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="text-[8px] text-blue-200/60">?</span>
          </div>
        ))}
        {[
          // Away team (bottom half) — 4-3-3
          [50, 88], [20, 72], [37, 72], [63, 72], [80, 72],
          [30, 58], [50, 60], [70, 58],
          [20, 47], [50, 44], [80, 47],
        ].map(([x, y], i) => (
          <div
            key={`a${i}`}
            className="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-500/40 border border-orange-400/60 flex items-center justify-center"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <span className="text-[8px] text-orange-200/60">?</span>
          </div>
        ))}

        {/* Overlay blur */}
        <div className="absolute inset-0 backdrop-blur-[1px] flex items-center justify-center">
          <div className="text-center space-y-1 bg-black/60 rounded-xl px-6 py-4">
            <p className="text-sm font-semibold">Alineación No Disponible</p>
            <p className="text-xs text-muted-foreground">Próximamente</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── H2H Tab ──────────────────────────────────────────────────────────────────

function H2HTab({
  match,
  h2h,
}: {
  match: LiveMatchDetail;
  h2h: H2HMatch[];
}) {
  if (h2h.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-muted-foreground text-sm">Sin historial de enfrentamientos directos</p>
        <p className="text-xs text-muted-foreground/60">
          Estos equipos no se han enfrentado en las ligas que seguimos aún.
        </p>
      </div>
    );
  }

  const homeWins = h2h.filter((m) => {
    const hName = match.homeTeam;
    return (m.homeTeam.includes(hName.split(" ")[0]) && m.homeScore > m.awayScore) ||
           (m.awayTeam.includes(hName.split(" ")[0]) && m.awayScore > m.homeScore);
  }).length;
  const awayWins = h2h.filter((m) => {
    const aName = match.awayTeam;
    return (m.homeTeam.includes(aName.split(" ")[0]) && m.homeScore > m.awayScore) ||
           (m.awayTeam.includes(aName.split(" ")[0]) && m.awayScore > m.homeScore);
  }).length;
  const draws = h2h.length - homeWins - awayWins;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 text-center bg-card border border-border rounded-xl divide-x divide-border overflow-hidden">
        <div className="py-3">
          <p className="text-2xl font-black text-blue-400">{homeWins}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate px-2">{match.homeTeam.split(" ")[0]} Victorias</p>
        </div>
        <div className="py-3">
          <p className="text-2xl font-black text-muted-foreground">{draws}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Empates</p>
        </div>
        <div className="py-3">
          <p className="text-2xl font-black text-orange-400">{awayWins}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate px-2">{match.awayTeam.split(" ")[0]} Victorias</p>
        </div>
      </div>

      {/* Match list */}
      <div className="space-y-2">
        {h2h.map((m, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2.5 bg-card border border-border rounded-lg">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs text-muted-foreground shrink-0">{m.date}</span>
              <span className="text-xs text-muted-foreground/60 truncate hidden sm:block">{m.competition}</span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-medium text-right truncate max-w-[80px]">{m.homeTeam}</span>
              <span className="text-base font-black tabular-nums">
                {m.homeScore} — {m.awayScore}
              </span>
              <span className="text-sm font-medium text-left truncate max-w-[80px]">{m.awayTeam}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-48 bg-card border border-border rounded-xl" />
      <div className="h-16 bg-card border border-border rounded-xl" />
      <div className="h-10 bg-card border border-border rounded-xl" />
      <div className="h-64 bg-card border border-border rounded-xl" />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function LiveMatchPage() {
  const { id } = useParams<{ id: string }>();
  const [match, setMatch] = useState<LiveMatchDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("facts");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsSince, setSecondsSince] = useState(0);
  const prevScoreRef = useRef<{ home: number; away: number } | null>(null);

  const fetchMatch = useCallback(async () => {
    try {
      const res = await fetch(`/api/live-match/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Match not found" }));
        setError((err as { error: string }).error ?? "Match not found");
        return;
      }
      const data: LiveMatchDetail = await res.json();
      setMatch((prev) => {
        if (prev) {
          prevScoreRef.current = { home: prev.homeScore, away: prev.awayScore };
        }
        return data;
      });
      setLastUpdated(new Date());
      setSecondsSince(0);
      setError(null);
    } catch {
      setError("Connection error. Retrying…");
    }
  }, [id]);

  // Initial fetch + polling every 3 seconds
  useEffect(() => {
    fetchMatch();
    const interval = setInterval(fetchMatch, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchMatch]);

  // "Seconds since" counter
  useEffect(() => {
    const tick = setInterval(() => setSecondsSince((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [lastUpdated]);

  if (error && !match) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Volver al Panel
        </Link>
        <div className="text-center py-16">
          <p className="text-muted-foreground">{error}</p>
          <p className="text-xs text-muted-foreground/60 mt-2">
            Es posible que el partido haya terminado o no esté en vivo actualmente.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">
            Volver al Panel Principal
          </Link>
        </div>
      </div>
    );
  }

  if (!match) return (
    <div className="space-y-4">
      <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="h-4 w-4" /> Volver
      </Link>
      <LoadingSkeleton />
    </div>
  );

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* Back nav */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Partidos en Vivo
        </Link>
        <p className="text-xs text-muted-foreground/60">
          {lastUpdated
            ? secondsSince === 0
              ? "Actualizado ahora"
              : `Actualizado hace ${secondsSince}s`
            : "Cargando…"}
        </p>
      </div>

      {/* Score header */}
      <ScoreHeader match={match} prevScore={prevScoreRef.current} />

      {/* Form badges */}
      <FormRow homeForm={match.homeForm} awayForm={match.awayForm} />

      {/* Tabs */}
      <TabBar active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className="bg-card border border-border rounded-xl p-4 min-h-[300px]">
        {activeTab === "facts"  && <FactsTab  match={match} />}
        {activeTab === "stats"  && <StatsTab  match={match} />}
        {activeTab === "lineup" && <LineupTab match={match} />}
        {activeTab === "h2h"   && <H2HTab match={match} h2h={match.h2h} />}
      </div>

      {/* Footer */}
      <p className="text-[10px] text-center text-muted-foreground/40">
        Llamada API {match.monthlyCallsUsed}/100 este mes · Se actualiza cada 10 min · Página sondea cada 3s
      </p>
    </div>
  );
}
