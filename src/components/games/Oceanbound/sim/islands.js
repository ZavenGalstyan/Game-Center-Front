/**
 * Oceanbound — procedural world: islands (Palm / Rocky / Jungle), reef
 * patches, the seabed, and the ocean current that flows around islands.
 *
 * Everything is deterministic from the world seed. Islands live in a chunk
 * grid (CHUNK m); three guaranteed islands lie along the starting current so
 * every new game meets one of each type. Island geometry is a radial
 * height profile with a noisy coastline; resources are "nodes" placed on it.
 */
import { rng, hash, hash01, fbm, angNoise, smoothstep, clamp, TAU } from "./util.js";

export const SEABED = -11;
export const CHUNK = 420;
export const CURRENT = (() => {
  const a = 0.09;
  return { x: Math.cos(a), z: Math.sin(a), speed: 0.85 };
})();

export const ISLAND_TYPES = {
  palm: { name: "Palm Island", r: [21, 27], h: 3.4, beach: 0.74 },
  rocky: { name: "Rocky Island", r: [25, 33], h: 10.5, beach: 0.86 },
  jungle: { name: "Jungle Island", r: [27, 35], h: 6.2, beach: 0.8 },
};
const GUARANTEED = [
  { type: "palm", x: 205, z: 33 },
  { type: "rocky", x: 640, z: -64 },
  { type: "jungle", x: 1090, z: 70 },
];

/* ------------------------------------------------------------------ island shape */
function makeIsland(id, type, x, z, seed) {
  const T = ISLAND_TYPES[type];
  const r0 = rng(seed);
  const I = {
    id,
    type,
    name: T.name,
    x,
    z,
    seed,
    r: r0.range(T.r[0], T.r[1]),
    h: T.h * r0.range(0.88, 1.12),
    beach: T.beach,
    rot: r0() * TAU,
    nodes: null,
    colliders: null,
  };
  return I;
}

/** height of island I at world (x, z); -Infinity far away */
export function islandHeight(I, x, z) {
  const dx = x - I.x;
  const dz = z - I.z;
  const d = Math.hypot(dx, dz);
  if (d > I.r * 2.1) return -Infinity;
  const a = Math.atan2(dz, dx);
  const rn = I.r * (1 + 0.2 * angNoise(a, I.seed, 4));
  const t = d / rn;
  const b = I.beach;
  if (t >= 1) return -0.2 - (-SEABED - 0.2 + 1) * smoothstep(1, 1.95, t) + fbm(x * 0.08, z * 0.08, I.seed, 2) * 0.4 * (t < 1.4 ? 1 : 0.4);
  if (t >= b) return 0.95 - 1.15 * ((t - b) / (1 - b)) + fbm(x * 0.2, z * 0.2, I.seed + 3, 2) * 0.12;
  const u = (b - t) / b; // 0 at beach edge, 1 at centre
  const n = fbm(x * 0.06, z * 0.06, I.seed + 9, 3);
  if (I.type === "rocky") {
    const ridge = 1 - Math.abs(fbm(x * 0.05, z * 0.05, I.seed + 21, 3)) * 1.6;
    return 0.95 + (I.h - 0.95) * smoothstep(0.02, 0.45, u) * (0.75 + 0.35 * ridge) + n * 1.6 * u;
  }
  if (I.type === "jungle") return 0.95 + (I.h - 0.95) * Math.pow(smoothstep(0, 1, u), 0.9) + n * 1.8 * u;
  return 0.95 + (I.h - 0.95) * Math.pow(smoothstep(0, 1, u), 1.2) + n * 0.6 * u;
}
/** 0 = beach, 1 = interior (for colouring / node placement) */
export function islandZone(I, x, z) {
  const d = Math.hypot(x - I.x, z - I.z);
  const a = Math.atan2(z - I.z, x - I.x);
  const rn = I.r * (1 + 0.2 * angNoise(a, I.seed, 4));
  return d / rn;
}

/* ------------------------------------------------------------------ world */
export function createWorld(seed) {
  return { seed: seed >>> 0, islands: new Map(), reefs: new Map(), chunkSeen: new Set(), reefSeen: new Set() };
}

