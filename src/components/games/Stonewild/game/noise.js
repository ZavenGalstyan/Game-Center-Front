/**
 * Stonewild — deterministic seeded noise.
 *
 * A hand-rolled value-noise + fbm implementation. No external noise package
 * is installed in this project, and the algorithm here is generic public-domain
 * math (hash -> lattice interpolation), not lifted from any game.
 *
 * Same seed string always produces the same permutation table, so the same
 * seed always produces the same terrain (spec requirement).
 */

/** djb2-ish string hash -> uint32. */
export function hashSeed(seed) {
  const str = String(seed ?? "stonewild");
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — small, fast, good-enough seeded PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Builds a seeded 2D value-noise sampler backed by a 256-entry lattice of
 * pseudo-random values, permuted with the given seed. `noise2D(x, y)`
 * returns a smoothly-interpolated value in [-1, 1].
 */
export function createValueNoise2D(seed) {
  const rand = mulberry32(hashSeed(seed));
  const SIZE = 256;
  const MASK = SIZE - 1;
  const perm = new Uint8Array(SIZE);
  for (let i = 0; i < SIZE; i++) perm[i] = i;
  for (let i = SIZE - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  const lattice = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i++) lattice[i] = rand() * 2 - 1;

  function valueAt(xi, yi) {
    const idx = perm[(xi + perm[yi & MASK]) & MASK];
    return lattice[idx];
  }

  return function noise2D(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);

    const v00 = valueAt(xi & MASK, yi & MASK);
    const v10 = valueAt((xi + 1) & MASK, yi & MASK);
    const v01 = valueAt(xi & MASK, (yi + 1) & MASK);
    const v11 = valueAt((xi + 1) & MASK, (yi + 1) & MASK);

    const x1 = lerp(v00, v10, u);
    const x2 = lerp(v01, v11, u);
    return lerp(x1, x2, v);
  };
}

/**
 * Fractal Brownian Motion over a base 2D noise function — layers several
 * octaves of the base frequency to avoid both a perfectly flat world and
 * extreme spikes everywhere (spec requirement).
 */
export function makeFbm2D(noise2D, { octaves = 4, lacunarity = 2, gain = 0.5, scale = 1 } = {}) {
  return function fbm(x, y) {
    let amplitude = 1;
    let frequency = scale;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += noise2D(x * frequency, y * frequency) * amplitude;
      norm += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }
    return norm > 0 ? sum / norm : 0;
  };
}
