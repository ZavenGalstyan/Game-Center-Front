/**
 * Bomb Squad — star rating and Perfect Disarm rules. Pure functions over a
 * finished run summary, deterministic per the mission's own timer/strike
 * numbers (no hidden per-stage tables to keep in sync).
 *
 * run = { success, strikes, timer, timeRemaining, bonusMet }
 *   bonusMet is null when the mission defines no bonus objective.
 */
export function starsForRun(run) {
  if (!run.success) return 0;
  if (run.strikes === 0) return 3; // zero strikes always earns 3, even on a slow clock
  if (run.timer > 0 && run.timeRemaining / run.timer >= 0.25) return 2;
  return 1;
}

export function isPerfectDisarm(run) {
  if (!run.success || run.strikes !== 0) return false;
  return run.bonusMet !== false;
}