function chunkIslands(W, cx, cz) {
  const key = `${cx}:${cz}`;
  if (W.chunkSeen.has(key)) return;
  W.chunkSeen.add(key);
  const h = hash(W.seed, cx, cz, 77);
  const cxm = (cx + 0.5) * CHUNK;
  const czm = (cz + 0.5) * CHUNK;
  if (cx === 0 && cz === 0) {
    // guaranteed islands are registered with the origin chunk
    GUARANTEED.forEach((g, k) => {
      const id = `g${k}`;
      W.islands.set(id, makeIsland(id, g.type, g.x, g.z, hash(W.seed, k, 991)));
    });
  }
  if (h / 4294967296 > 0.46) return;
  const x = cxm + (hash01(h, 1) - 0.5) * CHUNK * 0.55;
  const z = czm + (hash01(h, 2) - 0.5) * CHUNK * 0.55;
  if (Math.hypot(x, z) < 300) return;
  for (const g of GUARANTEED) if (Math.hypot(x - g.x, z - g.z) < 330) return;
  const types = ["palm", "rocky", "jungle"];
  const type = types[hash(h, 3) % 3];
  const id = `c${cx}_${cz}`;
  W.islands.set(id, makeIsland(id, type, x, z, hash(h, 4)));
}
/** islands whose centre lies within `radius` of (x, z) */
export function islandsNear(W, x, z, radius) {
  chunkIslands(W, 0, 0);
  const c0 = Math.floor((x - radius) / CHUNK);
  const c1 = Math.floor((x + radius) / CHUNK);
  const d0 = Math.floor((z - radius) / CHUNK);
  const d1 = Math.floor((z + radius) / CHUNK);
  for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) chunkIslands(W, cx, cz);
  const out = [];
  for (const I of W.islands.values()) if (Math.hypot(I.x - x, I.z - z) < radius + I.r) out.push(I);
  return out;
}

/* ------------------------------------------------------------------ reefs (open-sea seabed patches) */
const REEF = 96;
function chunkReefs(W, cx, cz) {
  const key = `${cx}:${cz}`;
  if (W.reefSeen.has(key)) return;
  W.reefSeen.add(key);
  const h = hash(W.seed, cx, cz, 313);
  if (h / 4294967296 > 0.3) return;
  const x = (cx + 0.2 + hash01(h, 1) * 0.6) * REEF;
  const z = (cz + 0.2 + hash01(h, 2) * 0.6) * REEF;
  const R = { id: `r${cx}_${cz}`, x, z, r: 9 + hash01(h, 3) * 7, seed: hash(h, 4), nodes: null };
  W.reefs.set(R.id, R);
}
export function reefsNear(W, x, z, radius) {
  const c0 = Math.floor((x - radius) / REEF);
  const c1 = Math.floor((x + radius) / REEF);
  const d0 = Math.floor((z - radius) / REEF);
  const d1 = Math.floor((z + radius) / REEF);
  for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) chunkReefs(W, cx, cz);
  const out = [];
  for (const R of W.reefs.values()) if (Math.abs(R.x - x) < radius + R.r && Math.abs(R.z - z) < radius + R.r) out.push(R);
  return out;
}
function reefHeight(R, x, z) {
  const d = Math.hypot(x - R.x, z - R.z) / R.r;
  if (d > 1.6) return -Infinity;
  return SEABED + 4.6 * (1 - smoothstep(0, 1.6, d)) + fbm(x * 0.3, z * 0.3, R.seed, 2) * 0.7;
}

/** terrain / seabed height at world (x, z) */
export function groundHeight(W, x, z, isl = null) {
  let h = SEABED + fbm(x * 0.02, z * 0.02, W.seed, 2) * 1.2;
  const list = isl || islandsNear(W, x, z, 80);
  for (const I of list) {
    const ih = islandHeight(I, x, z);
    if (ih > h) h = ih;
  }
  for (const R of reefsNear(W, x, z, 20)) {
    const rh = reefHeight(R, x, z);
    if (rh > h) h = rh;
  }
  return h;
}

/* ------------------------------------------------------------------ nodes */
/**
 * node types
 *  tree-like (axe): palm, jtree, bamboo, boulder (ore)
 *  hand pickups (E): stone, coconut, clay, driftwood, scrap, bush, vine, mango (tree, fruit regrows)
 *  loot: crate, page
 *  landmarks (decor + colliders): arch, cave, shrine, wreck, rock
 */
