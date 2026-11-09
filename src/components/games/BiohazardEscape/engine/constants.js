/**
 * Biohazard Escape: Project X — shared constants. The facility is a grid of
 * 2 m cells: walls, floors, hazards and every device snap to a cell (wall
 * devices hang on one face of a cell). Floors can be raised (crates, low
 * barriers) so the player can jump onto them while enemies walk around.
 */
export const CELL = 2;
export const WALL_H = 3.4;
export const EYE = 1.62;
export const RADIUS = 0.32;
export const REACH = 2.7;
export const WALK = 3.6;
export const RUN = 6.0;
export const GRAVITY = 15;
export const JUMP_V = 5.2;
export const STEP_UP = 0.3;

/** n = −z (map row − 1), s = +z, e = +x, w = −x. */
export const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const DIR_ORDER = ["n", "e", "s", "w"];
export const OPPOSITE = { n: "s", s: "n", e: "w", w: "e" };
/** Camera yaw that looks along each direction (three.js looks down −z at yaw 0). */
export const DIR_YAW = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 };

export const cellCenter = (c, r) => [c * CELL + CELL / 2, r * CELL + CELL / 2];

/** Facility sectors — the renderer reads the palettes, the UI the names. */
export const ZONES = [
  {
    id: 0,
    name: "Quarantine Sector",
    wall: [178, 188, 190],
    trim: [60, 160, 150],
    floor: [96, 104, 106],
    fog: 0x0b1213,
    fogDensity: 0.05,
    ambient: [0xbfe6ff, 0x1a1414, 0.42],
    lamp: 0xd8f4ff,
    alarm: 0xff2a1a,
    accent: "#43e0c8",
  },
  {
    id: 1,
    name: "Research Laboratories",
    wall: [196, 204, 214],
    trim: [70, 120, 220],
    floor: [110, 116, 126],
    fog: 0x0a0f1a,
    fogDensity: 0.045,
    ambient: [0xcfe0ff, 0x101420, 0.45],
    lamp: 0xe6f0ff,
    alarm: 0xff3020,
    accent: "#5aa0ff",
  },
  {
    id: 2,
    name: "Medical Wing",
    wall: [176, 196, 176],
    trim: [150, 60, 60],
    floor: [92, 108, 96],
    fog: 0x0c140c,
    fogDensity: 0.055,
    ambient: [0xd8ffd8, 0x140e0e, 0.38],
    lamp: 0xe8ffe4,
    alarm: 0xff2a2a,
    accent: "#7fe36a",
  },
  {
    id: 3,
    name: "Containment Sectors",
    wall: [120, 112, 136],
    trim: [170, 80, 220],
    floor: [70, 66, 80],
    fog: 0x0e0814,
    fogDensity: 0.06,
    ambient: [0xe0c8ff, 0x0c0610, 0.36],
    lamp: 0xf0e0ff,
    alarm: 0xff2a60,
    accent: "#c07cff",
  },
  {
    id: 4,
    name: "Central Research Core",
    wall: [92, 92, 98],
    trim: [240, 140, 40],
    floor: [56, 56, 62],
    fog: 0x120a06,
    fogDensity: 0.05,
    ambient: [0xffe0c0, 0x100806, 0.38],
    lamp: 0xfff0dc,
    alarm: 0xff4010,
    accent: "#ff9a3c",
  },
];

/* ------------------------------------------------------------------ weapons */
/**
 * dmg per pellet · rate = seconds between shots · mag · reload seconds ·
 * spread (radians, hip) · recoil (pitch kick) · ammo pool (null = infinite
 * reserve) · auto = hold to fire · pellets · pierce = passes through enemies
 * and ignores armour.
 */
export const WEAPONS = {
  pistol: {
    slot: 1,
    name: "Pistol",
    desc: "Standard-issue sidearm. Reliable, accurate, endless spare magazines.",
    dmg: 21,
    rate: 0.24,
    mag: 12,
    reload: 1.15,
    spread: 0.012,
    recoil: 0.022,
    ammo: null,
    auto: false,
    pellets: 1,
    range: 60,
  },
  rifle: {
    slot: 2,
    name: "Assault Rifle",
    desc: "Fully automatic security rifle. Hold to fire — keep bursts short.",
    dmg: 15,
    rate: 0.095,
    mag: 30,
    reload: 1.9,
    spread: 0.028,
    recoil: 0.012,
    ammo: "rifle",
    auto: true,
    pellets: 1,
    range: 60,
  },
  shotgun: {
    slot: 3,
    name: "Combat Shotgun",
    desc: "Eight pellets per shell. Devastating up close, weak at range.",
    dmg: 13,
    rate: 0.8,
    mag: 6,
    reload: 2.1,
    spread: 0.085,
    recoil: 0.06,
    ammo: "shells",
    auto: false,
    pellets: 8,
    range: 22,
  },
  ion: {
    slot: 4,
    name: "Ion Lance",
    desc: "Experimental energy weapon. Pierces every target, ignores armour, powers ion nodes and slowly recharges itself when almost empty.",
    dmg: 75,
    rate: 0.5,
    mag: 8,
    reload: 2.3,
    spread: 0.004,
    recoil: 0.035,
    ammo: "cells",
    auto: false,
    pellets: 1,
    pierce: true,
    range: 70,
  },
};
export const WEAPON_ORDER = ["pistol", "rifle", "shotgun", "ion"];
/** The level that hands out each weapon; every later level starts with it. */
export const WEAPON_LEVEL = { pistol: 1, rifle: 7, shotgun: 12, ion: 17 };
export const AMMO_MAX = { rifle: 240, shells: 48, cells: 48 };
export const AMMO_PICK = { rifle: 45, shells: 8, cells: 8 };

