/**
 * Water Tanks — cosmetic glass styles. Purely visual: they only change CSS
 * variables on the tanks (glass tint, rim, metal, water gradient). Each
 * keeps a bright surface line and a deep water body so the level reads
 * clearly against the dark lab. Unlocked by total stars — no currency.
 */
export const STYLES = [
  {
    id: "classic", name: "Classic Glass", stars: 0, blurb: "Clear lab glass, bright blue water.",
    vars: { glassTint: "#cfeeff", glassEdge: "#e6f7ff", rimHi: "#f4fbff", rimLo: "#8fb4c8", metalHi: "#d9e4ec", metalMid: "#93a7b5", metalLo: "#4c5e6c", waterTop: "#7fe3ff", waterMid: "#2aa9ec", waterDeep: "#0b4f9c", surface: "#e8fbff" },
  },
  {
    id: "ocean", name: "Ocean Glass", stars: 10, blurb: "Blue-tinted glass, deep sea water.",
    vars: { glassTint: "#7fc8ff", glassEdge: "#a9dcff", rimHi: "#d7efff", rimLo: "#4f86b8", metalHi: "#b9cde0", metalMid: "#6c87a3", metalLo: "#2f4560", waterTop: "#5ff0ff", waterMid: "#139bd0", waterDeep: "#06336e", surface: "#d9fdff" },
  },
  {
    id: "frosted", name: "Frosted Lab", stars: 25, blurb: "Satin glass with a crisp cyan fill.",
    vars: { glassTint: "#ffffff", glassEdge: "#ffffff", rimHi: "#ffffff", rimLo: "#b8c7d1", metalHi: "#f0f3f6", metalMid: "#b3bec7", metalLo: "#6c7a85", waterTop: "#9ef7ff", waterMid: "#27c3e6", waterDeep: "#0a5f8f", surface: "#f2feff", frost: 1 },
  },
  {
    id: "emerald", name: "Emerald Glass", stars: 45, blurb: "Green glass, clear aqua water.",
    vars: { glassTint: "#8cf0c4", glassEdge: "#b8ffd9", rimHi: "#dcfff0", rimLo: "#3e9a76", metalHi: "#c8dccf", metalMid: "#7a998a", metalLo: "#33503f", waterTop: "#8affea", waterMid: "#1fc2b8", waterDeep: "#065a6a", surface: "#e6fff9" },
  },
  {
    id: "amber", name: "Amber Lab", stars: 70, blurb: "Brass fittings and warm amber rims.",
    vars: { glassTint: "#ffe2b0", glassEdge: "#ffe9c2", rimHi: "#ffe7a8", rimLo: "#b07a2a", metalHi: "#f3d38a", metalMid: "#b8893a", metalLo: "#5e3f12", waterTop: "#86e6ff", waterMid: "#2b9fe0", waterDeep: "#0d4a8f", surface: "#eefcff" },
  },
  {
    id: "midnight", name: "Midnight Glass", stars: 100, blurb: "Smoked glass with luminous water.",
    vars: { glassTint: "#5a6aa8", glassEdge: "#9aa8e8", rimHi: "#c5ceff", rimLo: "#3a4380", metalHi: "#8a94c4", metalMid: "#4a5285", metalLo: "#1d2246", waterTop: "#8cf6ff", waterMid: "#2fd0ff", waterDeep: "#2348c8", surface: "#f0fdff" },
  },
];

export const styleById = (id) => STYLES.find((s) => s.id === id) || STYLES[0];

export function styleVars(id) {
  const v = styleById(id).vars;
  return {
    "--wt-glass-tint": v.glassTint, "--wt-glass-edge": v.glassEdge, "--wt-rim-hi": v.rimHi, "--wt-rim-lo": v.rimLo,
    "--wt-metal-hi": v.metalHi, "--wt-metal-mid": v.metalMid, "--wt-metal-lo": v.metalLo,
    "--wt-water-top": v.waterTop, "--wt-water-mid": v.waterMid, "--wt-water-deep": v.waterDeep, "--wt-surface": v.surface,
    "--wt-frost": v.frost ? 1 : 0,
  };
}
