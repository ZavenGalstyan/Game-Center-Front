/**
 * Shadow Warriors — equipment. All numbers are gameplay stats; `unlock` is
 * the campaign battle that must be WON before the item appears in the shop.
 *
 * Weapon stats: len/back = blade reach in front of / behind the grip (world
 * units), dmg = damage multiplier for L attacks, speed = frame multiplier for
 * L attacks (< 1 is faster), rec = extra recovery frames, stamina = L-attack
 * stamina multiplier.
 */
export const WEAPONS = [
  { id: "fists", name: "Bare Fists", family: "fists", len: 0, back: 0, dmg: 1.25, speed: 0.95, rec: 0, stamina: 1, price: 0, unlock: 0, color: "#c9c2b5", desc: "Fast, honest and always with you. Heavy attack: palm strike and flying knee." },
  { id: "staff", name: "Oak Staff", family: "pole", len: 96, back: 54, dmg: 1, speed: 0.95, rec: 0, stamina: 0.95, price: 220, unlock: 2, color: "#a07a4c", desc: "Long, balanced and quick to recover. Sweeps and overhead bell strikes." },
  { id: "daggers", name: "Twin Fang Daggers", family: "dual", dual: true, len: 42, back: 6, dmg: 1.1, speed: 0.7, rec: -2, stamina: 0.75, price: 420, unlock: 5, color: "#d8dde6", desc: "Very short reach, very fast four-hit strings. Low stamina use." },
  { id: "katana", name: "Moonsteel Katana", family: "blade", len: 80, back: 14, dmg: 1.08, speed: 0.95, rec: 0, stamina: 1, price: 900, unlock: 10, color: "#e8f0ff", desc: "Balanced reach and heavy cuts. Crescent Cleave is a guard-breaking overhead." },
  { id: "spear", name: "Crane Spear", family: "pole", len: 126, back: 34, dmg: 0.95, speed: 1.12, rec: 4, stamina: 1.05, price: 1300, unlock: 15, color: "#cfd6df", desc: "The longest thrusts in the game. Slow to recover — punish range, not close range." },
  { id: "twin", name: "Storm Twin Blades", family: "dual", dual: true, len: 62, back: 10, dmg: 1.12, speed: 0.84, rec: 0, stamina: 0.95, price: 1900, unlock: 20, color: "#b8e0ff", desc: "Medium reach dual blades. Fast strings with real damage." },
  { id: "hammer", name: "Mountain Breaker", family: "heavy", len: 92, back: 16, dmg: 1.55, speed: 1.4, rec: 6, stamina: 1.25, price: 2700, unlock: 25, color: "#8f8a80", desc: "Huge damage and guard crush, armored Earthbreaker — but very slow." },
  { id: "chain", name: "Serpent Chain", family: "chain", len: 140, back: 0, dmg: 0.9, speed: 1.12, rec: 3, stamina: 1.05, price: 3500, unlock: 32, color: "#b9b2a6", desc: "Whip-range sickle chain. Serpent Pull drags enemies into your reach." },
];

export const ARMORS = [
  { id: "gi", name: "Cloth Gi", def: 0, hp: 0, stam: 0, regen: 1, speed: 1, price: 0, unlock: 0, color: "#3a3f4a", desc: "Light training clothes. No protection, no penalties." },
  { id: "leather", name: "Leather Vest", def: 0.06, hp: 8, stam: 0, regen: 1, speed: 1, price: 280, unlock: 3, color: "#6b4a2f", desc: "Hardened leather. A little protection at no cost." },
  { id: "lamellar", name: "Bamboo Lamellar", def: 0.1, hp: 14, stam: 0, regen: 0.95, speed: 0.98, price: 750, unlock: 8, color: "#b8a86a", desc: "Laced bamboo plates. Solid defense, slightly slower stamina." },
  { id: "silk", name: "Shadow Silk Robe", def: 0.07, hp: 10, stam: 25, regen: 1.25, speed: 1.04, price: 1500, unlock: 14, color: "#4b3b78", desc: "Woven shadow silk: more stamina, faster recovery and footwork." },
  { id: "iron", name: "Iron Scale Armor", def: 0.15, hp: 24, stam: -5, regen: 0.86, speed: 0.94, price: 2400, unlock: 22, color: "#6d7480", desc: "Heavy iron scales. Strong defense, but you tire and move slower." },
  { id: "dragon", name: "Dragon Plate", def: 0.19, hp: 30, stam: 10, regen: 0.95, speed: 0.97, price: 4200, unlock: 36, color: "#d0503a", desc: "Legendary plate. Great defense with only a light penalty." },
];

/** Abilities use the Shadow meter (0–100). Boss victories teach them. */
export const ABILITIES = [
  { id: "wave", name: "Shadow Wave", cost: 50, from: 0, desc: "Hurl a crescent of shadow along the ground (mid). Blockable, jumpable." },
  { id: "iron", name: "Iron Body", cost: 60, from: 10, desc: "For 5 s light hits don't stagger you and all damage is reduced by 35%." },
  { id: "rush", name: "Phantom Rush", cost: 60, from: 20, desc: "Blink forward in a shadow dash that knocks the enemy down." },
  { id: "vampire", name: "Blood Moon", cost: 70, from: 30, desc: "For 6 s your hits heal you for 45% of the damage dealt." },
  { id: "quake", name: "Earthshaker", cost: 80, from: 40, desc: "Stomp to send shockwaves both ways along the ground (low, knockdown)." },
];

export const MAX_LEVEL = 5;
export const weaponById = (id) => WEAPONS.find((w) => w.id === id) || WEAPONS[0];
export const armorById = (id) => ARMORS.find((a) => a.id === id) || ARMORS[0];
export const abilityById = (id) => ABILITIES.find((a) => a.id === id) || null;

/** Cost to go from level `lvl` to `lvl + 1` (null at max). */
export function upgradeCost(item, lvl) {
  if (lvl >= MAX_LEVEL) return null;
  const base = Math.max(200, item.price || 200);
  return Math.round((base * 0.16 * (lvl + 1)) / 10) * 10 + 80;
}
export const abilityUpgradeCost = (lvl) => (lvl >= 3 ? null : 300 + lvl * 350);

/** Damage multiplier from a weapon's upgrade level. */
export const weaponPower = (lvl) => 1 + 0.08 * (lvl || 0);
/** Armor stats at an upgrade level. */
export function armorStats(a, lvl = 0) {
  return { def: Math.min(0.32, a.def + 0.015 * lvl), hp: a.hp + 4 * lvl, stam: a.stam + 2 * lvl, regen: a.regen, speed: a.speed };
}
/** Ability power (scales its effect) by upgrade level. */
export const abilityPower = (lvl) => 1 + 0.2 * (lvl || 0);
