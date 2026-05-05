/**
 * Multi-market scoring engine.
 *
 * scoreAllMarkets() analyzes every applicable market for a match and returns
 * an array of ScoreResult — one per market that has a qualifying edge.
 * The picker filters this array by confidence threshold.
 *
 * Markets analyzed:
 *   1. 1X2 — Ganador del Partido
 *   2. Doble Oportunidad (Double Chance)
 *   3. Ambos Equipos Marcan — BTTS Sí/No
 *   4. Goles Over/Under 0.5 / 1.5 / 2.5 / 3.5
 *   5. Tarjetas Totales Over/Under 2.5 / 3.5 / 4.5 (si árbitro disponible)
 *
 * Weights:
 *   Form        30% | H2H  20% | Home/Away 15% | Odds Value 20%
 *   Sentiment   10% | News  5%
 */

import { SCORING_WEIGHTS, MIN_DECIMAL_ODDS } from "@/config/leagues";
import { MIN_VALUE_EDGE } from "./thresholds";
import { decimalToAmerican, impliedProbability } from "@/lib/utils";
import { ScoreResult } from "@/types";
import type { AFFixture } from "@/modules/stats/api-football-client";
import type { OverUnderLine } from "@/modules/stats/api-football-client";
import type { RefereeStats } from "@/modules/stats/referee-client";
import { leagueAvgCards } from "@/modules/stats/referee-client";

// ─── Input types ──────────────────────────────────────────────────────────────

