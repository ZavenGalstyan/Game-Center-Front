/**
 * Outlaw Legends: Wild Frontier — static game data: weapons, enemy archetypes,
 * shop upgrades, combat abilities and the XP curve. Pure data + tiny helpers,
 * shared by the sim, the React UI and the Node test tools.
 */

export const WEAPON_ORDER = ["revolver", "shotgun", "rifle", "dual"];

/**
 * dmg per bullet/pellet · rate = seconds between shots · mag/reserve rounds ·
 * reload seconds (full) or per round (reloadType "round") · range = full-damage
 * distance, maxRange = where damage has fallen to 40 % · spread radians (hip /
 * aimed / moving penalty) · recoil = camera kick (rad) · knock = knockback m.
 */
export const WEAPONS = {
  revolver: {
    id: "revolver",
    slot: 1,
    name: "Classic Revolver",
    short: "Revolver",
    desc: "A trusty six-shooter. Accurate, quick to draw and deadly with a headshot.",
    dmg: 34,
    pellets: 1,
    rate: 0.3,
    mag: 6,
    reserve: 42,
    maxReserve: 90,
    reload: 1.5,
    reloadType: "full",
    range: 38,
    maxRange: 80,
    spread: 0.014,
    aimSpread: 0.0035,
    moveSpread: 0.018,
    recoil: 0.032,
    knock: 0.3,
    auto: false,
    fov: 50,
    headMul: 2.2,
  },
  shotgun: {
    id: "shotgun",
    slot: 2,
    name: "Double-Barrel Shotgun",
    short: "Shotgun",
    desc: "Two barrels of buckshot. Devastating up close, useless at a distance.",
    dmg: 13,
    pellets: 8,
    rate: 0.38,
    mag: 2,
    reserve: 18,
    maxReserve: 40,
    reload: 1.25,
    reloadType: "full",
    range: 9,
    maxRange: 24,
    spread: 0.075,
    aimSpread: 0.055,
    moveSpread: 0.01,
    recoil: 0.085,
    knock: 3.2,
    auto: false,
    fov: 56,
    headMul: 1.4,
  },
  rifle: {
    id: "rifle",
    slot: 3,
    name: "Lever-Action Rifle",
    short: "Rifle",
    desc: "Long-range precision. Aim down the sights to pick off marksmen across the canyon.",
    dmg: 64,
    pellets: 1,
    rate: 0.72,
    mag: 8,
    reserve: 32,
    maxReserve: 64,
    reload: 0.42,
    reloadType: "round",
    range: 75,
    maxRange: 130,
    spread: 0.024,
    aimSpread: 0.0012,
    moveSpread: 0.03,
    recoil: 0.06,
    knock: 0.8,
    auto: false,
    fov: 28,
    headMul: 2.5,
  },
  dual: {
    id: "dual",
    slot: 4,
    name: "Dual Revolvers",
    short: "Dual Revolvers",
    desc: "Two pistols, twelve shots. Hold the trigger to fan a storm of lead.",
    dmg: 27,
    pellets: 1,
    rate: 0.13,
    mag: 12,
    reserve: 72,
    maxReserve: 144,
    reload: 2.3,
    reloadType: "full",
    range: 28,
    maxRange: 60,
    spread: 0.024,
    aimSpread: 0.011,
    moveSpread: 0.014,
    recoil: 0.022,
    knock: 0.3,
    auto: true,
    fov: 52,
    headMul: 1.8,
  },
};

/** Where each weapon comes from (shown in the shop while it's locked). */
export const WEAPON_UNLOCK = {
  revolver: 0,
  shotgun: 6,
  rifle: 10,
  dual: 14,
};
export const WEAPON_UNLOCK_TEXT = {
  shotgun: "Unlocked by completing Mission 6.",
  rifle: "Found in Mission 10.",
  dual: "Found in Mission 14.",
};

/* ------------------------------------------------------------------ enemies */
/**
 * hp · speed m/s · weapon: dmg per hit, acc = base hit chance, range, rate =
 * seconds between attacks, aim = telegraph time before a shot, burst · melee
 * dmg · xp/money reward · cover = how eagerly it hides · look = model palette.
 */
