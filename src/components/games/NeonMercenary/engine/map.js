/**
 * District map compiler + spatial queries (pure JS, shared by sim and renderer).
 *
 * A district definition (data/districts/*.js) describes its city blocks with an
 * ASCII plan (4 m cells; digits = building height tiers, '=' low wall, 'W' tall
 * wall) plus explicit boxes (props, interiors, platforms). compileMap() turns it
 * into:
 *   boxes    axis-aligned solid boxes {x0,x1,y0,y1,z0,z1,kind,cover}
 *   grid     uniform 8 m bucket grid for collision / raycasts
 *   nav      1 m walkability grid (Uint8) + A* path finding
 *   cover    cover spots beside low boxes (for AI)
 */
import { rayBox, clamp } from "./math.js";

export const CELL = 4; // ASCII cell size (m)
const BUCKET = 8;
export const NAV = 1; // nav cell (m)
export const STEP_H = 0.45;

const tierHeight = (t) => 6 + t * 4.6;

/** Greedy-merge same-character regions of an ASCII plan into rectangles. */
export function planRects(plan, chars) {
  const rows = plan.length;
  const cols = plan[0].length;
  const seen = Array.from({ length: rows }, () => new Uint8Array(cols));
  const out = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const ch = plan[r][c];
      if (seen[r][c] || !chars.includes(ch)) continue;
      let w = 1;
      while (c + w < cols && plan[r][c + w] === ch && !seen[r][c + w]) w++;
      let h = 1;
      outer: while (r + h < rows) {
        for (let k = 0; k < w; k++) if (plan[r + h][c + k] !== ch || seen[r + h][c + k]) break outer;
        h++;
      }
      for (let rr = r; rr < r + h; rr++) for (let k = 0; k < w; k++) seen[rr][c + k] = 1;
      out.push({ c, r, w, h, ch });
    }
  return out;
}

export function compileMap(def) {
  const plan = def.plan;
  const ox = def.origin?.[0] ?? -(plan[0].length * CELL) / 2;
  const oz = def.origin?.[1] ?? -(plan.length * CELL) / 2;
  const boxes = [];
  const buildings = [];
  const add = (b) => {
    const box = { x0: Math.min(b.x0, b.x1), x1: Math.max(b.x0, b.x1), z0: Math.min(b.z0, b.z1), z1: Math.max(b.z0, b.z1), y0: b.y0 ?? 0, y1: b.y1, kind: b.kind || "prop", id: b.id || null, style: b.style, color: b.color, solid: b.solid !== false };
    const h = box.y1 - box.y0;
    box.cover = box.y0 < 0.1 && box.y1 >= 0.95 && box.y1 <= 1.25;
    boxes.push(box);
    return box;
  };
  // ASCII buildings / walls
  const rects = planRects(plan, "123456789=W");
  for (const R of rects) {
    const x0 = ox + R.c * CELL;
    const z0 = oz + R.r * CELL;
    const x1 = x0 + R.w * CELL;
    const z1 = z0 + R.h * CELL;
    if (R.ch === "=") add({ x0, x1, z0: z0 + 1.4, z1: z1 - 1.4, y1: 1.15, kind: "barrier" });
    else if (R.ch === "W") add({ x0, x1, z0, z1, y1: 6, kind: "wall" });
    else {
      const tier = +R.ch;
      const h = tierHeight(tier) + ((R.c * 7 + R.r * 13) % 5) * 1.1;
      const b = add({ x0, x1, z0, z1, y1: h, kind: "building", style: def.buildingStyle });
      b.tier = tier;
      buildings.push(b);
    }
  }
  // explicit boxes: [x0,z0,x1,z1,y1, kind?, y0?] or objects
  for (const b of def.boxes || []) {
    if (Array.isArray(b)) add({ x0: b[0], z0: b[1], x1: b[2], z1: b[3], y1: b[4], kind: b[5] || "prop", y0: b[6] ?? 0 });
    else add(b);
  }
  // world extent (city + interiors)
  let minX = ox;
  let minZ = oz;
  let maxX = ox + plan[0].length * CELL;
  let maxZ = oz + plan.length * CELL;
  for (const b of boxes) {
    minX = Math.min(minX, b.x0 - 2);
    minZ = Math.min(minZ, b.z0 - 2);
    maxX = Math.max(maxX, b.x1 + 2);
    maxZ = Math.max(maxZ, b.z1 + 2);
  }
  for (const a of def.areas || []) {
    minX = Math.min(minX, a.x0 - 2);
    minZ = Math.min(minZ, a.z0 - 2);
    maxX = Math.max(maxX, a.x1 + 2);
    maxZ = Math.max(maxZ, a.z1 + 2);
  }
  const M = {
    def,
    id: def.id,
    origin: [ox, oz],
    cityW: plan[0].length * CELL,
    cityD: plan.length * CELL,
    bounds: { x0: minX, z0: minZ, x1: maxX, z1: maxZ },
    boxes,
    buildings,
    dynamic: [], // boxes that can be toggled (gates, doors)
  };
  buildGrid(M);
  buildNav(M);
  buildCover(M);
  return M;
}

