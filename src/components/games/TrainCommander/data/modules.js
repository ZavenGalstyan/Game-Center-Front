/**
 * Train Commander — the four wagon modules. EVERY balance number for the
 * player's defences lives here; components and the engine only read it.
 *
 * Per-level arrays are indexed by (level - 1). `upgradeCost[i]` is the price
 * of going from level i+1 to level i+2.
 *
 * targetPriority:
 *   nearest   closest living enemy in range (to the module)
 *   cluster   the enemy with the most other enemies inside the splash radius
 *             (ties → higher armour → nearest)
 *   threat    highest threat class (ranged > boss > vehicle > armored > rest)
 *             then nearest to the train
 *   damaged   (repair) the most damaged car in reach, by missing HP fraction
 */
export const MODULES = {
  gunner: {
    id: "gunner",
    name: "Gunner",
    short: "GUNNER",
    role: "Rapid-fire · anti-rider",
    blurb: "Cheap, fast twin guns. Shreds light riders, struggles against armour.",
    cost: 60,
    maxLevel: 3,
    upgradeCost: [55, 95],
    damage: [7, 9, 12],
    attackSpeed: [3.0, 3.6, 4.2], // shots per second
    range: [9, 10, 11],
    projectileSpeed: 42,
    splashRadius: [0, 0, 0],
    targetPriority: "nearest",
    repairRate: [0, 0, 0],
    visualVariant: ["twin", "quad", "cupola"],
    color: "#4cc9f0",
  },
  cannon: {
    id: "cannon",
    name: "Cannon",
    short: "CANNON",
    role: "Heavy splash · anti-armour",
    blurb: "Slow, heavy shells that burst on impact — punishes groups and armour.",
    cost: 110,
    maxLevel: 3,
    upgradeCost: [90, 150],
    damage: [40, 58, 80],
    attackSpeed: [0.42, 0.48, 0.55],
    range: [12, 13, 14],
    projectileSpeed: 17,
    splashRadius: [2.2, 2.6, 3.0],
    targetPriority: "cluster",
    repairRate: [0, 0, 0],
    visualVariant: ["field", "heavy", "twin"],
    color: "#ff9f43",
  },
  lancer: {
    id: "lancer",
    name: "Lancer",
    short: "LONG RANGE",
    role: "Long range · precision",
    blurb: "A spring-steel bolt thrower. Picks off shooters and big threats far out.",
    cost: 95,
    maxLevel: 3,
    upgradeCost: [80, 135],
    damage: [34, 48, 66],
    attackSpeed: [0.75, 0.85, 1.0],
    range: [16, 18, 20],
    projectileSpeed: 36,
    splashRadius: [0, 0, 0],
    targetPriority: "threat",
    repairRate: [0, 0, 0],
    visualVariant: ["bow", "scoped", "coil"],
    color: "#c084fc",
  },
  repair: {
    id: "repair",
    name: "Repair",
    short: "REPAIR",
    role: "Support · passive repair",
    blurb: "Never fires. Its crane slowly welds the most damaged neighbouring car.",
    cost: 90,
    maxLevel: 3,
    upgradeCost: [70, 120],
    damage: [0, 0, 0],
    attackSpeed: [0, 0, 0],
    range: [0, 0, 0],
    reach: [1, 1, 2], // cars either side it can weld
    projectileSpeed: 0,
    splashRadius: [0, 0, 0],
    targetPriority: "damaged",
    repairRate: [6, 9, 13], // HP per second
    visualVariant: ["crane", "twin-arm", "workshop"],
    color: "#4ade80",
  },
};

export const MODULE_IDS = ["gunner", "cannon", "lancer", "repair"];

/** stat for a module at a level (1-based), clamped */
export function stat(id, key, level) {
  const m = MODULES[id];
  const v = m[key];
  if (Array.isArray(v)) return v[Math.max(0, Math.min(v.length - 1, level - 1))];
  return v;
}

/** total scrap invested in a module of this level (for the sell-free "replace" UI) */
export function invested(id, level) {
  const m = MODULES[id];
  let s = m.cost;
  for (let i = 0; i < level - 1; i++) s += m.upgradeCost[i];
  return s;
}

/** Emergency repair: a flat Scrap cost, restores a share of max HP, global cooldown. */
export const EMERGENCY = { cost: 40, share: 0.4, cooldown: 18 };

/** A disabled wagon's module comes back online at this HP fraction. */
export const REACTIVATE_AT = 0.4;
