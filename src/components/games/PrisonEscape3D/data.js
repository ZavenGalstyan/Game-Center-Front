/**
 * Prison Escape 3D — static world + story data (no Three.js, no DOM).
 *
 * Coordinates are metres on a flat floor: x → east, z → south, y up.
 * Yaw 0 looks north (−z). Everything the sim collides with or the renderer
 * draws is derived from the tables here, so the two can never disagree.
 */

export const SAVE_KEY = "prison-escape-3d-save";
export const SETTINGS_KEY = "prison-escape-3d-settings";
export const SAVE_VERSION = 1;

export const T = 0.3; // wall thickness
export const H_IN = 3.4; // interior wall / ceiling height
export const H_YARD = 4.6;
export const H_OUTER = 5.6;

export const PLAYER = {
  r: 0.32,
  eye: 1.62,
  eyeCrouch: 1.0,
  walk: 3.0,
  sprint: 5.4,
  crouch: 1.55,
  staminaDrain: 24,
  staminaRegen: 16,
};

export const BOUNDS = { x1: -31, x2: 49, z1: -67, z2: 29 };

/* ================================================================ walls */
// Each wall is an axis-aligned box {x1,z1,x2,z2,h,kind}. kind: wall | outer |
// yard | bars | fence | glass. `bars`/`fence` block movement but not sight.
export const WALLS = [];
function seg(x1, z1, x2, z2, o) {
  WALLS.push({ x1: Math.min(x1, x2), z1: Math.min(z1, z2), x2: Math.max(x1, x2), z2: Math.max(z1, z2), h: o.h ?? H_IN, kind: o.kind ?? "wall", y1: o.y1 ?? 0, paint: o.paint ?? (o.kind ?? "wall") === "wall" });
}
/** Wall along x at constant z, with gaps [[centerX, width, lintelY?]]. */
function hw(z, x1, x2, gaps = [], o = {}) {
  let cur = x1;
  const gs = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [c, w, lintel] of gs) {
    if (c - w / 2 > cur) seg(cur, z - T / 2, c - w / 2, z + T / 2, o);
    if (lintel != null) seg(c - w / 2, z - T / 2, c + w / 2, z + T / 2, { ...o, y1: lintel });
    cur = c + w / 2;
  }
  if (x2 > cur) seg(cur, z - T / 2, x2, z + T / 2, o);
}
/** Wall along z at constant x. */
function vw(x, z1, z2, gaps = [], o = {}) {
  let cur = z1;
  const gs = [...gaps].sort((a, b) => a[0] - b[0]);
  for (const [c, w, lintel] of gs) {
    if (c - w / 2 > cur) seg(x - T / 2, cur, x + T / 2, c - w / 2, o);
    if (lintel != null) seg(x - T / 2, c - w / 2, x + T / 2, c + w / 2, { ...o, y1: lintel });
    cur = c + w / 2;
  }
  if (z2 > cur) seg(x - T / 2, cur, x + T / 2, z2, o);
}

// --- Cell Block C: x[-15,15] z[8,28], six 5 m cells along the south wall
hw(28, -15.15, 15.15);
vw(-15, 8, 28);
vw(15, 8, 28, [[12, 1.4]]); // → guard station door
for (const x of [-10, -5, 0, 5, 10]) vw(x, 22, 28);
export const CELLS = [];
for (let i = 0; i < 6; i++) {
  const x1 = -15 + i * 5;
  const cx = x1 + 2.5;
  CELLS.push({ i, x1, x2: x1 + 5, cx });
  hw(22, x1 + 0.15, x1 + 4.85, [[cx, 1.2]], { kind: "bars", h: H_IN });
}
export const PLAYER_CELL = 3; // x[0,5]

// --- Main corridor x[-30,25] z[3,8] (its south wall is the block's north wall)
hw(8, -30, 25, [[0, 2.4], [21, 1.4]]);
hw(3, -30, 25, [[-20, 2.6], [-3, 1.8], [9, 1.4], [19.5, 1.6]]);
vw(-30, -17, 8);
// --- Guard station x[15,25] z[8,18]
vw(25, 8, 18);
hw(18, 15, 25);
// --- Cafeteria x[-30,-10] z[-17,3]
hw(-17, -30, -10);
vw(-10, -17, 3);
// --- Laundry x[-10,4] / storage x[4,14] / checkpoint x[14,25], z[-11,3]
hw(-11, -10, 25, [[19.5, 1.8]], { h: H_YARD });
vw(4, -11, 3, [[-6, 1.0, 0.95]]); // vent (crawl)
vw(14, -11, 3);
// --- Restricted corridor x[25,31] z[-14,8]
vw(25, -11, 3);
vw(31, -14, 8, [[-6, 1.6]]); // → maintenance door
hw(8, 25, 31);
// --- Maintenance x[31,45] z[-14,4]
hw(-14, 25, 45, [[38, 1.8]]);
hw(4, 31, 45);
vw(45, -14, 4);
// --- Service tunnel x[36,40] z[-48,-14]
vw(36, -48, -14, [], { h: 3.2 });
vw(40, -48, -14, [], { h: 3.2 });
// --- Yard x[-10,25] z[-40,-11] + perimeter strip z[-48,-40]
vw(-10, -48, -17, [], { h: H_YARD, kind: "yard" });
vw(25, -48, -11, [], { h: H_YARD, kind: "yard" });
hw(-40, -10, 25, [[0, 1.4, 1.15]], { kind: "fence", h: 4 });
hw(-48, -14, 48, [[8, 1.2, 1.0], [38, 4]], { kind: "outer", h: H_OUTER });
// --- exterior bounds (tree line)
hw(-66, -14, 48, [], { kind: "invisible", h: 4 });
vw(-14, -66, -48, [], { kind: "invisible", h: 4 });
vw(48, -66, -48, [], { kind: "invisible", h: 4 });

