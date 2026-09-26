/**
 * Farm Life — centralized item registry (spec: "one centralized item
 * registry... do not hardcode item behavior independently everywhere").
 *
 * Every item the player can hold — tool, seed, crop, animal product — is
 * defined exactly once here. Inventory, hotbar, the shop/shipping panels and
 * the held-tool renderer all look items up by id through this table.
 *
 * `icon` is a small shape+color descriptor (see hud/ItemIcon.jsx) so icons
 * render crisp at any size with no image assets, matching Stonewild's
 * ITEMS icon convention.
 */

const icon = (shape, color, accent) => ({ shape, color, accent });

export const ITEM = {
  HOE: "hoe",
  WATERING_CAN: "wateringCan",
  AXE: "axe",
  PICKAXE: "pickaxe",
  SHOVEL: "shovel",

  WHEAT_SEED: "wheatSeed",
  CARROT_SEED: "carrotSeed",
  POTATO_SEED: "potatoSeed",

  WHEAT: "wheat",
  CARROT: "carrot",
  POTATO: "potato",

  EGG: "egg",
  CHICKEN_FEED: "chickenFeed",
};

export const ITEMS = {
  [ITEM.HOE]: {
    id: ITEM.HOE, name: "Hoe", category: "tool", stackSize: 1,
    description: "Tills grass and dirt into planting soil.",
    icon: icon("hoe", "#8a5a34", "#c9c9c9"),
  },
  [ITEM.WATERING_CAN]: {
    id: ITEM.WATERING_CAN, name: "Watering Can", category: "tool", stackSize: 1,
    description: "Waters planted crops. Refill at the well or pond.",
    icon: icon("wateringCan", "#4f7fae", "#dfe8f2"),
  },
  [ITEM.AXE]: {
    id: ITEM.AXE, name: "Axe", category: "tool", stackSize: 1,
    description: "Chops trees for wood.",
    icon: icon("axe", "#8a5a34", "#b7bcc4"),
  },
  [ITEM.PICKAXE]: {
    id: ITEM.PICKAXE, name: "Pickaxe", category: "tool", stackSize: 1,
    description: "Breaks rocks for stone.",
    icon: icon("pickaxe", "#8a5a34", "#b7bcc4"),
  },
  [ITEM.SHOVEL]: {
    id: ITEM.SHOVEL, name: "Shovel", category: "tool", stackSize: 1,
    description: "Digs soil and clears rubble.",
    icon: icon("shovel", "#8a5a34", "#b7bcc4"),
  },

  [ITEM.WHEAT_SEED]: {
    id: ITEM.WHEAT_SEED, name: "Wheat Seeds", category: "seed", stackSize: 99,
    cropId: ITEM.WHEAT, buyPrice: 6,
    icon: icon("seedBag", "#d4a94a", "#8a5a34"),
  },
  [ITEM.CARROT_SEED]: {
    id: ITEM.CARROT_SEED, name: "Carrot Seeds", category: "seed", stackSize: 99,
    cropId: ITEM.CARROT, buyPrice: 8,
    icon: icon("seedBag", "#e07a3a", "#8a5a34"),
  },
  [ITEM.POTATO_SEED]: {
    id: ITEM.POTATO_SEED, name: "Potato Seeds", category: "seed", stackSize: 99,
    cropId: ITEM.POTATO, buyPrice: 10,
    icon: icon("seedBag", "#c9a877", "#8a5a34"),
  },

  [ITEM.WHEAT]: {
    id: ITEM.WHEAT, name: "Wheat", category: "crop", stackSize: 99,
    sellPrice: 12,
    icon: icon("wheat", "#e8c752", "#b98a2e"),
  },
  [ITEM.CARROT]: {
    id: ITEM.CARROT, name: "Carrot", category: "crop", stackSize: 99,
    sellPrice: 16,
    icon: icon("carrot", "#e8752e", "#5f9c4a"),
  },
  [ITEM.POTATO]: {
    id: ITEM.POTATO, name: "Potato", category: "crop", stackSize: 99,
    sellPrice: 18,
    icon: icon("potato", "#c99a5c", "#8a6a3f"),
  },

  [ITEM.EGG]: {
    id: ITEM.EGG, name: "Egg", category: "animalProduct", stackSize: 99,
    sellPrice: 14,
    icon: icon("egg", "#f5efd8", "#e0d6ad"),
  },
  [ITEM.CHICKEN_FEED]: {
    id: ITEM.CHICKEN_FEED, name: "Chicken Feed", category: "material", stackSize: 99,
    buyPrice: 3,
    icon: icon("feed", "#d4b877", "#8a6a3f"),
  },
};

export function getItem(id) {
  return ITEMS[id] || null;
}

export function stackLimitFor(id) {
  const def = getItem(id);
  return def ? def.stackSize : 1;
}

export function isTool(id) {
  const def = getItem(id);
  return Boolean(def && def.category === "tool");
}

export const STARTER_TOOLS = [ITEM.HOE, ITEM.WATERING_CAN, ITEM.AXE, ITEM.PICKAXE, ITEM.SHOVEL];
