import { MIN_CONFIDENCE_THRESHOLD, MIN_DECIMAL_ODDS, SCORING_WEIGHTS } from "@/config/leagues";

export { MIN_CONFIDENCE_THRESHOLD, MIN_DECIMAL_ODDS, SCORING_WEIGHTS };

/** Minimum edge (our prob vs implied prob) required to flag as value */
export const MIN_VALUE_EDGE = 0.04;

/** Confidence bands */
export const CONFIDENCE_BANDS = {
  HIGH: 75,    // Strong pick — recommend confidently
  MEDIUM: 62,  // Acceptable — recommend with confidence
  LOW: 0,      // Skip — do not recommend
} as const;

/**
 * Minimum recent completed fixtures required per team.
 * Guards against scoring with no real form data.
 */
export const MIN_FORM_MATCHES = 4;

/**
 * Target minimum picks per daily run.
 * If fewer than this are generated at primary threshold (62),
 * the picker will do a second pass at FALLBACK_CONFIDENCE_THRESHOLD.
 */
export const MIN_PICKS_PER_RUN = 3;

/**
 * Fallback confidence threshold used only when the daily minimum
 * hasn't been met after the primary pass.
 */
export const FALLBACK_CONFIDENCE_THRESHOLD = 60;

/**
 * Max picks generated per cron run (cap, not target).
 * Quality gates, not this number, are what limits output on good days.
 */
export const MAX_PICKS_PER_RUN = 10;

/** How many hours before kickoff we stop generating picks */
export const PICKS_CUTOFF_HOURS = 1;
