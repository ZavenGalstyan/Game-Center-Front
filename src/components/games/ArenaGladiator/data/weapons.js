/**
 * Arena Gladiator — weapon and armour data.
 *
 * Every weapon is pure data on top of ONE combat system: its blade geometry,
 * its guard / block poses, and its attacks. An attack is authored as two key
 * poses per hand — the wind-up (end of STARTUP) and the strike end (end of
 * ACTIVE) — and the shared pose code (engine/pose.js) interpolates
 * guard → wind-up → strike → guard. The hitbox and the rendered weapon are
 * both computed from that same pose, so what you see is what hits.
 *
 * Hand pose  { h: [yaw, pitch, dist], b: [yaw, pitch] }
 *   h — hand position around its shoulder: yaw (+ = toward the fighter's
 *       right), pitch (+ = up), distance (m, ≤ upperArm + foreArm).
 *   b — direction the blade points (or, for a shield, the direction its face
 *       looks), same yaw/pitch convention, in the fighter's local frame.
 */

/* --------------------------------------------------------------------- kick */
/** Shared by every weapon — a front push-kick that breaks a raised guard. */
export const KICK = {
  id: "kick",
  kind: "kick",
  name: "Kick",
  startup: 0.2,
  active: 0.1,
  recovery: 0.36,
  damage: 3,
  stamina: 14,
  lunge: 0.25,
  // foot path in local (r, u, f): from under the hip out to full extension
  foot: { from: [0.1, 0.45, 0.25], to: [0.08, 0.78, 1.02], radius: 0.11 },
};

/* ------------------------------------------------------------------ weapons */
const SWORD_SHIELD = {
  id: "sword_shield",
  name: "Gladius & Parma",
  short: "SWORD + SHIELD",
  desc: "Balanced short sword with a round shield. Solid guard, honest reach.",
  stats: { damage: 3, speed: 3, range: 3, stamina: 3 },
  shield: { radius: 0.3, model: "round" },
  blockArc: 1.35, // half-angle of the protected front arc
  blockCost: 0.75, // shield soaks part of every blocked hit
  blades: { R: { model: "gladius", grip: 0.1, length: 0.78, hitFrom: 0.05, radius: 0.035 } },
  guard: {
    R: { h: [0.25, -0.75, 0.46], b: [-0.2, 0.6] },
    L: { h: [0.2, -0.55, 0.44], b: [-0.35, 0.05] },
  },
  block: {
    R: { h: [0.62, -0.62, 0.36], b: [0.25, 1.05] },
    L: { h: [0.46, -0.24, 0.47], b: [0.0, 0.12] },
  },
  light: [
    {
      id: "slashR", name: "Right slash", startup: 0.22, active: 0.11, recovery: 0.32, chainAt: 0.1,
      damage: 9, stamina: 11, lunge: 0.28,
      R: { w: { h: [1.25, -0.02, 0.42], b: [2.0, 0.38] }, e: { h: [-0.55, -0.36, 0.5], b: [-1.55, -0.2] } },
      L: { w: { h: [0.05, -0.5, 0.42], b: [-0.6, 0.05] }, e: { h: [0.35, -0.55, 0.44], b: [-0.2, 0.05] } },
    },
    {
      id: "slashL", name: "Backhand slash", startup: 0.2, active: 0.11, recovery: 0.34, chainAt: 0.1,
      damage: 9, stamina: 11, lunge: 0.3,
      R: { w: { h: [-0.52, 0.06, 0.42], b: [-1.9, 0.45] }, e: { h: [1.1, -0.36, 0.48], b: [1.7, -0.15] } },
      L: { w: { h: [0.35, -0.6, 0.4], b: [-0.2, 0.05] }, e: { h: [0.0, -0.5, 0.42], b: [-0.6, 0.05] } },
    },
    {
      id: "thrust", name: "Thrust", startup: 0.24, active: 0.1, recovery: 0.4, chainAt: 0.12,
      damage: 11, stamina: 12, lunge: 0.45,
      R: { w: { h: [0.35, -0.32, 0.2], b: [-0.08, 0.03] }, e: { h: [0.02, -0.24, 0.56], b: [-0.17, -0.03] } },
      L: { w: { h: [0.3, -0.45, 0.45], b: [-0.1, 0.05] }, e: { h: [-0.1, -0.6, 0.38], b: [-0.5, 0.05] } },
    },
  ],
  heavy: {
    id: "overhead", name: "Overhead strike", startup: 0.5, active: 0.14, recovery: 0.52,
    damage: 21, stamina: 24, lunge: 0.42,
    R: { w: { h: [0.18, 1.2, 0.36], b: [0.08, 2.45] }, e: { h: [0.0, -0.55, 0.54], b: [0.0, -0.82] } },
    L: { w: { h: [0.1, -0.35, 0.44], b: [-0.3, 0.1] }, e: { h: [-0.05, -0.62, 0.4], b: [-0.6, 0.0] } },
  },
};

