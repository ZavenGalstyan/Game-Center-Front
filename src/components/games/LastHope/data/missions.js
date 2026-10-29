/**
 * Last Hope — the objective chain. The tracker shows the first three
 * unfinished objectives in order; any of them completes the moment its
 * condition holds (counters are cumulative from the start of the run, so
 * work done early still counts).
 *
 * Condition kinds (engine/missions.js):
 *   gather  item n     resources harvested / picked up from the world
 *   craft   item n     items crafted
 *   build   piece n    structures placed
 *   upgrade piece tier any structure of that kind reached the tier
 *   kill    type n     zombies of a type (or "any") killed
 *   boss    id         boss defeated
 *   visit   loc        location entered
 *   loot    loc n      containers opened in a location
 *   have    item       item currently in inventory / equipment
 *   eat     n          food or drink consumed
 *   equip   slot       anything equipped in an armor slot
 *   flag    name       a world flag (door opened, power restored, raid survived)
 *   level   n          player level
 *
 * Rewards: xp, items {id: n}, unlock (location ids), flags.
 */
export const MISSIONS = [
  { id: "m1", title: "First Light", desc: "Gather 10 wood. Pick up fallen branches or punch a tree.", cond: { k: "gather", item: "wood", n: 10 }, xp: 25 },
  { id: "m2", title: "Rock Bottom", desc: "Gather 8 stone from loose stones or rocks.", cond: { k: "gather", item: "stone", n: 8 }, xp: 25 },
  { id: "m3", title: "Plant Fiber", desc: "Harvest 6 plant fiber from bushes.", cond: { k: "gather", item: "fiber", n: 6 }, xp: 25 },
  { id: "m4", title: "Sharpened Stone", desc: "Craft a Stone Axe (Inventory → Crafting).", cond: { k: "craft", item: "stone_axe", n: 1 }, xp: 40 },
  { id: "m5", title: "Breaking Ground", desc: "Craft a Stone Pickaxe.", cond: { k: "craft", item: "stone_pickaxe", n: 1 }, xp: 40 },
  { id: "m6", title: "Keep the Fire", desc: "Build a Campfire in your camp (B to build).", cond: { k: "build", piece: "campfire", n: 1 }, xp: 50, items: { berries: 3 } },
  { id: "m7", title: "Sustenance", desc: "Eat or drink something.", cond: { k: "eat", n: 1 }, xp: 20 },
  { id: "m8", title: "Tools of the Trade", desc: "Build a Workbench.", cond: { k: "build", piece: "workbench", n: 1 }, xp: 60 },
  { id: "m9", title: "Timberline", desc: "Gather 40 wood in total.", cond: { k: "gather", item: "wood", n: 40 }, xp: 50 },
  { id: "m10", title: "Point Taken", desc: "Craft a Wooden Spear (needs level 2).", cond: { k: "craft", item: "wooden_spear", n: 1 }, xp: 50 },
  { id: "m11", title: "Into the Pines", desc: "Travel to Pinewood Forest from the trailhead.", cond: { k: "visit", loc: "forest" }, xp: 60 },
  { id: "m12", title: "Clear the Woods", desc: "Defeat 5 Slow Walkers.", cond: { k: "kill", type: "walker", n: 5 }, xp: 120, unlock: ["suburb"], items: { bandage: 2 } },
  { id: "m13", title: "Hunter's Instinct", desc: "Collect 2 raw meat from deer or rabbits.", cond: { k: "gather", item: "raw_meat", n: 2 }, xp: 60 },
  { id: "m14", title: "A Warm Meal", desc: "Cook meat at a campfire.", cond: { k: "craft", item: "cooked_meat", n: 1 }, xp: 60 },
  { id: "m15", title: "Clean Water", desc: "Fill a bottle at a pond or well, then boil it at a campfire.", cond: { k: "craft", item: "water_bottle", n: 1 }, xp: 60 },
  { id: "m16", title: "Field Medic", desc: "Craft 3 bandages.", cond: { k: "craft", item: "bandage", n: 3 }, xp: 50 },
  { id: "m17", title: "Safekeeping", desc: "Build a Storage Chest.", cond: { k: "build", piece: "chest", n: 1 }, xp: 60 },
  { id: "m18", title: "Four Walls", desc: "Build 6 walls around your camp.", cond: { k: "build", piece: "wall", n: 6 }, xp: 90 },
  { id: "m19", title: "Front Door", desc: "Build a door.", cond: { k: "build", piece: "door", n: 1 }, xp: 60 },
  { id: "m20", title: "Silent Hunter", desc: "Craft a Hunting Bow at the workbench (level 3).", cond: { k: "craft", item: "bow", n: 1 }, xp: 90, items: { arrow: 5 } },
  { id: "m21", title: "Quiver", desc: "Craft 10 arrows.", cond: { k: "craft", item: "arrow", n: 10 }, xp: 50 },
  { id: "m22", title: "Maple Street", desc: "Travel to the Abandoned Suburb.", cond: { k: "visit", loc: "suburb" }, xp: 100 },
  { id: "m23", title: "Scavenger", desc: "Search 8 containers in the suburb.", cond: { k: "loot", loc: "suburb", n: 8 }, xp: 120 },
  { id: "m24", title: "Fast and Dead", desc: "Defeat 3 Fast Runners.", cond: { k: "kill", type: "runner", n: 3 }, xp: 120 },
  { id: "m25", title: "The Ranger's Trail", desc: "Find the Survivor's Map in the Ranger's House on Maple Street.", cond: { k: "have", item: "survivor_map" }, xp: 150, unlock: ["industrial"] },
  { id: "m26", title: "Dressed for Trouble", desc: "Craft a Padded Vest (protective armor).", cond: { k: "craft", item: "padded_vest", n: 1 }, xp: 90 },
  { id: "m27", title: "Hold the Line", desc: "Survive a night raid on your camp.", cond: { k: "flag", name: "raid_survived" }, xp: 150, items: { canned_food: 2 } },
  { id: "m28", title: "Stone Mason", desc: "Upgrade a wall to stone.", cond: { k: "upgrade", piece: "wall", tier: 1 }, xp: 90 },
  { id: "m29", title: "Steel Yard", desc: "Travel to the Industrial Yard.", cond: { k: "visit", loc: "industrial" }, xp: 150 },
  { id: "m30", title: "Scrap Collector", desc: "Gather 20 scrap metal.", cond: { k: "gather", item: "metal", n: 20 }, xp: 120 },
  { id: "m31", title: "Metalworking", desc: "Upgrade the workbench to Mk II.", cond: { k: "upgrade", piece: "workbench", tier: 1 }, xp: 150 },
  { id: "m32", title: "Riot Control", desc: "Defeat 3 Armored Zombies.", cond: { k: "kill", type: "armored", n: 3 }, xp: 160 },
  { id: "m33", title: "Hazmat", desc: "Defeat 4 Toxic Zombies.", cond: { k: "kill", type: "toxic", n: 4 }, xp: 160, items: { antidote: 1 } },
  { id: "m34", title: "Plated", desc: "Craft Scrap Armor.", cond: { k: "craft", item: "scrap_armor", n: 1 }, xp: 150 },
  { id: "m35", title: "Alpha", desc: "Defeat the Alpha Brute at the loading dock and open the Security Safe.", cond: { k: "have", item: "bunker_card" }, xp: 400, unlock: ["bunker"], flags: ["gunsmith"] },
  { id: "m36", title: "Gunsmith", desc: "Craft a 9mm Pistol at the Workbench Mk II.", cond: { k: "craft", item: "pistol", n: 1 }, xp: 200 },
  { id: "m37", title: "SITE 9", desc: "Enter the Underground Bunker.", cond: { k: "visit", loc: "bunker" }, xp: 200 },
  { id: "m38", title: "Clearance", desc: "Find the Security Keycard in the barracks.", cond: { k: "have", item: "security_card" }, xp: 200 },
  { id: "m39", title: "Armory", desc: "Open the bunker armory.", cond: { k: "flag", name: "door_armory_door" }, xp: 200 },
  { id: "m40", title: "Power Restored", desc: "Restore power at the generator room.", cond: { k: "flag", name: "power" }, xp: 200 },
  { id: "m41", title: "Last Hope", desc: "Defeat The Warden in the containment hall.", cond: { k: "boss", id: "warden" }, xp: 800 },
];
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export const TRACKED = 3;
