/**
 * Dungeon Knight — the RPG layer: knight level, XP, permanent upgrades,
 * equipment → the five core stats (LEVEL, HP, STAMINA, ATTACK, DEFENSE),
 * and loot rolls. Pure functions over the saved progress object.
 */
import { itemById, ALL_ITEMS, RARITIES, salvageValue, STARTER } from "../data/items.js";
import { BASE } from "./config.js";
import { rng, hashStr } from "./math.js";

export const MAX_LEVEL = 30;
export const UPGRADE_MAX = 10;

/** XP needed to go from `level` to `level + 1`. */
export const xpToNext = (level) => Math.round(60 + 45 * (level - 1) + 9 * (level - 1) ** 2);

export const UPGRADES = [
  { id: "health", name: "Health", blurb: "+10 max HP per level", base: 60 },
  { id: "damage", name: "Sword Damage", blurb: "+2 attack per level", base: 80 },
  { id: "stamina", name: "Stamina", blurb: "+6 max stamina per level", base: 60 },
  { id: "defense", name: "Defense", blurb: "+2 defense per level", base: 70 },
  { id: "potions", name: "Potion Capacity", blurb: "+1 potion carried (max +3)", base: 150, max: 3 },
];
export const upgradeMax = (u) => u.max || UPGRADE_MAX;
export const upgradeCost = (u, lvl) => Math.round(u.base * (lvl + 1) ** 1.45);

/** The knight's live combat stats. */
export function computeStats(progress) {
  const lv = progress.knightLevel;
  const up = progress.upgrades;
  const w = itemById(progress.equipped.weapon) || itemById(STARTER.weapon);
  const a = itemById(progress.equipped.armor) || itemById(STARTER.armor);
  const s = itemById(progress.equipped.shield) || itemById(STARTER.shield);
  return {
    level: lv,
    maxHp: BASE.hp + (lv - 1) * 6 + a.hp + up.health * 10,
    maxSt: BASE.stamina + (lv - 1) * 3 + up.stamina * 6,
    attack: w.damage + (lv - 1) + up.damage * 2,
    defense: a.defense + up.defense * 2,
    speed: w.speed,
    staminaMul: w.stamina,
    bladeLen: w.look.len,
    block: s.block,
    guard: s.guard,
    potionMax: BASE.potions + up.potions,
  };
}

/** Add XP; returns { progress, levels } (levels gained this call). */
export function addXp(progress, xp) {
  let level = progress.knightLevel;
  let cur = progress.xp + Math.max(0, Math.round(xp));
  let gained = 0;
  while (level < MAX_LEVEL && cur >= xpToNext(level)) {
    cur -= xpToNext(level);
    level += 1;
    gained += 1;
  }
  if (level >= MAX_LEVEL) cur = Math.min(cur, xpToNext(MAX_LEVEL) - 1);
  const stats = { ...progress.statistics, highestLevel: Math.max(progress.statistics.highestLevel, level) };
  return { progress: { ...progress, knightLevel: level, xp: cur, statistics: stats }, levels: gained };
}

/* ------------------------------------------------------------------ loot */
const RARITY_WEIGHTS = {
  treasure: [52, 33, 13, 2],
  first: [100, 0, 0, 0],
  elite: [0, 50, 40, 10],
  boss: [0, 20, 55, 25],
};

/**
 * Roll a chest. Deterministic for (run seed, dungeon, step, kind), so a
 * restarted room can never re-roll into a different item.
 * Returns { gold, potion, item } where item may be null.
 */
export function rollChest(progress, dungeon, stepIndex, kind, runSeed) {
  const r = rng(hashStr(`${runSeed}:${dungeon.id}:${stepIndex}:${kind}`));
  const tier = dungeon.tier;
  const goldBase = { first: 15, treasure: 30, elite: 55, boss: 120 }[kind] || 20;
  const gold = Math.round(goldBase * (1 + tier * 0.6) * (0.85 + r() * 0.3));
  // the very first chest of the game: a real sword upgrade
  if (kind === "first") {
    const owned = ownsItem(progress, "w_iron");
    return { gold, potion: false, item: owned ? null : "w_iron", bonusGold: owned ? salvageValue(itemById("w_iron")) : 0, dupeOf: owned ? "w_iron" : null };
  }
  const weights = RARITY_WEIGHTS[kind] || RARITY_WEIGHTS.treasure;
  const pool = ALL_ITEMS.filter((it) => it.tier <= tier + 1 && it.tier >= Math.max(0, tier - 1) && it.id !== STARTER.weapon && it.id !== STARTER.armor && it.id !== STARTER.shield);
  // prefer items the knight doesn't own yet
  const fresh = pool.filter((it) => !ownsItem(progress, it.id));
  const src = fresh.length ? fresh : pool;
  let item = null;
  for (let tries = 0; tries < 8 && !item; tries++) {
    let x = r() * 100;
    let rank = 0;
    for (; rank < 4; rank++) {
      x -= weights[rank];
      if (x <= 0) break;
    }
    rank = Math.min(3, rank);
    const cands = src.filter((it) => RARITIES[it.rarity].rank === rank);
    if (cands.length) item = cands[Math.floor(r() * cands.length)].id;
    else if (tries > 4) {
      const any = src.filter((it) => RARITIES[it.rarity].rank >= Math.max(0, rank - 1));
      if (any.length) item = any[Math.floor(r() * any.length)].id;
    }
  }
  const potion = kind === "treasure" ? r() < 0.45 : kind !== "first";
  let bonusGold = 0;
  let dupeOf = null;
  if (item && ownsItem(progress, item)) {
    bonusGold = salvageValue(itemById(item));
    dupeOf = item;
    item = null;
  }
  return { gold, potion, item, bonusGold, dupeOf };
}

export function ownsItem(progress, id) {
  const e = progress.equipped;
  return e.weapon === id || e.armor === id || e.shield === id || progress.inventory.includes(id);
}
