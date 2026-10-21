/**
 * Strike catalogue — the single source of truth for timing, damage and hit
 * volumes. render/clips.js builds each attack animation from these numbers,
 * so the animated impact frame and the simulated active frames coincide.
 *
 * Units: seconds, metres, health points (head/body/legs pools are 100 each).
 *
 *   startup   time until the strike can connect (anticipation)
 *   active    window during which the hit volume is live
 *   recovery  time after the active window before the fighter can act again
 *   cancel    fraction of recovery after which a listed follow-up may start
 *   dmg       base damage to the target zone          sta  stamina cost
 *   zone      head | body | legs                       limb lh rh lf rf
 *   path      hit-volume tip in attacker space [x,y,z] at active start → end
 *             (x = attacker's left, y up, z toward the opponent), scaled by
 *             the fighter's size and reach
 *   rad       hit-volume radius                        push knockback m/s
 *   stun      hit-stun on a clean hit                  bstun block-stun
 *   ko        knockdown power factor                   acc  base accuracy
 *   arc       true = curved strike (hooks, kicks): beats a straight guard
 *             partially, slipped by ducking but not by side slips
 *   next      follow-ups that may cancel this move's recovery (combos)
 */
export const MOVES = {
  jab: { name: "Jab", kind: "punch", limb: "lh", zone: "head", startup: 0.12, active: 0.06, recovery: 0.18, cancel: 0.15, dmg: 3.2, sta: 3, path: [[0.06, 1.44, 0.45], [0.06, 1.46, 0.82]], rad: 0.1, push: 0.6, stun: 0.22, bstun: 0.14, ko: 0.25, acc: 0.95, next: ["jab", "cross", "hookL", "hookR", "uppercut", "bodyJab", "bodyCross", "kickLow", "kickBody", "kickHead", "jab2"] },
  jab2: { name: "Double Jab", kind: "punch", limb: "lh", zone: "head", startup: 0.1, active: 0.06, recovery: 0.2, cancel: 0.2, dmg: 3.0, sta: 3, path: [[0.06, 1.44, 0.45], [0.06, 1.46, 0.82]], rad: 0.1, push: 0.6, stun: 0.22, bstun: 0.14, ko: 0.25, acc: 0.95, next: ["cross", "hookL", "hookR"] },
  cross: { name: "Cross", kind: "punch", limb: "rh", zone: "head", startup: 0.18, active: 0.07, recovery: 0.26, cancel: 0.2, dmg: 7.5, sta: 6, path: [[0.0, 1.44, 0.45], [0.02, 1.46, 0.86]], rad: 0.1, push: 1.4, stun: 0.32, bstun: 0.2, ko: 0.8, acc: 0.88, next: ["hookL", "uppercut", "kickLow", "kickBody", "bodyJab", "jab"] },
  hookL: { name: "Left Hook", kind: "punch", limb: "lh", zone: "head", startup: 0.2, active: 0.08, recovery: 0.3, cancel: 0.2, dmg: 8.5, sta: 7, arc: true, path: [[0.45, 1.46, 0.45], [-0.05, 1.47, 0.62]], rad: 0.13, push: 1.2, stun: 0.36, bstun: 0.22, ko: 1.0, acc: 0.82, next: ["cross", "hookR", "uppercut", "kickLow", "kickHead"] },
  hookR: { name: "Right Hook", kind: "punch", limb: "rh", zone: "head", startup: 0.24, active: 0.08, recovery: 0.32, cancel: 0.2, dmg: 9.5, sta: 8, arc: true, path: [[-0.45, 1.46, 0.45], [0.05, 1.47, 0.62]], rad: 0.13, push: 1.4, stun: 0.38, bstun: 0.24, ko: 1.15, acc: 0.8, next: ["hookL", "uppercut", "kickLow"] },
  uppercut: { name: "Uppercut", kind: "punch", limb: "rh", zone: "head", startup: 0.22, active: 0.08, recovery: 0.34, cancel: 0.2, dmg: 9.0, sta: 8, path: [[-0.02, 1.0, 0.42], [0.0, 1.5, 0.56]], rad: 0.12, push: 1.0, stun: 0.4, bstun: 0.2, ko: 1.2, acc: 0.8, next: ["hookL", "cross"] },
  bodyJab: { name: "Body Jab", kind: "punch", limb: "lh", zone: "body", startup: 0.14, active: 0.06, recovery: 0.2, cancel: 0.2, dmg: 3.6, sta: 3, path: [[0.06, 1.15, 0.45], [0.06, 1.17, 0.8]], rad: 0.11, push: 0.4, stun: 0.2, bstun: 0.12, ko: 0, acc: 0.95, next: ["cross", "hookL", "kickHead", "uppercut"] },
  bodyCross: { name: "Body Cross", kind: "punch", limb: "rh", zone: "body", startup: 0.2, active: 0.07, recovery: 0.28, cancel: 0.2, dmg: 7.5, sta: 6, path: [[0.0, 1.12, 0.45], [0.02, 1.14, 0.82]], rad: 0.12, push: 0.9, stun: 0.3, bstun: 0.18, ko: 0, acc: 0.9, next: ["hookL", "kickHead", "uppercut"] },
  bodyHook: { name: "Body Hook", kind: "punch", limb: "lh", zone: "body", startup: 0.22, active: 0.08, recovery: 0.3, cancel: 0.2, dmg: 8.5, sta: 7, arc: true, path: [[0.42, 1.12, 0.42], [-0.04, 1.14, 0.6]], rad: 0.13, push: 0.8, stun: 0.36, bstun: 0.2, ko: 0, acc: 0.85, next: ["hookL", "cross", "uppercut", "kickHead"] },
  kickLow: { name: "Low Kick", kind: "kick", limb: "rf", zone: "legs", startup: 0.28, active: 0.1, recovery: 0.36, cancel: 0.25, dmg: 7.0, sta: 8, arc: true, path: [[-0.5, 0.45, 0.5], [0.15, 0.5, 0.78]], rad: 0.14, push: 0.6, stun: 0.3, bstun: 0.18, ko: 0, acc: 0.88, next: ["jab", "cross", "hookL"] },
  kickBody: { name: "Body Kick", kind: "kick", limb: "rf", zone: "body", startup: 0.34, active: 0.1, recovery: 0.42, cancel: 0.3, dmg: 12, sta: 12, arc: true, path: [[-0.55, 1.0, 0.5], [0.15, 1.1, 0.9]], rad: 0.15, push: 1.8, stun: 0.42, bstun: 0.28, ko: 0, acc: 0.82, next: ["jab", "cross"] },
  kickHead: { name: "Head Kick", kind: "kick", limb: "rf", zone: "head", startup: 0.44, active: 0.1, recovery: 0.5, cancel: 0.35, dmg: 16, sta: 16, arc: true, path: [[-0.55, 1.45, 0.45], [0.18, 1.55, 0.88]], rad: 0.16, push: 2.2, stun: 0.6, bstun: 0.32, ko: 2.2, acc: 0.7, next: [] },
  kickFront: { name: "Front Kick", kind: "kick", limb: "lf", zone: "body", startup: 0.3, active: 0.1, recovery: 0.38, cancel: 0.3, dmg: 8, sta: 9, path: [[0.1, 1.0, 0.45], [0.08, 1.1, 1.05]], rad: 0.14, push: 3.6, stun: 0.34, bstun: 0.22, ko: 0, acc: 0.86, next: ["cross", "jab", "kickBody"] },
  // clinch strikes (only from the clinch)
  knee: { name: "Clinch Knee", kind: "knee", limb: "rf", zone: "body", startup: 0.24, active: 0.08, recovery: 0.3, cancel: 0.3, dmg: 9, sta: 8, clinch: true, path: [[-0.1, 0.9, 0.2], [0.0, 1.1, 0.45]], rad: 0.18, push: 0.3, stun: 0.3, bstun: 0.18, ko: 0.6, acc: 0.9, next: ["knee", "elbow", "shortPunch"] },
  elbow: { name: "Clinch Elbow", kind: "elbow", limb: "rh", zone: "head", startup: 0.2, active: 0.07, recovery: 0.3, cancel: 0.3, dmg: 7.5, sta: 7, clinch: true, arc: true, path: [[-0.3, 1.45, 0.25], [0.05, 1.5, 0.4]], rad: 0.16, push: 0.3, stun: 0.34, bstun: 0.18, ko: 0.9, acc: 0.9, next: ["knee", "shortPunch"] },
  shortPunch: { name: "Short Uppercut", kind: "punch", limb: "lh", zone: "head", startup: 0.14, active: 0.06, recovery: 0.22, cancel: 0.3, dmg: 4.5, sta: 4, clinch: true, path: [[0.05, 1.1, 0.25], [0.05, 1.45, 0.38]], rad: 0.16, push: 0.2, stun: 0.24, bstun: 0.14, ko: 0.4, acc: 0.92, next: ["knee", "elbow", "shortPunch"] },
};

