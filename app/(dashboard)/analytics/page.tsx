"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROIChart } from "@/components/analytics/ROIChart";

type AnalyticsData = {
  totalPicks: number;
  pendingPicks: number;
  wonPicks: number;
  lostPicks: number;
  voidPicks: number;
  pickWinRate: number;
  totalBets: number;
  wonBets: number;
  lostBets: number;
  pendingBets: number;
  totalStaked: number;
  totalProfit: number;
  roi: number;
  betWinRate: number;
  monthlyBreakdown: Array<{
    month: string;
    bets: number;
    won: number;
    lost: number;
    profit: number;
    roi: number;
  }>;
  performanceCurve: Array<{
    date: string;
    cumulative: number;
    result: string;
  }>;
  byLeague: Array<{ league: string; total: number; won: number; lost: number; winRate: number }>;
  byMarket: Array<{ market: string; total: number; won: number; lost: number; winRate: number }>;
};

function fmtROI(roi: number) {
  return `${roi >= 0 ? "+" : ""}${roi.toFixed(1)}%`;
}

function fmtProfit(p: number) {
  return `${p >= 0 ? "+" : ""}$${Math.abs(p).toFixed(2)}`;
}

function KPICard({
  label, value, sub, positive, negative,
}: {
  label: string;
  value: string;
  sub?: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${positive ? "text-green-400" : negative ? "text-red-400" : ""}`}>
          {value}
        </p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

// Simple bar for league/market win rates
function WinRateBar({ won, total }: { won: number; total: number }) {
  const pct = total > 0 ? Math.round((won / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${pct >= 55 ? "bg-green-500" : pct >= 45 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs font-mono w-10 text-right ${pct >= 55 ? "text-green-400" : pct >= 45 ? "text-yellow-400" : "text-red-400"}`}>
        {pct}%
      </span>
    </div>
  );
}

