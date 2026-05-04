/**
 * Intelligence Learning System
 *
 * When a pick is LOST, this module runs a post-mortem analysis:
 * 1. Identifies which scoring factors were likely wrong
 * 2. Stores a LearningLog entry in the database
 * 3. Updates TeamWeightOverride for both teams to adjust future picks
 *
 * The system builds up team-specific knowledge over time, making the
 * recommendation engine progressively smarter for specific matchups.
 */

import { prisma } from "@/lib/prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

type WrongFactors = {
  form: boolean;          // Did recent form mislead us?
  h2h: boolean;           // Did we ignore/misread H2H?
  oddsValue: boolean;     // Were the odds a value trap?
  homeAdvantage: boolean; // Did home/away factor play against us?
};

type Adjustments = {
  formDelta: number;       // e.g. -0.05 = reduce form weight 5%
  h2hDelta: number;        // e.g. +0.05 = increase H2H weight 5%
  oddsDelta: number;       // e.g. -0.03 = trust odds value less
  homeDelta: number;       // e.g. +0.02 = increase home factor weight
};

// Default global weights (must mirror the pick engine)
const DEFAULT_WEIGHTS = {
  formWeight:        0.35,
  h2hWeight:         0.20,
  oddsValueWeight:   0.25,
  homeAdvantageWeight: 0.20,
};

// ─── Core: generate post-mortem for a single LOST pick ───────────────────────

export async function runPostMortem(pickId: string): Promise<void> {
  try {
    // Already analyzed?
    const existing = await prisma.learningLog.findUnique({ where: { pickId } });
    if (existing) return;

    const pick = await prisma.pick.findUnique({
      where: { id: pickId },
      include: {
        match: {
          include: {
            homeTeam: { select: { id: true, name: true, shortName: true } },
            awayTeam: { select: { id: true, name: true, shortName: true } },
          },
        },
      },
    });

    if (!pick || pick.status !== "LOST") return;

    const { match } = pick;
    const homeScore = match.homeScore ?? 0;
    const awayScore = match.awayScore ?? 0;
    const selectionLower = pick.selection.toLowerCase();

    // Determine which team we picked
    const pickedHome = selectionLower.includes(match.homeTeam.name.toLowerCase().split(" ")[0]) ||
      (match.homeTeam.shortName && selectionLower.includes(match.homeTeam.shortName.toLowerCase())) ||
      selectionLower.includes("home") || selectionLower.includes("local");

    const pickedAway = selectionLower.includes(match.awayTeam.name.toLowerCase().split(" ")[0]) ||
      (match.awayTeam.shortName && selectionLower.includes(match.awayTeam.shortName.toLowerCase())) ||
      selectionLower.includes("away") || selectionLower.includes("visitante");

    const scoreDiff = homeScore - awayScore;
    const totalGoals = homeScore + awayScore;

    // ── Diagnose which factors failed ──────────────────────────────────────

    const wrongFactors: WrongFactors = {
      // Form misleading: we picked the side that lost by 2+
      form: (pickedHome && scoreDiff < -1) || (pickedAway && scoreDiff > 1),

      // H2H likely ignored: big upset (favourite lost by 2+)
      h2h: (pickedHome && scoreDiff < -1) || (pickedAway && scoreDiff > 1),

      // Odds value trap: we took what looked like value but it was a trap
      // High confidence pick that lost = odds were misleading
      oddsValue: pick.confidenceScore >= 72 && pick.odds < 2.0,

      // Home advantage wrong: away team dominated (home lost by 1+) when we backed home
      homeAdvantage: pickedHome && scoreDiff < 0,
    };

    // Count mistakes
    const mistakeCount = Object.values(wrongFactors).filter(Boolean).length;

    // ── Compute weight adjustments ─────────────────────────────────────────
    // Each mistake reduces that factor's weight by 3-5%, with a floor
    const DELTA = 0.04;
    const adjustments: Adjustments = {
      formDelta:       wrongFactors.form          ? -DELTA : +DELTA * 0.5,
      h2hDelta:        wrongFactors.h2h           ? +DELTA : 0,
      oddsDelta:       wrongFactors.oddsValue      ? -DELTA : 0,
      homeDelta:       wrongFactors.homeAdvantage ? -DELTA : 0,
    };

    // ── Build human-readable explanation ──────────────────────────────────
    const winner = scoreDiff > 0 ? (match.homeTeam.shortName ?? match.homeTeam.name)
                 : scoreDiff < 0 ? (match.awayTeam.shortName ?? match.awayTeam.name)
                 : "Empate";

    const reasons: string[] = [];
    if (wrongFactors.form) reasons.push("La forma reciente no fue un buen predictor en este partido.");
    if (wrongFactors.h2h) reasons.push("El historial H2H no se consideró suficientemente o fue ignorado.");
    if (wrongFactors.oddsValue) reasons.push("Las cuotas parecían valor pero resultaron engañosas (pick de alta confianza perdido).");
    if (wrongFactors.homeAdvantage) reasons.push("La ventaja de local fue sobreestimada.");
    if (mistakeCount === 0) reasons.push("El partido fue un resultado impredecible de baja probabilidad. Ningún factor clave fallido.");

    const whatHappened = [
      `Selección: ${pick.selection} (${pick.market}) — Resultado: ${homeScore}-${awayScore} (Ganó ${winner}).`,
      ...reasons,
      `Ajustes recomendados: forma ${adjustments.formDelta >= 0 ? "+" : ""}${(adjustments.formDelta * 100).toFixed(0)}%, H2H ${adjustments.h2hDelta >= 0 ? "+" : ""}${(adjustments.h2hDelta * 100).toFixed(0)}%.`,
    ].join(" ");

    // ── Persist LearningLog ───────────────────────────────────────────────
    await prisma.learningLog.create({
      data: {
        pickId,
        whatHappened,
        wrongFactors,
        adjustments,
      },
    });

    // ── Update TeamWeightOverrides for both teams ──────────────────────────
    await Promise.all([
      applyWeightAdjustments(match.homeTeam.id, adjustments),
      applyWeightAdjustments(match.awayTeam.id, adjustments),
    ]);

    // Log it
    prisma.log.create({
      data: {
        type: "LEARNING",
        message: `Post-mortem para pick ${pickId}: ${mistakeCount} factor(es) identificado(s).`,
        meta: { pickId, wrongFactors, adjustments },
      },
    }).catch(() => {});
  } catch (err) {
    console.error("[Learning] Post-mortem failed:", err);
  }
}

