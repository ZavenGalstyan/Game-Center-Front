/**
 * Stunt Racer 3D — the six stunt cars. Stats are 1..10 and map to physics
 * in engine/car.js paramsFor(). `body` picks the silhouette built in
 * three/carModel.js; colours paint it.
 *
 * Unlocks (no purchases, no backend): completed levels, collected stars or
 * gold medals — see engine/storage.js.
 */
export const CARS = [
  {
    id: "blaze",
    name: "BLAZE",
    role: "Balanced starter",
    blurb: "A fiery all-rounder. Predictable on the ground, honest in the air.",
    stats: { speed: 5, accel: 5, handling: 5, stability: 5 },
    body: "coupe",
    colors: { body: "#e3262f", accent: "#141414", trim: "#2a2a2e", glass: "#1d2a3a", rim: "#c9ced6", light: "#fff3c4", glow: "#ff5a1f" },
    unlock: null,
  },
  {
    id: "comet",
    name: "COMET",
    role: "High acceleration",
    blurb: "Explodes off the line and out of every corner.",
    stats: { speed: 5, accel: 9, handling: 5, stability: 4 },
    body: "hatch",
    colors: { body: "#1f8bff", accent: "#f4f7fb", trim: "#14213a", glass: "#162235", rim: "#f4f7fb", light: "#e6f3ff", glow: "#44d3ff" },
    unlock: { levels: 6 },
  },
  {
    id: "viper",
    name: "VIPER",
    role: "Strong handling",
    blurb: "Razor-sharp turn-in. Threads narrow bridges like a needle.",
    stats: { speed: 6, accel: 6, handling: 9, stability: 5 },
    body: "wedge",
    colors: { body: "#2bd46a", accent: "#0d0f0e", trim: "#0d0f0e", glass: "#0f2016", rim: "#1b1d1c", light: "#eaffd9", glow: "#7dff4a" },
    unlock: { stars: 15 },
  },
  {
    id: "titan",
    name: "TITAN",
    role: "Stable landing",
    blurb: "Heavy, planted and unbothered by hammers. Lands anything.",
    stats: { speed: 5, accel: 5, handling: 5, stability: 9 },
    body: "muscle",
    colors: { body: "#ff8a1c", accent: "#3a3f47", trim: "#24272c", glass: "#1a2129", rim: "#3a3f47", light: "#fff1d6", glow: "#ffb02e" },
    unlock: { levels: 14 },
  },
  {
    id: "phantom",
    name: "PHANTOM",
    role: "High speed",
    blurb: "Long, low and silent — the fastest thing in the sky.",
    stats: { speed: 9, accel: 6, handling: 6, stability: 5 },
    body: "hyper",
    colors: { body: "#7a3cff", accent: "#0b0912", trim: "#16121f", glass: "#120d1f", rim: "#b9a4ff", light: "#efe6ff", glow: "#c04bff" },
    unlock: { golds: 10 },
  },
  {
    id: "legend",
    name: "LEGEND",
    role: "Ultimate stunt car",
    blurb: "Gold-plated perfection, built for the champions of the sky.",
    stats: { speed: 8, accel: 8, handling: 8, stability: 8 },
    body: "hyper",
    colors: { body: "#f2c230", accent: "#fbfaf5", trim: "#2b2414", glass: "#1c1a12", rim: "#fbfaf5", light: "#fffbe8", glow: "#ffd94a" },
    unlock: { levels: 30 },
  },
];

export const CAR_BY_ID = new Map(CARS.map((c) => [c.id, c]));
export const STAT_KEYS = [
  ["speed", "SPEED"],
  ["accel", "ACCELERATION"],
  ["handling", "HANDLING"],
  ["stability", "STABILITY"],
];
