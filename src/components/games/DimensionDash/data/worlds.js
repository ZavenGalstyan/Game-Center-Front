/**
 * Dimension Dash — the five worlds (palette, sky, music mood).
 * Visual identity per world is applied by three/environment.js.
 */
export const WORLDS = [
  {
    id: 1,
    key: "green",
    name: "Green Velocity",
    blurb: "Checkered hills, waterfalls and palm-lined loops under a bright sky.",
    colors: { a: "#3fd16b", b: "#1e9bff", accent: "#ffd23a" },
    sky: { top: "#2f8cff", mid: "#7cc7ff", horizon: "#d9f3ff", fog: "#bfe6ff", sun: "#fff3d0" },
    ground: { top: "#4fd14a", top2: "#3cb83c", side: "#b06a2a", side2: "#8a4f1c", edge: "#2f8a2c" },
    music: { mood: "green", bpm: 148, key: 0 },
  },
  {
    id: 2,
    key: "desert",
    name: "Desert Circuit",
    blurb: "Golden dunes, sandstone ruins and canyon speed ramps.",
    colors: { a: "#ffb347", b: "#e8742c", accent: "#5ad8ff" },
    sky: { top: "#3f7fd6", mid: "#9cc6ee", horizon: "#ffe2b0", fog: "#f6d9a8", sun: "#fff0c8" },
    ground: { top: "#efc979", top2: "#e3b763", side: "#c47a3c", side2: "#a35f2a", edge: "#b8853f" },
    music: { mood: "desert", bpm: 152, key: 2 },
  },
  {
    id: 3,
    key: "ocean",
    name: "Ocean Skyway",
    blurb: "Island hopping across floating bridges and water tunnels.",
    colors: { a: "#36d6e7", b: "#2a7bff", accent: "#ffffff" },
    sky: { top: "#1f78e6", mid: "#64c3ff", horizon: "#e6fbff", fog: "#b8ecff", sun: "#ffffff" },
    ground: { top: "#f2e3b3", top2: "#e7d29a", side: "#5fb9c9", side2: "#3f95a8", edge: "#e0c88c" },
    music: { mood: "ocean", bpm: 140, key: 5 },
  },
  {
    id: 4,
    key: "neon",
    name: "Neon Metropolis",
    blurb: "Glowing highways, elevated rails and robot patrols over a night city.",
    colors: { a: "#ff3df0", b: "#3df5ff", accent: "#ffe03d" },
    sky: { top: "#120a35", mid: "#3b1a6e", horizon: "#ff6fb5", fog: "#2a1650", sun: "#ff9be0" },
    ground: { top: "#2b2f4a", top2: "#232741", side: "#3a3f63", side2: "#2a2e4c", edge: "#3df5ff" },
    music: { mood: "neon", bpm: 156, key: 9 },
  },
  {
    id: 5,
    key: "final",
    name: "Final Dimension",
    blurb: "Floating ruins and unstable platforms under a fractured sky.",
    colors: { a: "#a46bff", b: "#ff6b3d", accent: "#7dfff0" },
    sky: { top: "#1b0b3a", mid: "#5a2a8a", horizon: "#ff8a5c", fog: "#4a2a6e", sun: "#ffd6a0" },
    ground: { top: "#6e5fa8", top2: "#5d4f94", side: "#3c2f6b", side2: "#2c2252", edge: "#7dfff0" },
    music: { mood: "final", bpm: 160, key: 7 },
  },
];

export const worldById = (id) => WORLDS[Math.max(0, Math.min(WORLDS.length - 1, id - 1))];