export const NODE_INFO = {
  palm: { name: "Palm Tree", tool: "axe", hits: 3, r: 0.32, respawn: 2 },
  jtree: { name: "Jungle Tree", tool: "axe", hits: 4, r: 0.5, respawn: 2 },
  bamboo: { name: "Bamboo", tool: "axe", hits: 2, r: 0.45, respawn: 1.2 },
  boulder: { name: "Ore Boulder", tool: "axe", hits: 3, r: 0.9, respawn: 2 },
  mango: { name: "Mango Tree", hand: true, r: 0.4, respawn: 1, fruit: true },
  bush: { name: "Palm Shrub", hand: true, r: 0, respawn: 1 },
  vine: { name: "Hanging Vines", hand: true, r: 0, respawn: 1 },
  stone: { name: "Stone", hand: true, r: 0, respawn: 1.2 },
  coconut: { name: "Coconut", hand: true, r: 0, respawn: 1 },
  clay: { name: "Clay Deposit", hand: true, r: 0, respawn: 1.2 },
  driftwood: { name: "Driftwood", hand: true, r: 0, respawn: 1.5 },
  scrap: { name: "Scrap", hand: true, r: 0, respawn: 2 },
  crate: { name: "Supply Crate", hand: true, r: 0, respawn: 0 },
  page: { name: "Logbook Page", hand: true, r: 0, respawn: 0 },
  rock: { name: "Rock", r: 1.2 },
  arch: { name: "Stone Arch", r: 0 },
  cave: { name: "Sea Cave", r: 0 },
  shrine: { name: "Old Shrine", r: 0 },
  wreck: { name: "Shipwreck", r: 0 },
  coral: { name: "Coral", r: 0 },
};

