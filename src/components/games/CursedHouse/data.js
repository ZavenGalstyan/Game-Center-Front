/**
 * The Cursed House: Escape — static house definition (pure data, no Three.js).
 *
 * Coordinates are metres. x grows east, z grows south (the front door is on
 * the south wall), y is up. The footprint is 12 × 12 with three levels:
 *   B  basement  y = -3   (under the living room)
 *   G  ground    y =  0   (entrance hall, living room, kitchen)
 *   U  upstairs  y =  3   (corridor, bathroom, bedroom, storage)
 * Yaw: 0 looks north (-z); +π/2 looks west (-x); -π/2 looks east (+x).
 *
 * sim.js turns this into colliders, floors, a navigation graph and
 * interactables; world.js builds the visible house from the same data, so
 * what you see is what you collide with.
 */
export const LEVEL = { B: -3, G: 0, U: 3, P: 0 };
export const STOREY = 3;
export const WALL_T = 0.16;
export const DOOR_H = 2.25;

export const PLAYER_R = 0.28;
export const PLAYER_H = 1.75;
export const CROUCH_H = 1.15;
export const EYE = 1.6;
export const CROUCH_EYE = 1.02;
export const ENEMY_R = 0.34;
export const ENEMY_H = 1.8;
export const STEP_UP = 0.5;

export const SPEED = { walk: 2.4, sprint: 4.3, crouch: 1.25 };
export const ENEMY_SPEED = { patrol: 1.45, investigate: 2.15, search: 1.7, chase: 3.25 };
export const LIVES = 3;

/**
 * Walls: [level, axis, fixed, from, to, gaps?, opts?]
 *  axis "x": runs along x at z = fixed, from x = from to x = to
 *  axis "z": runs along z at x = fixed
 *  gap: { c, w, door } — an opening centred at c (door = door id or null)
 */
export const WALLS = [
  // ---------------------------------------------------------------- ground
  ["G", "x", 0, 0, 12],
  ["G", "x", 12, 0, 12, [{ c: 8.3, w: 1.2, door: "front" }]],
  ["G", "z", 0, 0, 12],
  ["G", "z", 12, 0, 12],
  ["G", "z", 6, 0, 12, [{ c: 2.6, w: 1.1, door: "hk" }, { c: 9, w: 1.1, door: "hl" }]],
  ["G", "x", 5.2, 0, 6, [{ c: 3.7, w: 1.1, door: "lk" }]],
  ["G", "z", 1.4, 0, 5.2, [{ c: 0.65, w: 1.0, door: "bs" }]],
  ["G", "z", 10.6, 4, 10.6, null, { kind: "stair" }],
  ["G", "x", 4, 10.6, 12, null, { kind: "stair" }],
  // ---------------------------------------------------------------- basement
  ["B", "z", 0, 0, 12],
  ["B", "x", 0, 0, 1.4],
  ["B", "z", 1.4, 0, 5.2],
  ["B", "x", 5.2, 1.4, 6],
  ["B", "z", 6, 5.2, 12],
  ["B", "x", 12, 0, 6],
  // ---------------------------------------------------------------- upstairs
  ["U", "x", 0, 0, 12],
  ["U", "x", 12, 0, 12],
  ["U", "z", 0, 0, 12],
  ["U", "z", 12, 0, 12],
  ["U", "z", 6, 0, 12, [{ c: 2, w: 1.1, door: "cb" }, { c: 9, w: 1.1, door: "sb" }]],
  ["U", "x", 5.2, 0, 6, [{ c: 3.5, w: 1.1, door: "bb" }]],
  ["U", "x", 4, 6, 10.6, [{ c: 8.3, w: 1.1, door: "cs" }]],
  ["U", "z", 10.6, 4, 12],
  // ---------------------------------------------------------------- porch rails (outside)
  ["P", "z", 6.6, 12, 14.5, null, { h: 1.0, kind: "rail" }],
  ["P", "z", 10.0, 12, 14.5, null, { h: 1.0, kind: "rail" }],
  ["P", "x", 14.5, 6.6, 10.0, null, { h: 1.0, kind: "rail" }],
];

/** Doors: swing = which side of the wall the open panel rests on (+1/-1 along the wall normal). */
export const DOORS = {
  front: { name: "Front door", open: false, locked: true, swing: -1, hinge: -1 },
  hk: { name: "Kitchen door", open: true, swing: -1, hinge: 1 },
  hl: { name: "Living room door", open: false, swing: 1, hinge: -1 },
  lk: { name: "Kitchen door", open: true, swing: 1, hinge: 1 },
  bs: { name: "Basement door", open: false, swing: 1, hinge: 1 },
  cb: { name: "Bathroom door", open: true, swing: -1, hinge: -1 },
  sb: { name: "Bedroom door", open: false, swing: 1, hinge: -1 },
  bb: { name: "Bathroom door", open: false, swing: -1, hinge: -1 },
  cs: { name: "Storage door", open: true, swing: 1, hinge: -1 },
};