/* ------------------------------------------------------------------ buckets */
function buildGrid(M) {
  const { x0, z0, x1, z1 } = M.bounds;
  const gw = Math.ceil((x1 - x0) / BUCKET) + 1;
  const gd = Math.ceil((z1 - z0) / BUCKET) + 1;
  const cells = Array.from({ length: gw * gd }, () => []);
  M.boxes.forEach((b, i) => {
    const c0 = clamp(Math.floor((b.x0 - x0) / BUCKET), 0, gw - 1);
    const c1 = clamp(Math.floor((b.x1 - x0) / BUCKET), 0, gw - 1);
    const r0 = clamp(Math.floor((b.z0 - z0) / BUCKET), 0, gd - 1);
    const r1 = clamp(Math.floor((b.z1 - z0) / BUCKET), 0, gd - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * gw + c].push(i);
  });
  M.grid = { gw, gd, cells, stamp: new Uint32Array(M.boxes.length), mark: 1 };
}

/** Boxes overlapping the XZ rectangle (deduplicated). Calls fn(box). */
export function forBoxes(M, ax0, az0, ax1, az1, fn) {
  const G = M.grid;
  const { x0, z0 } = M.bounds;
  const c0 = clamp(Math.floor((ax0 - x0) / BUCKET), 0, G.gw - 1);
  const c1 = clamp(Math.floor((ax1 - x0) / BUCKET), 0, G.gw - 1);
  const r0 = clamp(Math.floor((az0 - z0) / BUCKET), 0, G.gd - 1);
  const r1 = clamp(Math.floor((az1 - z0) / BUCKET), 0, G.gd - 1);
  const mark = ++G.mark;
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) {
      const cell = G.cells[r * G.gw + c];
      for (let k = 0; k < cell.length; k++) {
        const i = cell[k];
        if (G.stamp[i] === mark) continue;
        G.stamp[i] = mark;
        const b = M.boxes[i];
        if (!b.solid) continue;
        if (b.x1 < ax0 || b.x0 > ax1 || b.z1 < az0 || b.z0 > az1) continue;
        if (fn(b) === false) return;
      }
    }
}

/**
 * Raycast against static boxes. Returns {t, box, nx, ny, nz} or null.
 * (dx,dy,dz) must be normalised; maxT in metres.
 */
