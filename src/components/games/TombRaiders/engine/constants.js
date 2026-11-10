/**
 * Tomb Raiders: Pharaoh's Revenge — shared constants. The tomb is a grid of
 * 2 m cells: walls, floors, traps and every mechanism snap to a cell (wall
 * mechanisms hang on one face of a cell). Floors can be raised (rubble, low
 * ledges, altars) so the player can jump onto them while guardians walk around.
 */
export const CELL = 2;
export const WALL_H = 3.8;
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
export const DIR_NAMES = { n: "North", e: "East", s: "South", w: "West" };

export const cellCenter = (c, r) => [c * CELL + CELL / 2, r * CELL + CELL / 2];

/** Tomb regions — the renderer reads the palettes, the UI the names. */
export const ZONES = [
  {
    id: 0,
    name: "Tomb Entrance",
    stone: [200, 162, 110],
    floor: [168, 132, 88],
    paint: null,
    ceiling: "beams",
    fog: 0x1e140a,
    fogDensity: 0.045,
    torch: 0xffa040,
    ambient: [0xffd9a0, 0x2a1a0c, 0.5],
    rune: 0xffb050,
    accent: "#e8b45a",
  },
  {
    id: 1,
    name: "Burial Chambers",
    stone: [150, 132, 112],
    floor: [112, 98, 82],
    paint: ["#2f8a6e", "#a8322a", "#d9a52b"],
    ceiling: "rock",
    fog: 0x0a0d0c,
    fogDensity: 0.06,
    torch: 0x7affb0,
    ambient: [0xa8e0c8, 0x0a0806, 0.36],
    rune: 0x5affb0,
    accent: "#5fe0a8",
  },
  {
    id: 2,
    name: "Sun Temples",
    stone: [226, 182, 116],
    floor: [194, 152, 98],
    paint: ["#b8862a", "#c0402a", "#1f5e9e"],
    ceiling: "open",
    fog: 0x2a1c0c,
    fogDensity: 0.035,
    torch: 0xffc070,
    ambient: [0xfff0c8, 0x3a2410, 0.52],
    rune: 0xffd070,
    accent: "#ffcf5a",
  },
  {
    id: 3,
    name: "Royal Vaults",
    stone: [196, 178, 150],
    floor: [128, 108, 84],
    paint: ["#1f5e9e", "#2f8a6e", "#a8322a", "#d9a52b"],
    ceiling: "stars",
    fog: 0x0e1420,
    fogDensity: 0.045,
    torch: 0xffb060,
    ambient: [0xcfe0ff, 0x1c1610, 0.46],
    rune: 0x60a8ff,
    accent: "#5aa7e8",
  },
  {
    id: 4,
    name: "Pharaoh's Inner Sanctum",
    stone: [70, 54, 46],
    floor: [56, 44, 38],
    paint: ["#e0b040", "#c0402a", "#2a6ab0"],
    ceiling: "stars",
    fog: 0x140806,
    fogDensity: 0.05,
    torch: 0xff8a40,
    ambient: [0xffc08a, 0x120604, 0.42],
    rune: 0xff6a3a,
    accent: "#ff9a4a",
  },
];

/* ------------------------------------------------------------------ weapons */
/**
 * dmg per bolt · rate = seconds between shots · mag = charges before a
 * recharge · reload seconds · spread (radians, hip) · recoil (pitch kick) ·
 * ammo pool (null = endless) · auto = hold to fire · splash radius ·
 * pierce = passes through enemies and ignores stone armour · head = critical
 * multiplier · speed = visual bolt speed (m/s).
 */