export const ENEMIES = {
  bandit: { name: "Bandit", hp: 70, speed: 3.6, dmg: 7, acc: 0.42, range: 24, rate: 1.7, aim: 0.55, burst: 1, melee: 9, xp: 20, money: 8, cover: 0.4, look: "bandit", view: 30 },
  gunslinger: { name: "Gunslinger", hp: 90, speed: 4.2, dmg: 8, acc: 0.5, range: 26, rate: 1.5, aim: 0.42, burst: 2, melee: 10, xp: 30, money: 12, cover: 0.55, look: "gunslinger", view: 34, strafe: true },
  shotgunner: { name: "Shotgunner", hp: 115, speed: 3.9, dmg: 18, acc: 0.55, range: 11, rate: 1.9, aim: 0.5, burst: 1, melee: 12, xp: 35, money: 14, cover: 0.2, look: "shotgunner", view: 26, rush: true },
  marksman: { name: "Marksman", hp: 75, speed: 3.2, dmg: 16, acc: 0.66, range: 55, rate: 2.6, aim: 1.15, burst: 1, melee: 8, xp: 40, money: 16, cover: 0.7, look: "marksman", view: 55, sniper: true },
  brawler: { name: "Brawler", hp: 120, speed: 4.5, dmg: 0, acc: 0, range: 0, rate: 1.25, aim: 0.45, burst: 0, melee: 13, xp: 30, money: 10, cover: 0, look: "brawler", view: 22, meleeOnly: true },
  elite: { name: "Elite Gunman", hp: 165, speed: 4.3, dmg: 10, acc: 0.56, range: 34, rate: 1.35, aim: 0.4, burst: 3, melee: 14, xp: 60, money: 24, cover: 0.75, look: "elite", view: 38, strafe: true },
  rider: { name: "Mounted Bandit", hp: 80, speed: 7.2, dmg: 7, acc: 0.34, range: 24, rate: 1.8, aim: 0.6, burst: 1, melee: 0, xp: 50, money: 20, cover: 0, look: "rider", view: 40, mounted: true },
  boss: { name: "Outlaw Boss", hp: 600, speed: 4.4, dmg: 11, acc: 0.6, range: 32, rate: 1.2, aim: 0.45, burst: 3, melee: 18, xp: 300, money: 150, cover: 0.3, look: "boss", view: 45, strafe: true },
  bossBrute: { name: "Outlaw Boss", hp: 800, speed: 4.6, dmg: 0, acc: 0, range: 0, rate: 1.1, aim: 0.5, burst: 0, melee: 24, xp: 300, money: 150, cover: 0, look: "brute", view: 30, meleeOnly: true },
};

/* ------------------------------------------------------------------ shop */
export const WEAPON_UPGRADES = [
  { id: "dmg", name: "Damage", desc: "+12% damage per level." },
  { id: "acc", name: "Accuracy", desc: "Tighter spread and less recoil." },
  { id: "rel", name: "Reload Speed", desc: "Reload 15% faster per level." },
];
export const UPGRADE_MAX = 3;
const WEAPON_BASE_COST = { revolver: 120, shotgun: 180, rifle: 220, dual: 260 };
export function weaponUpgradeCost(wid, level) {
  return Math.round((WEAPON_BASE_COST[wid] * [1, 1.9, 3.2][level]) / 10) * 10;
}

export const CHAR_UPGRADES = [
  { id: "health", name: "Health", desc: "+20 maximum health per level.", max: 5, base: 150 },
  { id: "melee", name: "Melee Damage", desc: "Punches and kicks hit 20% harder per level.", max: 4, base: 130 },
  { id: "stamina", name: "Stamina", desc: "+20 stamina for sprinting, dodging and fighting.", max: 3, base: 110 },
];
export function charUpgradeCost(id, level) {
  const u = CHAR_UPGRADES.find((c) => c.id === id);
  return Math.round((u.base * (1 + level * 0.85)) / 10) * 10;
}

export const ABILITIES = [
  { id: "deadEye", name: "Dead Eye", desc: "Press Z to slow time while you keep full speed. Kills refill the meter.", level: 3, cost: 250, key: "Z" },
  { id: "counter", name: "Counter Strike", desc: "Block a melee attack at the last moment to stun the attacker.", level: 4, cost: 200 },
  { id: "toughHide", name: "Tough Hide", desc: "Take 15% less damage from bullets.", level: 7, cost: 400 },
  { id: "quickDraw", name: "Quick Draw", desc: "Duel opponents react slower and weapons switch faster.", level: 9, cost: 350 },
];

/* ------------------------------------------------------------------ XP */
export const MAX_LEVEL = 20;
/** Total XP needed to reach `level` (level 1 = 0). */
export function xpForLevel(level) {
  const n = Math.max(0, Math.min(MAX_LEVEL, level) - 1);
  return 40 * n * (n + 4);
}
export function levelFromXp(xp) {
  let L = 1;
  while (L < MAX_LEVEL && xp >= xpForLevel(L + 1)) L++;
  return L;
}

export const DIFFICULTY = {
  easy: { dmg: 0.6, acc: 0.8, hp: 0.85, duel: 0.25 },
  normal: { dmg: 1, acc: 1, hp: 1, duel: 0 },
  hard: { dmg: 1.35, acc: 1.12, hp: 1.15, duel: -0.08 },
};

/** Player stats derived from saved progress (upgrades, level, abilities). */
export function playerStats(progress) {
  const up = progress.upgrades || {};
  const level = levelFromXp(progress.xp || 0);
  const ch = up.char || {};
  const weapons = {};
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const u = up[id] || {};
    const dl = u.dmg || 0, al = u.acc || 0, rl = u.rel || 0;
    weapons[id] = {
      ...w,
      dmg: w.dmg * (1 + 0.12 * dl),
      spread: w.spread * Math.pow(0.8, al),
      aimSpread: w.aimSpread * Math.pow(0.78, al),
      recoil: w.recoil * Math.pow(0.85, al),
      reload: w.reload * Math.pow(0.85, rl),
      levels: { dmg: dl, acc: al, rel: rl },
    };
  }
  const ab = progress.abilities || {};
  return {
    level,
    maxHp: 100 + 20 * (ch.health || 0) + 4 * (level - 1),
    maxStamina: 100 + 20 * (ch.stamina || 0),
    melee: 1 + 0.2 * (ch.melee || 0),
    weapons,
    owned: WEAPON_ORDER.filter((id) => (progress.weapons || ["revolver"]).includes(id)),
    deadEye: !!ab.deadEye,
    counter: !!ab.counter,
    toughHide: !!ab.toughHide,
    quickDraw: !!ab.quickDraw,
  };
}
