/**
 * Arena Gladiator — shared combat constants (metres, seconds, radians).
 * Body proportions are shared by the engine (hurtboxes, weapon poses) and the
 * renderer (rig lengths), so the sword you see is exactly the sword that hits.
 */
export const SIM_DT = 1 / 120; // fixed simulation step
export const MAX_FRAME_DT = 0.1; // clamp after tab switches / lag spikes

export const BODY = {
  hipY: 0.94,
  hipHalf: 0.1,
  thigh: 0.44,
  shin: 0.44,
  ankle: 0.07,
  spineY: 0.06, // pelvis → spine pivot
  shoulderY: 1.42,
  shoulderHalf: 0.2,
  upperArm: 0.29,
  foreArm: 0.27, // elbow → grip centre
  eyeY: 1.64,
  radius: 0.3, // movement collision radius
};

/** Minimum centre distance between two fighters. */
export const FIGHTER_GAP = 0.72;

/** Hurtboxes in fighter-local (r, u, f): capsules [a, b, radius]. */
export const HURTBOXES = [
  { part: "legs", a: [0, 0.14, 0], b: [0, 0.86, 0], r: 0.16 },
  { part: "body", a: [0, 0.95, 0.01], b: [0, 1.4, 0.01], r: 0.21 },
  { part: "head", a: [0, 1.6, 0.03], b: [0, 1.66, 0.03], r: 0.13 },
];

export const STAMINA = {
  max: 100,
  regen: 30, // per second
  regenDelay: 0.65, // after spending
  regenBlocking: 0.35, // regen multiplier while guard is up
  sprint: 9, // per second
  exhaustedUntil: 25, // exhaustion clears once stamina climbs back here
  heavyMin: 16, // heavy attacks need at least this much
  dodgeMin: 10, // below this a dodge is refused; below full cost it is shortened
};

export const TIMING = {
  parryWindow: 0.2, // guard raised this recently → a hit is parried
  parryRearm: 0.4, // guard must have been down this long for a fresh press to parry
  inputBuffer: 0.24, // attack/dodge presses remembered during another action
  counterWindow: 1.0, // after a parry / block, the next hit is a counter
  dodgeDur: 0.38,
  dodgeIFrames: [0.04, 0.2], // invulnerable only in this slice of the dodge
  dodgeCooldown: 0.14,
  blockStun: 0.2,
  hurtLight: 0.3,
  hurtHeavy: 0.52,
  guardBreak: 0.62,
  parried: 0.78,
  clash: 0.34,
};

export const HITSTOP = { light: 0.035, heavy: 0.07, parry: 0.08, block: 0.03, guardBreak: 0.075, clash: 0.05, kick: 0.04 };

export const MOVE = {
  walk: 3.1,
  sprint: 5.5,
  blockMul: 0.5,
  attackMul: 0.35,
  exhaustedMul: 0.82,
  accel: 16,
  turn: 16, // rad/s when free
};