/** Total move duration. */
export const moveDuration = (m) => m.startup + m.active + m.recovery;

/** Named combinations the HUD calls out (bonus damage on the final hit). */
export const COMBOS = [
  { id: "1-2", name: "One-Two", seq: ["jab", "cross"], bonus: 0.1 },
  { id: "1-1-2", name: "Double Jab Cross", seq: ["jab", "jab2", "cross"], bonus: 0.15 },
  { id: "1-2-3", name: "One-Two-Hook", seq: ["jab", "cross", "hookL"], bonus: 0.2 },
  { id: "2-lk", name: "Cross Low Kick", seq: ["cross", "kickLow"], bonus: 0.15 },
  { id: "body-head", name: "Body-Head Switch", seq: ["bodyJab", "kickHead"], bonus: 0.2 },
  { id: "jab-body-head", name: "Jab-Body-Head Kick", seq: ["jab", "bodyJab", "kickHead"], bonus: 0.25 },
  { id: "3-2", name: "Hook-Cross", seq: ["hookL", "cross"], bonus: 0.12 },
  { id: "2-3-2", name: "Cross-Hook-Cross", seq: ["cross", "hookL", "cross"], bonus: 0.2 },
  { id: "1-2-up", name: "One-Two-Uppercut", seq: ["jab", "cross", "uppercut"], bonus: 0.2 },
  { id: "2-3-lk", name: "Cross-Hook-Low Kick", seq: ["cross", "hookL", "kickLow"], bonus: 0.22 },
  { id: "1-2-bk", name: "One-Two-Body Kick", seq: ["jab", "cross", "kickBody"], bonus: 0.2 },
  { id: "counter", name: "Counter", seq: [], bonus: 0 },
];

for (const [id, m] of Object.entries(MOVES)) m.id = id;
