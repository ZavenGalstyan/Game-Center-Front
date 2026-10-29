/**
 * The four small, flat maps. Everything walkable is at y = 0; props are
 * axis-aligned boxes or circles (engine/world.js turns them into colliders,
 * render/scenery.js into meshes). Missions live in data/missions.js.
 *
 * Coordinates: X/Z ground plane, +Z is "north", yaw 0 looks toward +Z.
 * enemySpawns: {x, z, px, pz} — a spawned soldier patrols between (x,z) and
 * (px,pz) until it notices the player.
 */

/* ---------------------------------------------------------------- 1. Sewer */
const sewer = {
  id: "sewer",
  name: "Sewer Lair",
  theme: "sewer",
  bounds: { type: "rect", x0: -11, z0: -15, x1: 11, z1: 15, wallH: 4.2 },
  spawn: { x: 0, z: -11, yaw: 0 },
  props: [
    // the water channel with a grate bridge leads to Splinter's corner
    { t: "channel", x0: -11, z0: 6, x1: 11, z1: 8.6, style: "water" },
    { t: "bridge", x: 0, z: 7.3, w: 3.4, d: 3.4, style: "grate" },
    { t: "couch", x: -7, z: 12.8, w: 3.2, d: 1.2, h: 0.95 },
    { t: "tv", x: 7.2, z: 13.4, w: 1.8, d: 1, h: 1.5 },
    { t: "crate", x: 10.4, z: 10.6, w: 1.2, d: 1.2, h: 1.1 },
    { t: "barrel", x: -10.45, z: -12.8, r: 0.5, h: 1.1 },
    { t: "barrel", x: -10.45, z: -11.6, r: 0.5, h: 1.1 },
    { t: "barrel", x: 10.45, z: -2.5, r: 0.5, h: 1.1 },
    { t: "crate", x: 10.3, z: -12.5, w: 1.4, d: 1.4, h: 1.3 },
    { t: "crate", x: 10.45, z: -11.1, w: 1.1, d: 1.1, h: 1 },
    { t: "crate", x: -10.4, z: 1.5, w: 1.2, d: 2.4, h: 1 },
    { t: "pipe", x: -10.4, z: -5, r: 0.38, h: 4.2 },
    { t: "pipe", x: 10.4, z: 3, r: 0.38, h: 4.2 },
    { t: "pipe", x: -10.4, z: 10.5, r: 0.38, h: 4.2 },
    { t: "lamp", x: -5, z: -14.4, r: 0.25, h: 3, style: "bulb" },
    { t: "lamp", x: 5, z: -14.4, r: 0.25, h: 3, style: "bulb" },
    { t: "decor", kind: "pizzabox", x: -6.3, z: 11.7 },
    { t: "decor", kind: "pizzabox", x: 6, z: -8 },
    { t: "decor", kind: "puddle", x: -4, z: -6 },
    { t: "decor", kind: "puddle", x: 5, z: 3.5 },
  ],
  dummies: [
    { x: -3.6, z: 1 },
    { x: 0, z: 2.6 },
    { x: 3.6, z: 1 },
  ],
  npcs: [{ id: "splinter", x: 0, z: 12.2, facing: Math.PI }],
  items: [],
  enemySpawns: [],
};

