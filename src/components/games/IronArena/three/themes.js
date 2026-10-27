/**
 * Iron Arena — visual themes per map: sky, sun, fog, terrain texture layers,
 * water, atmospheric particles and colour grading. Pure data.
 *
 * Terrain layers: L0 is the base; L1..L3 are painted by the map's
 * paint(x, z, h, slope, paths) weights. Each layer = { gen, size (m per
 * tile), opts (generator colours) }. Layer 2 is sampled tri-planar (cliffs).
 */
export const THEMES = {
  desert: {
    sky: { top: "#2f6fc0", mid: "#7fb2e0", horizon: "#f0dcb4", ground: "#c9a878", sun: "#fff3d8", sunSize: 0.9, clouds: 0.25, cloudColor: "#fff8ee", stars: 0 },
    sun: { color: "#fff0d2", intensity: 3.4 },
    hemi: { sky: "#cfe3ff", ground: "#b48c58", intensity: 0.75 },
    fog: { color: "#e6cfa6", density: 0.0038 },
    exposure: 1.0,
    env: 0.9,
    layers: [
      { gen: "sand", size: 9, opts: { c0: "#e2c084", c1: "#bf9455" } },
      { gen: "dirt", size: 7, opts: { c0: "#b0905f", c1: "#8a6b44" } },
      { gen: "rock", size: 11, opts: { c0: "#b08c68", c1: "#7a5c42" } },
      { gen: "dirt", size: 8, opts: { c0: "#c8a676", c1: "#a08058" } },
    ],
    particles: { kind: "dust", color: "#ffe2b0", count: 220 },
    grade: { sat: 1.08, contrast: 1.06, lift: [0.01, 0.005, 0], gain: [1.04, 1.0, 0.94], vignette: 0.35 },
    bloom: { strength: 0.22, threshold: 0.9 },
    ambience: "wind",
  },
  neon: {
    sky: { top: "#04050d", mid: "#120b2a", horizon: "#3a1a52", ground: "#0b0812", sun: "#b8c8ff", sunSize: 0.5, clouds: 0.35, cloudColor: "#3a2a5a", stars: 1, moon: true, cityGlow: "#ff4ad8" },
    sun: { color: "#9db2ff", intensity: 0.9 },
    hemi: { sky: "#7a84c8", ground: "#3a2440", intensity: 1.35 },
    fog: { color: "#1c1230", density: 0.0042 },
    exposure: 1.15,
    env: 1.4,
    wet: true,
    layers: [
      { gen: "asphalt", size: 7, opts: { c0: "#2e3036" } },
      { gen: "tiles", size: 6, opts: { c0: "#4a4c55", c1: "#383a42", grid: 4 } },
      { gen: "concrete", size: 4, opts: { c0: "#e8e2c8", c1: "#c8c0a0", panels: 1 } },
      { gen: "asphalt", size: 5, opts: { c0: "#1d1e22" } },
    ],
    particles: { kind: "rain", color: "#9fb8ff", count: 900 },
    grade: { sat: 1.18, contrast: 1.1, lift: [0.012, 0.0, 0.025], gain: [1.02, 0.96, 1.08], vignette: 0.45 },
    bloom: { strength: 0.6, threshold: 0.72 },
    ambience: "city",
  },
  forest: {
    sky: { top: "#3d7fd0", mid: "#86b8e6", horizon: "#d9ecf2", ground: "#5c6a44", sun: "#fff6dc", sunSize: 0.8, clouds: 0.45, cloudColor: "#ffffff", stars: 0 },
    sun: { color: "#fff2d6", intensity: 3.1 },
    hemi: { sky: "#c4e2ff", ground: "#4a5a2a", intensity: 0.8 },
    fog: { color: "#bcd3dc", density: 0.0042 },
    exposure: 1.0,
    env: 0.85,
    water: { color: "#2f5a4e", deep: "#173a34", opacity: 0.86 },
    layers: [
      { gen: "grass", size: 7, opts: { c0: "#6a9a3c", c1: "#3f6524", c2: "#9aa54c" } },
      { gen: "dirt", size: 6, opts: { c0: "#7d5c3c", c1: "#523a25" } },
      { gen: "rock", size: 9, opts: { c0: "#8d8a80", c1: "#57544c" } },
      { gen: "grass", size: 9, opts: { c0: "#a6b04e", c1: "#6a8a34", c2: "#c8b45a" } },
    ],
    particles: { kind: "pollen", color: "#fff6c0", count: 160 },
    grade: { sat: 1.1, contrast: 1.05, lift: [0, 0.006, 0.004], gain: [1.0, 1.02, 0.98], vignette: 0.35 },
    bloom: { strength: 0.2, threshold: 0.9 },
    ambience: "forest",
  },
  snow: {
    sky: { top: "#6d86a3", mid: "#9fb3c8", horizon: "#e4ecf2", ground: "#cfd9e2", sun: "#f4f8ff", sunSize: 1.4, clouds: 0.8, cloudColor: "#eef3f8", stars: 0 },
    sun: { color: "#e6efff", intensity: 2.2 },
    hemi: { sky: "#dbe8ff", ground: "#8fa0b4", intensity: 1.05 },
    fog: { color: "#d5e0ea", density: 0.0068 },
    exposure: 0.95,
    env: 1.0,
    layers: [
      { gen: "snow", size: 8, opts: { c0: "#f4f8fc", c1: "#c9d6e4" } },
      { gen: "snow", size: 6, opts: { c0: "#c7cfd8", c1: "#9aa6b4" } },
      { gen: "rock", size: 10, opts: { c0: "#7c838c", c1: "#464c55" } },
      { gen: "ice", size: 12, opts: { c0: "#c4e6f4", c1: "#6aa6c6" } },
    ],
    particles: { kind: "snow", color: "#ffffff", count: 1100 },
    grade: { sat: 0.95, contrast: 1.04, lift: [0, 0.006, 0.014], gain: [0.97, 1.0, 1.05], vignette: 0.32 },
    bloom: { strength: 0.25, threshold: 0.88 },
    ambience: "wind",
  },
  harbor: {
    sky: { top: "#3e78bf", mid: "#8db4dc", horizon: "#f2d8b8", ground: "#6c6a64", sun: "#ffe0b4", sunSize: 1.0, clouds: 0.4, cloudColor: "#fff2e2", stars: 0 },
    sun: { color: "#ffdcae", intensity: 3.0 },
    hemi: { sky: "#cfe0ff", ground: "#6a6458", intensity: 0.8 },
    fog: { color: "#cdc8bd", density: 0.0038 },
    exposure: 1.0,
    env: 1.0,
    water: { color: "#2a5a6e", deep: "#123445", opacity: 0.9 },
    layers: [
      { gen: "concrete", size: 8, opts: { c0: "#a6a298", c1: "#7d796f", panels: 2 } },
      { gen: "asphalt", size: 6, opts: { c0: "#3c3e42" } },
      { gen: "concrete", size: 3, opts: { c0: "#e8c040", c1: "#c89a20", panels: 1 } },
      { gen: "concrete", size: 6, opts: { c0: "#6e6a62", c1: "#4c4842", panels: 2 } },
    ],
    particles: { kind: "dust", color: "#f0e6d0", count: 140 },
    grade: { sat: 1.06, contrast: 1.06, lift: [0.008, 0.004, 0], gain: [1.03, 1.0, 0.96], vignette: 0.35 },
    bloom: { strength: 0.22, threshold: 0.9 },
    ambience: "harbor",
  },
};
export const themeFor = (id) => THEMES[id] || THEMES.desert;