export const WEAPONS = {
  bow: {
    slot: 1,
    name: "Ancient Bow",
    desc: "A hunter's bow of acacia and horn. Precise and silent, with an endless quiver. Aimed shots to the head deal triple damage.",
    dmg: 30,
    rate: 0.5,
    mag: 6,
    reload: 1.0,
    spread: 0.01,
    recoil: 0.02,
    ammo: null,
    auto: false,
    head: 2.2,
    aimHead: 3,
    range: 60,
    speed: 70,
  },
  scarab: {
    slot: 2,
    name: "Scarab Blaster",
    desc: "A golden scarab gauntlet that spits streams of magical bolts. Hold to fire.",
    dmg: 12,
    rate: 0.1,
    mag: 30,
    reload: 1.6,
    spread: 0.03,
    recoil: 0.01,
    ammo: "scarab",
    auto: true,
    head: 1.5,
    range: 50,
    speed: 55,
  },
  sun: {
    slot: 3,
    name: "Sun Staff",
    desc: "Channels captured sunlight into blazing orbs that burst on impact, scorching everything nearby. Ignites sun crystals.",
    dmg: 70,
    rate: 0.8,
    mag: 5,
    reload: 2.0,
    spread: 0.008,
    recoil: 0.05,
    ammo: "sun",
    auto: false,
    head: 1.2,
    splash: 2.6,
    range: 55,
    speed: 32,
  },
  scepter: {
    slot: 4,
    name: "Pharaoh's Scepter",
    desc: "The legendary royal scepter. Its soul beam pierces every foe, ignores stone armor, awakens ankh crystals and slowly recharges itself when almost empty.",
    dmg: 95,
    rate: 0.5,
    mag: 8,
    reload: 2.2,
    spread: 0.004,
    recoil: 0.035,
    ammo: "soul",
    auto: false,
    head: 1.3,
    pierce: true,
    range: 70,
    speed: 90,
  },
};
export const WEAPON_ORDER = ["bow", "scarab", "sun", "scepter"];
/** The level that hands out each weapon; every later level starts with it. */
export const WEAPON_LEVEL = { bow: 1, scarab: 7, sun: 16, scepter: 21 };
export const AMMO_MAX = { scarab: 240, sun: 30, soul: 48 };
export const AMMO_PICK = { scarab: 45, sun: 6, soul: 8 };

/** "Wrath of Ra" — the ability unlocked after level 8 (F): a burst of sunfire around the player. */
export const ABILITY = { level: 9, radius: 6, dmg: 90, cooldown: 22, stun: 1.6 };

/* ------------------------------------------------------------------ enemies */
/**
 * hp · speed m/s · dmg per hit · reach m · cooldown s · sight m · armor
 * (fraction of non-scepter damage blocked) · xp · size (half width, height) ·
 * ranged = hurls cursed fire.
 */
export const ENEMIES = {
  skeleton: { name: "Cursed Skeleton Guard", hp: 75, speed: 2.3, dmg: 11, reach: 1.5, cd: 1.15, sight: 16, armor: 0, xp: 10, half: 0.35, h: 1.85 },
  swarm: { name: "Scarab Swarm", hp: 45, speed: 5.0, dmg: 8, reach: 1.3, cd: 0.7, sight: 18, armor: 0, xp: 12, half: 0.4, h: 0.9 },
  stone: { name: "Stone Guardian", hp: 200, speed: 1.8, dmg: 18, reach: 1.7, cd: 1.35, sight: 18, armor: 0.45, xp: 26, half: 0.45, h: 2.1 },
  royal: { name: "Royal Warrior", hp: 110, speed: 2.1, dmg: 13, reach: 1.6, cd: 1.6, sight: 20, armor: 0.1, xp: 22, half: 0.38, h: 1.95, ranged: { range: 14, speed: 12, keep: 6 } },
  elite: { name: "Pharaoh's Elite", hp: 260, speed: 2.4, dmg: 20, reach: 1.8, cd: 1.2, sight: 22, armor: 0.3, xp: 40, half: 0.42, h: 2.15, ranged: { range: 16, speed: 14, keep: 0 } },
  anubis: { name: "Sentinel of Anubis", hp: 900, speed: 2.5, dmg: 24, reach: 2.2, cd: 1.5, sight: 30, armor: 0.2, xp: 180, half: 0.8, h: 3.0, boss: true, charge: true },
  colossus: { name: "Stone Colossus", hp: 1400, speed: 1.9, dmg: 30, reach: 2.6, cd: 1.6, sight: 34, armor: 0.4, xp: 260, half: 1.0, h: 3.4, boss: true, charge: true, ranged: { range: 18, speed: 12, keep: 0, volley: 3 } },
  queen: { name: "Scarab Queen", hp: 1900, speed: 1.6, dmg: 28, reach: 2.6, cd: 1.5, sight: 40, armor: 0.1, xp: 360, half: 1.1, h: 2.4, boss: true, summon: "swarm", ranged: { range: 20, speed: 12, keep: 0, volley: 5 } },
  pharaoh: { name: "The Undying Pharaoh", hp: 3000, speed: 2.4, dmg: 32, reach: 2.6, cd: 1.3, sight: 50, armor: 0.15, xp: 600, half: 0.9, h: 3.3, boss: true, charge: true, summon: "skeleton", ranged: { range: 22, speed: 14, keep: 0, volley: 5 } },
};

