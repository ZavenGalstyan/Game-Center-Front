/**
 * Dungeon Knight — equipment. A deliberately small, hand-tuned set: three
 * slots (weapon / armor / shield), four rarities, each item unique. Stats are
 * the only thing rarity changes; every difference is meant to be felt.
 *
 *   weapon  damage, speed (attack-time multiplier, < 1 = faster), stamina (cost multiplier)
 *   armor   hp (max health bonus), defense
 *   shield  block (share of a blocked hit's health damage stopped),
 *           guard (share of a blocked hit's stamina damage stopped)
 *
 * `tier` = the dungeon where the item starts dropping. `look` drives the
 * procedural mesh (three/equipment.js).
 */
export const RARITIES = {
  common: { id: "common", name: "Common", color: "#c9cbd1", rank: 0 },
  uncommon: { id: "uncommon", name: "Uncommon", color: "#5fd07a", rank: 1 },
  rare: { id: "rare", name: "Rare", color: "#4f9dff", rank: 2 },
  epic: { id: "epic", name: "Epic", color: "#b86bff", rank: 3 },
};

export const WEAPONS = [
  { id: "w_rusty", slot: "weapon", name: "Rusty Sword", rarity: "common", tier: 0, damage: 12, speed: 1.0, stamina: 1.0, look: { blade: "#9a8f84", hilt: "#5b3a22", guard: "#7d6a55", len: 0.92, width: 1, glow: null } },
  { id: "w_iron", slot: "weapon", name: "Iron Sword", rarity: "common", tier: 1, damage: 15, speed: 1.0, stamina: 1.0, look: { blade: "#b9bec6", hilt: "#4a3020", guard: "#8c8f96", len: 0.96, width: 1, glow: null } },
  { id: "w_steel", slot: "weapon", name: "Steel Sword", rarity: "uncommon", tier: 1, damage: 19, speed: 0.97, stamina: 0.95, look: { blade: "#d9dde3", hilt: "#3c2a1e", guard: "#b8a26a", len: 1.0, width: 1, glow: null } },
  { id: "w_longsword", slot: "weapon", name: "Warden Longsword", rarity: "uncommon", tier: 2, damage: 24, speed: 1.06, stamina: 1.05, look: { blade: "#d6dbe2", hilt: "#2c3d4a", guard: "#9aa7b4", len: 1.12, width: 1.05, glow: null } },
  { id: "w_moon", slot: "weapon", name: "Moonsteel Blade", rarity: "rare", tier: 2, damage: 29, speed: 0.92, stamina: 0.9, look: { blade: "#d8ecff", hilt: "#1f2b45", guard: "#8fb4ff", len: 1.02, width: 0.95, glow: "#7fc4ff" } },
  { id: "w_ember", slot: "weapon", name: "Emberbrand", rarity: "rare", tier: 3, damage: 35, speed: 1.0, stamina: 1.0, look: { blade: "#f2c9a0", hilt: "#3a1a12", guard: "#d8873a", len: 1.06, width: 1.1, glow: "#ff8a3d" } },
  { id: "w_frost", slot: "weapon", name: "Rimefang", rarity: "epic", tier: 3, damage: 40, speed: 0.9, stamina: 0.88, look: { blade: "#e4f6ff", hilt: "#22324a", guard: "#a7e3ff", len: 1.08, width: 1, glow: "#9fe8ff" } },
  { id: "w_dawn", slot: "weapon", name: "Dawnbreaker", rarity: "epic", tier: 4, damage: 48, speed: 0.92, stamina: 0.9, look: { blade: "#fff2cf", hilt: "#3b2a12", guard: "#ffd166", len: 1.12, width: 1.08, glow: "#ffd98a" } },
];

export const ARMORS = [
  { id: "a_padded", slot: "armor", name: "Padded Tunic", rarity: "common", tier: 0, hp: 0, defense: 4, look: { metal: "#9aa1a9", cloth: "#2f6f78", trim: "#7a5a3a" } },
  { id: "a_chain", slot: "armor", name: "Chain Hauberk", rarity: "common", tier: 1, hp: 15, defense: 8, look: { metal: "#a8aeb6", cloth: "#2d5f6a", trim: "#8a6a44" } },
  { id: "a_scale", slot: "armor", name: "Scale Cuirass", rarity: "uncommon", tier: 1, hp: 25, defense: 12, look: { metal: "#b5b9bf", cloth: "#2a6b6a", trim: "#b08a4a" } },
  { id: "a_warden", slot: "armor", name: "Warden Plate", rarity: "uncommon", tier: 2, hp: 40, defense: 16, look: { metal: "#c1c7cf", cloth: "#2b4f7a", trim: "#c9a45a" } },
  { id: "a_frost", slot: "armor", name: "Frostguard Mail", rarity: "rare", tier: 2, hp: 55, defense: 21, look: { metal: "#d2e4f0", cloth: "#2f6f9a", trim: "#9fd8ff" } },
  { id: "a_ember", slot: "armor", name: "Emberforged Plate", rarity: "rare", tier: 3, hp: 70, defense: 26, look: { metal: "#b7a596", cloth: "#7a2e22", trim: "#ff9a4a" } },
  { id: "a_shadow", slot: "armor", name: "Nightsteel Plate", rarity: "epic", tier: 4, hp: 95, defense: 32, look: { metal: "#7d7fa0", cloth: "#3a2a6a", trim: "#c39bff" } },
];