/**
 * Walkable floors. Flat: [x0, z0, x1, z1, y, surface]. Ramps carry
 * { ramp: "z", ya, yb } meaning height ya at z0 and yb at z1.
 */
export const FLOORS = [
  // ground
  { r: [6, 0, 10.6, 12], y: 0, s: "wood", room: "hall" },
  { r: [10.6, 0, 12, 4], y: 0, s: "wood", room: "hall" },
  { r: [10.6, 10.6, 12, 12], y: 0, s: "wood", room: "hall" },
  { r: [1.4, 0, 6, 5.2], y: 0, s: "tile", room: "kitchen" },
  { r: [0, 5.2, 6, 12], y: 0, s: "wood", room: "living" },
  { r: [0, 0, 1.4, 1.2], y: 0, s: "wood", room: "bstairs" },
  // stairs
  { r: [0, 1.2, 1.4, 5.2], ramp: "z", ya: 0, yb: -3, s: "stair", room: "bstairs" },
  { r: [10.6, 4, 12, 10.6], ramp: "z", ya: 3, yb: 0, s: "stair", room: "stairs" },
  // basement
  { r: [0, 5.2, 6, 12], y: -3, s: "stone", room: "basement" },
  // upstairs
  { r: [6, 0, 12, 4], y: 3, s: "wood", room: "corridor" },
  { r: [6, 4, 10.6, 12], y: 3, s: "wood", room: "storage" },
  { r: [0, 0, 6, 5.2], y: 3, s: "tile", room: "bathroom" },
  { r: [0, 5.2, 6, 12], y: 3, s: "wood", room: "bedroom" },
  // outside
  { r: [6.6, 12, 10.0, 14.5], y: 0, s: "porch", room: "porch" },
];

export const ROOMS = {
  hall: { name: "Entrance Hall" },
  living: { name: "Living Room" },
  kitchen: { name: "Kitchen" },
  bstairs: { name: "Cellar Stairs" },
  basement: { name: "Basement" },
  stairs: { name: "Staircase" },
  corridor: { name: "Upstairs Landing" },
  storage: { name: "Storage Room" },
  bathroom: { name: "Bathroom" },
  bedroom: { name: "Bedroom" },
  porch: { name: "Outside" },
};

/**
 * Furniture: { kind, r: [x0,z0,x1,z1], l: level, h: height, face, ...extra }
 * face = direction the front looks: "n" (-z) "s" (+z) "e" (+x) "w" (-x).
 * Every piece is a solid collider; pieces taller than 1.6 m also block sight.
 */