// ─── Apply weight adjustments to a team's override record ────────────────────

async function applyWeightAdjustments(teamId: string, adjustments: Adjustments) {
  const existing = await prisma.teamWeightOverride.findUnique({ where: { teamId } });

  const current = (existing?.weights as typeof DEFAULT_WEIGHTS | null) ?? { ...DEFAULT_WEIGHTS };

  // Apply deltas with floor/ceiling clamping [0.05, 0.65]
  const clamp = (v: number) => Math.max(0.05, Math.min(0.65, v));
  const updated = {
    formWeight:          clamp(current.formWeight          + adjustments.formDelta),
    h2hWeight:           clamp(current.h2hWeight           + adjustments.h2hDelta),
    oddsValueWeight:     clamp(current.oddsValueWeight     + adjustments.oddsDelta),
    homeAdvantageWeight: clamp(current.homeAdvantageWeight + adjustments.homeDelta),
  };

  await prisma.teamWeightOverride.upsert({
    where: { teamId },
    create: { teamId, weights: updated },
    update: { weights: updated },
  });
}

// ─── Batch: run post-mortems for all LOST picks not yet analyzed ──────────────

export async function runPendingPostMortems(): Promise<{ analyzed: number; errors: number }> {
  let analyzed = 0;
  let errors = 0;

  try {
    const lostPicks = await prisma.pick.findMany({
      where: {
        status: "LOST",
        learningLog: null, // no post-mortem yet
      },
      select: { id: true },
      take: 50,
    });

    for (const pick of lostPicks) {
      try {
        await runPostMortem(pick.id);
        analyzed++;
      } catch {
        errors++;
      }
    }
  } catch (err) {
    console.error("[Learning] Batch post-mortem failed:", err);
  }

  return { analyzed, errors };
}
