/**
 * Fishing Journey — fish species.
 *
 * Every catchable species in the game, keyed by id. `locationId` ties a species
 * to the water it lives in (the Collection screen groups by it). Rarity drives
 * how often a species is offered when a fish bites; weight range + difficulty
 * feed the reeling mini-game and the coin reward.
 *
 *   minWeight / maxWeight  kg, used to roll a random weight per catch
 *   baseCoinValue          coins for an average-weight fish of this species
 *   difficulty             1 = easy, higher = the reeling fish fights harder
 */

export const RARITIES = {
  common: { id: "common", label: "Common", color: "#9aa7b8", order: 0 },
  uncommon: { id: "uncommon", label: "Uncommon", color: "#4ea1d3", order: 1 },
  rare: { id: "rare", label: "Rare", color: "#a978e6", order: 2 },
  epic: { id: "epic", label: "Epic", color: "#e8b24a", order: 3 },
};

export const FISH = {
  // ---------------- Crystal Lake ----------------
  bluegill: {
    id: "bluegill",
    name: "Bluegill",
    locationId: "crystal-lake",
    rarity: "common",
    minWeight: 0.1,
    maxWeight: 0.9,
    baseCoinValue: 8,
    difficulty: 0.8,
  },
  "common-carp": {
    id: "common-carp",
    name: "Common Carp",
    locationId: "crystal-lake",
    rarity: "common",
    minWeight: 1.5,
    maxWeight: 9.0,
    baseCoinValue: 14,
    difficulty: 1.15,
  },
  "yellow-perch": {
    id: "yellow-perch",
    name: "Yellow Perch",
    locationId: "crystal-lake",
    rarity: "uncommon",
    minWeight: 0.3,
    maxWeight: 1.6,
    baseCoinValue: 26,
    difficulty: 1.1,
  },
  "rainbow-trout": {
    id: "rainbow-trout",
    name: "Rainbow Trout",
    locationId: "crystal-lake",
    rarity: "uncommon",
    minWeight: 0.8,
    maxWeight: 4.5,
    baseCoinValue: 35,
    difficulty: 1.4,
  },
  "northern-pike": {
    id: "northern-pike",
    name: "Northern Pike",
    locationId: "crystal-lake",
    rarity: "rare",
    minWeight: 2.5,
    maxWeight: 12.0,
    baseCoinValue: 85,
    difficulty: 1.9,
  },
  "golden-trout": {
    id: "golden-trout",
    name: "Golden Trout",
    locationId: "crystal-lake",
    rarity: "epic",
    minWeight: 1.2,
    maxWeight: 6.0,
    baseCoinValue: 210,
    difficulty: 2.3,
  },

  // ---------------- Pine River ----------------
  "brook-trout": {
    id: "brook-trout",
    name: "Brook Trout",
    locationId: "pine-river",
    rarity: "common",
    minWeight: 0.2,
    maxWeight: 1.8,
    baseCoinValue: 12,
    difficulty: 0.95,
  },
  "smallmouth-bass": {
    id: "smallmouth-bass",
    name: "Smallmouth Bass",
    locationId: "pine-river",
    rarity: "common",
    minWeight: 0.5,
    maxWeight: 3.2,
    baseCoinValue: 18,
    difficulty: 1.25,
  },
  "chain-pickerel": {
    id: "chain-pickerel",
    name: "Chain Pickerel",
    locationId: "pine-river",
    rarity: "uncommon",
    minWeight: 0.7,
    maxWeight: 4.0,
    baseCoinValue: 40,
    difficulty: 1.5,
  },
  steelhead: {
    id: "steelhead",
    name: "Steelhead",
    locationId: "pine-river",
    rarity: "uncommon",
    minWeight: 1.5,
    maxWeight: 8.0,
    baseCoinValue: 52,
    difficulty: 1.7,
  },
  muskellunge: {
    id: "muskellunge",
    name: "Muskellunge",
    locationId: "pine-river",
    rarity: "rare",
    minWeight: 4.0,
    maxWeight: 20.0,
    baseCoinValue: 120,
    difficulty: 2.1,
  },
  "lake-sturgeon": {
    id: "lake-sturgeon",
    name: "Lake Sturgeon",
    locationId: "pine-river",
    rarity: "epic",
    minWeight: 10.0,
    maxWeight: 60.0,
    baseCoinValue: 300,
    difficulty: 2.6,
  },

  // ---------------- Misty Marsh ----------------
  "bullhead-catfish": {
    id: "bullhead-catfish",
    name: "Bullhead Catfish",
    locationId: "misty-marsh",
    rarity: "common",
    minWeight: 0.4,
    maxWeight: 2.5,
    baseCoinValue: 16,
    difficulty: 1.1,
  },
  bowfin: {
    id: "bowfin",
    name: "Bowfin",
    locationId: "misty-marsh",
    rarity: "common",
    minWeight: 1.0,
    maxWeight: 5.0,
    baseCoinValue: 22,
    difficulty: 1.35,
  },
  "largemouth-bass": {
    id: "largemouth-bass",
    name: "Largemouth Bass",
    locationId: "misty-marsh",
    rarity: "uncommon",
    minWeight: 0.9,
    maxWeight: 6.5,
    baseCoinValue: 48,
    difficulty: 1.6,
  },
  snakehead: {
    id: "snakehead",
    name: "Snakehead",
    locationId: "misty-marsh",
    rarity: "uncommon",
    minWeight: 1.2,
    maxWeight: 7.0,
    baseCoinValue: 60,
    difficulty: 1.85,
  },
  "alligator-gar": {
    id: "alligator-gar",
    name: "Alligator Gar",
    locationId: "misty-marsh",
    rarity: "rare",
    minWeight: 8.0,
    maxWeight: 45.0,
    baseCoinValue: 150,
    difficulty: 2.3,
  },
  "golden-dorado": {
    id: "golden-dorado",
    name: "Golden Dorado",
    locationId: "misty-marsh",
    rarity: "epic",
    minWeight: 3.0,
    maxWeight: 18.0,
    baseCoinValue: 360,
    difficulty: 2.7,
  },

  // ---------------- Deep Ocean ----------------
  "atlantic-mackerel": {
    id: "atlantic-mackerel",
    name: "Atlantic Mackerel",
    locationId: "deep-ocean",
    rarity: "common",
    minWeight: 0.3,
    maxWeight: 1.5,
    baseCoinValue: 20,
    difficulty: 1.1,
  },
  "atlantic-cod": {
    id: "atlantic-cod",
    name: "Atlantic Cod",
    locationId: "deep-ocean",
    rarity: "common",
    minWeight: 2.0,
    maxWeight: 12.0,
    baseCoinValue: 30,
    difficulty: 1.4,
  },
  "mahi-mahi": {
    id: "mahi-mahi",
    name: "Mahi Mahi",
    locationId: "deep-ocean",
    rarity: "uncommon",
    minWeight: 3.0,
    maxWeight: 15.0,
    baseCoinValue: 70,
    difficulty: 1.8,
  },
  "yellowfin-tuna": {
    id: "yellowfin-tuna",
    name: "Yellowfin Tuna",
    locationId: "deep-ocean",
    rarity: "uncommon",
    minWeight: 8.0,
    maxWeight: 50.0,
    baseCoinValue: 95,
    difficulty: 2.1,
  },
  swordfish: {
    id: "swordfish",
    name: "Swordfish",
    locationId: "deep-ocean",
    rarity: "rare",
    minWeight: 25.0,
    maxWeight: 180.0,
    baseCoinValue: 220,
    difficulty: 2.6,
  },
  "blue-marlin": {
    id: "blue-marlin",
    name: "Blue Marlin",
    locationId: "deep-ocean",
    rarity: "epic",
    minWeight: 40.0,
    maxWeight: 320.0,
    baseCoinValue: 520,
    difficulty: 3.0,
  },
};

/** All species for one location, in display order (rarity then name). */
export function fishForLocation(locationId) {
  return Object.values(FISH)
    .filter((f) => f.locationId === locationId)
    .sort(
      (a, b) =>
        RARITIES[a.rarity].order - RARITIES[b.rarity].order ||
        a.name.localeCompare(b.name),
    );
}

export function getFish(id) {
  return FISH[id] || null;
}
