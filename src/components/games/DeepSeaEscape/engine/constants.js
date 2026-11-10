/**
 * Deep Sea Escape: Abyss Facility — shared constants. The facility is a grid
 * of 2 m cells: walls, floors, hazards and every device snap to a cell (wall
 * devices hang on one face of a cell). Cells can hold water: shallow water
 * you wade through, or deep / fully flooded water you swim in (and where
 * oxygen runs down). Flooded sections are held back at their doorways by
 * hydrostatic containment fields, so you swim straight in from a dry corridor.
 */
export const CELL = 2;
export const WALL_H = 3.8;
export const EYE = 1.62;
export const RADIUS = 0.32;
export const REACH = 2.7;
export const WALK = 3.6;
export const RUN = 6.0;
export const SWIM = 3.0;
export const SWIM_FAST = 4.6;
export const SWIM_V = 2.6;
export const GRAVITY = 15;
export const JUMP_V = 5.2;
export const STEP_UP = 0.3;
/** Water deeper than this is swum, not waded. */
export const SWIM_DEPTH = 1.2;

/** n = −z (map row − 1), s = +z, e = +x, w = −x. */
export const DIRS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
export const DIR_ORDER = ["n", "e", "s", "w"];
export const OPPOSITE = { n: "s", s: "n", e: "w", w: "e" };
/** Camera yaw that looks along each direction (three.js looks down −z at yaw 0). */
export const DIR_YAW = { n: 0, w: Math.PI / 2, s: Math.PI, e: -Math.PI / 2 };
export const DIR_NAMES = { n: "North", e: "East", s: "South", w: "West" };

export const cellCenter = (c, r) => [c * CELL + CELL / 2, r * CELL + CELL / 2];

/** Facility sectors — the renderer reads the palettes, the UI the names. */
export const ZONES = [
  {
    id: 0,
    name: "Entrance Sector",
    wall: [138, 146, 156],
    trim: [214, 160, 40],
    floor: [92, 98, 106],
    panel: "#2a3440",
    light: 0xff5a3a,
    lamp: 0xffd2a8,
    fog: 0x0a1418,
    fogDensity: 0.05,
    ambient: [0xc8dcff, 0x1a1210, 0.42],
    water: 0x1a5a6a,
    accent: "#ff7a4a",
    emergency: true,
  },
  {
    id: 1,
    name: "Flooded Laboratories",
    wall: [176, 192, 196],
    trim: [60, 200, 210],
    floor: [96, 112, 116],
    panel: "#1c3a40",
    light: 0x5ae0ff,
    lamp: 0xc8f4ff,
    fog: 0x06202a,
    fogDensity: 0.055,
    ambient: [0x9ae8ff, 0x08181c, 0.42],
    water: 0x0e6a80,
    accent: "#4ae0f0",
  },
  {
    id: 2,
    name: "Deep Research Wing",
    wall: [214, 220, 226],
    trim: [70, 140, 255],
    floor: [128, 136, 146],
    panel: "#1a2a48",
    light: 0x7ab0ff,
    lamp: 0xeef4ff,
    fog: 0x0a1426,
    fogDensity: 0.042,
    ambient: [0xd8e8ff, 0x101420, 0.5],
    water: 0x1a4a90,
    accent: "#6aa8ff",
  },
  {
    id: 3,
    name: "Containment Chambers",
    wall: [120, 112, 140],
    trim: [180, 90, 255],
    floor: [70, 66, 84],
    panel: "#2a1a40",
    light: 0xc070ff,
    lamp: 0xe8d0ff,
    fog: 0x120a1e,
    fogDensity: 0.05,
    ambient: [0xd0b8ff, 0x0c0814, 0.42],
    water: 0x4a2a8a,
    accent: "#c07aff",
  },
  {
    id: 4,
    name: "Abyss Core",
    wall: [74, 70, 72],
    trim: [255, 120, 40],
    floor: [52, 50, 54],
    panel: "#301a10",
    light: 0xff7a30,
    lamp: 0xffd0a0,
    fog: 0x140a06,
    fogDensity: 0.05,
    ambient: [0xffc8a0, 0x100604, 0.42],
    water: 0x1a3a50,
    accent: "#ff8a3a",
    emergency: true,
  },
];

