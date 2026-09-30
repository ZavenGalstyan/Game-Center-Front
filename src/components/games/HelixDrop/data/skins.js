/**
 * Helix Drop — cosmetic balls. Colours only: radius, gravity, bounce,
 * collision and Smash are identical for every ball (the sim never reads this).
 * Unlocks are milestones — no currency:
 *   levels n · stars n · depth n (best Endless floors) · perfect n (levels with ★★★)
 */
export const SKINS = [
  { id: "classic", name: "CLASSIC", base: "#ff4d5e", band: "#ffffff", dots: "#ffd1d6", unlock: null },
  { id: "sunset", name: "SUNSET", base: "#ff8a3d", band: "#ffe08a", dots: "#ffc39a", unlock: { kind: "levels", n: 5 } },
  { id: "ocean", name: "OCEAN", base: "#2f8fe8", band: "#e8fbff", dots: "#9fd6ff", unlock: { kind: "stars", n: 20 } },
  { id: "emerald", name: "EMERALD", base: "#1fbf7a", band: "#e9fff4", dots: "#9ff0c8", unlock: { kind: "levels", n: 15 } },
  { id: "ice", name: "ICE", base: "#bfe8ff", band: "#4d8fd9", dots: "#ffffff", unlock: { kind: "levels", n: 25 } },
  { id: "gold", name: "GOLD", base: "#f2b93b", band: "#fff3c4", dots: "#a8741c", unlock: { kind: "perfect", n: 15 } },
  { id: "neon", name: "NEON", base: "#ff3dcf", band: "#4df0ff", dots: "#2b0a4a", unlock: { kind: "depth", n: 150 } },
  { id: "void", name: "VOID", base: "#1a1330", band: "#b98cff", dots: "#4df0ff", unlock: { kind: "levels", n: 50 } },
];

export const getSkin = (id) => SKINS.find((s) => s.id === id) || SKINS[0];

export function unlockText(u) {
  if (!u) return "UNLOCKED";
  if (u.kind === "levels") return `COMPLETE ${u.n} LEVELS`;
  if (u.kind === "stars") return `EARN ${u.n} STARS`;
  if (u.kind === "depth") return `ENDLESS DEPTH ${u.n}`;
  if (u.kind === "perfect") return `★★★ ON ${u.n} LEVELS`;
  return "";
}