export function raycast(M, ox, oy, oz, dx, dy, dz, maxT, ignoreCover = false) {
  const ix = 1 / (Math.abs(dx) < 1e-9 ? 1e-9 : dx);
  const iy = 1 / (Math.abs(dy) < 1e-9 ? 1e-9 : dy);
  const iz = 1 / (Math.abs(dz) < 1e-9 ? 1e-9 : dz);
  const ex = ox + dx * maxT;
  const ez = oz + dz * maxT;
  let best = maxT;
  let hit = null;
  // walk the bucket rows/cols the segment spans (segments are short: ≤ 150 m)
  const G = M.grid;
  const { x0, z0 } = M.bounds;
  const steps = Math.max(1, Math.ceil(maxT / (BUCKET * 0.5)));
  const mark = ++G.mark;
  let pc = -1;
  let pr = -1;
  for (let s = 0; s <= steps; s++) {
    const f = s / steps;
    const px = ox + (ex - ox) * f;
    const pz = oz + (ez - oz) * f;
    const cc = clamp(Math.floor((px - x0) / BUCKET), 0, G.gw - 1);
    const rr = clamp(Math.floor((pz - z0) / BUCKET), 0, G.gd - 1);
    if (cc === pc && rr === pr) continue;
    pc = cc;
    pr = rr;
    for (let r = rr - 1; r <= rr + 1; r++)
      for (let c = cc - 1; c <= cc + 1; c++) {
        if (r < 0 || c < 0 || r >= G.gd || c >= G.gw) continue;
        const cell = G.cells[r * G.gw + c];
        for (let k = 0; k < cell.length; k++) {
          const i = cell[k];
          if (G.stamp[i] === mark) continue;
          G.stamp[i] = mark;
          const b = M.boxes[i];
          if (!b.solid || (ignoreCover && b.cover)) continue;
          const t = rayBox(ox, oy, oz, ix, iy, iz, b, best);
          if (t >= 0 && t < best) {
            best = t;
            hit = b;
          }
        }
      }
  }
  if (!hit) return null;
  // face normal
  const hx = ox + dx * best;
  const hy = oy + dy * best;
  const hz = oz + dz * best;
  const e = 1e-3;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  if (Math.abs(hx - hit.x0) < e) nx = -1;
  else if (Math.abs(hx - hit.x1) < e) nx = 1;
  else if (Math.abs(hz - hit.z0) < e) nz = -1;
  else if (Math.abs(hz - hit.z1) < e) nz = 1;
  else if (Math.abs(hy - hit.y1) < e) ny = 1;
  else ny = -1;
  return { t: best, box: hit, x: hx, y: hy, z: hz, nx, ny, nz };
}

/** Is the straight segment a→b free of static boxes? */
export function lineOfSight(M, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const L = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (L < 1e-4) return true;
  return !raycast(M, ax, ay, az, dx / L, dy / L, dz / L, L - 0.05);
}

/** Height of the highest walkable top under a circle (≤ maxY), or 0 ground. */
export function groundHeight(M, x, z, r, maxY) {
  let g = 0;
  forBoxes(M, x - r, z - r, x + r, z + r, (b) => {
    if (b.y1 > maxY || b.y1 <= g) return;
    // circle overlaps box footprint (shrunk a bit so edges don't count)
    const cx = clamp(x, b.x0, b.x1);
    const cz = clamp(z, b.z0, b.z1);
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r * 0.35) g = b.y1;
  });
  return g;
}

/**
 * Resolve a circle (feet y .. y+height) against boxes in XZ. Mutates pos.
 * Boxes whose top is within STEP_H of the feet are stepped onto instead.
 */
export function collideCircle(M, pos, r, height, step = STEP_H) {
  let hitWall = false;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    forBoxes(M, pos.x - r, pos.z - r, pos.x + r, pos.z + r, (b) => {
      if (b.y1 <= pos.y + step || b.y0 >= pos.y + height) return;
      const cx = clamp(pos.x, b.x0, b.x1);
      const cz = clamp(pos.z, b.z0, b.z1);
      let dx = pos.x - cx;
      let dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) return;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d);
        pos.z += (dz / d) * (r - d);
      } else {
        // centre inside the box: push out along the smallest axis
        const px0 = pos.x - b.x0;
        const px1 = b.x1 - pos.x;
        const pz0 = pos.z - b.z0;
        const pz1 = b.z1 - pos.z;
        const m = Math.min(px0, px1, pz0, pz1);
        if (m === px0) pos.x = b.x0 - r;
        else if (m === px1) pos.x = b.x1 + r;
        else if (m === pz0) pos.z = b.z0 - r;
        else pos.z = b.z1 + r;
      }
      moved = true;
      hitWall = true;
    });
    if (!moved) break;
  }
  return hitWall;
}

/** Lowest box bottom above the head (ceilings), or Infinity. */
export function ceilingHeight(M, x, z, r, y) {
  let c = Infinity;
  forBoxes(M, x - r, z - r, x + r, z + r, (b) => {
    if (b.y0 > y && b.y0 < c) {
      const cx = clamp(x, b.x0, b.x1);
      const cz = clamp(z, b.z0, b.z1);
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) c = b.y0;
    }
  });
  return c;
}