export function islandNodes(W, I) {
  if (I.nodes) return I.nodes;
  const R = rng(I.seed ^ 0xa5a5);
  const nodes = [];
  const cols = [];
  const taken = [];
  const free = (x, z, d) => taken.every((p) => (p[0] - x) ** 2 + (p[1] - z) ** 2 > (d + p[2]) ** 2);
  const at = (t, a) => {
    const rn = I.r * (1 + 0.2 * angNoise(a, I.seed, 4));
    return [I.x + Math.cos(a) * rn * t, I.z + Math.sin(a) * rn * t];
  };
  const add = (type, x, z, extra = {}) => {
    const y = islandHeight(I, x, z);
    const n = { id: nodes.length, type, x, z, y, rot: R() * TAU, s: R.range(0.85, 1.15), ...extra };
    nodes.push(n);
    taken.push([x, z, extra.space ?? 1.2]);
    const r = extra.r ?? NODE_INFO[type]?.r ?? 0;
    if (r > 0) cols.push({ x, z, r: r * n.s, y0: y - 2, y1: y + (extra.ch ?? 6), node: n.id });
    return n;
  };
  const scatter = (type, count, t0, t1, space, extra) => {
    for (let k = 0, tries = 0; k < count && tries < count * 40; tries++) {
      const a = R() * TAU;
      const t = R.range(t0, t1);
      const [x, z] = at(t, a);
      if (!free(x, z, space)) continue;
      const y = islandHeight(I, x, z);
      if (y < 0.3 && t < 1) continue;
      add(type, x, z, { space, ...(typeof extra === "function" ? extra() : extra) });
      k++;
    }
  };
  // landmark first (with a crate and a logbook page inside)
  const la = R() * TAU;
  if (I.type === "palm") {
    const [x, z] = at(0.62, la);
    add("arch", x, z, { space: 3.2, r: 0 });
    cols.push(...archCols(x, z, nodes[nodes.length - 1].rot, islandHeight(I, x, z)));
    const [cx, cz] = at(0.5, la + 0.1);
    add("crate", cx, cz, { space: 1 });
    add("page", x + Math.cos(la) * 0.5, z + Math.sin(la) * 0.5, { space: 0.4 });
  } else if (I.type === "rocky") {
    const [x, z] = at(0.6, la);
    const n = add("cave", x, z, { space: 5.5, r: 0 });
    cols.push(...caveCols(x, z, n.rot, islandHeight(I, x, z)));
    add("crate", x, z, { space: 0.5 });
    add("page", x + Math.cos(n.rot) * 0.9, z + Math.sin(n.rot) * 0.9, { space: 0.3 });
    const [wx, wz] = at(0.97, la + Math.PI * 0.8);
    const w = add("wreck", wx, wz, { space: 5, r: 0 });
    cols.push(...wreckCols(wx, wz, w.rot, islandHeight(I, wx, wz)));
    for (let k = 0; k < 3; k++) {
      const [sx, sz] = at(0.9, la + Math.PI * 0.8 + (k - 1) * 0.14);
      if (free(sx, sz, 0.5)) add("scrap", sx, sz, { space: 0.6 });
    }
  } else {
    const [x, z] = at(0.45, la);
    const n = add("shrine", x, z, { space: 4.2, r: 0 });
    cols.push(...shrineCols(x, z, n.rot, islandHeight(I, x, z)));
    add("page", x, z, { space: 0.3, y: islandHeight(I, x, z) + 0.45 });
    const [cx, cz] = at(0.55, la + 0.18);
    add("crate", cx, cz, { space: 1 });
  }
  if (I.type === "palm") {
    scatter("palm", R.int(11, 15), 0.15, 0.82, 2.4, () => ({ lean: R.range(0.15, 0.45), h: R.range(5.5, 8) }));
    scatter("bush", R.int(5, 7), 0.2, 0.75, 1.5);
    scatter("coconut", R.int(5, 8), 0.3, 0.85, 0.8);
    scatter("stone", R.int(6, 9), 0.6, 0.97, 0.9);
    scatter("driftwood", R.int(2, 4), 0.8, 0.98, 1.2);
    scatter("rock", R.int(3, 5), 0.5, 0.96, 2, () => ({ r: R.range(0.6, 1.1) }));
  } else if (I.type === "rocky") {
    scatter("boulder", R.int(6, 9), 0.2, 0.85, 2.6);
    scatter("rock", R.int(9, 13), 0.1, 0.98, 2.4, () => ({ r: R.range(0.9, 2.2) }));
    scatter("stone", R.int(9, 12), 0.3, 0.98, 0.9);
    scatter("clay", R.int(5, 7), 0.9, 1.08, 1.4);
    scatter("palm", R.int(2, 4), 0.6, 0.85, 2.4, () => ({ lean: R.range(0.2, 0.5), h: R.range(4.5, 6) }));
    scatter("bush", R.int(2, 4), 0.4, 0.8, 1.5);
  } else {
    scatter("jtree", R.int(8, 11), 0.1, 0.72, 3.4, () => ({ h: R.range(7, 10) }));
    scatter("mango", R.int(4, 6), 0.2, 0.72, 3, () => ({ h: R.range(3.6, 4.6) }));
    scatter("bamboo", R.int(6, 8), 0.15, 0.75, 2.2);
    scatter("vine", R.int(5, 7), 0.15, 0.7, 1.6);
    scatter("bush", R.int(5, 8), 0.15, 0.78, 1.4);
    scatter("palm", R.int(3, 5), 0.72, 0.86, 2.4, () => ({ lean: R.range(0.25, 0.5), h: R.range(5.5, 7.5) }));
    scatter("stone", R.int(4, 6), 0.7, 0.98, 1);
    scatter("clay", R.int(2, 3), 0.92, 1.05, 1.4);
  }
  // shallow-water coral ring
  scatter("coral", R.int(10, 16), 1.12, 1.45, 1.6, () => ({ r: 0 }));
  I.nodes = nodes;
  I.colliders = cols;
  return nodes;
}

export function reefNodes(R) {
  if (R.nodes) return R.nodes;
  const r = rng(R.seed);
  const nodes = [];
  const n = r.int(5, 9);
  for (let k = 0; k < n; k++) {
    const a = r() * TAU;
    const d = r() * R.r;
    nodes.push({ id: k, type: "coral", x: R.x + Math.cos(a) * d, z: R.z + Math.sin(a) * d, rot: r() * TAU, s: r.range(0.8, 1.5) });
  }
  const loot = [["stone", 2], ["clay", 2], ["scrap", 1]];
  for (const [type, c] of loot) {
    const m = r.int(0, c);
    for (let k = 0; k < m; k++) {
      const a = r() * TAU;
      const d = r() * R.r * 0.8;
      nodes.push({ id: nodes.length, type, x: R.x + Math.cos(a) * d, z: R.z + Math.sin(a) * d, rot: r() * TAU, s: 1 });
    }
  }
  if (r() < 0.35) nodes.push({ id: nodes.length, type: "crate", x: R.x + r.range(-2, 2), z: R.z + r.range(-2, 2), rot: r() * TAU, s: 1 });
  for (const nd of nodes) nd.y = reefHeight(R, nd.x, nd.z);
  R.nodes = nodes;
  R.colliders = [];
  return nodes;
}

