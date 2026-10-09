/**
 * Police Escape 3D — the six getaway cars. Stats are 1..10 and map to
 * physics in engine/car.js paramsFor(). `body` picks the silhouette built in
 * three/carModel.js. Unlocks (no purchases, no backend) by completed
 * missions, stars or world progress — see engine/storage.js.
 */
export const CARS = [
  {
    id: "shadow",
    name: "SHADOW",
    role: "Balanced starter",
    blurb: "Dark metallic coupe. Quick, planted and easy to read at speed.",
    stats: { speed: 5, accel: 5, handling: 5, durability: 5 },
    body: "coupe",
    colors: { body: "#1b1e26", accent: "#0b0c10", trim: "#121318", glass: "#0e1622", rim: "#9aa3b2", light: "#e9f2ff", glow: "#3a8bff" },
    unlock: null,
  },
  {
    id: "spark",
    name: "SPARK",
    role: "Fast acceleration",
    blurb: "A compact hot hatch that leaps off every corner.",
    stats: { speed: 5, accel: 9, handling: 6, durability: 4 },
    body: "hatch",
    colors: { body: "#ffd21f", accent: "#141414", trim: "#1a1a1a", glass: "#151a22", rim: "#141414", light: "#fff6d8", glow: "#ffb02e" },
    unlock: { missions: 6 },
  },
  {
    id: "viper",
    name: "VIPER",
    role: "Excellent handling",
    blurb: "Low wedge, razor turn-in. Alleys were made for it.",
    stats: { speed: 6, accel: 6, handling: 9, durability: 4 },
    body: "wedge",
    colors: { body: "#18c95a", accent: "#0d0f0e", trim: "#0d0f0e", glass: "#0f2016", rim: "#1b1d1c", light: "#eaffd9", glow: "#7dff4a" },
    unlock: { stars: 24 },
  },
  {
    id: "phantom",
    name: "PHANTOM",
    role: "High top speed",
    blurb: "Long, low, silent. Nothing in the city catches it on a straight.",
    stats: { speed: 9, accel: 6, handling: 5, durability: 5 },
    body: "hyper",
    colors: { body: "#6a32e6", accent: "#0b0912", trim: "#16121f", glass: "#120d1f", rim: "#b9a4ff", light: "#efe6ff", glow: "#c04bff" },
    unlock: { worlds: 3 },
  },
  {
    id: "titan",
    name: "TITAN",
    role: "High durability",
    blurb: "Armoured muscle. Shrugs off rams that would wreck anything else.",
    stats: { speed: 5, accel: 5, handling: 4, durability: 10 },
    body: "muscle",
    colors: { body: "#c7451c", accent: "#2a2d33", trim: "#202328", glass: "#1a2129", rim: "#3a3f47", light: "#fff1d6", glow: "#ff7a2e" },
    unlock: { missions: 18 },
  },
  {
    id: "legend",
    name: "LEGEND",
    role: "Ultimate getaway car",
    blurb: "Gold-trimmed perfection for the most wanted driver in the city.",
    stats: { speed: 8, accel: 8, handling: 8, durability: 8 },
    body: "hyper",
    colors: { body: "#e8e3d6", accent: "#c9a227", trim: "#2b2414", glass: "#1c1a12", rim: "#c9a227", light: "#fffbe8", glow: "#ffd94a" },
    unlock: { stars: 75 },
  },
];

export const CAR_BY_ID = new Map(CARS.map((c) => [c.id, c]));
export const STAT_KEYS = [
  ["speed", "SPEED"],
  ["accel", "ACCELERATION"],
  ["handling", "HANDLING"],
  ["durability", "DURABILITY"],
];
