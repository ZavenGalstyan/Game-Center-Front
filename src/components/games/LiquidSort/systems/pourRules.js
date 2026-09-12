/**
 * Liquid Sort — core puzzle rules. Pure functions only, no rendering, no timers.
 *
 * CONVENTION (documented once, followed everywhere in this game):
 *   A bottle is an array of color strings ordered BOTTOM -> TOP.
 *   bottle[0]            is the liquid resting at the bottom.
 *   bottle[bottle.length - 1] is the exposed top layer (what you'd pour first).
 *
 * Example: ["red", "blue", "yellow"]
 *   bottom: red, middle: blue, top (exposed): yellow.
 *
 * Board state is simply an array of bottles: Bottle[].
 */

export const CAPACITY = 4;

/** Top-most color of a bottle, or null if empty. */
export function getTopColor(bottle) {
  if (!bottle || bottle.length === 0) return null;
  return bottle[bottle.length - 1];
}

/** How many connected units of the top color sit on top of the bottle. */
export function getTopColorCount(bottle) {
  if (!bottle || bottle.length === 0) return 0;
  const top = bottle[bottle.length - 1];
  let count = 0;
  for (let i = bottle.length - 1; i >= 0; i--) {
    if (bottle[i] !== top) break;
    count++;
  }
  return count;
}

/** Free capacity remaining in a bottle. */
export function getFreeCapacity(bottle, capacity = CAPACITY) {
  return capacity - (bottle ? bottle.length : 0);
}

/**
 * Can `source` legally pour into `destination`?
 * Rules: source not empty; destination has free room; destination is empty
 * OR destination's top color equals source's top color.
 */
export function canPour(source, destination, capacity = CAPACITY) {
  if (!source || source.length === 0) return false;
  if (!destination) return false;
  if (getFreeCapacity(destination, capacity) <= 0) return false;
  const destTop = getTopColor(destination);
  if (destTop === null) return true;
  return destTop === getTopColor(source);
}

/** How many units would actually transfer if source poured into destination. */
export function getPourAmount(source, destination, capacity = CAPACITY) {
  if (!canPour(source, destination, capacity)) return 0;
  const available = getTopColorCount(source);
  const room = getFreeCapacity(destination, capacity);
  return Math.min(available, room);
}

/**
 * Apply a pour to a board (array of bottles). Returns a NEW board plus move
 * metadata, or null if the move is illegal / a no-op. Never mutates input.
 */
export function applyPour(board, sourceIndex, destinationIndex, capacity = CAPACITY) {
  if (sourceIndex === destinationIndex) return null;
  const source = board[sourceIndex];
  const destination = board[destinationIndex];
  const amount = getPourAmount(source, destination, capacity);
  if (amount <= 0) return null;

  const color = getTopColor(source);
  const nextSource = source.slice(0, source.length - amount);
  const nextDestination = destination.concat(Array(amount).fill(color));

  const nextBoard = board.slice();
  nextBoard[sourceIndex] = nextSource;
  nextBoard[destinationIndex] = nextDestination;

  return {
    board: nextBoard,
    from: sourceIndex,
    to: destinationIndex,
    color,
    amount,
    sourceEmptied: nextSource.length === 0,
    destinationCompleted: nextDestination.length === capacity,
  };
}

/** A bottle is "resolved" if empty, or full with a single uniform color. */
export function isBottleResolved(bottle, capacity = CAPACITY) {
  if (!bottle || bottle.length === 0) return true;
  if (bottle.length !== capacity) return false;
  const top = bottle[0];
  return bottle.every((c) => c === top);
}

/** A bottle counts as "completed" (for effects/sparkle) — full + uniform. */
export function isBottleCompleted(bottle, capacity = CAPACITY) {
  return Boolean(bottle && bottle.length === capacity && bottle.every((c) => c === bottle[0]));
}

/** Canonical string key for a board — used by the solver's visited set. */
export function serializeBoard(board) {
  return board.map((b) => b.join(",")).join("|");
}