/* ================================================================ zones */
// First match wins. light: base visibility by phase {day, night}.
export const ZONES = [
  { id: "mycell", name: "Your Cell", x1: 0, z1: 22, x2: 5, z2: 28, safe: true, light: { day: 0.9, night: 0.45 } },
  { id: "cells", name: "Cell Block C", x1: -15, z1: 22, x2: 15, z2: 28, light: { day: 0.9, night: 0.45 } },
  { id: "block", name: "Cell Block C", x1: -15, z1: 8, x2: 15, z2: 22, light: { day: 1, night: 0.6 } },
  { id: "gs", name: "Guard Station", x1: 15, z1: 8, x2: 25, z2: 18, restricted: true, light: { day: 1, night: 0.8 } },
  { id: "corridor", name: "Main Corridor", x1: -30, z1: 3, x2: 25, z2: 8, light: { day: 1, night: 0.65 } },
  { id: "kitchen", name: "Kitchen", x1: -30, z1: -17, x2: -10, z2: -10.4, restricted: true, light: { day: 1, night: 0.5 } },
  { id: "cafeteria", name: "Cafeteria", x1: -30, z1: -17, x2: -10, z2: 3, light: { day: 1, night: 0.5 } },
  { id: "laundry", name: "Laundry Room", x1: -10, z1: -11, x2: 4, z2: 3, light: { day: 1, night: 0.5 } },
  { id: "storage", name: "Storage Room", x1: 4, z1: -11, x2: 14, z2: 3, restricted: true, dark: true, light: { day: 0.32, night: 0.28 } },
  { id: "checkpoint", name: "Security Checkpoint", x1: 14, z1: -11, x2: 25, z2: 3, restricted: true, light: { day: 1, night: 0.7 } },
  { id: "rcorr", name: "Restricted Corridor", x1: 25, z1: -14, x2: 31, z2: 8, restricted: true, light: { day: 1, night: 0.65 } },
  { id: "maint", name: "Maintenance", x1: 31, z1: -14, x2: 45, z2: 4, restricted: true, light: { day: 0.8, night: 0.6 } },
  { id: "tunnel", name: "Service Tunnel", x1: 36, z1: -48, x2: 40, z2: -14, restricted: true, dark: true, light: { day: 0.3, night: 0.26 } },
  { id: "yard", name: "Exercise Yard", x1: -10, z1: -40, x2: 25, z2: -11, restricted: true, outdoor: true, light: { day: 1, night: 1 } },
  { id: "perimeter", name: "Perimeter", x1: -14, z1: -48, x2: 48, z2: -40, restricted: true, outdoor: true, light: { day: 1, night: 0.55 } },
  { id: "exterior", name: "Outside the Walls", x1: -14, z1: -67, x2: 48, z2: -48, restricted: true, outdoor: true, light: { day: 1, night: 0.42 } },
];
export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z]));
export const INDOOR = ["mycell", "cells", "block", "gs", "corridor", "kitchen", "cafeteria", "laundry", "storage", "checkpoint", "rcorr", "maint", "tunnel"];
export function zoneAt(x, z) {
  for (const zn of ZONES) if (x >= zn.x1 && x <= zn.x2 && z >= zn.z1 && z <= zn.z2) return zn;
  return ZONES[ZONES.length - 1];
}
export const ROLLCALL = { x1: -12, z1: 18.9, x2: 12, z2: 20.1 };
export const FREEDOM_Z = -53;

/* ================================================================ doors */
// axis: the wall the door sits in runs along x ("x") or z ("z").
// kind: cellgate | gate | door | slide | shutter | vent | fencepanel
export const DOORS = [
  ...CELLS.map((c) => ({ id: `cell${c.i}`, x: c.cx, z: 22, axis: "x", w: 1.2, kind: "cellgate", lock: c.i === PLAYER_CELL ? "cellkey" : "never", label: c.i === PLAYER_CELL ? "Your cell door" : `Cell C-${c.i + 1}` })),
  { id: "block", x: 0, z: 8, axis: "x", w: 2.4, kind: "gate", lock: "rollcall", label: "Cell block gate" },
  { id: "gs1", x: 15, z: 12, axis: "z", w: 1.4, kind: "door", lock: null, label: "Guard Station door", hinge: -1 },
  { id: "gs2", x: 21, z: 8, axis: "x", w: 1.4, kind: "door", lock: null, label: "Guard Station door", hinge: -1 },
  { id: "storage", x: 9, z: 3, axis: "x", w: 1.4, kind: "door", lock: "inside", label: "Storage Room door", hinge: 1 },
  { id: "check", x: 19.5, z: 3, axis: "x", w: 1.6, kind: "slide", lock: "keycard", label: "Security Checkpoint" },
  { id: "yard", x: 19.5, z: -11, axis: "x", w: 1.8, kind: "gate", lock: "release", label: "Yard door" },
  { id: "vent", x: 4, z: -6, axis: "z", w: 1.0, kind: "vent", lock: "screwdriver", label: "Vent cover", crawl: true },
  { id: "maint", x: 31, z: -6, axis: "z", w: 1.6, kind: "slide", lock: "keypad", label: "Maintenance door" },
  { id: "tunnel", x: 38, z: -14, axis: "x", w: 1.8, kind: "shutter", lock: "power", label: "Service tunnel shutter" },
  { id: "exitA", x: 38, z: -44, axis: "x", w: 4.0, kind: "gate", lock: "pass", label: "Tunnel security gate" },
  { id: "fence", x: 0, z: -40, axis: "x", w: 1.4, kind: "fencepanel", lock: "unbolt", label: "Loose fence panel", crawl: true },
];
export const DOOR_BY_ID = Object.fromEntries(DOORS.map((d) => [d.id, d]));
// Crawl spaces are wall gaps with a low lintel (vent, fence panel, drainage
// gap in the outer wall): the lintel box blocks anyone standing.
export const CROUCH_HEIGHT = 0.9;
export const STAND_HEIGHT = 1.8;

