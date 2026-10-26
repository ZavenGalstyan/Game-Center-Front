/**
 * Metro Rush — the crew. All original characters; three/models.js builds
 * them from these descriptions (hair style, accessory, colours, build).
 * Prices are in in-game coins only.
 */
export const CHARACTERS = [
  {
    id: "kai",
    name: "Kai",
    tagline: "Skate-park kid who never takes the long way.",
    price: 0,
    hair: "cap",
    accessory: "backpack",
    build: { h: 1, w: 1 },
    outfits: [
      { id: "classic", name: "Street Classic", price: 0, c: { skin: "#f1c29a", hair: "#3a2416", top: "#ff7a1a", top2: "#ffd23a", pants: "#2f5d9a", shoes: "#ffffff", sole: "#ff3a3a", hat: "#1f8fff", acc: "#2a3440" } },
      { id: "midnight", name: "Midnight Hoodie", price: 600, c: { skin: "#f1c29a", hair: "#3a2416", top: "#29324a", top2: "#29f0ff", pants: "#14161f", shoes: "#29f0ff", sole: "#ffffff", hat: "#ff2bd6", acc: "#ff2bd6" } },
    ],
  },
  {
    id: "luna",
    name: "Luna",
    tagline: "Graffiti artist with rocket-fast sneakers.",
    price: 900,
    hair: "pony",
    accessory: "headphones",
    build: { h: 0.97, w: 0.95 },
    outfits: [
      { id: "classic", name: "Violet Jacket", price: 0, c: { skin: "#d9a27a", hair: "#ff5fa8", top: "#7a3cff", top2: "#ffffff", pants: "#18b6c9", shoes: "#ffe53b", sole: "#ffffff", hat: "#ff5fa8", acc: "#1d1d26" } },
      { id: "sunset", name: "Sunset Track", price: 700, c: { skin: "#d9a27a", hair: "#ffcf3a", top: "#ff6b2b", top2: "#ffe0a0", pants: "#3a2a5a", shoes: "#ffffff", sole: "#ff6b2b", hat: "#ffcf3a", acc: "#ffffff" } },
    ],
  },
  {
    id: "rex",
    name: "Rex",
    tagline: "Courier legend — no package ever late.",
    price: 1800,
    hair: "beanie",
    accessory: "bag",
    build: { h: 1.06, w: 1.08 },
    outfits: [
      { id: "classic", name: "Green Courier", price: 0, c: { skin: "#8a5a3c", hair: "#1a1410", top: "#2fa84f", top2: "#e9f5d8", pants: "#3a3f4a", shoes: "#ff8a1f", sole: "#2a2a2a", hat: "#ffcf3a", acc: "#7a4a2a" } },
      { id: "arctic", name: "Arctic Shift", price: 800, c: { skin: "#8a5a3c", hair: "#1a1410", top: "#eaf4ff", top2: "#4fb6ff", pants: "#2a4f73", shoes: "#4fb6ff", sole: "#ffffff", hat: "#4fb6ff", acc: "#2a4f73" } },
    ],
  },
  {
    id: "zara",
    name: "Zara",
    tagline: "Parkour champion of the rooftop league.",
    price: 3000,
    hair: "buns",
    accessory: "scarf",
    build: { h: 0.99, w: 0.96 },
    outfits: [
      { id: "classic", name: "Crimson Runner", price: 0, c: { skin: "#c88a62", hair: "#2a1a14", top: "#e8323a", top2: "#ffffff", pants: "#1f2333", shoes: "#ffffff", sole: "#e8323a", hat: "#2a1a14", acc: "#ffcf3a" } },
      { id: "jade", name: "Jade Storm", price: 900, c: { skin: "#c88a62", hair: "#2a1a14", top: "#12a37a", top2: "#ffe9a8", pants: "#f4f0e6", shoes: "#12a37a", sole: "#ffffff", hat: "#2a1a14", acc: "#ff6b8a" } },
    ],
  },
  {
    id: "bolt",
    name: "Bolt",
    tagline: "Delivery robot who learned to love the rush.",
    price: 4500,
    hair: "antenna",
    accessory: "jets",
    robot: true,
    build: { h: 1.02, w: 1.05 },
    outfits: [
      { id: "classic", name: "Factory Chrome", price: 0, c: { skin: "#cfd8e0", hair: "#ff3a3a", top: "#ffb21f", top2: "#2a3440", pants: "#7d8a96", shoes: "#2a3440", sole: "#ffb21f", hat: "#29f0ff", acc: "#29f0ff" } },
      { id: "stealth", name: "Stealth Mode", price: 1200, c: { skin: "#3a3f4a", hair: "#7cff4f", top: "#1d2028", top2: "#7cff4f", pants: "#2a2e38", shoes: "#14161c", sole: "#7cff4f", hat: "#7cff4f", acc: "#7cff4f" } },
    ],
  },
  {
    id: "nova",
    name: "Nova",
    tagline: "Space-camp graduate with zero-gravity style.",
    price: 6500,
    hair: "helmet",
    accessory: "jets",
    build: { h: 1.0, w: 1.0 },
    outfits: [
      { id: "classic", name: "Orbit Suit", price: 0, c: { skin: "#f0c8a8", hair: "#ffffff", top: "#f4f6fa", top2: "#ff6b2b", pants: "#c9d2dd", shoes: "#ff6b2b", sole: "#ffffff", hat: "#9b6bff", acc: "#29f0ff" } },
      { id: "nebula", name: "Nebula Drift", price: 1500, c: { skin: "#f0c8a8", hair: "#ffffff", top: "#3a1d6a", top2: "#ff5fa8", pants: "#20123a", shoes: "#ff5fa8", sole: "#ffffff", hat: "#ff5fa8", acc: "#ffe53b" } },
    ],
  },
];

export const charById = (id) => CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
export const outfitOf = (ch, outfitId) => ch.outfits.find((o) => o.id === outfitId) || ch.outfits[0];
