/**
 * Parking Master — all 50 levels as data.
 *
 * There are no per-level components. One reusable engine (`ParkingScene`) reads
 * these objects and builds the 3D world from them. Each world has a ten-entry
 * tuning table so every level is intentionally shaped — gap width, which bays
 * are occupied, cone gates, parking direction and par time all move level by
 * level — while sharing a small set of layout builders.
 *
 * Axes: origin at the centre of the arena, +Z is "north". A car/zone `heading`
 * of 0 faces +Z; positive heading turns left (counter-clockwise seen from above).
 *
 *   level = {
 *     id, world, index, name,
 *     arena: { w, l, wall: "curb" | "solid" | "none" },
 *     start: { pos: [x, z], heading },
 *     zone:  { pos: [x, z], size: [w, l], heading, dir: "forward" | "reverse" },
 *     parked:    [ { pos, heading, body, color } ],
 *     obstacles: [ { type, pos, size?, heading?, h? } ],
 *     parTime,  // seconds — a soft target for the star rating, never a fail timer
 *   }
 */

export const CAR_FOOTPRINT = { compact: [1.78, 4.0], sedan: [1.86, 4.5], suv: [1.95, 4.6] };
const PARKED_COLORS = [
  "#4a5560", "#8f3f37", "#2f5f8a", "#c6c8cb",
  "#3c6b4c", "#6a5c8c", "#b3892f", "#2b2e33",
];
const pc = (i) => PARKED_COLORS[i % PARKED_COLORS.length];

let SEQ = 0;
function car(x, z, heading = 0, body = "sedan", colorIx = SEQ++) {
  return { pos: [x, z], heading, body, color: pc(colorIx) };
}
function cone(x, z) {
  return { type: "cone", pos: [x, z] };
}
function barrier(x, z, heading = 0, w = 2.2) {
  return { type: "barrier", pos: [x, z], heading, size: [w, 0.55], h: 0.9 };
}
function column(x, z, s = 1.15) {
  return { type: "column", pos: [x, z], size: [s, s], h: 3.2 };
}
function wall(x, z, w, l, heading = 0) {
  return { type: "wall", pos: [x, z], size: [w, l], heading, h: 1.4 };
}

/* ---------------------------------------------------------------- builders */

/**
 * Perpendicular bay parking. The target bay sits on the north row; the player
 * starts in the drive lane to the south. `occupied` lists bay offsets (in bay
 * widths, negative = left) that hold a parked car.
 */
function bay(index, world, name, o) {
  const bw = o.bayW ?? 2.7;
  const zoneZ = o.zoneZ ?? 8.5;
  const dir = o.dir ?? "forward";
  const heading = dir === "reverse" ? Math.PI : 0;
  const parked = (o.occupied ?? []).map((k, i) =>
    car(k * bw, zoneZ, heading, o.parkBody ?? "sedan", index * 3 + i),
  );
  const obstacles = [];
  (o.cones ?? []).forEach(([x, z]) => obstacles.push(cone(x, z)));
  (o.barriers ?? []).forEach((b) => obstacles.push(barrier(...b)));
  (o.walls ?? []).forEach((w) => obstacles.push(wall(...w)));
  return {
    world,
    index,
    name,
    arena: { w: o.arenaW ?? 30, l: o.arenaL ?? 30, wall: o.wall ?? "curb" },
    start: { pos: o.start ?? [0, -9], heading: o.startHeading ?? 0 },
    zone: {
      pos: [o.zoneX ?? 0, zoneZ],
      size: o.zoneSize ?? [bw - 0.15, 5.3],
      heading,
      dir,
    },
    parked,
    obstacles,
    parTime: o.parTime ?? 32,
  };
}

/**
 * Parallel parking along the east curb (x = curbX). Zone runs along Z. A car
 * ahead (north) and behind (south) pinch the space to `gap` metres.
 */
