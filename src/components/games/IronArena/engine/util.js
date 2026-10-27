/**
 * Iron Arena — small math helpers shared by the simulation (no Three.js, so
 * the whole engine runs headless under node for the sim tests).
 *
 * Orientation convention matches THREE.Euler order "YXZ": a hull with
 * (yaw, pitch, roll) has rotation R = Ry(yaw)·Rx(pitch)·Rz(roll). Local +Z is
 * forward, +Y up, +X the tank's LEFT side. Positive pitch tips the nose down.
 */

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
/** wrap an angle to (-π, π] */
export function wrap(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}
/** move angle `a` toward `b` by at most `step` (radians) */
export function approachAngle(a, b, step) {
  const d = wrap(b - a);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}
export function approach(a, b, step) {
  if (a < b) return Math.min(b, a + step);
  return Math.max(b, a - step);
}
/** frame-rate independent exponential damping factor */
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

/* ------------------------------------------------------------------ rng */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < 0.5 ? -1 : 1);
  return r;
}

/* ------------------------------------------------------------------ noise */
function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** smooth value noise in [0,1] */
export function vnoise(x, z, seed = 1) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
/** fractal noise in roughly [-1,1] */
export function fbm(x, z, seed = 1, oct = 4, gain = 0.5, lac = 2) {
  let amp = 1;
  let f = 1;
  let sum = 0;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    sum += (vnoise(x * f, z * f, seed + o * 17) * 2 - 1) * amp;
    tot += amp;
    amp *= gain;
    f *= lac;
  }
  return sum / tot;
}
/** point-symmetric fractal noise: f(x,z) = f(−x,−z), keeps both team halves identical */
export function sfbm(x, z, seed = 1, oct = 4) {
  return (fbm(x, z, seed, oct) + fbm(-x, -z, seed, oct)) * 0.7;
}
/** ridged noise in [0,1] (sharp crests — dunes, mountain ridges) */
export function ridge(x, z, seed = 1, oct = 4) {
  let amp = 1;
  let f = 1;
  let sum = 0;
  let tot = 0;
  for (let o = 0; o < oct; o++) {
    const n = 1 - Math.abs(vnoise(x * f, z * f, seed + o * 31) * 2 - 1);
    sum += n * n * amp;
    tot += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / tot;
}

/* ------------------------------------------------------------------ rotation (YXZ) */
/** R·v for R = Ry(yaw)·Rx(pitch)·Rz(roll); writes into out */
export function rotYXZ(yaw, pitch, roll, vx, vy, vz, out) {
  // Rz(roll)
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  let x = vx * cr - vy * sr;
  let y = vx * sr + vy * cr;
  let z = vz;
  // Rx(pitch)
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = y * cp - z * sp;
  const z2 = y * sp + z * cp;
  y = y2;
  z = z2;
  // Ry(yaw)
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  out.x = x * cy + z * sy;
  out.y = y;
  out.z = -x * sy + z * cy;
  return out;
}
/** Rᵀ·v (world → hull local) */
export function unrotYXZ(yaw, pitch, roll, vx, vy, vz, out) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  let x = vx * cy - vz * sy;
  let z = vx * sy + vz * cy;
  let y = vy;
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const y2 = y * cp + z * sp;
  const z2 = -y * sp + z * cp;
  y = y2;
  z = z2;
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  out.x = x * cr + y * sr;
  out.y = -x * sr + y * cr;
  out.z = z;
  return out;
}

/** distance from point p to segment ab in 2D (xz) */
export function segDist2D(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const L = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / L, 0, 1);
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
