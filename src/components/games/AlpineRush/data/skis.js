/**
 * Alpine Rush — the six ski sets, rival skiers and the physics parameters a
 * set of 1–5 stats turns into.
 *
 *   speed      top speed and how little air drag the tuck leaves
 *   handling   lateral grip (turn radius at speed), turn response, low
 *              speed turning
 *   braking    snowplough strength
 *   stability  edge-stress build-up, landing tolerance, rough-snow jolts
 *
 * Specials scale a surface for one set only (Powder Master in deep snow, Ice
 * Racer on ice). Unlocks: by medals, gold medals or a completed world.
 */

export const SKIS = [
  {
    id: "starter",
    name: "Alpine Starter",
    blurb: "Forgiving all-rounders. Easy to turn, easy to stop — the skis every champion started on.",
    stats: { speed: 2, handling: 3, braking: 3, stability: 3 },
    colors: { base: "#eef3f8", accent: "#2a7fff", tip: "#1d3a7a" },
    pattern: "stripe",
    unlock: null,
  },
  {
    id: "carver",
    name: "Speed Carver",
    blurb: "Long, stiff and fast. Higher top speed and a lower tuck — the turns get wider.",
    stats: { speed: 4, handling: 2, braking: 2, stability: 3 },
    colors: { base: "#d62a3a", accent: "#151820", tip: "#ffd21f" },
    pattern: "chevron",
    unlock: { medals: 4, text: "Earn 4 medals" },
  },
  {
    id: "grip",
    name: "Snow Grip",
    blurb: "Sharp edges and a short radius. The tightest carving in the garage.",
    stats: { speed: 3, handling: 5, braking: 3, stability: 3 },
    colors: { base: "#22b36a", accent: "#ffffff", tip: "#0b4a2a" },
    pattern: "dots",
    unlock: { medals: 8, text: "Earn 8 medals" },
  },
  {
    id: "powder",
    name: "Powder Master",
    blurb: "Wide, floaty tips that surf deep snow. Strong brakes, steady on landings.",
    stats: { speed: 3, handling: 3, braking: 4, stability: 4 },
    colors: { base: "#ff8a1f", accent: "#ffffff", tip: "#3a1a00" },
    pattern: "flame",
    special: { surf: "powder", text: "Half the drag in deep powder" },
    unlock: { medals: 12, text: "Earn 12 medals" },
  },
  {
    id: "ice",
    name: "Ice Racer",
    blurb: "Razor edges tuned for hard ice — they hold where other skis slide.",
    stats: { speed: 4, handling: 4, braking: 3, stability: 3 },
    colors: { base: "#3ad6ff", accent: "#0a1f3d", tip: "#e8fbff" },
    pattern: "stripe",
    special: { surf: "ice", text: "+70 % grip and braking on ice" },
    unlock: { medals: 16, text: "Earn 16 medals" },
  },
  {
    id: "pro",
    name: "Summit Pro",
    blurb: "World-cup race skis. Fast, precise and stable at the very top speeds.",
    stats: { speed: 5, handling: 5, braking: 4, stability: 5 },
    colors: { base: "#1a1d24", accent: "#ffcc33", tip: "#ffcc33" },
    pattern: "chevron",
    unlock: { golds: 10, text: "Earn 10 gold medals" },
  },
];

export const SKI_BY_ID = new Map(SKIS.map((s) => [s.id, s]));

/** Physics parameters for a stat set (+ optional surface special). */
export function paramsFor(stats, special = null) {
  const sp = stats.speed;
  const hd = stats.handling;
  const br = stats.braking;
  const st = stats.stability;
  const p = {
    vmax: 26 + sp * 2.4, // m/s hard cap (≈ 102–137 km/h)
    aero: 0.0047 - sp * 0.00019, // upright air drag k (tuck / race tuck scale it down)
    aLat: 11.5 + hd * 1.35, // m/s² lateral grip → turn radius v² / aLat
    turnLow: 1.45 + hd * 0.09, // rad/s at low speed
    turnResp: 4.6 + hd * 0.55,
    grip: 4.6 + hd * 0.55,
    carveLoss: 0.13 - hd * 0.008,
    brake: 4.2 + br * 1.0, // m/s² snowplough
    stressRate: 1.5 - st * 0.17,
    landTol: 0.78 + st * 0.07, // rad of skis vs travel at touchdown
    impactTol: 12.5 + st * 0.9, // m/s into the snow
    roughness: 1.2 - st * 0.12,
    jump: 4.4,
    airSpin: 2.8,
    surfMu: {},
    surfDrag: {},
    surfGrip: {},
    surfBrake: {},
    surfTurn: {},
  };
  if (special?.surf === "powder") {
    p.surfMu.powder = 0.55;
    p.surfDrag.powder = 0.5;
    p.surfTurn.powder = 1.12;
  }
  if (special?.surf === "ice") {
    p.surfGrip.ice = 1.7;
    p.surfBrake.ice = 1.7;
    p.surfTurn.ice = 1.25;
  }
  return p;
}

export const skiParams = (ski) => paramsFor(ski.stats, ski.special);

/** Rival skiers (AI). Suit colours drive their 3D models. */
export const RIVALS = [
  { name: "Lena Brandt", colors: { jacket: "#e83a4a", pants: "#1d2230", helmet: "#ffffff", goggles: "amber" }, ski: { base: "#ffffff", accent: "#e83a4a", tip: "#1d2230" } },
  { name: "Marco Rossi", colors: { jacket: "#1f8a4c", pants: "#2a2d34", helmet: "#1f8a4c", goggles: "mirror" }, ski: { base: "#1f8a4c", accent: "#ffffff", tip: "#ffd21f" } },
  { name: "Aiko Tanaka", colors: { jacket: "#8a3aff", pants: "#f2f2f5", helmet: "#2a2d34", goggles: "rose" }, ski: { base: "#2a2d34", accent: "#8a3aff", tip: "#ffffff" } },
];

/** Customisation options (stored per player). */
export const JACKETS = ["#1f6fff", "#e8343a", "#ff8a1f", "#22b36a", "#ffd21f", "#8a3aff", "#f2f4f8", "#151820"];
export const PANTS = ["#151820", "#2a3a5a", "#f2f4f8", "#7a1f2a", "#3a4a3a", "#5a4a7a"];
export const HELMETS = ["#f2f4f8", "#151820", "#e8343a", "#1f6fff", "#ffd21f", "#22b36a"];
export const GOGGLES = {
  amber: { name: "Amber", lens: "#ffb02a", rim: "#151820" },
  mirror: { name: "Blue Mirror", lens: "#3aa8ff", rim: "#f2f4f8" },
  rose: { name: "Rose", lens: "#ff6aa8", rim: "#151820" },
  emerald: { name: "Emerald", lens: "#28d68a", rim: "#151820" },
  smoke: { name: "Smoke", lens: "#3a3f4a", rim: "#e8343a" },
};
export const SKI_DESIGNS = {
  set: "Team graphic",
  stripe: "Race stripe",
  chevron: "Chevrons",
  flame: "Flames",
  dots: "Snow dots",
  plain: "Clean",
};

export const DEFAULT_CUSTOM = { jacket: "#1f6fff", pants: "#151820", helmet: "#f2f4f8", goggles: "amber", design: "set" };
