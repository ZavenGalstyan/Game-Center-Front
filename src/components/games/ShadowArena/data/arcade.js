/**
 * Shadow Arena — the 30-battle Arcade ladder, built from one reusable
 * config per battle: opponent fighter, arena, AI difficulty `d` (0…1, fed to
 * engine/ai.js aiParams) and the opponent's health/damage tuning.
 *
 * Five tiers of six battles; every tier meets all six fighters once and ends
 * with a tougher "tier boss". The human always fights at 1× health/damage.
 */
import { aiParams } from "../engine/ai.js";

export const TIERS = ["Novice", "Contender", "Warrior", "Master", "Champion"];

// one order per tier so each tier sees all six fighters, in a fresh order
const ORDERS = [
  ["wind", "frost", "flame", "shadow", "thunder", "stone"],
  ["flame", "stone", "wind", "thunder", "frost", "shadow"],
  ["thunder", "shadow", "frost", "wind", "stone", "flame"],
  ["frost", "wind", "stone", "flame", "shadow", "thunder"],
  ["stone", "thunder", "shadow", "frost", "wind", "flame"],
];
const ARENA_CYCLE = ["temple", "rooftop", "desert", "cave"];

const round2 = (v) => Math.round(v * 100) / 100;

export const BATTLES = Array.from({ length: 30 }, (_, i) => {
  const tier = Math.floor(i / 6);
  const boss = i % 6 === 5;
  const d = round2(Math.min(1, Math.pow(i / 29, 0.95) + (boss ? 0.05 : 0)));
  return {
    id: i + 1,
    tier,
    tierName: TIERS[tier],
    boss,
    opp: ORDERS[tier][i % 6],
    arena: ARENA_CYCLE[(i + tier) % 4],
    d,
    ai: aiParams(d),
    hpMul: round2(0.8 + 0.24 * d + (boss ? 0.04 : 0)),
    dmgMul: round2(0.75 + 0.25 * d),
    roundTime: 60,
  };
});

export const BATTLE_COUNT = BATTLES.length;
