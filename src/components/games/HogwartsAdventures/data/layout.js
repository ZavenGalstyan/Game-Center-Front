/**
 * World layout — the single source of truth for collision (engine) and
 * scenery (render). Units are metres; +x east, +z south, y up.
 *
 *   Courtyard          x[-21,21]   z[-21,21]     spawn, fountain, cloisters
 *   Great Hall         x[-14,14]   z[-64,-21]    Dumbledore, dais, candles
 *   Library wing       x[-66,-21]  z[-26,26]     shelves, Restricted Section
 *   Classroom wing     x[21,66]    z[-26,26]     Charms room (N), Duelling Hall (S)
 *   Hidden complex     x[-160,-66] z[-96,10]     corridor → puzzle room → chasm →
 *                                                mirror hall → platform shaft →
 *                                                antechamber → Founders' Vault
 *   Grounds            z[21,230]                 Hagrid's hut, paths
 *   Forbidden Forest   x[-175,-58] z[92,230]     web gate, tracks, spiders, camp, shrine
 *   Practice Pitch     around (100,125)          hoops, stands, platform tower
 *   Duel Arena         around (0,-420)           the final confrontation (Portkey only)
 *
 * Everything axis-aligned: boxes {x0,x1,z0,z1,y0,y1}, circles {x,z,r,y0,y1},
 * pits (ground drops away) and one keep-inside ring (the arena).
 */
import { rng, segDist } from "../engine/math.js";

export const T = 1.2; // wall thickness

const boxes = [];
const circles = [];

/** A wall running along x at `z`, with door gaps [[a,b]] along x. */
function wallX(x0, x1, z, h, gaps = [], o = {}) {
  let a = x0;
  const segs = [...gaps].sort((p, q) => p[0] - q[0]);
  for (const [g0, g1] of segs) {
    if (g0 > a) boxes.push({ x0: a, x1: g0, z0: z - T / 2, z1: z + T / 2, y0: 0, y1: h, kind: "wall", ...o });
    // lintel over the doorway (camera blocker, never touches the player)
    if (o.lintel !== false) boxes.push({ x0: g0, x1: g1, z0: z - T / 2, z1: z + T / 2, y0: o.doorH || 4.2, y1: h, kind: "wall", lintel: true, ...o });
    a = g1;
  }
  if (x1 > a) boxes.push({ x0: a, x1, z0: z - T / 2, z1: z + T / 2, y0: 0, y1: h, kind: "wall", ...o });
}
/** A wall running along z at `x`, with door gaps [[a,b]] along z. */
function wallZ(z0, z1, x, h, gaps = [], o = {}) {
  let a = z0;
  const segs = [...gaps].sort((p, q) => p[0] - q[0]);
  for (const [g0, g1] of segs) {
    if (g0 > a) boxes.push({ x0: x - T / 2, x1: x + T / 2, z0: a, z1: g0, y0: 0, y1: h, kind: "wall", ...o });
    if (o.lintel !== false) boxes.push({ x0: x - T / 2, x1: x + T / 2, z0: g0, z1: g1, y0: o.doorH || 4.2, y1: h, kind: "wall", lintel: true, ...o });
    a = g1;
  }
  if (z1 > a) boxes.push({ x0: x - T / 2, x1: x + T / 2, z0: a, z1, y0: 0, y1: h, kind: "wall", ...o });
}
const solid = (x0, x1, z0, z1, y1, o = {}) => boxes.push({ x0, x1, z0, z1, y0: o.y0 ?? 0, y1, kind: o.kind || "furn", ...o });
const col = (x, z, r, y1, o = {}) => circles.push({ x, z, r, y0: o.y0 ?? 0, y1, ...o });

/* ================================================================ castle */
const CH = 12; // castle wall height
const GHH = 16; // great hall
const HH = 7; // hidden complex

