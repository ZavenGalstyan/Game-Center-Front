/**
 * Pirate Cove — ship classes. Three player ships and the enemy hulls built
 * on the same classes. Every number a ship needs lives here; the engine
 * (engine/ship.js, engine/cannons.js) and the models (three/ShipModel.jsx)
 * read the same entry.
 *
 *  length/beam   metres (collision capsule + model proportions)
 *  maxSpeed      m/s at full sail (≈ knots × 0.51)
 *  accel         m/s² while gathering way
 *  turnRate      rad/s at good steerage way
 *  hull          hit points
 *  perSide       cannons per broadside
 *  reload        seconds per side
 *  damage        per cannonball
 *  muzzle        cannonball muzzle speed (sets range)
 */

export const SHIP_CLASSES = {
  sloop: {
    id: "sloop",
    name: "Sloop",
    blurb: "Fast and nimble. Light hull, three guns a side.",
    length: 13,
    beam: 4.2,
    masts: 1,
    maxSpeed: 15.5,
    accel: 3.3,
    turnRate: 0.62,
    hull: 100,
    perSide: 3,
    reload: 2.6,
    damage: 9,
    muzzle: 64,
    deckY: 1.35,
  },
  brig: {
    id: "brig",
    name: "Brig",
    blurb: "Balanced two-master. Sturdier hull, a heavier broadside.",
    length: 18,
    beam: 5.4,
    masts: 2,
    maxSpeed: 13.2,
    accel: 2.6,
    turnRate: 0.47,
    hull: 170,
    perSide: 5,
    reload: 2.9,
    damage: 10,
    muzzle: 68,
    deckY: 1.65,
  },
  galleon: {
    id: "galleon",
    name: "Galleon",
    blurb: "Slow and massive. Huge hull, a thundering seven-gun broadside.",
    length: 25,
    beam: 7.2,
    masts: 3,
    maxSpeed: 11,
    accel: 1.9,
    turnRate: 0.36,
    hull: 290,
    perSide: 7,
    reload: 3.3,
    damage: 12,
    muzzle: 72,
    deckY: 2.0,
  },
};

export const PLAYER_SHIPS = ["sloop", "brig", "galleon"];

/** Ships unlock by finishing a story adventure (the deed is the reward). */
export const SHIP_UNLOCK = {
  sloop: null,
  brig: { adventure: 8, text: "Complete Adventure 8 — Serpent Cave" },
  galleon: { adventure: 15, text: "Complete Adventure 15 — Idol of the Mist" },
};

export const UPGRADE_KEYS = ["hull", "speed", "cannons"];
export const MAX_UPGRADE = 4;
const BASE_COST = [140, 280, 520, 860];
const CLASS_COST = { sloop: 1, brig: 1.45, galleon: 1.95 };

export function upgradeCost(shipId, level) {
  if (level >= MAX_UPGRADE) return null;
  return Math.round((BASE_COST[level] * CLASS_COST[shipId]) / 10) * 10;
}

export const UPGRADE_INFO = {
  hull: { label: "Hull", text: "+12% hull per level" },
  speed: { label: "Speed", text: "+5% speed, +4% turning per level" },
  cannons: { label: "Cannons", text: "+10% damage, −5% reload per level" },
};

/** Final player-ship stats for a class + upgrade levels. */
export function playerShipStats(shipId, up = {}) {
  const c = SHIP_CLASSES[shipId] || SHIP_CLASSES.sloop;
  const h = up.hull || 0;
  const s = up.speed || 0;
  const k = up.cannons || 0;
  return {
    ...c,
    hull: Math.round(c.hull * (1 + 0.12 * h)),
    maxSpeed: c.maxSpeed * (1 + 0.05 * s),
    accel: c.accel * (1 + 0.05 * s),
    turnRate: c.turnRate * (1 + 0.04 * s),
    damage: c.damage * (1 + 0.1 * k),
    reload: c.reload * (1 - 0.05 * k),
  };
}

/** For the Ships screen bars: 0..1 values comparable across classes. */
export function statBars(stats) {
  return {
    hull: Math.min(1, stats.hull / 420),
    speed: Math.min(1, stats.maxSpeed / 17.5),
    cannons: Math.min(1, (stats.perSide * stats.damage) / stats.reload / 36),
  };
}

/**
 * Enemy captains. `cls` picks the hull; the multipliers scale it. Region
 * scaling is applied on top by the adventure (engine/world.js).
 *   aim     0..1 — how well they lead a moving target (never perfect)
 *   chaser  boss bow cannon: fires straight ahead on its own reload
 */