export const FURNITURE = [
  // hall
  { kind: "console", r: [6.08, 5.0, 6.52, 6.6], l: "G", h: 0.85, face: "e" },
  { kind: "clock", r: [11.42, 1.0, 11.92, 1.6], l: "G", h: 2.2, face: "w" },
  { kind: "coatrack", r: [6.15, 10.55, 6.55, 10.95], l: "G", h: 1.8, face: "e", noSight: true },
  // kitchen
  { kind: "counter", r: [2.75, 0.08, 4.8, 0.7], l: "G", h: 0.92, face: "s" },
  { kind: "stove", r: [4.8, 0.08, 5.55, 0.7], l: "G", h: 0.95, face: "s" },
  { kind: "fridge", r: [5.25, 0.78, 5.92, 1.5], l: "G", h: 1.9, face: "w", container: "fridge" },
  { kind: "table", r: [2.4, 2.2, 4.1, 3.5], l: "G", h: 0.78, face: "s" },
  // living room
  { kind: "sofa", r: [0.12, 7.2, 1.05, 9.8], l: "G", h: 0.9, face: "e" },
  { kind: "coffeetable", r: [2.0, 7.9, 2.9, 9.1], l: "G", h: 0.45, face: "e" },
  { kind: "fireplace", r: [2.2, 11.42, 3.8, 11.92], l: "G", h: 1.3, face: "n" },
  { kind: "armchair", r: [0.35, 10.5, 1.25, 11.4], l: "G", h: 0.95, face: "e" },
  { kind: "wardrobe", r: [5.3, 10.3, 5.92, 11.5], l: "G", h: 2.05, face: "w", hide: "w1" },
  { kind: "bookshelf", r: [5.5, 5.6, 5.92, 7.6], l: "G", h: 2.1, face: "w" },
  // basement
  { kind: "boiler", r: [4.4, 5.5, 5.8, 6.8], l: "B", h: 2.2, face: "w" },
  { kind: "shelves", r: [5.45, 8.0, 5.92, 10.6], l: "B", h: 2.0, face: "w" },
  { kind: "workbench", r: [2.2, 11.3, 4.4, 11.92], l: "B", h: 0.9, face: "n" },
  { kind: "toolbox", r: [2.95, 11.4, 3.65, 11.8], l: "B", y0: 0.9, h: 0.25, face: "n", container: "toolbox", noCollide: true },
  { kind: "cot", r: [0.12, 8.4, 1.0, 10.6], l: "B", h: 0.55, face: "e", hide: "b2" },
  { kind: "pillar", r: [2.9, 8.3, 3.2, 8.6], l: "B", h: 3.0, face: "n" },
  { kind: "barrels", r: [0.15, 11.1, 0.85, 11.85], l: "B", h: 1.0, face: "e" },
  // corridor
  { kind: "sidetable", r: [9.2, 0.1, 10.2, 0.5], l: "U", h: 0.8, face: "s" },
  // bathroom
  { kind: "bathtub", r: [0.12, 0.12, 1.9, 0.95], l: "U", h: 0.6, face: "s" },
  { kind: "toilet", r: [4.6, 0.1, 5.2, 0.75], l: "U", h: 0.8, face: "s" },
  { kind: "sink", r: [0.1, 3.0, 0.6, 3.7], l: "U", h: 0.9, face: "e" },
  { kind: "cabinet", r: [5.45, 3.6, 5.92, 4.9], l: "U", h: 1.8, face: "w" },
  // bedroom
  { kind: "bed", r: [0.1, 7.9, 2.2, 10.3], l: "U", h: 0.65, face: "e", hide: "b1" },
  { kind: "nightstand", r: [0.1, 7.3, 0.55, 7.85], l: "U", h: 0.6, face: "e" },
  { kind: "dresser", r: [2.4, 11.45, 4.0, 11.92], l: "U", h: 1.0, face: "n", container: "dresser" },
  { kind: "rocker", r: [4.5, 10.6, 5.25, 11.35], l: "U", h: 1.1, face: "nw" },
  // storage
  { kind: "crates", r: [9.4, 4.15, 10.5, 5.3], l: "U", h: 1.1, face: "w" },
  { kind: "cratestack", r: [6.15, 10.9, 7.3, 11.9], l: "U", h: 1.6, face: "e" },
  { kind: "wardrobe", r: [8.4, 11.35, 9.6, 11.92], l: "U", h: 2.05, face: "n", hide: "w2" },
  { kind: "trunk", r: [6.15, 5.6, 7.0, 6.4], l: "U", h: 0.6, face: "e" },
  { kind: "mannequin", r: [9.75, 8.6, 10.25, 9.1], l: "U", h: 1.7, face: "w", noSight: true },
  { kind: "draped", r: [7.8, 6.8, 9.0, 7.8], l: "U", h: 1.05, face: "n" },
  { kind: "boxes", r: [9.8, 10.2, 10.5, 11.0], l: "U", h: 0.8, face: "w" },
];

/**
 * Hiding spots. cam = where the eye sits while hidden, yaw = facing out,
 * exit = a clear spot on the floor in front, point = what you aim at.
 */
export const HIDES = {
  w1: { kind: "wardrobe", name: "wardrobe", l: "G", point: [5.3, 1.2, 10.9], cam: [5.64, 1.5, 10.9], yaw: Math.PI / 2, exit: [4.55, 10.9] },
  w2: { kind: "wardrobe", name: "wardrobe", l: "U", point: [9.0, 1.2, 11.35], cam: [9.0, 1.5, 11.65], yaw: 0, exit: [9.0, 10.6] },
  b1: { kind: "bed", name: "bed", l: "U", point: [2.2, 0.35, 9.1], cam: [1.15, 0.22, 9.1], yaw: -Math.PI / 2, exit: [2.95, 9.1] },
  b2: { kind: "bed", name: "cot", l: "B", point: [1.0, 0.3, 9.5], cam: [0.55, 0.2, 9.5], yaw: -Math.PI / 2, exit: [1.75, 9.5] },
};