/* ================================================================ props */
// Footprints: w across the front, d deep, h tall. f = facing (n/e/s/w).
// solid props collide + block sight up to their height.
export const PROP_DEFS = {
  bunk: { w: 2.0, d: 0.9, h: 1.75 },
  toilet: { w: 0.45, d: 0.6, h: 0.45 },
  sink: { w: 0.5, d: 0.42, h: 0.9 },
  celldesk: { w: 0.9, d: 0.5, h: 0.75 },
  steeltable: { w: 1.6, d: 1.6, h: 0.78 },
  table: { w: 3.2, d: 2.0, h: 0.78 },
  counter: { w: 2, d: 0.8, h: 1.05 },
  stove: { w: 1.0, d: 0.8, h: 0.95 },
  island: { w: 5, d: 1.1, h: 1.05 },
  fridge: { w: 1.0, d: 0.8, h: 2.05 },
  kshelf: { w: 2.0, d: 0.55, h: 2.0 },
  washer: { w: 0.8, d: 0.8, h: 1.0 },
  dryer: { w: 0.8, d: 0.8, h: 1.0 },
  cart: { w: 1.2, d: 0.8, h: 0.95 },
  foldtable: { w: 3.0, d: 1.0, h: 0.9 },
  rack: { w: 2.0, d: 0.6, h: 1.8, see: true },
  shelf: { w: 2.4, d: 0.6, h: 2.2 },
  crate: { w: 1.0, d: 1.0, h: 1.0 },
  crate2: { w: 1.1, d: 1.1, h: 1.9 },
  locker: { w: 0.6, d: 0.55, h: 1.95 },
  lockers: { w: 0.6, d: 0.55, h: 1.95 }, // w multiplied by n
  desk: { w: 1.8, d: 0.8, h: 0.78 },
  gdesk: { w: 3.0, d: 0.9, h: 0.78 },
  cabinet: { w: 0.5, d: 0.6, h: 1.3 },
  vending: { w: 1.0, d: 0.8, h: 1.9 },
  bench: { w: 2.2, d: 0.45, h: 0.46 },
  generator: { w: 3.0, d: 2.4, h: 1.6 },
  boiler: { w: 1.6, d: 1.6, h: 2.6 },
  workbench: { w: 4.0, d: 0.7, h: 0.92 },
  conveyor: { w: 0.8, d: 3.0, h: 0.9 },
  detector: { w: 1.6, d: 0.5, h: 2.2 }, // special: two posts
  bleachers: { w: 6.0, d: 3.2, h: 1.3 },
  hoop: { w: 0.35, d: 0.35, h: 3.1 },
  weights: { w: 1.6, d: 0.6, h: 0.6 },
  picnic: { w: 2.0, d: 1.8, h: 0.75 },
  dumpster: { w: 2.0, d: 1.2, h: 1.4 },
  pole: { w: 0.3, d: 0.3, h: 8 },
  tower: { w: 3.2, d: 3.2, h: 8 }, // special: four legs
  tires: { w: 1.0, d: 1.0, h: 0.9 },
  pallet: { w: 1.2, d: 1.0, h: 0.6 },
  barrier: { w: 2.0, d: 0.3, h: 1.0 },
  pipes: { w: 0.5, d: 0.5, h: 3.0, deco: true },
};