/* ---------------------------------------------------------------- nav grid */
function buildNav(M) {
  const { x0, z0, x1, z1 } = M.bounds;
  const w = Math.ceil((x1 - x0) / NAV);
  const d = Math.ceil((z1 - z0) / NAV);
  const blocked = new Uint8Array(w * d);
  const inflate = 0.45;
  for (const b of M.boxes) {
    if (!b.solid || b.y0 > 1.6 || b.y1 <= STEP_H) continue;
    const c0 = clamp(Math.floor((b.x0 - inflate - x0) / NAV), 0, w - 1);
    const c1 = clamp(Math.floor((b.x1 + inflate - x0) / NAV), 0, w - 1);
    const r0 = clamp(Math.floor((b.z0 - inflate - z0) / NAV), 0, d - 1);
    const r1 = clamp(Math.floor((b.z1 + inflate - z0) / NAV), 0, d - 1);
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++) {
        const cx = x0 + (c + 0.5) * NAV;
        const cz = z0 + (r + 0.5) * NAV;
        if (cx > b.x0 - inflate && cx < b.x1 + inflate && cz > b.z0 - inflate && cz < b.z1 + inflate) blocked[r * w + c] = 1;
      }
  }
  // areas outside any walkable region are blocked too (city rect + interior areas)
  const areas = [{ x0: M.origin[0], z0: M.origin[1], x1: M.origin[0] + M.cityW, z1: M.origin[1] + M.cityD }, ...(M.def.areas || [])];
  for (let r = 0; r < d; r++)
    for (let c = 0; c < w; c++) {
      const cx = x0 + (c + 0.5) * NAV;
      const cz = z0 + (r + 0.5) * NAV;
      let inside = false;
      for (const a of areas) if (cx > a.x0 && cx < a.x1 && cz > a.z0 && cz < a.z1) inside = true;
      if (!inside) blocked[r * w + c] = 1;
    }
  M.nav = { w, d, x0, z0, blocked, g: new Float32Array(w * d), from: new Int32Array(w * d), open: new Uint32Array(w * d), closed: new Uint32Array(w * d), q: 1, heap: new Int32Array(w * d), f: new Float32Array(w * d) };
}

export function navCell(M, x, z) {
  const N = M.nav;
  const c = Math.floor((x - N.x0) / NAV);
  const r = Math.floor((z - N.z0) / NAV);
  if (c < 0 || r < 0 || c >= N.w || r >= N.d) return -1;
  return r * N.w + c;
}
export const walkable = (M, x, z) => {
  const i = navCell(M, x, z);
  return i >= 0 && !M.nav.blocked[i];
};

/** Nearest walkable cell centre to (x,z) within `rad` cells. */
export function nearestWalkable(M, x, z, rad = 6) {
  const N = M.nav;
  const c0 = Math.floor((x - N.x0) / NAV);
  const r0 = Math.floor((z - N.z0) / NAV);
  for (let k = 0; k <= rad; k++)
    for (let dr = -k; dr <= k; dr++)
      for (let dc = -k; dc <= k; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== k) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= N.w || r >= N.d) continue;
        if (!N.blocked[r * N.w + c]) return { x: N.x0 + (c + 0.5) * NAV, z: N.z0 + (r + 0.5) * NAV, i: r * N.w + c };
      }
  return null;
}

/** Grid-walk test between two points (nav cells). */
export function navClear(M, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.ceil(d / (NAV * 0.5));
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    if (!walkable(M, ax + (bx - ax) * f, az + (bz - az) * f)) return false;
  }
  return true;
}

/**
 * A* on the nav grid (8-connected). Returns a smoothed list of {x,z} waypoints
 * (excluding the start) or null. maxIter bounds the work per request.
 */