const GLADIUS = {
  ...SWORD_SHIELD,
  id: "sword",
  name: "Longsword",
  short: "SWORD",
  desc: "Longer blade, no shield. Parries with the sword — narrower, costlier guard.",
  stats: { damage: 3, speed: 4, range: 4, stamina: 3 },
  shield: null,
  blockArc: 0.95,
  blockCost: 1.05,
  blades: { R: { model: "longsword", grip: 0.1, length: 0.9, hitFrom: 0.05, radius: 0.035 } },
  guard: {
    R: { h: [0.1, -0.7, 0.46], b: [-0.15, 0.7] },
    L: { h: [0.4, -0.95, 0.36], b: [0.0, -0.5] },
  },
  block: {
    R: { h: [-0.35, -0.2, 0.44], b: [-1.35, 0.35] },
    L: { h: [0.5, -0.9, 0.36], b: [0.0, -0.5] },
  },
};
GLADIUS.light = SWORD_SHIELD.light.map((a) => ({ ...a, startup: a.startup * 0.92, L: undefined }));
GLADIUS.heavy = { ...SWORD_SHIELD.heavy, L: undefined, startup: 0.46, damage: 22 };

const SPEAR_SHIELD = {
  id: "spear",
  name: "Hasta & Shield",
  short: "SPEAR",
  desc: "Long reach — only the spearhead cuts. Keep them at the tip; up close it is clumsy.",
  stats: { damage: 3, speed: 3, range: 5, stamina: 3 },
  shield: { radius: 0.33, model: "oval" },
  blockArc: 1.3,
  blockCost: 0.8,
  blades: { R: { model: "spear", grip: -0.55, length: 1.95, hitFrom: 0.8, radius: 0.04 } },
  guard: {
    R: { h: [0.4, -0.62, 0.4], b: [-0.08, 0.1] },
    L: { h: [0.2, -0.55, 0.44], b: [-0.35, 0.05] },
  },
  block: {
    R: { h: [0.7, -0.5, 0.34], b: [0.1, 0.5] },
    L: { h: [0.46, -0.24, 0.47], b: [0.0, 0.12] },
  },
  light: [
    {
      id: "jabHigh", name: "High thrust", startup: 0.24, active: 0.11, recovery: 0.36, chainAt: 0.12,
      damage: 9, stamina: 11, lunge: 0.3,
      R: { w: { h: [0.55, -0.1, 0.18], b: [-0.1, 0.02] }, e: { h: [0.1, -0.12, 0.56], b: [-0.13, -0.06] } },
    },
    {
      id: "jabLow", name: "Low thrust", startup: 0.24, active: 0.11, recovery: 0.38, chainAt: 0.12,
      damage: 9, stamina: 11, lunge: 0.32,
      R: { w: { h: [0.5, -0.75, 0.2], b: [-0.1, 0.02] }, e: { h: [0.08, -0.6, 0.56], b: [-0.13, 0.02] } },
    },
  ],
  heavy: {
    id: "lunge", name: "Lunging thrust", startup: 0.48, active: 0.14, recovery: 0.55,
    damage: 20, stamina: 24, lunge: 0.85,
    R: { w: { h: [0.6, 0.35, 0.16], b: [-0.1, 0.05] }, e: { h: [0.05, -0.18, 0.56], b: [-0.13, -0.08] } },
    L: { w: { h: [0.1, -0.35, 0.44], b: [-0.3, 0.1] }, e: { h: [-0.1, -0.62, 0.4], b: [-0.6, 0.0] } },
  },
};

const AXE = {
  id: "axe",
  name: "Bearded Axe",
  short: "AXE",
  desc: "Slow and brutal. Heavy chops chew through guards and stamina.",
  stats: { damage: 5, speed: 2, range: 3, stamina: 2 },
  shield: null,
  blockArc: 0.9,
  blockCost: 1.1,
  blades: { R: { model: "axe", grip: 0.05, length: 0.82, hitFrom: 0.62, radius: 0.07 } },
  guard: {
    R: { h: [0.35, -0.72, 0.42], b: [-0.1, 0.9] },
    L: { h: [0.45, -0.95, 0.34], b: [0.0, -0.5] },
  },
  block: {
    R: { h: [-0.3, -0.15, 0.44], b: [-1.4, 0.4] },
    L: { h: [0.55, -0.85, 0.36], b: [0.0, -0.5] },
  },
  light: [
    {
      id: "chopR", name: "Diagonal chop", startup: 0.3, active: 0.12, recovery: 0.4, chainAt: 0.14,
      damage: 13, stamina: 14, lunge: 0.3,
      R: { w: { h: [1.0, 0.55, 0.36], b: [1.4, 1.2] }, e: { h: [-0.35, -0.6, 0.5], b: [-1.0, -0.7] } },
    },
    {
      id: "chopL", name: "Rising chop", startup: 0.3, active: 0.12, recovery: 0.42, chainAt: 0.14,
      damage: 13, stamina: 14, lunge: 0.3,
      R: { w: { h: [-0.5, -0.4, 0.42], b: [-1.8, -0.2] }, e: { h: [0.9, 0.1, 0.46], b: [1.5, 0.55] } },
    },
  ],
  heavy: {
    id: "cleave", name: "Cleave", startup: 0.62, active: 0.15, recovery: 0.62,
    damage: 28, stamina: 28, lunge: 0.45,
    R: { w: { h: [0.25, 1.3, 0.34], b: [0.1, 2.6] }, e: { h: [0.0, -0.6, 0.54], b: [0.0, -0.95] } },
  },
};

