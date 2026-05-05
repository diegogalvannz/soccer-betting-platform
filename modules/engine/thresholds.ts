import { MIN_CONFIDENCE_THRESHOLD, MIN_DECIMAL_ODDS, SCORING_WEIGHTS } from "@/config/leagues";

export { MIN_CONFIDENCE_THRESHOLD, MIN_DECIMAL_ODDS, SCORING_WEIGHTS };

/** Minimum edge (our prob vs implied prob) required to flag as value */
export const MIN_VALUE_EDGE = 0.04;

/**
 * Confidence bands.
 * MEDIUM floor raised to 70 — matches MIN_CONFIDENCE_THRESHOLD.
 * Any pick below 70 is SKIP; there is no "acceptable with caveats" tier.
 */
export const CONFIDENCE_BANDS = {
  HIGH: 80,    // Strong pick — recommend confidently
  MEDIUM: 70,  // Acceptable — recommend with confidence
  LOW: 0,      // Skip — do not recommend
} as const;

/**
 * Minimum completed H2H fixtures required to generate a pick.
 * Prevents picks where we have no reliable head-to-head history.
 */
export const MIN_H2H_MATCHES = 3;

/**
 * Minimum completed recent fixtures required per team to generate a pick.
 * Guards against neutral form fallback [1,1,1,1,1] being used for scoring.
 */
export const MIN_FORM_MATCHES = 4;

/**
 * Max picks generated per cron run.
 * Raised from 5 → 10 so quality gates (not the cap) are what limits output.
 */
export const MAX_PICKS_PER_RUN = 10;

/** How many hours before kickoff we stop generating picks */
export const PICKS_CUTOFF_HOURS = 1;
