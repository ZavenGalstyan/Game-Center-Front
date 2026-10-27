/**
 * Oceanbound — items, recipes, buildable structures.
 *
 * kind: material | food | water | tool | place (placeable station/object)
 * fuel:  burn time contributed when a station uses it as fuel
 * food:  { hunger, thirst, health } applied when eaten / drunk
 * cook:  item id this becomes on a grill
 * tool:  { type, dur } — durability counts uses
 */
export const ITEMS = {
  plank: { name: "Plank", desc: "Weathered driftwood plank. The backbone of every raft.", kind: "material", stack: 30, fuel: 1 },
  plastic: { name: "Plastic", desc: "Sun-bleached plastic scraps. Light, waterproof, endlessly useful.", kind: "material", stack: 30 },
  leaf: { name: "Palm Leaf", desc: "A broad dried palm frond. Twist into rope or thatch a roof.", kind: "material", stack: 30, fuel: 0.5 },
  scrap: { name: "Scrap Metal", desc: "Rusty bits of a ship that didn't make it.", kind: "material", stack: 20 },
  rope: { name: "Rope", desc: "Braided palm fibre. Binds planks, tools and sails.", kind: "material", stack: 20 },
  stone: { name: "Stone", desc: "A smooth beach stone. Heavy enough for tools and anchors.", kind: "material", stack: 20 },
  palmwood: { name: "Palm Log", desc: "A solid length of palm trunk. Burns long and builds masts.", kind: "material", stack: 20, fuel: 2 },
  clay: { name: "Clay", desc: "Wet grey clay from the shallows. Fires into ovens and pipes.", kind: "material", stack: 20 },
  metal_ore: { name: "Metal Ore", desc: "Rust-streaked rock from the Rocky islands. Smelt it.", kind: "material", stack: 20 },
  ingot: { name: "Metal Ingot", desc: "A bar of smelted metal. The key to advanced stations.", kind: "material", stack: 20 },
  vine: { name: "Jungle Vine", desc: "Tough, springy vine found only in the jungle.", kind: "material", stack: 20 },
  bamboo: { name: "Bamboo", desc: "Hollow jungle cane — perfect for pipes and frames.", kind: "material", stack: 20, fuel: 1 },

  coconut: { name: "Coconut", desc: "Sweet water and soft flesh. A castaway classic.", kind: "food", stack: 10, food: { hunger: 8, thirst: 16, health: 0 } },
  mango: { name: "Mango", desc: "A ripe jungle mango, heavy with juice.", kind: "food", stack: 10, food: { hunger: 16, thirst: 7, health: 2 } },
  fish_raw: { name: "Raw Fish", desc: "Fresh catch. Edible raw, but much better grilled.", kind: "food", stack: 10, food: { hunger: 6, thirst: -2, health: -4 }, cook: "fish_cooked" },
  fish_cooked: { name: "Grilled Fish", desc: "Smoky, flaky and filling.", kind: "food", stack: 10, food: { hunger: 32, thirst: -1, health: 6 } },
  shark_raw: { name: "Raw Shark Meat", desc: "A hard-won slab. Cook it before you try it.", kind: "food", stack: 10, food: { hunger: 8, thirst: -3, health: -6 }, cook: "shark_cooked" },
  shark_cooked: { name: "Shark Steak", desc: "The ocean's apex, on your plate. Very filling.", kind: "food", stack: 10, food: { hunger: 48, thirst: -2, health: 12 } },
  bandage: { name: "Leaf Bandage", desc: "Palm leaves bound tight with rope. Restores health.", kind: "food", stack: 5, food: { hunger: 0, thirst: 0, health: 30 }, verb: "Apply" },

  cup_empty: { name: "Empty Cup", desc: "A plastic water cup. Fill it from the sea, purify, drink.", kind: "water", stack: 1, water: "empty" },
  cup_salt: { name: "Cup of Seawater", desc: "Salty seawater. Pour it into a purifier — don't drink it!", kind: "water", stack: 1, water: "salt" },
  cup_fresh: { name: "Cup of Fresh Water", desc: "Clean, purified water. Drink up.", kind: "water", stack: 1, water: "fresh" },

  hook: { name: "Collection Hook", desc: "Hold to charge, release to throw. Hold again to reel floating debris in.", kind: "tool", stack: 1, tool: { type: "hook", dur: 140 } },
  hammer: { name: "Building Hammer", desc: "Build, rotate, remove and repair raft structures.", kind: "tool", stack: 1, tool: { type: "hammer", dur: 0 } },
  axe: { name: "Stone Axe", desc: "Chops trees and bamboo, cracks ore boulders.", kind: "tool", stack: 1, tool: { type: "axe", dur: 70 } },
  rod: { name: "Fishing Rod", desc: "Hold to charge a cast. Click when the bobber dips.", kind: "tool", stack: 1, tool: { type: "rod", dur: 40 } },
  spear: { name: "Spear", desc: "A scrap-tipped spear. Click to thrust — sharks hate it.", kind: "tool", stack: 1, tool: { type: "spear", dur: 60 } },

  chest: { name: "Storage Chest", desc: "Twenty slots of safe storage on your raft.", kind: "place", stack: 5 },
  purifier: { name: "Simple Purifier", desc: "Boils seawater into fresh water. Burns a little fuel.", kind: "place", stack: 5 },
  purifier2: { name: "Improved Purifier", desc: "Bamboo-and-metal still. Faster, two cups per batch, no fuel.", kind: "place", stack: 5 },
  grill: { name: "Basic Grill", desc: "A scrap grate over a fire. Cooks one item at a time.", kind: "place", stack: 5 },
  grill2: { name: "Advanced Grill", desc: "Stone-lined metal grill. Cooks two items, faster, less fuel.", kind: "place", stack: 5 },
  smelter: { name: "Smelter", desc: "A clay furnace that turns metal ore into ingots.", kind: "place", stack: 5 },
  net: { name: "Collection Net", desc: "Place on a raft edge. Catches debris the raft drifts through.", kind: "place", stack: 5 },
  trap: { name: "Fish Trap", desc: "Place on a raft edge. Slowly fills with fish.", kind: "place", stack: 5 },
  sail: { name: "Sail", desc: "Catch the wind. Raise it to sail toward where you look.", kind: "place", stack: 3 },
  anchor: { name: "Anchor", desc: "Drop it to hold the raft in place.", kind: "place", stack: 2 },
};

