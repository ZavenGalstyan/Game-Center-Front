/**
 * Shadow Runner — district palettes and seeded parallax skylines.
 */

export const THEMES = [
  {
    // Harbor Rooftops — dusk over the docks
    sky: ["#1d1530", "#5b2a45", "#c2563a", "#f2a35e"],
    sun: { x: 0.72, y: 0.4, r: 80, color: "#ffd8a0", glow: "rgba(255,170,90,0.35)" },
    layers: [
      { f: 0.08, color: "#6b3448", min: 90, max: 220, kind: "far" },
      { f: 0.2, color: "#3d1f33", min: 130, max: 300, kind: "cranes" },
      { f: 0.42, color: "#22121f", min: 160, max: 340, kind: "mid" },
    ],
    fog: "rgba(240,140,90,0.16)",
    window: "rgba(255,196,120,0.75)",
    facade: "#120c16",
    facade2: "#1b1220",
    rim: "#ff9a4d",
    solid: "#0b080e",
    accent: "#ff9a4d",
    accent2: "#ffd36b",
    plank: "#2a1a1a",
  },
  {
    // Neon Market — night signage and haze
    sky: ["#04020c", "#120827", "#2a0d44", "#4a1257"],
    sun: { x: 0.2, y: 0.24, r: 26, color: "#e9e2ff", glow: "rgba(170,140,255,0.22)" },
    layers: [
      { f: 0.08, color: "#1c1238", min: 140, max: 320, kind: "far" },
      { f: 0.22, color: "#140b2a", min: 160, max: 360, kind: "neon" },
      { f: 0.44, color: "#0c0619", min: 180, max: 380, kind: "signs" },
    ],
    fog: "rgba(255,62,165,0.1)",
    window: "rgba(120,230,255,0.7)",
    facade: "#09060f",
    facade2: "#120a1c",
    rim: "#ff3ea5",
    solid: "#060409",
    accent: "#ff3ea5",
    accent2: "#39e6ff",
    plank: "#1a1026",
  },
  {
    // Ironworks — furnace glow and smoke
    sky: ["#0e0705", "#2b130a", "#6b2a10", "#c2581b"],
    sun: { x: 0.55, y: 0.6, r: 120, color: "#ff8a3a", glow: "rgba(255,110,40,0.3)" },
    layers: [
      { f: 0.08, color: "#4a1f10", min: 100, max: 240, kind: "far" },
      { f: 0.2, color: "#2c130b", min: 140, max: 360, kind: "stacks" },
      { f: 0.42, color: "#190b07", min: 160, max: 330, kind: "mid" },
    ],
    fog: "rgba(255,120,40,0.13)",
    window: "rgba(255,170,70,0.7)",
    facade: "#0f0907",
    facade2: "#18100b",
    rim: "#ffb547",
    solid: "#090604",
    accent: "#ffb547",
    accent2: "#ff6a2a",
    plank: "#2b1a10",
  },
  {
    // Skyline Spire — thunderstorm over glass towers
    sky: ["#03050a", "#0a1222", "#16233a", "#25385a"],
    sun: null,
    layers: [
      { f: 0.08, color: "#152238", min: 200, max: 420, kind: "towers" },
      { f: 0.22, color: "#0e1829", min: 220, max: 440, kind: "towers" },
      { f: 0.44, color: "#08101c", min: 180, max: 380, kind: "mid" },
    ],
    fog: "rgba(120,170,230,0.1)",
    window: "rgba(160,215,255,0.65)",
    facade: "#070b12",
    facade2: "#0d1420",
    rim: "#6fd3ff",
    solid: "#04070c",
    accent: "#6fd3ff",
    accent2: "#c8f0ff",
    plank: "#141e2c",
  },
];

/** Small deterministic PRNG. */
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TILE = 1600;

/** A repeating strip of silhouettes for one parallax layer. */
export function buildLayer(layer, seed) {
  const r = rng(seed);
  const items = [];
  let x = 0;
  while (x < TILE) {
    const w = 40 + r() * 120;
    const h = layer.min + r() * (layer.max - layer.min);
    const it = { x, w, h, windows: [], extra: null };
    const kind = layer.kind;
    if (kind === "cranes" && r() < 0.28) it.extra = { type: "crane", h: h + 120 + r() * 80, arm: 120 + r() * 100 };
    else if (kind === "stacks" && r() < 0.45) it.extra = { type: "stack", h: h + 80 + r() * 140, w: 16 + r() * 14 };
    else if (kind === "towers" && r() < 0.35) it.extra = { type: "spire", h: 40 + r() * 90 };
    else if ((kind === "neon" || kind === "signs") && r() < 0.5)
      it.extra = { type: "sign", y: 20 + r() * (h * 0.5), w: Math.min(w - 10, 30 + r() * 60), h: 12 + r() * 26, hue: r() < 0.5 ? 0 : 1 };
    else if (r() < 0.2) it.extra = { type: "antenna", h: 20 + r() * 50 };
    if (kind !== "far") {
      const n = Math.floor(r() * (kind === "mid" ? 8 : 5));
      for (let i = 0; i < n; i++) it.windows.push({ x: 6 + r() * (w - 16), y: 14 + r() * (h - 30), w: kind === "towers" ? 3 : 5, h: kind === "towers" ? 5 : 7 });
    }
    items.push(it);
    x += w + (kind === "far" ? r() * 10 : 4 + r() * 30);
  }
  return items;
}