const DUAL = {
  id: "dual",
  name: "Twin Sicae",
  short: "DUAL BLADES",
  desc: "Two curved short blades. Fastest attacks, flimsiest guard.",
  stats: { damage: 2, speed: 5, range: 2, stamina: 4 },
  shield: null,
  blockArc: 0.95,
  blockCost: 1.15,
  blades: {
    R: { model: "sica", grip: 0.09, length: 0.6, hitFrom: 0.05, radius: 0.032 },
    L: { model: "sica", grip: 0.09, length: 0.6, hitFrom: 0.05, radius: 0.032 },
  },
  guard: {
    R: { h: [0.25, -0.72, 0.44], b: [-0.3, 0.55] },
    L: { h: [-0.25, -0.72, 0.44], b: [0.3, 0.55] },
  },
  block: {
    R: { h: [-0.25, -0.3, 0.44], b: [-1.1, 0.8] },
    L: { h: [0.25, -0.3, 0.44], b: [1.1, 0.8] },
  },
  light: [
    {
      id: "cutR", name: "Right cut", startup: 0.17, active: 0.09, recovery: 0.26, chainAt: 0.08,
      damage: 6, stamina: 8, lunge: 0.26,
      R: { w: { h: [1.1, 0.0, 0.4], b: [1.9, 0.35] }, e: { h: [-0.5, -0.36, 0.5], b: [-1.5, -0.2] } },
    },
    {
      id: "cutL", name: "Left cut", startup: 0.17, active: 0.09, recovery: 0.26, chainAt: 0.08,
      damage: 6, stamina: 8, lunge: 0.26,
      L: { w: { h: [-1.1, 0.0, 0.4], b: [-1.9, 0.35] }, e: { h: [0.5, -0.36, 0.5], b: [1.5, -0.2] } },
    },
    {
      id: "cross", name: "Cross cut", startup: 0.2, active: 0.1, recovery: 0.36, chainAt: 0.1,
      damage: 7, stamina: 10, lunge: 0.34,
      R: { w: { h: [0.9, 0.5, 0.36], b: [1.2, 1.2] }, e: { h: [-0.4, -0.55, 0.5], b: [-1.0, -0.6] } },
      L: { w: { h: [-0.9, 0.5, 0.36], b: [-1.2, 1.2] }, e: { h: [0.4, -0.55, 0.5], b: [1.0, -0.6] } },
    },
  ],
  heavy: {
    id: "scissor", name: "Scissor strike", startup: 0.42, active: 0.13, recovery: 0.48,
    damage: 17, stamina: 22, lunge: 0.5,
    R: { w: { h: [1.2, 0.4, 0.38], b: [1.8, 0.7] }, e: { h: [-0.3, -0.3, 0.52], b: [-1.2, -0.2] } },
    L: { w: { h: [-1.2, 0.4, 0.38], b: [-1.8, 0.7] }, e: { h: [0.3, -0.3, 0.52], b: [1.2, -0.2] } },
  },
};

export const WEAPONS = [SWORD_SHIELD, SPEAR_SHIELD, GLADIUS, AXE, DUAL];
export const weaponById = (id) => WEAPONS.find((w) => w.id === id) || SWORD_SHIELD;

/* ------------------------------------------------------------------- armour */
export const ARMORS = [
  {
    id: "light", name: "Light Leathers", desc: "Faster, longer dodges. Hits land harder.",
    defense: 0.0, dodgeMul: 1.14, regenMul: 1.08, moveMul: 1.04,
  },
  {
    id: "balanced", name: "Arena Harness", desc: "Leather and one steel pauldron. The honest middle.",
    defense: 0.1, dodgeMul: 1.0, regenMul: 1.0, moveMul: 1.0,
  },
  {
    id: "heavy", name: "Iron Scale", desc: "Soaks damage. Slower stamina and shorter dodges.",
    defense: 0.2, dodgeMul: 0.86, regenMul: 0.86, moveMul: 0.95,
  },
];
export const armorById = (id) => ARMORS.find((a) => a.id === id) || ARMORS[1];
