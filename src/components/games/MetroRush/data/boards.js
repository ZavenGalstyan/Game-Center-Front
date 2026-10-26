/**
 * Metro Rush — hoverboards. Riding one (press B / double-tap / the HUD
 * button) spends one charge and absorbs one crash for up to 30 seconds.
 * Boards are cosmetic: deck shape, colours, glow and trail.
 */
export const BOARDS = [
  { id: "breeze", name: "Breeze", price: 0, shape: "classic", deck: "#2fb0ff", stripe: "#ffffff", under: "#1d2a3a", glow: "#7fd6ff", trail: "#bfeaff", blurb: "The trusty starter deck." },
  { id: "neonwave", name: "Neon Wave", price: 1200, shape: "fin", deck: "#1b1830", stripe: "#ff2bd6", under: "#29f0ff", glow: "#ff2bd6", trail: "#29f0ff", blurb: "Leaves a pink-and-cyan wake." },
  { id: "lava", name: "Lava Rider", price: 2200, shape: "flame", deck: "#2a1410", stripe: "#ff6b2b", under: "#ffcf3a", glow: "#ff5a1f", trail: "#ffb21f", blurb: "Glows like a fresh volcano." },
  { id: "frost", name: "Frost Byte", price: 3200, shape: "twin", deck: "#eaf6ff", stripe: "#4fb6ff", under: "#9fd8ff", glow: "#bfefff", trail: "#ffffff", blurb: "Twin-tip, ice-cold sparkle." },
  { id: "comet", name: "Golden Comet", price: 5000, shape: "wing", deck: "#ffcf3a", stripe: "#ffffff", under: "#b8860b", glow: "#ffe27a", trail: "#fff1b0", blurb: "Winged gold with a starry tail." },
  { id: "sakura", name: "Sakura Drift", price: 7000, shape: "fin", deck: "#ffd6e6", stripe: "#ff5fa8", under: "#7a3cff", glow: "#ff8fc0", trail: "#ffc0dc", blurb: "Petals swirl behind you." },
];

export const boardById = (id) => BOARDS.find((b) => b.id === id) || BOARDS[0];

/** charges are bought in the Shop */
export const BOARD_PACKS = [
  { id: "one", count: 1, price: 300 },
  { id: "three", count: 3, price: 750 },
  { id: "ten", count: 10, price: 2200 },
];
