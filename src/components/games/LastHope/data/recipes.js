/**
 * Last Hope — crafting recipes.
 *
 * station  null (anywhere) | "campfire" | "workbench" | "workbench2"
 *          (an upgraded workbench also serves "workbench" recipes)
 * level    player level required
 * unlock   optional flag that must be in G.flags (granted by missions / items)
 * cat      tab in the crafting panel
 */
export const RECIPES = [
  // ---------------------------------------------------------------- basics
  { id: "rope", out: "rope", n: 1, cost: { fiber: 4 }, station: null, level: 1, cat: "materials" },
  { id: "bandage", out: "bandage", n: 1, cost: { cloth: 2 }, station: null, level: 1, cat: "medical" },
  { id: "rough_bandage", out: "bandage", n: 1, cost: { fiber: 5 }, station: null, level: 2, cat: "medical", label: "Bandage (fiber)" },
  { id: "stone_axe", out: "stone_axe", n: 1, cost: { wood: 4, stone: 3, fiber: 2 }, station: null, level: 1, cat: "tools" },
  { id: "stone_pickaxe", out: "stone_pickaxe", n: 1, cost: { wood: 4, stone: 4, fiber: 2 }, station: null, level: 1, cat: "tools" },
  { id: "wooden_club", out: "wooden_club", n: 1, cost: { wood: 6, fiber: 1 }, station: null, level: 1, cat: "weapons" },
  { id: "wooden_spear", out: "wooden_spear", n: 1, cost: { wood: 5, fiber: 3 }, station: null, level: 2, cat: "weapons" },
  { id: "padded_hood", out: "padded_hood", n: 1, cost: { cloth: 4, fiber: 2 }, station: null, level: 2, cat: "armor" },

  // ---------------------------------------------------------------- campfire
  { id: "cook_meat", out: "cooked_meat", n: 1, cost: { raw_meat: 1 }, station: "campfire", level: 1, cat: "food", label: "Cook Meat" },
  { id: "boil_water", out: "water_bottle", n: 1, cost: { dirty_water: 1 }, station: "campfire", level: 1, cat: "food", label: "Boil Water" },
  { id: "roast_mushroom", out: "canned_food", n: 1, cost: { mushroom: 3, berries: 2 }, station: "campfire", level: 3, cat: "food", label: "Forager's Stew (as rations)" },

  // ---------------------------------------------------------------- workbench
  { id: "bow", out: "bow", n: 1, cost: { wood: 6, rope: 2, fiber: 2 }, station: "workbench", level: 3, cat: "weapons" },
  { id: "arrows", out: "arrow", n: 5, cost: { wood: 2, stone: 1, fiber: 1 }, station: "workbench", level: 3, cat: "ammo" },
  { id: "padded_vest", out: "padded_vest", n: 1, cost: { cloth: 6, rope: 2 }, station: "workbench", level: 3, cat: "armor" },
  { id: "cloth_pants", out: "cloth_pants", n: 1, cost: { cloth: 5, rope: 1 }, station: "workbench", level: 3, cat: "armor" },
  { id: "small_backpack", out: "small_backpack", n: 1, cost: { cloth: 6, rope: 3 }, station: "workbench", level: 2, cat: "armor" },
  { id: "machete", out: "machete", n: 1, cost: { metal: 4, wood: 2, cloth: 1 }, station: "workbench", level: 5, cat: "weapons" },
  { id: "antidote", out: "antidote", n: 1, cost: { chemicals: 1, berries: 3 }, station: "workbench", level: 5, cat: "medical" },

  // ---------------------------------------------------------------- workbench mk II
  { id: "iron_axe", out: "iron_axe", n: 1, cost: { metal: 5, wood: 3, rope: 1 }, station: "workbench2", level: 5, cat: "tools" },
  { id: "iron_pickaxe", out: "iron_pickaxe", n: 1, cost: { metal: 5, wood: 3, rope: 1 }, station: "workbench2", level: 5, cat: "tools" },
  { id: "scrap_helmet", out: "scrap_helmet", n: 1, cost: { metal: 5, cloth: 2 }, station: "workbench2", level: 6, cat: "armor" },
  { id: "scrap_armor", out: "scrap_armor", n: 1, cost: { metal: 9, cloth: 3, rope: 2 }, station: "workbench2", level: 6, cat: "armor" },
  { id: "medkit", out: "medkit", n: 1, cost: { bandage: 2, chemicals: 1 }, station: "workbench2", level: 6, cat: "medical" },
  { id: "pistol", out: "pistol", n: 1, cost: { metal: 8, parts: 4 }, station: "workbench2", level: 7, unlock: "gunsmith", cat: "weapons" },
  { id: "pistol_ammo", out: "pistol_ammo", n: 8, cost: { metal: 1, chemicals: 1 }, station: "workbench2", level: 7, unlock: "gunsmith", cat: "ammo" },
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const CRAFT_TABS = [
  ["tools", "Tools"],
  ["weapons", "Weapons"],
  ["ammo", "Ammo"],
  ["armor", "Armor"],
  ["medical", "Medical"],
  ["food", "Cooking"],
  ["materials", "Materials"],
];
export const STATION_NAMES = { campfire: "Campfire", workbench: "Workbench", workbench2: "Workbench Mk II" };
