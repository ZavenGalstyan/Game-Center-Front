/**
 * Night Corridor — A* over the cell grid for the creature.
 *
 * `passable(c, r)` decides what the creature may enter (walls, locked doors
 * and safe rooms are not). Diagonal moves are only allowed when both
 * orthogonal neighbours are open, so paths never cut a wall corner.
 */
import { cellX, cellZ } from "./level.js";

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export function findPath(level, c0, r0, c1, r1, passable, maxNodes = 4000) {
  const W = level.W;
  const start = r0 * W + c0;
  const goal = r1 * W + c1;
  if (start === goal) return [{ c: c1, r: r1, x: cellX(c1), z: cellZ(r1) }];
  if (!passable(c1, r1)) return null;
  const g = new Map([[start, 0]]);
  const came = new Map();
  const open = [{ k: start, f: 0 }];
  const closed = new Set();
  const h = (k) => {
    const c = k % W;
    const r = (k - c) / W;
    const dx = Math.abs(c - c1);
    const dy = Math.abs(r - r1);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  let expanded = 0;
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const { k } = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (closed.has(k)) continue;
    if (k === goal) break;
    closed.add(k);
    if (++expanded > maxNodes) return null;
    const c = k % W;
    const r = (k - c) / W;
    for (const [dc, dr, cost] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!passable(nc, nr)) continue;
      if (dc && dr && (!passable(c + dc, r) || !passable(c, r + dr))) continue;
      const nk = nr * W + nc;
      if (closed.has(nk)) continue;
      const ng = g.get(k) + cost;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, k);
        open.push({ k: nk, f: ng + h(nk) });
      }
    }
  }
  if (!came.has(goal)) return null;
  const path = [];
  let k = goal;
  while (k !== start) {
    const c = k % W;
    const r = (k - c) / W;
    path.push({ c, r, x: cellX(c), z: cellZ(r) });
    k = came.get(k);
  }
  path.reverse();
  return path;
}

/** Path length in metres (straight-line between waypoints). */
export function pathLength(path, fromX, fromZ) {
  let len = 0;
  let px = fromX;
  let pz = fromZ;
  for (const p of path) {
    len += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  return len;
}
