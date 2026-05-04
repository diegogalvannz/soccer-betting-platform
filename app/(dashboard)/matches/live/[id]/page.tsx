"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { LiveMatchDetail, TeamForm, H2HMatch, MatchStats, Lineup, Player } from "@/app/api/live-match/[id]/route";
import type { NewsItem } from "@/app/api/news/route";

const POLL_MS = 3_000;

// ─── Utils ────────────────────────────────────────────────────────────────────

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

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
  return <span className={cn("text-xs font-bold px-2 py-0.5 rounded border", cls)}>{result}</span>;
}

// ─── Score header ─────────────────────────────────────────────────────────────

function ScoreHeader({ match, prevScore }: { match: LiveMatchDetail; prevScore: { home: number; away: number } | null }) {
  const homeChanged = prevScore !== null && match.homeScore !== prevScore.home;
  const awayChanged = prevScore !== null && match.awayScore !== prevScore.away;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border">
        <span className="text-xs text-muted-foreground font-medium tracking-wide uppercase">{match.competition}</span>
        <div className="flex items-center gap-2">
          <PulsingDot />
          <span className="text-xs font-bold text-red-500 uppercase tracking-wider">En Vivo</span>
        </div>
      </div>
      <div className="grid grid-cols-3 items-center gap-4 px-6 py-8">
        <div className="text-right space-y-1">
          <p className="text-xl font-bold leading-tight">{match.homeTeam}</p>
          {match.homeRedCards > 0 && <div className="flex justify-end"><RedCard count={match.homeRedCards} /></div>}
        </div>
        <div className="text-center">
          <div className="flex items-center justify-center gap-3">
            <span className={cn("text-5xl font-black tabular-nums transition-all duration-300", homeChanged && "text-green-400 scale-110")}>{match.homeScore}</span>
            <span className="text-3xl font-light text-muted-foreground">—</span>
            <span className={cn("text-5xl font-black tabular-nums transition-all duration-300", awayChanged && "text-green-400 scale-110")}>{match.awayScore}</span>
          </div>
          <div className="mt-3 flex flex-col items-center gap-1">
            <span className="text-2xl font-bold tabular-nums text-primary">{match.minute}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-widest">{match.period}</span>
          </div>
        </div>
        <div className="text-left space-y-1">
          <p className="text-xl font-bold leading-tight">{match.awayTeam}</p>
          {match.awayRedCards > 0 && <div className="flex justify-start"><RedCard count={match.awayRedCards} /></div>}
        </div>
      </div>
    </div>
  );
}

// ─── Form row ─────────────────────────────────────────────────────────────────