// Great Hall
wallZ(-64, -21, -14, GHH, [], { mat: "castle", room: "gh" });
wallZ(-64, -21, 14, GHH, [], { mat: "castle", room: "gh" });
wallX(-14, 14, -64, GHH, [], { mat: "castle", room: "gh" });
wallX(-14, 14, -21, GHH, [[-3, 3]], { mat: "castle", room: "gh", doorH: 6 });
// courtyard north shoulders
wallX(-21, -14, -21, CH, [], { mat: "castle" });
wallX(14, 21, -21, CH, [], { mat: "castle" });
// gatehouse (south)
wallX(-21, 21, 21, CH, [[-4, 4]], { mat: "castle", doorH: 6 });
col(-6.6, 21, 2.6, 16, { kind: "tower", mat: "castle" });
col(6.6, 21, 2.6, 16, { kind: "tower", mat: "castle" });

/** Decorative towers and turrets (render); `solid` ones touch walkable ground. */
export const TOWERS = [
  { x: -6.6, z: 21, r: 2.6, h: 16, roof: 7 },
  { x: 6.6, z: 21, r: 2.6, h: 16, roof: 7 },
  { x: -21, z: -21, r: 1.9, h: 15, roof: 5, solid: true },
  { x: 21, z: -21, r: 1.9, h: 15, roof: 5, solid: true },
  { x: -21, z: 21, r: 1.9, h: 15, roof: 5, solid: true },
  { x: 21, z: 21, r: 1.9, h: 15, roof: 5, solid: true },
  { x: -66, z: 26, r: 4.2, h: 24, roof: 10, solid: true },
  { x: 66, z: 26, r: 4.2, h: 24, roof: 10, solid: true },
  { x: -66, z: -26, r: 4, h: 26, roof: 10 },
  { x: 66, z: -26, r: 4, h: 26, roof: 10 },
  { x: -14, z: -64, r: 3, h: 22, roof: 8 },
  { x: 14, z: -64, r: 3, h: 22, roof: 8 },
  { x: 42, z: -44, r: 6, h: 44, roof: 16, big: true },
  { x: -40, z: -42, r: 5, h: 34, roof: 13 },
  { x: 0, z: -80, r: 4.5, h: 30, roof: 12 },
  { x: -120, z: 26, r: 3.4, h: 18, roof: 8, solid: true },
  { x: 120, z: 26, r: 3.4, h: 18, roof: 8, solid: true },
];
for (const t of TOWERS) if (t.solid) col(t.x, t.z, t.r, t.h, { kind: "tower", mat: "castle" });

// Library wing
wallX(-66, -21, -26, CH, [], { mat: "castle", room: "west" });
wallX(-66, -21, 26, CH, [], { mat: "castle", room: "west" });
wallZ(-26, 26, -21, CH, [[-3, 3]], { mat: "castle", room: "west", doorH: 5 });
wallZ(-26, -12, -66, CH, [], { mat: "castle", room: "west" });
wallZ(12, 26, -66, CH, [], { mat: "castle", room: "west" });
wallZ(-12, 12, -66, CH, [[-2, 2]], { mat: "castle", room: "west", doorH: 3.6 }); // tapestry passage
// Restricted Section partition
wallZ(-12, 12, -56, CH, [[-2, 2]], { mat: "castle", room: "west", doorH: 4 });
wallX(-66, -56, -12, CH, [], { mat: "castle", room: "west" });
wallX(-66, -56, 12, CH, [], { mat: "castle", room: "west" });
solid(-66, -56, -26, -12, CH, { kind: "wall", mat: "castle", fill: true });
solid(-66, -56, 12, 26, CH, { kind: "wall", mat: "castle", fill: true });

// Classroom wing
wallX(21, 66, -26, CH, [], { mat: "castle", room: "east" });
wallX(21, 66, 26, CH, [], { mat: "castle", room: "east" });
wallZ(-26, 26, 66, CH, [], { mat: "castle", room: "east" });
wallZ(-26, 26, 21, CH, [[-3, 3]], { mat: "castle", room: "east", doorH: 5 });
wallX(21, 66, -4, CH, [[40, 44]], { mat: "castle", room: "east", doorH: 3.8 });
wallX(21, 66, 4, CH, [[40, 44]], { mat: "castle", room: "east", doorH: 3.8 });

