/**
 * Zoo Simulator 3D — static data: map layout (metres, XZ plane, −Z is north),
 * species, zones, upgrades, staff, missions. Pure JS, no Three.js, so the
 * headless tests in tools/ can import it.
 *
 * Rects are { x0, x1, z0, z1 } with x0 < x1 and z0 < z1.
 */

export const SAVE_KEY = "zoo-simulator-3d-save";
export const SETTINGS_KEY = "zoo-simulator-3d-settings";
export const SAVE_VERSION = 1;

export const START_MONEY = 3000;
export const DAY_LENGTH = 180; // seconds per in-game day (wages + daily tasks)
export const EYE = 1.65;
export const PLAYER_R = 0.35;
export const WALK = 4.3;
export const SPRINT = 7.4;
export const SHOES_SPRINT = 9.2;

/** Walkable area for the player (the entrance gate is the south edge). */
export const BOUNDS = { x0: -44.5, x1: 82.5, z0: -78.5, z1: 36.6 };
/** Forest corner north of Elephant Valley — outside the park. */
export const FOREST_BLOCK = { x0: 44, x1: 90, z0: -90, z1: -30 };

export const ZONES = {
  main: { name: "Main Park", cost: 0 },
  savanna: {
    name: "Savanna Plains",
    cost: 1500,
    desc: "Room for giraffes and lions, +8 visitor capacity.",
    barrier: { x0: -2.6, x1: 2.6, z0: -22.8, z1: -21.2 },
    sign: { x: 4.4, z: -19.8 },
  },
  valley: {
    name: "Elephant Valley",
    cost: 2500,
    desc: "A huge habitat for elephants, +8 visitor capacity.",
    barrier: { x0: 43.2, x1: 44.8, z0: 3.4, z1: 8.6 },
    sign: { x: 41.4, z: 10.8 },
  },
};
export const ZONE_IDS = ["main", "savanna", "valley"];

/** Hedges separating the starter park from the expansion zones (gaps hold barriers). */
export const HEDGES = [
  { x0: -44.5, x1: -2.6, z0: -22.4, z1: -21.6 },
  { x0: 2.6, x1: 44.4, z0: -22.4, z1: -21.6 },
  { x0: 43.6, x1: 44.4, z0: -30, z1: 3.4 },
  { x0: 43.6, x1: 44.4, z0: 8.6, z1: 36.6 },
];

export const PATHS = [
  { x0: -2.5, x1: 2.5, z0: -21.6, z1: 44, zone: "main" }, // main avenue (runs out of the gate)
  { x0: -40, x1: 43.6, z0: 3.5, z1: 8.5, zone: "main" }, // east–west promenade
  { x0: 2.5, x1: 10, z0: -13.5, z1: -10.5, zone: "main" }, // barn spur
  { x0: -9.5, x1: 9.5, z0: 27.5, z1: 37.2, zone: "main" }, // entrance plaza
  { x0: -2.5, x1: 2.5, z0: -68, z1: -21.6, zone: "savanna" },
  { x0: 44.4, x1: 80, z0: 3.5, z1: 8.5, zone: "valley" },
];
export const PLAZAS = [
  { x: 0, z: 6, r: 7.5, zone: "main" },
  { x: 0, z: -67, r: 6, zone: "savanna" },
  { x: 63, z: 15, r: 5, zone: "valley" },
];
export const FOUNTAIN = { x: 0, z: 6, r: 2.3 };
export const POND = { x: 31, z: 21, r: 5.2 };

/**
 * Species. `start` = animals that arrive with a newly built enclosure,
 * `max` = enclosure capacity, `weight` = how much visitors want to see them,
 * `eat`/`drink` = trough/basin share one meal/drink uses, `mess` = droppings
 * per animal per minute.
 */
