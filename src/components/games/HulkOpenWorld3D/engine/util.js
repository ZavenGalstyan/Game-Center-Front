/**
 * Hulk: Open World 3D — tiny framework-free math helpers shared by the sim
 * (Node-testable) and the renderer.
 */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;
/** wrap an angle to (-π, π] */
export function wrapA(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
/** damp an angle the short way round */
export const dampA = (cur, target, rate, dt) => cur + wrapA(target - cur) * (1 - Math.exp(-rate * dt));
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const hyp = Math.hypot;

/** deterministic PRNG (mulberry32) */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

/** heading (rad) of a direction on the ground: forward = (sin h, cos h) */
export const headingOf = (dx, dz) => Math.atan2(dx, dz);