// Hidden complex (behind the Restricted Section, running west then north)
const HO = { mat: "hidden", room: "hidden" };
wallX(-78, -66, -3, HH, [], HO); // tapestry corridor
wallX(-78, -66, 3, HH, [], HO);
wallX(-96, -78, -10, HH, [[-89, -85]], { ...HO, doorH: 4 }); // puzzle room
wallX(-96, -78, 10, HH, [], HO);
wallZ(-10, 10, -96, HH, [], HO);
wallZ(-10, 10, -78, HH, [[-3, 3]], { ...HO, doorH: 4 });
wallZ(-40, -10, -91, HH, [], HO); // chasm hall
wallZ(-40, -10, -83, HH, [], HO);
wallX(-100, -74, -40, HH, [[-91, -83]], { ...HO, doorH: 5 }); // mirror hall
wallX(-100, -74, -62, HH, [], HO);
wallZ(-62, -40, -74, HH, [], HO);
wallZ(-62, -40, -100, HH, [[-53, -49]], { ...HO, doorH: 4 });
wallX(-132, -100, -56, HH, [], HO); // platform shaft
wallX(-132, -100, -46, HH, [], HO);
wallX(-156, -132, -38, HH, [], HO); // antechamber
wallX(-156, -132, -64, HH, [[-146, -142]], { ...HO, doorH: 4.6 });
wallZ(-64, -38, -156, HH, [], HO);
wallZ(-64, -38, -132, HH, [[-56, -46]], { ...HO, doorH: 5 });
wallX(-160, -128, -96, HH, [], HO); // vault
wallZ(-96, -64, -160, HH, [], HO);
wallZ(-96, -64, -128, HH, [], HO);
wallX(-160, -156, -64, HH, [], HO);
wallX(-132, -128, -64, HH, [], HO);

// outer south facade + world bounds
wallX(-176, -66, 26, CH, [], { mat: "castle", outer: true });
wallX(66, 176, 26, CH, [], { mat: "castle", outer: true });
wallZ(26, 232, -176, 10, [], { invisible: true, lintel: false });
wallZ(26, 232, 176, 10, [], { invisible: true, lintel: false });
wallX(-176, 176, 232, 10, [], { invisible: true, lintel: false });

/* ================================================================ furniture */
// Great Hall: four house tables (+ benches), dais, staff table
export const GH_TABLES = [-10, -5, 5, 10];
for (const x of GH_TABLES) solid(x - 1.25, x + 1.25, -52, -27, 0.8, { prop: "houseTable" });
solid(-13.4, 13.4, -57, -56, 0.3, { kind: "floor", prop: "step" });
solid(-13.4, 13.4, -63.4, -57, 0.6, { kind: "floor", prop: "dais" });
solid(-9, 9, -60.6, -59.4, 1.4, { y0: 0.6, prop: "staffTable" });
// courtyard
col(0, 0, 3.3, 1.0, { prop: "fountain" });
for (const [x, z] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) col(x, z, 0.9, 9, { prop: "tree" });
export const ARCADE = [];
for (const v of [-16, -11, -6, 6, 11, 16]) {
  ARCADE.push([v, -18], [v, 18], [-18, v], [18, v]);
}
for (const [x, z] of ARCADE) col(x, z, 0.45, 5.2, { prop: "column" });
// Library shelves
export const SHELVES = [];
for (const [a, b] of [[-53, -44], [-41, -32]]) for (const z of [-20, -14, -8, 8, 14, 20]) SHELVES.push({ x0: a, x1: b, z0: z - 0.55, z1: z + 0.55, h: 4.4 });
SHELVES.push({ x0: -65.2, x1: -58, z0: -10.6, z1: -9.4, h: 4.4 }, { x0: -65.2, x1: -58, z0: 8.4, z1: 9.6, h: 4.4, restricted: true });
for (const s of SHELVES) solid(s.x0, s.x1, s.z0, s.z1, s.h, { prop: "shelf" });
solid(-30, -28, -9.6, -6.4, 1.05, { prop: "desk" });
for (const z of [10, 16]) solid(-29, -25, z - 1, z + 1, 0.85, { prop: "readTable" });
// Charms classroom desks
export const DESKS = [];
for (const x of [29, 35, 53, 59]) for (const z of [-18, -12]) DESKS.push([x, z]);
for (const [x, z] of DESKS) solid(x - 1.6, x + 1.6, z - 0.6, z + 0.6, 0.85, { prop: "classDesk" });
solid(41, 47, -25.4, -24, 1.1, { prop: "podium" });
// Duelling hall: Snape's potion cabinet
solid(62.5, 65.4, 8, 12, 2.6, { prop: "cabinet" });
// Hidden complex furniture
solid(-88.5, -85.5, -61.4, -60.9, 4.6, { prop: "mirrorFrame" });
export const BRAZIERS = [
  { id: "brazier_1", x: -96.5, z: -58.5 },
  { id: "brazier_2", x: -77.5, z: -58.5 },
  { id: "brazier_3", x: -96.5, z: -43.5 },
  { id: "brazier_4", x: -77.5, z: -43.5 },
];
for (const b of BRAZIERS) col(b.x, b.z, 0.55, 1.3, { prop: "brazier" });
col(-144, -80, 1.0, 1.2, { prop: "pedestal" });
for (const [x, z] of [[-152, -90], [-136, -90], [-152, -70], [-136, -70]]) col(x, z, 0.8, HH, { prop: "vaultPillar" });
for (const [x, z] of [[-150, -44], [-138, -44], [-150, -58], [-138, -58]]) col(x, z, 0.7, HH, { prop: "antePillar" });