/* ------------------------------------------------------------------ weapons */
/**
 * dmg per shot · rate = seconds between shots · mag · reload seconds · spread
 * (radians, hip) · recoil · ammo pool (null = unlimited reserve) · auto = hold
 * to fire · head = critical multiplier · water = damage multiplier when the
 * shooter is underwater · splash radius · pierce · stagger seconds · shock =
 * bonus against drones · speed = visual projectile speed (m/s).
 */
export const WEAPONS = {
  pistol: {
    slot: 1,
    name: "Security Pistol",
    desc: "Standard facility sidearm with unlimited reserve magazines. Accurate; aimed head shots deal heavy damage. Weak underwater.",
    dmg: 24,
    rate: 0.24,
    mag: 12,
    reload: 1.1,
    spread: 0.012,
    recoil: 0.025,
    ammo: null,
    auto: false,
    head: 2,
    aimHead: 2.6,
    water: 0.6,
    range: 55,
    speed: 90,
  },
  harpoon: {
    slot: 2,
    name: "Harpoon Launcher",
    desc: "Fires heavy barbed harpoons that stagger whatever they hit. Built for the deep: deals extra damage underwater.",
    dmg: 85,
    rate: 0.7,
    mag: 3,
    reload: 1.7,
    spread: 0.006,
    recoil: 0.05,
    ammo: "bolts",
    auto: false,
    head: 1.5,
    water: 1.6,
    stagger: 0.45,
    range: 45,
    speed: 42,
  },
  pulse: {
    slot: 3,
    name: "Pulse Rifle",
    desc: "Fully automatic energy rifle. Its pulses overload drones and charge energy conduits. Hold to fire.",
    dmg: 13,
    rate: 0.09,
    mag: 36,
    reload: 1.8,
    spread: 0.028,
    recoil: 0.01,
    ammo: "cells",
    auto: true,
    head: 1.4,
    water: 0.6,
    shock: 1.8,
    range: 50,
    speed: 120,
  },
  cannon: {
    slot: 4,
    name: "Abyss Cannon",
    desc: "Experimental weapon powered by abyssal energy. Its beam pierces every enemy and armor, bursts on impact, wakes abyss conduits and recharges itself when almost empty.",
    dmg: 140,
    rate: 0.95,
    mag: 4,
    reload: 2.4,
    spread: 0.004,
    recoil: 0.06,
    ammo: "abyss",
    auto: false,
    head: 1.2,
    water: 1,
    splash: 2.8,
    pierce: true,
    range: 60,
    speed: 70,
  },
};
export const WEAPON_ORDER = ["pistol", "harpoon", "pulse", "cannon"];
/** The level that hands out each weapon; every later level starts with it. */
export const WEAPON_LEVEL = { pistol: 1, harpoon: 6, pulse: 10, cannon: 18 };
export const AMMO_MAX = { bolts: 36, cells: 240, abyss: 24 };
export const AMMO_PICK = { bolts: 6, cells: 45, abyss: 4 };

/** "Shock Pulse" — the suit ability unlocked from level 7 (F): an electric burst around the diver. */
export const ABILITY = { level: 7, radius: 6, dmg: 80, cooldown: 20, stun: 1.8 };

/* ------------------------------------------------------------------ oxygen */
export const BASE_O2 = 40;
/** O2 seconds lost per second underwater; regained per second breathing air. */
export const O2_DRAIN = 1;
export const O2_REGEN = 14;
export const O2_LOW = 0.3;

