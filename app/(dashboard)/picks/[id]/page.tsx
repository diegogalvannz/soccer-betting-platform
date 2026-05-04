import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMatchDate, formatOdds } from "@/lib/utils";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Brain, AlertTriangle } from "lucide-react";
import { BetButton } from "@/components/picks/BetButton";

export const revalidate = 60;

const STATUS_LABELS: Record<string, string> = {
  PENDING: "PENDIENTE",
  WON:     "GANADO",
  LOST:    "PERDIDO",
  VOID:    "NULO",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  WON:     "bg-primary/20 text-primary border-primary/30",
  LOST:    "bg-red-500/20 text-red-400 border-red-500/30",
  VOID:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

type WrongFactors = { form: boolean; h2h: boolean; oddsValue: boolean; homeAdvantage: boolean };

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
      learningLog: true,
    },
  });

  if (!pick) notFound();

  const confColor =
    pick.confidenceScore >= 75 ? "text-primary" :
    pick.confidenceScore >= 62 ? "text-yellow-400" : "text-orange-400";

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Link href="/picks" className="text-muted-foreground hover:text-foreground p-2 rounded-xl hover:bg-accent transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-bold">Detalle del Pronóstico</h1>
      </div>

      {/* Match Header */}
      <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-2">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{pick.match.league}</p>
        <h2 className="text-xl font-bold">
          {pick.match.homeTeam.shortName ?? pick.match.homeTeam.name}{" "}
          <span className="text-muted-foreground font-normal">vs</span>{" "}
          {pick.match.awayTeam.shortName ?? pick.match.awayTeam.name}
        </h2>
        <p className="text-sm text-muted-foreground">{formatMatchDate(pick.match.matchDate)}</p>
        {pick.match.status === "FINISHED" && (
          <p className="text-2xl font-black tabular-nums">
            {pick.match.homeScore} — {pick.match.awayScore}
          </p>
        )}
      </div>

      {/* Pick Summary */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h3 className="font-semibold flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-primary" />
          Recomendación
        </h3>

        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Selección</p>
            <p className="text-lg font-bold leading-tight">{pick.selection}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{pick.market}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground mb-0.5">Cuota</p>
            <p className="text-2xl font-mono font-black">{formatOdds(pick.americanOdds)}</p>
            <p className="text-[10px] text-muted-foreground">{pick.odds.toFixed(2)} decimal</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Confianza</p>
            <p className={`text-3xl font-black tabular-nums ${confColor}`}>{pick.confidenceScore}<span className="text-lg font-normal text-muted-foreground">/100</span></p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Estado</p>
            <span className={`text-xs px-3 py-1.5 rounded-full border font-bold ${STATUS_COLORS[pick.status] ?? STATUS_COLORS.VOID}`}>
              {STATUS_LABELS[pick.status] ?? pick.status}
            </span>
          </div>
        </div>

        {/* Confidence bar */}
        <div>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>Nivel de confianza</span>
            <span>{pick.confidenceScore}/100</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                pick.confidenceScore >= 75 ? "bg-primary" :
                pick.confidenceScore >= 62 ? "bg-yellow-500" : "bg-orange-500"
              }`}
              style={{ width: `${pick.confidenceScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* Post-mortem (LOST picks only) */}
      {pick.status === "LOST" && pick.learningLog && (
        <PostMortemCard log={pick.learningLog as {
          whatHappened: string;
          wrongFactors: WrongFactors;
          adjustments: { formDelta: number; h2hDelta: number; oddsDelta: number; homeDelta: number };
        }} />
      )}

      {/* LOST but no post-mortem yet */}
      {pick.status === "LOST" && !pick.learningLog && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 flex items-center gap-3">
          <Brain className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-xs text-muted-foreground">Análisis post-partido en proceso — disponible en breve.</p>
        </div>
      )}

      {/* Reasoning */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-semibold text-sm mb-3">Análisis y Razonamiento</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{pick.reasoning}</p>
        {pick.sentimentSummary && (
          <div className="mt-4 p-3 rounded-xl bg-accent">
            <p className="text-[10px] font-medium text-muted-foreground mb-1 uppercase tracking-wide">Sentimiento</p>
            <p className="text-sm">{pick.sentimentSummary}</p>
          </div>
        )}
      </div>

      {/* Odds Breakdown */}
      {pick.match.homeOdds && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <h3 className="font-semibold text-sm mb-3">Cuotas del Mercado</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <OddsCell label={pick.match.homeTeam.shortName ?? pick.match.homeTeam.name} value={pick.match.homeOdds} highlight={pick.selection.toLowerCase().includes(pick.match.homeTeam.name.toLowerCase().split(" ")[0])} />
            <OddsCell label="Empate" value={pick.match.drawOdds} highlight={pick.selection.toLowerCase().includes("empate") || pick.selection === "Draw"} />
            <OddsCell label={pick.match.awayTeam.shortName ?? pick.match.awayTeam.name} value={pick.match.awayOdds} highlight={pick.selection.toLowerCase().includes(pick.match.awayTeam.name.toLowerCase().split(" ")[0])} />
          </div>
        </div>
      )}

      {/* Log Bet Button */}
      {pick.status === "PENDING" && (
        <BetButton pickId={pick.id} odds={pick.odds} americanOdds={pick.americanOdds} />
      )}

      <p className="text-[11px] text-muted-foreground text-center pb-4">
        Solo apuestas simples. Análisis de datos — no es asesoramiento financiero. Nunca apuestes más de lo que puedes perder.
      </p>
    </div>
  );
}

