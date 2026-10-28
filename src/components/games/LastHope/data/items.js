/**
 * Last Hope — item catalogue.
 *
 * cat: resource | food | medical | tool | weapon | ammo | armor | key | misc
 * stack: max per inventory slot (1 = unstackable, durability items are 1).
 *
 * Weapons / tools carry a `w` block read by engine/combat.js:
 *   kind      melee | bow | gun
 *   dmg       base damage per hit
 *   cd        seconds between attacks
 *   hit       seconds from swing start to the hit moment (melee) / release
 *   range     reach in metres (melee) or max flight distance (ranged)
 *   arc       melee cone, degrees
 *   stam      stamina per swing
 *   stagger   0..1 chance-ish strength used against zombie poise
 *   gather    yield multiplier per node kind: tree / rock / scrap / bush
 *   ammo      ranged ammo item id
 *   anim      animation set the renderer plays
 */
export const ITEMS = {
  /* ------------------------------------------------------------ resources */
  wood: { name: "Wood", cat: "resource", stack: 50, desc: "Split logs and branches. The backbone of every shelter." },
  stone: { name: "Stone", cat: "resource", stack: 50, desc: "Fist-sized rocks. Tools, fire pits and stone walls." },
  fiber: { name: "Plant Fiber", cat: "resource", stack: 50, desc: "Tough stems from bushes. Twisted into rope and bindings." },
  metal: { name: "Scrap Metal", cat: "resource", stack: 40, desc: "Bent sheet steel and bolts salvaged from wrecks and machines." },
  cloth: { name: "Cloth", cat: "resource", stack: 30, desc: "Torn fabric. Bandages, padding and packs." },
  rope: { name: "Rope", cat: "resource", stack: 20, desc: "Braided fiber cord. Lashings for bows, doors and armor." },
  parts: { name: "Mechanical Parts", cat: "resource", stack: 20, desc: "Springs, gears and pins pulled from machinery. Needed for firearms." },
  chemicals: { name: "Chemicals", cat: "resource", stack: 20, desc: "Solvents and powders. Medicine, antidotes and ammunition." },

  /* ------------------------------------------------------------ food & water */
  berries: { name: "Wild Berries", cat: "food", stack: 20, food: 8, water: 4, desc: "A handful of tart forest berries." },
  mushroom: { name: "Forest Mushroom", cat: "food", stack: 20, food: 10, desc: "Earthy and filling. Best eaten fresh." },
  raw_meat: { name: "Raw Meat", cat: "food", stack: 10, food: 10, hp: -6, desc: "Fresh game meat. Cook it at a campfire — raw meat makes you sick." },
  cooked_meat: { name: "Cooked Meat", cat: "food", stack: 10, food: 38, hp: 4, desc: "Fire-roasted venison. Hearty and safe." },
  canned_food: { name: "Canned Beans", cat: "food", stack: 10, food: 32, water: 4, desc: "Pre-collapse rations. Still good, somehow." },
  energy_bar: { name: "Energy Bar", cat: "food", stack: 10, food: 18, stam: 40, desc: "Compact calories. Restores stamina too." },
  dirty_water: { name: "Dirty Water", cat: "food", stack: 5, water: 18, hp: -5, returns: "empty_bottle", desc: "Murky pond water. Boil it at a campfire before drinking." },
  water_bottle: { name: "Clean Water", cat: "food", stack: 5, water: 40, returns: "empty_bottle", desc: "A bottle of boiled, safe water." },
  soda: { name: "Flat Soda", cat: "food", stack: 10, water: 22, food: 4, desc: "Warm and flat, but wet." },
  empty_bottle: { name: "Empty Bottle", cat: "misc", stack: 10, desc: "Fill it at a pond or well." },

  /* ------------------------------------------------------------ medical */
  bandage: { name: "Bandage", cat: "medical", stack: 10, heal: 22, desc: "Clean cloth strips. Restores 22 health." },
  medkit: { name: "Medkit", cat: "medical", stack: 5, heal: 65, cure: true, desc: "Field surgery kit. Restores 65 health and cures poison." },
  painkillers: { name: "Painkillers", cat: "medical", stack: 10, heal: 35, desc: "Restores 35 health." },
  antidote: { name: "Antidote", cat: "medical", stack: 5, heal: 10, cure: true, desc: "Neutralises toxic poisoning." },

  /* ------------------------------------------------------------ tools */
  stone_axe: { name: "Stone Axe", cat: "tool", stack: 1, dur: 90, w: { kind: "melee", dmg: 13, cd: 0.78, hit: 0.32, range: 1.7, arc: 90, stam: 7, stagger: 0.35, gather: { tree: 3, rock: 0.5, scrap: 0.5, bush: 1 }, anim: "chop" }, desc: "Fells trees three times faster than bare hands. Doubles as a weapon." },
  stone_pickaxe: { name: "Stone Pickaxe", cat: "tool", stack: 1, dur: 90, w: { kind: "melee", dmg: 12, cd: 0.82, hit: 0.34, range: 1.7, arc: 80, stam: 7, stagger: 0.35, gather: { tree: 0.5, rock: 3, scrap: 2, bush: 1 }, anim: "chop" }, desc: "Breaks boulders and pries metal from wrecks." },
  iron_axe: { name: "Iron Axe", cat: "tool", stack: 1, dur: 200, w: { kind: "melee", dmg: 24, cd: 0.74, hit: 0.3, range: 1.8, arc: 95, stam: 7, stagger: 0.55, gather: { tree: 5, rock: 0.7, scrap: 0.7, bush: 1 }, anim: "chop" }, desc: "A forged steel head. Chops fast and hits hard." },
  iron_pickaxe: { name: "Iron Pickaxe", cat: "tool", stack: 1, dur: 200, w: { kind: "melee", dmg: 20, cd: 0.78, hit: 0.32, range: 1.8, arc: 85, stam: 7, stagger: 0.5, gather: { tree: 0.7, rock: 5, scrap: 4, bush: 1 }, anim: "chop" }, desc: "Rips stone and steel apart." },

  /* ------------------------------------------------------------ weapons */
  wooden_club: { name: "Wooden Club", cat: "weapon", stack: 1, dur: 70, w: { kind: "melee", dmg: 15, cd: 0.7, hit: 0.28, range: 1.7, arc: 100, stam: 8, stagger: 0.6, gather: { tree: 1, rock: 0.5, scrap: 0.5, bush: 1 }, anim: "swing" }, desc: "A heavy knotted branch. Staggers walkers." },
  wooden_spear: { name: "Wooden Spear", cat: "weapon", stack: 1, dur: 80, w: { kind: "melee", dmg: 18, cd: 0.8, hit: 0.3, range: 2.5, arc: 40, stam: 7, stagger: 0.3, gather: { tree: 0.5, rock: 0.3, scrap: 0.3, bush: 1 }, anim: "thrust" }, desc: "Long reach — keep the dead at arm's length and then some." },
  crowbar: { name: "Crowbar", cat: "weapon", stack: 1, dur: 160, w: { kind: "melee", dmg: 20, cd: 0.66, hit: 0.26, range: 1.75, arc: 100, stam: 7, stagger: 0.6, gather: { tree: 0.8, rock: 1, scrap: 3, bush: 1 }, anim: "swing" }, desc: "Solid steel. Great for scrap salvage and skulls alike." },
  machete: { name: "Machete", cat: "weapon", stack: 1, dur: 140, w: { kind: "melee", dmg: 27, cd: 0.56, hit: 0.22, range: 1.8, arc: 115, stam: 6, stagger: 0.4, gather: { tree: 1.5, rock: 0.3, scrap: 0.5, bush: 2 }, anim: "swing" }, desc: "Fast, wide cuts. Clears bushes in a stroke." },
  fire_axe: { name: "Fire Axe", cat: "weapon", stack: 1, dur: 180, w: { kind: "melee", dmg: 36, cd: 0.92, hit: 0.38, range: 1.9, arc: 100, stam: 11, stagger: 0.85, gather: { tree: 4, rock: 0.7, scrap: 1, bush: 1 }, anim: "heavy" }, desc: "A firefighter's axe. Slow, brutal, staggers almost anything." },
  bow: { name: "Hunting Bow", cat: "weapon", stack: 1, dur: 120, w: { kind: "bow", dmg: 30, cd: 0.95, hit: 0.35, range: 30, speed: 34, stam: 4, stagger: 0.35, ammo: "arrow", anim: "bow" }, desc: "Silent ranged weapon. Fires arrows; zombies 25 m away won't hear it." },
  pistol: { name: "9mm Pistol", cat: "weapon", stack: 1, dur: 260, w: { kind: "gun", dmg: 34, cd: 0.36, hit: 0.04, range: 34, speed: 90, stam: 0, stagger: 0.5, ammo: "pistol_ammo", noise: 26, anim: "pistol" }, desc: "Loud and precise. Every shot brings company." },
  rifle: { name: "Combat Rifle", cat: "weapon", stack: 1, dur: 320, w: { kind: "gun", dmg: 58, cd: 0.5, hit: 0.04, range: 42, speed: 120, stam: 0, stagger: 0.9, ammo: "rifle_ammo", noise: 34, pierce: 2, anim: "rifle" }, desc: "Military issue. Rounds punch through two zombies." },

  /* ------------------------------------------------------------ ammo */
  arrow: { name: "Arrow", cat: "ammo", stack: 40, desc: "Stone-tipped arrow. Often recoverable — not today." },
  pistol_ammo: { name: "9mm Rounds", cat: "ammo", stack: 60, desc: "Pistol ammunition." },
  rifle_ammo: { name: "Rifle Rounds", cat: "ammo", stack: 60, desc: "7.62 mm rifle ammunition." },

  /* ------------------------------------------------------------ armor (def = damage soak points) */
  padded_hood: { name: "Padded Hood", cat: "armor", slot: "head", stack: 1, dur: 80, def: 4, desc: "Layered cloth. Better than nothing." },
  hard_hat: { name: "Hard Hat", cat: "armor", slot: "head", stack: 1, dur: 140, def: 8, desc: "Construction helmet from the yard." },
  scrap_helmet: { name: "Scrap Helmet", cat: "armor", slot: "head", stack: 1, dur: 200, def: 11, desc: "Riveted sheet metal. Ugly. Effective." },
  riot_helmet: { name: "Riot Helmet", cat: "armor", slot: "head", stack: 1, dur: 280, def: 15, desc: "Police issue, visor cracked." },
  padded_vest: { name: "Padded Vest", cat: "armor", slot: "body", stack: 1, dur: 110, def: 9, desc: "Quilted cloth and rope. Softens bites and blows." },
  scrap_armor: { name: "Scrap Armor", cat: "armor", slot: "body", stack: 1, dur: 240, def: 18, desc: "Metal plates strapped over padding." },
  military_vest: { name: "Military Vest", cat: "armor", slot: "body", stack: 1, dur: 360, def: 26, desc: "Ceramic-plated tactical vest from the bunker armory." },
  cloth_pants: { name: "Work Trousers", cat: "armor", slot: "legs", stack: 1, dur: 100, def: 5, desc: "Reinforced knees and double stitching." },
  combat_pants: { name: "Combat Trousers", cat: "armor", slot: "legs", stack: 1, dur: 240, def: 10, desc: "Military trousers with knee guards." },
  work_boots: { name: "Work Boots", cat: "armor", slot: "feet", stack: 1, dur: 160, def: 4, desc: "Steel-toed boots." },
  small_backpack: { name: "Canvas Pack", cat: "armor", slot: "pack", stack: 1, dur: 0, slots: 6, desc: "Six extra inventory slots." },
  hiking_backpack: { name: "Hiking Backpack", cat: "armor", slot: "pack", stack: 1, dur: 0, slots: 12, desc: "Twelve extra inventory slots." },

  /* ------------------------------------------------------------ keys & quest items */
  survivor_map: { name: "Survivor's Map", cat: "key", stack: 1, desc: "A hand-drawn map with a route to the Industrial Yard circled in red." },
  bunker_card: { name: "Bunker Access Card", cat: "key", stack: 1, desc: "Magnetic card stamped 'SITE 9 — SUBLEVEL ACCESS'." },
  security_card: { name: "Security Keycard", cat: "key", stack: 1, desc: "Red security clearance. Opens the bunker armory." },
  gun_schematic: { name: "Gunsmith Notes", cat: "key", stack: 1, desc: "Annotated diagrams for assembling a 9mm pistol at an upgraded workbench." },
};

