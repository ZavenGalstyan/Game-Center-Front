/**
 * Three-branch skill tree. Each node: ranks, level requirement, prerequisites
 * ({node: minRank}), and per-rank effects consumed by engine/profile.js.
 * Grid position (col, row) is for the UI only.
 */
export const BRANCHES = [
  { id: "combat", name: "Combat", color: "#ff3b5c", icon: "✦" },
  { id: "survival", name: "Survival", color: "#4dff9a", icon: "✚" },
  { id: "cyber", name: "Cybernetics", color: "#19f0ff", icon: "◈" },
];

export const SKILLS = {
  // ---------------------------------------------------------------- combat
  marksman: { branch: "combat", name: "Marksman", ranks: 3, level: 1, pos: [1, 0], desc: "+6% weapon damage per rank.", fx: { dmg: 0.06 } },
  quickHands: { branch: "combat", name: "Quick Hands", ranks: 2, level: 3, req: { marksman: 1 }, pos: [0, 1], desc: "+12% reload speed per rank.", fx: { reload: 0.12 } },
  steadyAim: { branch: "combat", name: "Steady Aim", ranks: 3, level: 4, req: { marksman: 1 }, pos: [2, 1], desc: "-10% weapon spread per rank.", fx: { accuracy: 0.1 } },
  brawler: { branch: "combat", name: "Brawler", ranks: 2, level: 5, req: { quickHands: 1 }, pos: [0, 2], desc: "+20% melee damage per rank, faster blade combos.", fx: { melee: 0.2 } },
  killer: { branch: "combat", name: "Killer Instinct", ranks: 3, level: 8, req: { steadyAim: 1 }, pos: [2, 2], desc: "+4% critical chance per rank.", fx: { crit: 0.04 } },
  executioner: { branch: "combat", name: "Executioner", ranks: 1, level: 14, req: { killer: 2 }, pos: [1, 3], desc: "Critical hits deal 2.5× damage instead of 2×.", fx: { critMult: 0.5 } },
  deadeye: { branch: "combat", name: "Deadeye", ranks: 1, level: 20, req: { executioner: 1 }, pos: [1, 4], desc: "Aimed (right mouse) shots deal +15% damage.", fx: { aimDmg: 0.15 } },
  // ---------------------------------------------------------------- survival
  tough: { branch: "survival", name: "Tough", ranks: 3, level: 1, pos: [1, 0], desc: "+15 maximum health per rank.", fx: { hp: 15 } },
  plated: { branch: "survival", name: "Plated", ranks: 3, level: 3, req: { tough: 1 }, pos: [0, 1], desc: "+15% armour per rank.", fx: { armorMult: 0.15 } },
  secondWind: { branch: "survival", name: "Second Wind", ranks: 2, level: 4, req: { tough: 1 }, pos: [2, 1], desc: "+25% stamina regeneration and +10 stamina per rank.", fx: { staRegen: 0.25, stamina: 10 } },
  hardened: { branch: "survival", name: "Hardened", ranks: 3, level: 8, req: { plated: 1 }, pos: [0, 2], desc: "-5% incoming damage per rank.", fx: { dr: 0.05 } },
  medic: { branch: "survival", name: "Field Medic", ranks: 2, level: 6, req: { secondWind: 1 }, pos: [2, 2], desc: "+30% healing per rank; natural regeneration reaches 20% further.", fx: { heal: 0.3, regenCap: 0.2 } },
  adrenal: { branch: "survival", name: "Adrenal Surge", ranks: 1, level: 14, req: { hardened: 2 }, pos: [1, 3], desc: "Armour starts recharging after 3 s (not 5) and recharges 50% faster.", fx: { armorRegen: 0.5 } },
  unbreakable: { branch: "survival", name: "Unbreakable", ranks: 1, level: 20, req: { adrenal: 1 }, pos: [1, 4], desc: "Once every 90 s, lethal damage leaves you at 1 health with 2 s of invulnerability.", fx: { unbreakable: 1 } },
  // ---------------------------------------------------------------- cybernetics
  overclock: { branch: "cyber", name: "Overclock", ranks: 3, level: 1, pos: [1, 0], desc: "+20 maximum cyber energy per rank.", fx: { energy: 20 } },
  breach: { branch: "cyber", name: "Breach Protocol", ranks: 3, level: 3, req: { overclock: 1 }, pos: [0, 1], desc: "+1 hacking power per rank: hacks are faster, breach timers longer.", fx: { hack: 1 } },
  dash: { branch: "cyber", name: "Kinetic Dash", ranks: 2, level: 4, req: { overclock: 1 }, pos: [2, 1], desc: "Dodges travel 20% further and cost 25% less stamina per rank.", fx: { dash: 0.2 } },
  capacitor: { branch: "cyber", name: "Capacitor", ranks: 2, level: 7, req: { dash: 1 }, pos: [2, 2], desc: "+30% energy regeneration per rank.", fx: { energyRegen: 0.3 } },
  shortCircuit: { branch: "cyber", name: "Short Circuit", ranks: 2, level: 12, req: { breach: 2 }, pos: [0, 2], desc: "+15% damage to machines per rank; hits have an 8% chance per rank to stun robots.", fx: { vsRobot: 0.15, stun: 0.08 } },
  combatStim: { branch: "cyber", name: "Combat Stim", ranks: 1, level: 10, req: { capacitor: 1 }, pos: [1, 3], desc: "Using your Q ability also grants +15% damage for 6 s.", fx: { stimBoost: 0.15 } },
  ghost: { branch: "cyber", name: "Ghost Protocol", ranks: 1, level: 20, req: { combatStim: 1 }, pos: [1, 4], desc: "Cyberware cooldowns -30%; enemies detect you 40% slower while crouched.", fx: { cdr: 0.3, stealth: 0.4 } },
};

export const LEVEL_CAP = 30;
/** XP needed to go from level L to L+1. */
export const xpToNext = (L) => Math.round(140 + 85 * (L - 1) + 7 * (L - 1) * (L - 1));
