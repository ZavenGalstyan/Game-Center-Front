/**
 * Dinosaur Island 3D — static game data: items, recipes, tools, dinosaur
 * stats and the five-mission campaign. Pure data + small pure helpers.
 */
import { SITES, LAKE } from "./terrain.js";

export const ITEMS = {
  wood: { name: "Wood", icon: "🪵", desc: "Branches and logs. Chop trees — an axe is much faster." },
  stone: { name: "Stone", icon: "🪨", desc: "Loose stones, or break boulders with an axe." },
  berries: { name: "Berries", icon: "🫐", desc: "Wild jungle berries. Eat to restore hunger.", use: "eat", hunger: 16 },
  meat: { name: "Meat", icon: "🍖", desc: "From a herbivore. Very filling.", use: "eat", hunger: 40, health: 6 },
  water: { name: "Water", icon: "💧", desc: "A flask of fresh water. Drink to restore thirst.", use: "drink", thirst: 34 },
  bandage: { name: "Bandage", icon: "🩹", desc: "Field dressing. Restores health.", use: "heal", health: 35 },
  battery: { name: "Radio battery", icon: "🔋", desc: "Heavy-duty battery from the cave.", part: true },
  antenna: { name: "Antenna", icon: "📡", desc: "Salvaged from the crashed plane.", part: true },
  circuit: { name: "Circuit board", icon: "💾", desc: "Transmitter board from the station lab.", part: true },
};
export const ITEM_ORDER = ["wood", "stone", "berries", "meat", "water", "bandage", "battery", "antenna", "circuit"];
export const MAX_WATER = 6;

export const TOOLS = {
  hands: { name: "Hands", icon: "✊", key: "1", dmg: 6, reach: 1.9, chop: 1, mine: 0, cd: 0.5, cost: 4 },
  axe: { name: "Stone Axe", icon: "🪓", key: "2", dmg: 14, reach: 2.3, chop: 3, mine: 1, cd: 0.55, cost: 6 },
  spear: { name: "Spear", icon: "🔱", key: "3", dmg: 30, reach: 3.3, chop: 1, mine: 0, cd: 0.62, cost: 7 },
};
export const TOOL_ORDER = ["hands", "axe", "spear"];

export const RECIPES = [
  { id: "axe", name: "Stone Axe", icon: "🪓", cost: { wood: 3, stone: 2 }, desc: "Chops trees 3× faster and breaks boulders for stone." },
  { id: "spear", name: "Spear", icon: "🔱", cost: { wood: 4, stone: 1 }, desc: "Long reach, heavy damage. Keeps predators at bay." },
  { id: "campfire", name: "Campfire", icon: "🔥", cost: { wood: 5, stone: 3 }, desc: "Placed where you stand. Light, warmth, a safe rest point — predators keep away." },
];

export const STATS = {
  walk: 5.4,
  sprint: 9.4,
  crouch: 2.5,
  jump: 8.2,
  gravity: 24,
  radius: 0.42,
  hungerRate: 0.2, // per second
  thirstRate: 0.26,
  starveDmg: 2.2,
  sprintCost: 19,
  staminaRegen: 16,
  jumpCost: 9,
};
export const CAMPFIRE_SAFE = 11;
export const DAY_LENGTH = 400; // seconds for a full day at normal speed

/** Dinosaur archetypes. Ranges are in world units (≈ metres). */
export const DINOS = {
  herb: {
    name: "Stegosaur",
    hp: 60,
    radius: 1.0,
    walk: 1.7,
    run: 7.4,
    detect: 9,
    predator: false,
    meat: 2,
  },
  raptor: {
    name: "Raptor",
    hp: 46,
    radius: 0.7,
    walk: 2.8,
    run: 8.4,
    detect: 21,
    lose: 44,
    leash: 80,
    predator: true,
    dmg: 11,
    range: 2.0,
    windup: 0.32,
    cd: 1.15,
  },
  trex: {
    name: "T-Rex",
    hp: 260,
    radius: 1.9,
    walk: 2.3,
    run: 7.0,
    detect: 38,
    lose: 70,
    leash: 120,
    predator: true,
    dmg: 34,
    range: 4.6,
    windup: 0.62,
    cd: 2.1,
  },
};

/** Where things live. Each spawn: kind, home, roaming radius, count. */
export const SPAWNS = [
  { kind: "herb", x: -18, z: 72, r: 26, n: 4 },
  { kind: "herb", x: 60, z: 110, r: 22, n: 3 },
  { kind: "raptor", x: 34, z: 26, r: 22, n: 2 },
  { kind: "raptor", x: -112, z: -30, r: 26, n: 2 },
  { kind: "raptor", x: 132, z: -78, r: 22, n: 2 },
  { kind: "trex", x: 24, z: -52, r: 46, n: 1 },
];