export const PROPS = [
  // ---- cells: bunk + sink + toilet in every cell
  ...CELLS.flatMap((c) => [
    { t: "bunk", x: c.x1 + 0.62, z: 26.4, f: "e", cell: c.i },
    { t: "sink", x: c.x2 - 0.36, z: 26.0, f: "w", cell: c.i, id: c.i === PLAYER_CELL ? "sink" : undefined },
    { t: "toilet", x: c.x2 - 0.75, z: 27.5, f: "n", cell: c.i },
    ...(c.i === PLAYER_CELL || c.i % 2 === 0 ? [{ t: "celldesk", x: c.x2 - 0.4, z: 23.7, f: "w", cell: c.i, id: c.i === PLAYER_CELL ? "celldesk" : undefined }] : []),
  ]),
  // ---- cell block hall
  { t: "steeltable", x: -9, z: 14.5 },
  { t: "steeltable", x: -4, z: 13.5 },
  { t: "steeltable", x: 7, z: 14 },
  { t: "bench", x: -14.6, z: 15, f: "e" },
  { t: "bench", x: 14.6, z: 18.5, f: "w" },
  // ---- main corridor
  { t: "bench", x: -25, z: 7.6, f: "n" },
  { t: "vending", x: -14, z: 3.6, f: "s" },
  { t: "locker", x: -8, z: 3.45, f: "s", id: "hide_cor1" },
  { t: "locker", x: -7.4, z: 3.45, f: "s" },
  { t: "cart", x: 3.8, z: 4.0, f: "s" },
  { t: "locker", x: 13.2, z: 3.45, f: "s", id: "hide_cor2" },
  { t: "bench", x: 12, z: 7.6, f: "n" },
  { t: "vending", x: -27.5, z: 3.6, f: "s" },
  // ---- cafeteria dining
  ...[-26, -20, -14].flatMap((x) => [-6, -1].map((z) => ({ t: "table", x, z, f: "s" }))),
  // serving counter z=-10 from x -28.3 → -10.15 (gap at the west end)
  { t: "counter", x: -19.2, z: -10, f: "s", w: 18.2 },
  // kitchen
  { t: "stove", x: -27, z: -16.4, f: "s" },
  { t: "stove", x: -25.9, z: -16.4, f: "s" },
  { t: "stove", x: -24.8, z: -16.4, f: "s" },
  { t: "island", x: -20.5, z: -13.8, f: "s", w: 6 },
  { t: "fridge", x: -12.2, z: -16.4, f: "s" },
  { t: "fridge", x: -11.1, z: -16.4, f: "s" },
  { t: "kshelf", x: -29.5, z: -15, f: "e", id: "rationshelf" },
  { t: "kshelf", x: -17, z: -16.6, f: "s" },
  // ---- laundry
  ...[-9, -7.9, -6.8, -5.7].map((z) => ({ t: "washer", x: -9.45, z, f: "e" })),
  ...[-6.6, -5.6, -4.6, -3.6].map((x, i) => ({ t: "dryer", x, z: -10.45, f: "s", id: `dryer${i + 1}` })),
  { t: "foldtable", x: -4.5, z: -5.2, f: "s" },
  { t: "cart", x: 1.2, z: -3.2, f: "s", id: "hide_cart" },
  { t: "cart", x: -7.4, z: -2.4, f: "e" },
  { t: "rack", x: -1, z: -9.4, f: "s" },
  { t: "shelf", x: 3.5, z: -1, f: "w", w: 2.4 },
  // ---- storage (dark)
  { t: "shelf", x: 9.2, z: -3.2, f: "s", w: 5 },
  { t: "shelf", x: 9.2, z: -7.4, f: "s", w: 4 },
  { t: "shelf", x: 13.5, z: -2.0, f: "w", w: 3 },
  { t: "crate2", x: 12.6, z: 1.8 },
  { t: "crate", x: 11.3, z: 2.1 },
  { t: "crate", x: 6, z: -0.5 },
  { t: "desk", x: 6.0, z: -10.3, f: "s", id: "storagedesk" },
  { t: "shelf", x: 13.5, z: -9.0, f: "w", w: 2.4, id: "toolshelf" },
  // ---- guard station
  { t: "gdesk", x: 20, z: 15, f: "n", id: "gsdesk" },
  { t: "lockers", x: 24.6, z: 10.8, f: "w", n: 4 },
  { t: "locker", x: 24.6, z: 16.7, f: "w", id: "hide_gs" },
  { t: "cabinet", x: 15.5, z: 17.4, f: "n" },
  { t: "cabinet", x: 16.1, z: 17.4, f: "n" },
  { t: "desk", x: 17.4, z: 8.6, f: "s" },
  // ---- checkpoint
  { t: "detector", x: 19.5, z: -4, f: "s" },
  { t: "conveyor", x: 17.6, z: -4, f: "s" },
  { t: "desk", x: 16.2, z: -8.4, f: "e", id: "releasedesk" },
  { t: "barrier", x: 22.5, z: -1.5, f: "s" },
  { t: "locker", x: 24.6, z: -9.5, f: "w", id: "hide_ck" },
  { t: "lockers", x: 24.6, z: -6, f: "w", n: 3 },
  { t: "bench", x: 15, z: 0.5, f: "e" },
  // ---- restricted corridor
  { t: "locker", x: 30.6, z: 1.2, f: "w", id: "hide_rc" },
  { t: "cabinet", x: 25.5, z: -12.5, f: "e" },
  { t: "crate", x: 29.8, z: -12.6 },
  // ---- maintenance
  { t: "desk", x: 34, z: 3.35, f: "n", id: "cctv" },
  { t: "workbench", x: 39.2, z: 3.4, f: "n", id: "logbook" },
  { t: "generator", x: 34.5, z: -10.8, f: "s" },
  { t: "boiler", x: 41.6, z: -0.2 },
  { t: "lockers", x: 43.6, z: -13.4, f: "s", n: 3, id: "passlocker" },
  { t: "locker", x: 31.48, z: -2.4, f: "e", id: "hide_mt" },
  { t: "crate", x: 32.2, z: -6.8 },
  { t: "pallet", x: 38.5, z: -8 },
  { t: "pipes", x: 44.6, z: 3.6 },
  // ---- tunnel debris (weave around it)
  { t: "crate", x: 37.1, z: -20 },
  { t: "crate2", x: 38.9, z: -25.5 },
  { t: "pallet", x: 37.0, z: -31 },
  { t: "crate", x: 39.0, z: -36.5 },
  { t: "crate", x: 37.0, z: -40.5 },
  // ---- yard
  { t: "bleachers", x: -5.6, z: -26, f: "e" },
  { t: "hoop", x: 7, z: -35.2 },
  { t: "weights", x: 16, z: -30, f: "s" },
  { t: "weights", x: 18.6, z: -30, f: "s" },
  { t: "picnic", x: 16.5, z: -20, f: "s" },
  { t: "picnic", x: 11.5, z: -15.5, f: "s" },
  { t: "dumpster", x: -7.6, z: -36.6, f: "e", id: "hide_dump" },
  { t: "crate", x: 3.2, z: -37.6 },
  { t: "crate2", x: 4.4, z: -37.4 },
  { t: "tires", x: -3.6, z: -38.2 },
  { t: "tires", x: 22.6, z: -24 },
  { t: "pallet", x: 22.8, z: -35.5 },
  { t: "pole", x: -8.6, z: -12.6 },
  { t: "pole", x: 23.6, z: -12.6 },
  { t: "pole", x: -8.6, z: -38.6 },
  { t: "pole", x: 23.6, z: -38.6 },
  // ---- perimeter towers
  { t: "tower", x: -8.2, z: -45.8 },
  { t: "tower", x: 23.2, z: -45.8 },
];

