/**
 * Tower Defense Mini — the ONE place tower numbers live.
 *
 * Every tower has three levels. `cost` on level 1 is the build price; on
 * levels 2/3 it is the upgrade price. Stats per level are complete (no
 * multipliers hidden elsewhere), so the Towers screen, the in-battle panel
 * and the engine all read the same table.
 *
 *   attackSpeed         attacks per second
 *   range               world units (the road is 1.5 wide; a build pad 1.5)
 *   projectileSpeed     world units per second
 *   splashRadius        0 = single target
 *   slowAmount          fraction of speed removed (0.4 = 40% slower)
 *   slowDuration        seconds
 *   muzzle / muzzleFwd  where shots leave the model (height per level, and
 *                       distance forward along the aim) — visual only
 *   armorEffectiveness  fraction of an enemy's armour this tower IGNORES
 *                       (0 = arrows bounce off plate, 1 = magic goes through)
 */
export const SELL_REFUND = 0.7;

export const TOWERS = {
  archer: {
    id: "archer",
    name: "Archer Tower",
    short: "ARCHER",
    role: "Fast single-target damage",
    special: "Quick volleys — great early, weak against armour.",
    projectile: "arrow",
    muzzle: [1.84, 2.12, 2.4],
    muzzleFwd: 0.15,
    targetType: "first",
    armorEffectiveness: 0,
    color: "#8fd14f",
    levels: [
      { cost: 70, damage: 12, attackSpeed: 1.6, range: 3.6, projectileSpeed: 18, splashRadius: 0, slowAmount: 0, slowDuration: 0 },
      { cost: 65, damage: 18, attackSpeed: 1.85, range: 3.9, projectileSpeed: 19, splashRadius: 0, slowAmount: 0, slowDuration: 0 },
      { cost: 115, damage: 27, attackSpeed: 2.15, range: 4.3, projectileSpeed: 20, splashRadius: 0, slowAmount: 0, slowDuration: 0 },
    ],
  },
  cannon: {
    id: "cannon",
    name: "Cannon Tower",
    short: "CANNON",
    role: "Slow area damage",
    special: "Cannonballs burst on landing and hit every enemy nearby.",
    projectile: "cannonball",
    muzzle: [1.22, 1.47, 1.72],
    muzzleFwd: 0.7,
    targetType: "first",
    armorEffectiveness: 0.5,
    color: "#f0a43a",
    levels: [
      { cost: 110, damage: 30, attackSpeed: 0.55, range: 3.4, projectileSpeed: 9, splashRadius: 1.25, slowAmount: 0, slowDuration: 0 },
      { cost: 95, damage: 46, attackSpeed: 0.6, range: 3.6, projectileSpeed: 9.5, splashRadius: 1.4, slowAmount: 0, slowDuration: 0 },
      { cost: 165, damage: 72, attackSpeed: 0.66, range: 3.9, projectileSpeed: 10, splashRadius: 1.6, slowAmount: 0, slowDuration: 0 },
    ],
  },
  frost: {
    id: "frost",
    name: "Frost Tower",
    short: "FROST",
    role: "Slows enemies down",
    special: "Frost bolts chill their target — from level 2 the chill spreads.",
    projectile: "frost",
    muzzle: [1.48, 1.78, 2.13],
    muzzleFwd: 0,
    targetType: "first",
    armorEffectiveness: 0.5,
    color: "#5fd6ff",
    levels: [
      { cost: 90, damage: 6, attackSpeed: 0.9, range: 3.4, projectileSpeed: 13, splashRadius: 0, slowAmount: 0.4, slowDuration: 1.6 },
      { cost: 80, damage: 10, attackSpeed: 1.0, range: 3.7, projectileSpeed: 14, splashRadius: 0.75, slowAmount: 0.5, slowDuration: 2.0 },
      { cost: 130, damage: 15, attackSpeed: 1.12, range: 4.0, projectileSpeed: 15, splashRadius: 1.0, slowAmount: 0.6, slowDuration: 2.4 },
    ],
  },
  mage: {
    id: "mage",
    name: "Mage Tower",
    short: "MAGE",
    role: "Heavy magic damage",
    special: "Arcane bolts ignore armour completely.",
    projectile: "magic",
    muzzle: [1.93, 2.18, 2.48],
    muzzleFwd: 0,
    targetType: "first",
    armorEffectiveness: 1,
    color: "#b47cff",
    levels: [
      { cost: 140, damage: 36, attackSpeed: 0.7, range: 3.8, projectileSpeed: 12, splashRadius: 0, slowAmount: 0, slowDuration: 0 },
      { cost: 120, damage: 56, attackSpeed: 0.76, range: 4.1, projectileSpeed: 13, splashRadius: 0, slowAmount: 0, slowDuration: 0 },
      { cost: 190, damage: 86, attackSpeed: 0.85, range: 4.5, projectileSpeed: 14, splashRadius: 0, slowAmount: 0, slowDuration: 0 },
    ],
  },
};

export const TOWER_IDS = ["archer", "cannon", "frost", "mage"];
export const MAX_LEVEL = 3;

/** Flat stat block for a tower type at a level (1-based). */
export function towerStats(type, level = 1) {
  const T = TOWERS[type];
  if (!T) return null;
  const lv = Math.max(1, Math.min(MAX_LEVEL, level | 0));
  const s = T.levels[lv - 1];
  return {
    id: T.id,
    name: T.name,
    cost: T.levels[0].cost,
    damage: s.damage,
    attackSpeed: s.attackSpeed,
    range: s.range,
    projectileSpeed: s.projectileSpeed,
    targetType: T.targetType,
    splashRadius: s.splashRadius,
    slowAmount: s.slowAmount,
    slowDuration: s.slowDuration,
    armorEffectiveness: T.armorEffectiveness,
    upgradeCost: lv < MAX_LEVEL ? T.levels[lv].cost : null,
    level: lv,
    maxLevel: MAX_LEVEL,
  };
}

/** Total coins put into a tower at a level (build + all upgrades). */
export function towerInvestment(type, level) {
  const T = TOWERS[type];
  let sum = 0;
  for (let i = 0; i < level && i < MAX_LEVEL; i++) sum += T.levels[i].cost;
  return sum;
}

export const sellValue = (invested) => Math.floor(invested * SELL_REFUND);
