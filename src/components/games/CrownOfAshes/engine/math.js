/** Math, noise and PRNG helpers shared by the simulation (no Three.js — runs in node). */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Wrap an angle to (-π, π]. */
export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
/** Move angle `a` toward `b` by at most `step` radians. */
export function approachAngle(a, b, step) {
  const d = wrapAngle(b - a);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}
export function approach(v, target, step) {
  if (v < target) return Math.min(target, v + step);
  return Math.max(target, v - step);
}
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

/** Yaw (radians, 0 = +Z, π/2 = +X) of a direction. */
export const yawOf = (dx, dz) => Math.atan2(dx, dz);

/** Deterministic PRNG (mulberry32). */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.state = () => s;
  f.setState = (v) => (s = v >>> 0);
  return f;
}

/* ------------------------------------------------------------- value noise */
function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth 2D value noise in [0,1]. */
export function vnoise(x, z, seed = 0) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
/** Fractal noise in roughly [-1,1]. */
export function fbm(x, z, oct = 4, seed = 0) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += (vnoise(x * f, z * f, seed + i * 17) * 2 - 1) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
/** Ridged noise in [0,1] (sharp crests — mountains). */
export function ridged(x, z, oct = 4, seed = 0) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(vnoise(x * f, z * f, seed + i * 31) * 2 - 1);
    s += v * v * a;
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return s / n;
}
export const hash01 = (i, seed = 7) => hash2(i, i * 7 + 3, seed);

/* ------------------------------------------------------------- polylines */
/** Distance from point to segment, plus the param t along it. */
export function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1e-9;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t;
  const qz = az + dz * t;
  return { d: Math.hypot(px - qx, pz - qz), t };
}
/** Closest point on a polyline [[x,z],…]: {d, i (segment), t, s (arc length)}. */
export function polyDist(px, pz, pts) {
  let best = { d: Infinity, i: 0, t: 0, s: 0 };
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const r = segDist(px, pz, a[0], a[1], b[0], b[1]);
    if (r.d < best.d) best = { d: r.d, i, t: r.t, s: acc + r.t * L };
    acc += L;
  }
  return best;
}
/** Catmull-Rom resample of a polyline to roughly `step` metre spacing. */
export function smoothPath(pts, step = 6) {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), p1[2] != null ? lerp(p1[2], p2[2], t) : undefined, i, t]);
    }
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1], last[2], pts.length - 2, 1]);
  return out;
}