/* ================================================================ items */
export const ITEMS = {
  note: { name: "Hidden note", icon: "📜", desc: "Left by your cell's previous tenant. Select it and press Use to read it again.", read: "note" },
  cellkey: { name: "Cell key", icon: "🗝️", desc: "A spare key for Block C — fits your cell door and the block gate." },
  ration: { name: "Ration bar", icon: "🍫", desc: "Swiped from the kitchen. Ray wants this." },
  flashlight: { name: "Flashlight", icon: "🔦", desc: "Press F to switch it on. It lights dark rooms — and makes you easier to spot." },
  screwdriver: { name: "Screwdriver", icon: "🪛", desc: "Opens screwed-shut panels: vent covers, power boxes, fence bolts." },
  accessnote: { name: "Access note", icon: "🗒️", desc: "The maintenance keypad glyph sequence. Select it and press Use to read.", read: "accessnote" },
  wire: { name: "Copper wire", icon: "🧵", desc: "A length of insulated copper wire. Could bridge a burnt fuse." },
  keycard: { name: "Keycard", icon: "💳", desc: "Officer Hale's security keycard. Opens the Security Checkpoint." },
  pass: { name: "Maintenance pass", icon: "🪪", desc: "A maintenance worker's pass. The service tunnel gate scanner accepts it." },
};
export const ITEM_IDS = Object.keys(ITEMS);

export const NOTES = {
  note: {
    title: "A folded note",
    body: [
      "To whoever gets this cell next —",
      "I never made it out. Maybe you will.",
      "I hid a spare key UNDER THE SINK. It fits these cell doors and the block gate.",
      "At breakfast find RAY in the cafeteria. He can get things. Trust nobody else.",
      "— M.",
    ],
  },
  accessnote: {
    title: "Maintenance door — new sequence",
    body: ["Changed again. Memorise it, then BURN THIS.", "Press the glyphs in this order:"],
    glyphs: ["moon", "gear", "star", "anchor"],
    foot: "— R.K., night maintenance",
  },
  logbook: {
    title: "Maintenance logbook",
    body: [
      "Mon — Fuse F2 on the tunnel circuit burnt out AGAIN. Bridge it with copper wire until the spares arrive.",
      "Tue — Board tripped during restart. Reminder for the new guy:",
      "RESTART ORDER: 1) PUMPS  2) LIGHTS  3) MAIN — MAIN goes LAST or the whole board trips.",
      "Wed — Tunnel shutter only opens with the tunnel circuit powered.",
    ],
  },
  rulebook: {
    title: "Inmate Handbook — Block C",
    body: [
      "Rule 3: Roll call is held on the yellow line every morning.",
      "Rule 7: NO RUNNING. Officers will treat running as suspicious.",
      "Rule 9: Kitchen, storage, guard station and maintenance are OFF LIMITS.",
      "Rule 12: Lights out at 22:00. Anyone outside their cell after lights out will be detained.",
    ],
  },
};

export const GLYPHS = ["star", "moon", "gear", "anchor", "eye", "key"];

