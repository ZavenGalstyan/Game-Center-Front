/**
 * Cozy Cleanup — pure progress/scoring helpers. No React, no DOM, so the
 * completion math is easy to reason about and cheap to call on every
 * cleaning-stroke tick.
 */

/** Weighted overall % across whatever categories a room actually uses. */
export function overallCompletion(categoryPct, weights) {
  const keys = Object.keys(categoryPct);
  if (keys.length === 0) return 0;
  let sum = 0;
  let wsum = 0;
  for (const k of keys) {
    const w = weights?.[k] ?? 1;
    sum += Math.max(0, Math.min(100, categoryPct[k])) * w;
    wsum += w;
  }
  return wsum > 0 ? sum / wsum : 0;
}

/**
 * Stars are generous — this is a relaxing game, not a speedrun.
 *   1 star: the room is done (all required tasks complete)
 *   2 stars: done without leaning on Hint more than once
 *   3 stars: done with zero hints and every optional detail finished too
 */
export function starsForRun({ hintsUsed, requiredComplete, optionalPct }) {
  if (!requiredComplete) return 0;
  let stars = 1;
  if (hintsUsed <= 1) stars = 2;
  if (hintsUsed === 0 && optionalPct >= 99.5) stars = 3;
  return stars;
}

/** Coverage-mask surfaces complete at a forgiving threshold, never 100.000%. */
export const COVERAGE_COMPLETE_THRESHOLD = 92;

export function clampPct(n) {
  return Math.max(0, Math.min(100, n));
}
