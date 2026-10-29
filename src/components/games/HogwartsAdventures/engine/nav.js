/**
 * Grid navigation for enemies: 1 m cells over the main map plus a separate
 * grid for the duel arena. Static blockers are baked once; dynamic
 * colliders (gates, the slab, the bridge…) are baked as "gated" cells that
 * are evaluated live, so a door that opens is walkable at once.
 *
 * findPath → A* (8-connected, corner-cutting forbidden) with a node budget,
 * then string-pulled with grid line-of-sight.
 */
import { STEP } from "./collide.js";
import { PITS } from "../data/layout.js";

const GRIDS = [
  { id: "main", x0: -180, z0: -100, w: 360, h: 336 },
  { id: "arena", x0: -40, z0: -460, w: 80, h: 80 },
];

export function createNav(col) {
  const grids = GRIDS.map((g) => ({ ...g, cell: new Uint8Array(g.w * g.h), gate: new Map() }));
  const INF = 0.42; // body radius inflation
  for (const g of grids) {
    const blockRect = (x0, x1, z0, z1, gateId) => {
      const i0 = Math.max(0, Math.floor(x0 - INF - g.x0));
      const i1 = Math.min(g.w - 1, Math.floor(x1 + INF - g.x0));
      const j0 = Math.max(0, Math.floor(z0 - INF - g.z0));
      const j1 = Math.min(g.h - 1, Math.floor(z1 + INF - g.z0));
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * g.w + i;
          if (gateId) {
            if (g.cell[k] !== 1) {
              g.cell[k] = 2;
              let a = g.gate.get(k);
              if (!a) g.gate.set(k, (a = []));
              a.push(gateId);
            }
          } else g.cell[k] = 1;
        }
    };
    for (const s of col.statics) {
      if (s.y1 <= STEP || s.y0 > 1.7) continue;
      if (s.t === "b") blockRect(s.x0, s.x1, s.z0, s.z1);
      else {
        const r = s.r + INF;
        const i0 = Math.max(0, Math.floor(s.x - r - g.x0));
        const i1 = Math.min(g.w - 1, Math.floor(s.x + r - g.x0));
        const j0 = Math.max(0, Math.floor(s.z - r - g.z0));
        const j1 = Math.min(g.h - 1, Math.floor(s.z + r - g.z0));
        for (let j = j0; j <= j1; j++)
          for (let i = i0; i <= i1; i++) {
            const cx = g.x0 + i + 0.5;
            const cz = g.z0 + j + 0.5;
            if ((cx - s.x) ** 2 + (cz - s.z) ** 2 < r * r) g.cell[j * g.w + i] = 1;
          }
      }
    }
    for (const p of PITS) blockRect(p.x0 + INF, p.x1 - INF, p.z0 + INF, p.z1 - INF, `pit:${p.id}`);
    g.blockRect = blockRect;
  }
  const gridAt = (x, z) => grids.find((g) => x >= g.x0 && z >= g.z0 && x < g.x0 + g.w && z < g.z0 + g.h);

  const api = {
    /** Mark a dynamic collider's footprint as gated by `id` (call after setDynamic). */
    gate(id, shape) {
      for (const g of grids) if (shape.r != null) g.blockRect(shape.x - shape.r, shape.x + shape.r, shape.z - shape.r, shape.z + shape.r, id);
      else g.blockRect(shape.x0, shape.x1, shape.z0, shape.z1, id);
    },
    /** Is the cell at (x,z) walkable right now? */
    open(x, z, g = gridAt(x, z)) {
      if (!g) return false;
      const i = Math.floor(x - g.x0);
      const j = Math.floor(z - g.z0);
      if (i < 0 || j < 0 || i >= g.w || j >= g.h) return false;
      return cellOpen(g, j * g.w + i);
    },
    findPath(sx, sz, tx, tz, budget = 5000) {
      const g = gridAt(sx, sz);
      if (!g || g !== gridAt(tx, tz)) return null;
      const W = g.w;
      const si = clampCell(g, sx, sz);
      let ti = clampCell(g, tx, tz);
      if (!cellOpen(g, ti)) ti = nearestOpen(g, ti);
      if (ti < 0) return null;
      if (si === ti) return [{ x: tx, z: tz }];
      const open = new Heap();
      const gs = new Map();
      const from = new Map();
      const tjx = ti % W;
      const tjz = (ti / W) | 0;
      const hfun = (k) => {
        const dx = Math.abs((k % W) - tjx);
        const dz = Math.abs(((k / W) | 0) - tjz);
        return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
      };
      gs.set(si, 0);
      open.push(si, hfun(si));
      let n = 0;
      let best = si;
      let bestH = hfun(si);
      while (open.size && n++ < budget) {
        const cur = open.pop();
        if (cur === ti) {
          best = ti;
          break;
        }
        const cg = gs.get(cur);
        const cx = cur % W;
        const cz = (cur / W) | 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const nx = cx + dx;
            const nz = cz + dz;
            if (nx < 0 || nz < 0 || nx >= W || nz >= g.h) continue;
            const k = nz * W + nx;
            if (!cellOpen(g, k)) continue;
            if (dx && dz && (!cellOpen(g, cz * W + nx) || !cellOpen(g, nz * W + cx))) continue;
            const ng = cg + (dx && dz ? 1.414 : 1);
            if (ng < (gs.get(k) ?? Infinity)) {
              gs.set(k, ng);
              from.set(k, cur);
              const h = hfun(k);
              open.push(k, ng + h);
              if (h < bestH) {
                bestH = h;
                best = k;
              }
            }
          }
      }
      // reconstruct (to the target or the closest we got)
      const cells = [];
      for (let k = best; k !== undefined && k !== si; k = from.get(k)) cells.push(k);
      cells.reverse();
      if (!cells.length) return null;
      const pts = cells.map((k) => ({ x: g.x0 + (k % W) + 0.5, z: g.z0 + ((k / W) | 0) + 0.5 }));
      if (best === ti) pts[pts.length - 1] = { x: tx, z: tz };
      // string-pull
      const out = [];
      let ax = sx;
      let az = sz;
      let i = 0;
      while (i < pts.length) {
        let j = pts.length - 1;
        while (j > i && !lineOpen(g, ax, az, pts[j].x, pts[j].z)) j--;
        out.push(pts[j]);
        ax = pts[j].x;
        az = pts[j].z;
        i = j + 1;
      }
      return out;
    },
    lineOpen(ax, az, bx, bz) {
      const g = gridAt(ax, az);
      return !!g && g === gridAt(bx, bz) && lineOpen(g, ax, az, bx, bz);
    },
  };
  function cellOpen(g, k) {
    const v = g.cell[k];
    if (v === 0) return true;
    if (v === 1) return false;
    const ids = g.gate.get(k);
    for (const id of ids) {
      if (id.startsWith("pit:")) {
        // a pit cell is open only if a floor (bridge / platform) covers it
        const x = g.x0 + (k % g.w) + 0.5;
        const z = g.z0 + ((k / g.w) | 0) + 0.5;
        if (col.ground(x, z, 0.2, 0) < -1) return false;
        continue;
      }
      const s = col.getDynamic(id);
      if (s && s.on && s.y1 > STEP && s.y0 < 1.7) return false;
    }
    return true;
  }
  function clampCell(g, x, z) {
    const i = Math.max(0, Math.min(g.w - 1, Math.floor(x - g.x0)));
    const j = Math.max(0, Math.min(g.h - 1, Math.floor(z - g.z0)));
    return j * g.w + i;
  }
  function nearestOpen(g, k) {
    const cx = k % g.w;
    const cz = (k / g.w) | 0;
    for (let r = 1; r < 5; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = cx + dx;
          const nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= g.w || nz >= g.h) continue;
          if (cellOpen(g, nz * g.w + nx)) return nz * g.w + nx;
        }
    return -1;
  }
  function lineOpen(g, ax, az, bx, bz) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(L / 0.5);
    for (let s = 1; s <= n; s++) {
      const x = ax + ((bx - ax) * s) / n;
      const z = az + ((bz - az) * s) / n;
      const i = Math.floor(x - g.x0);
      const j = Math.floor(z - g.z0);
      if (i < 0 || j < 0 || i >= g.w || j >= g.h || !cellOpen(g, j * g.w + i)) return false;
    }
    return true;
  }
  return api;
}

class Heap {
  constructor() {
    this.k = [];
    this.p = [];
  }
  get size() {
    return this.k.length;
  }
  push(k, p) {
    const K = this.k;
    const P = this.p;
    let i = K.length;
    K.push(k);
    P.push(p);
    while (i > 0) {
      const u = (i - 1) >> 1;
      if (P[u] <= P[i]) break;
      [K[u], K[i]] = [K[i], K[u]];
      [P[u], P[i]] = [P[i], P[u]];
      i = u;
    }
  }
  pop() {
    const K = this.k;
    const P = this.p;
    const top = K[0];
    const lk = K.pop();
    const lp = P.pop();
    if (K.length) {
      K[0] = lk;
      P[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < K.length && P[l] < P[m]) m = l;
        if (r < K.length && P[r] < P[m]) m = r;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]];
        [P[m], P[i]] = [P[i], P[m]];
        i = m;
      }
    }
    return top;
  }
}