/* ================================================================ missions */
// Each step completes when its flag is set (flags can be set early).
export const MISSIONS = [
  {
    title: "First Night",
    brief: "Explore your cell and find a hidden note.",
    steps: [{ id: "note", text: "Search your cell for a hidden note", hint: "The last tenant left something behind. Posters can cover more than bare walls.", at: [2.5, 27.5] }],
  },
  {
    title: "The Routine",
    brief: "Follow the prison schedule and reach the cafeteria.",
    steps: [
      { id: "key", text: "Find the spare key the note mentioned", hint: "The note said: under the sink.", at: [4.5, 26] },
      { id: "unlock", text: "Unlock your jammed cell door", hint: "Look at your cell door and press E — the spare key fits.", at: [2.5, 22] },
      { id: "rollcall", text: "Line up on the yellow roll-call line", hint: "The yellow line runs across the middle of the cell block.", at: [0, 19.5] },
      { id: "cafeteria", text: "Head to the cafeteria for breakfast", hint: "Through the block gate, west along the main corridor.", at: [-20, 0] },
    ],
  },
  {
    title: "A Useful Contact",
    brief: "Speak with Ray and do him a favour.",
    steps: [
      { id: "ray", text: "Find Ray in the cafeteria and talk to him", hint: "Ray sits at the middle table nearest the kitchen counter.", at: [-20, -5] },
      { id: "ration", text: "Steal a ration bar from the kitchen's back shelf", hint: "Enter at the west end of the counter. Crouch (C). Move while Officer Brandt is at the far end, facing away.", at: [-29, -15] },
      { id: "deliver", text: "Bring the ration bar back to Ray", hint: "Ray is still at his table.", at: [-20, -5] },
    ],
  },
  {
    title: "Hidden Supplies",
    brief: "Find a useful item in the laundry room.",
    steps: [{ id: "screwdriver", text: "Find the screwdriver hidden in the laundry", hint: "Ray said: the third dryer from the left.", at: [-4.6, -10.4] }],
  },
  {
    title: "Restricted Access",
    brief: "Get into the maintenance area.",
    steps: [
      { id: "vent", text: "Open the laundry vent and crawl into the storage room", hint: "The vent cover is low on the laundry's east wall. Use the screwdriver, then crouch (C) to crawl through.", at: [3.8, -6] },
      { id: "accessnote", text: "Find the maintenance door sequence in the storage room", hint: "It is dark in here — press F for your flashlight. Check the desk in the far corner.", at: [6, -10.2] },
      { id: "keypad", text: "Enter the sequence at the maintenance door", hint: "The door is in the Restricted Corridor's east wall. Read the access note (I) for the glyph order. Mind the camera and Officer Hale.", at: [30.6, -6] },
    ],
  },
  {
    title: "Security Pattern",
    brief: "Observe guard patrols and find a safe route.",
    steps: [
      { id: "cctv", text: "Study the guard patrols on the maintenance CCTV desk", hint: "The CCTV desk is against the maintenance room's south wall.", at: [34, 3] },
      { id: "keycard", text: "Steal the keycard from the Guard Station desk", hint: "Hale leaves his desk to walk the Restricted Corridor. Slip in from the cell block door while he's away, and wait for the station camera to turn.", at: [20.6, 14.8] },
    ],
  },
  {
    title: "The Final Plan",
    brief: "Collect the gear for an escape route and tell Ray.",
    steps: [{ id: "route", text: "Gather the gear for a route, then tell Ray your plan", hint: "Maintenance route: wire (storage), maintenance pass (maintenance lockers), flashlight. Courtyard route: keycard + screwdriver.", at: [-20, -5] }],
  },
  {
    title: "Breakout",
    brief: "Escape tonight.",
    steps: [], // filled per route
  },
];
export const ROUTE_STEPS = {
  A: [
    { id: "blockgate", text: "Slip out of the cell block (the spare key fits the gate)", hint: "Officer Grant walks along the cells. Move when he walks away from you.", at: [0, 8.4] },
    { id: "fuse", text: "Bridge the burnt fuse in Maintenance with the wire", hint: "The fuse box is on the maintenance room's east wall.", at: [44.6, -9.6] },
    { id: "power", text: "Restore power: flip the breakers in the right order", hint: "The maintenance logbook on the workbench lists the restart order.", at: [44.6, -6] },
    { id: "gateA", text: "Cross the dark service tunnel and swipe the pass at the gate", hint: "Flashlight off near the tunnel camera — darkness hides you.", at: [39.5, -43.4] },
    { id: "free", text: "Reach the tree line beyond the walls", hint: "Keep heading north.", at: [38, -56] },
  ],
  B: [
    { id: "blockgate", text: "Slip out of the cell block (the spare key fits the gate)", hint: "Officer Grant walks along the cells. Move when he walks away from you.", at: [0, 8.4] },
    { id: "checkpoint", text: "Open the Security Checkpoint with the keycard", hint: "The checkpoint door is on the corridor's north side, east of the storage room.", at: [19.5, 3.4] },
    { id: "yarddoor", text: "Release the yard door at the checkpoint desk", hint: "The release switch is on the desk by the west wall.", at: [16.6, -8.4] },
    { id: "floods", text: "Cut the yard floodlights at the power box", hint: "The power box is on the yard's west wall. Unscrew the panel, then pull the switch.", at: [-9.5, -24] },
    { id: "fence", text: "Unbolt the loose fence panel and slip through", hint: "North fence, straight across the yard. Searchlights sweep — time it.", at: [0, -39.6] },
    { id: "free", text: "Crawl through the drainage gap and reach the tree line", hint: "The drainage gap is low in the outer wall. Crouch to crawl.", at: [8, -48] },
  ],
};
export const ROUTES = {
  A: { name: "Maintenance Route", needs: ["wire", "pass", "flashlight"] },
  B: { name: "Courtyard Route", needs: ["keycard", "screwdriver"] },
};

/* ================================================================ NPCs */
// Waypoints: [x, z, pause seconds, look yaw?]. Phases: night1 | day | night2.
// Inmates: `pos.day` = [x, z, yaw, pose] (or a `walk` loop); `pos.night` = their cell.
export const GUARDS = [
  {
    id: "grant", name: "Officer Grant", color: 0x2b3a55,
    routes: {
      night1: [[-12.5, 20, 3], [12.5, 20, 3]],
      day: [[-11, 10.5, 2], [11, 10.5, 2], [11, 18, 2], [-11, 18, 2]],
      night2: [[-12.5, 20, 3.5], [12.5, 20, 3.5]],
    },
  },
  {
    id: "moss", name: "Officer Moss", color: 0x2d3b52,
    routes: {
      day: [[-27, 5.5, 3], [22, 5.5, 3]],
      night2: [[-26, 5.5, 4], [-6, 5.5, 1], [22.5, 5.5, 4], [6, 5.5, 1]],
    },
  },
  {
    id: "hale", name: "Officer Hale", color: 0x31415e,
    routes: {
      day: [[20, 16.4, 11, 0], [21, 9.8, 0], [21, 5.6, 0], [27.8, 5.6, 0], [27.8, -12.2, 3], [27.8, 5.4, 0], [21, 5.6, 0], [21, 9.8, 0]],
      night2: [[27.8, 6, 3], [27.8, -12.2, 3]],
    },
  },
  {
    id: "brandt", name: "Officer Brandt", color: 0x3b4252, cook: true,
    routes: { day: [[-13.2, -11.8, 7, -Math.PI / 2], [-26, -11.8, 3.5, Math.PI / 2]] },
  },
  {
    id: "reyes", name: "Officer Reyes", color: 0x34405a,
    routes: { night2: [[34.6, -1.4, 3], [43.2, -1.4, 2], [43.2, -12, 3], [36.8, -8.2, 2]] },
  },
  {
    id: "diaz", name: "Officer Diaz", color: 0x2f3d58,
    routes: { night2: [[-6.5, -14.5, 2], [21.5, -14.5, 2], [21.5, -33, 2], [-2, -33, 2]] },
  },
  {
    id: "kowalski", name: "Officer Kowalski", color: 0x2e3a50,
    routes: { night2: [[-7.6, -43.6, 3], [22, -43.6, 3]] },
  },
];

