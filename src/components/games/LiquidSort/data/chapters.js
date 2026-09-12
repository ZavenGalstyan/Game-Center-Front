/**
 * Liquid Sort — the five campaign chapters. 20 levels each, 100 total.
 * `theme` tints gameplay/results with ONE restrained accent per chapter —
 * the dark base (bg/panel/line/text) stays the same everywhere in the game;
 * only the accent (and a secondary accent) shifts. This keeps the liquid
 * colors as the visual hero instead of the chrome competing with them.
 * Never touches the global Game Center styling.
 */
const DARK_BASE = { bg0: "#0a0e18", bg1: "#0d1424", panel: "#141b2e", line: "rgba(255,255,255,0.09)", text: "#eef2f8", dim: "#8b97ad" };

export const CHAPTERS = [
  {
    id: "first-drops",
    name: "First Drops",
    tagline: "Learn to pour",
    range: [1, 20],
    difficulty: "Easy",
    theme: { ...DARK_BASE, accent: "#22d3ee", accent2: "#67e8f9", surface: "#0e7490" },
  },
  {
    id: "color-mix",
    name: "Color Mix",
    tagline: "Plan ahead",
    range: [21, 40],
    difficulty: "Easy → Medium",
    theme: { ...DARK_BASE, accent: "#5b8def", accent2: "#93c5fd", surface: "#2451c7" },
  },
  {
    id: "deep-sort",
    name: "Deep Sort",
    tagline: "Dig through the layers",
    range: [41, 60],
    difficulty: "Medium",
    theme: { ...DARK_BASE, accent: "#a78bfa", accent2: "#c4b5fd", surface: "#6d28d9" },
  },
  {
    id: "master-pour",
    name: "Master Pour",
    tagline: "Every move counts",
    range: [61, 80],
    difficulty: "Medium → Hard",
    theme: { ...DARK_BASE, accent: "#f7b955", accent2: "#fde68a", surface: "#c2740a" },
  },
  {
    id: "liquid-legend",
    name: "Liquid Legend",
    tagline: "The final formulas",
    range: [81, 100],
    difficulty: "Hard",
    theme: { ...DARK_BASE, accent: "#f472b6", accent2: "#e9a4f1", surface: "#a3268f" },
  },
];

export function chapterOfLevel(id) {
  return CHAPTERS.find((c) => id >= c.range[0] && id <= c.range[1]) || CHAPTERS[0];
}

export const TOTAL_LEVELS = 100;
