/**
 * Dot Connect path rules — pure helpers shared by the UI and the tests.
 * `paths[c]` is the cell list of colour c, starting at one of its dots.
 */
import { adjacent } from "./levels.js";

export const dotOwner = (L, x) => L.dots.findIndex(([a, b]) => a === x || b === x);

export function connected(L, paths, c) {
  const p = paths[c];
  if (!p || p.length < 2) return false;
  const [a, b] = L.dots[c];
  const s = p[0];
  const e = p[p.length - 1];
  return (s === a && e === b) || (s === b && e === a);
}

/**
 * Drag colour c's path onto cell x. Returns new paths (or the same object
 * when nothing changes):
 *  - x already on the path → erase back to x;
 *  - another colour's dot, a finished path or a non-adjacent cell → blocked;
 *  - another colour's path → that path is cut at x (paths never overlap).
 */
export function extend(L, paths, c, x) {
  const p = paths[c];
  if (!p.length) return paths;
  const i = p.indexOf(x);
  if (i >= 0) {
    if (i === p.length - 1) return paths;
    return paths.map((q, k) => (k === c ? p.slice(0, i + 1) : q));
  }
  if (!adjacent(p[p.length - 1], x, L.n) || connected(L, paths, c)) return paths;
  const owner = dotOwner(L, x);
  if (owner >= 0 && owner !== c) return paths;
  return paths.map((q, k) => {
    if (k === c) return [...p, x];
    const j = q.indexOf(x);
    return j >= 0 ? q.slice(0, j) : q;
  });
}

export function filledCount(paths) {
  return new Set(paths.flat()).size;
}

export function isWon(L, paths) {
  return L.dots.every((_, c) => connected(L, paths, c)) && filledCount(paths) === L.n * L.n;
}
