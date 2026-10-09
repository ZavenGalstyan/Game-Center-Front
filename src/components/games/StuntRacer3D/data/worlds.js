/**
 * Stunt Racer 3D — the five worlds (six levels each). Each carries the
 * palette its sky, environment, track and music are built from.
 */
export const WORLDS = [
  {
    id: 1,
    name: "Sky Start",
    theme: "sky",
    levels: [1, 6],
    blurb: "Bright skies, wide roads, first jumps.",
    sky: { top: "#2f7fe0", horizon: "#bfe3ff", fog: "#cfe8ff", fogNear: 260, fogFar: 1500, sun: "#fff6e0", sunPos: [0.4, 0.62, 0.55], light: 2.6, hemiSky: "#cfe6ff", hemiGround: "#8aa0b8", ambient: 1.05, sunDisc: "#fffbe8" },
    road: { deck: "#3a3f4b", edge: "#ff4a3a", edge2: "#ffffff", side: "#e8edf5", under: "#9aa6b8", line: "#ffffff", ramp: "#ffcf2e", rail: "glass", accent: "#ff4a3a", pillar: "#e9eef6" },
    ground: "clouds",
    mountains: ["#9fb6d8", "#c6d7ee"],
    card: ["#5fb4ff", "#d8efff"],
  },
  {
    id: 2,
    name: "Desert Stunts",
    theme: "desert",
    levels: [7, 12],
    blurb: "Canyons, rock arches and long jumps at sunset.",
    sky: { top: "#3d5fa8", horizon: "#ffb36b", fog: "#f2b989", fogNear: 240, fogFar: 1400, sun: "#ffd9a0", sunPos: [-0.5, 0.28, 0.75], light: 2.8, hemiSky: "#ffd2a8", hemiGround: "#a0603a", ambient: 0.95, sunDisc: "#ffe7b8" },
    road: { deck: "#40393a", edge: "#ff7a1a", edge2: "#fff1d6", side: "#d79a62", under: "#8a5a3a", line: "#ffe2b0", ramp: "#ff9a1a", rail: "barrier", accent: "#ff7a1a", pillar: "#c98a58" },
    ground: "desert",
    mountains: ["#b0623e", "#d68a5a"],
    card: ["#ff9a52", "#ffd8a8"],
  },
  {
    id: 3,
    name: "Ocean Heights",
    theme: "ocean",
    levels: [13, 18],
    blurb: "Floating roads, islands and waterfalls over a tropical sea.",
    sky: { top: "#1f8fe6", horizon: "#b8f0ff", fog: "#bfeeff", fogNear: 260, fogFar: 1600, sun: "#fffaf0", sunPos: [0.2, 0.7, -0.6], light: 2.7, hemiSky: "#c8f2ff", hemiGround: "#3a8a8a", ambient: 1.0, sunDisc: "#ffffff" },
    road: { deck: "#2f3a46", edge: "#18d0c6", edge2: "#ffffff", side: "#f1f4f0", under: "#7fa7b0", line: "#ffffff", ramp: "#ffd23a", rail: "glass", accent: "#18d0c6", pillar: "#f0f3ee" },
    ground: "ocean",
    mountains: ["#2f8a6a", "#6fb88f"],
    card: ["#25c4e8", "#c3f7ff"],
  },
  {
    id: 4,
    name: "Neon City",
    theme: "neon",
    levels: [19, 24],
    blurb: "Glowing roads, tunnels and loops above a city that never sleeps.",
    sky: { top: "#05040f", horizon: "#2a0f4a", fog: "#1a0b33", fogNear: 200, fogFar: 1300, sun: "#a98cff", sunPos: [0.3, 0.5, 0.6], light: 1.1, hemiSky: "#5b3cff", hemiGround: "#12081f", ambient: 0.8, sunDisc: "#ff4fd8", night: true },
    road: { deck: "#16131f", edge: "#ff2fd0", edge2: "#2ff3ff", side: "#1e1a2c", under: "#0d0b14", line: "#2ff3ff", ramp: "#ff2fd0", rail: "neon", accent: "#2ff3ff", pillar: "#1c1828" },
    ground: "city",
    mountains: ["#1a0f33", "#24154a"],
    card: ["#3a1470", "#ff3fd6"],
  },
  {
    id: 5,
    name: "Extreme Sky",
    theme: "extreme",
    levels: [25, 30],
    blurb: "Giant loops and suspended platforms in the high sunset clouds.",
    sky: { top: "#3a2a7a", horizon: "#ff8a5a", fog: "#f59a7a", fogNear: 260, fogFar: 1700, sun: "#ffc59a", sunPos: [0.65, 0.18, 0.7], light: 2.7, hemiSky: "#ffb0a0", hemiGround: "#5a3a6a", ambient: 0.95, sunDisc: "#ffe0b0" },
    road: { deck: "#2c2836", edge: "#ffcc33", edge2: "#ff4a6a", side: "#3b3550", under: "#2a2438", line: "#ffe08a", ramp: "#ff4a6a", rail: "barrier", accent: "#ffcc33", pillar: "#4a4060" },
    ground: "sunsetClouds",
    mountains: ["#6a3a6a", "#a65a7a"],
    card: ["#6a3aa8", "#ff9a6a"],
  },
];

export const WORLD_BY_ID = new Map(WORLDS.map((w) => [w.id, w]));
export const worldOfLevel = (id) => WORLDS.find((w) => id >= w.levels[0] && id <= w.levels[1]) || WORLDS[0];