/* ================================================================ grounds */
// Hagrid's hut
col(-45, 70, 4.6, 5.5, { prop: "hut" });
for (const [x, z] of [[-37, 74], [-36, 77], [-38.5, 79], [-35, 80.5]]) col(x, z, 0.75, 0.9, { prop: "pumpkin" });
// Forbidden Forest edge thicket (one gap — the web gate at x[-84,-78])
const thick = { kind: "thicket", lintel: false };
boxes.push({ x0: -176, x1: -84, z0: 90.5, z1: 93.5, y0: 0, y1: 7, ...thick });
boxes.push({ x0: -78, x1: -57, z0: 90.5, z1: 93.5, y0: 0, y1: 7, ...thick });
boxes.push({ x0: -60, x1: -57, z0: 92, z1: 232, y0: 0, y1: 7, ...thick });
// Practice pitch
export const PITCH = { x: 100, z: 125, rx: 42, rz: 26 };
export const STANDS = [[62, 100], [138, 100], [62, 150], [138, 150]];
for (const [x, z] of STANDS) col(x, z, 3.2, 14, { prop: "stand" });
export const HOOPS = [[60, 119, 10], [58, 125, 13], [60, 131, 10], [140, 119, 10], [142, 125, 13], [140, 131, 10]];
for (const [x, z, h] of HOOPS) col(x, z, 0.3, h - 1, { prop: "hoopPole" });
// platform tower
export const TOWER = { x: 100, z: 92, r: 3.5, top: 8 };
col(TOWER.x, TOWER.z, TOWER.r, TOWER.top - 0.4, { prop: "practiceTower" });
solid(93.5, 106, 87, 97, TOWER.top, { y0: TOWER.top - 0.4, kind: "floor", prop: "towerTop" });
// rails on the tower top (keep the player from walking off by accident)
solid(93.5, 106, 86.6, 87, TOWER.top + 1.1, { y0: TOWER.top, prop: "rail" });
solid(93.5, 106, 97, 97.4, TOWER.top + 1.1, { y0: TOWER.top, prop: "rail" });
solid(106, 106.4, 86.6, 97.4, TOWER.top + 1.1, { y0: TOWER.top, prop: "rail" });
solid(93.1, 93.5, 86.6, 89.6, TOWER.top + 1.1, { y0: TOWER.top, prop: "rail" });
solid(93.1, 93.5, 94.4, 97.4, TOWER.top + 1.1, { y0: TOWER.top, prop: "rail" });

/* ================================================================ arena */
export const ARENA = { x: 0, z: -420, r: 27 };
export const ARENA_PILLARS = [];
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
  ARENA_PILLARS.push([ARENA.x + Math.sin(a) * 21, ARENA.z + Math.cos(a) * 21]);
}
for (const [x, z] of ARENA_PILLARS) col(x, z, 1.1, 9, { prop: "arenaPillar" });
export const OBELISKS = [0, 1, 2].map((i) => {
  const a = (i / 3) * Math.PI * 2;
  return { id: `obelisk_${i}`, x: ARENA.x + Math.sin(a) * 13, z: ARENA.z + Math.cos(a) * 13 };
});

