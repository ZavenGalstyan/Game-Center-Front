/** Strike Force — small seeded PRNG (mulberry32). */
export function createRng(seed = 1) {
  let a = seed >>> 0 || 1;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.range = (lo, hi) => lo + (hi - lo) * rnd();
  rnd.pick = (arr) => arr[(rnd() * arr.length) | 0];
  rnd.int = (n) => (rnd() * n) | 0;
  return rnd;
}
