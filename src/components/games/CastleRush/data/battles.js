/**
 * Castle Rush — the 30-battle campaign (5 kingdoms × 6 battles).
 *
 * Every battle uses the same rules and the same unit table. What changes:
 *   enemyHp / playerHp   castle toughness
 *   startGold / enemyGold starting treasuries (shown on the battle card)
 *   ai                    commander profile (engine/ai.js) + unit taste
 *   playerUnits / enemyUnits what each side may deploy
 *   upgrades              whether the Treasury upgrade is offered
 * Both sides earn the same base income. The AI never gets free units.
 */
import { UNIT_IDS } from "./units.js";

/** units the player owns from a given battle on */
export function unitsForBattle(id) {
  if (id >= 5) return ["swordsman", "archer", "shield", "knight"];
  if (id >= 3) return ["swordsman", "archer", "shield"];
  if (id >= 2) return ["swordsman", "archer"];
  return ["swordsman"];
}

const ALL = UNIT_IDS;

const RAW = [
  // ---------------------------------------------------- GREEN KINGDOM
  { name: "First Assault", enemyHp: 1000, enemyGold: 60, ai: { level: "easy", think: 2.4, waste: 0.12 }, enemyUnits: ["swordsman"], tutorial: true },
  { name: "Arrows Over The Ford", enemyHp: 900, enemyGold: 60, ai: { level: "easy" }, enemyUnits: ["swordsman", "archer"], intro: "archer" },
  { name: "The Shield Wall", enemyHp: 950, enemyGold: 80, ai: { level: "easy", counter: 0.4 }, enemyUnits: ["swordsman", "archer", "shield"], intro: "shield" },
  { name: "Mill Road", enemyHp: 1100, enemyGold: 90, ai: { level: "easy", think: 2.0, counter: 0.5, waste: 0.12 }, enemyUnits: ["swordsman", "archer", "shield"], upgrades: true, intro: "treasury" },
  { name: "Banner Hill", enemyHp: 1150, enemyGold: 100, ai: { level: "easy", think: 1.9, counter: 0.55, waste: 0.1 }, enemyUnits: ["swordsman", "archer", "shield"], upgrades: true, intro: "knight" },
  { name: "Greenhold Keep", enemyHp: 1250, enemyGold: 110, ai: { level: "normal", think: 1.8 }, enemyUnits: ALL, upgrades: true },
  // ---------------------------------------------------- DESERT KINGDOM
  { name: "Dune Crossing", enemyHp: 1050, enemyGold: 120, ai: { level: "normal", think: 1.4, opener: 0.6 }, enemyUnits: ["swordsman", "archer"], upgrades: true },
  { name: "Canyon Ambush", enemyHp: 1100, enemyGold: 150, ai: { level: "normal", bias: { swordsman: 1.2 } }, enemyUnits: ["swordsman", "archer", "shield"], upgrades: true },
  { name: "Sandstone Gate", enemyHp: 1150, enemyGold: 150, ai: { level: "normal", push: 180 }, enemyUnits: ALL, upgrades: true },
  { name: "Oasis Raid", enemyHp: 1150, enemyGold: 180, ai: { level: "normal", think: 1.2, bias: { archer: 1.25 } }, enemyUnits: ALL, upgrades: true },
  { name: "Sun Temple", enemyHp: 1200, enemyGold: 180, ai: { level: "normal", think: 1.15, push: 200 }, enemyUnits: ALL, upgrades: true },
  { name: "Mirage Citadel", enemyHp: 1300, enemyGold: 200, ai: { level: "normal", think: 1.05, counter: 0.75, push: 220 }, enemyUnits: ALL, upgrades: true },
  // ---------------------------------------------------- FROZEN KINGDOM
  { name: "Frostbite Pass", enemyHp: 1200, enemyGold: 200, ai: { level: "normal", bias: { shield: 1.35 } }, enemyUnits: ALL, upgrades: true },
  { name: "Pinewood Siege", enemyHp: 1250, enemyGold: 200, ai: { level: "normal", think: 1.1, bias: { shield: 1.3, archer: 1.15 } }, enemyUnits: ALL, upgrades: true },
  { name: "Glacier Bridge", enemyHp: 1300, enemyGold: 200, ai: { level: "normal", think: 1.0, counter: 0.8, bias: { shield: 1.25 } }, enemyUnits: ALL, upgrades: true },
  { name: "Icefang Watch", enemyHp: 1350, enemyGold: 230, ai: { level: "hard", think: 1.1, bias: { shield: 1.2, knight: 1.1 } }, enemyUnits: ALL, upgrades: true },
  { name: "White Hollow", enemyHp: 1400, enemyGold: 220, ai: { level: "normal", think: 0.95, counter: 0.82, bias: { shield: 1.3 } }, enemyUnits: ALL, upgrades: true },
  { name: "Ice Citadel", enemyHp: 1500, enemyGold: 260, ai: { level: "hard", think: 0.95, bias: { shield: 1.25, knight: 1.15 } }, enemyUnits: ALL, upgrades: true },
  // ---------------------------------------------------- SHADOW KINGDOM
  { name: "Gloomwood", enemyHp: 1400, enemyGold: 260, ai: { level: "hard", think: 1.0 }, enemyUnits: ALL, upgrades: true },
  { name: "Crystal Marsh", enemyHp: 1450, enemyGold: 270, ai: { level: "hard", think: 0.95, bias: { archer: 1.2 } }, enemyUnits: ALL, upgrades: true },
  { name: "Hollow Bastion", enemyHp: 1500, enemyGold: 280, ai: { level: "hard", think: 0.9, push: 300 }, enemyUnits: ALL, upgrades: true },
  { name: "Raven Spire", enemyHp: 1550, enemyGold: 290, ai: { level: "hard", think: 0.9, bias: { knight: 1.2 } }, enemyUnits: ALL, upgrades: true },
  { name: "Night Ford", enemyHp: 1600, enemyGold: 300, ai: { level: "hard", think: 0.85, push: 320 }, enemyUnits: ALL, upgrades: true },
  { name: "Umbral Fortress", enemyHp: 1700, enemyGold: 280, ai: { level: "hard", think: 0.9, counter: 0.9, push: 300 }, enemyUnits: ALL, upgrades: true },
  // ---------------------------------------------------- ROYAL EMPIRE
  { name: "Imperial Road", enemyHp: 1650, enemyGold: 280, ai: { level: "hard", think: 0.95, push: 300 }, enemyUnits: ALL, upgrades: true },
  { name: "Statue Plaza", enemyHp: 1700, enemyGold: 290, ai: { level: "hard", think: 0.92, push: 320, bias: { knight: 1.15, shield: 1.1 } }, enemyUnits: ALL, upgrades: true },
  { name: "Golden Bridge", enemyHp: 1700, enemyGold: 340, ai: { level: "hard", think: 0.8, push: 340 }, enemyUnits: ALL, upgrades: true },
  { name: "Crown Gardens", enemyHp: 1750, enemyGold: 350, ai: { level: "hard", think: 0.75, counter: 0.95 }, enemyUnits: ALL, upgrades: true },
  { name: "The Grand Rampart", enemyHp: 1850, enemyGold: 360, ai: { level: "hard", think: 0.75, push: 360, counter: 0.95 }, enemyUnits: ALL, upgrades: true },
  { name: "Final Fortress", enemyHp: 2000, enemyGold: 400, ai: { level: "hard", think: 0.7, push: 380, counter: 0.97, eco: 0.7 }, enemyUnits: ALL, upgrades: true, final: true },
];

export const BATTLES = RAW.map((b, i) => {
  const id = i + 1;
  return {
    id,
    kingdom: Math.floor(i / 6) + 1,
    playerHp: 1000,
    startGold: 100,
    upgrades: false,
    tutorial: false,
    final: false,
    intro: null,
    ...b,
    id,
    playerUnits: unitsForBattle(id),
  };
});

export const getBattle = (id) => BATTLES.find((b) => b.id === id) || null;
export const battlesOfKingdom = (k) => BATTLES.filter((b) => b.kingdom === k);
export const difficultyLabel = (b) => (b.ai.level === "easy" ? "Easy" : b.ai.level === "hard" ? "Hard" : "Normal");