/* ================================================================ pits & moving floors */
export const PITS = [
  { x0: -91, x1: -83, z0: -36, z1: -14, id: "chasm" },
  { x0: -128, x1: -104, z0: -56, z1: -46, id: "shaft" },
];
/** Moving platforms: centre path a→b over `period` seconds (ping-pong), box size, phase 0..1. */
export const PLATFORMS = [
  { id: "shaftA", a: [-106, 0, -51], b: [-115.5, 0, -51], w: 4, d: 4, period: 8, phase: 0 },
  { id: "shaftB", a: [-126, 0, -51], b: [-116.5, 0, -51], w: 4, d: 4, period: 8, phase: 0 },
  { id: "towerLift", a: [91.5, 0.2, 92], b: [91.5, TOWER.top, 92], w: 4, d: 4, period: 10, phase: 0, lift: true },
];

/* ================================================================ forest */
export const FOREST = { x0: -175, x1: -58, z0: 92, z1: 232 };
export const FOREST_PATH = [
  [-81, 84],
  [-81, 96],
  [-88, 106],
  [-92, 112],
  [-104, 128],
  [-116, 146],
  [-125, 162],
  [-118, 178],
  [-104, 192],
  [-122, 200],
  [-140, 204],
  [-150, 205],
];
export const FOREST_POI = [
  { id: "hollow", x: -125, z: 165, r: 11 },
  { id: "camp", x: -102, z: 196, r: 9 },
  { id: "shrine", x: -150, z: 205, r: 6.5 },
  { id: "glade", x: -104, z: 128, r: 7 },
];
/** Deterministic tree scatter — collision and render share it. */
export function forestTrees() {
  if (forestTrees.cache) return forestTrees.cache;
  const r = rng(4242);
  const out = [];
  const near = (x, z) => {
    for (let i = 0; i < FOREST_PATH.length - 1; i++) {
      const [ax, az] = FOREST_PATH[i];
      const [bx, bz] = FOREST_PATH[i + 1];
      if (segDist(x, z, ax, az, bx, bz) < 3.6) return true;
    }
    for (const p of FOREST_POI) if (Math.hypot(x - p.x, z - p.z) < p.r) return true;
    return false;
  };
  for (let k = 0; k < 2600 && out.length < 420; k++) {
    const x = r.range(FOREST.x0 + 2, FOREST.x1 - 3);
    const z = r.range(FOREST.z0 + 3, FOREST.z1 - 2);
    if (near(x, z)) continue;
    const s = r.range(0.8, 1.45);
    let ok = true;
    for (const t of out) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (3.2 * Math.max(s, t.s)) ** 2) ok = false;
    if (!ok) continue;
    out.push({ x, z, s, kind: r() < 0.62 ? "oak" : "pine", rot: r() * 6.28 });
  }
  forestTrees.cache = out;
  return out;
}
for (const t of forestTrees()) col(t.x, t.z, 0.55 * t.s, 12, { prop: "forestTree", tree: true });
// rocks + camp tents
export const FOREST_ROCKS = [[-110, 160, 1.6], [-136, 170, 2.0], [-131, 154, 1.3], [-92, 188, 1.4], [-155, 198, 1.8]];
for (const [x, z, s] of FOREST_ROCKS) col(x, z, s * 0.9, s * 1.2, { prop: "rock" });
export const TENTS = [[-108, 200, 0.4], [-96, 202, -0.5]];
for (const [x, z] of TENTS) col(x, z, 1.8, 2.4, { prop: "tent" });
// grounds trees (outside the forest, decoration with collision)
export const GROUND_TREES = [
  [-20, 50], [-28, 46], [22, 52], [30, 60], [-60, 58], [-70, 66], [-12, 96], [12, 110], [40, 150], [30, 180], [-30, 160], [-40, 190], [10, 200], [60, 200], [150, 195], [160, 70], [-100, 50], [-130, 40], [-150, 70], [130, 60],
];
for (const [x, z] of GROUND_TREES) col(x, z, 0.7, 10, { prop: "groundTree", tree: true });

