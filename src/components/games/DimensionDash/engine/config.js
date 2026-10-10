/**
 * Dimension Dash — tuning constants. Every gameplay number lives here so the
 * controller, the bot and the headless tests all agree.
 *
 * Units: metres, seconds. Heading convention (shared with three.js
 * `rotation.y` on +Z-facing models): forward(h) = (sin h, 0, cos h),
 * right(h) = (-cos h, 0, sin h).
 */
export const STEP = 1 / 120;
export const MAX_STEPS = 12; // per rendered frame (≈ 100 ms of catch-up)

export const GRAVITY = 40;

export const P = {
  radius: 0.42,
  height: 1.2, // standing collision height
  ballHeight: 0.9,

  // ground running
  accel: 21, // at zero speed; falls off toward top speed
  topSpeed: 21,
  sprintTop: 29,
  sprintAccel: 1.35,
  maxSpeed: 46,
  overspeedDrag: 7, // above top speed (after boosts), per second
  friction: 11, // no input
  skid: 62, // input opposes motion
  turnLow: 12, // rad/s at low speed
  turnHigh: 2.9, // rad/s at top speed
  slope: 0.85, // tangential gravity factor while running
  rollSlope: 1.25,
  rollFriction: 3.2,
  rollMin: 3.2, // below this a roll stands back up
  stepUp: 0.45,

  // air
  airAccel: 17,
  airTurn: 2.4,
  airDrag: 0.35,
  jumpV: 16.8,
  jumpCut: 7.5,
  coyote: 0.12,
  buffer: 0.14,
  maxFall: 48,

  // spin dash
  dashMin: 19,
  dashMax: 37,
  dashRev: 4.6, // per Space tap while charging
  dashAuto: 7, // per second of plain holding
  dashDecay: 1.6, // rev decay per second
  dashRecover: 0.3, // seconds before another charge
  dashRollTime: 0.9, // 3D: seconds the release stays a damaging roll

  // homing attack
  homingRange: 11,
  homingSpeed: 40,
  homingTime: 0.6,
  homingBounce: 14,

  // damage
  hurtTime: 0.6,
  invuln: 2.3,
  knockback: 7,
  knockUp: 10,
  maxScatter: 24,

  // rails / rides
  railCapture: 1.35,
  railSlope: 0.55,
  railFriction: 0.6,
  railAccel: 6,
  railTop: 34,
  rideSlope: 0.42, // tangential gravity on loops
  rideHold: 0.5, // fraction of g used for the stay-attached test
};

export const POWER = {
  speed: { name: "Speed Shoes", time: 12, color: "#ff5a3a" },
  magnet: { name: "Ring Magnet", time: 15, color: "#ffd23a" },
  shield: { name: "Shield", time: 0, color: "#5ad8ff" }, // until hit
  invincible: { name: "Invincibility", time: 12, color: "#ffffff" },
  jump: { name: "High Jump", time: 14, color: "#7bff6a" },
};
export const POWER_IDS = ["speed", "magnet", "shield", "invincible", "jump"];

export const SCORE = {
  enemy: 100,
  chain: [100, 200, 400, 800, 1000], // homing chain bonus
  ring: 10,
  monitor: 50,
  redStar: 1000,
  boss: 5000,
};

export const START_LIVES = 3;
