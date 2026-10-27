/**
 * Oceanbound — small math helpers shared by the simulation and the renderer.
 * Pure JS (no Three.js) so the whole sim runs headlessly in node.
 */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoothstep = (a, b, v) => smooth(clamp((v - a) / (b - a), 0, 1));
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
export const TAU = Math.PI * 2;
export const wrapAngle = (a) => {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
};
export const dist2 = (ax, az, bx, bz) => (ax - bx) * (ax - bx) + (az - bz) * (az - bz);

/** mulberry32 — deterministic RNG returning a function in [0,1) */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  const f = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  return f;
}

/** integer hash of a few ints → uint32 */
export function hash(...n) {
  let h = 2166136261 >>> 0;
  for (const v of n) {
    h ^= v | 0;
    h = Math.imul(h, 16777619) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995) >>> 0;
  }
  h ^= h >>> 15;
  return h >>> 0;
}
export const hash01 = (...n) => hash(...n) / 4294967296;

/** smooth 2D value noise in [-1, 1] (seeded) */
export function vnoise(x, z, seed = 0) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = smooth(xf);
  const v = smooth(zf);
  const a = hash01(xi, zi, seed);
  const b = hash01(xi + 1, zi, seed);
  const c = hash01(xi, zi + 1, seed);
  const d = hash01(xi + 1, zi + 1, seed);
  return (lerp(lerp(a, b, u), lerp(c, d, u), v)) * 2 - 1;
}
export function fbm(x, z, seed = 0, oct = 3) {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, z * f, seed + i * 17) * amp;
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}
/** 1D periodic noise on an angle (used for island coastlines) */
export function angNoise(a, seed, lobes = 5) {
  let s = 0;
  for (let i = 1; i <= 3; i++) {
    const ph = hash01(seed, i) * TAU;
    const amp = hash01(seed, i, 7) / i;
    s += Math.sin(a * (lobes * i * 0.5 + i) + ph) * amp;
  }
  return s * 0.6;
}
