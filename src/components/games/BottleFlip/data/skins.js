/**
 * Bottle Flip — cosmetic bottle skins. Paint only: every skin uses the same
 * BOTTLE collision numbers (physics/constants.js), so no skin plays
 * differently.
 *
 * unlock: { type: "level" | "stars" | "perfects" | "streak" | "default", value }
 */
export const SKINS = [
  {
    id: "classic",
    name: "Classic Blue",
    glass: "#bfe6ff",
    liquid: ["#5cc2ff", "#1f7fd6"],
    cap: ["#2f6fe0", "#1b3f9a"],
    label: { bg: "#ffffff", ink: "#1f5fbf", accent: "#5cc2ff", mark: "drop" },
    unlock: { type: "default" },
  },
  {
    id: "berry",
    name: "Berry Pink",
    glass: "#ffd6ea",
    liquid: ["#ff7ab8", "#d6337e"],
    cap: ["#ff4f98", "#b01e62"],
    label: { bg: "#fff3f8", ink: "#c2266f", accent: "#ff9cc9", mark: "heart" },
    unlock: { type: "level", value: 3 },
  },
  {
    id: "lime",
    name: "Lime Pop",
    glass: "#e4ffc9",
    liquid: ["#b8f55a", "#5fbf1f"],
    cap: ["#8fe03a", "#3f8f12"],
    label: { bg: "#fbfff2", ink: "#3f8f12", accent: "#c8f77a", mark: "leaf" },
    unlock: { type: "level", value: 8 },
  },
  {
    id: "sunset",
    name: "Sunset Orange",
    glass: "#ffe3c8",
    liquid: ["#ffb14a", "#ff6a2b"],
    cap: ["#ff8a2b", "#c2410c"],
    label: { bg: "#fff6ec", ink: "#d9480f", accent: "#ffc078", mark: "sun" },
    unlock: { type: "stars", value: 15 },
  },
  {
    id: "ocean",
    name: "Ocean Glass",
    glass: "#c9fff4",
    liquid: ["#3ee0c8", "#0f8f9a"],
    cap: ["#1fb5b0", "#0b6b73"],
    label: { bg: "#effffb", ink: "#0b7a80", accent: "#8ff0e0", mark: "wave" },
    unlock: { type: "level", value: 20 },
  },
  {
    id: "midnight",
    name: "Midnight",
    glass: "#aab4d6",
    liquid: ["#5b6bd8", "#26307a"],
    cap: ["#2a2f45", "#0f1222"],
    label: { bg: "#1d2238", ink: "#c9d2ff", accent: "#7f8cff", mark: "moon" },
    unlock: { type: "perfects", value: 10 },
  },
  {
    id: "lavender",
    name: "Lavender",
    glass: "#eadcff",
    liquid: ["#c7a4ff", "#8a5cf0"],
    cap: ["#a67cff", "#6a3fd0"],
    label: { bg: "#fbf7ff", ink: "#6a3fd0", accent: "#d7c2ff", mark: "star" },
    unlock: { type: "level", value: 30 },
  },
  {
    id: "golden",
    name: "Golden Cap",
    glass: "#fff3cf",
    liquid: ["#ffe08a", "#f0b429"],
    cap: ["#ffd75e", "#b7791f"],
    label: { bg: "#2b2210", ink: "#ffd75e", accent: "#f0b429", mark: "crown" },
    unlock: { type: "stars", value: 60 },
  },
  {
    id: "neon",
    name: "Neon Splash",
    glass: "#d9fff0",
    liquid: ["#39ffb0", "#00c2ff"],
    cap: ["#ff3df2", "#8a00c2"],
    label: { bg: "#10131f", ink: "#39ffb0", accent: "#ff3df2", mark: "bolt" },
    unlock: { type: "streak", value: 8 },
  },
  {
    id: "master",
    name: "Master Bottle",
    glass: "#fff0d6",
    liquid: ["#ff5f6d", "#ffc371"],
    cap: ["#1c1c22", "#000000"],
    label: { bg: "#111114", ink: "#ffcf6e", accent: "#ff5f6d", mark: "crown" },
    unlock: { type: "level", value: 50 },
  },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));
export const getSkin = (id) => SKIN_BY_ID[id] || SKINS[0];

export function unlockText(u) {
  switch (u.type) {
    case "default":
      return "Starter bottle";
    case "level":
      return `Complete level ${u.value}`;
    case "stars":
      return `Earn ${u.value} stars`;
    case "perfects":
      return `Land ${u.value} perfect flips`;
    case "streak":
      return `Reach a ${u.value}x flip streak`;
    default:
      return "";
  }
}
