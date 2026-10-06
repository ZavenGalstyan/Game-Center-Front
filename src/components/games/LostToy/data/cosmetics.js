/**
 * Lost Toy — toy looks. Same protagonist, different scarf / overalls / patch /
 * backpack / tiny accessory. Unlocked by Memory Buttons found or worlds
 * completed — no store, no currency, no real money.
 */
export const COSMETICS = [
  { id: "classic", name: "Classic Explorer", need: { buttons: 0 }, scarf: "#d9473b", scarf2: "#f2e3c6", overalls: "#4b72b0", patch: "#f2c14e", pack: "#9a6a44", packFlap: "#7d5233", badge: "#f2c14e", hat: null },
  { id: "blue", name: "Blue Scarf", need: { buttons: 6 }, scarf: "#3f7fd6", scarf2: "#cfe3ff", overalls: "#5d6f8f", patch: "#e9a35a", pack: "#8b6a4f", packFlap: "#6c4f39", badge: "#9fd0ff", hat: null },
  { id: "green", name: "Green Patch", need: { buttons: 14 }, scarf: "#e0a33a", scarf2: "#fff1cf", overalls: "#6c8a4a", patch: "#3f9b5a", pack: "#7a5a3a", packFlap: "#5c4229", badge: "#7fd18b", hat: null },
  { id: "sunset", name: "Sunset Scarf", need: { buttons: 24 }, scarf: "#ff8a5b", scarf2: "#ffd36e", overalls: "#6b5a8e", patch: "#ff8a5b", pack: "#a0603c", packFlap: "#7c4428", badge: "#ffd36e", hat: null },
  { id: "apron", name: "Kitchen Apron", need: { world: 2 }, scarf: "#d9473b", scarf2: "#ffffff", overalls: "#4b72b0", patch: "#f2c14e", pack: "#9a6a44", packFlap: "#7d5233", badge: "#ff7a7a", hat: "apron" },
  { id: "garage", name: "Garage Worker", need: { world: 3 }, scarf: "#5a5f69", scarf2: "#c9ccd2", overalls: "#e0782f", patch: "#4a4f5a", pack: "#5b5048", packFlap: "#433a33", badge: "#ffd23a", hat: "cap" },
  { id: "garden", name: "Garden Explorer", need: { world: 4 }, scarf: "#f4d35e", scarf2: "#fff7d6", overalls: "#4f8a5b", patch: "#c9773a", pack: "#8a6a3a", packFlap: "#6a4f28", badge: "#ff9fb6", hat: "leaf" },
  { id: "night", name: "Night Star", need: { buttons: 60 }, scarf: "#2f3f7a", scarf2: "#ffe27a", overalls: "#283656", patch: "#ffe27a", pack: "#3b3550", packFlap: "#2a2540", badge: "#ffe27a", hat: "star" },
  { id: "gold", name: "Homecoming Gold", need: { world: 5 }, scarf: "#e7b53c", scarf2: "#fff3c4", overalls: "#f0e2c4", patch: "#e7b53c", pack: "#b5864a", packFlap: "#94693a", badge: "#ffffff", hat: "crown" },
];
export const cosmeticById = (id) => COSMETICS.find((c) => c.id === id) || COSMETICS[0];
