/**
 * Laser Maze — player moves and the breadth-first solver.
 *
 * A move is one puzzle-changing interaction, and exactly one move is counted
 * per call to `applyMove`:
 *   { t: "rot",   i }        toggle rotatable i between "/" and "\"
 *   { t: "mv",    i, s }     slide movable mirror i onto empty slot s
 *   { t: "crank", i }        advance gear train i by one phase
 *
 * `solve` is an exhaustive BFS over puzzle states (deduplicated by
 * stateKey), so the first solution it finds is a PROVEN shortest one. The
 * same function powers the level validator (from the initial state) and
 * the in-game hint (from whatever state the player is in).
 */
import { stateKey } from "./level.js";
import { traceBeams } from "./trace.js";

export function listMoves(level, state) {
  const moves = [];
  level.rotatables.forEach((_, i) => moves.push({ t: "rot", i }));
  level.cranks.forEach((_, i) => moves.push({ t: "crank", i }));
  if (level.movables.length) {
    const used = new Set(state.mov);
    level.movables.forEach((_, i) => {
      level.slots.forEach((_, s) => {
        if (!used.has(s)) moves.push({ t: "mv", i, s });
      });
    });
  }
  return moves;
}

export function applyMove(level, state, move) {
  if (move.t === "rot") {
    const rot = state.rot.slice();
    rot[move.i] = rot[move.i] ? 0 : 1;
    return { ...state, rot };
  }
  if (move.t === "crank") {
    const crank = state.crank.slice();
    crank[move.i] = (crank[move.i] + 1) % level.cranks[move.i].phases;
    return { ...state, crank };
  }
  if (move.t === "mv") {
    if (state.mov.includes(move.s)) return state;
    const mov = state.mov.slice();
    mov[move.i] = move.s;
    return { ...state, mov };
  }
  return state;
}

export function movesEqual(a, b) {
  return a && b && a.t === b.t && a.i === b.i && (a.t !== "mv" || a.s === b.s);
}

/**
 * Shortest move sequence from `start` to any solved state.
 * Returns { solution, explored, exhausted } or null when nothing is found
 * inside `maxStates` (or the space holds no solution at all).
 */
export function solve(level, start, { maxStates = 200000 } = {}) {
  if (traceBeams(level, start).solved) return { solution: [], explored: 1, exhausted: false };
  const startKey = stateKey(start);
  const parent = new Map([[startKey, null]]);
  let frontier = [start];
  let explored = 1;
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      const sk = stateKey(s);
      for (const mv of listMoves(level, s)) {
        const ns = applyMove(level, s, mv);
        const nk = stateKey(ns);
        if (parent.has(nk)) continue;
        parent.set(nk, { prev: sk, mv });
        explored++;
        if (traceBeams(level, ns).solved) {
          const solution = [];
          let k = nk;
          while (parent.get(k)) {
            const p = parent.get(k);
            solution.unshift(p.mv);
            k = p.prev;
          }
          return { solution, explored, exhausted: false };
        }
        if (explored >= maxStates) return null;
        next.push(ns);
      }
    }
    frontier = next;
  }
  return null;
}

/**
 * Full reachable-space census, used only by the dev validator to judge how
 * "tight" a puzzle is (how many configurations solve it).
 */
export function census(level, start, { maxStates = 300000 } = {}) {
  const seen = new Set([stateKey(start)]);
  let frontier = [start];
  let goals = 0;
  let total = 0;
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      total++;
      if (traceBeams(level, s).solved) goals++;
      if (total >= maxStates) return { total, goals, complete: false };
      for (const mv of listMoves(level, s)) {
        const ns = applyMove(level, s, mv);
        const k = stateKey(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(ns);
      }
    }
    frontier = next;
  }
  return { total, goals, complete: true };
}
