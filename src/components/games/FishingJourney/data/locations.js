/**
 * Fishing Journey — fishing locations.
 *
 * Each location is pure data so the one <FishingScreen> can render any of them:
 *   scene           visual variant handled by <LakeScene> (palette + props)
 *   rarityWeights   relative odds a bite is common / uncommon / rare / epic
 *   difficultyMod   multiplies every hooked fish's difficulty here
 *   biteRange       [minMs, maxMs] wait between casting and a bite
 *   unlockCost      coins needed to unlock (crystal-lake is free)
 *
 * The fish that live here come from data/fish.js (filtered by locationId), so
 * adding a species to a location is a one-line change there.
 */

export const LOCATIONS = [
  {
    id: "crystal-lake",
    name: "Crystal Lake",
    scene: "lake",
    tagline: "Still water, clear sky, mountains all around.",
    unlockCost: 0,
    rarityWeights: { common: 58, uncommon: 30, rare: 9, epic: 3 },
    difficultyMod: 1.0,
    biteRange: [1500, 4000],
  },
  {
    id: "pine-river",
    name: "Pine River",
    scene: "river",
    tagline: "Cold current winding through the pines.",
    unlockCost: 1500,
    rarityWeights: { common: 52, uncommon: 32, rare: 12, epic: 4 },
    difficultyMod: 1.15,
    biteRange: [1400, 3600],
  },
  {
    id: "misty-marsh",
    name: "Misty Marsh",
    scene: "marsh",
    tagline: "Fog on the reeds and something big underneath.",
    unlockCost: 3500,
    rarityWeights: { common: 46, uncommon: 34, rare: 14, epic: 6 },
    difficultyMod: 1.3,
    biteRange: [1600, 4200],
  },
  {
    id: "deep-ocean",
    name: "Deep Ocean",
    scene: "ocean",
    tagline: "Open swell. The rarest, heaviest fish in the game.",
    unlockCost: 8000,
    rarityWeights: { common: 40, uncommon: 35, rare: 17, epic: 8 },
    difficultyMod: 1.5,
    biteRange: [1800, 4500],
  },
];

export const LOCATION_BY_ID = Object.fromEntries(
  LOCATIONS.map((l) => [l.id, l]),
);

export function getLocation(id) {
  return LOCATION_BY_ID[id] || LOCATIONS[0];
}
