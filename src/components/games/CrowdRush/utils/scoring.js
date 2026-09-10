/**
 * Crowd Rush — score + stars.
 *
 * Score rewards the things the player controls: the crowd that reaches the
 * finish, enemies cleared, runners kept rather than lost, gate efficiency
 * (how close each choice was to the optimal one) and the finale result.
 *
 * Stars compare the crowd that crossed the finish line against the level's
 * `par` (the crowd the best line produces):
 *   3 ★  finished with a strong crowd AND good decisions
 *   2 ★  finished with a solid crowd
 *   1 ★  survived
 */

export function rateRun({ level, finalCrowd, runnersLost, enemiesDefeated, gateEfficiency, finaleBonus = 0, bossDefeated = false }) {
  const par = Math.max(1, level.par);
  const ratio = finalCrowd / par;

  let stars = 1;
  if (ratio >= 0.85 && gateEfficiency >= 0.8) stars = 3;
  else if (ratio >= 0.6) stars = 2;
  else if (ratio >= 0.32) stars = 1;
  if (finalCrowd <= 0) stars = 0;

  const score =
    Math.round(finalCrowd * 10) +
    enemiesDefeated * 150 +
    (bossDefeated ? 600 : 0) +
    Math.round(gateEfficiency * 500) +
    Math.max(0, 300 - runnersLost * 2) +
    Math.round(finaleBonus);

  // coins: cosmetic-only, modest, no grind
  const coins = Math.round(finalCrowd / 6) + enemiesDefeated * 4 + stars * 8 + (bossDefeated ? 20 : 0);

  return { stars, score: Math.max(0, score), coins };
}

/** star thresholds as raw crowd numbers, for the results screen bars */
export function starTargets(level) {
  return {
    one: Math.ceil(level.par * 0.32),
    two: Math.ceil(level.par * 0.6),
    three: Math.ceil(level.par * 0.85),
  };
}