/* landmark colliders (vertical cylinders) */
function rotP(x, z, a, lx, lz) {
  return [x + Math.cos(a) * lx - Math.sin(a) * lz, z + Math.sin(a) * lx + Math.cos(a) * lz];
}
function archCols(x, z, a, y) {
  return [-1.5, 1.5].map((s) => {
    const [px, pz] = rotP(x, z, a, 0, s);
    return { x: px, z: pz, r: 0.55, y0: y - 1, y1: y + 3.4 };
  });
}
export const CAVE_ROCKS = [
  [-2.6, 0, 1.7],
  [-1.8, 2.0, 1.6],
  [0.3, 2.7, 1.7],
  [2.2, 1.8, 1.5],
  [-1.8, -2.0, 1.6],
  [0.3, -2.7, 1.7],
  [2.2, -1.8, 1.5],
];
function caveCols(x, z, a, y) {
  // horseshoe of big rocks, open toward +x (local)
  return CAVE_ROCKS.map(([lx, lz, r]) => {
    const [px, pz] = rotP(x, z, a, lx, lz);
    return { x: px, z: pz, r: r * 0.85, y0: y - 2, y1: y + 4.5 };
  });
}
function shrineCols(x, z, a, y) {
  const out = [];
  for (const [lx, lz] of [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ]) {
    const [px, pz] = rotP(x, z, a, lx, lz);
    out.push({ x: px, z: pz, r: 0.32, y0: y - 1, y1: y + 3.2 });
  }
  return out;
}
function wreckCols(x, z, a, y) {
  const out = [];
  for (let k = -2; k <= 2; k++) {
    const [px, pz] = rotP(x, z, a, k * 1.2, 0);
    out.push({ x: px, z: pz, r: 0.95, y0: y - 2, y1: y + 1.8 });
  }
  return out;
}

/* ------------------------------------------------------------------ the current */
/** ocean current velocity at (x, z): uniform flow bending around islands */
export function currentAt(W, x, z, isl) {
  let vx = CURRENT.x * CURRENT.speed;
  let vz = CURRENT.z * CURRENT.speed;
  const list = isl || islandsNear(W, x, z, 150);
  for (const I of list) {
    const a = I.r * 1.45;
    let dx = x - I.x;
    let dz = z - I.z;
    // rotate into the frame where the current runs along +x
    const lx = dx * CURRENT.x + dz * CURRENT.z;
    const ly = -dx * CURRENT.z + dz * CURRENT.x;
    let r2 = lx * lx + ly * ly;
    if (r2 > (a * 3.2) ** 2) continue;
    r2 = Math.max(r2, a * a);
    const r4 = r2 * r2;
    const a2 = a * a;
    let u = CURRENT.speed * (1 - (a2 * (lx * lx - ly * ly)) / r4);
    let v = (-2 * CURRENT.speed * a2 * lx * ly) / r4;
    // nudge off the stagnation line in front of the island
    if (lx < 0 && Math.abs(ly) < a * 0.6) v += (ly >= 0 ? 1 : -1) * CURRENT.speed * 0.45 * (1 - Math.abs(ly) / (a * 0.6));
    vx = u * CURRENT.x - v * CURRENT.z;
    vz = u * CURRENT.z + v * CURRENT.x;
  }
  // soft world boundary: far from the origin the current curls back
  const R = Math.hypot(x, z);
  if (R > 7000) {
    const k = clamp((R - 7000) / 1500, 0, 1);
    vx = vx * (1 - k) - (x / R) * CURRENT.speed * k;
    vz = vz * (1 - k) - (z / R) * CURRENT.speed * k;
  }
  return [vx, vz];
}
