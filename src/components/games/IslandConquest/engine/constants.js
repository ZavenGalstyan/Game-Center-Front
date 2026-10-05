/**
 * Island Conquest — rules constants. Pure data, no rendering, no React —
 * shared by the engine, the AI, the level validator and the Node test suite.
 *
 * Everything that affects combat or production lives here and is shown to
 * the player on the Islands screen and the island tooltip: nothing hidden.
 */

/** factions that can own islands; `player` is always the human side */
export const PLAYER = "player";
export const NEUTRAL = "neutral";
export const ENEMIES = ["red", "purple"];
export const FACTIONS = [PLAYER, ...ENEMIES];

export const FACTION_INFO = {
  player: { name: "You", color: "#25c4b4", light: "#8ff5e6", dark: "#0f6f6a" },
  red: { name: "Red Fleet", color: "#e2483c", light: "#ff9b8a", dark: "#8c1e18" },
  purple: { name: "Violet Fleet", color: "#9a5be0", light: "#d2b0ff", dark: "#4f2a86" },
  neutral: { name: "Neutral", color: "#d9d2bf", light: "#f4efe1", dark: "#8d8778" },
};

/**
 * Island archetypes. `rate` is troops per second (so 1 / rate = seconds per
 * troop), `cap` is where production pauses, `defense` multiplies what each
 * defender is worth in combat, `travel` multiplies the speed of fleets that
 * LEAVE this island. `r` is the world radius of the shoreline.
 */
export const ISLAND_TYPES = {
  small: { name: "Small Isle", r: 1.45, rate: 1 / 1.6, cap: 40, defense: 1, travel: 1, special: null },
  medium: { name: "Island", r: 1.9, rate: 1 / 1.25, cap: 60, defense: 1, travel: 1, special: null },
  large: { name: "Great Island", r: 2.45, rate: 1 / 1.0, cap: 80, defense: 1, travel: 1, special: null },
  farm: { name: "Fertile Island", r: 2.1, rate: 1 / 0.72, cap: 60, defense: 1, travel: 1, special: "production" },
  fort: { name: "Fortress Island", r: 2.05, rate: 1 / 2.0, cap: 70, defense: 1.5, travel: 1, special: "defense" },
  port: { name: "Port Island", r: 1.95, rate: 1 / 1.4, cap: 50, defense: 1, travel: 1.4, special: "travel" },
  capital: { name: "Capital", r: 2.75, rate: 1 / 0.85, cap: 100, defense: 1.25, travel: 1, special: "capital" },
};
export const TYPE_IDS = Object.keys(ISLAND_TYPES);

/** fixed simulation step (seconds of game time) */
export const STEP = 1 / 30;
/** max real seconds folded into one frame (tab switches, debugger pauses) */
export const MAX_FRAME = 0.1;
/** base fleet speed in world units per second */
export const FLEET_SPEED = 3.4;
/** seconds a freshly captured island waits before it starts producing */
export const CAPTURE_GRACE = 0.6;
/** seconds between the last enemy being wiped out and the result screen */
export const RESULT_DELAY = 0.9;
/** shoreline clearance kept between routes and other islands */
export const ROUTE_CLEAR = 0.55;
/** how far fleets stand off the shore when they launch / land */
export const SHORE_GAP = 0.35;
/** playable map half-extents (world units) */
export const MAP_W = 17.5;
export const MAP_H = 10;

export const SEND_FRACTIONS = [0.25, 0.5, 1];

/** visual boats for a logical fleet of `n` troops */
export const boatsFor = (n) => (n <= 10 ? 1 : n <= 25 ? 2 : 3);

export const isEnemy = (owner) => owner === "red" || owner === "purple";
