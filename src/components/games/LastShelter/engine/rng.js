/**
 * Last Shelter — seeded randomness.
 *
 * Every random roll in the scavenge layout and the shelter simulation goes
 * through one of these so a run is reproducible from its seed + state (the
 * Node sim test and the save system both rely on that). The state is a plain
 * uint32 that lives inside the serialisable game state.
 */
export function mulberry(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.state = () => s;
  return next;
}

/** A roll bound to an object's `rng` field — advances and stores the state. */
export function roll(S) {
  let s = S.rng >>> 0;
  s = (s + 0x6d2b79f5) >>> 0;
  S.rng = s;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randInt = (S, a, b) => a + Math.floor(roll(S) * (b - a + 1));
export const chance = (S, p) => roll(S) < p;
export function pickOne(S, list) {
  return list.length ? list[Math.floor(roll(S) * list.length)] : undefined;
}
export function weighted(S, list, w = (x) => x.w) {
  let tot = 0;
  for (const x of list) tot += Math.max(0, w(x));
  if (tot <= 0) return undefined;
  let r = roll(S) * tot;
  for (const x of list) {
    r -= Math.max(0, w(x));
    if (r < 0) return x;
  }
  return list[list.length - 1];
}
export function shuffle(rand, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