/* ---------------------------------------------------------------- 2. Streets */
const streetProps = [
  // building blocks lining the road (left x<-9, right x>9), alleys between
  { t: "building", x: -15, z: -20.5, w: 12, d: 15, h: 11, style: 0 },
  { t: "building", x: -15, z: 0.5, w: 12, d: 17, h: 14, style: 1 },
  { t: "building", x: -15, z: 21.5, w: 12, d: 13, h: 9, style: 2 },
  { t: "building", x: 15, z: -22.5, w: 12, d: 11, h: 12, style: 3 },
  { t: "building", x: 15, z: -4.5, w: 12, d: 15, h: 10, style: 2 },
  { t: "building", x: 15, z: 20, w: 12, d: 16, h: 13, style: 0 },
  { t: "building", x: 0, z: 29.5, w: 42, d: 5, h: 12, style: 1 },
  { t: "barrier", x: 0, z: -27.4, w: 18, d: 0.8, h: 1.1 },
  // parked cars against the curbs
  { t: "car", x: -7.3, z: -14, w: 1.9, d: 4.2, h: 1.4, color: "#2c6fb5" },
  { t: "car", x: 7.3, z: -8, w: 1.9, d: 4.2, h: 1.4, color: "#d8b02a" },
  { t: "car", x: -7.3, z: 15, w: 1.9, d: 4.2, h: 1.4, color: "#c43a2e" },
  { t: "car", x: 7.3, z: 22, w: 1.9, d: 4.2, h: 1.4, color: "#e8e4dc" },
  { t: "van", x: 0, z: -23.4, w: 2.3, d: 4.6, h: 2.4 },
  { t: "hydrant", x: -8.3, z: -4, r: 0.28, h: 0.8 },
  { t: "hydrant", x: 8.3, z: 15, r: 0.28, h: 0.8 },
  { t: "lamp", x: -8.6, z: -21, r: 0.2, h: 5, style: "street" },
  { t: "lamp", x: -8.6, z: 4, r: 0.2, h: 5, style: "street" },
  { t: "lamp", x: 8.4, z: -14.6, r: 0.2, h: 5, style: "street", flip: true },
  { t: "lamp", x: 8.6, z: 2, r: 0.2, h: 5, style: "street", flip: true },
  { t: "lamp", x: 8.6, z: 25, r: 0.2, h: 5, style: "street", flip: true },
  { t: "dumpster", x: -18, z: -10.4, w: 2.4, d: 1.4, h: 1.3 },
  { t: "dumpster", x: -18.2, z: 12.6, w: 1.4, d: 2.4, h: 1.3 },
  { t: "dumpster", x: 18.4, z: -14.5, w: 1.4, d: 2.4, h: 1.3 },
  { t: "crate", x: 19.2, z: 11.2, w: 1.2, d: 1.2, h: 1 },
  { t: "crate", x: 19, z: 4.2, w: 1, d: 1, h: 0.9 },
  { t: "trash", x: -8.4, z: 9.6, r: 0.32, h: 0.9 },
  { t: "trash", x: 8.4, z: -19, r: 0.32, h: 0.9 },
  { t: "decor", kind: "manhole", x: 0, z: -15 },
  { t: "decor", kind: "manhole", x: 2.5, z: 12 },
  { t: "decor", kind: "puddle", x: -3.5, z: 4 },
];
const streets = {
  id: "streets",
  name: "New York Streets",
  theme: "streets",
  bounds: { type: "rect", x0: -20, z0: -27, x1: 20, z1: 27, wallH: 0 },
  spawn: { x: 0, z: -17, yaw: 0 },
  props: streetProps,
  dummies: [],
  npcs: [],
  items: [
    { kind: "pizza", x: -15, z: 12.2 },
    { kind: "pizza", x: 4.5, z: 5 },
    { kind: "pizza", x: 15, z: -14.2 },
  ],
  enemySpawns: [
    { x: 0, z: 21, px: -4, pz: 14 },
    { x: -15, z: -10.6, px: -11, pz: -10.6 },
    { x: 14, z: -14.6, px: 11, pz: -14.6 },
    { x: -14, z: 12, px: -10.5, pz: 12 },
    { x: 3.5, z: 4, px: -3.5, pz: 0 },
    { x: -2, z: 24, px: 4, pz: 24 },
  ],
  // mission 3: the hostage in the right-hand plaza, guarded
  civilian: { x: 16, z: 7.6, facing: -Math.PI / 2 },
  guards: [
    { kind: "foot", x: 12, z: 5.6, px: 12, pz: 10.4 },
    { kind: "foot", x: 17.6, z: 4.8, px: 17.6, pz: 10.8 },
    { kind: "elite", x: 13.6, z: 8, px: 10.8, pz: 8 },
  ],
  ambush: [
    { x: -13.5, z: -10.6 },
    { x: 13.5, z: -14.6 },
  ],
  safe: { x: 0, z: -19.4, r: 3.4 },
};

