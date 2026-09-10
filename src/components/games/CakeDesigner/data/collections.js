/**
 * Cake Designer — the five order collections.
 *
 * Each collection owns 10 levels (ids are 1-indexed and contiguous:
 * birthday 1-10, bakery 11-20, ...). `theme` tokens tint the editor / menu
 * atmosphere without touching the global Game Center theme. `unlockAfter` is
 * the campaign level that must be completed before the collection opens.
 */

export const COLLECTIONS = [
  {
    id: "birthday",
    name: "Birthday Party",
    tagline: "Bright, fun and full of colour",
    range: [1, 10],
    unlockAfter: 0,
    theme: {
      bg0: "#2a1430", bg1: "#3a1c44", panel: "#3d2049", line: "#5b3168",
      accent: "#ff9ec7", accent2: "#ffd166", text: "#fdeef7", dim: "#d7b8d9",
    },
    preview: { shape: "round", layers: [{ color: "pink", frosting: "vanilla" }], drip: "none", scatter: "sprinkles", topping: "strawberry" },
  },
  {
    id: "bakery",
    name: "Sweet Bakery",
    tagline: "Cosy, warm, cocoa and berries",
    range: [11, 20],
    unlockAfter: 10,
    theme: {
      bg0: "#241811", bg1: "#33241a", panel: "#392a1e", line: "#57402d",
      accent: "#d99a5b", accent2: "#e8c46b", text: "#f7ecdd", dim: "#d0b596",
    },
    preview: { shape: "square", layers: [{ color: "chocolate", frosting: "chocolate" }], drip: "caramel", scatter: null, topping: "macaron" },
  },
  {
    id: "wedding",
    name: "Wedding Collection",
    tagline: "Elegant, soft and romantic",
    range: [21, 30],
    unlockAfter: 20,
    theme: {
      bg0: "#20222b", bg1: "#2b2e39", panel: "#31343f", line: "#484c5b",
      accent: "#e7d8b8", accent2: "#cbd6c4", text: "#f6f3ec", dim: "#c0c2c9",
    },
    preview: { shape: "round", layers: [{ color: "white", frosting: "fondant" }, { color: "cream", frosting: "fondant" }, { color: "white", frosting: "fondant" }], drip: "none", scatter: "pearls", topping: null, decoration: "white-rose" },
  },
  {
    id: "luxury",
    name: "Luxury Patisserie",
    tagline: "Dark chocolate, gold and marble",
    range: [31, 40],
    unlockAfter: 30,
    theme: {
      bg0: "#141317", bg1: "#1d1b22", panel: "#232028", line: "#3a3542",
      accent: "#e8c46b", accent2: "#b892d8", text: "#f2eef6", dim: "#b6adc2",
    },
    preview: { shape: "hexagon", layers: [{ color: "black", frosting: "velvet" }, { color: "chocolate", frosting: "marble" }], drip: "gold", scatter: "gold-leaf", topping: "choc-curl" },
  },
  {
    id: "fantasy",
    name: "Fantasy Cakes",
    tagline: "Rainbows, galaxies and magic",
    range: [41, 50],
    unlockAfter: 40,
    theme: {
      bg0: "#171634", bg1: "#221f4a", panel: "#282456", line: "#403a7a",
      accent: "#8be0ff", accent2: "#ff9ee7", text: "#eef0ff", dim: "#b7b6e6",
    },
    preview: { shape: "star", layers: [{ color: "lavender", frosting: "galaxy" }, { color: "sky", frosting: "galaxy" }, { color: "pink", frosting: "whipped" }], drip: "pink", scatter: "sparkle-field", decoration: "unicorn-horn" },
  },
];

export const COLLECTION_BY_ID = Object.fromEntries(COLLECTIONS.map((c) => [c.id, c]));

export function collectionOfLevel(id) {
  return COLLECTIONS.find((c) => id >= c.range[0] && id <= c.range[1]) || COLLECTIONS[0];
}

export const TOTAL_LEVELS = 50;
