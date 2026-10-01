/**
 * Jump Ball — cosmetic ball skins. Colours and surface pattern ONLY: radius,
 * bounce, speed and collision are identical for every skin (the sim never
 * reads this file).
 *
 * Unlocks are milestones — no currency, no store:
 *   { kind: "levels", n }  complete n levels
 *   { kind: "stars", n }   collect n stars in total
 *   { kind: "endless", n } reach n m in Endless
 *   { kind: "perfect", n } a perfect streak of n
 */
export const SKINS = [
  { id: "classic", name: "CLASSIC", light: "#ff8f8f", base: "#f0424f", dark: "#8f1426", band: "#ffffff", pattern: "band", unlock: null },
  { id: "sunset", name: "SUNSET", light: "#ffd08a", base: "#ff8a3d", dark: "#a8341c", band: "#ffe7a3", pattern: "dual", unlock: { kind: "levels", n: 5 } },
  { id: "ocean", name: "OCEAN", light: "#9fe6ff", base: "#2f9be8", dark: "#0f3f86", band: "#e8fbff", pattern: "wave", unlock: { kind: "stars", n: 20 } },
  { id: "mint", name: "MINT", light: "#c8ffe4", base: "#39d69a", dark: "#0f7a58", band: "#ffffff", pattern: "dots", unlock: { kind: "levels", n: 15 } },
  { id: "midnight", name: "MIDNIGHT", light: "#8e9bd6", base: "#34407a", dark: "#10142e", band: "#ffcf5a", pattern: "band", unlock: { kind: "endless", n: 150 } },
  { id: "neon", name: "NEON", light: "#ffb3f0", base: "#ff3dcf", dark: "#5c0f7a", band: "#4df0ff", pattern: "ring", unlock: { kind: "levels", n: 30 } },
  { id: "gold", name: "GOLD", light: "#fff3b8", base: "#f2b93b", dark: "#8a5a10", band: "#fff8dc", pattern: "star", unlock: { kind: "stars", n: 90 } },
  { id: "galaxy", name: "GALAXY", light: "#b9a3ff", base: "#4a2ea8", dark: "#140a3a", band: "#ffffff", pattern: "galaxy", unlock: { kind: "levels", n: 50 } },
];

export const getSkin = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

export function unlockText(u) {
  if (!u) return "UNLOCKED";
  if (u.kind === "levels") return `COMPLETE ${u.n} LEVELS`;
  if (u.kind === "stars") return `COLLECT ${u.n} STARS`;
  if (u.kind === "endless") return `ENDLESS ${u.n} M`;
  if (u.kind === "perfect") return `PERFECT STREAK ×${u.n}`;
  return "";
}
