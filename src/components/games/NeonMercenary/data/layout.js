/**
 * Authoring helpers for district geometry (pure data → boxes).
 * Coordinates are world metres; districts are 32×32 cells of 4 m centred on 0.
 */
import { CELL } from "../engine/map.js";

/** Paint rectangles of characters into a cols×rows plan (inclusive ranges). */
export function paint(cols, rows, rects) {
  const g = Array.from({ length: rows }, () => Array(cols).fill("."));
  for (const [c0, r0, c1, r1, ch] of rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) g[r][c] = ch;
  return g.map((r) => r.join(""));
}

/** Cell → world centre (for a 32×32 plan centred on the origin). */
export const cx = (c) => -64 + c * CELL + CELL / 2;
export const cz = (r) => -64 + r * CELL + CELL / 2;

/**
 * A walled room. doors: { n|s|e|w: [[from, to], …] } gaps along that wall in
 * world coords (x for n/s walls, z for e/w walls). Returns boxes.
 */
export function room(x0, z0, x1, z1, { h = 4.2, t = 0.35, doors = {}, ceiling = true, kind = "iwall", ceilKind = "ceiling" } = {}) {
  const out = [];
  const wall = (ax0, az0, ax1, az1, gaps, alongX) => {
    let segs = [[alongX ? ax0 : az0, alongX ? ax1 : az1]];
    for (const [g0, g1] of gaps || []) {
      const n = [];
      for (const [s0, s1] of segs) {
        if (g1 <= s0 || g0 >= s1) n.push([s0, s1]);
        else {
          if (g0 > s0) n.push([s0, g0]);
          if (g1 < s1) n.push([g1, s1]);
        }
      }
      segs = n;
    }
    for (const [s0, s1] of segs) {
      if (s1 - s0 < 0.05) continue;
      if (alongX) out.push({ x0: s0, x1: s1, z0: az0, z1: az1, y1: h, kind });
      else out.push({ x0: ax0, x1: ax1, z0: s0, z1: s1, y1: h, kind });
    }
    // lintel above each door
    for (const [g0, g1] of gaps || []) {
      if (h <= 3.2) continue;
      if (alongX) out.push({ x0: g0, x1: g1, z0: az0, z1: az1, y0: 3, y1: h, kind });
      else out.push({ x0: ax0, x1: ax1, z0: g0, z1: g1, y0: 3, y1: h, kind });
    }
  };
  wall(x0, z0 - t / 2, x1, z0 + t / 2, doors.n, true);
  wall(x0, z1 - t / 2, x1, z1 + t / 2, doors.s, true);
  wall(x0 - t / 2, z0, x0 + t / 2, z1, doors.w, false);
  wall(x1 - t / 2, z0, x1 + t / 2, z1, doors.e, false);
  if (ceiling) out.push({ x0: x0 - t / 2, x1: x1 + t / 2, z0: z0 - t / 2, z1: z1 + t / 2, y0: h, y1: h + 0.35, kind: ceilKind });
  return out;
}

/** Staircase rising toward +dir ('x'|'-x'|'z'|'-z') from (x,z) to height H. */
export function stairs(x, z, width, H, dir = "x", step = 0.4, run = 0.7) {
  const n = Math.ceil(H / step);
  const out = [];
  for (let i = 0; i < n; i++) {
    const y1 = Math.min(H, (i + 1) * step);
    const a = i * run;
    const b = (i + 1) * run;
    if (dir === "x") out.push({ x0: x + a, x1: x + b, z0: z - width / 2, z1: z + width / 2, y1, kind: "stairs" });
    if (dir === "-x") out.push({ x0: x - b, x1: x - a, z0: z - width / 2, z1: z + width / 2, y1, kind: "stairs" });
    if (dir === "z") out.push({ x0: x - width / 2, x1: x + width / 2, z0: z + a, z1: z + b, y1, kind: "stairs" });
    if (dir === "-z") out.push({ x0: x - width / 2, x1: x + width / 2, z0: z - b, z1: z - a, y1, kind: "stairs" });
  }
  return out;
}

/** Box centred at (x,z) with size w×d, height h. */
export const prop = (kind, x, z, w, d, h, extra = {}) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y1: h, kind, ...extra });
export const crate = (x, z, s = 1.2, h = 1.1) => prop("crate", x, z, s, s, h);
export const container = (x, z, alongX = true, h = 2.6, color = 0) => prop("container", x, z, alongX ? 6 : 2.4, alongX ? 2.4 : 6, h, { color });
export const barrier = (x, z, alongX = true, len = 3) => prop("barrier", x, z, alongX ? len : 0.6, alongX ? 0.6 : len, 1.05);

/**
 * Carve open rectangles out of a solid block: returns wall boxes filling
 * bound − ∪open (1 m resolution, greedy-merged) + optional ceilings over the
 * open rects ({x0,z0,x1,z1,ceil?}). Used for tunnels and interior levels.
 */
export function carve(bound, open, { h = 4.4, kind = "iwall", ceilKind = "ceiling" } = {}) {
  const R = 1;
  const w = Math.round((bound.x1 - bound.x0) / R);
  const d = Math.round((bound.z1 - bound.z0) / R);
  const solid = Array.from({ length: d }, () => new Uint8Array(w).fill(1));
  for (const o of open)
    for (let r = 0; r < d; r++)
      for (let c = 0; c < w; c++) {
        const x = bound.x0 + (c + 0.5) * R;
        const z = bound.z0 + (r + 0.5) * R;
        if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) solid[r][c] = 0;
      }
  // keep only a 2-cell shell around open space (no need to fill deep rock)
  const near = (r, c) => {
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < d && cc < w && !solid[rr][cc]) return true;
      }
    return false;
  };
  const keep = solid.map((row, r) => row.map((v, c) => (v && near(r, c) ? 1 : 0)));
  const plan = keep.map((row) => [...row].map((v) => (v ? "#" : ".")).join(""));
  const out = [];
  for (const rc of planRectsLocal(plan)) out.push({ x0: bound.x0 + rc.c * R, x1: bound.x0 + (rc.c + rc.w) * R, z0: bound.z0 + rc.r * R, z1: bound.z0 + (rc.r + rc.h) * R, y1: h, kind });
  for (const o of open) if (o.ceil !== false) out.push({ x0: o.x0 - 0.5, x1: o.x1 + 0.5, z0: o.z0 - 0.5, z1: o.z1 + 0.5, y0: o.ceil || h, y1: (o.ceil || h) + 0.4, kind: ceilKind });
  return out;
}
function planRectsLocal(plan) {
  const rows = plan.length;
  const cols = plan[0].length;
  const seen = Array.from({ length: rows }, () => new Uint8Array(cols));
  const out = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (seen[r][c] || plan[r][c] !== "#") continue;
      let w = 1;
      while (c + w < cols && plan[r][c + w] === "#" && !seen[r][c + w]) w++;
      let h = 1;
      outer: while (r + h < rows) {
        for (let k = 0; k < w; k++) if (plan[r + h][c + k] !== "#" || seen[r + h][c + k]) break outer;
        h++;
      }
      for (let rr = r; rr < r + h; rr++) for (let k = 0; k < w; k++) seen[rr][c + k] = 1;
      out.push({ c, r, w, h });
    }
  return out;
}