// Simple cumulative performance chart using SVG sparkline
function PerformanceSpark({ curve }: { curve: AnalyticsData["performanceCurve"] }) {
  if (curve.length < 2) return null;
  const vals = curve.map((c) => c.cumulative);
  const min = Math.min(...vals, 0);
  const max = Math.max(...vals, 1);
  const range = max - min || 1;
  const W = 600, H = 80;
  const pts = curve.map((c, i) => {
    const x = (i / (curve.length - 1)) * W;
    const y = H - ((c.cumulative - min) / range) * H;
    return `${x},${y}`;
  });
  const isPositive = vals[vals.length - 1] >= 0;

  return (
    <div className="w-full overflow-hidden rounded-lg">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 80 }}>
        <defs>
          <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity="0.3" />
            <stop offset="100%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={isPositive ? "#22c55e" : "#ef4444"}
          strokeWidth="2"
        />
        <polygon
          points={`0,${H} ${pts.join(" ")} ${W},${H}`}
          fill="url(#curveGrad)"
        />
      </svg>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-center py-16 text-muted-foreground">Error al cargar las analíticas</div>;
  }

  const hasData = data.totalPicks > 0;
  const profitPositive = data.totalProfit >= 0;
  const roiPositive    = data.roi >= 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Analíticas</h1>
        <p className="text-muted-foreground mt-1">Rendimiento global de todos los pronósticos y apuestas</p>
      </div>

      {/* Pick KPIs */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Rendimiento del Motor de Pronósticos</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Total Pronósticos" value={String(data.totalPicks)} sub={`${data.pendingPicks} pendientes`} />
          <KPICard
            label="% de Aciertos"
            value={data.wonPicks + data.lostPicks > 0 ? `${data.pickWinRate}%` : "—"}
            sub={`${data.wonPicks}G · ${data.lostPicks}P · ${data.voidPicks} nulos`}
            positive={data.pickWinRate >= 55}
            negative={data.pickWinRate > 0 && data.pickWinRate < 45}
          />
          <KPICard label="Ganados" value={String(data.wonPicks)} positive={data.wonPicks > 0} />
          <KPICard label="Perdidos" value={String(data.lostPicks)} negative={data.lostPicks > 0} />
        </div>
      </section>

      {/* Bet KPIs */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">Rendimiento de Apuestas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard
            label="Ganancia Total"
            value={data.totalBets > 0 ? (profitPositive ? `+$${data.totalProfit.toFixed(2)}` : `-$${Math.abs(data.totalProfit).toFixed(2)}`) : "—"}
            sub={data.totalBets > 0 ? `$${data.totalStaked.toFixed(2)} apostado` : "Sin apuestas aún"}
            positive={profitPositive && data.totalBets > 0}
            negative={!profitPositive && data.totalBets > 0}
          />
          <KPICard
            label="ROI"
            value={data.totalBets > 0 ? fmtROI(data.roi) : "—"}
            sub="Retorno sobre inversión"
            positive={roiPositive && data.totalBets > 0}
            negative={!roiPositive && data.totalBets > 0}
          />
          <KPICard
            label="% de Aciertos en Apuestas"
            value={data.wonBets + data.lostBets > 0 ? `${data.betWinRate}%` : "—"}
            sub={`${data.wonBets}G · ${data.lostBets}P`}
            positive={data.betWinRate >= 50}
          />
          <KPICard label="Total de Apuestas" value={String(data.totalBets)} sub={`${data.pendingBets} pendientes`} />
        </div>
      </section>

      {/* Performance curve */}
      {data.performanceCurve.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Curva de Rendimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">Unidades acumuladas ganadas/perdidas a lo largo del tiempo (+1 por acierto, -1 por fallo)</p>
            <PerformanceSpark curve={data.performanceCurve} />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>Inicio</span>
              <span className={data.performanceCurve.at(-1)!.cumulative >= 0 ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                {data.performanceCurve.at(-1)!.cumulative >= 0 ? "+" : ""}{data.performanceCurve.at(-1)!.cumulative} unidades
              </span>
              <span>Ahora</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly chart */}
      {data.monthlyBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Ganancia Mensual</CardTitle></CardHeader>
          <CardContent>
            <ROIChart data={data.monthlyBreakdown} />
          </CardContent>
        </Card>
      )}

      {/* By league + by market side by side */}
      {hasData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* By league */}
          {data.byLeague.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Rendimiento por Liga</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.byLeague.map((l) => (
                  <div key={l.league}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium truncate">{l.league}</span>
                      <span className="text-xs text-muted-foreground ml-2 shrink-0">{l.won}/{l.total}</span>
                    </div>
                    <WinRateBar won={l.won} total={l.total} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* By market */}
          {data.byMarket.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Rendimiento por Mercado</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.byMarket.map((m) => (
                  <div key={m.market}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium">{m.market}</span>
                      <span className="text-xs text-muted-foreground ml-2">{m.won}/{m.total} · {m.winRate}%</span>
                    </div>
                    <WinRateBar won={m.won} total={m.total} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Monthly breakdown table */}
      {data.monthlyBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Resumen Mensual</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Mes", "Apuestas", "G/P", "Ganancia", "ROI"].map((h) => (
                      <th key={h} className={`py-2 font-medium text-muted-foreground ${h === "Mes" ? "text-left" : "text-right"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.monthlyBreakdown.map((row) => (
                    <tr key={row.month} className="border-b border-border/50">
                      <td className="py-2">{row.month}</td>
                      <td className="text-right py-2">{row.bets}</td>
                      <td className="text-right py-2">{row.won}/{row.lost}</td>
                      <td className={`text-right py-2 font-mono ${row.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {fmtProfit(row.profit)}
                      </td>
                      <td className={`text-right py-2 ${row.roi >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {fmtROI(row.roi)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {!hasData && (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p>Sin pronósticos generados aún.</p>
            <p className="text-xs mt-2">Las analíticas se poblarán conforme se generen pronósticos y se liquiden resultados.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
