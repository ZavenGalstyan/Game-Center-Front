/**
 * Pirate Cove — the land (and the sea floor). Every island, rock and reef is
 * an analytic height function, so the same numbers drive:
 *   - ship grounding / rock collisions        (engine/ship.js)
 *   - the pirate's ground height and slopes    (engine/onfoot.js)
 *   - the island meshes                        (three/islandGeo.js)
 *   - the ocean's shallows + shoreline foam    (three/ocean.js depth texture)
 *
 * Island definition (data/regions.js), coordinates in metres, angles in degrees:
 *   { id, x, z, radius, seed, peak, beach,
 *     shape?:[[k, amp, phase]...], hills?:[[lx, lz, r, h]...],
 *     cliffs?:[{a, w, h}], flats?:[[lx, lz, r, h?]...], dock:{a} }
 */
import { fbm, smoothstep, clamp, lerp, mulberry32 } from "./rng.js";

export const SEA_FLOOR = -14;
export const SHIP_DRAFT = -1.25; // terrain above this grounds a hull
const DEG = Math.PI / 180;

export function prepareIsland(def) {
  const rand = mulberry32((def.seed || 1) * 7919 + 13);
  const shape =
    def.shape ||
    [2, 3, 5, 7].map((k, i) => [k, [0.13, 0.09, 0.05, 0.03][i] * (0.6 + rand() * 0.8), rand() * Math.PI * 2]);
  const I = {
    ...def,
    shape,
    peak: def.peak ?? 6,
    beach: def.beach ?? 9,
    hills: def.hills || [],
    cliffs: (def.cliffs || []).map((c) => ({ a: c.a * DEG, w: (c.w ?? 50) * DEG, h: c.h ?? 10 })),
    flats: [],
    noiseSeed: (def.seed || 1) * 31,
  };
  let maxMul = 1;
  for (const [, a] of shape) maxMul += Math.abs(a);
  I.maxR = I.radius * maxMul;
  I.bound = I.maxR + 60;
  // Flats resolve their height from the un-flattened terrain at their centre.
  I.flats = (def.flats || []).map(([lx, lz, r, h]) => ({ lx, lz, r, h: h ?? Math.max(0.6, localHeight(I, lx, lz)) }));
  return I;
}

export function radiusAt(I, ang) {
  let m = 1;
  for (let i = 0; i < I.shape.length; i++) {
    const s = I.shape[i];
    m += s[1] * Math.sin(s[0] * ang + s[2]);
  }
  return I.radius * m;
}

function cliffFactor(I, ang) {
  let f = 0;
  for (const c of I.cliffs) {
    let d = ang - c.a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const g = Math.exp(-((d / (c.w * 0.5)) ** 2) * 1.4);
    if (g > f) f = g;
  }
  return f;
}

function cliffHeight(I, ang) {
  let best = 0;
  let h = 0;
  for (const c of I.cliffs) {
    let d = ang - c.a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const g = Math.exp(-((d / (c.w * 0.5)) ** 2) * 1.4);
    if (g > best) {
      best = g;
      h = c.h;
    }
  }
  return h;
}

/** Height in island-local coordinates (before flats are applied when called from prepareIsland). */
export function localHeight(I, lx, lz) {
  const d = Math.hypot(lx, lz);
  if (d > I.bound) return SEA_FLOOR;
  const ang = Math.atan2(lz, lx);
  const R = radiusAt(I, ang);
  const t = d / R;
  let h;
  const n = fbm(lx * 0.045, lz * 0.045, I.noiseSeed, 3);
  if (t >= 1) {
    h = -0.6 - 13.4 * (1 - Math.exp(-(d - R) / 11));
  } else {
    const bw = Math.min(0.45, I.beach / R);
    const beachH = -0.6 + 1.5 * smoothstep(1, 1 - bw, t);
    const inner = smoothstep(1 - bw, 0.12, t);
    h = beachH + I.peak * Math.pow(inner, 1.25) * (0.7 + 0.6 * n);
    if (I.cliffs.length) {
      const cf = cliffFactor(I, ang);
      if (cf > 0.01) {
        const ch = cliffHeight(I, ang) * smoothstep(1.015, 0.9, t) + I.peak * inner * 0.6;
        h = lerp(h, Math.max(h, ch), cf);
      }
    }
  }
  const landMask = smoothstep(1.06, 0.82, t);
  for (let i = 0; i < I.hills.length; i++) {
    const [hx, hz, r, hh] = I.hills[i];
    const dd = (lx - hx) * (lx - hx) + (lz - hz) * (lz - hz);
    h += hh * Math.exp(-dd / (r * r)) * landMask;
  }
  h += (fbm(lx * 0.16, lz * 0.16, I.noiseSeed + 5, 2) - 0.5) * 0.55 * smoothstep(1, 0.86, t);
  for (let i = 0; i < I.flats.length; i++) {
    const F = I.flats[i];
    const fd = Math.hypot(lx - F.lx, lz - F.lz);
    if (fd < F.r + 5) h = lerp(h, F.h, smoothstep(F.r + 5, F.r, fd));
  }
  return h;
}

