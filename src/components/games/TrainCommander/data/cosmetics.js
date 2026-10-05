/**
 * Train Commander — cosmetic train liveries. COSMETIC ONLY: no stats.
 * Unlocked by campaign progress (never bought).
 */
export const LIVERIES = [
  { id: "classic", name: "Classic Steel", unlock: { route: 0 }, body: "#4a6a88", dark: "#26384b", trim: "#e0aa45", metal: "#5e666f", roof: "#3a4652", stripe: "#e9c25a", glass: "#ffd58a" },
  { id: "forest", name: "Forest Guard", unlock: { route: 6 }, body: "#456f48", dark: "#22402a", trim: "#e3c677", metal: "#5c6058", roof: "#33493a", stripe: "#f0d27a", glass: "#ffe2a0" },
  { id: "desert", name: "Desert Runner", unlock: { route: 12 }, body: "#c39762", dark: "#6e4b2c", trim: "#e2573a", metal: "#6c625a", roof: "#8a6643", stripe: "#f2ece0", glass: "#ffcf7a" },
  { id: "frost", name: "Frost Engine", unlock: { route: 18 }, body: "#d3e0ea", dark: "#4f7190", trim: "#56c8ff", metal: "#7b8794", roof: "#6d8aa3", stripe: "#56c8ff", glass: "#c9f0ff" },
  { id: "midnight", name: "Midnight Express", unlock: { route: 24 }, body: "#2c2e44", dark: "#14151f", trim: "#a98bff", metal: "#4a4c5c", roof: "#1d1e2c", stripe: "#a98bff", glass: "#c9b6ff" },
  { id: "royal", name: "Royal Commander", unlock: { route: 30 }, body: "#8a1d2d", dark: "#45101a", trim: "#f2c54b", metal: "#5a5452", roof: "#5a1420", stripe: "#f2c54b", glass: "#ffe39a" },
];

export const liveryOf = (id) => LIVERIES.find((l) => l.id === id) || LIVERIES[0];