/* ------------------------------------------------------------------ enemies */
/**
 * hp · speed m/s · dmg per hit · reach m · cooldown s · sight m · armor
 * (fraction of non-ion damage blocked) · xp · size (half width, height) ·
 * ranged = spits acid globs.
 */
export const ENEMIES = {
  worker: { name: "Infected Worker", hp: 80, speed: 2.25, dmg: 11, reach: 1.5, cd: 1.15, sight: 16, armor: 0, xp: 10, half: 0.35, h: 1.8 },
  runner: { name: "Skitterer", hp: 50, speed: 5.2, dmg: 9, reach: 1.35, cd: 0.75, sight: 20, armor: 0, xp: 14, half: 0.32, h: 1.3 },
  guard: { name: "Armored Guard", hp: 190, speed: 1.95, dmg: 18, reach: 1.6, cd: 1.3, sight: 18, armor: 0.45, xp: 26, half: 0.42, h: 1.95 },
  spitter: { name: "Bloater", hp: 95, speed: 1.9, dmg: 13, reach: 1.4, cd: 1.8, sight: 20, armor: 0, xp: 22, half: 0.45, h: 1.75, ranged: { range: 13, speed: 11, keep: 6 } },
  brute: { name: "Subject 09", hp: 700, speed: 2.5, dmg: 26, reach: 2.2, cd: 1.6, sight: 30, armor: 0.2, xp: 160, half: 0.8, h: 2.7, boss: true, charge: true },
  surgeon: { name: "The Surgeon", hp: 1500, speed: 2.7, dmg: 24, reach: 2.4, cd: 1.3, sight: 40, armor: 0.25, xp: 300, half: 0.85, h: 3.0, boss: true, charge: true, ranged: { range: 18, speed: 13, keep: 0, volley: 3 } },
  hive: { name: "Hive Mother", hp: 2100, speed: 1.2, dmg: 30, reach: 2.8, cd: 1.5, sight: 40, armor: 0, xp: 400, half: 1.2, h: 3.0, boss: true, summon: "runner", ranged: { range: 20, speed: 12, keep: 0, volley: 5 } },
  projectx: { name: "Project X", hp: 3200, speed: 2.4, dmg: 34, reach: 2.6, cd: 1.3, sight: 50, armor: 0.15, xp: 600, half: 1.0, h: 3.2, boss: true, charge: true, summon: "runner", ranged: { range: 22, speed: 14, keep: 0, volley: 5 } },
};

/* ------------------------------------------------------------------ RPG */
export const UPGRADES = {
  vitality: { name: "Vitality", desc: "+20 maximum health per rank.", max: 5 },
  armor: { name: "Body Armor", desc: "+20 maximum armor per rank.", max: 5 },
  firepower: { name: "Firepower", desc: "+10% weapon damage per rank.", max: 5 },
  reflexes: { name: "Reflexes", desc: "+6% movement speed and +10% reload speed per rank.", max: 5 },
};
export const UPGRADE_ORDER = ["vitality", "armor", "firepower", "reflexes"];
export const BASE_HP = 100;
export const BASE_ARMOR = 50;

/** XP needed to go from rank n to n+1. */
export const xpForRank = (n) => 120 + (n - 1) * 70;
export const XP = { puzzle: 20, note: 5, secret: 30, complete: 60, perLevel: 6 };

/** Player stats for a set of upgrade ranks. */
export function statsFor(up = {}) {
  const v = up.vitality || 0,
    a = up.armor || 0,
    f = up.firepower || 0,
    r = up.reflexes || 0;
  return { maxHp: BASE_HP + v * 20, maxArmor: BASE_ARMOR + a * 20, dmgMul: 1 + f * 0.1, speedMul: 1 + r * 0.06, reloadMul: 1 / (1 + r * 0.1) };
}
