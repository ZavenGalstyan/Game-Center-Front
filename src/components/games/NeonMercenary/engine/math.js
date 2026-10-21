/** Small math helpers shared by the simulation (no Three.js — runs in node). */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

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
export const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

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
  return f;
}

/** Yaw (radians, 0 = +Z, π/2 = +X) of a direction. */
export const yawOf = (dx, dz) => Math.atan2(dx, dz);
/** Direction vector for camera yaw/pitch (yaw 0 looks toward +Z). */
export function dirFromYawPitch(yaw, pitch, out = { x: 0, y: 0, z: 0 }) {
  const c = Math.cos(pitch);
  out.x = Math.sin(yaw) * c;
  out.y = Math.sin(pitch);
  out.z = Math.cos(yaw) * c;
  return out;
}

/** Ray vs vertical cylinder (characters). Returns t or -1. */
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cz, r, y0, y1, maxT) {
  const fx = ox - cx;
  const fz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) {
    // vertical ray
    if (fx * fx + fz * fz > r * r) return -1;
    return -1;
  }
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxT) return -1;
  const y = oy + dy * t;
  if (y < y0 || y > y1) {
    // could still enter through the cap region — test the far intersection
    const t2 = (-b + sq) / (2 * a);
    if (t2 < 0 || t2 > maxT) return -1;
    const y2 = oy + dy * t2;
    if ((y < y0 && y2 >= y0) || (y > y1 && y2 <= y1)) {
      const tc = ((y < y0 ? y0 : y1) - oy) / dy;
      return tc >= 0 && tc <= maxT ? tc : -1;
    }
    return -1;
  }
  return t;
}

/** Ray vs AABB (slab). Returns entry t (≥0) or -1. */
export function rayBox(ox, oy, oz, ix, iy, iz, b, maxT) {
  let t0 = 0;
  let t1 = maxT;
  let tx0 = (b.x0 - ox) * ix;
  let tx1 = (b.x1 - ox) * ix;
  if (tx0 > tx1) [tx0, tx1] = [tx1, tx0];
  t0 = Math.max(t0, tx0);
  t1 = Math.min(t1, tx1);
  if (t0 > t1) return -1;
  let ty0 = (b.y0 - oy) * iy;
  let ty1 = (b.y1 - oy) * iy;
  if (ty0 > ty1) [ty0, ty1] = [ty1, ty0];
  t0 = Math.max(t0, ty0);
  t1 = Math.min(t1, ty1);
  if (t0 > t1) return -1;
  let tz0 = (b.z0 - oz) * iz;
  let tz1 = (b.z1 - oz) * iz;
  if (tz0 > tz1) [tz0, tz1] = [tz1, tz0];
  t0 = Math.max(t0, tz0);
  t1 = Math.min(t1, tz1);
  if (t0 > t1) return -1;
  return t0;
}