export const SPECIES = {
  rabbit: { name: "Rabbit", plural: "Rabbits", animalCost: 120, start: 3, max: 6, weight: 1, eat: 0.12, drink: 0.1, mess: 0.22, r: 0.28, speed: 2.4, react: 3, prey: true },
  deer: { name: "Deer", plural: "Deer", animalCost: 250, start: 2, max: 4, weight: 1.6, eat: 0.22, drink: 0.18, mess: 0.3, r: 0.6, speed: 2.6, react: 4, prey: true },
  zebra: { name: "Zebra", plural: "Zebras", animalCost: 400, start: 2, max: 4, weight: 2.2, eat: 0.26, drink: 0.2, mess: 0.34, r: 0.8, speed: 2.8, react: 4, prey: true },
  giraffe: { name: "Giraffe", plural: "Giraffes", animalCost: 700, start: 1, max: 3, weight: 3.2, eat: 0.3, drink: 0.22, mess: 0.38, r: 0.95, speed: 2.2, react: 5, prey: true },
  lion: { name: "Lion", plural: "Lions", animalCost: 900, start: 2, max: 3, weight: 4, eat: 0.34, drink: 0.22, mess: 0.34, r: 0.8, speed: 2.6, react: 7, prey: false },
  elephant: { name: "Elephant", plural: "Elephants", animalCost: 1300, start: 1, max: 2, weight: 5.5, eat: 0.45, drink: 0.35, mess: 0.6, r: 1.5, speed: 1.8, react: 7, prey: false },
};

/**
 * Enclosures. `gate.side`: E = x1 wall, W = x0 wall, N = z0 wall, S = z1 wall;
 * `gate.at` is the coordinate along that wall. Troughs/basins sit just inside
 * the visitor-facing fence so they can be filled across it. `views` are
 * segments [x0,z0,x1,z1] on the paths where visitors stand and watch.
 */
export const ENCLOSURES = [
  {
    id: "rabbit", zone: "main", starter: true, buildCost: 300, ground: "meadow", fence: "wood",
    rect: { x0: -20, x1: -5, z0: 12, z1: 25 }, gate: { side: "E", at: 18.5 },
    trough: { x: -6.1, z: 15.2 }, basin: { x: -6.1, z: 22.2 }, sign: { x: -3.3, z: 26.0 },
    views: [[-3.4, 13.5, -3.4, 24], [-19, 8.0, -6.5, 8.0]],
  },
  {
    id: "deer", zone: "main", starter: true, buildCost: 600, ground: "meadow", fence: "wood",
    rect: { x0: 5, x1: 22, z0: 12, z1: 27 }, gate: { side: "W", at: 19.5 },
    trough: { x: 6.1, z: 15.2 }, basin: { x: 6.1, z: 24.0 }, sign: { x: 3.3, z: 27.8 },
    views: [[3.4, 13, 3.4, 26], [6.5, 8.0, 21, 8.0]],
  },
  {
    id: "zebra", zone: "main", buildCost: 1000, ground: "dry", fence: "wood",
    rect: { x0: -26, x1: -5, z0: -19, z1: -1 }, gate: { side: "E", at: -10 },
    trough: { x: -6.1, z: -15.5 }, basin: { x: -6.1, z: -4.4 }, sign: { x: -3.3, z: -19.8 },
    views: [[-3.4, -18, -3.4, -2], [-25, 4.0, -6.5, 4.0]],
  },
  {
    id: "giraffe", zone: "savanna", buildCost: 2000, ground: "sand", fence: "tall",
    rect: { x0: -34, x1: -6, z0: -60, z1: -28 }, gate: { side: "E", at: -44 },
    trough: { x: -7.1, z: -34 }, basin: { x: -7.1, z: -54 }, sign: { x: -3.3, z: -26.6 },
    views: [[-3.4, -59, -3.4, -29]],
  },
  {
    id: "lion", zone: "savanna", buildCost: 3000, ground: "sand", fence: "steel",
    rect: { x0: 6, x1: 32, z0: -58, z1: -28 }, gate: { side: "W", at: -44 },
    trough: { x: 7.1, z: -34 }, basin: { x: 7.1, z: -52 }, sign: { x: 3.3, z: -26.6 },
    views: [[3.4, -57, 3.4, -29]],
  },
  {
    id: "elephant", zone: "valley", buildCost: 4500, ground: "mud", fence: "stone",
    rect: { x0: 50, x1: 80, z0: -27, z1: 0 }, gate: { side: "S", at: 58 },
    trough: { x: 53.5, z: -1.1 }, basin: { x: 71, z: -1.1 }, sign: { x: 48.4, z: 2.4 },
    views: [[51, 4.0, 79, 4.0]],
  },
];
export const ENC_BY_ID = Object.fromEntries(ENCLOSURES.map((e) => [e.id, e]));

