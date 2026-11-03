/**
 * Whispering Woods: The Eight Notes — static layout data.
 *
 * Everything the simulation (sim.js) and the renderer (world.js) must agree
 * on lives here: map bounds, the ground height field, trails, landmarks
 * (built from a tiny "parts" DSL so collision and visuals come from the same
 * numbers), the eight notes and the monster's navigation points.
 *
 * Coordinates: metres, +x east, -z north. A landmark's parts are given in its
 * local frame and rotated by `rot` about +Y (Three.js convention).
 */

export const HALF = 74; // playable square is [-HALF, HALF]²
export const START = { x: 0, z: 66, yaw: 0 }; // yaw 0 looks north (-z)
export const EYE = 1.62;
export const PLAYER_R = 0.35;
export const MONSTER_R = 0.45;

export const BEST_KEY = "whispering-woods-best";
export const SETTINGS_KEY = "whispering-woods-settings";

/* ------------------------------------------------------------------ ground */
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ trails */
// Each trail is a polyline. Trees never grow within TRAIL_CLEAR of a trail,
// so trails double as guaranteed-walkable corridors.
export const TRAIL_CLEAR = 2.4;
export const TRAILS = [
  // main trail: south clearing → north gate
  [[0, 70], [4, 52], [-3, 32], [-8, 16], [1, -4], [-2, -26], [5, -46], [0, -62], [0, -71]],
  [[-3, 32], [-22, 32], [-37, 32]], // → cabin
  [[4, 52], [20, 50], [33, 46]], // → old truck
  [[1, -4], [22, -8], [45, -6]], // → broken fence
  [[22, -8], [38, -26], [45, -45]], // → woodshed
  [[-2, -26], [-26, -28], [-45, -30]], // → well
  [[5, -46], [16, -40]], // → standing stone
  [[0, -62], [-14, -56]], // → hollow tree
];

/* ------------------------------------------------------------------ landmarks */
// Part kinds: box {w,h,d}, cyl {rt,rb,h,seg}, prism {w,d,h} (triangular,
// ridge along x), rock {r, sy}. y is the part's centre (prism/rock: base).
// `c` (collide) turns a part into a collider: box → oriented box, cyl/rock →
// circle (radius `cr` or the part's radius). `m` names a material.
const R90 = Math.PI / 2;