export function findPath(M, sx, sz, tx, tz, maxIter = 9000) {
  const N = M.nav;
  let s = nearestWalkable(M, sx, sz, 3);
  let t = nearestWalkable(M, tx, tz, 5);
  if (!s || !t) return null;
  if (navClear(M, sx, sz, t.x, t.z)) return [{ x: t.x, z: t.z }];
  const q = ++N.q;
  const W = N.w;
  const tc = t.i % W;
  const tr = (t.i / W) | 0;
  const H = (i) => {
    const dc = Math.abs((i % W) - tc);
    const dr = Math.abs(((i / W) | 0) - tr);
    return Math.max(dc, dr) + 0.414 * Math.min(dc, dr);
  };
  // binary heap of cell indices keyed by f
  const heap = N.heap;
  let hn = 0;
  const push = (i) => {
    let k = hn++;
    heap[k] = i;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (N.f[heap[p]] <= N.f[heap[k]]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    heap[0] = heap[--hn];
    let k = 0;
    for (;;) {
      const l = 2 * k + 1;
      const r = l + 1;
      let m = k;
      if (l < hn && N.f[heap[l]] < N.f[heap[m]]) m = l;
      if (r < hn && N.f[heap[r]] < N.f[heap[m]]) m = r;
      if (m === k) break;
      [heap[m], heap[k]] = [heap[k], heap[m]];
      k = m;
    }
    return top;
  };
  N.g[s.i] = 0;
  N.f[s.i] = H(s.i);
  N.from[s.i] = -1;
  N.open[s.i] = q;
  push(s.i);
  let found = false;
  let iter = 0;
  const DC = [1, -1, 0, 0, 1, 1, -1, -1];
  const DR = [0, 0, 1, -1, 1, -1, 1, -1];
  while (hn > 0 && iter++ < maxIter) {
    const cur = pop();
    if (N.closed[cur] === q) continue;
    N.closed[cur] = q;
    if (cur === t.i) {
      found = true;
      break;
    }
    const cc = cur % W;
    const cr = (cur / W) | 0;
    for (let k = 0; k < 8; k++) {
      const nc = cc + DC[k];
      const nr = cr + DR[k];
      if (nc < 0 || nr < 0 || nc >= W || nr >= N.d) continue;
      const ni = nr * W + nc;
      if (N.blocked[ni] || N.closed[ni] === q) continue;
      if (k >= 4 && (N.blocked[cr * W + nc] || N.blocked[nr * W + cc])) continue; // no corner cutting
      const g = N.g[cur] + (k < 4 ? 1 : 1.414);
      if (N.open[ni] === q && g >= N.g[ni]) continue;
      N.open[ni] = q;
      N.g[ni] = g;
      N.f[ni] = g + H(ni);
      N.from[ni] = cur;
      push(ni);
    }
  }
  if (!found) return null;
  const cells = [];
  for (let i = t.i; i !== -1 && i !== s.i; i = N.from[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => ({ x: N.x0 + ((i % W) + 0.5) * NAV, z: N.z0 + (((i / W) | 0) + 0.5) * NAV }));
  // string-pull
  const out = [];
  let ax = sx;
  let az = sz;
  let k = 0;
  while (k < pts.length) {
    let far = k;
    for (let j = pts.length - 1; j > k; j--)
      if (navClear(M, ax, az, pts[j].x, pts[j].z)) {
        far = j;
        break;
      }
    out.push(pts[far]);
    ax = pts[far].x;
    az = pts[far].z;
    k = far + 1;
    if (out.length > 60) break;
  }
  return out;
}

/* ---------------------------------------------------------------- cover */
function buildCover(M) {
  const spots = [];
  for (const b of M.boxes) {
    if (!b.cover) continue;
    const sides = [
      [b.x0 - 0.75, null, -1, 0],
      [b.x1 + 0.75, null, 1, 0],
      [null, b.z0 - 0.75, 0, -1],
      [null, b.z1 + 0.75, 0, 1],
    ];
    for (const [sx, sz, nx, nz] of sides) {
      const len = sx === null ? b.x1 - b.x0 : b.z1 - b.z0;
      const n = Math.max(1, Math.round(len / 1.6));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const x = sx === null ? b.x0 + (b.x1 - b.x0) * f : sx;
        const z = sz === null ? b.z0 + (b.z1 - b.z0) * f : sz;
        if (walkable(M, x, z)) spots.push({ x, z, nx, nz, box: b, taken: null });
      }
    }
  }
  M.cover = spots;
}

/** Open / close a dynamic gate box by id (rebuilds the nav grid if it changed). */
export function setGate(M, id, open) {
  let changed = false;
  for (const b of M.boxes)
    if (b.id === id && b.kind === "gate" && b.solid === !!open) {
      b.solid = !open;
      changed = true;
    }
  if (changed) buildNav(M);
  return changed;
}
