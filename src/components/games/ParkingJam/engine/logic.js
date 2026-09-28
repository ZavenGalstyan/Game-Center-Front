/**
 * Parking Jam — pure game rules. No React, no DOM; the renderer, the hint
 * system, the validator and the Node tests all call these same functions.
 *
 * State is `{ present: boolean[], history: number[] }` — `present[i]` is
 * whether vehicle index i is still parked, `history` the exit order (for
 * Undo). Nothing else is stored: occupancy is always rebuilt from the level
 * plus `present`, so it can never drift from what is drawn.
 */
import { DIRS, cellsOf, frontOf } from "./level.js";

export const EMPTY = -1;
export const OBSTACLE = -2;

export function initialState(level) {
  return { present: level.vehicles.map(() => true), history: [] };
}

/** Occupancy grid: vehicle index, OBSTACLE, or EMPTY for every cell. */
export function buildOccupancy(level, present) {
  const occ = new Int16Array(level.rows * level.cols).fill(EMPTY);
  for (const o of level.obstacles) {
    for (let r = o.row; r < o.row + o.h; r++) for (let c = o.col; c < o.col + o.w; c++) occ[r * level.cols + c] = OBSTACLE;
  }
  for (const v of level.vehicles) {
    if (!present[v.index]) continue;
    for (const [r, c] of cellsOf(v)) occ[r * level.cols + c] = v.index;
  }
  return occ;
}

/** Cells from just ahead of the nose to the board edge, nearest first. */
export function pathCells(level, v) {
  const d = DIRS[v.dir];
  let [r, c] = frontOf(v);
  const out = [];
  for (;;) {
    r += d.dr;
    c += d.dc;
    if (r < 0 || c < 0 || r >= level.rows || c >= level.cols) break;
    out.push([r, c]);
  }
  return out;
}

/** Is the road reachable where this vehicle would cross the edge? */
export function exitIsOpen(level, v) {
  const edge = DIRS[v.dir].edge;
  const pos = edge === "top" || edge === "bottom" ? v.col : v.row;
  return !level.closed[edge].some(([a, b]) => pos >= a && pos <= b);
}

/**
 * Can vehicle `index` drive out right now?
 * → { ok, blocker, blockedAt, reason }
 *   reason: "vehicle" (blocker = vehicle index) | "obstacle" | "wall" | "gone"
 * `blockedAt` is the first blocking cell [r, c] (null for walls).
 */
export function canExit(level, present, index, occ = buildOccupancy(level, present)) {
  if (!present[index]) return { ok: false, blocker: null, blockedAt: null, reason: "gone" };
  const v = level.vehicles[index];
  for (const [r, c] of pathCells(level, v)) {
    const o = occ[r * level.cols + c];
    if (o === OBSTACLE) return { ok: false, blocker: null, blockedAt: [r, c], reason: "obstacle" };
    if (o >= 0) return { ok: false, blocker: o, blockedAt: [r, c], reason: "vehicle" };
  }
  if (!exitIsOpen(level, v)) return { ok: false, blocker: null, blockedAt: null, reason: "wall" };
  return { ok: true, blocker: null, blockedAt: null, reason: null };
}

/** Every vehicle index sitting in `index`'s path (not just the first). */
export function blockersOf(level, present, index, occ = buildOccupancy(level, present)) {
  const v = level.vehicles[index];
  const out = [];
  for (const [r, c] of pathCells(level, v)) {
    const o = occ[r * level.cols + c];
    if (o >= 0 && !out.includes(o)) out.push(o);
  }
  return out;
}

export function legalMoves(level, present) {
  const occ = buildOccupancy(level, present);
  const out = [];
  for (const v of level.vehicles) if (present[v.index] && canExit(level, present, v.index, occ).ok) out.push(v.index);
  return out;
}

export function remaining(present) {
  let n = 0;
  for (const p of present) if (p) n++;
  return n;
}

export function isSolved(state) {
  return remaining(state.present) === 0;
}