export const SHIELDS = [
  { id: "s_buckler", slot: "shield", name: "Oak Buckler", rarity: "common", tier: 0, block: 0.75, guard: 0.0, look: { face: "#7a5232", rim: "#8c8f96", boss: "#9aa1a9", shape: "round", emblem: null } },
  { id: "s_iron", slot: "shield", name: "Iron Roundshield", rarity: "common", tier: 1, block: 0.82, guard: 0.1, look: { face: "#5d6b75", rim: "#a8aeb6", boss: "#c9cdd3", shape: "round", emblem: null } },
  { id: "s_kite", slot: "shield", name: "Teal Kite Shield", rarity: "uncommon", tier: 1, block: 0.88, guard: 0.18, look: { face: "#2a6f78", rim: "#c0c6cd", boss: "#d9b45a", shape: "kite", emblem: "#e9d9a8" } },
  { id: "s_tower", slot: "shield", name: "Warden Tower Guard", rarity: "uncommon", tier: 2, block: 0.93, guard: 0.26, look: { face: "#34506e", rim: "#c9cdd3", boss: "#c9a45a", shape: "tower", emblem: "#e3e7ec" } },
  { id: "s_aegis", slot: "shield", name: "Frost Aegis", rarity: "rare", tier: 2, block: 0.96, guard: 0.34, look: { face: "#6fa9c9", rim: "#e4f6ff", boss: "#9fe8ff", shape: "kite", emblem: "#ffffff" } },
  { id: "s_sun", slot: "shield", name: "Sunward Bulwark", rarity: "epic", tier: 3, block: 1.0, guard: 0.45, look: { face: "#8a5a22", rim: "#ffd166", boss: "#fff2cf", shape: "round", emblem: "#ffd98a" } },
];

export const ALL_ITEMS = [...WEAPONS, ...ARMORS, ...SHIELDS];
const BY_ID = new Map(ALL_ITEMS.map((it) => [it.id, it]));
export const itemById = (id) => BY_ID.get(id) || null;

export const STARTER = { weapon: "w_rusty", armor: "a_padded", shield: "s_buckler" };
export const BAG_SIZE = 12;

/** The one number shown for an item, and how it compares (signed) against another. */
export function itemPower(it) {
  if (!it) return 0;
  if (it.slot === "weapon") return it.damage;
  if (it.slot === "armor") return it.defense;
  return Math.round(it.block * 100);
}
export function itemLines(it) {
  if (!it) return [];
  if (it.slot === "weapon") {
    const out = [{ k: "Attack", v: it.damage }];
    out.push({ k: "Speed", v: it.speed < 0.97 ? "Fast" : it.speed > 1.03 ? "Slow" : "Normal" });
    if (it.stamina !== 1) out.push({ k: "Stamina use", v: `${Math.round(it.stamina * 100)}%` });
    return out;
  }
  if (it.slot === "armor") return [{ k: "Defense", v: it.defense }, { k: "Max HP", v: `+${it.hp}` }];
  return [{ k: "Block", v: `${Math.round(it.block * 100)}%` }, { k: "Guard", v: `+${Math.round(it.guard * 100)}%` }];
}
export function compareLines(it, eq) {
  if (!it) return [];
  if (it.slot === "weapon") return [{ k: "Attack", d: it.damage - (eq ? eq.damage : 0) }];
  if (it.slot === "armor") return [{ k: "Defense", d: it.defense - (eq ? eq.defense : 0) }, { k: "Max HP", d: it.hp - (eq ? eq.hp : 0) }];
  return [{ k: "Block", d: Math.round((it.block - (eq ? eq.block : 0)) * 100), pct: true }, { k: "Guard", d: Math.round((it.guard - (eq ? eq.guard : 0)) * 100), pct: true }];
}
/** Gold given instead of an item (salvage, or a duplicate). */
export const salvageValue = (it) => (it ? [20, 45, 90, 160][RARITIES[it.rarity].rank] + it.tier * 15 : 0);
