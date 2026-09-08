/**
 * Mini Golf Journey — deterministic tiny PRNG.
 *
 * Used only for *visual* texture (sand grain, ice cracks, grass speckle,
 * skyline windows) so a level looks identical every time it's drawn. Never
 * touches physics.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(...nums) {
  let s = 2166136261 >>> 0;
  for (const n of nums) {
    s ^= Math.round(n * 73.31) >>> 0;
    s = Math.imul(s, 16777619) >>> 0;
  }
  return s >>> 0;
}
