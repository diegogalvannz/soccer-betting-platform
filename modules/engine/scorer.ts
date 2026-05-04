/**
 * Scoring engine — converts raw match data into a confidence score and pick.
 *
 * Weights:
 *   Form        30% — recent 5-match results
 *   Head2Head   20% — historical H2H win rate
 *   Home/Away   15% — structural home advantage
 *   Odds Value  20% — market odds vs our probability
 *   Sentiment   10% — tipster consensus (placeholder until module is built)
 *   News         5% — injury/lineup impact (placeholder)
 */

import { SCORING_WEIGHTS, MIN_DECIMAL_ODDS } from "@/config/leagues";
import { MIN_VALUE_EDGE } from "./thresholds";
import { decimalToAmerican, impliedProbability } from "@/lib/utils";
import { ScoreResult } from "@/types";

type MatchStats = {
  homeTeamName: string;
  awayTeamName: string;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  homeForm: number[];  // Last 5: 3=win, 1=draw, 0=loss
  awayForm: number[];
  h2hHomeWins: number;
  h2hAwayWins: number;
  h2hDraws: number;
  h2hTotal: number;
  sentimentScore: number; // 0–1, 0.5 = neutral
  newsScore: number;      // 0–1, 0.5 = neutral
};

function formScore(results: number[]): number {
  if (!results.length) return 0.5;
  const maxPoints = results.length * 3;
  const earned = results.reduce((a, b) => a + b, 0);
  return earned / maxPoints;
}

function h2hScore(wins: number, total: number): number {
  if (total === 0) return 0.5;
  return wins / total;
}

function valueScore(
  marketDecimal: number,
  estimatedProb: number
): number {
  if (marketDecimal < MIN_DECIMAL_ODDS) return 0;
  const impliedProb = impliedProbability(marketDecimal);
  const edge = estimatedProb - impliedProb;
  if (edge < MIN_VALUE_EDGE) return 0.3;
  // Scale: edge of 0.04 → 0.5, edge of 0.12 → 1.0
  return Math.min(1, 0.5 + (edge - MIN_VALUE_EDGE) / 0.08 * 0.5);
}