/* ================================================================ regions */
/** First match wins. `indoor` regions hide their roof group from inside. */
export const REGIONS = [
  { id: "arena", name: "The Duelling Ruins", circle: [ARENA.x, ARENA.z, 60], music: "boss", atmos: "arena" },
  { id: "vault", name: "The Founders' Vault", box: [-160, -128, -96, -64], indoor: true, roof: "hidden", music: "hidden", atmos: "hidden", safe: false },
  { id: "antechamber", name: "The Antechamber", box: [-156, -132, -64, -38], indoor: true, roof: "hidden", music: "hidden", atmos: "hidden" },
  { id: "shaft", name: "The Shifting Shaft", box: [-132, -100, -56, -46], indoor: true, roof: "hidden", music: "hidden", atmos: "hidden" },
  { id: "mirrorhall", name: "Hall of the Mirror", box: [-100, -74, -62, -40], indoor: true, roof: "hidden", music: "hidden", atmos: "hidden" },
  { id: "chasm", name: "The Broken Bridge", box: [-91, -83, -40, -10], indoor: true, roof: "hidden", music: "hidden", atmos: "hidden" },
  { id: "corridor", name: "Hidden Corridors", box: [-96, -66, -10, 10], indoor: true, roof: "hidden", music: "hidden", atmos: "hidden" },
  { id: "restricted", name: "The Restricted Section", box: [-66, -56, -12, 12], indoor: true, roof: "west", music: "library", atmos: "library" },
  { id: "library", name: "The Library", box: [-66, -21, -26, 26], indoor: true, roof: "west", music: "library", atmos: "library" },
  { id: "charms", name: "Charms Classroom", box: [21, 66, -26, -4], indoor: true, roof: "east", music: "castle", atmos: "classroom" },
  { id: "duelling", name: "The Duelling Hall", box: [21, 66, 4, 26], indoor: true, roof: "east", music: "castle", atmos: "classroom" },
  { id: "classrooms", name: "Classroom Wing", box: [21, 66, -26, 26], indoor: true, roof: "east", music: "castle", atmos: "classroom" },
  { id: "greathall", name: "The Great Hall", box: [-14, 14, -64, -21], indoor: true, roof: "gh", music: "hall", atmos: "hall" },
  { id: "courtyard", name: "Castle Courtyard", box: [-21, 21, -21, 21], music: "castle", atmos: "courtyard" },
  { id: "forest", name: "The Forbidden Forest", box: [FOREST.x0, FOREST.x1, FOREST.z0, FOREST.z1], music: "forest", atmos: "forest" },
  { id: "pitch", name: "Practice Pitch", box: [50, 152, 82, 165], music: "grounds", atmos: "grounds" },
  { id: "hagrid", name: "Hagrid's Hut", circle: [-45, 72, 20], music: "grounds", atmos: "grounds" },
  { id: "grounds", name: "Hogwarts Grounds", box: [-176, 176, 21, 232], music: "grounds", atmos: "grounds" },
];
/** Roofed volumes (render hides a group while the camera/player is inside). */
export const ROOFS = {
  gh: { x0: -14, x1: 14, z0: -64, z1: -21, y: GHH },
  west: { x0: -66, x1: -21, z0: -26, z1: 26, y: CH },
  east: { x0: 21, x1: 66, z0: -26, z1: 26, y: CH },
  hidden: { x0: -160, x1: -66, z0: -96, z1: 10, y: HH },
};
export const HEIGHTS = { castle: CH, greathall: GHH, hidden: HH };

/* ================================================================ checkpoints */
export const CHECKPOINTS = {
  courtyard: { x: 0, z: 12, yaw: Math.PI, name: "the Courtyard" },
  greathall: { x: 0, z: -26, yaw: Math.PI, name: "the Great Hall" },
  hagrid: { x: -45, z: 84, yaw: 0, name: "Hagrid's Hut" },
  pitch: { x: 100, z: 104, yaw: 0, name: "the Practice Pitch" },
  library: { x: -26, z: 0, yaw: -Math.PI / 2, name: "the Library" },
  corridor: { x: -80, z: 0, yaw: -Math.PI / 2, name: "the Hidden Corridor" },
  mirrorhall: { x: -87, z: -44, yaw: Math.PI, name: "the Hall of the Mirror" },
  antechamber: { x: -136, z: -51, yaw: -Math.PI / 2, name: "the Antechamber" },
  arena: { x: 0, z: -398, yaw: Math.PI, name: "the Duelling Ruins" },
};

