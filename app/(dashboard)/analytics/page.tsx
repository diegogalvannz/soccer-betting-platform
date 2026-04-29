"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROIChart } from "@/components/analytics/ROIChart";
import { formatROI } from "@/lib/utils";
import type { AnalyticsSummary } from "@/types";

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetch(`/api/analytics?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [userId]);

  if (!userId) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Sign in to view analytics</div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  if (!data || data.totalBets === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground mt-1">Your betting performance over time</p>
        </div>
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No settled bets yet. Log bets and mark them as won/lost to see analytics.
          </CardContent>
        </Card>
      </div>
    );
  }

  const roiColor = data.roi >= 0 ? "text-green-400" : "text-red-400";
  const profitColor = data.totalProfit >= 0 ? "text-green-400" : "text-red-400";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Your betting performance over time</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="ROI" value={formatROI(data.roi)} color={roiColor} sub="Return on investment" />
        <KPICard label="Win Rate" value={`${data.winRate}%`} color={data.winRate >= 50 ? "text-green-400" : "text-red-400"} sub={`${data.wonBets}W / ${data.lostBets}L`} />
        <KPICard label="Total P&L" value={`${data.totalProfit >= 0 ? "+" : ""}$${data.totalProfit}`} color={profitColor} sub={`$${data.totalStaked} staked`} />
        <KPICard label="Bankroll" value={`$${data.bankrollCurrent?.toFixed(2) ?? "—"}`} sub={`Started at $${data.bankrollStart}`} />
      </div>

      {/* Bet counts */}
      <div className="grid grid-cols-3 gap-4">
        <StatBlock label="Total Bets" value={data.totalBets} />
        <StatBlock label="Won" value={data.wonBets} color="text-green-400" />
        <StatBlock label="Pending" value={data.pendingBets} color="text-blue-400" />
      </div>

      {/* Monthly Chart */}
      {data.monthlyBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Monthly P&L</CardTitle>
          </CardHeader>
          <CardContent>
            <ROIChart data={data.monthlyBreakdown} />
          </CardContent>
        </Card>
      )}

      {/* Monthly Table */}
      {data.monthlyBreakdown.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Monthly Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Month</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Bets</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">W/L</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">P&L</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {data.monthlyBreakdown.map((row) => (
                    <tr key={row.month} className="border-b border-border/50">
                      <td className="py-2">{row.month}</td>
                      <td className="text-right py-2">{row.bets}</td>
                      <td className="text-right py-2">{row.won}/{row.lost}</td>
                      <td className={`text-right py-2 font-mono ${row.profit >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {row.profit >= 0 ? "+" : ""}${row.profit}
                      </td>
                      <td className={`text-right py-2 ${row.roi >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {formatROI(row.roi)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KPICard({ label, value, color = "", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function StatBlock({ label, value, color = "" }: { label: string; value: number; color?: string }) {
  return (
    <Card>
      <CardContent className="pt-6 text-center">
        <p className={`text-3xl font-bold ${color}`}>{value}</p>
        <p className="text-sm text-muted-foreground mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
