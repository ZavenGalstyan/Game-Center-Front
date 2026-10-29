/**
 * Last Shelter — expedition destinations. Resolved by engine/expedition.js.
 *
 *  days     trip length before trait / map adjustments
 *  risk     base danger (0..1) before health, fatigue and gear modify it
 *  fallout  chance of radiation sickness without a gas mask
 *  loot     [min, max] per resource, scaled by the traveller and backpack
 *  tools    chance to bring back each tool the family doesn't own
 *  need     tool or flag required to go
 */
export const DESTS = [
  {
    id: "store",
    name: "Mabel's Corner Store",
    blurb: "Two blocks over. Shelves were half-empty before the sirens.",
    days: 2,
    risk: 0.16,
    fallout: 0.12,
    loot: { food: [1, 3], water: [1, 3], batteries: [0, 1] },
    tools: { flashlight: 0.1 },
  },
  {
    id: "elm",
    name: "Elm Street Houses",
    blurb: "The neighbours' homes. Some doors are still locked.",
    days: 3,
    risk: 0.26,
    fallout: 0.22,
    loot: { food: [0, 2], water: [1, 2], meds: [0, 1], batteries: [0, 2] },
    tools: { books: 0.25, flashlight: 0.15, gasmask: 0.1, toolkit: 0.08, backpack: 0.12 },
    toolkitBonus: { food: 1, water: 1 },
  },
  {
    id: "clinic",
    name: "St. Brigid Clinic",
    blurb: "The pharmacy may have been missed. The air there is bad.",
    days: 3,
    risk: 0.36,
    fallout: 0.55,
    loot: { meds: [1, 3], water: [0, 1] },
    tools: { gasmask: 0.15 },
    flashlightBonus: { meds: 1 },
  },
  {
    id: "mast",
    name: "Hilltop Radio Mast",
    blurb: "The old relay on the ridge. Someone was broadcasting from up there.",
    days: 4,
    risk: 0.38,
    fallout: 0.4,
    need: "map",
    noKids: true,
    loot: { batteries: [1, 3], water: [0, 1] },
    tools: { radio: 0.4 },
    special: "mast",
  },
  {
    id: "depot",
    name: "Rail Yard Depot",
    blurb: "Freight cars full of who-knows-what. Raiders know about it too.",
    days: 5,
    risk: 0.52,
    fallout: 0.3,
    noKids: true,
    loot: { food: [2, 5], water: [2, 4], meds: [0, 2], batteries: [0, 2] },
    tools: { toolkit: 0.2, gasmask: 0.15, flashlight: 0.15, map: 0.12 },
    toolkitBonus: { food: 2 },
  },
  {
    id: "tunnels",
    name: "Service Tunnels",
    blurb: "The passage behind the shelter wall. It goes deeper than any map shows.",
    days: 2,
    risk: 0.3,
    fallout: 0,
    needFlag: "tunnelOpen",
    loot: { water: [1, 2], batteries: [0, 1] },
    tools: {},
    flashlightBonus: { water: 1 },
    special: "tunnels",
  },
];
export const DEST_BY_ID = Object.fromEntries(DESTS.map((d) => [d.id, d]));

/** Gear that can be taken along (max 2, 3 with the backpack). */
export const GEAR = {
  flashlight: { risk: 0.07, note: "Safer in the dark (uses a battery if you have one)" },
  gasmask: { risk: 0.03, note: "Blocks most fallout sickness" },
  map: { risk: 0.05, note: "One day shorter, fewer wrong turns" },
  toolkit: { risk: 0.03, note: "Pry open lockers for extra loot" },
  backpack: { risk: 0, note: "+50% loot, and room for a third item" },
};