export const itemName = (id) => ITEMS[id]?.name || id;

/** recipe: out item, n, cost, cat, unlocked (default) */
export const RECIPES = [
  { id: "rope", out: "rope", n: 1, cost: { leaf: 2 }, cat: "materials", start: true },
  { id: "hammer", out: "hammer", n: 1, cost: { plank: 4, rope: 1 }, cat: "tools", start: true },
  { id: "cup_empty", out: "cup_empty", n: 1, cost: { plastic: 4 }, cat: "survival", start: true },
  { id: "rod", out: "rod", n: 1, cost: { plank: 4, rope: 3 }, cat: "tools", start: true },
  { id: "spear", out: "spear", n: 1, cost: { plank: 4, scrap: 3, rope: 1 }, cat: "tools", start: true },
  { id: "axe", out: "axe", n: 1, cost: { plank: 3, stone: 3, rope: 2 }, cat: "tools", start: true },
  { id: "hook", out: "hook", n: 1, cost: { plank: 2, plastic: 4, rope: 2 }, cat: "tools", start: true },
  { id: "bandage", out: "bandage", n: 1, cost: { leaf: 3, rope: 1 }, cat: "survival", start: true },
  { id: "purifier", out: "purifier", n: 1, cost: { plank: 5, plastic: 4, leaf: 2 }, cat: "stations", start: true },
  { id: "grill", out: "grill", n: 1, cost: { plank: 5, scrap: 2, leaf: 2 }, cat: "stations", start: true },
  { id: "chest", out: "chest", n: 1, cost: { plank: 8, plastic: 2 }, cat: "stations" },
  { id: "net", out: "net", n: 1, cost: { plank: 5, rope: 4, scrap: 2 }, cat: "stations" },
  { id: "trap", out: "trap", n: 1, cost: { plank: 4, rope: 3 }, cat: "stations" },
  { id: "sail", out: "sail", n: 1, cost: { plank: 8, rope: 4, leaf: 6, palmwood: 2 }, cat: "navigation" },
  { id: "anchor", out: "anchor", n: 1, cost: { stone: 6, rope: 4, plank: 2 }, cat: "navigation" },
  { id: "smelter", out: "smelter", n: 1, cost: { clay: 8, stone: 6, plank: 2 }, cat: "stations" },
  { id: "purifier2", out: "purifier2", n: 1, cost: { ingot: 2, bamboo: 4, plastic: 4 }, cat: "stations" },
  { id: "grill2", out: "grill2", n: 1, cost: { ingot: 3, stone: 4, vine: 2 }, cat: "stations" },
];
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const RECIPE_CATS = [
  { id: "tools", name: "Tools" },
  { id: "survival", name: "Survival" },
  { id: "stations", name: "Stations" },
  { id: "navigation", name: "Navigation" },
  { id: "materials", name: "Materials" },
];

