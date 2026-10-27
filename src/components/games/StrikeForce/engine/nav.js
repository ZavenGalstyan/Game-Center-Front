/**
 * Strike Force — bot navigation on a 0.5 m occupancy grid.
 *
 * A cell is blocked when its centre lies inside any collider inflated by the
 * bot radius (ignoring things bots can step over or walk under). Paths are
 * A* (8-connected, no corner cutting) then string-pulled with grid line
 * checks, so bots never route through walls. Only the largest connected
 * region is "the map" — spawns / flags must live in it (tests check).
 * Cover cells are free cells next to something at least crouch-cover tall.
 */
import { STEP_H } from "./collision.js";

const CELL = 0.5;
const INFL = 0.42;
const SQ2 = Math.SQRT2;

export function createNav(map) {
  const { minX, maxX, minZ, maxZ } = map.bounds;
  const nx = Math.ceil((maxX - minX) / CELL);
  const nz = Math.ceil((maxZ - minZ) / CELL);
  const N = nx * nz;
  const blocked = new Uint8Array(N);
  const coverH = new Float32Array(N);
  const centerX = (i) => minX + (i + 0.5) * CELL;
  const centerZ = (j) => minZ + (j + 0.5) * CELL;
  for (const b of map.boxes) {
    if (b.y1 <= STEP_H + 0.02 || b.y0 >= 1.75) continue;
    const i0 = Math.max(0, Math.floor((b.x0 - INFL - minX) / CELL));
    const i1 = Math.min(nx - 1, Math.floor((b.x1 + INFL - minX) / CELL));
    const j0 = Math.max(0, Math.floor((b.z0 - INFL - minZ) / CELL));
    const j1 = Math.min(nz - 1, Math.floor((b.z1 + INFL - minZ) / CELL));
    for (let i = i0; i <= i1; i++) {
      const x = centerX(i);
      if (x <= b.x0 - INFL || x >= b.x1 + INFL) continue;
      for (let j = j0; j <= j1; j++) {
        const z = centerZ(j);
        if (z <= b.z0 - INFL || z >= b.z1 + INFL) continue;
        blocked[i + j * nx] = 1;
      }
    }
    // cover heights for the ring just outside the inflated box
    if (b.y0 < 0.3 && b.y1 >= 1.0 && b.shoot !== false && !b.hidden) {
      const pad = INFL + CELL * 1.2;
      const ci0 = Math.max(0, Math.floor((b.x0 - pad - minX) / CELL));
      const ci1 = Math.min(nx - 1, Math.floor((b.x1 + pad - minX) / CELL));
      const cj0 = Math.max(0, Math.floor((b.z0 - pad - minZ) / CELL));
      const cj1 = Math.min(nz - 1, Math.floor((b.z1 + pad - minZ) / CELL));
      for (let i = ci0; i <= ci1; i++) for (let j = cj0; j <= cj1; j++) coverH[i + j * nx] = Math.max(coverH[i + j * nx], Math.min(b.y1, 3));
    }
  }

  // largest connected component
  const comp = new Int32Array(N).fill(-1);
  let best = -1;
  let bestSize = 0;
  let nComp = 0;
  const stack = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (blocked[s] || comp[s] >= 0) continue;
    let sp = 0;
    stack[sp++] = s;
    comp[s] = nComp;
    let size = 0;
    while (sp) {
      const c = stack[--sp];
      size++;
      const i = c % nx;
      const j = (c / nx) | 0;
      if (i > 0 && !blocked[c - 1] && comp[c - 1] < 0) (comp[c - 1] = nComp), (stack[sp++] = c - 1);
      if (i < nx - 1 && !blocked[c + 1] && comp[c + 1] < 0) (comp[c + 1] = nComp), (stack[sp++] = c + 1);
      if (j > 0 && !blocked[c - nx] && comp[c - nx] < 0) (comp[c - nx] = nComp), (stack[sp++] = c - nx);
      if (j < nz - 1 && !blocked[c + nx] && comp[c + nx] < 0) (comp[c + nx] = nComp), (stack[sp++] = c + nx);
    }
    if (size > bestSize) {
      bestSize = size;
      best = nComp;
    }
    nComp++;
  }
  const main = new Uint8Array(N);
  const mainCells = [];
  const coverCells = [];
  for (let c = 0; c < N; c++)
    if (comp[c] === best) {
      main[c] = 1;
      mainCells.push(c);
      if (coverH[c] >= 1.0) coverCells.push(c);
    }

  const cellOf = (x, z) => {
    const i = Math.floor((x - minX) / CELL);
    const j = Math.floor((z - minZ) / CELL);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return -1;
    return i + j * nx;
  };
  const posOf = (c) => ({ x: centerX(c % nx), z: centerZ((c / nx) | 0) });
  const walkable = (c) => c >= 0 && main[c] === 1;

  /** nearest walkable (main-region) cell to a point */
  function nearest(x, z, maxR = 24) {
    const c0 = cellOf(x, z);
    if (walkable(c0)) return c0;
    const i0 = Math.floor((x - minX) / CELL);
    const j0 = Math.floor((z - minZ) / CELL);
    for (let r = 1; r <= maxR; r++) {
      let bestC = -1;
      let bestD = Infinity;
      for (let di = -r; di <= r; di++)
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = i0 + di;
          const j = j0 + dj;
          if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
          const c = i + j * nx;
          if (!main[c]) continue;
          const d = di * di + dj * dj;
          if (d < bestD) {
            bestD = d;
            bestC = c;
          }
        }
      if (bestC >= 0) return bestC;
    }
    return -1;
  }

  /** straight walk between two points stays on free cells */
  function lineFree(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / (CELL * 0.4));
    for (let k = 0; k <= n; k++) {
      const t = n ? k / n : 0;
      const c = cellOf(ax + (bx - ax) * t, az + (bz - az) * t);
      if (!walkable(c)) return false;
    }
    return true;
  }

  // A* scratch
  const g = new Float32Array(N);
  const parent = new Int32Array(N);
  const seen = new Uint32Array(N);
  const closed = new Uint32Array(N);
  let gen = 0;
  const heap = [];
  const fOf = new Float32Array(N);
  const push = (c) => {
    heap.push(c);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (fOf[heap[p]] <= fOf[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && fOf[heap[l]] < fOf[heap[m]]) m = l;
        if (r < heap.length && fOf[heap[r]] < fOf[heap[m]]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };

  /** path of {x, z} points from a to b (excluding the start), or null */
  function path(ax, az, bx, bz, maxExpand = 30000) {
    const s = nearest(ax, az, 6);
    const t = nearest(bx, bz, 12);
    if (s < 0 || t < 0) return null;
    if (s === t) return [{ x: bx, z: bz }];
    gen++;
    heap.length = 0;
    const ti = t % nx;
    const tj = (t / nx) | 0;
    const h = (c) => {
      const dx = Math.abs((c % nx) - ti);
      const dz = Math.abs(((c / nx) | 0) - tj);
      return (dx + dz + (SQ2 - 2) * Math.min(dx, dz)) * 1.02;
    };
    g[s] = 0;
    seen[s] = gen;
    parent[s] = -1;
    fOf[s] = h(s);
    push(s);
    let found = false;
    let expanded = 0;
    while (heap.length) {
      const c = pop();
      if (closed[c] === gen) continue;
      closed[c] = gen;
      if (c === t) {
        found = true;
        break;
      }
      if (++expanded > maxExpand) break;
      const i = c % nx;
      const j = (c / nx) | 0;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue;
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          const n = ii + jj * nx;
          if (!main[n] || closed[n] === gen) continue;
          if (di && dj && (!main[i + di + j * nx] || !main[i + (j + dj) * nx])) continue;
          const cost = g[c] + (di && dj ? SQ2 : 1) * (coverH[n] > 0 ? 1.04 : 1);
          if (seen[n] !== gen || cost < g[n]) {
            seen[n] = gen;
            g[n] = cost;
            parent[n] = c;
            fOf[n] = cost + h(n);
            push(n);
          }
        }
    }
    if (!found) return null;
    const cells = [];
    for (let c = t; c >= 0; c = parent[c]) cells.push(c);
    cells.reverse();
    // string pulling
    const pts = cells.map(posOf);
    pts[pts.length - 1] = walkable(cellOf(bx, bz)) ? { x: bx, z: bz } : pts[pts.length - 1];
    const out = [];
    let cur = { x: ax, z: az };
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) {
        if (lineFree(cur.x, cur.z, pts[m].x, pts[m].z)) {
          far = m;
          break;
        }
      }
      out.push(pts[far]);
      cur = pts[far];
      k = far;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }

  const randomCell = (rnd) => mainCells[(rnd() * mainCells.length) | 0];
  const randomCover = (rnd) => (coverCells.length ? coverCells[(rnd() * coverCells.length) | 0] : randomCell(rnd));

  /** cover cells within `r` of (x, z) — sampled, not exhaustive */
  function coverNear(x, z, r, rnd, n = 14) {
    const out = [];
    const ci = Math.floor((x - minX) / CELL);
    const cj = Math.floor((z - minZ) / CELL);
    const R = Math.ceil(r / CELL);
    for (let k = 0; k < n * 4 && out.length < n; k++) {
      const i = ci + Math.round((rnd() * 2 - 1) * R);
      const j = cj + Math.round((rnd() * 2 - 1) * R);
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const c = i + j * nx;
      if (main[c] && coverH[c] >= 1.0) out.push(c);
    }
    return out;
  }

  return { nx, nz, CELL, blocked, main, mainCells, coverCells, coverH, cellOf, posOf, walkable, nearest, lineFree, path, randomCell, randomCover, coverNear, bounds: map.bounds };
}
