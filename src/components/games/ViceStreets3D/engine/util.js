/**
 * Vice Streets 3D — small framework-free math helpers shared by the engine
 * (Node-testable) and the renderer.
 *
 * Ground convention: x = east, z = south, y = up. A heading h faces
 * (sin h, cos h); increasing h turns LEFT (counter-clockwise seen from above
 * with north up), so "steer right" lowers the heading.
 */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const smoothstep = (e0, e1, x) => smooth((x - e0) / (e1 - e0));
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const TAU = Math.PI * 2;
export function wrapA(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export const dampA = (cur, target, rate, dt) => cur + wrapA(target - cur) * (1 - Math.exp(-rate * dt));
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);
export const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
export const headingOf = (dx, dz) => Math.atan2(dx, dz);
export const fwdX = (h) => Math.sin(h);
export const fwdZ = (h) => Math.cos(h);
/** unit vector to the right of a heading */
export const rightX = (h) => -Math.cos(h);
export const rightZ = (h) => Math.sin(h);

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

/** closest point on segment ab to p → { t, x, z, d2 } */
export function segClosest(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const L2 = dx * dx + dz * dz || 1e-9;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / L2, 0, 1);
  const x = ax + dx * t;
  const z = az + dz * t;
  return { t, x, z, d2: (px - x) * (px - x) + (pz - z) * (pz - z) };
}

export const fmtMoney = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
export const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
