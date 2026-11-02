/**
 * Arcade ladder: 3 tournaments × 10 battles, every 10th a boss. Each battle is
 * plain data; `battleConfig()` turns one into a createMatch() config + AI
 * parameters for whichever fighter the player picked.
 *
 *   level   0 … 1 difficulty along the whole ladder → AI parameters are
 *           interpolated easy → medium → hard (reaction time never < 0.2 s)
 *   mods    opponent health / damage multipliers (bosses only)
 */
import { AI_TIERS, aiParams } from "./ai.js";
import { FIGHTER_BY_ID } from "./fighters.js";

export const TOURNAMENTS = [
  { id: "rising", name: "Rising Fighters", sub: "Beginner → Intermediate", arenaHint: "Temple · Rooftop", color: "#3d8bff" },
  { id: "underground", name: "Underground Championship", sub: "Intermediate", arenaHint: "Underground Club · Rooftop", color: "#ff3d6e" },
  { id: "masters", name: "World Masters", sub: "Challenging", arenaHint: "Grand Arena · Worldwide", color: "#ffc23d" },
];

const L = [
  // [opponent, arena, level, boss?]
  ["kira", "temple", 0.0],
  ["ryuzen", "rooftop", 0.05],
  ["shadow", "temple", 0.1],
  ["titan", "rooftop", 0.15],
  ["storm", "temple", 0.2],
  ["kira", "rooftop", 0.25],
  ["shadow", "temple", 0.29],
  ["titan", "temple", 0.33],
  ["ryuzen", "rooftop", 0.37],
  ["blaze", "temple", 0.4, { title: "Rising Champion", hpMul: 1.2, dmgMul: 1.05 }],
  ["blaze", "underground", 0.44],
  ["kira", "underground", 0.47],
  ["shadow", "rooftop", 0.5],
  ["storm", "underground", 0.53],
  ["ryuzen", "underground", 0.56],
  ["blaze", "rooftop", 0.59],
  ["kira", "underground", 0.62],
  ["shadow", "underground", 0.65],
  ["storm", "rooftop", 0.68],
  ["titan", "underground", 0.68, { title: "King of the Underground", hpMul: 1.15, dmgMul: 1.06 }],
  ["ryuzen", "grand", 0.74],
  ["titan", "temple", 0.77],
  ["kira", "grand", 0.8],
  ["blaze", "rooftop", 0.83],
  ["shadow", "grand", 0.86],
  ["titan", "underground", 0.88],
  ["ryuzen", "temple", 0.91],
  ["kira", "grand", 0.94],
  ["shadow", "grand", 0.96],
  ["storm", "grand", 0.97, { title: "World Champion", hpMul: 1.2, dmgMul: 1.05 }],
];

export const BATTLES = L.map(([opponent, arena, level, boss], i) => ({
  id: i + 1,
  index: i,
  tournament: TOURNAMENTS[Math.floor(i / 10)].id,
  tIndex: Math.floor(i / 10),
  num: (i % 10) + 1,
  opponent,
  arena,
  level,
  boss: !!boss,
  title: boss?.title || null,
  mods: { hpMul: boss?.hpMul ?? 1, dmgMul: boss?.dmgMul ?? 1 },
}));

const lerp = (a, b, k) => a + (b - a) * k;
function lerpTier(A, B, k) {
  const out = {};
  for (const key of Object.keys(A)) out[key] = Array.isArray(A[key]) ? A[key].map((v, i) => lerp(v, B[key][i], k)) : lerp(A[key], B[key], k);
  return out;
}
/** AI parameters for a ladder level 0…1 (easy → medium → hard). */
export function levelParams(level) {
  const l = Math.max(0, Math.min(1, level));
  const base = l < 0.5 ? lerpTier(AI_TIERS.easy, AI_TIERS.medium, l / 0.5) : lerpTier(AI_TIERS.medium, AI_TIERS.hard, (l - 0.5) / 0.5);
  return aiParams("medium", base);
}
export const tierName = (level) => (level < 0.34 ? "Easy" : level < 0.7 ? "Medium" : "Hard");

/** createMatch() config + AI params for battle `id` with the player's fighter. */
export function battleConfig(id, playerFighter) {
  const b = BATTLES[id - 1];
  if (!b) throw new Error(`no battle ${id}`);
  if (!FIGHTER_BY_ID[playerFighter]) throw new Error(`no fighter ${playerFighter}`);
  const mirror = b.opponent === playerFighter;
  return {
    battle: b,
    match: { mode: "arcade", battle: b.id, fighters: [playerFighter, b.opponent], arena: b.arena, mods: [{}, b.mods], alt: [false, mirror], boss: b.boss },
    ai: levelParams(b.level),
  };
}

/** 1-3 stars for a won battle. */
export function starsFor(result) {
  if (!result || result.winner !== 0) return 0;
  const clean = result.wins[1] === 0;
  const perfect = result.log.some((r) => r.winner === 0 && r.reason === "perfect");
  return 1 + (clean ? 1 : 0) + (perfect || (clean && result.hpLeft[0] >= 0.6) ? 1 : 0);
}