const OUT = { E: [1, 0], W: [-1, 0], N: [0, -1], S: [0, 1] };
/** Gate centre on the fence line + points 1.3 m outside/inside it. */
export function gatePoints(enc) {
  const { rect: r, gate: g } = enc;
  const [nx, nz] = OUT[g.side];
  const c =
    g.side === "E" ? { x: r.x1, z: g.at } :
    g.side === "W" ? { x: r.x0, z: g.at } :
    g.side === "N" ? { x: g.at, z: r.z0 } : { x: g.at, z: r.z1 };
  return {
    center: c,
    normal: { x: nx, z: nz },
    outside: { x: c.x + nx * 1.3, z: c.z + nz * 1.3 },
    inside: { x: c.x - nx * 1.3, z: c.z - nz * 1.3 },
  };
}
/** Where an animal stands to use a trough/basin (pushed inward from the fence). */
export function feedSpot(enc, p, r) {
  const [nx, nz] = OUT[enc.gate.side];
  return { x: p.x - nx * (0.75 + r * 1.1), z: p.z - nz * (0.75 + r * 1.1) };
}

export const BUILDINGS = [
  { id: "shop", kind: "shop", rect: { x0: -19, x1: -10.2, z0: 28.4, z1: 35.6 }, door: { x: -9.6, z: 32 }, face: "E", label: "GIFT SHOP" },
  { id: "office", kind: "office", rect: { x0: 10.4, x1: 18, z0: 28.4, z1: 34.6 }, door: { x: 9.8, z: 31.5 }, face: "W", label: "STAFF OFFICE" },
  { id: "barn", kind: "barn", rect: { x0: 10, x1: 20, z0: -17, z1: -7 }, door: { x: 9.4, z: -12 }, face: "W", label: "STORAGE" },
  { id: "booth", kind: "booth", rect: { x0: 4.7, x1: 7.5, z0: 33.6, z1: 36.4 }, door: { x: 6.1, z: 33.0 }, face: "N", label: "TICKETS" },
  { id: "kiosk", kind: "kiosk", rect: { x0: 23, x1: 26.4, z0: 9.6, z1: 12.4 }, door: { x: 24.7, z: 9.0 }, face: "S", label: "SNACKS", upgrade: "kiosk" },
];

export const STORAGE = {
  food: { x: 8.5, z: -14.8 },
  supplies: { x: 8.5, z: -8.9 },
};
export const TAPS = [
  { x: 3.7, z: -3.5, zone: "main" },
  { x: 3.7, z: -24.6, zone: "savanna" },
  { x: 47, z: 10.2, zone: "valley" },
];

/** Benches: yaw = direction the sitter faces. `extra` ones appear with the Benches upgrade. */
export const BENCHES = [
  { x: 5.6, z: 11.6, yaw: Math.PI * 1.25 }, { x: -5.6, z: 11.6, yaw: Math.PI * 0.75 },
  { x: 5.6, z: 0.4, yaw: -Math.PI * 0.25 }, { x: -5.6, z: 0.4, yaw: Math.PI * 0.25 },
  { x: -7.6, z: 28.6, yaw: Math.PI }, { x: 7.6, z: 28.6, yaw: Math.PI },
  { x: -32, z: 9.6, yaw: Math.PI }, { x: 30, z: 9.6, yaw: Math.PI },
  { x: -3.6, z: -63, yaw: Math.PI / 2 }, { x: 3.6, z: -63, yaw: -Math.PI / 2 },
  { x: 57, z: 9.6, yaw: Math.PI }, { x: 69, z: 9.6, yaw: Math.PI },
  { x: -14, z: 2.6, yaw: 0, extra: true }, { x: 14, z: 2.6, yaw: 0, extra: true },
  { x: 36, z: 2.6, yaw: 0, extra: true }, { x: -26, z: 9.6, yaw: Math.PI, extra: true },
  { x: 3.6, z: -38, yaw: -Math.PI / 2, extra: true }, { x: -3.6, z: -50, yaw: Math.PI / 2, extra: true },
  { x: 74, z: 9.6, yaw: Math.PI, extra: true }, { x: 3.6, z: -0.6, yaw: -Math.PI / 2, extra: true },
];
export const FLOWER_BEDS = [
  { x: -8.2, z: 21, r: 1.4 }, { x: 8.4, z: 9.9, r: 1.3 }, { x: -8.4, z: 9.9, r: 1.3 },
  { x: -12, z: 25.6, r: 1.2 }, { x: 0, z: -20.2, r: 0 }, { x: 22, z: 2.2, r: 1.5 },
  { x: -36, z: 2.2, r: 1.5 }, { x: 4.2, z: -60, r: 1.2 }, { x: -4.2, z: -60, r: 1.2 },
  { x: 60, z: 12, r: 1.3 }, { x: 4.6, z: 22, r: 0 },
].filter((f) => f.r > 0);