/**
 * Building pieces placed with the hammer (paid on placement).
 * slot: cell (on a foundation / level 1 above one) | edge (between cells)
 */
export const PIECES = {
  foundation: { name: "Foundation", desc: "Expands the raft. Must touch another foundation.", slot: "cell", level: 0, cost: { plank: 2, plastic: 2 }, start: true },
  wall: { name: "Wall", desc: "Plank wall on a foundation edge.", slot: "edge", level: 0, cost: { plank: 3, rope: 1 }, start: true },
  railing: { name: "Railing", desc: "Low rail on an edge — on the deck or the roof.", slot: "edge", level: 0, cost: { plank: 2, rope: 1 }, start: true },
  window: { name: "Window Wall", desc: "A wall with an opening for the sea breeze.", slot: "edge", level: 0, cost: { plank: 3, rope: 1, plastic: 1 } },
  door: { name: "Door", desc: "A wall with a door. Press E to open or close it.", slot: "edge", level: 0, cost: { plank: 4, rope: 1, scrap: 1 } },
  stairs: { name: "Stairs", desc: "Climb up to the roof level.", slot: "cell", level: 0, cost: { plank: 4, rope: 2 } },
  roof: { name: "Roof / Upper Floor", desc: "Thatched deck over a foundation. Needs a wall below it or a supported neighbour.", slot: "cell", level: 1, cost: { plank: 3, leaf: 4 } },
};
export const PIECE_ORDER = ["foundation", "wall", "railing", "window", "door", "stairs", "roof"];
/** placeable items: where they go */
export const PLACEABLE = {
  chest: { slot: "cell" },
  purifier: { slot: "cell" },
  purifier2: { slot: "cell" },
  grill: { slot: "cell" },
  grill2: { slot: "cell" },
  smelter: { slot: "cell" },
  sail: { slot: "cell" },
  anchor: { slot: "cell", max: 1 },
  net: { slot: "edge", outer: true },
  trap: { slot: "edge", outer: true },
};
export const REPAIR_COST = { plank: 1, plastic: 1 };

/** station tuning */
export const STATIONS = {
  purifier: { time: 28, cups: 1, fuel: 1 },
  purifier2: { time: 16, cups: 2, fuel: 0 },
  grill: { time: 20, slots: 1, fuel: 1 },
  grill2: { time: 12, slots: 2, fuel: 0.5 },
  smelter: { time: 16, slots: 1, fuel: 1 },
};
export const FUELS = ["leaf", "plank", "bamboo", "palmwood"];

/** what a floating supply crate / barrel can hold */
export const CRATE_LOOT = [
  ["plank", 2, 4, 1],
  ["plastic", 2, 4, 1],
  ["leaf", 1, 3, 0.7],
  ["scrap", 1, 3, 0.6],
  ["rope", 1, 2, 0.35],
  ["coconut", 1, 2, 0.35],
  ["stone", 1, 2, 0.3],
  ["cup_empty", 1, 1, 0.08],
];
