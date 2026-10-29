/**
 * The four small, flat maps. Everything walkable is at y = 0; props are
 * axis-aligned boxes or circles (engine/world.js turns them into colliders,
 * render/scenery.js into meshes). Missions live in data/missions.js.
 *
 * Coordinates: X/Z ground plane, +Z is "north". yaw 0 looks toward +Z.
 */

/* small deterministic RNG so generated scenery is identical every load */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const segDist = (px, pz, ax, az, bx, bz) => {
  const vx = bx - ax, vz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz || 1)));
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
};

/* ---------------------------------------------------------------- 1. Jade Palace */
const training = {
  id: "training",
  name: "Jade Palace Training Yard",
  theme: "palace",
  bounds: { type: "rect", x0: -14, z0: -14, x1: 14, z1: 14, wallH: 2.6 },
  spawn: { x: 0, z: -9, yaw: 0 },
  props: [
    { t: "building", x: 0, z: 12.6, w: 18, d: 2.8, h: 5.2, style: "hall" },
    { t: "pillar", x: -11, z: -11, r: 0.45, h: 3.4 },
    { t: "pillar", x: 11, z: -11, r: 0.45, h: 3.4 },
    { t: "pillar", x: -11, z: 8.5, r: 0.45, h: 3.4 },
    { t: "pillar", x: 11, z: 8.5, r: 0.45, h: 3.4 },
    { t: "rack", x: -12.3, z: 0, w: 0.7, d: 4, h: 1.7 },
    { t: "rack", x: 12.3, z: 0, w: 0.7, d: 4, h: 1.7 },
    { t: "tree", x: -9.5, z: -6, s: 1.2, kind: "peach" },
    { t: "tree", x: 9.5, z: -6, s: 1.1, kind: "peach" },
    { t: "lantern", x: -5.5, z: -12.6 },
    { t: "lantern", x: 5.5, z: -12.6 },
    { t: "gong", x: 7, z: 10 },
  ],
  dummies: [
    { x: -4, z: 3 },
    { x: 0, z: 4.5 },
    { x: 4, z: 3 },
  ],
  npcs: [{ id: "shifu", x: 0, z: 8.6, facing: Math.PI }],
  items: [],
  enemySpawns: [],
};

/* ---------------------------------------------------------------- 2. Valley */
const valley = {
  id: "valley",
  name: "Valley of Peace",
  theme: "valley",
  bounds: { type: "rect", x0: -24, z0: -24, x1: 24, z1: 24, wallH: 0 },
  spawn: { x: 0, z: -16, yaw: 0 },
  props: [
    // the river (blocking, not camera-blocking) with two bridges
    { t: "river", x0: -24, z0: 2, x1: 24, z1: 5.5 },
    { t: "bridge", x: 0, z: 3.75, w: 4.4, d: 5.6 },
    { t: "bridge", x: 14, z: 3.75, w: 3.6, d: 5.6 },
    { t: "building", x: -15, z: -12, w: 6, d: 5, h: 3.6, style: "house" },
    { t: "building", x: 13, z: -13, w: 6, d: 5, h: 3.6, style: "house" },
    { t: "building", x: -12, z: -20, w: 7, d: 4, h: 3.4, style: "shop" },
    { t: "building", x: -16, z: 14, w: 6, d: 5, h: 3.6, style: "house" },
    { t: "building", x: 15, z: 15, w: 5, d: 5, h: 3.6, style: "house" },
    { t: "tree", x: -6, z: -8, s: 1.1, kind: "peach" },
    { t: "tree", x: 7, z: -6, s: 1.2, kind: "round" },
    { t: "tree", x: -20, z: -2, s: 1.3, kind: "round" },
    { t: "tree", x: 20, z: -3, s: 1.2, kind: "peach" },
    { t: "tree", x: -8, z: 12, s: 1.3, kind: "round" },
    { t: "tree", x: 6, z: 11, s: 1.1, kind: "peach" },
    { t: "tree", x: -2, z: 19, s: 1.2, kind: "round" },
    { t: "tree", x: 9, z: 20, s: 1.2, kind: "round" },
    { t: "tree", x: -21, z: 21, s: 1.1, kind: "peach" },
    { t: "rock", x: 19, z: 8, r: 1 },
    { t: "rock", x: -3.5, z: 9.5, r: 0.8 },
    { t: "rock", x: 4, z: -19, r: 0.9 },
    { t: "lantern", x: -2.8, z: -11 },
    { t: "lantern", x: 2.8, z: -11 },
    { t: "lantern", x: -2.8, z: -1 },
    { t: "lantern", x: 2.8, z: -1 },
  ],
  dummies: [],
  npcs: [],
  items: [
    { kind: "dumpling", x: -3, z: -13.5 },
    { kind: "dumpling", x: 10, z: -1 },
    { kind: "dumpling", x: -11, z: 8 },
  ],
  enemySpawns: [
    { x: 0, z: 21 },
    { x: -9, z: 8 },
    { x: 10, z: 9 },
    { x: -21, z: 7 },
    { x: 21, z: -1 },
    { x: 21, z: -20 },
    { x: -21, z: -6 },
    { x: 4, z: 15 },
  ],
};