/** Containers that must be opened before what is inside can be taken. */
export const CONTAINERS = {
  fridge: { name: "fridge", l: "G", point: [5.25, 1.1, 1.14] },
  toolbox: { name: "toolbox", l: "B", point: [3.3, 1.05, 11.6] },
  dresser: { name: "dresser drawer", l: "U", point: [3.2, 0.8, 11.42] },
};

/**
 * Key spots. Each run hides one key per group (ground floor, basement,
 * upstairs), so the three keys are always in three different rooms.
 * pos = [x, height above level, z]; inside = container that hides it.
 */
export const KEY_SPOTS = [
  { id: "A1", group: 0, l: "G", room: "kitchen", pos: [5.58, 0.98, 1.14], inside: "fridge", hint: "Something cold rattles in the kitchen." },
  { id: "A2", group: 0, l: "G", room: "living", pos: [3.05, 1.33, 11.62], hint: "" },
  { id: "B1", group: 1, l: "B", room: "basement", pos: [3.3, 0.97, 11.6], inside: "toolbox", hint: "" },
  { id: "B2", group: 1, l: "B", room: "basement", pos: [5.66, 1.06, 9.3], hint: "" },
  { id: "C1", group: 2, l: "U", room: "bedroom", pos: [3.2, 0.73, 11.3], inside: "dresser", hint: "" },
  { id: "C2", group: 2, l: "U", room: "bathroom", pos: [1.0, 0.22, 0.55], hint: "" },
  { id: "C3", group: 2, l: "U", room: "storage", pos: [9.95, 1.12, 4.72], hint: "" },
];
export const KEY_NAMES = ["Brass key", "Iron key", "Silver key"];

/** Navigation nodes [x, z, level]. Door-side nodes are added automatically. */
export const NODES = [
  // hall
  [8.3, 10.6, "G"], [8.3, 6.8, "G"], [8.3, 2.0, "G"], [11.2, 2.6, "G"], [11.3, 11.3, "G"], [9.6, 11.2, "G"],
  // main stairs (ramp) and top
  [11.3, 7.5, "S"], [11.3, 3.2, "U"],
  // kitchen
  [2.05, 0.65, "G"], [2.1, 1.6, "G"], [4.8, 1.8, "G"], [4.8, 4.3, "G"], [1.95, 4.3, "G"],
  // living room
  [4.2, 7.0, "G"], [3.8, 9.9, "G"], [1.6, 6.3, "G"], [1.6, 10.0, "G"], [4.55, 10.9, "G"],
  // cellar stairs
  [0.7, 0.65, "G"], [0.7, 3.2, "S"], [0.7, 5.9, "B"],
  // basement
  [2.4, 6.6, "B"], [4.2, 9.3, "B"], [2.0, 10.4, "B"], [3.6, 7.4, "B"], [1.75, 9.5, "B"],
  // corridor
  [9.6, 2.0, "U"], [7.6, 1.2, "U"], [8.3, 3.2, "U"],
  // bathroom
  [3.2, 2.0, "U"], [3.5, 4.3, "U"], [5.0, 2.6, "U"],
  // bedroom
  [3.8, 7.6, "U"], [3.4, 10.3, "U"], [2.95, 9.1, "U"], [4.9, 9.0, "U"],
  // storage
  [8.3, 4.9, "U"], [7.2, 8.6, "U"], [8.6, 9.2, "U"], [9.0, 10.6, "U"], [9.9, 6.6, "U"],
];

export const START = { x: 3.6, z: 7.0, l: "U", yaw: -2.2 };
/** Where the widow starts a run and where she returns after a capture. */
export const ENEMY_START = { x: 3.6, z: 7.4, l: "B" };
export const ENEMY_RESPAWNS = [[3.6, 7.4, "B"], [2.1, 1.6, "G"], [1.6, 10.0, "G"]];
export const EXIT_Z = 12.7;

/** Window decorations (visual only): [level, axis, fixed, centre, width]. */
export const WINDOWS = [
  ["G", "z", 0, 8.5, 1.2], ["G", "x", 0, 4.2, 1.1], ["G", "z", 12, 7.0, 1.2], ["G", "x", 12, 5.0, 1.1], ["G", "x", 12, 10.6, 0.8],
  ["U", "z", 0, 2.6, 1.1], ["U", "z", 0, 8.0, 1.2], ["U", "x", 0, 7.8, 1.1], ["U", "z", 12, 2.0, 1.0], ["U", "x", 12, 4.5, 1.1],
  ["B", "x", 12, 3.0, 0.8],
];

export const BEST_KEY = "cursed-house-best";
export const SETTINGS_KEY = "cursed-house-settings";