function parallel(index, world, name, o) {
  const curbX = o.curbX ?? 4.6;
  const gap = o.gap ?? 6.6;
  const zoneZ = o.zoneZ ?? 0;
  // parallel bay: length runs along the street (Z), width across it (X).
  // final car orientation faces up the street (heading 0), kerb on +X.
  const parked = [];
  if (o.front !== false) parked.push(car(curbX, zoneZ + gap / 2 + 2.3, 0, "sedan", index * 2));
  if (o.back !== false) parked.push(car(curbX, zoneZ - gap / 2 - 2.3, 0, "sedan", index * 2 + 1));
  (o.extraCars ?? []).forEach((c, i) => parked.push(car(c[0], c[1], c[2] ?? 0, "sedan", 40 + i)));
  const obstacles = [];
  (o.cones ?? []).forEach(([x, z]) => obstacles.push(cone(x, z)));
  (o.walls ?? []).forEach((w) => obstacles.push(wall(...w)));
  return {
    world,
    index,
    name,
    arena: { w: o.arenaW ?? 26, l: o.arenaL ?? 40, wall: o.wall ?? "curb" },
    start: { pos: o.start ?? [-1.5, -12], heading: o.startHeading ?? 0 },
    zone: {
      pos: [curbX, zoneZ],
      size: o.zoneSize ?? [2.5, 6.2],
      heading: 0,
      dir: o.dir ?? "reverse",
      parallel: true,
    },
    parked,
    obstacles,
    parTime: o.parTime ?? 40,
  };
}

/**
 * Indoor garage bay between structural columns, reached down a lane.
 */
function garage(index, world, name, o) {
  const bw = o.bayW ?? 2.65;
  const zoneZ = o.zoneZ ?? 9;
  const dir = o.dir ?? "reverse";
  const heading = dir === "reverse" ? Math.PI : 0;
  const parked = (o.occupied ?? []).map((k, i) =>
    car(k * bw, zoneZ, heading, i % 2 ? "suv" : "sedan", index * 3 + i),
  );
  const obstacles = [];
  (o.columns ?? []).forEach(([x, z, s]) => obstacles.push(column(x, z, s)));
  (o.cones ?? []).forEach(([x, z]) => obstacles.push(cone(x, z)));
  (o.walls ?? []).forEach((w) => obstacles.push(wall(...w)));
  (o.barriers ?? []).forEach((b) => obstacles.push(barrier(...b)));
  return {
    world,
    index,
    name,
    arena: { w: o.arenaW ?? 30, l: o.arenaL ?? 30, wall: "solid" },
    start: { pos: o.start ?? [0, -10], heading: o.startHeading ?? 0 },
    zone: {
      pos: [o.zoneX ?? 0, zoneZ],
      size: o.zoneSize ?? [bw - 0.2, 5.2],
      heading,
      dir,
    },
    parked,
    obstacles,
    parTime: o.parTime ?? 46,
  };
}

/* ------------------------------------------------------- world 1: Training */