export const LANDMARKS = [
  {
    id: "cabin",
    name: "the abandoned cabin",
    x: -44, z: 32, rot: 0, clear: 8.5,
    parts: [
      // floor + walls (door gap in the east wall)
      { k: "box", x: 0, y: 0.05, z: 0, w: 7, h: 0.1, d: 6, m: "darkwood" },
      { k: "box", x: -3.5, y: 1.4, z: 0, w: 0.22, h: 2.8, d: 6.2, m: "wood", c: 1 },
      { k: "box", x: 0, y: 1.4, z: -3, w: 7.2, h: 2.8, d: 0.22, m: "wood", c: 1 },
      { k: "box", x: 0, y: 1.4, z: 3, w: 7.2, h: 2.8, d: 0.22, m: "wood", c: 1 },
      { k: "box", x: 3.5, y: 1.4, z: -1.95, w: 0.22, h: 2.8, d: 2.3, m: "wood", c: 1 },
      { k: "box", x: 3.5, y: 1.4, z: 1.95, w: 0.22, h: 2.8, d: 2.3, m: "wood", c: 1 },
      { k: "box", x: 3.5, y: 2.5, z: 0, w: 0.22, h: 0.6, d: 1.8, m: "wood" },
      // broken windows (dark panes) and a hanging door
      { k: "box", x: 0.8, y: 1.6, z: 3.12, w: 1.1, h: 0.8, d: 0.04, m: "glass" },
      { k: "box", x: -1.4, y: 1.6, z: -3.12, w: 1.1, h: 0.8, d: 0.04, m: "glass" },
      { k: "box", x: 4.1, y: 1.05, z: 1.3, w: 0.08, h: 2.0, d: 1.2, ry: 0.9, m: "darkwood" },
      // roof
      { k: "prism", x: 0, y: 2.8, z: 0, w: 7.2, d: 6.2, h: 1.6, m: "wood" },
      { k: "box", x: 0, y: 3.62, z: -1.62, w: 7.8, h: 0.12, d: 3.7, rx: -0.48, m: "roof" },
      { k: "box", x: 0, y: 3.62, z: 1.62, w: 7.8, h: 0.12, d: 3.7, rx: 0.48, m: "roof" },
      // porch step
      { k: "box", x: 4.1, y: 0.12, z: 0, w: 1.0, h: 0.24, d: 1.8, m: "darkwood" },
      // furniture
      { k: "box", x: 0.4, y: 0.42, z: -2.1, w: 1.6, h: 0.08, d: 0.9, m: "wood", c: 1 },
      { k: "box", x: 0.4, y: 0.2, z: -2.1, w: 1.4, h: 0.4, d: 0.7, m: "darkwood" },
      { k: "box", x: -2.5, y: 0.3, z: 2.0, w: 1.8, h: 0.35, d: 1.0, m: "cloth", c: 1 },
      { k: "box", x: 1.2, y: 0.25, z: 1.6, w: 0.5, h: 0.5, d: 0.5, rx: 0, ry: 0.4, m: "darkwood" },
      { k: "box", x: 2.6, y: 1.6, z: -2.75, w: 1.4, h: 0.06, d: 0.35, m: "darkwood" },
    ],
  },
  {
    id: "truck",
    name: "the rusted truck",
    x: 40, z: 46, rot: -1.3, clear: 6.5,
    parts: [
      { k: "box", x: -1.0, y: 0.95, z: 0, w: 3.2, h: 0.9, d: 2.0, m: "rust" },
      { k: "box", x: -1.0, y: 1.42, z: 0, w: 3.0, h: 0.06, d: 1.8, m: "metal" },
      { k: "box", x: 1.5, y: 1.45, z: 0, w: 1.8, h: 1.5, d: 1.9, m: "rust" },
      { k: "box", x: 2.42, y: 1.72, z: 0, w: 0.06, h: 0.6, d: 1.6, m: "glass" },
      { k: "box", x: 2.9, y: 1.0, z: 0, w: 1.0, h: 0.8, d: 1.9, rz: -0.04, m: "rust" },
      { k: "box", x: 0.4, y: 0.75, z: 0, w: 6.0, h: 0.4, d: 2.1, c: 1, m: "metal" },
      { k: "cyl", x: 2.4, y: 0.45, z: 1.0, rt: 0.45, rb: 0.45, h: 0.3, rx: R90, m: "tire", seg: 10 },
      { k: "cyl", x: 2.4, y: 0.45, z: -1.0, rt: 0.45, rb: 0.45, h: 0.3, rx: R90, m: "tire", seg: 10 },
      { k: "cyl", x: -1.8, y: 0.45, z: 1.0, rt: 0.45, rb: 0.45, h: 0.3, rx: R90, m: "tire", seg: 10 },
      // missing rear-left wheel: the rim lies in the grass
      { k: "cyl", x: -2.4, y: 0.12, z: -2.0, rt: 0.42, rb: 0.42, h: 0.22, m: "tire", seg: 10 },
      { k: "box", x: 1.5, y: 1.2, z: 0.96, w: 1.2, h: 0.9, d: 0.04, m: "metal" },
    ],
  },
  {
    id: "fence",
    name: "the broken fence",
    x: 52, z: -6, rot: 0, clear: 3,
    parts: (() => {
      const p = [];
      // posts every 2.4 m from z=-14 to 14; gap between z=-1 and 2.6
      for (let z = -14; z <= 14.01; z += 2.4) {
        const zz = Math.round(z * 10) / 10;
        if (zz > -0.9 && zz < 2.5) continue;
        p.push({ k: "box", x: 0, y: 0.75, z: zz, w: 0.18, h: 1.5, d: 0.18, m: "darkwood", ry: (zz * 7) % 0.2 });
      }
      p.push({ k: "box", x: 0, y: 0.75, z: -1.0, w: 0.2, h: 1.5, d: 0.2, m: "darkwood" });
      p.push({ k: "box", x: 0, y: 0.6, z: 2.6, w: 0.2, h: 1.2, d: 0.2, m: "darkwood", rz: 0.25 });
      // rails (colliders) — two intact runs
      for (const [z0, z1] of [[-14, -1], [2.6, 14]]) {
        const zc = (z0 + z1) / 2, d = z1 - z0;
        p.push({ k: "box", x: 0, y: 1.2, z: zc, w: 0.08, h: 0.12, d, m: "wood" });
        p.push({ k: "box", x: 0, y: 0.6, z: zc, w: 0.08, h: 0.12, d, m: "wood" });
        p.push({ k: "box", x: 0, y: 0.75, z: zc, w: 0.2, h: 1.5, d, m: "none", c: 1 });
      }
      // fallen planks in the gap
      p.push({ k: "box", x: -0.6, y: 0.05, z: 0.6, w: 0.1, h: 0.08, d: 2.6, ry: 0.5, m: "wood" });
      p.push({ k: "box", x: 0.5, y: 0.05, z: 1.2, w: 0.1, h: 0.08, d: 2.2, ry: -0.3, m: "wood" });
      p.push({ k: "box", x: 0, y: 0.95, z: -0.3, w: 0.08, h: 0.12, d: 1.6, rx: 0.6, m: "wood" });
      return p;
    })(),
  },
  {
    id: "camp",
    name: "the empty campsite",
    x: -14, z: 10, rot: 0.3, clear: 6,
    parts: [
      { k: "prism", x: -1.2, y: 0, z: -0.6, w: 2.6, d: 2.2, h: 1.6, m: "tent" },
      { k: "box", x: -1.2, y: 0.8, z: -0.6, w: 2.6, h: 1.6, d: 1.8, m: "none", c: 1 },
      { k: "cyl", x: 1.4, y: 0.06, z: 0.9, rt: 0.55, rb: 0.6, h: 0.12, m: "stone", seg: 8 },
      { k: "cyl", x: 1.4, y: 0.16, z: 0.9, rt: 0.08, rb: 0.08, h: 1.0, rz: R90, ry: 0.6, m: "char", seg: 5 },
      { k: "cyl", x: 1.4, y: 0.16, z: 0.9, rt: 0.08, rb: 0.08, h: 1.0, rz: R90, ry: -0.7, m: "char", seg: 5 },
      { k: "cyl", x: 1.6, y: 0.22, z: 2.5, rt: 0.22, rb: 0.22, h: 1.6, rz: R90, m: "darkwood", seg: 7, c: 1, cr: 0.5 },
      { k: "cyl", x: 3.0, y: 0.22, z: 0.4, rt: 0.22, rb: 0.22, h: 1.4, rz: R90, ry: R90, m: "darkwood", seg: 7, c: 1, cr: 0.45 },
      // sign post the note is pinned to (faces +x towards the trail)
      { k: "box", x: 2.6, y: 0.75, z: -1.6, w: 0.12, h: 1.5, d: 0.12, m: "darkwood", c: 1, cr: 0.2 },
      { k: "box", x: 2.66, y: 1.3, z: -1.6, w: 0.05, h: 0.5, d: 0.7, m: "wood" },
      { k: "box", x: 0.2, y: 0.25, z: -2.2, w: 0.5, h: 0.5, d: 0.5, ry: 0.3, m: "darkwood" },
    ],
  },
  {
    id: "well",
    name: "the old well",
    x: -50, z: -30, rot: 0, clear: 4.5,
    parts: [
      { k: "cyl", x: 0, y: 0.45, z: 0, rt: 1.0, rb: 1.05, h: 0.9, m: "stone", seg: 10, c: 1, cr: 1.1 },
      { k: "cyl", x: 0, y: 0.9, z: 0, rt: 0.78, rb: 0.78, h: 0.02, m: "void", seg: 10 },
      { k: "box", x: 0.95, y: 1.15, z: 0, w: 0.15, h: 2.3, d: 0.15, m: "darkwood" },
      { k: "box", x: -0.95, y: 1.15, z: 0, w: 0.15, h: 2.3, d: 0.15, m: "darkwood" },
      { k: "cyl", x: 0, y: 2.0, z: 0, rt: 0.06, rb: 0.06, h: 1.9, rz: R90, m: "wood", seg: 6 },
      { k: "prism", x: 0, y: 2.25, z: 0, w: 2.4, d: 1.6, h: 0.7, m: "roof" },
      { k: "cyl", x: 0.2, y: 1.4, z: 0, rt: 0.01, rb: 0.01, h: 1.2, m: "rope", seg: 3 },
      { k: "cyl", x: 0.2, y: 0.7, z: 0, rt: 0.16, rb: 0.13, h: 0.28, m: "metal", seg: 8 },
    ],
  },
  {
    id: "stone",
    name: "the standing stone",
    x: 22, z: -36, rot: -0.7, clear: 5,
    parts: [
      { k: "box", x: 0, y: 1.6, z: 0, w: 2.4, h: 3.2, d: 1.0, rz: 0.04, m: "stone", c: 1 },
      { k: "rock", x: 2.4, y: 0, z: -0.9, r: 1.4, sy: 0.8, m: "stone", c: 1, cr: 1.3 },
      { k: "rock", x: -2.5, y: 0, z: -1.2, r: 1.2, sy: 0.9, m: "stone", c: 1, cr: 1.1 },
      { k: "rock", x: -0.6, y: 0, z: -2.6, r: 1.5, sy: 0.7, m: "stone", c: 1, cr: 1.4 },
      { k: "rock", x: 1.6, y: 0, z: 1.8, r: 0.5, sy: 0.6, m: "stone" },
      { k: "rock", x: -1.9, y: 0, z: 1.4, r: 0.4, sy: 0.6, m: "stone" },
    ],
  },
  {
    id: "hollow",
    name: "the hollow tree",
    x: -20, z: -54, rot: 0, clear: 5,
    parts: [
      { k: "cyl", x: 0, y: 4.5, z: 0, rt: 0.6, rb: 1.3, h: 9, m: "deadwood", seg: 9, c: 1, cr: 1.35 },
      { k: "cyl", x: 0, y: 1.0, z: -1.24, rt: 0.02, rb: 0.5, h: 1.6, rx: -0.15, m: "void", seg: 6 },
      { k: "cyl", x: 1.7, y: 7.4, z: 0.3, rt: 0.08, rb: 0.3, h: 4.2, rz: -0.9, m: "deadwood", seg: 6 },
      { k: "cyl", x: -1.5, y: 6.6, z: -0.4, rt: 0.07, rb: 0.28, h: 3.6, rz: 0.95, m: "deadwood", seg: 6 },
      { k: "cyl", x: 0.2, y: 8.4, z: 1.4, rt: 0.06, rb: 0.22, h: 3.0, rx: 0.8, m: "deadwood", seg: 6 },
      { k: "cyl", x: 1.4, y: 0.25, z: 0.9, rt: 0.08, rb: 0.3, h: 2.2, rz: -1.35, ry: 0.5, m: "deadwood", seg: 5 },
      { k: "cyl", x: -1.3, y: 0.25, z: 1.0, rt: 0.08, rb: 0.3, h: 2.2, rz: 1.35, ry: -0.6, m: "deadwood", seg: 5 },
      // hanging twig charms
      { k: "cyl", x: 2.2, y: 5.0, z: 0.3, rt: 0.01, rb: 0.01, h: 1.6, m: "rope", seg: 3 },
      { k: "box", x: 2.2, y: 4.1, z: 0.3, w: 0.04, h: 0.6, d: 0.04, m: "deadwood" },
      { k: "box", x: 2.2, y: 4.2, z: 0.3, w: 0.4, h: 0.04, d: 0.04, rz: 0.2, m: "deadwood" },
      { k: "cyl", x: -2.0, y: 4.6, z: -0.4, rt: 0.01, rb: 0.01, h: 1.4, m: "rope", seg: 3 },
      { k: "box", x: -2.0, y: 3.8, z: -0.4, w: 0.04, h: 0.5, d: 0.04, m: "deadwood" },
      { k: "box", x: -2.0, y: 3.9, z: -0.4, w: 0.34, h: 0.04, d: 0.04, rz: -0.3, m: "deadwood" },
    ],
  },
  {
    id: "shed",
    name: "the woodshed",
    x: 51, z: -47, rot: -R90, clear: 5.5,
    parts: [
      { k: "box", x: 0, y: 0.04, z: 0, w: 4.2, h: 0.08, d: 3.2, m: "darkwood" },
      { k: "box", x: 0, y: 1.2, z: -1.6, w: 4.4, h: 2.4, d: 0.18, m: "wood", c: 1 },
      { k: "box", x: -2.1, y: 1.2, z: 0, w: 0.18, h: 2.4, d: 3.2, m: "wood", c: 1 },
      { k: "box", x: 2.1, y: 1.2, z: 0, w: 0.18, h: 2.4, d: 3.2, m: "wood", c: 1 },
      { k: "box", x: -1.9, y: 1.2, z: 1.55, w: 0.14, h: 2.4, d: 0.14, m: "darkwood" },
      { k: "box", x: 1.9, y: 1.2, z: 1.55, w: 0.14, h: 2.4, d: 0.14, m: "darkwood" },
      { k: "box", x: 0, y: 2.55, z: 0.1, w: 4.8, h: 0.1, d: 3.8, rx: 0.14, m: "roof" },
      // woodpile against the left wall
      { k: "box", x: -1.4, y: 0.45, z: 0, w: 1.1, h: 0.9, d: 2.6, m: "logs", c: 1 },
      { k: "box", x: 1.6, y: 0.4, z: 0.9, w: 0.5, h: 0.8, d: 0.5, m: "darkwood" },
      { k: "cyl", x: 0.9, y: 0.3, z: 0.5, rt: 0.3, rb: 0.32, h: 0.6, m: "wood", seg: 8 },
    ],
  },
];

