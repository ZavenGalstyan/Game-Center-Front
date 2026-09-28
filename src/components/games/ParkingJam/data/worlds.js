/**
 * Parking Jam — the five parking locations. Colors feed both the scene
 * renderer (render/Environment.jsx) and the UI chrome (--pj-* variables).
 * `typePool` decides which vehicle class a map letter becomes when a level
 * doesn't name one; it is cosmetic only — length always comes from the map.
 */
export const LEVELS_PER_WORLD = 20;

export const WORLDS = [
  {
    id: 1,
    key: "sunny",
    name: "Sunny Parking",
    blurb: "A bright neighbourhood lot",
    night: false,
    ui: { bg0: "#0e3b2c", bg1: "#1d6b47", accent: "#ffd34d", accent2: "#fff1b8", text: "#f7fff9", dim: "#b9dcc6", panel: "rgba(8, 40, 28, 0.72)" },
    scene: {
      ground: "#6fbf5a", groundDark: "#58a847", groundLight: "#86cf6b",
      lot: "#5b6068", lotLight: "#666c75", road: "#4a4f57", roadLine: "#f4f0e2",
      line: "rgba(250, 250, 244, 0.86)", curb: "#d9d6cc", curbDark: "#b3afa3", walk: "#cfc8b8",
      tint: null,
    },
    typePool: { 2: ["compact", "sedan", "hatch", "sedan", "compact", "coupe", "hatch", "pickup"], 3: ["van"], 4: ["bus"] },
    ambience: "birds",
  },
  {
    id: 2,
    key: "garage",
    name: "City Garage",
    blurb: "A multi-storey parking deck",
    night: false,
    ui: { bg0: "#161c24", bg1: "#2c3644", accent: "#ffc53d", accent2: "#ffe7a3", text: "#f1f5fa", dim: "#a7b4c4", panel: "rgba(18, 23, 31, 0.78)" },
    scene: {
      ground: "#8d949c", groundDark: "#7b828b", groundLight: "#9aa1a9",
      lot: "#6b7179", lotLight: "#757c85", road: "#565c64", roadLine: "#ffcc33",
      line: "rgba(255, 214, 90, 0.9)", curb: "#b9bdc2", curbDark: "#8d9298", walk: "#a4a9ae",
      tint: null,
    },
    typePool: { 2: ["sedan", "suv", "hatch", "taxi", "compact", "suv", "sedan", "pickup"], 3: ["van"], 4: ["bus"] },
    ambience: "garage",
  },
  {
    id: 3,
    key: "mall",
    name: "Shopping Center",
    blurb: "Busy lot outside the mall",
    night: false,
    ui: { bg0: "#2a1638", bg1: "#5a2f6e", accent: "#ff8fb1", accent2: "#ffd6e3", text: "#fff6fb", dim: "#dcbfd8", panel: "rgba(35, 16, 46, 0.74)" },
    scene: {
      ground: "#cfc3ad", groundDark: "#bfb29a", groundLight: "#ddd2bf",
      lot: "#595e67", lotLight: "#646a73", road: "#474c54", roadLine: "#ffffff",
      line: "rgba(255, 255, 255, 0.88)", curb: "#e3ddcf", curbDark: "#bdb5a4", walk: "#d8cdb8",
      tint: null,
    },
    typePool: { 2: ["sedan", "compact", "suv", "hatch", "coupe", "taxi", "pickup", "compact"], 3: ["van", "minibus"], 4: ["bus"] },
    ambience: "mall",
  },
  {
    id: 4,
    key: "airport",
    name: "Airport Parking",
    blurb: "Terminal short-stay lot",
    night: false,
    ui: { bg0: "#0f2742", bg1: "#1f4f7d", accent: "#5fd4ff", accent2: "#c6f1ff", text: "#f2f9ff", dim: "#a9c6e0", panel: "rgba(10, 30, 52, 0.76)" },
    scene: {
      ground: "#9fb4c4", groundDark: "#8ea3b3", groundLight: "#b1c4d2",
      lot: "#5a616b", lotLight: "#656c77", road: "#484e57", roadLine: "#ffffff",
      line: "rgba(255, 255, 255, 0.86)", curb: "#dfe5ea", curbDark: "#b0bac3", walk: "#c9d3db",
      tint: null,
    },
    typePool: { 2: ["sedan", "taxi", "suv", "compact", "hatch", "taxi", "sedan", "coupe"], 3: ["van", "minibus"], 4: ["shuttle", "bus"] },
    ambience: "airport",
  },
  {
    id: 5,
    key: "night",
    name: "Night Downtown",
    blurb: "Premium parking after dark",
    night: true,
    ui: { bg0: "#07061a", bg1: "#1b1545", accent: "#b48cff", accent2: "#e2d4ff", text: "#f3f0ff", dim: "#a79dcf", panel: "rgba(10, 8, 30, 0.8)" },
    scene: {
      ground: "#26293a", groundDark: "#1e2130", groundLight: "#2f3346",
      lot: "#30343f", lotLight: "#3a3f4b", road: "#252933", roadLine: "#e8e6ff",
      line: "rgba(232, 236, 255, 0.78)", curb: "#555a6b", curbDark: "#3c4050", walk: "#3d4152",
      tint: "rgba(20, 14, 60, 0.28)",
    },
    typePool: { 2: ["coupe", "sedan", "suv", "taxi", "hatch", "coupe", "sedan", "compact"], 3: ["limo", "van", "minibus"], 4: ["bus", "shuttle"] },
    ambience: "night",
  },
];

export const worldOf = (levelId) => WORLDS[Math.min(WORLDS.length, Math.ceil(levelId / LEVELS_PER_WORLD)) - 1];
export const worldLevelIds = (worldId) =>
  Array.from({ length: LEVELS_PER_WORLD }, (_, i) => (worldId - 1) * LEVELS_PER_WORLD + i + 1);