/** Pure move. Returns null (not a state) when the move is illegal. */
export function applyExit(level, state, index) {
  if (!canExit(level, state.present, index).ok) return null;
  const present = state.present.slice();
  present[index] = false;
  return { present, history: [...state.history, index] };
}

/** Pure undo: puts the most recently exited vehicle back. */
export function undoExit(state) {
  if (!state.history.length) return null;
  const index = state.history[state.history.length - 1];
  const present = state.present.slice();
  present[index] = true;
  return { present, history: state.history.slice(0, -1), restored: index };
}

/** Rebuild a state from a saved exit order, rejecting anything illegal. */
export function replay(level, order) {
  let s = initialState(level);
  if (!Array.isArray(order)) return null;
  for (const i of order) {
    if (!Number.isInteger(i) || i < 0 || i >= level.vehicles.length) return null;
    s = applyExit(level, s, i);
    if (!s) return null;
  }
  return s;
}

const keyOf = (present) => present.map((p) => (p ? "1" : "0")).join("");

/**
 * Depth-first state search with a visited set. Returns
 * `{ solvable, solution, explored }`. A vehicle leaving can only ever free
 * cells, so on a solvable board the first branch already succeeds; the node
 * cap only matters for broken (cyclic) boards, where `peel` gives the
 * definitive answer.
 */
export function solve(level, state = initialState(level), { maxNodes = 200000 } = {}) {
  const seen = new Set();
  let explored = 0;
  const path = [];
  const dfs = (present) => {
    if (remaining(present) === 0) return true;
    const k = keyOf(present);
    if (seen.has(k)) return false;
    seen.add(k);
    if (++explored > maxNodes) return false;
    for (const i of legalMoves(level, present)) {
      const next = present.slice();
      next[i] = false;
      path.push(i);
      if (dfs(next)) return true;
      path.pop();
    }
    return false;
  };
  const ok = dfs(state.present.slice());
  return { solvable: ok, solution: ok ? path.slice() : null, explored };
}

/**
 * Layered peel: remove every legal vehicle at once, repeat. Because exits
 * only ever free cells, this is an exact solvability test and its layer count
 * is the puzzle's dependency depth (how many "waves" the lot clears in).
 * Returns `{ solvable, layers, stuck }`.
 */
export function peel(level, present = level.vehicles.map(() => true)) {
  let cur = present.slice();
  const layers = [];
  for (;;) {
    const free = legalMoves(level, cur);
    if (!free.length) break;
    layers.push(free);
    for (const i of free) cur[i] = false;
  }
  const stuck = [];
  cur.forEach((p, i) => p && stuck.push(i));
  return { solvable: stuck.length === 0, layers, stuck };
}

/**
 * Hint: the legal vehicle that unlocks the most. Scores each legal vehicle
 * by how many remaining vehicles (transitively) wait on it, and double-checks
 * the resulting board with the solver so a hint never leads into a dead end.
 */
export function bestHint(level, present) {
  const moves = legalMoves(level, present);
  if (!moves.length) return null;
  const occ = buildOccupancy(level, present);
  const waitsOn = new Map(); // blocker → vehicles directly waiting on it
  level.vehicles.forEach((v) => {
    if (!present[v.index]) return;
    for (const b of blockersOf(level, present, v.index, occ)) {
      if (!waitsOn.has(b)) waitsOn.set(b, []);
      waitsOn.get(b).push(v.index);
    }
  });
  const reach = (i) => {
    const seen = new Set();
    const stack = [i];
    while (stack.length) {
      const x = stack.pop();
      for (const y of waitsOn.get(x) || []) if (!seen.has(y)) { seen.add(y); stack.push(y); }
    }
    return seen.size;
  };
  const ranked = moves.map((i) => ({ i, score: reach(i) })).sort((a, b) => b.score - a.score || a.i - b.i);
  for (const { i } of ranked) {
    const next = present.slice();
    next[i] = false;
    if (peel(level, next).solvable) return i;
  }
  return ranked[0].i;
}