const TRAINING = [
  bay(1, "training-lot", "First Space", {
    arenaW: 34, arenaL: 32, bayW: 3.4, zoneSize: [3.1, 5.6], parTime: 30,
  }),
  bay(2, "training-lot", "Neighbour", {
    arenaW: 34, arenaL: 32, bayW: 3.0, occupied: [-1], parTime: 30,
  }),
  bay(3, "training-lot", "In Between", {
    arenaW: 34, arenaL: 32, bayW: 3.0, occupied: [-1, 1], zoneSize: [2.85, 5.4], parTime: 33,
  }),
  bay(4, "training-lot", "Back It In", {
    arenaW: 34, arenaL: 34, bayW: 3.2, dir: "reverse", start: [6, -8], startHeading: 0, parTime: 38,
  }),
  bay(5, "training-lot", "Reverse Bay", {
    arenaW: 34, arenaL: 34, bayW: 3.0, dir: "reverse", occupied: [-1], start: [7, -7],
    startHeading: 0, parTime: 40,
  }),
  bay(6, "training-lot", "Snug Fit", {
    arenaW: 32, arenaL: 32, bayW: 2.7, occupied: [-1, 1], zoneSize: [2.55, 5.2], parTime: 36,
  }),
  bay(7, "training-lot", "Cone Alley", {
    arenaW: 34, arenaL: 34, bayW: 2.9, occupied: [1],
    cones: [[-4.2, -1], [-2.4, 1.5], [-3.4, 4], [1.6, -3]], parTime: 40,
  }),
  bay(8, "training-lot", "Ninety Degrees", {
    arenaW: 36, arenaL: 30, bayW: 2.9, occupied: [-1, 1], zoneX: -6,
    start: [8, -6], startHeading: Math.PI / 2, zoneSize: [2.7, 5.3], parTime: 44,
  }),
  bay(9, "training-lot", "Busy Row", {
    arenaW: 36, arenaL: 34, bayW: 2.75, occupied: [-2, -1, 1, 2], zoneSize: [2.55, 5.2],
    cones: [[2.0, -4], [-2.0, -4.5]], parTime: 46,
  }),
  bay(10, "training-lot", "Graduation", {
    arenaW: 34, arenaL: 36, bayW: 2.7, dir: "reverse", occupied: [-1, 1], zoneSize: [2.5, 5.15],
    start: [9, -9], startHeading: 0,
    cones: [[3.5, -2], [1.5, 0.5], [5, 2]], parTime: 52,
  }),
];

/* --------------------------------------------------------- world 2: City */

const CITY = [
  parallel(11, "city-street", "Kerb Side", { gap: 9.5, back: false, zoneSize: [2.6, 6.6], parTime: 34 }),
  parallel(12, "city-street", "Long Bay", { gap: 8.5, parTime: 38 }),
  parallel(13, "city-street", "Between Two", { gap: 7.0, parTime: 42 }),
  parallel(14, "city-street", "Reverse In", { gap: 6.6, dir: "reverse", parTime: 46 }),
  parallel(15, "city-street", "Narrow Street", { gap: 6.6, arenaW: 20, parTime: 46,
    walls: [[-6.5, 0, 1, 34]] }),
  parallel(16, "city-street", "Cone Works", { gap: 6.8, parTime: 48,
    cones: [[1.5, 7], [1.0, -7], [2.5, 10]] }),
  parallel(17, "city-street", "By The Junction", { gap: 6.4, zoneZ: 3, parTime: 50,
    extraCars: [[-4.4, 12, Math.PI / 2]] }),
  parallel(18, "city-street", "Tight Kerb", { gap: 6.0, zoneSize: [2.45, 6.0], parTime: 52 }),
  parallel(19, "city-street", "Boxed In", { gap: 5.9, arenaW: 19, parTime: 54,
    walls: [[-6.0, 0, 1, 34]], cones: [[1.0, 8], [1.2, -8]] }),
  parallel(20, "city-street", "Downtown Final", { gap: 5.8, dir: "reverse", zoneSize: [2.4, 5.9],
    parTime: 60, cones: [[1.4, 9], [2.4, 12], [0.8, -9]] }),
];

/* ------------------------------------------------------- world 3: Garage */

