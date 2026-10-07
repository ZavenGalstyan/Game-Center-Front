/**
 * Dungeon Knight — tuning. Every combat number lives here so the engine, the
 * renderer and the Node tests agree. Times are seconds, distances metres.
 */
export const SIM_DT = 1 / 60; // fixed simulation step
export const MAX_FRAME_DT = 0.05; // a long frame (tab switch, GC) never simulates more than this
export const SUBSTEPS = 4; // blade sub-samples per step during ACTIVE frames

export const PLAYER = {
  radius: 0.36,
  height: 1.82,
  walk: 4.0,
  run: 6.4,
  blockWalk: 1.9,
  potionWalk: 1.5,
  attackDrift: 1.2, // m/s of steering allowed while swinging
  accel: 34,
  decel: 28,
  turnRate: 13, // rad/s free movement
  attackTurn: 9, // rad/s during startup (aim)
  shoulderY: 1.42,
  chestY: 1.25,
};

export const STAMINA = {
  max: 100,
  regen: 42, // per second
  regenDelay: 0.65,
  exhaustedDelay: 1.15, // regen delay after hitting zero
  blockRegenMul: 0.35, // regen while holding block
  sprintCost: 13, // per second
  dodgeCost: 24,
  lightCost: 13,
  heavyCost: 30,
  minLight: 4, // a light attack is allowed while stamina ≥ this (it may drain to 0)
};

/**
 * Attack timing. `blade` is a keyed sweep in the knight's local frame: the
 * same function poses the rendered sword and the hit-tested sword.
 *   kind "h"  horizontal slash: angle a sweeps around the body (rad, + = right)
 *   kind "v"  vertical slash: angle p sweeps over the body (rad, + = up)
 */
export const ATTACKS = {
  light1: {
    startup: 0.15, active: 0.12, recovery: 0.27, comboOpen: 0.06, cancelAt: 0.1,
    dmg: 1.0, poise: 1, stamina: STAMINA.lightCost, lunge: 0.42, next: "light2",
    kind: "h", from: 1.75, wind: 1.95, a0: 1.25, a1: -1.25, end: -1.45, hy: 1.1, pitch: -0.12, roll: 0.15,
  },
  light2: {
    startup: 0.13, active: 0.13, recovery: 0.33, comboOpen: 0.06, cancelAt: 0.12,
    dmg: 1.15, poise: 1, stamina: STAMINA.lightCost, lunge: 0.5, next: "light1",
    kind: "h", from: -1.45, wind: -1.75, a0: -1.2, a1: 1.3, end: 1.5, hy: 1.2, pitch: -0.05, roll: -0.2,
  },
  heavy: {
    startup: 0.42, active: 0.15, recovery: 0.5, comboOpen: 0, cancelAt: 0.4,
    dmg: 2.3, poise: 3, stamina: STAMINA.heavyCost, lunge: 0.75, next: null, heavy: true,
    kind: "v", from: 1.2, wind: 2.25, a0: 1.75, a1: -0.55, end: -0.75, hy: 0, pitch: 0, roll: 0,
  },
};
export const COMBO_BUFFER = 0.32; // a click this early still counts
export const WALL_BOUNCE = 0.18; // extra recovery when the blade hits stone or a raised shield

export const DODGE = {
  time: 0.46,
  dist: 3.7,
  iStart: 0.05,
  iEnd: 0.3,
  cooldown: 0.12, // after the roll ends, before another
  recoverAt: 0.36, // attacks may start from here (roll-out)
};

export const BLOCK = {
  raise: 0.1, // shield up this long after the button
  arc: 72 * (Math.PI / 180), // ± from facing
  hitReact: 0.22,
  guardBreak: 0.85, // stun after the guard breaks
  staminaPerDmg: 1.35,
};

export const HURT = { time: 0.34, invuln: 0.5, knock: 3.2 };
export const POTION = { time: 0.95, healAt: 0.5, heal: 45, cooldown: 0.25 };
export const INTERACT = { range: 1.6, chestTime: 0.9 };

/** Combat feel (purely presentational, but timed by the engine). */
export const HITSTOP = { light: 0.045, heavy: 0.07, block: 0.03, playerHurt: 0.05, kill: 0.065 };

/** Enemy pressure: how many enemies may be in an attack at once, and spacing. */
export const PRESSURE = { maxAttackers: 2, attackGap: 0.45, bossGap: 0.2 };

/** Shared player curve (levels / upgrades live in progression.js). */
export const BASE = { hp: 100, stamina: 100, potions: 3 };
