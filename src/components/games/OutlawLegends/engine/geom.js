/**
 * Geometry helpers for the sim: axis-aligned obstacle boxes (x/z centre,
 * w/d footprint, y0..h height), circle-vs-box push-out, 3D ray casts against
 * boxes / cylinders / spheres, and a coarse walkability grid with A* for the
 * enemy AI. No Three.js — the same code runs in Node for the test bots.
 */

export const boxMin = (b) => [b.x - b.w / 2, b.y0 || 0, b.z - b.d / 2];
export const boxMax = (b) => [b.x + b.w / 2, b.h, b.z + b.d / 2];

/** Push circle (x,z,r) out of every box it overlaps (feet at y). Returns {x,z,hit}. */
export function collideCircle(x, z, r, y, obs) {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < obs.length; i++) {
      const b = obs[i];
      if (b.nocol) continue;
      if (y >= b.h - 0.05 || y + 1.7 <= (b.y0 || 0)) continue;
      const hw = b.w / 2, hd = b.d / 2;
      const cx = Math.max(b.x - hw, Math.min(x, b.x + hw));
      const cz = Math.max(b.z - hd, Math.min(z, b.z + hd));
      let dx = x - cx, dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * r;
        z = cz + (dz / d) * r;
      } else {
        // centre inside the box: leave by the nearest face
        const px = hw - Math.abs(x - b.x), pz = hd - Math.abs(z - b.z);
        if (px < pz) x = b.x + Math.sign(x - b.x || 1) * (hw + r);
        else z = b.z + Math.sign(z - b.z || 1) * (hd + r);
      }
    }
  }
  return { x, z, hit };
}

/** Ray (o + t·d) vs box slab test; returns entry t in [0, tmax] or Infinity, plus face normal. */
export function rayBox(ox, oy, oz, dx, dy, dz, b, tmax) {
  let t0 = 0, t1 = tmax, n = 0;
  const mn = [b.x - b.w / 2, b.y0 || 0, b.z - b.d / 2];
  const mx = [b.x + b.w / 2, b.h, b.z + b.d / 2];
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < mn[a] || o[a] > mx[a]) return { t: Infinity, n: 0 };
      continue;
    }
    const inv = 1 / d[a];
    let ta = (mn[a] - o[a]) * inv, tb = (mx[a] - o[a]) * inv;
    let face = a * 2;
    if (ta > tb) {
      const s = ta;
      ta = tb;
      tb = s;
      face = a * 2 + 1;
    }
    if (ta > t0) {
      t0 = ta;
      n = face;
    }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return { t: Infinity, n: 0 };
  }
  return { t: t0, n };
}

/** First obstacle hit along a ray. skip(b) may exclude boxes. */
export function rayObstacles(ox, oy, oz, dx, dy, dz, obs, tmax, skip) {
  let best = tmax, hitB = null, hitN = 0;
  for (let i = 0; i < obs.length; i++) {
    const b = obs[i];
    if (b.noray || (skip && skip(b))) continue;
    const r = rayBox(ox, oy, oz, dx, dy, dz, b, best);
    if (r.t < best) {
      best = r.t;
      hitB = b;
      hitN = r.n;
    }
  }
  // ground plane
  if (dy < -1e-6) {
    const tg = -oy / dy;
    if (tg >= 0 && tg < best) {
      best = tg;
      hitB = "ground";
      hitN = 2;
    }
  }
  return { t: best, b: hitB, n: hitN };
}

/** Is the straight segment a→b blocked by an obstacle? Returns hit fraction or -1. */
export function segmentBlocked(ax, ay, az, bx, by, bz, obs, skip) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return -1;
  const r = rayObstacles(ax, ay, az, dx / len, dy / len, dz / len, obs, len, skip);
  if (r.b && r.b !== "ground" && r.t < len - 0.05) return r.t / len;
  return -1;
}

