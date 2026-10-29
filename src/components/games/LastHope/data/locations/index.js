/**
 * Last Hope — the five locations: metadata for the world map plus a lazy,
 * cached builder for each layout (layouts are deterministic, so building one
 * twice gives identical ids).
 */
import { buildCamp } from "./camp.js";
import { buildForest } from "./forest.js";
import { buildSuburb } from "./suburb.js";
import { buildIndustrial } from "./industrial.js";
import { buildBunker } from "./bunker.js";

export const LOCATIONS = {
  camp: {
    id: "camp",
    name: "Survivor's Camp",
    short: "Camp",
    danger: 0,
    desc: "Your clearing in the pines. Build, craft and store your gear. Raiders come at night.",
    resources: ["wood", "stone", "fiber", "berries"],
    threats: ["Night raids"],
    map: [22, 66],
    unlock: null,
  },
  forest: {
    id: "forest",
    name: "Pinewood Forest",
    short: "Forest",
    danger: 1,
    desc: "Dense pines, a pond, a hunter's cabin and game. Walkers drift between the trees.",
    resources: ["wood", "stone", "fiber", "berries", "mushroom", "raw_meat", "dirty_water"],
    threats: ["Slow Walkers", "Fast Runners (night)"],
    map: [35, 34],
    unlock: null,
  },
  suburb: {
    id: "suburb",
    name: "Abandoned Suburb",
    short: "Suburb",
    danger: 2,
    desc: "Maple Street's houses still hold food, medicine and tools — and their former owners.",
    resources: ["canned_food", "cloth", "bandage", "metal", "crowbar"],
    threats: ["Walkers", "Runners", "Armored", "Toxic"],
    map: [60, 58],
    unlock: "Complete 'Clear the Woods'",
  },
  industrial: {
    id: "industrial",
    name: "Industrial Yard",
    short: "Yard",
    danger: 3,
    desc: "Harlow Freight & Steel: metal, machine parts and chemicals. An Alpha Brute guards the office.",
    resources: ["metal", "parts", "chemicals", "hard_hat"],
    threats: ["Armored", "Toxic", "Runners", "Alpha Brute"],
    map: [80, 30],
    unlock: "Find the Survivor's Map",
  },
  bunker: {
    id: "bunker",
    name: "Underground Bunker",
    short: "Bunker",
    danger: 4,
    desc: "SITE 9. Military stores, a sealed armory and whatever they locked in the containment hall.",
    resources: ["rifle", "military_vest", "medkit", "pistol_ammo"],
    threats: ["Armored", "Toxic", "Runners", "The Warden"],
    map: [86, 70],
    unlock: "Bunker Access Card",
  },
};
export const LOCATION_ORDER = ["camp", "forest", "suburb", "industrial", "bunker"];
/** Map roads between locations (for the world map drawing). */
export const ROUTES = [
  ["camp", "forest"],
  ["camp", "suburb"],
  ["forest", "suburb"],
  ["suburb", "industrial"],
  ["forest", "industrial"],
  ["industrial", "bunker"],
];

const BUILDERS = { camp: buildCamp, forest: buildForest, suburb: buildSuburb, industrial: buildIndustrial, bunker: buildBunker };
const cache = {};
export function getMap(id) {
  if (!cache[id]) cache[id] = BUILDERS[id]();
  return cache[id];
}
