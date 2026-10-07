/**
 * Pirate Cove — authored lighting / weather presets. No real-time day cycle:
 * each adventure names a preset, each region tints it.
 *
 *  sky        [zenith, horizon] gradient
 *  sun        direction (toward the sun), colour, intensity, disc size
 *  hemi       [sky, ground] hemisphere fill + intensity
 *  fog        colour + near/far (linear fog keeps the horizon readable)
 *  water      deep / mid / shallow / foam / sky-reflection colours
 *  clouds     coverage 0..1 + tint
 *  wave       swell amplitude multiplier
 *  rain/lightning  storm toggles
 */

export const ATMOS = {
  morning: {
    sky: ["#5d9fd8", "#ffe3c4"],
    sun: { dir: [0.75, 0.32, -0.55], color: "#ffd9a8", intensity: 2.5, disc: 1.15 },
    hemi: ["#bcdcff", "#7a6a50", 0.75],
    fog: { color: "#e9dccb", near: 260, far: 1050 },
    water: { deep: "#0e5a7a", mid: "#1688a0", shallow: "#3fd0c8", foam: "#f4fbff", sky: "#bfe0f2" },
    clouds: { cover: 0.35, tint: "#fff3e4" },
    wave: 0.75,
  },
  day: {
    sky: ["#3f8fe0", "#cfeaff"],
    sun: { dir: [0.45, 0.78, -0.43], color: "#fff4e0", intensity: 2.9, disc: 1 },
    hemi: ["#cde8ff", "#8a7a5a", 0.85],
    fog: { color: "#cfe6f5", near: 300, far: 1150 },
    water: { deep: "#0a5f86", mid: "#0f93b0", shallow: "#40e0d0", foam: "#ffffff", sky: "#bfe4ff" },
    clouds: { cover: 0.3, tint: "#ffffff" },
    wave: 0.8,
  },
  afternoon: {
    sky: ["#4b86c9", "#f6dcb4"],
    sun: { dir: [-0.62, 0.48, -0.62], color: "#ffe2b0", intensity: 2.7, disc: 1.1 },
    hemi: ["#c4d8f0", "#8a6e4a", 0.75],
    fog: { color: "#e6d6bf", near: 260, far: 1050 },
    water: { deep: "#0d4f72", mid: "#16809c", shallow: "#45c9bd", foam: "#fbf7ee", sky: "#d8dfe6" },
    clouds: { cover: 0.4, tint: "#fff0dc" },
    wave: 0.9,
  },
  sunset: {
    sky: ["#3a3f7a", "#ff9a5a"],
    sun: { dir: [-0.8, 0.14, -0.58], color: "#ffb070", intensity: 2.4, disc: 1.5 },
    hemi: ["#a7a6d6", "#6a4a3a", 0.65],
    fog: { color: "#e9a07a", near: 220, far: 950 },
    water: { deep: "#1d3558", mid: "#2f5a7a", shallow: "#4fa3a3", foam: "#ffe7d4", sky: "#ffb48a" },
    clouds: { cover: 0.45, tint: "#ffb28a" },
    wave: 0.9,
  },
  mist: {
    sky: ["#7f93a0", "#c9d2d2"],
    sun: { dir: [0.3, 0.55, -0.78], color: "#e8eef0", intensity: 1.6, disc: 0.6 },
    hemi: ["#b8c6cc", "#55574a", 0.95],
    fog: { color: "#b9c4c4", near: 70, far: 520 },
    water: { deep: "#123c48", mid: "#1d5a64", shallow: "#3e8f88", foam: "#e6eeee", sky: "#b9c6c8" },
    clouds: { cover: 0.85, tint: "#d7dfe0" },
    wave: 0.8,
  },
  storm: {
    sky: ["#252b36", "#56606c"],
    sun: { dir: [0.2, 0.6, -0.77], color: "#aeb8c8", intensity: 1.15, disc: 0 },
    hemi: ["#7c8796", "#2f2f2c", 0.95],
    fog: { color: "#454e59", near: 110, far: 620 },
    water: { deep: "#0d1f2a", mid: "#1b3a46", shallow: "#36706e", foam: "#d6e2e6", sky: "#5c6874" },
    clouds: { cover: 1, tint: "#4a525e" },
    wave: 1.55,
    rain: 1,
    lightning: true,
  },
  night: {
    sky: ["#070d1f", "#24365a"],
    sun: { dir: [-0.35, 0.6, 0.72], color: "#9fb6e8", intensity: 0.9, disc: 0.7, moon: true },
    hemi: ["#30466e", "#141820", 0.85],
    fog: { color: "#18233a", near: 130, far: 700 },
    water: { deep: "#04101e", mid: "#0b2236", shallow: "#1b4a5a", foam: "#a8c4dc", sky: "#2a3e62" },
    clouds: { cover: 0.35, tint: "#33456a" },
    wave: 0.95,
  },
  cursed: {
    sky: ["#120f22", "#4a3a5c"],
    sun: { dir: [0.5, 0.35, 0.79], color: "#c8b8ff", intensity: 1.1, disc: 1.3, moon: true },
    hemi: ["#4a4670", "#1a1a1e", 0.85],
    fog: { color: "#2c2a3e", near: 90, far: 600 },
    water: { deep: "#070b18", mid: "#121c32", shallow: "#235050", foam: "#b4d8d0", sky: "#40385a" },
    clouds: { cover: 0.65, tint: "#4a3f60" },
    wave: 1.05,
    glow: "#56f0b0",
  },
};

export function atmosFor(adv) {
  const base = ATMOS[adv.atmos] || ATMOS.day;
  return { ...base, id: adv.atmos };
}