export const INMATES = [
  {
    id: "ray", name: "Ray", helper: true, color: 0xe0782a, skin: 0x8a5a3c, hair: 0xb8b8b8,
    pos: { day: [-20, -7.25, Math.PI, "sit"], night: 2 },
  },
  {
    id: "tito", name: "Tito", color: 0xe56f22, skin: 0xc49170, hair: 0x221a14,
    walk: { day: [[-12, 16.5], [-1, 16.5], [-1, 12], [-12, 12]] },
    pos: { night: 1 },
    lines: ["First night? Keep your head down and you'll be fine.", "Grant walks the line all night. Sleeps standing up, I swear.", "Don't ever run in front of the guards. They hate that."],
  },
  {
    id: "lou", name: "Big Lou", color: 0xd8701f, skin: 0x5e3b28, hair: 0x111111,
    pos: { day: [-26, -4.75, 0, "sit"], night: 5 },
    lines: ["You eyeing my tray?", "Brandt counts every ration bar in that kitchen. Every single one.", "Ray? Middle table. He knows everybody."],
  },
  {
    id: "marco", name: "Marco", color: 0xe3762b, skin: 0xd8a882, hair: 0x5a3a22,
    pos: { day: [-4.5, -4.3, 0, "stand"], night: 4 },
    lines: ["Laundry duty. Again.", "Third dryer's been 'out of order' for weeks. Nobody's allowed to touch it.", "That vent over there rattles all night. Screwed shut, though."],
  },
  {
    id: "pete", name: "Old Pete", color: 0xd4741f, skin: 0xb98b6b, hair: 0xdddddd,
    pos: { day: [-14.2, 15, -Math.PI / 2, "sit"], night: 0 },
    lines: ["Thirty years I've been here. The cameras sweep, son. They always sweep.", "Hale walks his rounds like clockwork. Desk, corridor, desk.", "Kitchen cook turns his back at the fridges. Always did."],
  },
];

/* ================================================================ security */
// Wall cameras: pos, look-at point, sweep half-angle (rad), period (s), fov
// (half-angle of the view cone). Sweep + fov never cover a whole room at
// once, so a patient player can always time a gap.
export const CAMERAS = [
  { id: "cam_rc", x: 30.55, z: 7.55, y: 3.0, look: [27.6, -2], sweep: 0.5, period: 9, range: 14, fov: 0.3, phases: ["day", "night2"] },
  { id: "cam_gs", x: 24.55, z: 8.45, y: 3.0, look: [18, 15], sweep: 0.55, period: 8, range: 13, fov: 0.32, phases: ["day", "night2"] },
  { id: "cam_ck", x: 14.45, z: 2.55, y: 3.0, look: [21, -6], sweep: 0.5, period: 8, range: 13, fov: 0.32, phases: ["night2"] },
  { id: "cam_tun", x: 39.6, z: -24, y: 2.8, look: [37.6, -34], sweep: 0.3, period: 7, range: 12, fov: 0.3, phases: ["night2"] },
];
export const SEARCHLIGHTS = [
  { id: "sl1", x: -8.2, z: -45.8, y: 8.6, path: (t) => [2 + 11 * Math.sin(t * 0.33), -31 + 9 * Math.sin(t * 0.21 + 0.6)], r: 3.4 },
  { id: "sl2", x: 23.2, z: -45.8, y: 8.6, path: (t) => [12 + 11 * Math.sin(t * 0.27 + 2), -42 + 5.5 * Math.sin(t * 0.43)], r: 3.4 },
];

/* ================================================================ lights */
// Ceiling fixtures: [x, z, zoneId, color?]. Night: dimmed (most) or off.
export const FIXTURES = [
  ...[-10, 0, 10].flatMap((x) => [11.5, 17.5].map((z) => [x, z, "block"])),
  ...CELLS.map((c) => [c.cx, 25, "cells"]),
  ...[-26, -18, -10, -2, 6, 14, 22].map((x) => [x, 5.5, "corridor"]),
  [-25, -13, "kitchen"], [-15, -13, "kitchen"],
  [-25, -4, "cafeteria"], [-15, -4, "cafeteria"], [-20, 0.5, "cafeteria"],
  [-6, -7, "laundry"], [0, -2, "laundry"], [-5, 0, "laundry"],
  [18, 11.5, "gs"], [22, 15.5, "gs"],
  [17, -6, "checkpoint"], [22, -2, "checkpoint"],
  [28, 4, "rcorr"], [28, -5, "rcorr"], [28, -12, "rcorr"],
  [35, -4, "maint", 0xffc070], [41, -6, "maint", 0xffc070], [38, 1.5, "maint", 0xffc070],
  [38, -19, "tunnel", 0xff3020], [38, -31, "tunnel", 0xff3020], [38, -42.5, "tunnel", 0xff3020],
];
export const FLOODS = [[-8.6, -12.6], [23.6, -12.6], [-8.6, -38.6], [23.6, -38.6]];