/** Visitor/staff waypoint graph (all on paths). */
export const NODES = {
  gateOut: { x: 0, z: 46, zone: "main" },
  gate: { x: 0, z: 36, zone: "main" },
  ent: { x: 0, z: 29.5, zone: "main" },
  shop: { x: -7.6, z: 32, zone: "main" },
  rd: { x: 0, z: 19, zone: "main" },
  pS: { x: 0, z: 11, zone: "main" },
  pW: { x: -4.9, z: 6, zone: "main" },
  pE: { x: 4.9, z: 6, zone: "main" },
  pN: { x: 0, z: 1, zone: "main" },
  w1: { x: -14, z: 6, zone: "main" },
  w2: { x: -30, z: 6, zone: "main" },
  e1: { x: 14, z: 6, zone: "main" },
  e2: { x: 30, z: 6, zone: "main" },
  vg: { x: 41, z: 6, zone: "main" },
  z1: { x: 0, z: -10, zone: "main" },
  sg: { x: 0, z: -19, zone: "main" },
  s1: { x: 0, z: -30, zone: "savanna" },
  s2: { x: 0, z: -44, zone: "savanna" },
  s3: { x: 0, z: -57, zone: "savanna" },
  s4: { x: 0, z: -66, zone: "savanna" },
  v1: { x: 52, z: 6, zone: "valley" },
  v2: { x: 64, z: 6, zone: "valley" },
  v3: { x: 76, z: 6, zone: "valley" },
};
export const EDGES = [
  ["gateOut", "gate"], ["gate", "ent"], ["ent", "shop"], ["ent", "rd"], ["rd", "pS"],
  ["pS", "pW"], ["pS", "pE"], ["pW", "pN"], ["pE", "pN"], ["pW", "w1"], ["w1", "w2"],
  ["pE", "e1"], ["e1", "e2"], ["e2", "vg"], ["vg", "v1"], ["v1", "v2"], ["v2", "v3"],
  ["pN", "z1"], ["z1", "sg"], ["sg", "s1"], ["s1", "s2"], ["s2", "s3"], ["s3", "s4"],
];

export const TICKET_PRICES = [8, 12, 16, 20];
export const PRICE_DEMAND = { 8: 1.3, 12: 1, 16: 0.8, 20: 0.62 };
export const PRICE_MOOD = { 8: 0.03, 12: 0, 16: -0.05, 20: -0.12 };

export const FOOD_COST = 0; // food, water and cleaning are free — keep the chores easy
export const SUPPLY_COST = 12; // per cleaning-supply refill
export const SUPPLY_MAX = 8;

export const UPGRADES = {
  bucket: { name: "Large Feed Bucket", cost: 200, desc: "Carry 12 food portions instead of 6.", icon: "🪣" },
  jug: { name: "Big Water Jug", cost: 150, desc: "Carry 8 water refills instead of 4.", icon: "💧" },
  broom: { name: "Pro Broom", cost: 300, desc: "Sweeps every dropping within 2.5 m at once.", icon: "🧹" },
  shoes: { name: "Running Shoes", cost: 150, desc: "Sprint 25% faster around the zoo.", icon: "👟" },
  benches: { name: "Benches & Bins", cost: 250, desc: "More seating along the paths. +15% facilities.", icon: "🪑" },
  flowers: { name: "Flower Gardens", cost: 350, desc: "Colourful beds near the plazas. +15% facilities.", icon: "🌷" },
  kiosk: { name: "Snack Kiosk", cost: 600, desc: "Visitors buy snacks (+$4 each). +15% facilities.", icon: "🍦" },
  souvenirs: { name: "Souvenir Range", cost: 400, desc: "Gift shop sales ×1.6. +10% facilities.", icon: "🧸" },
};