/* ------------------------------------------------------------------ enemies */
/**
 * hp · speed m/s · dmg per hit · reach m · cooldown s · sight m · armor
 * (fraction of non-piercing damage blocked) · xp · size (half width, height) ·
 * move: land (avoids deep water) · swim (deep water only) · amph (both) · air
 * (hovers anywhere) · ranged = spits / fires bolts · electric = Pulse Rifle bonus.
 */
export const ENEMIES = {
  crawler: { name: "Mutated Sea Crawler", hp: 60, speed: 3.8, dmg: 9, reach: 1.35, cd: 0.85, sight: 16, armor: 0, xp: 10, half: 0.42, h: 0.85, move: "amph" },
  researcher: { name: "Infected Researcher", hp: 85, speed: 2.3, dmg: 12, reach: 1.5, cd: 1.15, sight: 16, armor: 0, xp: 12, half: 0.35, h: 1.85, move: "land" },
  eel: { name: "Abyss Eel", hp: 55, speed: 4.6, dmg: 10, reach: 1.4, cd: 0.8, sight: 18, armor: 0, xp: 14, half: 0.38, h: 0.6, move: "swim" },
  drone: { name: "Security Drone", hp: 70, speed: 3.0, dmg: 6, reach: 1.2, cd: 1.0, sight: 20, armor: 0.1, xp: 16, half: 0.38, h: 0.6, move: "air", electric: true, ranged: { range: 15, speed: 18, keep: 7 } },
  spitter: { name: "Bloated Spitter", hp: 110, speed: 1.9, dmg: 12, reach: 1.5, cd: 1.6, sight: 20, armor: 0, xp: 20, half: 0.45, h: 1.7, move: "land", ranged: { range: 14, speed: 12, keep: 6 } },
  brute: { name: "Armored Mutant", hp: 240, speed: 2.0, dmg: 20, reach: 1.8, cd: 1.35, sight: 18, armor: 0.45, xp: 30, half: 0.5, h: 2.2, move: "land", charge: true },
  stalker: { name: "Deep Stalker", hp: 300, speed: 2.6, dmg: 22, reach: 2.0, cd: 1.3, sight: 22, armor: 0.25, xp: 45, half: 0.6, h: 2.3, move: "amph", ranged: { range: 16, speed: 13, keep: 0 } },
  matriarch: { name: "Brood Matriarch", hp: 1000, speed: 2.4, dmg: 24, reach: 2.4, cd: 1.5, sight: 30, armor: 0.2, xp: 200, half: 1.0, h: 2.2, boss: true, charge: true, summon: "crawler", move: "land" },
  warden: { name: "Warden Unit Mk-IV", hp: 1200, speed: 2.2, dmg: 18, reach: 2.0, cd: 1.4, sight: 34, armor: 0.3, xp: 260, half: 0.9, h: 1.4, boss: true, summon: "drone", move: "air", electric: true, ranged: { range: 20, speed: 16, keep: 6, volley: 3 } },
  specimen: { name: "Specimen Zero", hp: 1800, speed: 2.3, dmg: 30, reach: 2.6, cd: 1.4, sight: 40, armor: 0.25, xp: 380, half: 1.0, h: 3.2, boss: true, charge: true, summon: "crawler", move: "land", ranged: { range: 20, speed: 13, keep: 0, volley: 3 } },
  leviathan: { name: "The Abyss Leviathan", hp: 2800, speed: 2.2, dmg: 32, reach: 2.8, cd: 1.3, sight: 50, armor: 0.2, xp: 600, half: 1.0, h: 3.4, boss: true, charge: true, summon: "crawler", move: "land", ranged: { range: 22, speed: 14, keep: 0, volley: 5 } },
};

