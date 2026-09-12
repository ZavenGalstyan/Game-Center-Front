/**
 * Bomb Squad — tiny seeded RNG (mulberry32). Every puzzle variant is
 * generated from a seed derived from the mission id, so replaying a mission
 * regenerates the exact same fair puzzle every time (see systems/moduleFactory.js
 * and data/missions.js). Never use Math.random() for puzzle generation.
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic string -> 32bit seed (mission id + module index + type). */
export function seedFrom(...parts) {
  const s = parts.join("|");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makeRng(...parts) {
  return mulberry32(seedFrom(...parts));
}

/** Integer in [min, max] inclusive. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Pick one element. */
export function pick(rng, arr) {
  return arr[randInt(rng, 0, arr.length - 1)];
}

/** Fisher-Yates shuffle, pure — returns a new array. */
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** n distinct items picked (without replacement) from arr, order preserved by pick order. */
export function sample(rng, arr, n) {
  return shuffle(rng, arr).slice(0, Math.min(n, arr.length));
}
