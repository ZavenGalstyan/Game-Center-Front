/**
 * Dinosaur Island 3D — the island heightfield (pure JS, no Three.js, so the
 * sim and the headless tests use exactly the same ground as the renderer).
 *
 * One tropical island ~430 units across: a sandy southern beach (the
 * shipwreck), rolling jungle hills, a lake in the west that drains to the sea
 * through a river, a mountain range in the north (cave on its western foot,
 * a crashed plane on its southern slope) and a flattened plateau in the east
 * for the abandoned research station.
 */

export const WORLD = 300; // terrain mesh spans [-WORLD, WORLD]
export const SEA_LEVEL = 0;

export const LAKE = { x: -55, z: 35, r: 27, level: 3.2 };
export const RIVER = [
  [-78, 44],
  [-102, 58],
  [-128, 52],
  [-156, 66],
  [-186, 74],
  [-214, 80],
  [-250, 86],
];
const RIVER_W = 4.2;
const MOUNTAINS = [
  { x: 15, z: -150, r: 78, h: 64 },
  { x: -72, z: -128, r: 50, h: 40 },
  { x: 82, z: -128, r: 42, h: 30 },
  { x: -130, z: -60, r: 34, h: 16 },
];

/** Landmarks. `r` = flattened radius, `h` is filled in below. */
export const SITES = {
  spawn: { x: 4, z: 184, r: 0 },
  wreck: { x: 26, z: 186, r: 9 },
  station: { x: 102, z: -30, r: 30 },
  cave: { x: -64, z: -84, r: 13 },
  crash: { x: 36, z: -104, r: 11 },
};

/* --------------------------------------------------------------- noise */
function hash2(ix, iz) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm(x, z, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * (vnoise(x * f, z * f) * 2 - 1);
    f *= 2.03;
    a *= 0.5;
  }
  return s;
}
const smooth = (e0, e1, x) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;

/** Distance to the river polyline and the 0..1 position along it. */
export function riverInfo(x, z) {
  let best = Infinity;
  let bestS = 0;
  let acc = 0;
  let total = 0;
  for (let i = 0; i < RIVER.length - 1; i++) total += Math.hypot(RIVER[i + 1][0] - RIVER[i][0], RIVER[i + 1][1] - RIVER[i][1]);
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i];
    const [bx, bz] = RIVER[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz);
    let t = ((x - ax) * dx + (z - az) * dz) / (L * L);
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      bestS = (acc + L * t) / total;
    }
    acc += L;
  }
  return { d: best, s: bestS };
}
const riverLevel = (s) => lerp(LAKE.level - 0.15, -0.4, Math.pow(s, 0.8));

export function shoreRadius(x, z) {
  const a = Math.atan2(z, x);
  return 210 + 17 * Math.sin(a * 3 + 1.3) + 9 * Math.sin(a * 7 + 0.4) + 5 * Math.sin(a * 13 + 2.1);
}

function rawHeight(x, z) {
  const r = Math.hypot(x, z);
  const d = r / shoreRadius(x, z);
  let h;
  if (d >= 1) {
    h = 0.45 - (d - 1) * 80;
    if (h < -14) h = -14 + (h + 14) * 0.05;
  } else {
    const beach = Math.min(1, (1 - d) / 0.12);
    h = 0.45 + beach * 1.8;
    const inland = smooth(0.9, 0.62, d);
    h += inland * (3.2 + (fbm(x * 0.012, z * 0.012) + 0.5) * 7 + fbm(x * 0.05, z * 0.05, 2) * 1.6);
  }
  for (const m of MOUNTAINS) {
    const dd = Math.hypot(x - m.x, z - m.z) / m.r;
    if (dd < 2.2) {
      const ridge = 1 - Math.abs(fbm(x * 0.03 + m.x, z * 0.03, 3));
      h += m.h * Math.exp(-dd * dd * 2.4) * (0.72 + 0.45 * ridge);
    }
  }
  return h;
}

for (const k of Object.keys(SITES)) {
  const s = SITES[k];
  s.h = k === "spawn" ? 0 : rawHeight(s.x, s.z);
}
SITES.station.h = Math.max(SITES.station.h, 8);

/** Terrain height at (x, z). */
export function height(x, z) {
  let h = rawHeight(x, z);
  // flattened landmark pads
  for (const k in SITES) {
    const s = SITES[k];
    if (!s.r) continue;
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.r + 14) h = lerp(s.h, h, smooth(s.r, s.r + 14, d));
  }
  // lake basin
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 22) {
    const bed = dl < LAKE.r ? LAKE.level - 1.6 * (1 - (dl / LAKE.r) ** 2) - 0.25 : LAKE.level - 0.25 + (dl - LAKE.r) * 0.42;
    if (bed < h) h = lerp(bed, h, smooth(LAKE.r + 4, LAKE.r + 22, dl) * 0.6);
  }
  // river channel
  const ri = riverInfo(x, z);
  if (ri.d < RIVER_W + 12) {
    const w = riverLevel(ri.s);
    const bed = ri.d < RIVER_W ? w - 1.1 * (1 - (ri.d / RIVER_W) ** 2) - 0.2 : w - 0.2 + (ri.d - RIVER_W) * 0.55;
    if (bed < h) h = bed;
  }
  return h;
}

/** Fresh-water surface level at (x, z), or null if there is no lake/river water here. */
export function freshWaterAt(x, z) {
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r + 2 && height(x, z) < LAKE.level) return LAKE.level;
  const ri = riverInfo(x, z);
  if (ri.d < RIVER_W + 1.2) {
    const w = riverLevel(ri.s);
    if (w > 0.15 && height(x, z) < w) return w;
  }
  return null;
}
export { riverLevel, RIVER_W };

/** Terrain normal-ish slope (0 flat .. ~1 steep). */
export function slope(x, z) {
  const e = 1;
  const dx = height(x + e, z) - height(x - e, z);
  const dz = height(x, z + e) - height(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** 0..1 how far inland a point is (0 = on the shoreline). */
export function inland(x, z) {
  return 1 - Math.hypot(x, z) / shoreRadius(x, z);
}

/** Seeded PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