const GARAGE = [
  garage(21, "parking-garage", "Level P1", { bayW: 3.0, dir: "forward", zoneSize: [2.8, 5.3], parTime: 34 }),
  garage(22, "parking-garage", "Beside The Pillar", { bayW: 2.8, occupied: [1],
    columns: [[-2.9, 8.6, 1.2]], parTime: 40 }),
  garage(23, "parking-garage", "Around The Pillar", { bayW: 2.8, dir: "reverse", occupied: [-1],
    columns: [[3.0, 8.6, 1.2]], start: [7, -8], parTime: 48 }),
  garage(24, "parking-garage", "Narrow Lane", { bayW: 2.7, arenaW: 24, occupied: [-1, 1],
    walls: [[-9, 0, 1, 30]], parTime: 46 }),
  garage(25, "parking-garage", "Up The Ramp", { bayW: 2.8, occupied: [1], zoneZ: 10,
    start: [0, -11], barriers: [[-6, -2, 0, 3], [6, -2, 0, 3]], parTime: 50 }),
  garage(26, "parking-garage", "Hairpin", { bayW: 2.7, dir: "reverse", occupied: [-1, 1],
    zoneX: -7, start: [8, -7], startHeading: Math.PI / 2,
    columns: [[-2.5, 3, 1.1]], parTime: 56 }),
  garage(27, "parking-garage", "Big Neighbours", { bayW: 2.75, occupied: [-1, 1],
    zoneSize: [2.5, 5.15], parTime: 48 }),
  garage(28, "parking-garage", "Pillar Maze", { bayW: 2.7, dir: "reverse", occupied: [1],
    columns: [[-3.0, 8.6, 1.1], [3.0, 2.5, 1.1], [-3.0, -1, 1.1]], start: [6, -8], parTime: 60 }),
  garage(29, "parking-garage", "Threadneedle", { bayW: 2.65, arenaW: 22, occupied: [-1, 1],
    walls: [[-8.5, 0, 1, 30]], columns: [[3.2, 3, 1.0]], cones: [[3.5, -3], [1.5, -1]],
    zoneSize: [2.45, 5.1], parTime: 62 }),
  garage(30, "parking-garage", "Garage Final", { bayW: 2.6, dir: "reverse", occupied: [-1, 1],
    columns: [[-3.2, 8.6, 1.1], [3.2, 8.6, 1.1], [0, 1, 1.1]], start: [7, -9], startHeading: 0,
    zoneSize: [2.4, 5.05], parTime: 70 }),
];

/* ----------------------------------------------------- world 4: Rooftop */

function rooftopFix(l) {
  l.arena.wall = "solid";
  l.roof = true;
  return l;
}
const ROOFTOP = [
  rooftopFix(bay(31, "rainy-rooftop", "Wet Start", { arenaW: 34, arenaL: 32, bayW: 3.2,
    zoneSize: [3.0, 5.5], parTime: 34 })),
  rooftopFix(bay(32, "rainy-rooftop", "Slick Bay", { arenaW: 34, arenaL: 32, bayW: 2.9,
    occupied: [-1], parTime: 38 })),
  rooftopFix(parallel(33, "rainy-rooftop", "Rooftop Edge", { gap: 7.4, curbX: 5.2, parTime: 44,
    walls: [[7.0, 0, 1, 40]] })),
  rooftopFix(bay(34, "rainy-rooftop", "Reverse & Slide", { arenaW: 34, arenaL: 34, bayW: 2.9,
    dir: "reverse", occupied: [1], start: [7, -8], parTime: 46 })),
  rooftopFix(bay(35, "rainy-rooftop", "Barrier Run", { arenaW: 36, arenaL: 34, bayW: 2.9,
    occupied: [-1, 1], barriers: [[-4, -3, 0, 3], [4, -1, 0, 3], [-2, 2, 0, 2.5]], parTime: 50 })),
  rooftopFix(parallel(36, "rainy-rooftop", "Puddle Parallel", { gap: 6.4, dir: "reverse",
    parTime: 52, cones: [[1.4, 8], [1.0, -8]] })),
  rooftopFix(bay(37, "rainy-rooftop", "Tight & Wet", { arenaW: 32, arenaL: 32, bayW: 2.65,
    occupied: [-1, 1], zoneSize: [2.5, 5.1], parTime: 50 })),
  rooftopFix(bay(38, "rainy-rooftop", "Ninety On Slick", { arenaW: 36, arenaL: 30, bayW: 2.8,
    occupied: [-1, 1], zoneX: -6, start: [8, -6], startHeading: Math.PI / 2, parTime: 56 })),
  rooftopFix(bay(39, "rainy-rooftop", "Narrow Deck", { arenaW: 22, arenaL: 36, bayW: 2.7,
    occupied: [1], walls: [[-8, 0, 1, 34], [8, 0, 1, 34]],
    cones: [[2, -4], [-2, -6]], parTime: 56 })),
  rooftopFix(bay(40, "rainy-rooftop", "Storm Final", { arenaW: 34, arenaL: 36, bayW: 2.6,
    dir: "reverse", occupied: [-1, 1], zoneSize: [2.42, 5.05], start: [8, -10], startHeading: 0,
    barriers: [[3, -3, 0, 3], [-3, 0, 0, 3]], cones: [[5, 1], [1, 2]], parTime: 72 })),
];