/* ------------------------------------------------------------------ exit gate */
export const GATE = {
  x: 0, z: -73.6,
  halfOpening: 2.3, // half-width of the passage
  winZ: -73.0, // cross this (while open, |x| < halfOpening-0.1) to escape
};

/* ------------------------------------------------------------------ notes */
// `at` local [x, y, z] on a landmark surface, `ry` local facing (a plane faces
// +z at ry=0), `stand` local [x, z] a clear spot from which to read it.
export const NOTES = [
  { lm: "cabin", at: [-3.37, 1.5, -0.6], ry: R90, tilt: 0.06, stand: [-2.2, -0.4], text: "It doesn't walk. It arrives." },
  { lm: "truck", at: [1.5, 1.25, 0.99], ry: 0, tilt: -0.12, stand: [1.4, 2.4], text: "Don't hold its gaze. It feeds on being seen." },
  { lm: "fence", at: [-0.11, 1.05, -1.0], ry: -R90, tilt: 0.1, stand: [-1.6, -0.6], text: "The trees were never this close together." },
  { lm: "camp", at: [2.69, 1.3, -1.6], ry: R90, tilt: -0.05, stand: [4.2, -1.2], text: "It took the others while they slept." },
  { lm: "well", at: [1.035, 1.35, 0], ry: R90, tilt: 0.08, stand: [2.4, 0.4], text: "I heard my name from inside the well." },
  { lm: "stone", at: [0.3, 1.6, 0.51], ry: 0, tilt: 0.04, stand: [0.4, 2.0], text: "Every page you take, it grows closer." },
  { lm: "hollow", at: [1.23, 1.5, 0.15], ry: R90, tilt: -0.07, stand: [2.6, 0.6], text: "Keep the light moving. Never stop." },
  { lm: "shed", at: [0.5, 1.5, -1.5], ry: 0, tilt: 0.05, stand: [0.4, 0.2], text: "The gate opens only when all eight are taken." },
];

