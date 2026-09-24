/**
 * Car Wash Studio — deterministic randomness + cheap noise.
 *
 * Everything that decides where dirt goes is seeded from the job's `dirtSeed`,
 * so an unfinished job never "re-rolls" its dirt on reload, and the Before
 * image of Before/After is the exact same dirt the player started with.
 * Pure math, no DOM — importable from Node test scripts.
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of a lattice point → [0,1). */
export function hash2(x, y, seed) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);

/** Smooth value noise in [0,1). */
export function vnoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Fractal value noise, 0..1 (roughly centred at 0.5). */
export function fbm(x, y, seed, octaves = 3) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x * f, y * f, seed + o * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

/** Cellular (Worley F1) distance — used for foam bubbles. Returns 0..~1.2. */
export function worley(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i + hash2(xi + i, yi + j, seed);
      const cy = yi + j + hash2(xi + i, yi + j, seed + 77);
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
