/**
 * Boxing Club — cosmetic gloves and fighter customisation options.
 * Gloves are PURELY cosmetic: they never touch damage, speed or defence.
 * Unlocks come from milestones only — there is no shop and no currency.
 */
export const GLOVES = [
  { id: "rookie", name: "Rookie Red", base: "#d0312d", trim: "#ffffff", cuff: "#f4f1ea", unlock: { kind: "start" } },
  { id: "classic", name: "Classic Blue", base: "#2d64b0", trim: "#ffffff", cuff: "#eef2f7", unlock: { kind: "wins", n: 2 } },
  { id: "emerald", name: "Emerald Guard", base: "#1e9e5a", trim: "#f2e6a0", cuff: "#eef7f0", unlock: { kind: "training", n: 2 } },
  { id: "midnight", name: "Midnight Black", base: "#1c1c22", trim: "#c9c9d1", cuff: "#2c2c34", unlock: { kind: "kos", n: 3 } },
  { id: "ocean", name: "Ocean Strike", base: "#138fb8", trim: "#bff0ff", cuff: "#e8f8fd", unlock: { kind: "tier", n: 2 } },
  { id: "crimson", name: "Crimson Pro", base: "#8f1422", trim: "#f5c542", cuff: "#fbe7e9", unlock: { kind: "wins", n: 10 } },
  { id: "arctic", name: "Arctic White", base: "#f2f4f7", trim: "#6fa8dc", cuff: "#ffffff", unlock: { kind: "perfect", n: 15 } },
  { id: "neon", name: "Neon Punch", base: "#39ff88", trim: "#ff3fd4", cuff: "#101a14", unlock: { kind: "tier", n: 3 } },
  { id: "royal", name: "Royal Purple", base: "#5b2a9b", trim: "#e6c65c", cuff: "#efe7fa", unlock: { kind: "tier", n: 4 } },
  { id: "golden", name: "Golden Champion", base: "#d4af37", trim: "#fff4c2", cuff: "#fff8dc", unlock: { kind: "champion" } },
];

export const gloveById = (id) => GLOVES.find((g) => g.id === id) || GLOVES[0];

export function unlockText(g) {
  const u = g.unlock;
  return {
    start: "Starter pair",
    wins: `Win ${u.n} career fights`,
    kos: `Score ${u.n} knockouts (KO/TKO)`,
    training: `Earn ${u.n} training medals`,
    tier: `Reach the ${["", "Local Gym", "City Circuit", "Regional League", "National Arena", "Championship"][u.n]}`,
    perfect: `Land ${u.n} perfect dodges`,
    champion: "Become the champion",
  }[u.kind];
}

export const LOOK_OPTIONS = {
  skin: ["#f3cfb1", "#e5b18c", "#c98c5f", "#a86c43", "#7f4b2c", "#5b3521"],
  hair: ["short", "buzz", "curly", "bald", "mohawk", "long", "braids"],
  hairColor: ["#1d1712", "#5a3a1c", "#8a5a2b", "#c9a15a", "#b8412c", "#9a9a9a"],
  shorts: ["#c0392b", "#2d64b0", "#1e9e5a", "#1c1c22", "#f39c12", "#8e44ad", "#ecf0f1", "#d4af37"],
  shoes: ["#1f1f24", "#f0f0f0", "#c0392b", "#2d64b0", "#d4af37"],
};

export const HAIR_LABEL = { short: "Short", buzz: "Buzz", curly: "Curly", bald: "Bald", mohawk: "Mohawk", long: "Long", braids: "Braids" };
