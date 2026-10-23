/**
 * Deterministic, endless terrain. Slopes come from a seeded, damped random
 * walk clamped to a per-map maximum that ramps up with distance; heights
 * integrate those slopes, and the surface between control points is a C1
 * cubic Hermite curve, so it is smooth and its steepness stays bounded.
 * Pickups (coin rows, fuel cans) and scenery are generated alongside.
 */
const FLAT = 40; // metres of flat start

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createTerrain(map) {
  const rand = rng(map.seed * 7919 + 1);
  const H = [0], S = [0]; // control heights / slopes at x = i * seg
  const seg = map.seg;
  const maxSlope = (x) => map.slope[0] + (map.slope[1] - map.slope[0]) * Math.min(1, Math.max(0, x - FLAT) / map.ramp);

  // pickups
  const prand = rng(map.seed * 104729 + 3);
  const coins = [], cans = [], props = [];
  let nextCoin = 70, nextCan = 160, canGap = 190, nextProp = 15;

  function extend(toX) {
    while ((H.length - 1) * seg < toX + seg * 2) {
      const i = H.length, x = i * seg;
      let s = 0;
      if (x > FLAT) {
        const m = maxSlope(x);
        s = S[i - 1] * 0.86 + (rand() - 0.5) * map.rough * 2;
        // gentle bias back toward level ground keeps climbs finite
        s -= (H[i - 1] - (H[Math.max(0, i - 40)] ?? 0)) * 0.0015;
        s = Math.max(-m, Math.min(m, s));
        // limit the change in slope between neighbours (no sharp kinks)
        const dk = 0.32;
        s = Math.max(S[i - 1] - dk, Math.min(S[i - 1] + dk, s));
      }
      S.push(s);
      H.push(H[i - 1] + (seg * (S[i - 1] + s)) / 2);
    }
    const reach = (H.length - 3) * seg;
    while (nextCoin < reach) {
      const n = 5 + Math.floor(prand() * 4), big = prand() < 0.2;
      for (let k = 0; k < n; k++) coins.push({ x: nextCoin + k * 1.6, v: big && k === n >> 1 ? 25 : 5, got: false });
      nextCoin += 55 + prand() * 70 + n * 1.6;
    }
    while (nextCan < reach) {
      cans.push({ x: nextCan, got: false });
      canGap = Math.min(420, canGap + 14);
      nextCan += canGap * (0.85 + prand() * 0.3);
    }
    while (nextProp < reach) {
      props.push({ x: nextProp, k: prand(), s: 0.8 + prand() * 0.6 });
      nextProp += 9 + prand() * 26;
    }
  }

  /** Height and slope at x (Hermite between control points). */
  function at(x) {
    if (x <= 0) return { y: 0.25 * x * x, dy: 0.5 * x }; // a bowl behind the start line
    extend(x);
    const i = Math.floor(x / seg), t = x / seg - i;
    const y0 = H[i], y1 = H[i + 1], m0 = S[i] * seg, m1 = S[i + 1] * seg;
    const t2 = t * t, t3 = t2 * t;
    const y = (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1;
    const dy = ((6 * t2 - 6 * t) * y0 + (3 * t2 - 4 * t + 1) * m0 + (-6 * t2 + 6 * t) * y1 + (3 * t2 - 2 * t) * m1) / seg;
    return { y, dy };
  }
  const h = (x) => at(x).y;

  return { map, at, h, extend, coins, cans, props, maxSlope };
}
