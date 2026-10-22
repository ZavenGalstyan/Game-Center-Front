/**
 * Dot Connect solver (powers hints + the validation script). Depth-first,
 * one colour at a time, with two prunes checked after every step:
 *  - dead cell: an empty cell needs ≥ 2 open neighbours (empty cells or live
 *    path ends), otherwise it can never be filled;
 *  - regions: every empty region must be fillable by some unrouted colour
 *    whose both ends touch it, and every unrouted pair must share a region
 *    (or already be adjacent).
 * `fixed` maps colour → a finished path the solution must keep.
 * Returns an array of paths, or null (unsolvable / node limit hit).
 */
import { neighbours, adjacent } from "./levels.js";

const NB_CACHE = {};

export function solve(level, fixed = {}, limit = 400000) {
  const { n, dots } = level;
  const N = n * n;
  const nb = (NB_CACHE[n] ||= neighbours(n));
  const grid = new Int8Array(N).fill(-1);
  dots.forEach(([a, b], c) => (grid[a] = grid[b] = c));
  const result = dots.map(() => null);
  for (const [c, p] of Object.entries(fixed)) {
    for (const x of p) grid[x] = +c;
    result[c] = p.slice();
  }
  const dist = (c) => {
    const [a, b] = dots[c];
    return Math.abs((a % n) - (b % n)) + Math.abs(Math.floor(a / n) - Math.floor(b / n));
  };
  const todo = dots.map((_, c) => c).filter((c) => !result[c]).sort((x, y) => dist(x) - dist(y));
  const comp = new Int16Array(N);
  const stack = new Int16Array(N);
  let nodes = 0;

  // live terminals: [headOfCurrent, B] for todo[k], then both dots of the rest
  function feasible(k, head) {
    const live = [];
    for (let j = k; j < todo.length; j++) live.push(j === k ? [head, dots[todo[j]][1]] : dots[todo[j]]);
    const isLive = (x) => live.some(([a, b]) => a === x || b === x);
    // dead cells
    for (let i = 0; i < N; i++) {
      if (grid[i] !== -1) continue;
      let open = 0;
      for (const x of nb[i]) if (grid[x] === -1 || isLive(x)) open++;
      if (open < 2) return false;
    }
    // regions
    comp.fill(-1);
    let regions = 0;
    for (let i = 0; i < N; i++) {
      if (grid[i] !== -1 || comp[i] !== -1) continue;
      let sp = 0;
      stack[sp++] = i;
      comp[i] = regions;
      while (sp) {
        const x = stack[--sp];
        for (const y of nb[x]) if (grid[y] === -1 && comp[y] === -1) (comp[y] = regions), (stack[sp++] = y);
      }
      regions++;
    }
    const covered = new Uint8Array(regions);
    for (const [a, b] of live) {
      const ra = new Set();
      for (const x of nb[a]) if (grid[x] === -1) ra.add(comp[x]);
      let shared = adjacent(a, b, n);
      for (const x of nb[b]) if (grid[x] === -1 && ra.has(comp[x])) (shared = true), (covered[comp[x]] = 1);
      if (!shared) return false;
    }
    return covered.every(Boolean);
  }

  function route(k, head) {
    if (k === todo.length) return grid.every((v) => v !== -1);
    if (++nodes > limit) throw nodes;
    const c = todo[k];
    const B = dots[c][1];
    const path = result[c] || [dots[c][0]];
    result[c] = path;
    const free = (x) => nb[x].reduce((s, y) => s + (grid[y] === -1), 0);
    const opts = nb[head].filter((x) => x === B || grid[x] === -1).sort((x, y) => (x === B ? -1 : y === B ? 1 : free(x) - free(y)));
    for (const x of opts) {
      if (x === B) {
        path.push(B);
        const next = todo[k + 1];
        if (k + 1 === todo.length ? grid.every((v) => v !== -1) : feasible(k + 1, dots[next][0]) && route(k + 1, dots[next][0])) return true;
        path.pop();
        continue;
      }
      grid[x] = c;
      path.push(x);
      if (feasible(k, x) && route(k, x)) return true;
      path.pop();
      grid[x] = -1;
    }
    if (path.length === 1) result[c] = null;
    return false;
  }

  try {
    if (!todo.length) return grid.every((v) => v !== -1) ? result : null;
    const first = dots[todo[0]][0];
    return feasible(0, first) && route(0, first) ? result : null;
  } catch {
    return null;
  }
}
