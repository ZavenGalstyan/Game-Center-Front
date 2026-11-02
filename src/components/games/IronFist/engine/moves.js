/**
 * Frame data for every attack. One table drives the simulation AND the baked
 * animation clips (render/clips.js), so the frame where a fist or shin reaches
 * full extension is the frame the engine tests the hit.
 *
 *   startup / active / recovery   seconds (scaled per fighter by `tempo`)
 *   dmg        base damage (× attacker power × battle modifier)
 *   reach      max centre-to-centre distance at which the strike connects
 *   band       [lo, hi] hit height above the attacker's feet; the defender's
 *              hurtbox is [y, y + BODY_TOP] — so low kicks miss a jumper
 *   hitstun / blockstun   seconds the defender is locked
 *   push       knockback speed given to the defender (m/s, × their weight)
 *   knockdown  finisher: the defender falls and gets up (no juggles)
 *   chip       fraction of damage that goes through a block
 *   advance    forward speed while the move is starting / active (m/s)
 *   level      reaction animation picked by the defender: high | mid | low
 */
export const MOVES = {
  jab: { id: "jab", kind: "punch", startup: 0.1, active: 0.06, recovery: 0.17, dmg: 42, reach: 1.0, band: [1.15, 1.8], hitstun: 0.34, blockstun: 0.2, push: 1.3, level: "high", advance: 0.6 },
  cross: { id: "cross", kind: "punch", startup: 0.13, active: 0.06, recovery: 0.2, dmg: 56, reach: 1.0, band: [1.1, 1.8], hitstun: 0.38, blockstun: 0.22, push: 1.7, level: "high", advance: 0.9 },
  uppercut: { id: "uppercut", kind: "punch", startup: 0.17, active: 0.08, recovery: 0.34, dmg: 86, reach: 0.85, band: [0.9, 1.8], hitstun: 0.5, blockstun: 0.26, push: 3.2, level: "high", knockdown: true, advance: 1.2, heavy: true },
  lowKick: { id: "lowKick", kind: "kick", startup: 0.12, active: 0.07, recovery: 0.2, dmg: 46, reach: 1.05, band: [0.0, 0.75], hitstun: 0.36, blockstun: 0.2, push: 1.2, level: "low", advance: 0.4 },
  midKick: { id: "midKick", kind: "kick", startup: 0.16, active: 0.07, recovery: 0.24, dmg: 64, reach: 1.1, band: [0.6, 1.4], hitstun: 0.42, blockstun: 0.24, push: 2.0, level: "mid", advance: 0.6 },
  roundhouse: { id: "roundhouse", kind: "kick", startup: 0.21, active: 0.08, recovery: 0.36, dmg: 96, reach: 1.1, band: [1.0, 1.85], hitstun: 0.5, blockstun: 0.28, push: 3.4, level: "high", knockdown: true, advance: 0.8, heavy: true },
  jumpKick: { id: "jumpKick", kind: "air", startup: 0.09, active: 0.24, recovery: 0.08, dmg: 68, reach: 1.08, band: [0.1, 1.35], hitstun: 0.42, blockstun: 0.24, push: 2.2, level: "high", air: true },

  /* specials — one per fighter, `kind: "special"`, behaviour in fight.js by `type` */
  dragonWave: { id: "dragonWave", kind: "special", type: "projectile", startup: 0.34, active: 0.04, recovery: 0.42, dmg: 150, reach: 0, band: [0.8, 1.6], hitstun: 0.6, blockstun: 0.34, push: 3.0, chip: 0.18, knockdown: true, level: "mid", proj: { speed: 7.2, y: 1.22, r: 0.32, life: 1.4 }, cooldown: 6 },
  infernoKick: { id: "infernoKick", kind: "special", type: "rush", startup: 0.16, active: 0.34, recovery: 0.36, dmg: 160, reach: 1.05, band: [0.5, 1.8], hitstun: 0.6, blockstun: 0.34, push: 3.6, chip: 0.15, knockdown: true, level: "high", advance: 6.2, cooldown: 6, heavy: true },
  quakeSlam: { id: "quakeSlam", kind: "special", type: "slam", startup: 0.44, active: 0.1, recovery: 0.5, dmg: 175, reach: 2.4, band: [0.0, 0.9], hitstun: 0.6, blockstun: 0.36, push: 3.4, chip: 0.2, knockdown: true, level: "low", armor: true, cooldown: 6.5, heavy: true },
  lightningRush: { id: "lightningRush", kind: "special", type: "rush", startup: 0.11, active: 0.24, recovery: 0.34, dmg: 138, reach: 1.0, band: [0.6, 1.8], hitstun: 0.6, blockstun: 0.3, push: 3.0, chip: 0.15, knockdown: true, level: "mid", advance: 10.5, cooldown: 5.5 },
  shadowStep: { id: "shadowStep", kind: "special", type: "teleport", startup: 0.36, active: 0.08, recovery: 0.4, dmg: 148, reach: 0.98, band: [0.6, 1.8], hitstun: 0.6, blockstun: 0.3, push: 3.0, chip: 0.15, knockdown: true, level: "high", vanish: [0.06, 0.24], teleportAt: 0.2, cooldown: 6.5 },
  thunderStrike: { id: "thunderStrike", kind: "special", type: "bolt", startup: 0.3, active: 0.06, recovery: 0.4, dmg: 165, reach: 0, band: [0, 3], hitstun: 0.6, blockstun: 0.36, push: 2.6, chip: 0.22, knockdown: true, level: "high", bolt: { delay: 0.4, r: 0.5 }, cooldown: 6.5 },
};

/** Three-hit chains: the n-th press (0, 1, 2) of a combo picks from this row. */
export const CHAIN = {
  punch: ["jab", "cross", "uppercut"],
  kick: ["lowKick", "midKick", "roundhouse"],
};
export const CHAIN_LEN = 3;

export const moveTotal = (m, tempo = 1) => (m.startup + m.active + m.recovery) * tempo;
