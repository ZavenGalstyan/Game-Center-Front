/**
 * Laser Maze — the ten worlds. Each world owns a full visual identity
 * (backdrop, board material, wall style, target style, ambient particles,
 * accent lighting) while every interaction rule stays identical.
 *
 * `wall`, `target`, `ambient` and `deco` are style keys read by
 * components/pieces.jsx and components/Backdrop.jsx.
 */

export const WORLDS = [
  {
    id: 1,
    name: "First Light",
    subtitle: "The beginner light laboratory",
    mechanic: "Mirrors",
    bg0: "#050b1a", bg1: "#0b1a33", bg2: "#12305a",
    accent: "#35e0ff", accent2: "#8ff3ff",
    tile: "#0f213d", tileEdge: "#1c3a63", board: "#0a1730", frame: "#1d4a73",
    text: "#eaf6ff", dim: "#86a3c4",
    wall: "lab", target: "lens", ambient: "motes", deco: "lab",
  },
  {
    id: 2,
    name: "Crystal Caves",
    subtitle: "Glowing minerals deep underground",
    mechanic: "Multiple targets · Splitters",
    bg0: "#07051a", bg1: "#150c33", bg2: "#2a1552",
    accent: "#a67bff", accent2: "#6fd6ff",
    tile: "#1a1430", tileEdge: "#2d2350", board: "#120d24", frame: "#3e2a6e",
    text: "#f1ebff", dim: "#a497c8",
    wall: "crystal", target: "geode", ambient: "sparkle", deco: "cave",
  },
  {
    id: 3,
    name: "Color Garden",
    subtitle: "A magical garden of living light",
    mechanic: "Colored lasers",
    bg0: "#04140f", bg1: "#0a2a20", bg2: "#1a3f2e",
    accent: "#ff7ac6", accent2: "#7dffb2",
    tile: "#10291f", tileEdge: "#1f4533", board: "#0b2018", frame: "#2d6048",
    text: "#effff6", dim: "#93bfa9",
    wall: "hedge", target: "bloom", ambient: "petals", deco: "garden",
  },
  {
    id: 4,
    name: "Ancient Temple",
    subtitle: "Stone mechanisms that wake to light",
    mechanic: "Switches & gates",
    bg0: "#120c05", bg1: "#241808", bg2: "#3d2a10",
    accent: "#ffc35a", accent2: "#ffe3a3",
    tile: "#2a2114", tileEdge: "#43341d", board: "#1f180d", frame: "#6b5227",
    text: "#fff5e3", dim: "#c4ae86",
    wall: "stone", target: "sun", ambient: "dust", deco: "temple",
  },
  {
    id: 5,
    name: "Prism Palace",
    subtitle: "Where white light breaks into color",
    mechanic: "Prisms",
    bg0: "#0c0a1c", bg1: "#1a1638", bg2: "#2c2458",
    accent: "#ffffff", accent2: "#ffb3f0",
    tile: "#1c1a36", tileEdge: "#34305c", board: "#15132b", frame: "#5a5292",
    text: "#fbf8ff", dim: "#aca5d0",
    wall: "glass", target: "facet", ambient: "rainbow", deco: "palace",
  },
  {
    id: 6,
    name: "Frozen Reflections",
    subtitle: "An ice palace of sliding mirrors",
    mechanic: "Movable mirrors",
    bg0: "#06121c", bg1: "#0d2335", bg2: "#1a3d57",
    accent: "#9fe8ff", accent2: "#ffffff",
    tile: "#12293b", tileEdge: "#24475f", board: "#0e2130", frame: "#4b7fa0",
    text: "#f0fbff", dim: "#9bbcd0",
    wall: "ice", target: "snowflake", ambient: "snow", deco: "frozen",
  },
  {
    id: 7,
    name: "Neon Circuit",
    subtitle: "Filters, mixers and humming circuitry",
    mechanic: "Filters & color mixing",
    bg0: "#05050b", bg1: "#0d0d1c", bg2: "#171733",
    accent: "#ff2bd6", accent2: "#2bffe9",
    tile: "#12121f", tileEdge: "#23233d", board: "#0b0b16", frame: "#3a2a6b",
    text: "#f5f3ff", dim: "#9a98bd",
    wall: "circuit", target: "node", ambient: "pulses", deco: "neon",
  },
  {
    id: 8,
    name: "Portal Chambers",
    subtitle: "Light that folds through space",
    mechanic: "Portals",
    bg0: "#08041a", bg1: "#140a2e", bg2: "#221250",
    accent: "#b14dff", accent2: "#3df2ff",
    tile: "#171029", tileEdge: "#2c1f4b", board: "#100a1f", frame: "#4a2a85",
    text: "#f3ecff", dim: "#a193c7",
    wall: "obsidian", target: "ring", ambient: "rings", deco: "portal",
  },
  {
    id: 9,
    name: "Clockwork Light",
    subtitle: "Brass gears turning in warm light",
    mechanic: "Gears, cranks & shutters",
    bg0: "#110a05", bg1: "#23150a", bg2: "#3b2412",
    accent: "#ff9d3b", accent2: "#ffd08a",
    tile: "#2a1d12", tileEdge: "#46311c", board: "#1e140b", frame: "#8a5a24",
    text: "#fff3e6", dim: "#c7a887",
    wall: "brass", target: "dial", ambient: "embers", deco: "clockwork",
  },
  {
    id: 10,
    name: "Cosmic Light",
    subtitle: "Every rule of light, among the stars",
    mechanic: "Everything combined",
    bg0: "#02020a", bg1: "#0a0a22", bg2: "#1b1145",
    accent: "#7cf0ff", accent2: "#ff8af0",
    tile: "#0e0e26", tileEdge: "#1f1f48", board: "#08081a", frame: "#3d3d8f",
    text: "#f4f4ff", dim: "#9a9ad0",
    wall: "asteroid", target: "star", ambient: "stars", deco: "cosmic",
  },
];

export const LEVELS_PER_WORLD = 10;

export function worldOf(levelId) {
  return WORLDS[Math.min(WORLDS.length, Math.ceil(levelId / LEVELS_PER_WORLD)) - 1];
}

export function worldLevelIds(worldId) {
  const first = (worldId - 1) * LEVELS_PER_WORLD + 1;
  return Array.from({ length: LEVELS_PER_WORLD }, (_, i) => first + i);
}