/* ---------------------------------------------------------------- 3. Rooftops */
const rooftops = {
  id: "rooftops",
  name: "City Rooftops",
  theme: "rooftops",
  bounds: { type: "rect", x0: -15, z0: -18, x1: 15, z1: 18, wallH: 1.1 },
  spawn: { x: 0, z: -15, yaw: 0 },
  props: [
    // the alley gap between two roofs, crossed by two planks
    { t: "channel", x0: -15, z0: -1.4, x1: 15, z1: 1.4, style: "gap" },
    { t: "bridge", x: -8, z: 0, w: 2.6, d: 3.6, style: "plank" },
    { t: "bridge", x: 7, z: 0, w: 2.6, d: 3.6, style: "plank" },
    { t: "tower", x: 9.5, z: 11.5, r: 1.7, h: 6.5 },
    { t: "hut", x: -10.5, z: 13.8, w: 4, d: 3.2, h: 3 },
    { t: "ac", x: -4.5, z: -12, w: 2, d: 1.6, h: 1.3 },
    { t: "ac", x: 5.5, z: -9, w: 1.6, d: 2, h: 1.3 },
    { t: "ac", x: -9, z: -6, w: 2, d: 1.6, h: 1.3 },
    { t: "ac", x: 3, z: 8, w: 2, d: 1.6, h: 1.3 },
    { t: "skylight", x: -2.5, z: 12.5, w: 3, d: 2, h: 0.7 },
    { t: "chimney", x: 12.2, z: -14.2, r: 0.6, h: 2.4 },
    { t: "chimney", x: -12.5, z: -3.6, r: 0.5, h: 2.1 },
    { t: "pipe", x: 12.6, z: 4.5, r: 0.3, h: 1.6 },
    { t: "decor", kind: "antenna", x: -13.6, z: 16.4 },
    { t: "decor", kind: "vent", x: 0.5, z: -5 },
    { t: "decor", kind: "vent", x: -6, z: 6 },
  ],
  dummies: [],
  npcs: [],
  items: [
    { kind: "pizza", x: -12.6, z: -15.6 },
    { kind: "pizza", x: 12.8, z: 15.6 },
  ],
  enemySpawns: [
    { x: -9, z: 9, px: -3, pz: 6 },
    { x: 10, z: 5, px: 6, pz: 4 },
    { x: 0, z: 15.4, px: 5, pz: 15.4 },
    { x: -11, z: -12, px: -11, pz: -8.5 },
    { x: 11.5, z: -4.5, px: 9, pz: -13 },
  ],
};

/* ---------------------------------------------------------------- 4. Arena */
const pillars = [];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  pillars.push({ t: "pillar", x: +(Math.sin(a) * 11.2).toFixed(2), z: +(Math.cos(a) * 11.2).toFixed(2), r: 0.62, h: 5.4 });
}
const arena = {
  id: "arena",
  name: "Shredder's Tower",
  theme: "arena",
  bounds: { type: "circle", r: 15, wallH: 1.4 },
  spawn: { x: 0, z: -9, yaw: 0 },
  props: [...pillars, { t: "decor", kind: "emblem", x: 0, z: 0 }],
  dummies: [],
  npcs: [],
  items: [
    { kind: "pizza", x: -11.8, z: 0 },
    { kind: "pizza", x: 11.8, z: 0 },
  ],
  enemySpawns: [],
  boss: { x: 0, z: 6, facing: Math.PI },
};

export const LEVELS = { sewer, streets, rooftops, arena };
