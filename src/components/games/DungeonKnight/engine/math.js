/**
 * Dungeon Knight — small maths helpers shared by the engine, the renderer and
 * the Node tools. No three.js here.
 *
 * Conventions (same as three.js with Y up):
 *   yaw 0 faces +Z; forward(yaw) = (sin yaw, cos yaw)
 *   a character's RIGHT is (-cos yaw, sin yaw)  (local −X when facing +Z)
 *   local frame (r, u, f) = right, up, forward
 */
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t) => 1 - (1 - clamp(t, 0, 1)) ** 3;
export const easeIn = (t) => clamp(t, 0, 1) ** 2;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

/** wrap an angle to (-π, π] */
export function wrap(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a <= -Math.PI) a += TAU;
  return a;
}
export const angleDiff = (a, b) => wrap(b - a);

/** rotate `a` toward `b` by at most `maxStep` radians */
export function turnToward(a, b, maxStep) {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= maxStep) return wrap(b);
  return wrap(a + Math.sign(d) * maxStep);
}

export const yawTo = (fx, fz, tx, tz) => Math.atan2(tx - fx, tz - fz);
export const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

/** local (r, u, f) → world, for a body at (x, y, z) facing yaw */
export function localToWorld(x, y, z, yaw, r, u, f, out = [0, 0, 0]) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  out[0] = x - c * r + s * f;
  out[1] = y + u;
  out[2] = z + s * r + c * f;
  return out;
}
export function dirToWorld(yaw, r, u, f, out = [0, 0, 0]) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  out[0] = -c * r + s * f;
  out[1] = u;
  out[2] = s * r + c * f;
  return out;
}

/** Is world point (px, pz) within ±halfArc of `yaw` as seen from (x, z)? */
export function inArc(x, z, yaw, px, pz, halfArc) {
  return Math.abs(angleDiff(yaw, yawTo(x, z, px, pz))) <= halfArc;
}

/** Deterministic PRNG (mulberry32) — loot and spawn jitter are reproducible. */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);
