"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { formatOdds, calculateProfit } from "@/lib/utils";

type Props = { pickId: string; odds: number; americanOdds: number };

export function BetButton({ pickId, odds, americanOdds }: Props) {
  const [stake, setStake] = useState("10");
  const [loading, setLoading] = useState(false);
  const [logged, setLogged] = useState(false);

  const potentialProfit = calculateProfit(parseFloat(stake) || 0, odds);

  async function handleLogBet() {
    const stakeVal = parseFloat(stake);
    if (!stakeVal || stakeVal <= 0) {
      toast.error("Enter a valid stake amount");
      return;
    }

    setLoading(true);
    try {
      // Get userId from session (simplified — use localStorage as fallback)
      const userId = localStorage.getItem("userId");
      if (!userId) {
        toast.error("Please sign in to log bets");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/bets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickId, userId, stake: stakeVal, odds }),
      });

      if (!res.ok) throw new Error("Failed to log bet");
      toast.success(`Bet logged: $${stakeVal} to win $${potentialProfit.toFixed(2)}`);
      setLogged(true);
    } catch {
      toast.error("Failed to log bet");
    }
    setLoading(false);
  }

  if (logged) {
    return (
      <Card className="border-green-500/30">
        <CardContent className="py-4 text-center text-green-400 font-medium">
          ✓ Bet logged successfully
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Log This Bet</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="stake">Stake Amount ($)</Label>
          <Input
            id="stake"
            type="number"
            min="1"
            step="0.01"
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="10.00"
          />
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Odds: {formatOdds(americanOdds)}</span>
          <span>Potential profit: <span className="text-green-400 font-medium">${potentialProfit.toFixed(2)}</span></span>
        </div>
        <Button onClick={handleLogBet} disabled={loading} className="w-full">
          {loading ? "Logging..." : "Log Bet"}
        </Button>
      </CardContent>
    </Card>
  );
}
