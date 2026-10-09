/**
 * Kart Legends — the six fictional karts. Stats are 1–5 and map onto the
 * arcade controller (engine/kart.js) through statsFor(); nothing else is
 * tunable. Unlocks come from progress (stars, wins, world completion).
 */

export const KARTS = [
  {
    id: "rookie",
    name: "Rookie",
    blurb: "Balanced starter kart. Forgiving and quick to learn.",
    stats: { speed: 3, accel: 3, handling: 3, boost: 3 },
    colors: { body: "#e8343a", trim: "#ffffff", accent: "#1d1d24", driver: "#2f6fd6" },
    shape: "classic",
    unlock: null,
  },
  {
    id: "spark",
    name: "Spark",
    blurb: "Explosive acceleration out of every corner.",
    stats: { speed: 3, accel: 5, handling: 3, boost: 3 },
    colors: { body: "#ffcc1f", trim: "#1d1d24", accent: "#ff6a1a", driver: "#1d1d24" },
    shape: "wedge",
    unlock: { stars: 12, text: "Earn 12 stars" },
  },
  {
    id: "drifter",
    name: "Drifter",
    blurb: "Grips the slide — drift charges fill faster.",
    stats: { speed: 3, accel: 3, handling: 5, boost: 4 },
    colors: { body: "#7a3cff", trim: "#3de0ff", accent: "#16121f", driver: "#ff3ca0" },
    shape: "low",
    unlock: { wins: 6, text: "Win 6 races" },
  },
  {
    id: "bullet",
    name: "Bullet",
    blurb: "Highest top speed. Needs room to stretch its legs.",
    stats: { speed: 5, accel: 3, handling: 2, boost: 4 },
    colors: { body: "#18b6ff", trim: "#ffffff", accent: "#0b2b4a", driver: "#ffd21f" },
    shape: "bullet",
    unlock: { world: 2, text: "Complete the Desert Cup" },
  },
  {
    id: "titan",
    name: "Titan",
    blurb: "Heavy hitter: high top speed and long boosts.",
    stats: { speed: 4, accel: 3, handling: 4, boost: 4 },
    colors: { body: "#2ecc71", trim: "#1d1d24", accent: "#f1f1f1", driver: "#e8343a" },
    shape: "chunky",
    unlock: { stars: 45, text: "Earn 45 stars" },
  },
  {
    id: "legend",
    name: "Legend",
    blurb: "The champion's kart. Excellent at everything.",
    stats: { speed: 5, accel: 4, handling: 4, boost: 5 },
    colors: { body: "#ffb21a", trim: "#1d1d24", accent: "#ffffff", driver: "#e8343a" },
    shape: "legend",
    unlock: { world: 4, text: "Complete the Neon Cup" },
  },
];

export const KART_BY_ID = new Map(KARTS.map((k) => [k.id, k]));

/** Rival liveries (AI drivers). */
export const RIVALS = [
  { name: "Coco", colors: { body: "#2ecc71", trim: "#ffffff", accent: "#1d1d24", driver: "#ffcc1f" }, shape: "classic" },
  { name: "Blaze", colors: { body: "#ff7a1a", trim: "#1d1d24", accent: "#ffffff", driver: "#18b6ff" }, shape: "wedge" },
  { name: "Mint", colors: { body: "#3de0ff", trim: "#ffffff", accent: "#0b2b4a", driver: "#ff3ca0" }, shape: "low" },
];

/** Stats (1–5) → controller parameters. */
export function statsFor(stats) {
  const s = (v, a, b) => a + ((v - 1) / 4) * (b - a);
  return {
    maxSpeed: s(stats.speed, 25.5, 30.5),
    accel: s(stats.accel, 14, 22),
    turn: s(stats.handling, 1.95, 2.45),
    grip: s(stats.handling, 6.5, 9),
    driftCharge: s(stats.handling, 0.9, 1.25),
    boostPower: s(stats.boost, 1.26, 1.4),
    boostTime: s(stats.boost, 1.15, 1.6),
  };
}