/* ------------------------------------------------------------------ RPG */
export const UPGRADES = {
  vitality: { name: "Vitality", desc: "+20 maximum health per rank.", max: 5 },
  armor: { name: "Suit Plating", desc: "+20 maximum armor per rank.", max: 5 },
  lungs: { name: "Oxygen Capacity", desc: "+10 seconds of oxygen per rank.", max: 5 },
  power: { name: "Weapon Power", desc: "+10% damage with every weapon per rank.", max: 5 },
  agility: { name: "Mobility", desc: "+6% movement and swim speed, +8% fire and reload speed per rank.", max: 5 },
};
export const UPGRADE_ORDER = ["vitality", "armor", "lungs", "power", "agility"];
/** Weapon modifications: each rank adds +15% damage, +25% magazine and −10% reload time to that weapon. */
export const MODS = {
  pistol: { max: 3 },
  harpoon: { max: 3 },
  pulse: { max: 3 },
  cannon: { max: 3 },
};
export const MOD_DESC = "+15% damage, +25% magazine size and −10% reload time per rank.";
export const BASE_HP = 100;
export const BASE_ARMOR = 50;

/**
 * Research artifacts — one hidden in each of eight levels. Collecting one is
 * permanent and grants a passive bonus (stacked into the player's stats).
 */
export const RELICS = {
  pearl: { name: "Luminous Pearl", desc: "+15 maximum health.", icon: "pearl", color: "#bff6ff" },
  crystal: { name: "Pressure Crystal", desc: "+15 maximum armor.", icon: "crystal", color: "#6ab0ff" },
  coralLung: { name: "Coral Lung", desc: "+15 seconds of oxygen.", icon: "coral", color: "#ff7a8a" },
  lens: { name: "Abyssal Lens", desc: "+6% weapon damage.", icon: "lens", color: "#7affd0" },
  weave: { name: "Kelp Fiber Weave", desc: "+5% movement and swim speed.", icon: "weave", color: "#8ae070" },
  medkitProto: { name: "Medical Prototype", desc: "Start every level with one extra medkit.", icon: "med", color: "#ff5a6a" },
  neuralChip: { name: "Neural Chip", desc: "+8% fire and reload speed.", icon: "chip", color: "#c08aff" },
  scale: { name: "Leviathan Scale", desc: "+6% weapon damage and −15% Shock Pulse cooldown.", icon: "scale", color: "#ffb04a" },
};
export const RELIC_ORDER = ["pearl", "crystal", "coralLung", "lens", "weave", "medkitProto", "neuralChip", "scale"];

/** XP needed to go from rank n to n+1. */
export const xpForRank = (n) => 120 + (n - 1) * 70;
export const XP = { puzzle: 20, note: 5, secret: 30, relic: 40, complete: 60, perLevel: 7 };

/** Player stats for a set of upgrade ranks, weapon mods and collected artifacts. */
export function statsFor(up = {}, relics = [], mods = {}) {
  const v = up.vitality || 0,
    a = up.armor || 0,
    l = up.lungs || 0,
    p = up.power || 0,
    g = up.agility || 0;
  const has = (k) => relics.includes(k);
  const speed = 1 + g * 0.06 + (has("weave") ? 0.05 : 0);
  const haste = 1 + g * 0.08 + (has("neuralChip") ? 0.08 : 0);
  const mod = {};
  for (const w of Object.keys(MODS)) {
    const r = Math.max(0, Math.min(MODS[w].max, mods[w] || 0));
    mod[w] = { dmg: 1 + r * 0.15, mag: 1 + r * 0.25, reload: 1 - r * 0.1 };
  }
  return {
    maxHp: BASE_HP + v * 20 + (has("pearl") ? 15 : 0),
    maxArmor: BASE_ARMOR + a * 20 + (has("crystal") ? 15 : 0),
    maxO2: BASE_O2 + l * 10 + (has("coralLung") ? 15 : 0),
    dmgMul: 1 + p * 0.1 + (has("lens") ? 0.06 : 0) + (has("scale") ? 0.06 : 0),
    speedMul: speed,
    rateMul: 1 / haste,
    reloadMul: 1 / haste,
    abilityMul: 1,
    abilityCd: ABILITY.cooldown * (has("scale") ? 0.85 : 1),
    extraElixir: has("medkitProto") ? 1 : 0,
    mod,
  };
}