function FormRow({ homeForm, awayForm }: { homeForm: TeamForm[]; awayForm: TeamForm[] }) {
  if (homeForm.length === 0 && awayForm.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium">Forma Local</p>
          <div className="flex gap-1">
            {homeForm.length > 0 ? homeForm.map((f, i) => <FormBadge key={i} result={f.result} />) : <span className="text-xs text-muted-foreground">Sin datos</span>}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium">Forma Visitante</p>
          <div className="flex gap-1">
            {awayForm.length > 0 ? awayForm.map((f, i) => <FormBadge key={i} result={f.result} />) : <span className="text-xs text-muted-foreground">Sin datos</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "facts" | "stats" | "news" | "lineup" | "h2h";

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string }[] = [
    { id: "facts",  label: "Eventos" },
    { id: "stats",  label: "Stats" },
    { id: "news",   label: "Noticias" },
    { id: "lineup", label: "Alineación" },
    { id: "h2h",    label: "H2H" },
  ];
  return (
    <div className="flex border border-border rounded-xl overflow-hidden">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "flex-1 py-2 text-xs font-medium transition-colors",
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

// ─── FIX 2: Stats Tab — all stats, no placeholders ───────────────────────────

function StatBar({ label, homeVal, awayVal }: { label: string; homeVal: number | null; away?: never; homeDisplay?: string; awayDisplay?: string } & { homeVal: number | null; awayVal: number | null }) {
  const h = homeVal ?? 0;
  const a = awayVal ?? 0;
  const total = h + a;
  const homePercent = total > 0 ? Math.round((h / total) * 100) : 50;
  const noData = homeVal === null && awayVal === null;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-medium">
        <span className={noData ? "text-muted-foreground/40" : ""}>{noData ? "—" : h}</span>
        <span className="text-muted-foreground text-[10px] uppercase tracking-wide">{label}</span>
        <span className={noData ? "text-muted-foreground/40" : ""}>{noData ? "—" : a}</span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-muted/30">
        {noData ? (
          <div className="w-full bg-muted/20" />
        ) : (
          <>
            <div className="bg-blue-500 transition-all duration-500" style={{ width: `${homePercent}%` }} />
            <div className="bg-orange-500 flex-1 transition-all duration-500" />
          </>
        )}
      </div>
      {noData && <p className="text-[9px] text-center text-muted-foreground/40">sin datos</p>}
    </div>
  );
}

function StatsTab({ match }: { match: LiveMatchDetail }) {
  const s = match.stats;
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

      <div className="space-y-4">
        <StatBar label="Goles"             homeVal={match.homeScore}          awayVal={match.awayScore} />
        <StatBar label="Posesión (%)"      homeVal={s.possession.home}        awayVal={s.possession.away} />
        <StatBar label="Tiros Totales"     homeVal={s.shots.home}             awayVal={s.shots.away} />
        <StatBar label="Tiros a Portería"  homeVal={s.shotsOnTarget.home}     awayVal={s.shotsOnTarget.away} />
        <StatBar label="Córneres"          homeVal={s.corners.home}           awayVal={s.corners.away} />
        <StatBar label="Faltas"            homeVal={s.fouls.home}             awayVal={s.fouls.away} />
        <StatBar label="Tarj. Amarillas"   homeVal={s.yellowCards.home}       awayVal={s.yellowCards.away} />
        <StatBar label="Tarj. Rojas"       homeVal={s.redCards.home ?? match.homeRedCards} awayVal={s.redCards.away ?? match.awayRedCards} />
        <StatBar label="Fueras de Lugar"   homeVal={s.offsides.home}          awayVal={s.offsides.away} />
        <StatBar label="Pases"             homeVal={s.passes.home}            awayVal={s.passes.away} />
        <StatBar label="Ataques"           homeVal={s.attacks.home}           awayVal={s.attacks.away} />
      </div>

      <p className="text-[10px] text-center text-muted-foreground/40 pt-2">
        Estadísticas en tiempo real · sin datos = no disponible en el plan actual
      </p>
    </div>
  );
}

// ─── FIX 3: News Tab ──────────────────────────────────────────────────────────

function NewsTab({ match }: { match: LiveMatchDetail }) {
  const [news, setNews] = useState<NewsItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({
      home: match.homeTeam,
      away: match.awayTeam,
      competition: match.competition,
    });
    fetch(`/api/news?${params}`)
      .then(r => r.json())
      .then((d: { items: NewsItem[] }) => { setNews(d.items); setLoading(false); })
      .catch(() => { setNews([]); setLoading(false); });
  }, [match.homeTeam, match.awayTeam, match.competition]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-sm">Buscando noticias…</span>
        </div>
      </div>
    );
  }

  if (!news || news.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-sm">No hay noticias recientes para este partido</p>
        <p className="text-xs text-muted-foreground/50 mt-1">{match.homeTeam} vs {match.awayTeam}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
        Noticias recientes — {match.homeTeam} vs {match.awayTeam}
      </p>
      {news.map((item, i) => (
        <a
          key={i}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
        >
          <p className="text-sm font-medium leading-snug line-clamp-2">{item.title}</p>
          <div className="flex items-center gap-2 mt-1.5">
            {item.source && (
              <span className="text-[10px] text-primary font-medium">{item.source}</span>
            )}
            {item.publishedAt && (
              <span className="text-[10px] text-muted-foreground/60">
                {item.publishedAt.replace(/\s*\+\d{4}$/, "").trim()}
              </span>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── FIX 4: Lineup Tab — real data ───────────────────────────────────────────

// Position ordering for pitch layout
const POS_ORDER: Record<string, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function normalizePosition(pos: string | null): "GK" | "DEF" | "MID" | "FWD" {
  if (!pos) return "MID";
  const p = pos.toUpperCase();
  if (p.includes("GK") || p.includes("GOAL") || p === "G") return "GK";
  if (p.includes("DEF") || p.includes("BACK") || p === "D") return "DEF";
  if (p.includes("MID") || p === "M") return "MID";
  return "FWD";
}

function groupByPosition(players: Player[]): Record<string, Player[]> {
  const groups: Record<string, Player[]> = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of players) {
    const pos = normalizePosition(p.position);
    groups[pos].push(p);
  }
  return groups;
}

function PitchHalf({ team, lineup, color, isHome }: { team: string; lineup: Lineup; color: string; isHome: boolean }) {
  const groups = groupByPosition(lineup.startingXI);
  const rows = isHome
    ? [groups.GK, groups.DEF, groups.MID, groups.FWD]
    : [groups.FWD, groups.MID, groups.DEF, groups.GK];

  return (
    <div className="space-y-2">
      {/* Formation badge */}
      <div className="flex items-center justify-between px-2">
        <p className="text-xs font-semibold text-foreground">{team}</p>
        {lineup.formation && (
          <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-mono">
            {lineup.formation}
          </span>
        )}
      </div>
      {/* Player rows */}
      <div className="space-y-1">
        {rows.map((row, ri) =>
          row.length > 0 ? (
            <div key={ri} className="flex justify-around">
              {row.map((p, pi) => (
                <div key={pi} className="flex flex-col items-center gap-0.5 w-12">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2"
                    style={{ backgroundColor: color + "33", borderColor: color }}
                  >
                    {p.number ?? (pi + 1)}
                  </div>
                  <span className="text-[9px] text-center leading-tight line-clamp-2 text-muted-foreground">
                    {p.name.split(" ").at(-1)}
                  </span>
                </div>
              ))}
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}

function LineupTab({ match }: { match: LiveMatchDetail }) {
  const hasHome = match.homeLineup.startingXI.length > 0;
  const hasAway = match.awayLineup.startingXI.length > 0;

  if (!hasHome && !hasAway) {
    return (
      <div className="space-y-4">
        {/* Visual pitch placeholder while waiting */}
        <div className="relative bg-green-950/40 border border-green-900/40 rounded-xl overflow-hidden" style={{ aspectRatio: "2/3", minHeight: 280 }}>
          <div className="absolute inset-[8%] border border-green-800/40 rounded" />
          <div className="absolute left-[8%] right-[8%] top-1/2 -translate-y-px h-px bg-green-800/40" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full border border-green-800/40" />
          <div className="absolute top-[8%] left-[25%] right-[25%] h-[15%] border border-green-800/40" />
          <div className="absolute bottom-[8%] left-[25%] right-[25%] h-[15%] border border-green-800/40" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center bg-black/60 rounded-xl px-6 py-4">
              <p className="text-sm font-semibold">Alineaciones disponibles 1 hora antes del partido</p>
              <p className="text-xs text-muted-foreground mt-1">{match.homeTeam} vs {match.awayTeam}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const homeSubs = match.homeLineup.substitutes;
  const awaySubs = match.awayLineup.substitutes;

  return (
    <div className="space-y-4">
      {/* Pitch with both lineups */}
      <div className="relative bg-green-950/40 border border-green-900/40 rounded-xl overflow-hidden p-3">
        {/* Pitch markings (decorative) */}
        <div className="absolute inset-[4%] border border-green-800/20 rounded pointer-events-none" />
        <div className="absolute left-[4%] right-[4%] top-1/2 -translate-y-px h-px bg-green-800/30 pointer-events-none" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full border border-green-800/20 pointer-events-none" />

        <div className="space-y-6">
          {/* Home team (top) */}
          <PitchHalf
            team={match.homeTeam}
            lineup={match.homeLineup}
            color="#3b82f6"
            isHome={true}
          />

          {/* Divider */}
          <div className="border-t border-green-800/30" />

          {/* Away team (bottom) */}
          <PitchHalf
            team={match.awayTeam}
            lineup={match.awayLineup}
            color="#f97316"
            isHome={false}
          />
        </div>
      </div>

      {/* Substitutes */}
      {(homeSubs.length > 0 || awaySubs.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {homeSubs.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">Suplentes — {match.homeTeam.split(" ")[0]}</p>
              <div className="space-y-1">
                {homeSubs.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-5 text-center text-muted-foreground font-mono">{p.number ?? "—"}</span>
                    <span className="truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {awaySubs.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 font-medium">Suplentes — {match.awayTeam.split(" ")[0]}</p>
              <div className="space-y-1">
                {awaySubs.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="w-5 text-center text-muted-foreground font-mono">{p.number ?? "—"}</span>
                    <span className="truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── FIX 5: H2H Tab — real data ──────────────────────────────────────────────

function H2HTab({ match, h2h }: { match: LiveMatchDetail; h2h: H2HMatch[] }) {
  if (h2h.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <p className="text-muted-foreground text-sm">Sin historial disponible entre estos equipos</p>
        <p className="text-xs text-muted-foreground/60">Los datos históricos aparecerán aquí conforme se registren partidos.</p>
      </div>
    );
  }

  const homeFirst = match.homeTeam.split(" ")[0];
  const awayFirst = match.awayTeam.split(" ")[0];

  const homeWins = h2h.filter((m) =>
    (m.homeTeam.includes(homeFirst) && m.homeScore > m.awayScore) ||
    (m.awayTeam.includes(homeFirst) && m.awayScore > m.homeScore)
  ).length;
  const awayWins = h2h.filter((m) =>
    (m.homeTeam.includes(awayFirst) && m.homeScore > m.awayScore) ||
    (m.awayTeam.includes(awayFirst) && m.awayScore > m.homeScore)
  ).length;
  const draws = h2h.length - homeWins - awayWins;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 text-center bg-card border border-border rounded-xl divide-x divide-border overflow-hidden">
        <div className="py-3">
          <p className="text-2xl font-black text-blue-400">{homeWins}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate px-2">{homeFirst} Victorias</p>
        </div>
        <div className="py-3">
          <p className="text-2xl font-black text-muted-foreground">{draws}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Empates</p>
        </div>
        <div className="py-3">
          <p className="text-2xl font-black text-orange-400">{awayWins}</p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate px-2">{awayFirst} Victorias</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground font-medium">Últimos {h2h.length} enfrentamientos</p>

      <div className="space-y-2">
        {h2h.map((m, i) => {
          const homeWon = m.homeScore > m.awayScore;
          const awayWon = m.awayScore > m.homeScore;
          return (
            <div key={i} className="px-3 py-2.5 bg-card border border-border rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground shrink-0">{m.date}</span>
                  <span className="text-xs text-muted-foreground/60 truncate hidden sm:block">{m.competition}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-sm font-medium truncate max-w-[70px] text-right", homeWon && "text-green-400")}>{m.homeTeam}</span>
                  <span className="text-base font-black tabular-nums">{m.homeScore} — {m.awayScore}</span>
                  <span className={cn("text-sm font-medium truncate max-w-[70px]", awayWon && "text-green-400")}>{m.awayTeam}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Facts Tab ────────────────────────────────────────────────────────────────

function FactsTab({ match }: { match: LiveMatchDetail }) {
  const events: { minute: string; label: string }[] = [];
  if (match.homeRedCards > 0) events.push({ minute: "—", label: `🟥 ${match.homeTeam} — Tarjeta Roja` });
  if (match.awayRedCards > 0) events.push({ minute: "—", label: `🟥 ${match.awayTeam} — Tarjeta Roja` });

  return (
    <div className="space-y-3">
      {events.length > 0 ? (
        <div className="space-y-2">
          {events.map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-card border border-border rounded-lg">
              <span className="w-8 text-xs font-mono text-muted-foreground text-center">{e.minute}</span>
              <span className="text-sm">{e.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">Sin eventos registrados aún</p>
          <p className="text-xs text-muted-foreground/50 mt-1">Los eventos detallados requieren plan premium de datos</p>
        </div>
      )}
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
        const err = await res.json().catch(() => ({ error: "Partido no encontrado" }));
        setError((err as { error: string }).error ?? "Partido no encontrado");
        return;
      }
      const data: LiveMatchDetail = await res.json();
      setMatch((prev) => {
        if (prev) prevScoreRef.current = { home: prev.homeScore, away: prev.awayScore };
        return data;
      });
      setLastUpdated(new Date());
      setSecondsSince(0);
      setError(null);
    } catch {
      setError("Error de conexión. Reintentando…");
    }
  }, [id]);

  useEffect(() => {
    fetchMatch();
    const interval = setInterval(fetchMatch, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchMatch]);

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
          <p className="text-xs text-muted-foreground/60 mt-2">Es posible que el partido haya terminado o no esté en vivo.</p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-primary hover:underline">Volver al Panel Principal</Link>
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
      {/* Nav */}
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Partidos en Vivo
        </Link>
        <p className="text-xs text-muted-foreground/60">
          {lastUpdated
            ? secondsSince === 0 ? "Actualizado ahora" : `Actualizado hace ${secondsSince}s`
            : "Cargando…"}
        </p>
      </div>

      <ScoreHeader match={match} prevScore={prevScoreRef.current} />
      <FormRow homeForm={match.homeForm} awayForm={match.awayForm} />
      <TabBar active={activeTab} onChange={setActiveTab} />

      <div className="bg-card border border-border rounded-xl p-4 min-h-[300px]">
        {activeTab === "facts"  && <FactsTab  match={match} />}
        {activeTab === "stats"  && <StatsTab  match={match} />}
        {activeTab === "news"   && <NewsTab   match={match} />}
        {activeTab === "lineup" && <LineupTab match={match} />}
        {activeTab === "h2h"    && <H2HTab   match={match} h2h={match.h2h} />}
      </div>

      <p className="text-[10px] text-center text-muted-foreground/40">
        Llamada API {match.monthlyCallsUsed}/100 este mes · Se actualiza cada 10 min · Página sondea cada 3s
      </p>
    </div>
  );
}
