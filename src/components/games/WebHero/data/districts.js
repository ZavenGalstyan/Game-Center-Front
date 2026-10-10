/**
 * Web Hero — the five city districts (lighting mood, palette, music).
 * Layouts live in engine/city.js (MAPS); visuals in three/environment.js.
 */
export const DISTRICTS = [
  {
    id: 1,
    key: "downtown",
    name: "Downtown",
    blurb: "Glass skyscrapers, busy streets and a sunny skyline.",
    time: "day",
    colors: { a: "#3fa9ff", b: "#ffcf3a" },
    sky: { top: "#2f7fe0", mid: "#8cc8ff", horizon: "#e3f1ff", fog: "#c9e3ff", sun: "#fff2d8" },
    music: { mood: "downtown", bpm: 124, key: 0 },
  },
  {
    id: 2,
    key: "industrial",
    name: "Industrial Zone",
    blurb: "Warehouses, smokestacks, cranes and container yards at golden hour.",
    time: "dusk",
    colors: { a: "#ff9a3c", b: "#8a6a4a" },
    sky: { top: "#46609a", mid: "#d79a6a", horizon: "#ffd29a", fog: "#d9b08a", sun: "#ffd9a0" },
    music: { mood: "industrial", bpm: 118, key: 3 },
  },
  {
    id: 3,
    key: "coastal",
    name: "Coastal District",
    blurb: "Waterfront towers, docks, a long bridge and the open sea.",
    time: "day",
    colors: { a: "#2fd6c9", b: "#ffffff" },
    sky: { top: "#1f78e6", mid: "#72c6ff", horizon: "#eafaff", fog: "#bfe8ff", sun: "#ffffff" },
    music: { mood: "coastal", bpm: 120, key: 5 },
  },
  {
    id: 4,
    key: "neon",
    name: "Neon City",
    blurb: "Rain-slick night streets under towering neon signs.",
    time: "night",
    colors: { a: "#ff3df0", b: "#3df5ff" },
    sky: { top: "#0b0a24", mid: "#2a1650", horizon: "#7a2a8a", fog: "#1d1238", sun: "#a6b8ff" },
    music: { mood: "neon", bpm: 132, key: 9 },
  },
  {
    id: 5,
    key: "fortress",
    name: "Central Fortress",
    blurb: "The villains' armoured headquarters — walls, turrets and tech towers.",
    time: "storm",
    colors: { a: "#ff4a3a", b: "#9aa4c0" },
    sky: { top: "#1a1e2e", mid: "#454c66", horizon: "#9a7a7a", fog: "#555d74", sun: "#ffc9a0" },
    music: { mood: "fortress", bpm: 136, key: 7 },
  },
];

export const districtById = (id) => DISTRICTS[Math.max(0, Math.min(DISTRICTS.length - 1, id - 1))];
export const districtByKey = (k) => DISTRICTS.find((d) => d.key === k) || DISTRICTS[0];