function PostMortemCard({ log }: {
  log: {
    whatHappened: string;
    wrongFactors: WrongFactors;
    adjustments: { formDelta: number; h2hDelta: number; oddsDelta: number; homeDelta: number };
  };
}) {
  const factors = [
    { key: "form",          label: "Forma reciente",       wrong: log.wrongFactors.form },
    { key: "h2h",           label: "Historial H2H",        wrong: log.wrongFactors.h2h },
    { key: "oddsValue",     label: "Valor de cuotas",      wrong: log.wrongFactors.oddsValue },
    { key: "homeAdvantage", label: "Ventaja de local",     wrong: log.wrongFactors.homeAdvantage },
  ];
  const wrongCount = factors.filter((f) => f.wrong).length;

  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-red-400" />
        <h3 className="font-bold text-sm text-red-400">Análisis Post-Partido</h3>
        <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 rounded-full px-2 py-0.5">
          {wrongCount} factor{wrongCount !== 1 ? "es" : ""} fallido{wrongCount !== 1 ? "s" : ""}
        </span>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{log.whatHappened}</p>

      <div className="grid grid-cols-2 gap-2">
        {factors.map((f) => (
          <div key={f.key} className={`flex items-center gap-2 p-2.5 rounded-xl border ${
            f.wrong ? "border-red-500/30 bg-red-500/10" : "border-border bg-card"
          }`}>
            <span className={`text-base ${f.wrong ? "text-red-400" : "text-primary"}`}>
              {f.wrong ? "✗" : "✓"}
            </span>
            <span className={`text-xs font-medium ${f.wrong ? "text-red-300" : "text-muted-foreground"}`}>
              {f.label}
            </span>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-red-500/20">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-2">Ajustes aplicados al motor</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Forma", delta: log.adjustments.formDelta },
            { label: "H2H",   delta: log.adjustments.h2hDelta },
            { label: "Cuotas",delta: log.adjustments.oddsDelta },
            { label: "Local", delta: log.adjustments.homeDelta },
          ].filter((a) => a.delta !== 0).map((a) => (
            <span key={a.label} className={`text-[10px] px-2 py-1 rounded-lg border font-mono ${
              a.delta > 0 ? "bg-primary/10 text-primary border-primary/30" : "bg-red-500/10 text-red-400 border-red-500/30"
            }`}>
              {a.label} {a.delta > 0 ? "+" : ""}{(a.delta * 100).toFixed(0)}%
            </span>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-2 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          El sistema ha ajustado los pesos para estos equipos en pronósticos futuros.
        </p>
      </div>
    </div>
  );
}

function OddsCell({ label, value, highlight }: { label: string; value: number | null; highlight: boolean }) {
  return (
    <div className={`p-3 rounded-xl text-center ${highlight ? "bg-primary/20 border border-primary/30" : "bg-accent"}`}>
      <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      <p className="text-base font-mono font-bold mt-1">{value ? value.toFixed(2) : "—"}</p>
    </div>
  );
}
