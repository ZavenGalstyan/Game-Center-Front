/**
 * Hulk: Open World 3D — ground navigation for enemies (framework-free).
 *
 * A 4 m occupancy grid over the whole city built from the static colliders
 * (anything at walking height blocks; roof slabs high above the floor do
 * not) plus deep water. `big` is the same grid dilated one cell for heavy
 * robots and armoured vehicles. findPath() is A* (octile, binary heap) with
 * a node budget, then string-pulled with grid line-of-sight so units walk
 * straight lines between corners instead of zig-zagging.
 */
import { BOUNDS } from "./city.js";

export const NCELL = 4;
const O = BOUNDS.min;
export const NDIM = Math.ceil((BOUNDS.max - BOUNDS.min) / NCELL);

let NAV = null;
export function getNav(city) {
  if (NAV && NAV.city === city) return NAV;
  const walk = new Uint8Array(NDIM * NDIM);
  for (const b of city.boxes) {
    if (b.ramp) continue;
    if (b.y0 > 2.2) continue; // roof slabs, decks, canopies: walk under
    if (b.kind === "deck" && b.y1 <= 0.05) continue; // bridges are walkable
    if (b.kind === "pier") continue;
    if (b.y1 - Math.max(0, b.y0) < 0.9) continue;
    const i0 = Math.max(0, Math.floor((b.x0 - O + 0.6) / NCELL));
    const i1 = Math.min(NDIM - 1, Math.floor((b.x1 - O - 0.6) / NCELL));
    const j0 = Math.max(0, Math.floor((b.z0 - O + 0.6) / NCELL));
    const j1 = Math.min(NDIM - 1, Math.floor((b.z1 - O - 0.6) / NCELL));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) walk[j * NDIM + i] = 1;
  }
  for (let j = 0; j < NDIM; j++) {
    for (let i = 0; i < NDIM; i++) {
      const x = O + (i + 0.5) * NCELL;
      const z = O + (j + 0.5) * NCELL;
      if (city.water(x, z)) walk[j * NDIM + i] = 1;
      if (x < 2 || z < 2 || x > city.size - 2 || z > city.size - 2) {
        // outer ring road is fine, beyond it is not
        if (x < -8 || z < -8 || x > city.size + 8 || z > city.size + 8) walk[j * NDIM + i] = 1;
      }
    }
  }
  const big = new Uint8Array(walk);
  for (let j = 1; j < NDIM - 1; j++) {
    for (let i = 1; i < NDIM - 1; i++) {
      if (walk[j * NDIM + i]) continue;
      for (let dj = -1; dj <= 1 && !big[j * NDIM + i]; dj++) for (let di = -1; di <= 1; di++) if (walk[(j + dj) * NDIM + i + di]) big[j * NDIM + i] = 1;
    }
  }
  NAV = { city, walk, big, findPath, cellOf, centre, blocked, nearestFree, lineClear };
  return NAV;
}

export const cellOf = (x, z) => [Math.floor((x - O) / NCELL), Math.floor((z - O) / NCELL)];
export const centre = (i, j) => [O + (i + 0.5) * NCELL, O + (j + 0.5) * NCELL];
function blocked(grid, i, j) {
  return i < 0 || j < 0 || i >= NDIM || j >= NDIM || grid[j * NDIM + i] === 1;
}
/** nearest free cell to (x, z) within `rad` cells (spiral search) */
function nearestFree(grid, x, z, rad = 6) {
  const [ci, cj] = cellOf(x, z);
  if (!blocked(grid, ci, cj)) return [ci, cj];
  for (let r = 1; r <= rad; r++) {
    for (let di = -r; di <= r; di++) {
      for (const dj of [-r, r]) if (!blocked(grid, ci + di, cj + dj)) return [ci + di, cj + dj];
    }
    for (let dj = -r + 1; dj < r; dj++) {
      for (const di of [-r, r]) if (!blocked(grid, ci + di, cj + dj)) return [ci + di, cj + dj];
    }
  }
  return null;
}
/** supercover grid line of sight */
function lineClear(grid, i0, j0, i1, j1) {
  let di = Math.abs(i1 - i0);
  let dj = Math.abs(j1 - j0);
  const si = i0 < i1 ? 1 : -1;
  const sj = j0 < j1 ? 1 : -1;
  let i = i0;
  let j = j0;
  let err = di - dj;
  for (let n = 0; n < 400; n++) {
    if (blocked(grid, i, j)) return false;
    if (i === i1 && j === j1) return true;
    const e2 = 2 * err;
    if (e2 > -dj && e2 < di) {
      // diagonal step: both orthogonal neighbours must be open (no corner cutting)
      if (blocked(grid, i + si, j) || blocked(grid, i, j + sj)) return false;
    }
    if (e2 > -dj) {
      err -= dj;
      i += si;
    }
    if (e2 < di) {
      err += di;
      j += sj;
    }
  }
  return false;
}

