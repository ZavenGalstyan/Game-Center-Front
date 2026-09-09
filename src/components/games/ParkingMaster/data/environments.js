/**
 * Parking Master — the five environments.
 *
 * Each entry is pure data consumed by <Environment> and the lighting rig. The
 * gameplay engine never branches on the environment id; it only reads `grip`
 * and the geometry that a level provides. Everything else here is presentation:
 * sky colour, fog, ground material, decoration set, weather flags.
 */

export const ENVIRONMENTS = [
  {
    id: "training-lot",
    name: "Training Lot",
    tagline: "Bright daytime parking lot",
    accent: "#39b56a",
    unlockAt: 0, // levels of the PREVIOUS world that must be complete
    night: false,
    rain: false,
    grip: 1,
    sky: { top: "#7fb4e6", bottom: "#dcecf7", fog: "#cfe0ee", fogNear: 40, fogFar: 130 },
    ground: { color: "#43474d", line: "#e8ebee", accent: "#f2c14e", roughness: 0.95 },
    ambient: { intensity: 0.65, color: "#dbe8f4" },
    hemi: { sky: "#bcd9f2", ground: "#4a4438", intensity: 0.75 },
    sun: { intensity: 1.35, color: "#fff3dc", position: [34, 46, 22] },
    decor: "lot", // trees, grass, small shop, signs, lamps
  },
  {
    id: "city-street",
    name: "City Street",
    tagline: "Urban street parking",
    accent: "#e0913a",
    unlockAt: 10,
    night: false,
    rain: false,
    grip: 1,
    sky: { top: "#8fb9dd", bottom: "#e6eef4", fog: "#d4dfe8", fogNear: 45, fogFar: 150 },
    ground: { color: "#3c3f44", line: "#e4e7ea", accent: "#e8c24a", roughness: 0.92 },
    ambient: { intensity: 0.6, color: "#d7e2ee" },
    hemi: { sky: "#c4d8ea", ground: "#3d3a34", intensity: 0.7 },
    sun: { intensity: 1.2, color: "#fff0d6", position: [-30, 40, 26] },
    decor: "city",
  },
  {
    id: "parking-garage",
    name: "Parking Garage",
    tagline: "Indoor multi-storey garage",
    accent: "#5a86c9",
    unlockAt: 20,
    night: false,
    rain: false,
    indoor: true,
    grip: 1,
    sky: { top: "#20242b", bottom: "#181b20", fog: "#1c2026", fogNear: 18, fogFar: 62 },
    ground: { color: "#575b60", line: "#d7dde2", accent: "#e0a52e", roughness: 0.8 },
    ambient: { intensity: 0.5, color: "#aebccb" },
    hemi: { sky: "#8fa4bb", ground: "#2a2d31", intensity: 0.45 },
    sun: { intensity: 0.25, color: "#cdd8e6", position: [10, 30, 10] },
    ceilingLights: true,
    decor: "garage",
  },
  {
    id: "rainy-rooftop",
    name: "Rainy Rooftop",
    tagline: "Wet rooftop above the city",
    accent: "#6ba3b8",
    unlockAt: 30,
    night: false,
    rain: true,
    grip: 0.82,
    sky: { top: "#5c6773", bottom: "#8a95a1", fog: "#79838f", fogNear: 30, fogFar: 110 },
    ground: { color: "#33373d", line: "#c9d0d6", accent: "#c7b24a", roughness: 0.35, wet: true },
    ambient: { intensity: 0.55, color: "#aeb9c4" },
    hemi: { sky: "#9aa7b4", ground: "#33383d", intensity: 0.6 },
    sun: { intensity: 0.55, color: "#c3ccd6", position: [20, 44, -18] },
    decor: "rooftop",
  },
  {
    id: "night-challenge",
    name: "Night Challenge",
    tagline: "Premium city parking at night",
    accent: "#8a7be0",
    unlockAt: 40,
    night: true,
    rain: false,
    grip: 0.92,
    sky: { top: "#0b1020", bottom: "#1b2740", fog: "#141d30", fogNear: 26, fogFar: 100 },
    ground: { color: "#24272d", line: "#aab4bd", accent: "#c8a94a", roughness: 0.4, wet: true },
    ambient: { intensity: 0.32, color: "#3a4a68" },
    hemi: { sky: "#26324a", ground: "#12151b", intensity: 0.4 },
    sun: { intensity: 0.12, color: "#4a5c80", position: [-24, 40, -20] },
    streetLamps: true,
    decor: "night",
  },
];

const BY_ID = Object.fromEntries(ENVIRONMENTS.map((e) => [e.id, e]));

export function getEnvironment(id) {
  return BY_ID[id] || ENVIRONMENTS[0];
}

export function environmentIndex(id) {
  return Math.max(0, ENVIRONMENTS.findIndex((e) => e.id === id));
}