export type MultiMarketStats = {
  homeTeamName:  string;
  awayTeamName:  string;
  league:        string;
  // 1X2 odds (from DB — required; picks are skipped when null)
  homeOdds:      number;
  drawOdds:      number | null;
  awayOdds:      number;
  // Recent form: [3=win, 1=draw, 0=loss] — completed fixtures only
  homeForm:      number[];
  awayForm:      number[];
  // Raw fixtures for goal/card analysis
  homeFixtures:  AFFixture[];
  awayFixtures:  AFFixture[];
  // H2H
  h2hHomeWins:   number;
  h2hAwayWins:   number;
  h2hDraws:      number;
  h2hTotal:      number;
  // Expanded odds (optional — scored with neutral value if missing)
  bttsYesOdds:   number | null;
  bttsNoOdds:    number | null;
  goalsLines:    OverUnderLine[];
  cardsLines:    OverUnderLine[];
  dc1xOdds:      number | null;
  dcX2Odds:      number | null;
  dc12Odds:      number | null;
  // Referee (optional)
  refereeStats:  RefereeStats | null;
  // Meta
  sentimentScore: number;
  newsScore:      number;
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formScore(results: number[]): number {
  if (!results.length) return 0.5;
  const max    = results.length * 3;
  const earned = results.reduce((a, b) => a + b, 0);
  return earned / max;
}

function h2hScore(wins: number, total: number): number {
  return total === 0 ? 0.5 : wins / total;
}

function valueScore(marketDecimal: number, estimatedProb: number): number {
  if (marketDecimal < MIN_DECIMAL_ODDS) return 0;
  const impliedProb = impliedProbability(marketDecimal);
  const edge        = estimatedProb - impliedProb;
  if (edge < MIN_VALUE_EDGE) return 0.3;
  return Math.min(1, 0.5 + (edge - MIN_VALUE_EDGE) / 0.08 * 0.5);
}

/** Estimate probability using edge = estimatedProb - impliedProb. Returns 0 if no edge. */
function edgeVsMarket(estimatedProb: number, marketDecimal: number | null): number {
  if (!marketDecimal || marketDecimal < MIN_DECIMAL_ODDS) return 0;
  return estimatedProb - impliedProbability(marketDecimal);
}

/** Compute goal averages from raw fixtures for a team. */
function goalAverages(fixtures: AFFixture[], teamAfId: number): { scored: number; conceded: number; games: number } {
  const done = fixtures.filter((f) => ["FT", "AET", "PEN"].includes(f.fixture.status.short));
  if (!done.length) return { scored: 0, conceded: 0, games: 0 };
  let scored = 0, conceded = 0;
  for (const f of done) {
    const isHome = f.teams.home.id === teamAfId;
    scored   += isHome ? (f.goals.home ?? 0) : (f.goals.away ?? 0);
    conceded += isHome ? (f.goals.away ?? 0) : (f.goals.home ?? 0);
  }
  return { scored: scored / done.length, conceded: conceded / done.length, games: done.length };
}

/** Extract API-Football team ID from a fixture (first team matching name substring). */
function extractTeamId(fixtures: AFFixture[], teamName: string): number | null {
  for (const f of fixtures) {
    if (f.teams.home.name.toLowerCase().includes(teamName.slice(0, 6).toLowerCase())) return f.teams.home.id;
    if (f.teams.away.name.toLowerCase().includes(teamName.slice(0, 6).toLowerCase())) return f.teams.away.id;
  }
  return null;
}

/**
 * Poisson CDF: P(X <= k) where X ~ Poisson(lambda).
 * Used to estimate Over/Under probabilities.
 */
function poissonCDF(lambda: number, k: number): number {
  let prob = 0;
  let term = Math.exp(-lambda);
  for (let i = 0; i <= k; i++) {
    prob += term;
    term *= lambda / (i + 1);
  }
  return Math.min(1, prob);
}

/** P(Over N goals) given expected total goals (lambda). */
function probOverGoals(lambda: number, line: number): number {
  // For half-lines (0.5, 1.5, 2.5, 3.5), use floor
  const k = Math.floor(line);
  return 1 - poissonCDF(lambda, k);
}

// ─── 1X2 scorer ──────────────────────────────────────────────────────────────

function score1X2(s: MultiMarketStats): ScoreResult[] {
  const homeForm = formScore(s.homeForm);
  const awayForm = formScore(s.awayForm);
  const homeH2H  = h2hScore(s.h2hHomeWins, s.h2hTotal);
  const awayH2H  = h2hScore(s.h2hAwayWins, s.h2hTotal);

  const HOME_ADV = 0.62;
  const AWAY_ADV = 0.38;

  const rawHome = (
    homeForm  * SCORING_WEIGHTS.form +
    homeH2H   * SCORING_WEIGHTS.headToHead +
    HOME_ADV  * SCORING_WEIGHTS.homeAway +
    s.sentimentScore       * SCORING_WEIGHTS.sentiment +
    s.newsScore            * SCORING_WEIGHTS.news
  );
  const rawAway = (
    awayForm               * SCORING_WEIGHTS.form +
    awayH2H                * SCORING_WEIGHTS.headToHead +
    AWAY_ADV               * SCORING_WEIGHTS.homeAway +
    (1 - s.sentimentScore) * SCORING_WEIGHTS.sentiment +
    s.newsScore            * SCORING_WEIGHTS.news
  );

  const homeOV = valueScore(s.homeOdds, rawHome);
  const awayOV = valueScore(s.awayOdds, rawAway);

  const homeTotal = rawHome + homeOV * SCORING_WEIGHTS.oddsValue;
  const awayTotal = rawAway + awayOV * SCORING_WEIGHTS.oddsValue;

  const gap = Math.abs(homeTotal - awayTotal);

  const results: ScoreResult[] = [];

  if (homeTotal > awayTotal && homeTotal > 0.60 && gap > 0.08) {
    const conf = Math.round(homeTotal * 100);
    if (s.homeOdds >= MIN_DECIMAL_ODDS) {
      results.push({
        pick:           "HOME",
        market:         "Ganador del Partido",
        selection:      s.homeTeamName,
        decimalOdds:    s.homeOdds,
        americanOdds:   decimalToAmerican(s.homeOdds),
        confidenceScore: conf,
        reasoning:      build1X2Reasoning("HOME", s, homeForm, awayForm, homeH2H, awayH2H, conf),
        sentimentSummary: null,
        componentScores: {
          form:       Math.round(homeForm * 100),
          headToHead: Math.round(homeH2H  * 100),
          homeAway:   Math.round(HOME_ADV  * 100),
          oddsValue:  Math.round(homeOV    * 100),
          sentiment:  Math.round(s.sentimentScore * 100),
          news:       Math.round(s.newsScore * 100),
        },
      });
    }
  } else if (awayTotal > homeTotal && awayTotal > 0.60 && gap > 0.08) {
    const conf = Math.round(awayTotal * 100);
    if (s.awayOdds >= MIN_DECIMAL_ODDS) {
      results.push({
        pick:           "AWAY",
        market:         "Ganador del Partido",
        selection:      s.awayTeamName,
        decimalOdds:    s.awayOdds,
        americanOdds:   decimalToAmerican(s.awayOdds),
        confidenceScore: conf,
        reasoning:      build1X2Reasoning("AWAY", s, homeForm, awayForm, homeH2H, awayH2H, conf),
        sentimentSummary: null,
        componentScores: {
          form:       Math.round(awayForm * 100),
          headToHead: Math.round(awayH2H  * 100),
          homeAway:   Math.round(AWAY_ADV  * 100),
          oddsValue:  Math.round(awayOV    * 100),
          sentiment:  Math.round(s.sentimentScore * 100),
          news:       Math.round(s.newsScore * 100),
        },
      });
    }
  }

  return results;
}

function build1X2Reasoning(
  dir:      "HOME" | "AWAY",
  s:        MultiMarketStats,
  hf:       number,
  af:       number,
  hH2H:     number,
  aH2H:     number,
  conf:     number
): string {
  const favTeam  = dir === "HOME" ? s.homeTeamName : s.awayTeamName;
  const favForm  = dir === "HOME" ? hf : af;
  const favH2H   = dir === "HOME" ? hH2H : aH2H;
  const location = dir === "HOME" ? "local" : "visitante";
  const odds     = dir === "HOME" ? s.homeOdds : s.awayOdds;
  const h2hLabel = s.h2hTotal > 0
    ? `Historial H2H: ${s.h2hHomeWins}V-${s.h2hDraws}E-${s.h2hAwayWins}D en ${s.h2hTotal} encuentros (${Math.round(favH2H * 100)}% victorias como ${location}). `
    : "";

  return (
    `Pronóstico: ${favTeam} (${location}). Confianza: ${conf}/100. ` +
    `Forma reciente: ${Math.round(favForm * 100)}% efectividad en últimos ${s[dir === "HOME" ? "homeForm" : "awayForm"].length} partidos. ` +
    h2hLabel +
    `Cuotas de mercado — Local: ${s.homeOdds}, Empate: ${s.drawOdds ?? "N/D"}, Visitante: ${s.awayOdds}. ` +
    `Cuota seleccionada: ${odds} (${decimalToAmerican(odds) > 0 ? "+" : ""}${decimalToAmerican(odds)}). ` +
    `Apuesta simple respaldada por forma y ventaja estructural.`
  );
}

// ─── Double Chance scorer ────────────────────────────────────────────────────

function scoreDoubleChance(s: MultiMarketStats): ScoreResult[] {
  if (!s.dc1xOdds && !s.dcX2Odds && !s.dc12Odds) return [];

  const homeForm  = formScore(s.homeForm);
  const awayForm  = formScore(s.awayForm);
  const homeH2H   = h2hScore(s.h2hHomeWins, s.h2hTotal);
  const awayH2H   = h2hScore(s.h2hAwayWins, s.h2hTotal);
  const HOME_ADV  = 0.62;
  const AWAY_ADV  = 0.38;

  // Estimated probabilities for each outcome
  const rawHome = homeForm * 0.35 + homeH2H * 0.25 + HOME_ADV * 0.40;
  const rawAway = awayForm * 0.35 + awayH2H * 0.25 + AWAY_ADV * 0.40;
  // Normalize rough estimates
  const total   = rawHome + rawAway + 0.25; // 0.25 = draw baseline
  const pHome   = rawHome / total;
  const pAway   = rawAway / total;
  const pDraw   = 0.25    / total;

  const results: ScoreResult[] = [];

  // 1X (Home or Draw)
  if (s.dc1xOdds) {
    const pDC1X   = pHome + pDraw;
    const edge    = edgeVsMarket(pDC1X, s.dc1xOdds);
    const conf    = Math.round(Math.min(90, 60 + edge * 250));
    if (edge >= MIN_VALUE_EDGE && s.dc1xOdds >= MIN_DECIMAL_ODDS && conf >= 62) {
      results.push({
        pick: "DC_1X", market: "Doble Oportunidad", selection: `${s.homeTeamName} o Empate (1X)`,
        decimalOdds: s.dc1xOdds, americanOdds: decimalToAmerican(s.dc1xOdds),
        confidenceScore: conf,
        reasoning: buildDCReasoning("1X", s, pDC1X, edge, conf),
        sentimentSummary: null,
        componentScores: { form: Math.round(homeForm*100), headToHead: Math.round(homeH2H*100), homeAway: 62, oddsValue: Math.round((edge/0.08)*50+30), sentiment: 50, news: 50 },
      });
    }
  }

  // X2 (Away or Draw)
  if (s.dcX2Odds) {
    const pDCX2   = pAway + pDraw;
    const edge    = edgeVsMarket(pDCX2, s.dcX2Odds);
    const conf    = Math.round(Math.min(90, 60 + edge * 250));
    if (edge >= MIN_VALUE_EDGE && s.dcX2Odds >= MIN_DECIMAL_ODDS && conf >= 62) {
      results.push({
        pick: "DC_X2", market: "Doble Oportunidad", selection: `${s.awayTeamName} o Empate (X2)`,
        decimalOdds: s.dcX2Odds, americanOdds: decimalToAmerican(s.dcX2Odds),
        confidenceScore: conf,
        reasoning: buildDCReasoning("X2", s, pDCX2, edge, conf),
        sentimentSummary: null,
        componentScores: { form: Math.round(awayForm*100), headToHead: Math.round(awayH2H*100), homeAway: 38, oddsValue: Math.round((edge/0.08)*50+30), sentiment: 50, news: 50 },
      });
    }
  }

  return results;
}

function buildDCReasoning(dc: "1X" | "X2" | "12", s: MultiMarketStats, prob: number, edge: number, conf: number): string {
  const label = dc === "1X" ? `${s.homeTeamName} o Empate` : dc === "X2" ? `${s.awayTeamName} o Empate` : `${s.homeTeamName} o ${s.awayTeamName}`;
  const odds  = dc === "1X" ? s.dc1xOdds! : dc === "X2" ? s.dcX2Odds! : s.dc12Odds!;
  return (
    `Doble oportunidad: ${label} (${dc}). Confianza: ${conf}/100. ` +
    `Probabilidad estimada: ${Math.round(prob * 100)}% vs implícita del mercado ${Math.round(impliedProbability(odds) * 100)}%. ` +
    `Ventaja sobre mercado: ${(edge * 100).toFixed(1)}%. ` +
    `Forma local: ${Math.round(formScore(s.homeForm) * 100)}% | Forma visitante: ${Math.round(formScore(s.awayForm) * 100)}%. ` +
    `Cuota: ${odds} (${decimalToAmerican(odds) > 0 ? "+" : ""}${decimalToAmerican(odds)}). ` +
    `Cobertura de dos resultados reduce riesgo manteniendo valor positivo.`
  );
}

// ─── BTTS scorer ──────────────────────────────────────────────────────────────

function scoreBTTS(s: MultiMarketStats): ScoreResult[] {
  if (!s.bttsYesOdds && !s.bttsNoOdds) return [];

  // Compute goal averages from raw fixtures
  const homeTeamId = extractTeamId(s.homeFixtures, s.homeTeamName);
  const awayTeamId = extractTeamId(s.awayFixtures, s.awayTeamName);

  const homeGoals = homeTeamId ? goalAverages(s.homeFixtures, homeTeamId) : null;
  const awayGoals = awayTeamId ? goalAverages(s.awayFixtures, awayTeamId) : null;

  if (!homeGoals || !awayGoals || homeGoals.games < 3 || awayGoals.games < 3) return [];

  // P(home scores) and P(away scores) — independent Poisson events
  // Expected goals for home team in this match = (homeAvgScored + awayAvgConceded) / 2
  const xGHome = (homeGoals.scored + awayGoals.conceded) / 2;
  const xGAway = (awayGoals.scored + homeGoals.conceded) / 2;

  // P(scores at least 1) = 1 - P(0 goals) = 1 - e^(-lambda)
  const pHomeScores = 1 - Math.exp(-xGHome);
  const pAwayScores = 1 - Math.exp(-xGAway);
  const pBTTS       = pHomeScores * pAwayScores;
  const pNoBTTS     = 1 - pBTTS;

  const results: ScoreResult[] = [];

  if (s.bttsYesOdds) {
    const edge = edgeVsMarket(pBTTS, s.bttsYesOdds);
    const conf = Math.round(Math.min(90, 55 + edge * 300));
    if (edge >= MIN_VALUE_EDGE && s.bttsYesOdds >= MIN_DECIMAL_ODDS && conf >= 62) {
      results.push({
        pick: "BTTS_YES", market: "Ambos Equipos Marcan", selection: "Ambos Anotan - Sí",
        decimalOdds: s.bttsYesOdds, americanOdds: decimalToAmerican(s.bttsYesOdds),
        confidenceScore: conf,
        reasoning: buildBTTSReasoning("YES", s, xGHome, xGAway, pBTTS, edge, conf),
        sentimentSummary: null,
        componentScores: { form: Math.round(formScore(s.homeForm)*100), headToHead: Math.round(h2hScore(s.h2hHomeWins,s.h2hTotal)*100), homeAway: 50, oddsValue: Math.round((edge/0.08)*50+30), sentiment: 50, news: 50 },
      });
    }
  }

  if (s.bttsNoOdds) {
    const edge = edgeVsMarket(pNoBTTS, s.bttsNoOdds);
    const conf = Math.round(Math.min(90, 55 + edge * 300));
    if (edge >= MIN_VALUE_EDGE && s.bttsNoOdds >= MIN_DECIMAL_ODDS && conf >= 62) {
      results.push({
        pick: "BTTS_NO", market: "Ambos Equipos Marcan", selection: "Ambos Anotan - No",
        decimalOdds: s.bttsNoOdds, americanOdds: decimalToAmerican(s.bttsNoOdds),
        confidenceScore: conf,
        reasoning: buildBTTSReasoning("NO", s, xGHome, xGAway, pNoBTTS, edge, conf),
        sentimentSummary: null,
        componentScores: { form: Math.round(formScore(s.awayForm)*100), headToHead: 50, homeAway: 50, oddsValue: Math.round((edge/0.08)*50+30), sentiment: 50, news: 50 },
      });
    }
  }

  return results;
}

function buildBTTSReasoning(
  dir:    "YES" | "NO",
  s:      MultiMarketStats,
  xgH:   number,
  xgA:   number,
  prob:  number,
  edge:  number,
  conf:  number
): string {
  const odds = dir === "YES" ? s.bttsYesOdds! : s.bttsNoOdds!;
  return (
    `Ambos Equipos Anotan: ${dir === "YES" ? "Sí" : "No"}. Confianza: ${conf}/100. ` +
    `xGoles esperados — ${s.homeTeamName}: ${xgH.toFixed(2)} | ${s.awayTeamName}: ${xgA.toFixed(2)}. ` +
    `Probabilidad estimada: ${Math.round(prob * 100)}% (mercado implica ${Math.round(impliedProbability(odds) * 100)}%). ` +
    `Ventaja: ${(edge * 100).toFixed(1)}% sobre el mercado. ` +
    `Análisis basado en promedios de goles marcados y concedidos de los últimos ${s.homeFixtures.length}/${s.awayFixtures.length} partidos. ` +
    `Cuota: ${odds} (${decimalToAmerican(odds) > 0 ? "+" : ""}${decimalToAmerican(odds)}).`
  );
}

// ─── Goals Over/Under scorer ──────────────────────────────────────────────────

function scoreGoalsOverUnder(s: MultiMarketStats): ScoreResult[] {
  if (!s.goalsLines.length) return [];

  const homeTeamId = extractTeamId(s.homeFixtures, s.homeTeamName);
  const awayTeamId = extractTeamId(s.awayFixtures, s.awayTeamName);
  const homeGoals  = homeTeamId ? goalAverages(s.homeFixtures, homeTeamId) : null;
  const awayGoals  = awayTeamId ? goalAverages(s.awayFixtures, awayTeamId) : null;

  if (!homeGoals || !awayGoals || homeGoals.games < 3 || awayGoals.games < 3) return [];

  // Expected total goals: average of attack-defense matchup for each team
  const xGHome  = (homeGoals.scored + awayGoals.conceded) / 2;
  const xGAway  = (awayGoals.scored + homeGoals.conceded) / 2;
  const xGTotal = xGHome + xGAway;

  // Collect qualifying candidates per direction, then pick ONE per direction.
  // Preference: lines with odds in 1.50–1.95 decimal (-113 to -105 American).
  // Only take a higher-odds line if its edge is ≥50% better than the preferred alternative.
  type OUCandidate = { line: number; odds: number; edge: number; conf: number; prob: number; dir: "OVER" | "UNDER" };

  const overCandidates:  OUCandidate[] = [];
  const underCandidates: OUCandidate[] = [];

  // Prioritize the most informative lines: 1.5, 2.5, 3.5
  const targetLines = [1.5, 2.5, 3.5];

  for (const line of s.goalsLines) {
    if (!targetLines.includes(line.line)) continue;

    const pOver  = probOverGoals(xGTotal, line.line);
    const pUnder = 1 - pOver;

    const edgeOver = edgeVsMarket(pOver, line.overOdds);
    const confOver = Math.round(Math.min(90, 55 + edgeOver * 300));
    if (edgeOver >= MIN_VALUE_EDGE && line.overOdds >= MIN_DECIMAL_ODDS && confOver >= 62) {
      overCandidates.push({ line: line.line, odds: line.overOdds, edge: edgeOver, conf: confOver, prob: pOver, dir: "OVER" });
    }

    const edgeUnder = edgeVsMarket(pUnder, line.underOdds);
    const confUnder = Math.round(Math.min(90, 55 + edgeUnder * 300));
    if (edgeUnder >= MIN_VALUE_EDGE && line.underOdds >= MIN_DECIMAL_ODDS && confUnder >= 62) {
      underCandidates.push({ line: line.line, odds: line.underOdds, edge: edgeUnder, conf: confUnder, prob: pUnder, dir: "UNDER" });
    }
  }

  // Preference scorer: favor odds between 1.50–1.95 (the -150 to -105 American range).
  // Score = edge × bonus, where bonus is 1.5 for preferred range, 1.0 elsewhere.
  function preferenceScore(c: OUCandidate): number {
    const preferred = c.odds >= 1.50 && c.odds <= 1.95;
    return c.edge * (preferred ? 1.5 : 1.0);
  }

  // Select best candidate per direction using preference score.
  // Only override the preferred-range pick with a higher-odds pick if its raw edge
  // is at least 50% better (guards against chasing +EV that's mostly noise).
  function selectBest(candidates: OUCandidate[]): OUCandidate | null {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // Sort by preference score descending
    const sorted = [...candidates].sort((a, b) => preferenceScore(b) - preferenceScore(a));
    const best = sorted[0];

    // If the best pick is already in the preferred range, use it.
    if (best.odds >= 1.50 && best.odds <= 1.95) return best;

    // Otherwise check if any preferred-range candidate exists and is close enough in edge.
    const preferredAlt = candidates.find(c => c.odds >= 1.50 && c.odds <= 1.95);
    if (preferredAlt && best.edge < preferredAlt.edge * 1.5) {
      // The higher-odds pick isn't meaningfully better — use the safer line instead.
      return preferredAlt;
    }

    return best;
  }

  const results: ScoreResult[] = [];

  const bestOver  = selectBest(overCandidates);
  const bestUnder = selectBest(underCandidates);

  if (bestOver) {
    results.push({
      pick: "OVER", market: "Goles Over/Under", selection: `Más de ${bestOver.line} goles`,
      decimalOdds: bestOver.odds, americanOdds: decimalToAmerican(bestOver.odds),
      confidenceScore: bestOver.conf,
      reasoning: buildOUGoalsReasoning("OVER", s, bestOver.line, xGTotal, bestOver.prob, bestOver.edge, bestOver.conf, bestOver.odds),
      sentimentSummary: null,
      componentScores: { form: Math.round(formScore(s.homeForm)*100), headToHead: 50, homeAway: 50, oddsValue: Math.round((bestOver.edge/0.08)*50+30), sentiment: 50, news: 50 },
    });
  }

  if (bestUnder) {
    results.push({
      pick: "UNDER", market: "Goles Over/Under", selection: `Menos de ${bestUnder.line} goles`,
      decimalOdds: bestUnder.odds, americanOdds: decimalToAmerican(bestUnder.odds),
      confidenceScore: bestUnder.conf,
      reasoning: buildOUGoalsReasoning("UNDER", s, bestUnder.line, xGTotal, bestUnder.prob, bestUnder.edge, bestUnder.conf, bestUnder.odds),
      sentimentSummary: null,
      componentScores: { form: Math.round(formScore(s.awayForm)*100), headToHead: 50, homeAway: 50, oddsValue: Math.round((bestUnder.edge/0.08)*50+30), sentiment: 50, news: 50 },
    });
  }

  return results;
}

function buildOUGoalsReasoning(
  dir:    "OVER" | "UNDER",
  s:      MultiMarketStats,
  line:   number,
  xgT:   number,
  prob:  number,
  edge:  number,
  conf:  number,
  odds:  number
): string {
  return (
    `${dir === "OVER" ? "Más" : "Menos"} de ${line} goles. Confianza: ${conf}/100. ` +
    `Goles esperados en el partido: ${xgT.toFixed(2)} (basado en promedios de ataque y defensa). ` +
    `${s.homeTeamName} promedia ataque/defensa de los últimos ${s.homeFixtures.length} partidos, ` +
    `${s.awayTeamName} de los últimos ${s.awayFixtures.length}. ` +
    `Probabilidad estimada ${dir === "OVER" ? `Over ${line}` : `Under ${line}`}: ${Math.round(prob * 100)}% ` +
    `vs cuota implícita ${Math.round(impliedProbability(odds) * 100)}%. ` +
    `Ventaja: ${(edge * 100).toFixed(1)}%. Cuota: ${odds} (${decimalToAmerican(odds) > 0 ? "+" : ""}${decimalToAmerican(odds)}).`
  );
}

// ─── Total Cards scorer ───────────────────────────────────────────────────────

function scoreTotalCards(s: MultiMarketStats): ScoreResult[] {
  // Requires referee stats to generate a cards pick
  if (!s.refereeStats) return [];

  const leagueAvg  = leagueAvgCards(s.league);
  const refAvg     = s.refereeStats.avgTotalCards;
  // Weighted cards estimate: 60% referee profile, 40% league average
  const estCards   = refAvg * 0.60 + leagueAvg * 0.40;

  const results: ScoreResult[] = [];

  // Check market-provided card lines first, then use standard lines
  const linesToCheck = s.cardsLines.length > 0
    ? s.cardsLines
    : [2.5, 3.5, 4.5].map((line) => ({ line, overOdds: 0, underOdds: 0 })); // no odds → skip market check

  for (const cl of linesToCheck) {
    if (!cl.overOdds && !cl.underOdds) continue; // no market odds for this line

    const pOver  = probOverGoals(estCards, cl.line); // reuse Poisson CDF
    const pUnder = 1 - pOver;

    // OVER cards
    if (cl.overOdds >= MIN_DECIMAL_ODDS) {
      const edge = edgeVsMarket(pOver, cl.overOdds);
      const conf = Math.round(Math.min(90, 55 + edge * 300));
      if (edge >= MIN_VALUE_EDGE && conf >= 62) {
        results.push({
          pick: "CARDS_OVER",
          market: "Tarjetas Totales",
          selection: `Más de ${cl.line} tarjetas`,
          decimalOdds: cl.overOdds, americanOdds: decimalToAmerican(cl.overOdds),
          confidenceScore: conf,
          reasoning: buildCardsReasoning("OVER", s, cl.line, estCards, refAvg, leagueAvg, pOver, edge, conf, cl.overOdds),
          sentimentSummary: null,
          componentScores: { form: 50, headToHead: 50, homeAway: 50, oddsValue: Math.round((edge/0.08)*50+30), sentiment: 50, news: 50 },
        });
      }
    }

    // UNDER cards
    if (cl.underOdds >= MIN_DECIMAL_ODDS) {
      const edge = edgeVsMarket(pUnder, cl.underOdds);
      const conf = Math.round(Math.min(90, 55 + edge * 300));
      if (edge >= MIN_VALUE_EDGE && conf >= 62) {
        results.push({
          pick: "CARDS_UNDER",
          market: "Tarjetas Totales",
          selection: `Menos de ${cl.line} tarjetas`,
          decimalOdds: cl.underOdds, americanOdds: decimalToAmerican(cl.underOdds),
          confidenceScore: conf,
          reasoning: buildCardsReasoning("UNDER", s, cl.line, estCards, refAvg, leagueAvg, pUnder, edge, conf, cl.underOdds),
          sentimentSummary: null,
          componentScores: { form: 50, headToHead: 50, homeAway: 50, oddsValue: Math.round((edge/0.08)*50+30), sentiment: 50, news: 50 },
        });
      }
    }
  }

  return results;
}

function buildCardsReasoning(
  dir:       "OVER" | "UNDER",
  s:         MultiMarketStats,
  line:      number,
  estCards:  number,
  refAvg:    number,
  lgAvg:     number,
  prob:      number,
  edge:      number,
  conf:      number,
  odds:      number
): string {
  const ref = s.refereeStats!;
  return (
    `${dir === "OVER" ? "Más" : "Menos"} de ${line} tarjetas. Confianza: ${conf}/100. ` +
    `Árbitro designado: ${ref.name} — ${ref.label} (${ref.gamesAnalyzed} partidos analizados). ` +
    `Promedia ${ref.avgYellowCards.toFixed(1)} amarillas y ${ref.avgRedCards.toFixed(1)} rojas por partido. ` +
    `Media de la liga (${s.league}): ${lgAvg.toFixed(1)} tarjetas/partido. ` +
    `Estimación combinada: ${estCards.toFixed(1)} tarjetas esperadas. ` +
    `Probabilidad ${dir === "OVER" ? `Over ${line}` : `Under ${line}`}: ${Math.round(prob * 100)}% ` +
    `vs cuota implícita ${Math.round(impliedProbability(odds) * 100)}%. ` +
    `Ventaja: ${(edge * 100).toFixed(1)}%. Cuota: ${odds} (${decimalToAmerican(odds) > 0 ? "+" : ""}${decimalToAmerican(odds)}).`
  );
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Analyze all applicable markets for a match and return every qualifying pick.
 * The picker filters results by confidenceScore threshold.
 */
export function scoreAllMarkets(stats: MultiMarketStats): ScoreResult[] {
  const all: ScoreResult[] = [
    ...score1X2(stats),
    ...scoreDoubleChance(stats),
    ...scoreBTTS(stats),
    ...scoreGoalsOverUnder(stats),
    ...scoreTotalCards(stats),
  ];

  // De-duplicate: if two markets would produce the same selection/market, keep highest confidence
  const seen = new Map<string, ScoreResult>();
  for (const r of all) {
    const key = `${r.market}::${r.selection}`;
    const existing = seen.get(key);
    if (!existing || r.confidenceScore > existing.confidenceScore) seen.set(key, r);
  }

  return Array.from(seen.values()).sort((a, b) => b.confidenceScore - a.confidenceScore);
}

// ─── Legacy single-market scorer (for backward compat) ───────────────────────

/** @deprecated Use scoreAllMarkets() instead. */
export function scoreMatch(stats: {
  homeTeamName: string; awayTeamName: string;
  homeOdds: number | null; drawOdds: number | null; awayOdds: number | null;
  homeForm: number[]; awayForm: number[];
  h2hHomeWins: number; h2hAwayWins: number; h2hDraws: number; h2hTotal: number;
  sentimentScore: number; newsScore: number;
}): ScoreResult {
  if (!stats.homeOdds || !stats.awayOdds) {
    return { pick: "SKIP", market: "Ganador del Partido", selection: "No pick", decimalOdds: 1, americanOdds: 0, confidenceScore: 0, reasoning: "Sin cuotas reales.", sentimentSummary: null, componentScores: { form: 0, headToHead: 0, homeAway: 0, oddsValue: 0, sentiment: 0, news: 0 } };
  }
  const multi: MultiMarketStats = {
    homeTeamName: stats.homeTeamName, awayTeamName: stats.awayTeamName,
    league: "", homeOdds: stats.homeOdds, drawOdds: stats.drawOdds, awayOdds: stats.awayOdds,
    homeForm: stats.homeForm, awayForm: stats.awayForm,
    homeFixtures: [], awayFixtures: [],
    h2hHomeWins: stats.h2hHomeWins, h2hAwayWins: stats.h2hAwayWins, h2hDraws: stats.h2hDraws, h2hTotal: stats.h2hTotal,
    bttsYesOdds: null, bttsNoOdds: null, goalsLines: [], cardsLines: [],
    dc1xOdds: null, dcX2Odds: null, dc12Odds: null,
    refereeStats: null, sentimentScore: stats.sentimentScore, newsScore: stats.newsScore,
  };
  const results = score1X2(multi);
  return results[0] ?? { pick: "SKIP", market: "Ganador del Partido", selection: "No pick", decimalOdds: 1, americanOdds: 0, confidenceScore: 0, reasoning: "Sin ventaja clara.", sentimentSummary: null, componentScores: { form: 0, headToHead: 0, homeAway: 0, oddsValue: 0, sentiment: 0, news: 0 } };
}