/* ------------------------------------------------------------------ RPG */
export const UPGRADES = {
  vitality: { name: "Vitality", desc: "+20 maximum health per rank.", max: 5 },
  armor: { name: "Warding", desc: "+20 maximum armor per rank.", max: 5 },
  power: { name: "Power", desc: "+10% weapon damage per rank.", max: 5 },
  agility: { name: "Agility", desc: "+6% movement speed and +8% attack and recharge speed per rank.", max: 5 },
  mysticism: { name: "Mysticism", desc: "Wrath of Ra: +15% damage and −10% cooldown per rank.", max: 3 },
};
export const UPGRADE_ORDER = ["vitality", "armor", "power", "agility", "mysticism"];
export const BASE_HP = 100;
export const BASE_ARMOR = 50;

/**
 * Artifacts — one hidden in each of eight levels. Collecting one is permanent
 * and grants a passive bonus (stacked into the player's stats).
 */
export const RELICS = {
  ankhLife: { name: "Ankh of Life", desc: "+15 maximum health.", glyph: "ankh", color: "#ffd060" },
  scarabWard: { name: "Scarab of Warding", desc: "+15 maximum armor.", glyph: "scarab", color: "#5ae0a0" },
  eyeHorus: { name: "Eye of Horus", desc: "+6% weapon damage.", glyph: "eye", color: "#60a8ff" },
  featherMaat: { name: "Feather of Maat", desc: "+5% movement speed.", glyph: "feather", color: "#f0f0e0" },
  djedPillar: { name: "Djed of Endurance", desc: "+15 maximum health.", glyph: "djed", color: "#e0a050" },
  lotusBloom: { name: "Lotus of Renewal", desc: "Start every level with one extra elixir.", glyph: "lotus", color: "#ff9ad0" },
  falconWing: { name: "Wing of the Falcon", desc: "+8% attack and recharge speed.", glyph: "falcon", color: "#c0a0ff" },
  sunDisk: { name: "Disc of Ra", desc: "+6% weapon damage and −15% Wrath of Ra cooldown.", glyph: "sun", color: "#ff8a30" },
};
export const RELIC_ORDER = ["ankhLife", "scarabWard", "eyeHorus", "featherMaat", "djedPillar", "lotusBloom", "falconWing", "sunDisk"];

/** XP needed to go from rank n to n+1. */
export const xpForRank = (n) => 120 + (n - 1) * 70;
export const XP = { puzzle: 20, note: 5, secret: 30, relic: 40, complete: 60, perLevel: 6 };

/** Player stats for a set of upgrade ranks and collected relics. */
export function statsFor(up = {}, relics = []) {
  const v = up.vitality || 0,
    a = up.armor || 0,
    p = up.power || 0,
    g = up.agility || 0,
    m = up.mysticism || 0;
  const has = (k) => relics.includes(k);
  const speed = 1 + g * 0.06 + (has("featherMaat") ? 0.05 : 0);
  const haste = 1 + g * 0.08 + (has("falconWing") ? 0.08 : 0);
  return {
    maxHp: BASE_HP + v * 20 + (has("ankhLife") ? 15 : 0) + (has("djedPillar") ? 15 : 0),
    maxArmor: BASE_ARMOR + a * 20 + (has("scarabWard") ? 15 : 0),
    dmgMul: 1 + p * 0.1 + (has("eyeHorus") ? 0.06 : 0) + (has("sunDisk") ? 0.06 : 0),
    speedMul: speed,
    rateMul: 1 / haste,
    reloadMul: 1 / haste,
    abilityMul: 1 + m * 0.15,
    abilityCd: ABILITY.cooldown * (1 - m * 0.1) * (has("sunDisk") ? 0.85 : 1),
    extraElixir: has("lotusBloom") ? 1 : 0,
  };
}