/* ---------------------------------------------------------------- 3. Bamboo Forest */
const forestScrolls = [
  { x: -18, z: -15 },
  { x: 18, z: -13 },
  { x: -17, z: 17 },
  { x: 17, z: 18 },
  { x: 0.5, z: 6 },
];
// a winding path joining the spawn and every scroll stays clear of bamboo
const forestPath = [
  [0, -21], [0, -12], [-9, -12], [-18, -15], [-9, -12], [0, -12], [10, -10], [18, -13],
  [10, -10], [6, -2], [0.5, 6], [-8, 10], [-17, 17], [-8, 10], [0.5, 6], [8, 12], [17, 18],
];
function bambooField() {
  const r = rng(1337);
  const out = [];
  const keep = [{ x: 0, z: -20, r: 4 }, ...forestScrolls.map((s) => ({ ...s, r: 3.2 })), { x: 8, z: -4, r: 4.2 }];
  for (let gx = -22; gx <= 22; gx += 3.4) {
    for (let gz = -22; gz <= 22; gz += 3.4) {
      const x = gx + (r() - 0.5) * 2.2;
      const z = gz + (r() - 0.5) * 2.2;
      const rad = 0.55 + r() * 0.55;
      if (keep.some((k) => Math.hypot(x - k.x, z - k.z) < k.r + rad)) continue;
      let pd = Infinity;
      for (let i = 0; i < forestPath.length - 1; i++) pd = Math.min(pd, segDist(x, z, ...forestPath[i], ...forestPath[i + 1]));
      if (pd < 2.4 + rad) continue;
      if (r() < 0.3) continue;
      if (r() < 0.12) out.push({ t: "rock", x, z, r: rad + 0.2 });
      else out.push({ t: "bamboo", x, z, r: rad, n: 4 + Math.floor(r() * 4), seed: Math.floor(r() * 1e6) });
    }
  }
  return out;
}
const forest = {
  id: "forest",
  name: "Bamboo Forest",
  theme: "forest",
  bounds: { type: "rect", x0: -24, z0: -24, x1: 24, z1: 24, wallH: 0 },
  spawn: { x: 0, z: -20, yaw: 0 },
  path: forestPath,
  props: [
    { t: "pond", x: 8, z: -4, r: 2.8 },
    { t: "shrine", x: 0.5, z: 8.8 },
    { t: "lantern", x: -2, z: -18 },
    { t: "lantern", x: 2, z: -18 },
    ...bambooField(),
  ],
  dummies: [],
  npcs: [],
  items: [
    ...forestScrolls.map((s) => ({ kind: "scroll", ...s })),
    { kind: "dumpling", x: -1.5, z: -11 },
    { kind: "dumpling", x: -7, z: 9 },
  ],
  enemySpawns: [],
  guards: [
    { x: -10, z: -12 },
    { x: 9, z: -9 },
    { x: -6, z: 10 },
  ],
};

/* ---------------------------------------------------------------- 4. Arena */
const arenaPillars = [0.25, 0.75, 1.25, 1.75].map((a) => ({ t: "pillar", x: Math.cos(a * Math.PI) * 11.5, z: Math.sin(a * Math.PI) * 11.5, r: 0.75, h: 5, style: "arena" }));
const arena = {
  id: "arena",
  name: "Tai Lung's Arena",
  theme: "arena",
  bounds: { type: "circle", r: 15, wallH: 1.4 },
  spawn: { x: 0, z: -10, yaw: 0 },
  props: [...arenaPillars, { t: "lantern", x: -3.5, z: -14 }, { t: "lantern", x: 3.5, z: -14 }],
  dummies: [],
  npcs: [],
  items: [
    { kind: "dumpling", x: -13, z: 0 },
    { kind: "dumpling", x: 13, z: 0 },
  ],
  enemySpawns: [],
  boss: { x: 0, z: 6, facing: Math.PI },
};

export const LEVELS = { training, valley, forest, arena };
