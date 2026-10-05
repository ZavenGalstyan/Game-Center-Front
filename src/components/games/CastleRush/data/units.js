/**
 * Castle Rush — THE unit table. Every balance number for a soldier lives
 * here; the engine, the AI, the HUD and the Army screen all read from it.
 *
 * Distances are world units along the lane (the field is ~34 wide between
 * the two walls); times are seconds of game time; speed is units / second.
 * `attackRange` is the GAP between the two bodies (radius to radius), so a
 * melee range of 0.5 means "blade's reach past the target's shoulder".
 *
 * Attack timing: an attack starts, the weapon travels for `windup` seconds and
 * the hit (or arrow release) happens at exactly that moment — the renderer
 * uses the same number to put the blade on the target at the impact frame.
 * The next attack can start `cooldown` seconds after the previous one began.
 */

export const UNITS = {
  swordsman: {
    id: "swordsman",
    name: "Swordsman",
    role: "Balanced melee",
    blurb: "Cheap, steady frontline. Good at everything, great at nothing.",
    cost: 50,
    maxHp: 125,
    damage: 18,
    moveSpeed: 1.75,
    attackRange: 0.5,
    attackCooldown: 1.0,
    windup: 0.42,
    armor: 0.1,
    rangedResistance: 0,
    castleDamage: 1,
    projectileSpeed: 0,
    radius: 0.42,
    deployCooldown: 1.1,
    visualScale: 1,
    unlockLevel: 1,
    ranged: false,
    weight: "light",
  },
  archer: {
    id: "archer",
    name: "Archer",
    role: "Ranged damage",
    blurb: "Shoots over your frontline. Fragile once melee reaches it.",
    cost: 75,
    maxHp: 72,
    damage: 26,
    moveSpeed: 1.7,
    attackRange: 6.6,
    attackCooldown: 1.25,
    windup: 0.6,
    armor: 0,
    rangedResistance: 0,
    castleDamage: 0.8,
    projectileSpeed: 15,
    radius: 0.4,
    deployCooldown: 1.6,
    visualScale: 0.97,
    unlockLevel: 2,
    ranged: true,
    weight: "light",
  },
  shield: {
    id: "shield",
    name: "Shield Guard",
    role: "Tank / frontline",
    blurb: "Holds the line. Arrows barely scratch the tower shield.",
    cost: 100,
    maxHp: 330,
    damage: 11,
    moveSpeed: 1.2,
    attackRange: 0.5,
    attackCooldown: 1.15,
    windup: 0.45,
    armor: 0.25,
    rangedResistance: 0.65,
    castleDamage: 0.7,
    projectileSpeed: 0,
    radius: 0.5,
    deployCooldown: 2.4,
    visualScale: 1.05,
    unlockLevel: 3,
    ranged: false,
    weight: "heavy",
  },
  knight: {
    id: "knight",
    name: "Knight",
    role: "Heavy attacker",
    blurb: "Expensive armoured hammer. Crushes lines, but can be swarmed.",
    cost: 150,
    maxHp: 320,
    damage: 35,
    moveSpeed: 1.4,
    attackRange: 0.62,
    attackCooldown: 1.5,
    windup: 0.62,
    armor: 0.3,
    rangedResistance: 0.25,
    castleDamage: 1.25,
    projectileSpeed: 0,
    radius: 0.55,
    deployCooldown: 4,
    visualScale: 1.14,
    unlockLevel: 5,
    ranged: false,
    weight: "heavy",
  },
};

export const UNIT_IDS = ["swordsman", "archer", "shield", "knight"];

/** Gold refunded to the side that lands the killing blow (fair: both sides). */
export const KILL_BOUNTY = 0.2;

/**
 * ONE damage formula for unit → unit hits:
 *   final = base × (1 − armor) × (ranged ? 1 − rangedResistance : 1), min 1.
 * No crits, no misses, no random ranges — the same fight plays out the same.
 */
export function unitDamage(attacker, target, mult = 1) {
  const a = UNITS[attacker.type];
  const t = UNITS[target.type];
  let d = a.damage * mult * (1 - t.armor);
  if (a.ranged) d *= 1 - t.rangedResistance;
  return Math.max(1, d);
}

/** Unit → castle: wall armour applies to everyone; siege strength per type. */
export function castleDamage(attacker, wallArmor = 0, mult = 1) {
  const a = UNITS[attacker.type];
  return Math.max(1, a.damage * a.castleDamage * (1 - wallArmor) * mult);
}

/** Castle wall archer → unit (arrow, so ranged resistance applies). */
export function towerDamage(base, target) {
  const t = UNITS[target.type];
  return Math.max(1, base * (1 - t.armor) * (1 - t.rangedResistance));
}

/** Effective damage-per-second a unit deals to `targetType` (Army screen, AI). */
export function dps(type, targetType) {
  const a = UNITS[type];
  const fake = { type };
  return unitDamage(fake, { type: targetType }) / a.attackCooldown;
}
