/**
 * Lumberjack Life — engine tuning. Everything that affects feel lives here.
 */
export const STEP = 1 / 60; // fixed simulation step
export const MAX_FRAME = 0.1; // clamp after tab switches / debugger pauses / fullscreen

export const GRAVITY = 9.81;

export const PLAYER = {
  radius: 0.36,
  walk: 3.5,
  run: 6.1,
  carryWalk: 2.6,
  carryRun: 3.3,
  pullWalk: 3.0,
  pullRun: 4.4,
  accel: 15,
  decel: 19,
  turnRate: 11, // rad/s toward the move direction
  maxSlope: 0.85, // rise/run the player can walk up
  stride: 1.32, // metres per full walk cycle (two steps) — anim phase is driven by distance, so feet don't slide
  runStride: 2.05,
};

/** the felling cut height above the ground at the tree base */
export const CUT_HEIGHT = 0.6;

/**
 * Axe swing timeline as fractions of the tool's swing duration:
 * wind-up → strike (whoosh) → IMPACT (damage + hit feedback, exactly when the
 * rendered blade reaches the wood) → recovery.
 */
export const SWING = {
  whooshAt: 0.44,
  impactAt: 0.58,
  ideal: 0.95, // trunk surface distance the side-swing pose reaches
  idealDown: 0.92, // horizontal distance to a cut mark for the overhead chop
  minSurface: 0.32,
  facing: 0.85, // max |angle| (rad) between facing and target at impact
  assistSpeed: 1.6, // m/s the wind-up may step the player toward the ideal spot
};

export const CHAINSAW = {
  startTime: 0.95,
  stopTime: 0.4,
  ideal: 0.78,
  reachExtra: 0.95, // surface reach = bar + this
};

export const ACTIONS = {
  pickup: { dur: 0.62, at: 0.36 },
  drop: { dur: 0.5, at: 0.3 },
  deposit: { dur: 0.55, at: 0.32 },
  load: { dur: 0.55, at: 0.32 },
  take: { dur: 0.6, at: 0.34 },
};

export const LOG = {
  kerf: 0.07, // gap between neighbouring sections so freshly cut logs never overlap
  rollThreshold: 0.13, // cross-slope (rise/run) below which a resting log stays put
  rollAccel: 4.2,
  rollFriction: 1.6,
  maxRoll: 2.4,
  sleepSpeed: 0.04,
  sleepTime: 0.5,
};

export const TREE = {
  creakTime: 0.75,
  leanAngle: 0.07,
  fallGain: 1.9, // multiplies g/L in the falling-rod equation (game feel)
  bounceTime: 0.32,
  bounceAmp: 0.055,
  settleTime: 0.38,
  regrowDelay: 150,
  growTime: 9,
};

export const MILL_T = {
  roll: 0.7,
  feed: 2.3,
  cutBase: 1.1,
  cutPerM: 0.85,
  out: 1.5,
};

export const UNLOAD_INTERVAL = 0.42;