export const NOTE_REACH = 2.6;

/* ------------------------------------------------------------------ helpers */
export function toWorld(lm, x, z) {
  const c = Math.cos(lm.rot), s = Math.sin(lm.rot);
  return { x: lm.x + x * c + z * s, z: lm.z - x * s + z * c };
}
export const LM = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));

/** Ground height. Gentle rolling terrain, flattened at landmarks, trails, start and gate. */
export function groundY(x, z) {
  let h = 0.42 * Math.sin(x * 0.071 + 1.3) * Math.cos(z * 0.063) + 0.26 * Math.sin(x * 0.13 + z * 0.11) + 0.12 * Math.cos(x * 0.29 - z * 0.23);
  let flat = 1;
  for (const l of LANDMARKS) {
    const d = Math.hypot(x - l.x, z - l.z);
    flat = Math.min(flat, smooth(l.clear * 0.55, l.clear + 4, d));
  }
  flat = Math.min(flat, smooth(4, 10, Math.hypot(x - GATE.x, z - GATE.z)));
  return h * flat;
}

/* ------------------------------------------------------------------ monster nav */
// Predefined navigation points: trail vertices plus forest clearings. The
// monster wanders between them and reappears at them.
export const NAV_EXTRA = [
  [-30, 55], [-55, 60], [-60, 10], [-30, 12], [-62, -50], [-38, -62], [-40, -10], [-15, -40],
  [25, 62], [58, 62], [60, 22], [25, 20], [32, 8], [62, -22], [38, -60], [20, -62], [12, 32], [-20, 48],
];