export const POI = {
  wreck: { name: "Shipwreck", ...SITES.wreck },
  lake: { name: "Crystal Lake", x: LAKE.x, z: LAKE.z },
  station: { name: "Research Station", ...SITES.station },
  cave: { name: "Echo Cave", ...SITES.cave },
  crash: { name: "Crashed Plane", ...SITES.crash },
};

/**
 * Missions. Each objective has `check(sim)` → current count (compared to
 * `n`, default 1) and an optional `target(sim)` for the HUD compass / beacon.
 * Objectives with `gate` only start counting after every earlier one is done.
 * Completion latches, so spending resources never un-completes a step.
 */
export const MISSIONS = [
  {
    id: 1,
    title: "Washed Ashore",
    brief: "Explore the beach around the shipwreck and gather what supplies you can.",
    objectives: [
      { id: "wreck", text: "Explore the shipwreck", check: (s) => (s.flags.wreck ? 1 : 0), target: () => POI.wreck },
      { id: "crates", text: "Search supply crates", n: 3, check: (s) => s.tally.crates, target: (s) => s.nearestCrate() },
      { id: "berries", text: "Pick wild berries", n: 4, check: (s) => s.tally.berries, target: (s) => s.nearestBush() },
    ],
  },
  {
    id: 2,
    title: "Tools of Survival",
    brief: "Gather wood and stone, then craft a stone axe from your inventory (Tab).",
    objectives: [
      { id: "wood", text: "Gather wood", n: 6, check: (s) => s.tally.wood, target: (s) => s.nearestWood() },
      { id: "stone", text: "Gather stone", n: 4, check: (s) => s.tally.stone, target: (s) => s.nearestStone() },
      { id: "axe", text: "Craft a stone axe", gate: true, check: (s) => (s.tools.axe ? 1 : 0) },
    ],
  },
  {
    id: 3,
    title: "Fire and Water",
    brief: "Find fresh water inland and set up camp before night falls.",
    objectives: [
      { id: "lake", text: "Find fresh water", check: (s) => (s.flags.foundWater ? 1 : 0), target: () => POI.lake },
      { id: "water", text: "Fill water flasks", n: 2, check: (s) => s.tally.water, target: () => POI.lake },
      { id: "fire", text: "Build a campfire", check: (s) => (s.campfires.length ? 1 : 0) },
    ],
  },
  {
    id: 4,
    title: "Into the Unknown",
    brief: "Arm yourself and reach the abandoned research station in the east. Predators hunt the jungle — crouch to stay hidden.",
    objectives: [
      { id: "spear", text: "Craft a spear", check: (s) => (s.tools.spear ? 1 : 0) },
      { id: "station", text: "Reach the research station", check: (s) => (s.flags.station ? 1 : 0), target: () => POI.station },
    ],
  },
  {
    id: 5,
    title: "Mayday",
    brief: "The station's emergency radio is dead. Salvage three parts, repair it and call for rescue.",
    objectives: [
      { id: "battery", text: "Recover the battery in Echo Cave", check: (s) => (s.inv.battery || s.flags.radio ? 1 : 0), target: (s) => s.partTarget("battery") },
      { id: "antenna", text: "Salvage the antenna from the crashed plane", check: (s) => (s.inv.antenna || s.flags.radio ? 1 : 0), target: (s) => s.partTarget("antenna") },
      { id: "circuit", text: "Find the circuit board in the station lab", check: (s) => (s.inv.circuit || s.flags.radio ? 1 : 0), target: (s) => s.partTarget("circuit") },
      { id: "radio", text: "Repair the radio and call for rescue", gate: true, check: (s) => (s.flags.radio ? 1 : 0), target: (s) => s.radioPos },
      { id: "hold", text: "Survive until the helicopter lands", gate: true, check: (s) => (s.flags.heliLanded ? 1 : 0), target: (s) => s.helipad },
      { id: "board", text: "Board the rescue helicopter", gate: true, check: (s) => (s.flags.escaped ? 1 : 0), target: (s) => s.helipad },
    ],
  },
];
export const RESCUE_TIME = 60;

export const CONTROLS = [
  ["W A S D", "Move"],
  ["Mouse", "Look around · wheel to zoom"],
  ["Shift", "Sprint (uses stamina)"],
  ["Space", "Jump"],
  ["C", "Crouch — quieter, predators notice you later"],
  ["E", "Interact · pick up · drink · rest at a campfire"],
  ["Left click", "Use equipped tool (chop · mine · attack)"],
  ["1 / 2 / 3", "Equip hands · axe · spear"],
  ["Q / R / F", "Eat · drink a flask · apply a bandage"],
  ["Tab or I", "Inventory & crafting"],
  ["Esc", "Pause & release the mouse"],
];

export const canAfford = (inv, cost) => Object.entries(cost).every(([k, n]) => (inv[k] || 0) >= n);
