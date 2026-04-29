import { MIN_CONFIDENCE_THRESHOLD, MIN_DECIMAL_ODDS, SCORING_WEIGHTS } from "@/config/leagues";

export { MIN_CONFIDENCE_THRESHOLD, MIN_DECIMAL_ODDS, SCORING_WEIGHTS };

/** Minimum edge (our prob vs implied prob) required to flag as value */
export const MIN_VALUE_EDGE = 0.04;

/** Confidence bands */
export const CONFIDENCE_BANDS = {
  HIGH: 75,    // Strong pick — recommend confidently
  MEDIUM: 62,  // Acceptable — recommend with caveats
  LOW: 0,      // Skip — do not recommend
} as const;

/** Max picks generated per cron run (prevents spam) */
export const MAX_PICKS_PER_RUN = 5;

/** How many hours before kickoff we stop generating picks */
export const PICKS_CUTOFF_HOURS = 1;