export function scoreMatch(stats: MatchStats): ScoreResult {
  const homeFormScore = formScore(stats.homeForm);
  const awayFormScore = formScore(stats.awayForm);

  const homeH2H = h2hScore(stats.h2hHomeWins, stats.h2hTotal);
  const awayH2H = h2hScore(stats.h2hAwayWins, stats.h2hTotal);

  // Home/away structural advantage: home ~0.62, away ~0.38
  const homeAdvantage = 0.62;
  const awayAdvantage = 0.38;

  // Combine into probability estimates before market adjustment
  const rawHomeProb = (
    homeFormScore * SCORING_WEIGHTS.form +
    homeH2H * SCORING_WEIGHTS.headToHead +
    homeAdvantage * SCORING_WEIGHTS.homeAway +
    stats.sentimentScore * SCORING_WEIGHTS.sentiment +
    stats.newsScore * SCORING_WEIGHTS.news
  );

  const rawAwayProb = (
    awayFormScore * SCORING_WEIGHTS.form +
    awayH2H * SCORING_WEIGHTS.headToHead +
    awayAdvantage * SCORING_WEIGHTS.homeAway +
    (1 - stats.sentimentScore) * SCORING_WEIGHTS.sentiment +
    stats.newsScore * SCORING_WEIGHTS.news
  );

  const hasOdds = !!(stats.homeOdds && stats.awayOdds);

  // Odds value component — when no odds, use neutral 0.5 so form/H2H still decide
  const homeOddsValue = stats.homeOdds
    ? valueScore(stats.homeOdds, rawHomeProb)
    : 0.5; // neutral — don't penalise missing odds
  const awayOddsValue = stats.awayOdds
    ? valueScore(stats.awayOdds, rawAwayProb)
    : 0.5;

  const homeTotal = rawHomeProb + homeOddsValue * SCORING_WEIGHTS.oddsValue;
  const awayTotal = rawAwayProb + awayOddsValue * SCORING_WEIGHTS.oddsValue;

  const componentScores = {
    form: Math.round(homeFormScore * 100),
    headToHead: Math.round(homeH2H * 100),
    homeAway: Math.round(homeAdvantage * 100),
    oddsValue: Math.round(homeOddsValue * 100),
    sentiment: Math.round(stats.sentimentScore * 100),
    news: Math.round(stats.newsScore * 100),
  };

  // Decide pick direction
  // Without odds: lower thresholds so form+H2H drive the pick
  const winThreshold = hasOdds ? 0.60 : 0.50;
  const gapThreshold = hasOdds ? 0.08 : 0.05;

  let pick: "HOME" | "AWAY" | "DRAW" | "SKIP";
  let decimalOdds: number;
  let selection: string;
  let confidence: number;

  const gap = Math.abs(homeTotal - awayTotal);

  if (homeTotal > awayTotal && homeTotal > winThreshold && gap > gapThreshold) {
    pick = "HOME";
    decimalOdds = stats.homeOdds ?? 1.85;
    selection = stats.homeTeamName;
    // Scale confidence: with odds use raw total, without odds rescale [0.50–0.70] → [60–90]
    confidence = hasOdds
      ? Math.round(homeTotal * 100)
      : Math.min(90, Math.round(60 + (homeTotal - winThreshold) / (0.70 - winThreshold) * 30));
  } else if (awayTotal > homeTotal && awayTotal > winThreshold && gap > gapThreshold) {
    pick = "AWAY";
    decimalOdds = stats.awayOdds ?? 2.20;
    selection = stats.awayTeamName;
    confidence = hasOdds
      ? Math.round(awayTotal * 100)
      : Math.min(90, Math.round(60 + (awayTotal - winThreshold) / (0.70 - winThreshold) * 30));
  } else {
    pick = "SKIP";
    decimalOdds = 1.0;
    selection = "No pick";
    confidence = 0;
  }

  // Enforce odds floor (only when we have real odds)
  if (pick !== "SKIP" && hasOdds && decimalOdds < MIN_DECIMAL_ODDS) {
    pick = "SKIP";
    confidence = 0;
  }

  const reasoning = buildReasoning(pick, stats, homeFormScore, awayFormScore, homeH2H, awayH2H, confidence);

  return {
    pick,
    market: "Match Winner",
    selection,
    decimalOdds,
    americanOdds: decimalToAmerican(decimalOdds),
    confidenceScore: confidence,
    reasoning,
    sentimentSummary: null,
    componentScores,
  };
}

function buildReasoning(
  pick: string,
  stats: MatchStats,
  homeForm: number,
  awayForm: number,
  homeH2H: number,
  awayH2H: number,
  confidence: number
): string {
  if (pick === "SKIP") {
    return `No strong edge found. Home form: ${Math.round(homeForm * 100)}%, Away form: ${Math.round(awayForm * 100)}%. Insufficient data alignment to justify a pick.`;
  }

  const favTeam = pick === "HOME" ? stats.homeTeamName : stats.awayTeamName;
  const favForm = pick === "HOME" ? homeForm : awayForm;
  const favH2H = pick === "HOME" ? homeH2H : awayH2H;
  const h2hLabel = pick === "HOME" ? "home" : "away";

  return [
    `Pick: ${favTeam} to win (${pick === "HOME" ? "Home" : "Away"}).`,
    `Confidence: ${confidence}/100.`,
    `Recent form score: ${Math.round(favForm * 100)}% (last 5 matches).`,
    `H2H win rate (${h2hLabel}): ${Math.round(favH2H * 100)}% from ${stats.h2hTotal} historical meetings.`,
    stats.homeOdds
      ? `Market odds — Home: ${stats.homeOdds}, Draw: ${stats.drawOdds ?? "N/A"}, Away: ${stats.awayOdds ?? "N/A"}.`
      : "Odds data not available.",
    `Bet type: Single bet only. This is a data-driven recommendation — not a guarantee.`,
  ].join(" ");
}