/** Ray vs vertical cylinder (x,z,r, y0..y1). */
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1, tmax) {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return Infinity;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
    if (t < 0 || t > tmax) continue;
    const y = oy + dy * t;
    if (y >= y0 && y <= y1) return t;
  }
  return Infinity;
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, tmax) {
  const fx = ox - cx, fy = oy - cy, fz = oz - cz;
  const b = fx * dx + fy * dy + fz * dz;
  const c = fx * fx + fy * fy + fz * fz - r * r;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const t = -b - Math.sqrt(disc);
  return t >= 0 && t <= tmax ? t : Infinity;
}

/* ------------------------------------------------------------------ nav grid */
export const CELL = 1;

export function buildGrid(bounds, obs, inflate = 0.42) {
  const [x0, z0, x1, z1] = bounds;
  const W = Math.ceil((x1 - x0) / CELL), H = Math.ceil((z1 - z0) / CELL);
  const g = new Uint8Array(W * H);
  for (const b of obs) {
    if (b.nocol || b.h < 0.3 || (b.y0 || 0) > 1.5) continue;
    const ax = Math.floor((b.x - b.w / 2 - inflate - x0) / CELL), bx = Math.floor((b.x + b.w / 2 + inflate - x0) / CELL);
    const az = Math.floor((b.z - b.d / 2 - inflate - z0) / CELL), bz = Math.floor((b.z + b.d / 2 + inflate - z0) / CELL);
    for (let j = Math.max(0, az); j <= Math.min(H - 1, bz); j++)
      for (let i = Math.max(0, ax); i <= Math.min(W - 1, bx); i++) {
        // only block cells whose centre is really inside the inflated box
        const cx = x0 + (i + 0.5) * CELL, cz = z0 + (j + 0.5) * CELL;
        if (Math.abs(cx - b.x) <= b.w / 2 + inflate && Math.abs(cz - b.z) <= b.d / 2 + inflate) g[j * W + i] = 1;
      }
  }
  // border
  for (let i = 0; i < W; i++) g[i] = g[(H - 1) * W + i] = 1;
  for (let j = 0; j < H; j++) g[j * W] = g[j * W + W - 1] = 1;
  return { x0, z0, W, H, g };
}

export function cellOf(G, x, z) {
  return [Math.floor((x - G.x0) / CELL), Math.floor((z - G.z0) / CELL)];
}
export function cellCenter(G, i, j) {
  return [G.x0 + (i + 0.5) * CELL, G.z0 + (j + 0.5) * CELL];
}
export function walkable(G, i, j) {
  return i >= 0 && j >= 0 && i < G.W && j < G.H && !G.g[j * G.W + i];
}

/** Nearest walkable cell to (i,j) within a small radius. */
export function nearestFree(G, i, j, maxR = 6, px = null, pz = null) {
  if (walkable(G, i, j)) return [i, j];
  const wx = px ?? G.x0 + (i + 0.5) * CELL, wz = pz ?? G.z0 + (j + 0.5) * CELL;
  for (let r = 1; r <= maxR; r++) {
    let best = null, bd = Infinity;
    // look one ring further too: a diagonal cell can be farther than the next ring's straight one
    for (let rr = r; rr <= Math.min(maxR, r + 1); rr++)
      for (let dj = -rr; dj <= rr; dj++)
        for (let di = -rr; di <= rr; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== rr) continue;
          if (!walkable(G, i + di, j + dj)) continue;
          const [cx, cz] = cellCenter(G, i + di, j + dj);
          const d = (cx - wx) ** 2 + (cz - wz) ** 2;
          if (d < bd) {
            bd = d;
            best = [i + di, j + dj];
          }
        }
    if (best) return best;
  }
  return null;
}

/** Grid-only straight walk test (Bresenham-ish sampling). */
export function gridLine(G, ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.ceil(d / (CELL * 0.4)));
  for (let k = 1; k <= n; k++) {
    const [i, j] = cellOf(G, ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    if (!walkable(G, i, j)) return false;
  }
  return true;
}