export function islandHeight(I, x, z) {
  return localHeight(I, x - I.x, z - I.z);
}

/** Sea rock / reef: { x, z, r, h } — h may be negative for a submerged reef. */
export function rockHeight(R, x, z) {
  const d = Math.hypot(x - R.x, z - R.z);
  if (d > R.r * 1.7) return SEA_FLOOR;
  return SEA_FLOOR + (R.h - SEA_FLOOR) * smoothstep(R.r * 1.6, R.r * 0.5, d);
}

/** Shipwreck hull lying on a shoal: { x, z, heading, size } — a low elongated hump. */
export function wreckHeight(W, x, z) {
  const c = Math.cos(W.heading);
  const s = Math.sin(W.heading);
  const dx = x - W.x;
  const dz = z - W.z;
  const along = dx * s + dz * c;
  const across = dx * c - dz * s;
  const L = W.size * 0.55;
  const B = W.size * 0.2;
  const q = (along / L) ** 2 + (across / B) ** 2;
  if (q > 3) return SEA_FLOOR;
  return lerp(SEA_FLOOR, -0.4, smoothstep(2.6, 0.7, q));
}

/**
 * The whole sea region's terrain. `height(x,z)` is the max of every feature.
 * Shared by engine, meshes and the ocean depth texture.
 */
export function createTerrain(region) {
  const islands = region.islands.map(prepareIsland);
  const rocks = region.rocks || [];
  const wrecks = region.wrecks || [];
  const byId = new Map(islands.map((I) => [I.id, I]));

  function height(x, z) {
    let h = SEA_FLOOR;
    for (let i = 0; i < islands.length; i++) {
      const I = islands[i];
      const dx = x - I.x;
      const dz = z - I.z;
      if (dx * dx + dz * dz > I.bound * I.bound) continue;
      const v = localHeight(I, dx, dz);
      if (v > h) h = v;
    }
    for (let i = 0; i < rocks.length; i++) {
      const R = rocks[i];
      const dx = x - R.x;
      const dz = z - R.z;
      if (dx * dx + dz * dz > R.r * R.r * 2.9) continue;
      const v = rockHeight(R, x, z);
      if (v > h) h = v;
    }
    for (let i = 0; i < wrecks.length; i++) {
      const v = wreckHeight(wrecks[i], x, z);
      if (v > h) h = v;
    }
    return h;
  }

  function grad(x, z, e = 0.6) {
    return [(height(x + e, z) - height(x - e, z)) / (2 * e), (height(x, z + e) - height(x, z - e)) / (2 * e)];
  }

  /** Walks out from the island centre along `deg` to find the shoreline point (height ≈ 0). */
  function shorePoint(I, deg) {
    const a = deg * DEG;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    let last = 0;
    for (let r = 0; r < I.maxR + 30; r += 0.25) {
      const h = localHeight(I, dx * r, dz * r);
      if (h < 0.15 && r > I.radius * 0.3) return { x: I.x + dx * r, z: I.z + dz * r, r, dx, dz };
      last = r;
    }
    return { x: I.x + dx * last, z: I.z + dz * last, r: last, dx, dz };
  }

  /** Dock geometry: land end, sea end, the berth where a ship moors, and the boarding point. */
  function dockFor(I, beam = 4.2) {
    const a = I.dock?.a ?? 0;
    const sp = shorePoint(I, a);
    const len = I.dock?.len ?? 24;
    const land = { x: sp.x - sp.dx * 5, z: sp.z - sp.dz * 5 };
    const end = { x: sp.x + sp.dx * len, z: sp.z + sp.dz * len };
    // Moor on the dock's right-hand side (looking out to sea), bow pointing out.
    const side = { x: -sp.dz, z: sp.dx };
    const off = beam * 0.5 + 2.4;
    const berth = {
      x: sp.x + sp.dx * (len - 3) + side.x * off,
      z: sp.z + sp.dz * (len - 3) + side.z * off,
      heading: Math.atan2(sp.dx, sp.dz),
    };
    const board = { x: sp.x + sp.dx * (len - 3), z: sp.z + sp.dz * (len - 3) };
    const spawn = { x: sp.x + sp.dx * (len - 5), z: sp.z + sp.dz * (len - 5), yaw: Math.atan2(-sp.dx, -sp.dz) };
    return { a, dir: { x: sp.dx, z: sp.dz }, side, shore: sp, land, end, berth, board, spawn, len, deckY: 1.15 };
  }

  return { islands, rocks, wrecks, byId, height, grad, shorePoint, dockFor, radius: region.radius };
}

/** Converts island-local [lx, lz] to world. */
export function toWorld(I, p) {
  return { x: I.x + p[0], z: I.z + p[1] };
}

export { clamp };
