/**
 * Parking Jam — cosmetic vehicle styles ("paint sets"). A skin restyles how
 * every car is painted; it never touches grid size, speed or rules. Unlocks
 * come from milestones only — there is no currency.
 *
 * `paint(colorName, basePaint)` may remap a car's color, while keeping the
 * cars in a lot distinguishable from each other.
 */
import { PAINT } from "../render/color.js";

const remap = (table) => (name) => table[name] || PAINT[name];

export const SKINS = [
  {
    id: "classic", name: "Classic Compact", desc: "Clean factory paint.",
    unlock: { kind: "start" },
  },
  {
    id: "city", name: "City Sedan", desc: "Chrome trim and dark rims.",
    unlock: { kind: "levels", n: 5 }, trim: "#e8edf2", rim: "#2b2f36",
  },
  {
    id: "sunny", name: "Sunny Hatch", desc: "Warm pastel paint, white roofs.",
    unlock: { kind: "levels", n: 10 }, roof: "#f7f4ee",
    paint: remap({ blue: "#7fb6f0", red: "#f08a7e", green: "#8fd49a", orange: "#f7b36f", purple: "#bd9cf0", teal: "#79d6cf", black: "#5b6270", silver: "#d9dee4", yellow: "#f8dc75" }),
  },
  {
    id: "urban", name: "Urban SUV", desc: "Matte paint, black roofs.",
    unlock: { kind: "levels", n: 20 }, roof: "#24272d", matte: true,
  },
  {
    id: "retro", name: "Retro Coupe", desc: "Two-tone paint with racing stripes.",
    unlock: { kind: "stars", n: 45 }, stripes: "#fdf6e3",
    paint: remap({ blue: "#3b8fb3", red: "#c8553d", green: "#6a9f4b", orange: "#e39b3c", purple: "#8e5a9b", teal: "#4fa39a", yellow: "#e7c35a", silver: "#c9c2b2", white: "#f3ead7", black: "#403833" }),
  },
  {
    id: "midnight", name: "Midnight Car", desc: "Deep metallic paint, neon trim.",
    unlock: { kind: "levels", n: 40 }, metallic: true, trim: "#7ef9ff", rim: "#15181d",
    paint: remap({ blue: "#1f4fa8", red: "#9e1f2e", green: "#1f7a4a", yellow: "#b8901f", orange: "#b85a1f", white: "#aab4c0", black: "#15181d", purple: "#5a2f9e", teal: "#127a78", silver: "#6f7883" }),
  },
  {
    id: "ocean", name: "Ocean Van", desc: "Sea-glass blues and greens.",
    unlock: { kind: "levels", n: 60 }, metallic: true,
    paint: remap({ red: "#ff7a7a", orange: "#ffb070", yellow: "#ffe08a", purple: "#8f8cff", black: "#1d3b53", silver: "#b9d4df", white: "#eefaff", green: "#2fc39a", blue: "#2a8fd6", teal: "#19b8c4" }),
  },
  {
    id: "sport", name: "Sport Edition", desc: "Racing stripes and red calipers.",
    unlock: { kind: "perfect", n: 25 }, stripes: "#ffffff", rim: "#d8dde3", spoiler: true,
  },
  {
    id: "golden", name: "Golden Compact", desc: "Gold trim, gold rims, polished paint.",
    unlock: { kind: "levels", n: 80 }, metallic: true, trim: "#ffd35a", rim: "#e8b73a",
  },
  {
    id: "master", name: "Puzzle Master", desc: "Pearl paint with a checkered roof stripe.",
    unlock: { kind: "levels", n: 100 }, metallic: true, pearl: true, checker: true, trim: "#ffffff",
  },
];

export const skinById = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

export function skinUnlocked(skin, summary) {
  const u = skin.unlock;
  if (u.kind === "start") return true;
  if (u.kind === "levels") return summary.completed >= u.n;
  if (u.kind === "stars") return summary.stars >= u.n;
  if (u.kind === "perfect") return summary.perfect >= u.n;
  return false;
}

export function unlockText(skin) {
  const u = skin.unlock;
  if (u.kind === "start") return "Unlocked";
  if (u.kind === "levels") return `Clear ${u.n} levels`;
  if (u.kind === "stars") return `Earn ${u.n} stars`;
  if (u.kind === "perfect") return `${u.n} perfect levels`;
  return "";
}