export const STAFF = {
  keeper: { name: "Zookeeper", hire: 150, wage: 30, desc: "Refills troughs and water basins automatically.", color: 0x3f8f3a },
  cleaner: { name: "Cleaner", hire: 100, wage: 25, desc: "Sweeps up droppings in the enclosures.", color: 0x2f6fb8 },
  ticket: { name: "Ticket Worker", hire: 100, wage: 20, desc: "Faster entry: +30% visitor flow, +6 capacity.", color: 0xc8433a },
};

export const MISSIONS = [
  { id: "feed3", text: "Feed 3 animals", hint: "Follow the yellow marker: grab free food at the barn, then fill a trough or press E on an animal.", stat: "fed", goal: 3, reward: 150 },
  { id: "water2", text: "Refill 2 water stations", hint: "Follow the marker to a water tap, then refill the water stations.", stat: "watered", goal: 2, reward: 150 },
  { id: "clean1", text: "Clean an enclosure", hint: "Walk in through the gate and press E on each dropping.", stat: "pensCleaned", goal: 1, reward: 200 },
  { id: "earn500", text: "Earn $500", hint: "Happy animals and clean pens bring in visitors and tips.", stat: "earned", goal: 500, delta: true, reward: 250 },
  { id: "buyAnimal", text: "Buy a new animal", hint: "Press E on an enclosure's info sign to buy another animal.", stat: "animalsBought", goal: 1, reward: 250 },
  { id: "build1", text: "Unlock a new enclosure", hint: "Find a construction sign (the Zebra plot is near the barn).", stat: "built", goal: 1, reward: 400 },
  { id: "sat80", text: "Reach 80% visitor satisfaction", hint: "Keep animals fed, watered and clean; buy facility upgrades at the Gift Shop.", stat: "sat", goal: 80, reward: 500 },
  { id: "hire1", text: "Hire your first worker", hint: "Visit the Staff Office by the entrance.", stat: "hired", goal: 1, reward: 300 },
  { id: "lion", text: "Unlock the lion enclosure", hint: "Open the Savanna Plains (north barrier), then build the lion habitat.", stat: "lion", goal: 1, reward: 800 },
  { id: "valley", text: "Expand the zoo: open Elephant Valley", hint: "Walk to the barrier at the east end of the promenade.", stat: "valley", goal: 1, reward: 1500 },
];

export const DAILY_POOL = [
  { type: "fed", text: (n) => `Feed ${n} animals`, min: 4, max: 8, reward: 90 },
  { type: "watered", text: (n) => `Refill ${n} water basins`, min: 2, max: 4, reward: 80 },
  { type: "cleaned", text: (n) => `Sweep ${n} droppings`, min: 3, max: 6, reward: 90 },
  { type: "visitors", text: (n) => `Welcome ${n} visitors`, min: 14, max: 26, reward: 100 },
];

export const ANIMAL_NAMES = [
  "Clover", "Pip", "Hazel", "Biscuit", "Maple", "Juniper", "Willow", "Pepper", "Thistle", "Nutmeg",
  "Ziggy", "Marbles", "Domino", "Stripes", "Bongo", "Kiko", "Twiga", "Zuri", "Amara", "Ayo",
  "Simba", "Nala", "Kito", "Leo", "Sheba", "Tembo", "Dumi", "Mosi", "Asha", "Olive", "Basil", "Sage",
];

/** Small seeded PRNG (mulberry32). */
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

export const inRect = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

/** Which zone a point belongs to (for gating taps, NPC routing, …). */
export function zoneAt(x, z) {
  if (x > 44) return "valley";
  if (z < -22) return "savanna";
  return "main";
}

/**
 * Deterministic scenery: trees inside the park (with colliders) and a dense
 * forest ring outside it. Shared by the renderer and the collision builder.
 */