/* ------------------------------------------------------- world 5: Night */

const NIGHT = [
  bay(41, "night-challenge", "Night Lights", { arenaW: 34, arenaL: 32, bayW: 3.1,
    zoneSize: [2.9, 5.5], parTime: 34 }),
  bay(42, "night-challenge", "Reverse Under Lamps", { arenaW: 34, arenaL: 34, bayW: 2.9,
    dir: "reverse", occupied: [-1], start: [7, -8], parTime: 44 }),
  bay(43, "night-challenge", "Tight Company", { arenaW: 32, arenaL: 32, bayW: 2.62,
    occupied: [-1, 1], zoneSize: [2.44, 5.1], parTime: 46 }),
  parallel(44, "night-challenge", "Night Parallel", { gap: 6.2, dir: "reverse", parTime: 52,
    cones: [[1.3, 8], [1.0, -8]] }),
  bay(45, "night-challenge", "Alley Approach", { arenaW: 20, arenaL: 38, bayW: 2.8, occupied: [1],
    walls: [[-7, -4, 1, 22], [7, 4, 1, 22]], start: [0, -13], cones: [[2, -6], [-2, -2]], parTime: 56 }),
  bay(46, "night-challenge", "Reverse The Gauntlet", { arenaW: 36, arenaL: 36, bayW: 2.7,
    dir: "reverse", occupied: [-1, 1], start: [9, -9], startHeading: 0,
    barriers: [[3, -4, 0, 3], [-3, -1, 0, 3], [4, 2, 0, 2.5]], parTime: 62 }),
  bay(47, "night-challenge", "Manoeuvre Sequence", { arenaW: 36, arenaL: 34, bayW: 2.7,
    occupied: [-1, 1], zoneX: -7, start: [9, -7], startHeading: Math.PI / 2,
    columns: [[0, 0, 1.0]], cones: [[4, -4], [-3, 3]], parTime: 66 }),
  bay(48, "night-challenge", "Very Tight", { arenaW: 30, arenaL: 30, bayW: 2.55,
    occupied: [-1, 1], zoneSize: [2.38, 5.0], parTime: 58 }),
  bay(49, "night-challenge", "Expert Yard", { arenaW: 24, arenaL: 38, bayW: 2.6, dir: "reverse",
    occupied: [1], walls: [[-9, 2, 1, 26]], columns: [[4, 2, 1.0]],
    barriers: [[-2, -6, 0, 3]], cones: [[3, -3], [1, -1], [5, 1]], start: [8, -12], parTime: 72 }),
  bay(50, "night-challenge", "Parking Master", { arenaW: 34, arenaL: 40, bayW: 2.5,
    dir: "reverse", occupied: [-1, 1], zoneSize: [2.36, 5.0], start: [10, -13], startHeading: 0,
    columns: [[2, -2, 1.0], [-4, 3, 1.0]],
    barriers: [[6, 2, 0, 3], [-1, -7, 0, 3]],
    cones: [[7, -4], [4, -1], [8, 3], [1, 1]], parTime: 90 }),
];

/* ----------------------------------------------------------------- export */

const ALL = [...TRAINING, ...CITY, ...GARAGE, ...ROOFTOP, ...NIGHT].map((l, i) => ({
  id: i + 1,
  ...l,
}));

export const LEVELS = ALL;
export const TOTAL_LEVELS = ALL.length;

const BY_ID = Object.fromEntries(ALL.map((l) => [l.id, l]));

export function getLevel(id) {
  return BY_ID[id] || null;
}

export function levelsForWorld(worldId) {
  return ALL.filter((l) => l.world === worldId);
}

export function worldOf(id) {
  const l = getLevel(id);
  return l ? l.world : null;
}
