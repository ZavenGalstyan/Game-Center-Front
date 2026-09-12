/**
 * Liquid Sort — cosmetic bottle styles & background themes.
 * All of these only change appearance: capacity, gameplay and liquid
 * visibility stay identical across every style/theme.
 */
export const BOTTLE_STYLES = [
  { id: "classic", name: "Classic", unlockLevel: 0 },
  { id: "round", name: "Round", unlockLevel: 20 },
  { id: "tall", name: "Tall", unlockLevel: 40 },
  { id: "lab", name: "Lab Flask", unlockLevel: 60 },
  { id: "elegant", name: "Elegant", unlockLevel: 80 },
  { id: "legend", name: "Legend", unlockLevel: 100 },
];

/**
 * Same CSS-variable contract as a chapter theme (data/chapters.js) — the
 * `.ls` root just applies whichever palette is active as inline custom
 * properties, so menu/level-select/settings/stats and gameplay all read
 * from one consistent set of variable names. Every theme is a dark variant
 * (deep navy/blue-black base) with ONE restrained accent pair — the liquid
 * colors stay the visual hero, not the chrome.
 */
export const THEMES = [
  {
    id: "soft-lab", name: "Soft Lab", unlockLevel: 0,
    bg0: "#0a0e18", bg1: "#0d1424", panel: "#141b2e", line: "rgba(255,255,255,0.09)",
    accent: "#22d3ee", accent2: "#67e8f9", text: "#eef2f8", dim: "#8b97ad", surface: "#0e7490",
  },
  {
    id: "midnight-glass", name: "Midnight Glass", unlockLevel: 25,
    bg0: "#0a0b17", bg1: "#0e1130", panel: "#161a3a", line: "rgba(255,255,255,0.09)",
    accent: "#5b8def", accent2: "#93c5fd", text: "#eaeeff", dim: "#8f97c2", surface: "#2451c7",
  },
  {
    id: "sunset-studio", name: "Sunset Studio", unlockLevel: 45,
    bg0: "#160c14", bg1: "#231226", panel: "#2e1830", line: "rgba(255,255,255,0.09)",
    accent: "#f7975a", accent2: "#fbc99a", text: "#f7eef4", dim: "#b699ac", surface: "#c2600a",
  },
  {
    id: "aqua-room", name: "Aqua Room", unlockLevel: 65,
    bg0: "#061616", bg1: "#0a2020", panel: "#0f2b2b", line: "rgba(255,255,255,0.09)",
    accent: "#4dd0c4", accent2: "#9df0e6", text: "#eafcfb", dim: "#87b8b3", surface: "#0f766e",
  },
  {
    id: "neon-lab", name: "Neon Lab", unlockLevel: 90,
    bg0: "#08060f", bg1: "#0f0a1f", panel: "#170f2c", line: "rgba(255,255,255,0.09)",
    accent: "#e879c8", accent2: "#f3a8e0", text: "#f4eeff", dim: "#a08fc4", surface: "#a3268f",
  },
];

export function styleById(id) {
  return BOTTLE_STYLES.find((s) => s.id === id) || BOTTLE_STYLES[0];
}
export function themeById(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
