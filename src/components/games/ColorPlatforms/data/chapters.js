/**
 * Color Platforms — five chapters of ten levels. `sky` / `layers` drive the
 * procedural background (render/background.js); `ui` tints the HUD; `music`
 * picks the synth variant.
 */
export const CHAPTERS = [
  {
    id: 1,
    name: "FIRST COLORS",
    blurb: "Blue, red, yellow — and the one rule.",
    sky: ["#1d2f6b", "#3f6cc4", "#8fc0f0", "#d9ecff"],
    layers: { kind: "hills", far: "#5b86c9", mid: "#3c6aa8", near: "#2c5a8c", cloud: "rgba(255,255,255,0.5)", glow: "rgba(255,240,200,0.35)" },
    ui: ["#6fb2ff", "#b8dcff"],
    music: 0,
  },
  {
    id: 2,
    name: "MOVING COLORS",
    blurb: "Platforms on the move. Time it, then switch.",
    sky: ["#24164a", "#7a2f73", "#e0676b", "#ffc17f"],
    layers: { kind: "mesas", far: "#9b4a78", mid: "#6e3266", near: "#4a2152", cloud: "rgba(255,206,170,0.45)", glow: "rgba(255,190,120,0.45)" },
    ui: ["#ff9d7a", "#ffd2a8"],
    music: 1,
  },
  {
    id: 3,
    name: "FADING PATH",
    blurb: "Land once. Keep moving. It won't wait.",
    sky: ["#140c2c", "#34205e", "#6a4597", "#a685c9"],
    layers: { kind: "ruins", far: "#4f3780", mid: "#3a2766", near: "#281a4d", cloud: "rgba(214,196,255,0.32)", glow: "rgba(190,150,255,0.35)" },
    ui: ["#b993ff", "#e2d2ff"],
    music: 2,
  },
  {
    id: 4,
    name: "COLOR HEIGHTS",
    blurb: "Bounce high, switch in the air.",
    sky: ["#173a86", "#2f73c9", "#77b6ee", "#e3f3ff"],
    layers: { kind: "towers", far: "rgba(150,195,240,0.55)", mid: "rgba(70,120,190,0.55)", near: "#3e6fae", cloud: "rgba(255,255,255,0.6)", glow: "rgba(255,255,255,0.4)" },
    ui: ["#7fd0ff", "#d4f0ff"],
    music: 3,
  },
  {
    id: 5,
    name: "COLOR MASTER",
    blurb: "Everything you know, all at once.",
    sky: ["#04061a", "#0b1235", "#18204f", "#2a2f66"],
    layers: { kind: "geo", far: "#1d2660", mid: "#151c4a", near: "#0e1438", cloud: "rgba(120,255,200,0.22)", glow: "rgba(140,120,255,0.4)" },
    ui: ["#7dffcf", "#c9b8ff"],
    music: 4,
  },
];

export const getChapter = (id) => CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, (id || 1) - 1))];
