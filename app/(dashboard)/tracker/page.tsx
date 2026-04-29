"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { formatMatchDate, formatOdds, calculateProfit } from "@/lib/utils";

type Bet = {
  id: string;
  stake: number;
  odds: number;
  result: string;
  profit: number | null;
  createdAt: string;
  pick: {
    selection: string;
    market: string;
    americanOdds: number;
    match: {
      homeTeam: { name: string };
      awayTeam: { name: string };
      matchDate: string;
      league: string;
    };
  };
};

const RESULT_COLORS: Record<string, string> = {
  PENDING: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  WON:     "bg-green-500/20 text-green-400 border-green-500/30",
  LOST:    "bg-red-500/20 text-red-400 border-red-500/30",
  VOID:    "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function TrackerPage() {
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<string | null>(null);

  const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetch(`/api/bets?userId=${userId}`)
      .then((r) => r.json())
      .then((d) => { setBets(d.bets ?? []); setLoading(false); });
  }, [userId]);

  async function settleBet(betId: string, result: "WON" | "LOST" | "VOID") {
    setSettling(betId);
    const res = await fetch("/api/bets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ betId, result }),
    });
    if (res.ok) {
      const data = await res.json();
      setBets((prev) => prev.map((b) => b.id === betId
        ? { ...b, result, profit: data.bet.profit }
        : b
      ));
      toast.success(`Bet marked as ${result}`);
    } else {
      toast.error("Failed to update bet");
    }
    setSettling(null);
  }

  const totalStaked = bets.filter(b => b.result !== "PENDING").reduce((s, b) => s + b.stake, 0);
  const totalProfit = bets.reduce((s, b) => s + (b.profit ?? 0), 0);
  const wonCount = bets.filter(b => b.result === "WON").length;
  const settledCount = bets.filter(b => b.result !== "PENDING" && b.result !== "VOID").length;

  if (!userId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Sign in to track your bets</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Bet Tracker</h1>
        <p className="text-muted-foreground mt-1">Log and manage your bets</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Bets" value={bets.length} />
        <SummaryCard label="Win Rate" value={settledCount > 0 ? `${Math.round(wonCount / settledCount * 100)}%` : "—"} />
        <SummaryCard label="Total Staked" value={`$${totalStaked.toFixed(2)}`} />
        <SummaryCard
          label="Total P&L"
          value={`${totalProfit >= 0 ? "+" : ""}$${totalProfit.toFixed(2)}`}
          highlight={totalProfit >= 0}
        />
      </div>

      {/* Bet List */}
      <Card>
        <CardHeader>
          <CardTitle>Your Bets</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Loading...</p>
          ) : bets.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No bets logged yet. Go to a pick and click &quot;Log Bet&quot;.
            </p>
          ) : (
            <div className="space-y-3">
              {bets.map((bet) => (
                <div key={bet.id} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">
                        {bet.pick.match.homeTeam.name} vs {bet.pick.match.awayTeam.name}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${RESULT_COLORS[bet.result]}`}>
                        {bet.result}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {bet.pick.selection} · {bet.pick.market} · {formatOdds(bet.pick.americanOdds)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Stake: ${bet.stake.toFixed(2)}
                      {bet.profit !== null && (
                        <span className={bet.profit >= 0 ? " text-green-400" : " text-red-400"}>
                          {" · "}P&L: {bet.profit >= 0 ? "+" : ""}${bet.profit.toFixed(2)}
                        </span>
                      )}
                    </p>
                  </div>

                  {bet.result === "PENDING" && (
                    <div className="flex gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-400 border-green-500/30 hover:bg-green-500/20"
                        disabled={settling === bet.id}
                        onClick={() => settleBet(bet.id, "WON")}
                      >
                        Won
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-400 border-red-500/30 hover:bg-red-500/20"
                        disabled={settling === bet.id}
                        onClick={() => settleBet(bet.id, "LOST")}
                      >
                        Lost
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={settling === bet.id}
                        onClick={() => settleBet(bet.id, "VOID")}
                      >
                        Void
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-1 ${highlight ? "text-green-400" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
