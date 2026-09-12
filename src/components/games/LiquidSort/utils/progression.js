/**
 * Liquid Sort — star scoring & level-unlock rules. Pure functions, no I/O.
 */

/**
 * 1-3 stars from move efficiency against a level's tuned `targetMoves`.
 *   moves <= target        -> 3 stars (Perfect Sort)
 *   moves <= target + 4    -> 2 stars
 *   otherwise              -> 1 star
 * (Any completed level always earns at least 1 star.)
 */
export function starsForMoves(moves, targetMoves) {
  if (moves <= targetMoves) return 3;
  if (moves <= targetMoves + 4) return 2;
  return 1;
}

/** Never let a replay downgrade a stored best. */
export function betterOf(prevStars, prevBestMoves, stars, moves) {
  const bestStars = Math.max(prevStars || 0, stars);
  const bestMoves = prevBestMoves ? Math.min(prevBestMoves, moves) : moves;
  return { stars: bestStars, bestMoves };
}
