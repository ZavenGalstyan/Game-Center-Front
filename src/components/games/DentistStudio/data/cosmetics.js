/**
 * Dentist Studio — cosmetic tool sets (colour only, no gameplay effect) and
 * the clinic decorations that appear as chapters are completed.
 */

export const TOOL_SETS = [
  { id: "mint", name: "Mint Set", stars: 0, main: "#5fcfb8", light: "#c4f2e7", dark: "#2f9c86", accent: "#ffffff" },
  { id: "lavender", name: "Lavender Set", stars: 15, main: "#a98be6", light: "#e4d8fb", dark: "#6f55b3", accent: "#ffffff" },
  { id: "ocean", name: "Ocean Set", stars: 40, main: "#4aa8e6", light: "#cde8fb", dark: "#236fa8", accent: "#ffffff" },
  { id: "rose", name: "Rose Set", stars: 70, main: "#f08aa8", light: "#fbd6e1", dark: "#bf5474", accent: "#ffffff" },
  { id: "midnight", name: "Midnight Set", stars: 110, main: "#3b4a6b", light: "#8d9cc0", dark: "#1f2940", accent: "#ffd36a" },
];

export function toolSet(id) {
  return TOOL_SETS.find((s) => s.id === id) || TOOL_SETS[0];
}

/** Clinic upgrades, earned by finishing chapters. */
export const DECOR = [
  { id: "plant", chapter: 1, name: "Leafy Plant", desc: "A big friendly plant by the window." },
  { id: "art", chapter: 2, name: "Smile Wall Art", desc: "Cheerful framed prints for the wall." },
  { id: "chair", chapter: 3, name: "Lavender Chair", desc: "A plush new treatment chair." },
  { id: "light", chapter: 4, name: "Soft Light Strip", desc: "A warm accent light over the cabinets." },
  { id: "trophy", chapter: 5, name: "Smile Master Trophy", desc: "Proof that you're the best in town." },
];