// binary heap keyed by f
class Heap {
  constructor() {
    this.a = [];
    this.f = [];
  }
  push(v, f) {
    const a = this.a, F = this.f;
    a.push(v);
    F.push(f);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= F[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [F[p], F[i]] = [F[i], F[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, F = this.f;
    const top = a[0];
    const lv = a.pop(), lf = F.pop();
    if (a.length) {
      a[0] = lv;
      F[0] = lf;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && F[l] < F[m]) m = l;
        if (r < a.length && F[r] < F[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [F[m], F[i]] = [F[i], F[m]];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

/** A* from world point to world point; returns smoothed waypoints [[x,z],…] or null. */
export function findPath(G, sx, sz, tx, tz, maxNodes = 4000) {
  let s = cellOf(G, sx, sz);
  let t = cellOf(G, tx, tz);
  s = nearestFree(G, s[0], s[1], 6, sx, sz);
  t = nearestFree(G, t[0], t[1], 6, tx, tz);
  if (!s || !t) return null;
  const W = G.W;
  const si = s[1] * W + s[0], ti = t[1] * W + t[0];
  if (si === ti) return [[tx, tz]];
  const gS = new Float32Array(W * G.H).fill(Infinity);
  const from = new Int32Array(W * G.H).fill(-1);
  const closed = new Uint8Array(W * G.H);
  const h = (i) => {
    const x = i % W, z = (i / W) | 0;
    const dx = Math.abs(x - t[0]), dz = Math.abs(z - t[1]);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  const open = new Heap();
  gS[si] = 0;
  open.push(si, h(si));
  let n = 0;
  let found = false;
  while (open.size && n++ < maxNodes) {
    const c = open.pop();
    if (c === ti) {
      found = true;
      break;
    }
    if (closed[c]) continue;
    closed[c] = 1;
    const cx = c % W, cz = (c / W) | 0;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!walkable(G, nx, nz)) continue;
        if (dx && dz && (!walkable(G, cx + dx, cz) || !walkable(G, cx, cz + dz))) continue;
        const ni = nz * W + nx;
        if (closed[ni]) continue;
        const ng = gS[c] + (dx && dz ? 1.414 : 1);
        if (ng < gS[ni]) {
          gS[ni] = ng;
          from[ni] = c;
          open.push(ni, ng + h(ni));
        }
      }
  }
  if (!found) return null;
  const cells = [];
  for (let c = ti; c !== -1; c = from[c]) cells.push(c);
  cells.reverse();
  const pts = cells.map((c) => cellCenter(G, c % W, (c / W) | 0));
  pts[pts.length - 1] = [tx, tz];
  // string-pull
  const out = [];
  let a = [sx, sz];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !gridLine(G, a[0], a[1], pts[j][0], pts[j][1])) j--;
    out.push(pts[j]);
    a = pts[j];
    i = j;
  }
  if (!out.length) out.push(pts[pts.length - 1]);
  return out;
}

/** Is every target reachable from (sx,sz)? Flood fill — used by the validator. */
export function reachable(G, sx, sz) {
  const s = nearestFree(G, ...cellOf(G, sx, sz));
  const seen = new Uint8Array(G.W * G.H);
  if (!s) return seen;
  const q = [s[1] * G.W + s[0]];
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.pop();
    const cx = c % G.W, cz = (c / G.W) | 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, nz = cz + dz;
      if (!walkable(G, nx, nz)) continue;
      const ni = nz * G.W + nx;
      if (!seen[ni]) {
        seen[ni] = 1;
        q.push(ni);
      }
    }
  }
  return seen;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
/** Facing angle (Three.js rotation.y) that looks along (dx, dz). */
export const faceAngle = (dx, dz) => Math.atan2(-dx, -dz);

/** Small seeded RNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