/* binary heap keyed by f */
const heapF = new Float32Array(NDIM * NDIM);
const gCost = new Float32Array(NDIM * NDIM);
const came = new Int32Array(NDIM * NDIM);
const seen = new Uint32Array(NDIM * NDIM);
const closed = new Uint32Array(NDIM * NDIM);
let gen = 1;
const heap = [];
function push(n) {
  heap.push(n);
  let k = heap.length - 1;
  while (k > 0) {
    const p = (k - 1) >> 1;
    if (heapF[heap[p]] <= heapF[n]) break;
    heap[k] = heap[p];
    k = p;
  }
  heap[k] = n;
}
function pop() {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      if (l >= heap.length) break;
      const r = l + 1;
      const c = r < heap.length && heapF[heap[r]] < heapF[heap[l]] ? r : l;
      if (heapF[heap[c]] >= heapF[last]) break;
      heap[k] = heap[c];
      k = c;
    }
    heap[k] = last;
  }
  return top;
}

/**
 * A* from (ax, az) to (bx, bz) on `grid`. Returns waypoints [[x,z], …]
 * (string-pulled, ending at the goal) or null. budget = max expansions;
 * when it runs out the path to the closest node found is returned.
 */
function findPath(grid, ax, az, bx, bz, budget = 2500) {
  const s = nearestFree(grid, ax, az, 3);
  const t = nearestFree(grid, bx, bz, 5);
  if (!s || !t) return null;
  const S = s[1] * NDIM + s[0];
  const T = t[1] * NDIM + t[0];
  const [gi0, gj0] = cellOf(bx, bz);
  const goal = gi0 === t[0] && gj0 === t[1] ? [bx, bz] : centre(t[0], t[1]);
  if (S === T) return [goal];
  if (lineClear(grid, s[0], s[1], t[0], t[1])) return [goal];
  gen++;
  heap.length = 0;
  gCost[S] = 0;
  seen[S] = gen;
  came[S] = -1;
  const h = (n) => {
    const dx = Math.abs((n % NDIM) - t[0]);
    const dz = Math.abs(((n / NDIM) | 0) - t[1]);
    return (dx + dz - 0.586 * Math.min(dx, dz)) * 1.02;
  };
  heapF[S] = h(S);
  push(S);
  let best = S;
  let bestH = heapF[S];
  let found = false;
  let exp = 0;
  while (heap.length) {
    const n = pop();
    if (closed[n] === gen) continue;
    closed[n] = gen;
    if (n === T) {
      found = true;
      break;
    }
    if (++exp > budget) break;
    const ni = n % NDIM;
    const nj = (n / NDIM) | 0;
    const hn = h(n);
    if (hn < bestH) {
      bestH = hn;
      best = n;
    }
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ni + di;
        const j = nj + dj;
        if (blocked(grid, i, j)) continue;
        if (di && dj && (blocked(grid, ni + di, nj) || blocked(grid, ni, nj + dj))) continue;
        const m = j * NDIM + i;
        if (closed[m] === gen) continue;
        const g = gCost[n] + (di && dj ? 1.414 : 1);
        if (seen[m] !== gen || g < gCost[m]) {
          seen[m] = gen;
          gCost[m] = g;
          came[m] = n;
          heapF[m] = g + h(m);
          push(m);
        }
      }
    }
  }
  let end = found ? T : best;
  const cells = [];
  for (let n = end, k = 0; n !== -1 && k < 5000; n = came[n], k++) cells.push(n);
  cells.reverse();
  // string pulling
  const out = [];
  let a = 0;
  while (a < cells.length - 1) {
    let b = cells.length - 1;
    const ai = cells[a] % NDIM;
    const aj = (cells[a] / NDIM) | 0;
    while (b > a + 1 && !lineClear(grid, ai, aj, cells[b] % NDIM, (cells[b] / NDIM) | 0)) b--;
    out.push(centre(cells[b] % NDIM, (cells[b] / NDIM) | 0));
    a = b;
  }
  const [gi, gj] = cellOf(bx, bz);
  if (found && gi === t[0] && gj === t[1]) {
    if (out.length) out[out.length - 1] = [bx, bz];
    else out.push([bx, bz]);
  }
  return out.length ? out : null;
}