export function scenery() {
  const R = rng(7);
  const blocks = [];
  for (const p of PATHS) blocks.push({ ...p, m: 1.4 });
  for (const e of ENCLOSURES) blocks.push({ ...e.rect, m: 1.6 });
  for (const b of BUILDINGS) blocks.push({ ...b.rect, m: 2.2 });
  for (const h of HEDGES) blocks.push({ ...h, m: 1.2 });
  blocks.push({ x0: -12, x1: 12, z0: 26, z1: 40, m: 0 });
  const circles = [...PLAZAS.map((p) => ({ x: p.x, z: p.z, r: p.r + 1.4 })), { ...POND, r: POND.r + 1.5 }];
  for (const t of TAPS) circles.push({ x: t.x, z: t.z, r: 2 });
  for (const b of BENCHES) circles.push({ x: b.x, z: b.z, r: 2 });
  for (const f of FLOWER_BEDS) circles.push({ x: f.x, z: f.z, r: f.r + 1 });
  for (const s of [STORAGE.food, STORAGE.supplies]) circles.push({ x: s.x, z: s.z, r: 2 });
  for (const e of ENCLOSURES) circles.push({ x: e.sign.x, z: e.sign.z, r: 1.6 });
  for (const z of Object.values(ZONES)) if (z.sign) circles.push({ x: z.sign.x, z: z.sign.z, r: 2 });

  const free = (x, z) => {
    if (blocks.some((b) => inRect(b, x, z, b.m))) return false;
    if (circles.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r)) return false;
    return true;
  };
  const trees = [];
  let tries = 0;
  while (trees.length < 85 && tries++ < 6000) {
    const x = BOUNDS.x0 + 1.5 + R() * (BOUNDS.x1 - BOUNDS.x0 - 3);
    const z = BOUNDS.z0 + 1.5 + R() * (BOUNDS.z1 - BOUNDS.z0 - 3);
    if (inRect(FOREST_BLOCK, x, z, 1.5)) continue;
    if (!free(x, z)) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.z - z) ** 2 < 16)) continue;
    trees.push({ x, z, s: 0.8 + R() * 0.55, kind: R() < 0.55 ? 0 : R() < 0.6 ? 1 : 2, rot: R() * 6.28 });
  }
  // decorative trees inside enclosures (acacias for the savanna)
  const inner = [
    { x: -15, z: 22, kind: 0, s: 0.9 }, { x: 18, z: 14.5, kind: 1, s: 1 }, { x: -22, z: -15, kind: 3, s: 1 },
    { x: -28, z: -36, kind: 3, s: 1.25 }, { x: -12, z: -52, kind: 3, s: 1.1 }, { x: 27, z: -33, kind: 3, s: 1.1 },
    { x: 76, z: -22, kind: 1, s: 1.2 }, { x: 55, z: -22, kind: 0, s: 1.15 },
  ];
  for (const t of inner) trees.push({ ...t, rot: R() * 6.28, inner: true });

  const forest = [];
  const ring = (x, z) => {
    if (inRect(BOUNDS, x, z, 1.5) && !inRect(FOREST_BLOCK, x, z, -1.5)) return;
    if (z > 30 && Math.abs(x) < 14) return; // keep the entrance road clear
    forest.push({ x, z, s: 0.9 + R() * 0.9, kind: R() < 0.5 ? 0 : 2, rot: R() * 6.28 });
  };
  for (let i = 0; i < 520; i++) {
    const side = R();
    let x;
    let z;
    if (side < 0.28) { x = BOUNDS.x0 - 2 - R() * 22; z = BOUNDS.z0 - 20 + R() * 80 + R() * 60; }
    else if (side < 0.5) { x = BOUNDS.x1 + 2 + R() * 22; z = -32 + R() * 92; }
    else if (side < 0.72) { x = BOUNDS.x0 - 20 + R() * 150; z = BOUNDS.z0 - 2 - R() * 22; }
    else if (side < 0.86) { x = BOUNDS.x0 - 20 + R() * 150; z = BOUNDS.z1 + 3 + R() * 24; }
    else { x = FOREST_BLOCK.x0 + 1.5 + R() * 45; z = -88 + R() * 57; }
    ring(x, z);
  }
  return { trees, forest };
}