for (const [id, it] of Object.entries(ITEMS)) it.id = id;

export const EQUIP_SLOTS = ["hand", "head", "body", "legs", "feet", "pack"];
export const SLOT_NAMES = { hand: "Weapon", head: "Head", body: "Body", legs: "Legs", feet: "Feet", pack: "Backpack" };

export const itemName = (id) => ITEMS[id]?.name || id;
export const isEquippable = (id) => !!ITEMS[id] && (ITEMS[id].w || ITEMS[id].cat === "armor");
export const equipSlotOf = (id) => (ITEMS[id]?.w ? "hand" : ITEMS[id]?.slot || null);
export const isUsable = (id) => {
  const it = ITEMS[id];
  return !!it && (it.cat === "food" || it.cat === "medical");
};
export const RARITY = {
  common: ["wood", "stone", "fiber", "berries", "mushroom", "raw_meat", "dirty_water", "empty_bottle", "arrow"],
  rare: ["parts", "chemicals", "medkit", "pistol", "pistol_ammo", "hiking_backpack", "riot_helmet", "machete", "fire_axe", "scrap_armor", "antidote"],
  epic: ["rifle", "rifle_ammo", "military_vest", "combat_pants", "survivor_map", "bunker_card", "security_card", "gun_schematic"],
};
export function rarityOf(id) {
  if (RARITY.epic.includes(id)) return "epic";
  if (RARITY.rare.includes(id)) return "rare";
  return "common";
}