export const ENEMY_TYPES = {
  pirateSloop: {
    cls: "sloop",
    name: "Pirate Sloop",
    hull: 0.7,
    damage: 0.66,
    reload: 1.3,
    speed: 0.86,
    turn: 0.9,
    aim: 0.45,
    sail: "#2b2420",
    flag: "skull",
    hullColor: "#4a2f1f",
    accent: "#8e2b22",
    gold: 60,
  },
  pirateBrig: {
    cls: "brig",
    name: "Pirate Brig",
    hull: 0.82,
    damage: 0.75,
    reload: 1.25,
    speed: 0.88,
    turn: 0.9,
    aim: 0.55,
    sail: "#7c2a24",
    flag: "skull",
    hullColor: "#3a2a22",
    accent: "#c99a3c",
    gold: 120,
  },
  heavyGalleon: {
    cls: "galleon",
    name: "Heavy Galleon",
    hull: 0.9,
    damage: 0.8,
    reload: 1.2,
    speed: 0.9,
    turn: 0.92,
    aim: 0.6,
    sail: "#3b3a44",
    flag: "skull",
    hullColor: "#2a2420",
    accent: "#9a7a3a",
    gold: 220,
  },
  cursedBrig: {
    cls: "brig",
    name: "Cursed Brig",
    hull: 0.85,
    damage: 0.8,
    reload: 1.2,
    speed: 0.92,
    turn: 0.95,
    aim: 0.55,
    sail: "#5a6b5e",
    tattered: true,
    flag: "bones",
    hullColor: "#2c3330",
    accent: "#4fbf8a",
    gold: 140,
    cursed: true,
  },
  // ---- bosses
  ironGull: {
    cls: "brig",
    name: "The Iron Gull",
    boss: true,
    hull: 1.9,
    damage: 0.85,
    reload: 1.05,
    speed: 0.9,
    turn: 0.85,
    aim: 0.6,
    sail: "#d8d2c4",
    flag: "gull",
    hullColor: "#3b3f45",
    accent: "#c0c6cc",
    gold: 400,
    chaser: { reload: 5.5, damage: 12 },
  },
  redbeard: {
    cls: "brig",
    name: "Redbeard's Brig",
    boss: true,
    hull: 1.25,
    damage: 0.72,
    reload: 1.25,
    speed: 0.85,
    turn: 0.85,
    aim: 0.5,
    sail: "#a0322a",
    flag: "skull",
    hullColor: "#4a2a1c",
    accent: "#e0b050",
    gold: 260,
  },
  paleWidow: {
    cls: "brig",
    name: "The Pale Widow",
    boss: true,
    hull: 2.1,
    damage: 0.9,
    reload: 1.05,
    speed: 0.95,
    turn: 0.95,
    aim: 0.62,
    sail: "#cfd8d6",
    tattered: true,
    flag: "bones",
    hullColor: "#2f3634",
    accent: "#7fe0c0",
    gold: 520,
    cursed: true,
    chaser: { reload: 5, damage: 13 },
  },
  stormKing: {
    cls: "galleon",
    name: "The Storm King",
    boss: true,
    hull: 1.75,
    damage: 0.88,
    reload: 1.05,
    speed: 0.9,
    turn: 0.9,
    aim: 0.65,
    sail: "#2f3f5a",
    flag: "bolt",
    hullColor: "#23262c",
    accent: "#e0c050",
    gold: 700,
    chaser: { reload: 4.5, damage: 15 },
  },
  blackCrown: {
    cls: "galleon",
    name: "The Black Crown",
    boss: true,
    hull: 2.3,
    damage: 0.95,
    reload: 0.98,
    speed: 0.92,
    turn: 0.95,
    aim: 0.68,
    sail: "#141416",
    flag: "crown",
    hullColor: "#151314",
    accent: "#d4af37",
    gold: 1200,
    chaser: { reload: 4, damage: 16 },
  },
};

export const PLAYER_LOOK = { sail: "#f3ecdc", flag: "skull", hullColor: "#6b4428", accent: "#2f6f8f" };

/** Light cosmetics (Ships screen). */
export const SAIL_COLORS = [
  { id: "canvas", name: "Canvas", color: "#f3ecdc" },
  { id: "crimson", name: "Crimson", color: "#a8352b" },
  { id: "midnight", name: "Midnight", color: "#2a3346" },
  { id: "gold", name: "Sunflower", color: "#e2b54a" },
];
export const ACCENT_COLORS = [
  { id: "sea", name: "Sea Blue", color: "#2f6f8f" },
  { id: "red", name: "Red", color: "#9a2f25" },
  { id: "green", name: "Jade", color: "#2f7a55" },
  { id: "gold", name: "Gold", color: "#c99a3c" },
];
