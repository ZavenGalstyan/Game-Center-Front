/**
 * Crowd Rush — the five worlds.
 *
 * Pure data. Each world owns a palette + lighting rig + prop set used by
 * <Track> and the environment builder; the level list only references a world
 * by `id`. Ten levels per world, 50 total.
 */

export const WORLDS = [
  {
    id: "sunny-park",
    index: 0,
    name: "Sunny Park",
    tagline: "Grow • Dodge • Conquer",
    range: [1, 10],
    sky: ["#8fd3ff", "#dff1ff"],
    fog: { color: "#cfeaff", near: 40, far: 165 },
    ambient: { color: "#eaf6ff", intensity: 0.85 },
    hemi: { sky: "#bfe4ff", ground: "#6fae52", intensity: 0.7 },
    sun: { color: "#fff4d8", intensity: 1.35, position: [26, 34, 14] },
    track: { top: "#e9c9a8", edge: "#8a5a3c", stripe: "#f4e4cf" },
    ground: { color: "#78bb57", accent: "#5a9a41" },
    props: ["tree", "bush", "lamp", "banner", "fountain", "bench"],
    accent: "#ffcf3d",
  },
  {
    id: "city-dash",
    index: 1,
    name: "City Dash",
    tagline: "Rush hour, bigger crowd",
    range: [11, 20],
    sky: ["#9fc6f0", "#e7f0fb"],
    fog: { color: "#dbe6f4", near: 42, far: 170 },
    ambient: { color: "#eef4ff", intensity: 0.8 },
    hemi: { sky: "#cddffb", ground: "#8790a0", intensity: 0.65 },
    sun: { color: "#fff1d6", intensity: 1.2, position: [24, 32, -10] },
    track: { top: "#9aa3ad", edge: "#4c525c", stripe: "#f2c94c" },
    ground: { color: "#7d8792", accent: "#666f79" },
    props: ["building", "billboard", "streetlamp", "hydrant", "planter", "busstop"],
    accent: "#4ea8ff",
  },
  {
    id: "desert-temple",
    index: 2,
    name: "Desert Temple",
    tagline: "Old stones, sharp traps",
    range: [21, 30],
    sky: ["#f7c98b", "#ffe9c6"],
    fog: { color: "#f2d3a5", near: 40, far: 160 },
    ambient: { color: "#ffe9cf", intensity: 0.9 },
    hemi: { sky: "#ffdca8", ground: "#b98a54", intensity: 0.7 },
    sun: { color: "#ffdca0", intensity: 1.45, position: [22, 30, 16] },
    track: { top: "#d8b483", edge: "#8a663d", stripe: "#efdcc0" },
    ground: { color: "#e0be8c", accent: "#c69f6d" },
    props: ["pillar", "statue", "palm", "urn", "rubble", "arch"],
    accent: "#f0aa33",
  },
  {
    id: "frozen-factory",
    index: 3,
    name: "Frozen Factory",
    tagline: "Ice, gears and crushers",
    range: [31, 40],
    sky: ["#cfe6f2", "#eef7fc"],
    fog: { color: "#dbeaf2", near: 38, far: 155 },
    ambient: { color: "#eef7fc", intensity: 0.85 },
    hemi: { sky: "#dceff8", ground: "#8fa2ad", intensity: 0.7 },
    sun: { color: "#eaf6ff", intensity: 1.15, position: [18, 30, -14] },
    track: { top: "#bfd3dc", edge: "#5b6f79", stripe: "#8fd0e8" },
    ground: { color: "#d7e7ee", accent: "#b7cdd6" },
    props: ["pipe", "gear", "crate", "icespike", "machine", "coolant"],
    accent: "#57d0e6",
  },
  {
    id: "neon-arena",
    index: 4,
    name: "Neon Arena",
    tagline: "Everything you learned, in the dark",
    range: [41, 50],
    sky: ["#181233", "#241a4d"],
    fog: { color: "#1a1440", near: 34, far: 150 },
    ambient: { color: "#4a3f8f", intensity: 0.55 },
    hemi: { sky: "#3b2f7a", ground: "#140f2e", intensity: 0.5 },
    sun: { color: "#b7a6ff", intensity: 0.85, position: [16, 28, 12] },
    track: { top: "#2a2350", edge: "#7a5cff", stripe: "#00e5ff" },
    ground: { color: "#161235", accent: "#241d4f" },
    props: ["pylon", "hologate", "spire", "drone", "beacon", "arch"],
    accent: "#00e5ff",
  },
];

export const WORLD_BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w]));

export function getWorld(id) {
  return WORLD_BY_ID[id] || WORLDS[0];
}

export function worldForLevel(levelId) {
  return WORLDS.find((w) => levelId >= w.range[0] && levelId <= w.range[1]) || WORLDS[0];
}