/* ================================================================ lights */
export const TORCHES = [];
// courtyard arcade torches
for (const v of [-11, 11]) TORCHES.push({ x: v, y: 3.6, z: -20.2 }, { x: v, y: 3.6, z: 20.2 }, { x: -20.2, y: 3.6, z: v }, { x: 20.2, y: 3.6, z: v });
TORCHES.push({ x: -4.8, y: 4, z: 22.2 }, { x: 4.8, y: 4, z: 22.2 });
// great hall fireplaces + wall sconces
TORCHES.push({ x: -13, y: 0.6, z: -40, kind: "hearth", s: 1.6 }, { x: 13, y: 0.6, z: -40, kind: "hearth", s: 1.6 });
for (const z of [-30, -50]) TORCHES.push({ x: -13.2, y: 4, z }, { x: 13.2, y: 4, z });
// library + classrooms
for (const z of [-22, 22]) TORCHES.push({ x: -24, y: 3.4, z });
TORCHES.push({ x: -57.2, y: 3.4, z: -6 }, { x: -57.2, y: 3.4, z: 6 });
for (const x of [30, 58]) TORCHES.push({ x, y: 3.4, z: -3.2 }, { x, y: 3.4, z: 3.2 });
TORCHES.push({ x: 25, y: 3.4, z: -24.8 }, { x: 63, y: 3.4, z: -24.8 }, { x: 25, y: 3.4, z: 24.8 }, { x: 63, y: 3.4, z: 24.8 });
// hidden complex
TORCHES.push({ x: -72, y: 2.8, z: -2.2 }, { x: -95.2, y: 2.8, z: -6 }, { x: -95.2, y: 2.8, z: 6 }, { x: -82.2, y: 2.8, z: -38 }, { x: -91.8, y: 2.8, z: -12 });
TORCHES.push({ x: -101, y: 2.8, z: -47 }, { x: -131, y: 2.8, z: -47 }, { x: -155.2, y: 2.8, z: -44 }, { x: -155.2, y: 2.8, z: -58 }, { x: -133, y: 2.8, z: -40 });
TORCHES.push({ x: -159.2, y: 3, z: -80 }, { x: -128.8, y: 3, z: -80 });
TORCHES.push({ x: -74.8, y: 2.8, z: -51 }, { x: -99.2, y: 2.8, z: -45 }, { x: -99.2, y: 2.8, z: -57 }, { x: -82, y: 2.8, z: -61.2 }, { x: -92, y: 2.8, z: -61.2 });
TORCHES.push({ x: -148.5, y: 3, z: -63.2 }, { x: -139.5, y: 3, z: -63.2 }, { x: -144, y: 2.8, z: -38.8 }, { x: -144, y: 3, z: -95.2 }, { x: -159.2, y: 3, z: -70 }, { x: -128.8, y: 3, z: -88 });
TORCHES.push({ x: -77.2, y: 2.8, z: 2.2 }, { x: -78.8, y: 2.8, z: -8 }, { x: -83.8, y: 2.8, z: -25 }, { x: -90.2, y: 2.8, z: -25 });
// grounds: Hagrid's lantern, camp fire, pitch braziers
TORCHES.push({ x: -40.5, y: 2.2, z: 74.8, kind: "lantern" });
TORCHES.push({ x: -102, y: 0.2, z: 196, kind: "campfire", s: 1.2 });
for (const [x, z] of [[96, 98], [104, 98]]) TORCHES.push({ x, y: 1.2, z, kind: "brazier" });
// arena braziers (green fire)
for (const [x, z] of ARENA_PILLARS) TORCHES.push({ x: x * 0.88 + ARENA.x * 0.12, y: 1.5, z: z * 0.88 + ARENA.z * 0.12, kind: "darkfire" });

export const LAYOUT = { boxes, circles };