/* ================================================================ signs */
// Wall signs: [x, y, z, facing, text, style]
export const SIGNS = [
  [0, 2.75, 8.2, "s", "BLOCK C — EXIT", "info"],
  [0, 2.75, 7.8, "n", "CELL BLOCK C", "info"],
  [14.8, 2.4, 12, "w", "GUARD STATION — STAFF ONLY", "warn"],
  [-20, 2.75, 3.2, "s", "CAFETERIA", "info"],
  [-3, 2.75, 3.2, "s", "LAUNDRY", "info"],
  [9, 2.6, 3.2, "s", "STORAGE — AUTHORIZED STAFF", "warn"],
  [19.5, 2.75, 3.2, "s", "SECURITY CHECKPOINT", "warn"],
  [25.15, 2.6, 5.5, "w", "RESTRICTED AREA", "danger"],
  [30.8, 2.6, -6, "w", "MAINTENANCE — NO ENTRY", "danger"],
  [38, 2.6, -13.8, "s", "SERVICE TUNNEL", "warn"],
  [-12.5, 2.0, 7.8, "n", "NO RUNNING", "warn"],
  [-13.5, 2.2, -10.5, "n", "KITCHEN — STAFF ONLY", "warn"],
  [19.5, 3.4, -11.25, "n", "YARD", "info"],
  [12, 2.4, 27.8, "n", "LIGHTS OUT 22:00", "info"],
];

/* ================================================================ interaction spots */
// Static things you can aim at and press E on. owner = the prop whose
// collider the spot sits on (ignored by the line-of-sight check).
export const SPOTS = [
  { id: "poster", x: 2.5, y: 1.5, z: 27.78, r: 0.42, label: "Faded poster" },
  { id: "sink", x: 4.5, y: 0.85, z: 26.0, r: 0.32, label: "Sink", owner: "sink" },
  { id: "bunk", x: 0.75, y: 0.75, z: 26.2, r: 0.55, label: "Your bunk" },
  { id: "toilet", x: 4.25, y: 0.42, z: 27.45, r: 0.3, label: "Toilet" },
  { id: "rulebook", x: 4.55, y: 0.82, z: 23.7, r: 0.3, label: "Inmate handbook", owner: "celldesk" },
  { id: "rationshelf", x: -29.2, y: 1.15, z: -15, r: 0.5, label: "Kitchen shelf", owner: "rationshelf" },
  ...[-6.6, -5.6, -4.6, -3.6].map((x, i) => ({ id: `dryer${i + 1}`, x, y: 0.6, z: -10.02, r: 0.36, label: `Dryer #${i + 1}`, owner: `dryer${i + 1}` })),
  { id: "storagedesk", x: 6.0, y: 0.86, z: -10.25, r: 0.42, label: "Cluttered desk", owner: "storagedesk" },
  { id: "toolshelf", x: 13.2, y: 1.05, z: -9.0, r: 0.45, label: "Tool shelf", owner: "toolshelf" },
  { id: "gsdesk", x: 20.7, y: 0.86, z: 14.85, r: 0.36, label: "Guard desk", owner: "gsdesk" },
  { id: "monitors", x: 19.2, y: 1.15, z: 15.1, r: 0.42, label: "Security monitors", owner: "gsdesk" },
  { id: "release", x: 16.6, y: 0.9, z: -8.4, r: 0.3, label: "Yard door release", owner: "releasedesk" },
  { id: "cctv", x: 34, y: 1.1, z: 3.25, r: 0.6, label: "CCTV desk", owner: "cctv" },
  { id: "logbook", x: 39.2, y: 0.98, z: 3.3, r: 0.35, label: "Logbook", owner: "logbook" },
  { id: "fusebox", x: 44.72, y: 1.5, z: -9.5, r: 0.36, label: "Fuse box" },
  { id: "brk_pumps", x: 44.72, y: 1.45, z: -5, r: 0.27, label: "Breaker — PUMPS", breaker: "pumps" },
  { id: "brk_main", x: 44.72, y: 1.45, z: -6, r: 0.27, label: "Breaker — MAIN", breaker: "main" },
  { id: "brk_lights", x: 44.72, y: 1.45, z: -7, r: 0.27, label: "Breaker — LIGHTS", breaker: "lights" },
  { id: "passlocker", x: 43.6, y: 1.2, z: -13.08, r: 0.55, label: "Maintenance lockers", owner: "passlocker" },
  { id: "floodbox", x: -9.66, y: 1.3, z: -24, r: 0.42, label: "Floodlight power box" },
];
export const BREAKER_ORDER = ["pumps", "lights", "main"];
// Hiding spots (lockers, a laundry cart, a dumpster) — ids match PROPS ids.
export const HIDES = PROPS.filter((p) => p.id && p.id.startsWith("hide_")).map((p) => ({
  id: p.id, x: p.x, z: p.z, f: p.f, kind: p.t === "cart" ? "cart" : p.t === "dumpster" ? "dumpster" : "locker",
}));
export const FACING = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const CHECKPOINT = { x: 2.5, z: 24.6, yaw: 0 };
