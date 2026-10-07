/**
 * Water Tanks — breadth-first solver over the exact rules in rules.js.
 *
 * Levels are tiny (≤ 6 tanks, ≤ ~20 L each), so a full BFS from any state
 * finishes in a few milliseconds. It powers three things:
 *   - level validation (solvable? optimal move count?)
 *   - the Hint button (first move of a shortest path from the CURRENT state)
 *   - the star thresholds (optimalMoves)
 * Results are cached per level + state key; nothing runs per frame.
 */
import { generateNextStates, isSolved, serializeState } from "./rules.js";

const MAX_STATES = 250000;

/**
 * Shortest solution from `start`. Returns { moves: Move[], explored } or
 * { moves: null, explored, capped } when no solution exists (or the guard tripped).
 */
export function solve(level, start) {
  if (isSolved(level, start)) return { moves: [], explored: 1 };
  const startKey = serializeState(start);
  const parent = new Map([[startKey, null]]);
  let frontier = [start];
  let explored = 1;
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      const key = serializeState(s);
      for (const { move, state } of generateNextStates(level, s)) {
        const k = serializeState(state);
        if (parent.has(k)) continue;
        parent.set(k, { key, move });
        explored++;
        if (isSolved(level, state)) {
          const moves = [];
          let cur = k;
          while (parent.get(cur)) {
            const p = parent.get(cur);
            moves.unshift(p.move);
            cur = p.key;
          }
          return { moves, explored };
        }
        if (explored > MAX_STATES) return { moves: null, explored, capped: true };
        next.push(state);
      }
    }
    frontier = next;
  }
  return { moves: null, explored };
}

const cache = new WeakMap();

/** Cached shortest path from a state (null = unsolvable from here). */
export function solveCached(level, state) {
  let byKey = cache.get(level);
  if (!byKey) {
    byKey = new Map();
    cache.set(level, byKey);
  }
  const key = serializeState(state);
  if (!byKey.has(key)) {
    if (byKey.size > 400) byKey.clear();
    byKey.set(key, solve(level, state).moves);
  }
  return byKey.get(key);
}

/** The single next move a hint suggests, or null when the puzzle is stuck. */
export function hintMove(level, state) {
  const path = solveCached(level, state);
  return path && path.length ? path[0] : null;
}
