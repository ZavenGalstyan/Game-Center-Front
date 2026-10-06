/**
 * Lost Toy — every movement / feel number in one place.
 *
 * UNITS: 1 unit = 10 cm of the real house. The toy is 1.0 unit tall, so a
 * 75 cm desk is 7.5 units high, a pencil is ~1.8 units long and a bedroom is
 * ~60 units across. Everything is authored at true household scale; the
 * engine just runs at the toy's size.
 *
 * The engine is a fixed-step kinematic controller (see player.js); nothing
 * here depends on frame rate.
 *
 * Jump maths (full hold, flat ground):
 *   apex height  h = JUMP_VEL² / (2·GRAVITY)          ≈ 1.15 u (a bit over the toy's own height)
 *   time to apex t = JUMP_VEL / GRAVITY                ≈ 0.35 s
 *   fall back    t = √(2h / (GRAVITY·FALL_MULT))       ≈ 0.31 s
 *   → ~0.66 s airtime: ≈ 2.1 u at run speed, ≈ 3.1 u at sprint speed.
 *   tap jump (released at once): apex ≈ 0.6 u.
 * Level gaps are authored against these numbers (see data/kit.js GAP).
 */
export const MOVE = {
  /* collider (vertical cylinder, position = feet) */
  RADIUS: 0.26,
  HEIGHT: 1.0,
  STEP_UP: 0.17, // a flat-lying notebook / rug edge is walked over without a jump

  /* ground speeds (u/s) */
  WALK_SPEED: 1.45,
  RUN_SPEED: 3.3,
  SPRINT_SPEED: 4.75,
  PUSH_SPEED: 1.15,
  GROUND_ACCEL: 24,
  SPRINT_ACCEL: 11,
  GROUND_DECEL: 26,
  TURN_DECEL: 36,
  SLIP_ACCEL_MULT: 0.22, // wet tiles / polished metal: same top speed, much less grip
  ROT_SPEED: 14,
  SPRINT_MIN_INPUT: 0.55,
  SHALLOW_WATER_MULT: 0.62,
  BALANCE_SPEED_MULT: 0.72, // pencils, rulers, fence rails
  BALANCE_WIDTH: 0.62, // a ground box narrower than this (either axis) = balancing

  /* air */
  AIR_ACCEL: 10,
  AIR_MAX_GAIN: 2.5,
  AIR_DRAG: 0.25,
  GRAVITY: 19,
  FALL_MULT: 1.3,
  JUMP_CUT_MULT: 2.1, // released early while rising → extra gravity until apex (variable jump)
  MAX_FALL: 17,
  JUMP_VEL: 6.6,
  JUMP_SPRINT_BONUS: 0.18,
  COYOTE: 0.13,
  JUMP_BUFFER: 0.14,

  /* bounce surfaces (pillow, cushion, spring toy …) */
  BOUNCE_MIN_IMPACT: 2.2, // slower touch-downs just land softly
  BOUNCE_HELD_MULT: 1.0, // holding jump on contact = full bounce
  BOUNCE_LOOSE_MULT: 0.78,
  BOUNCE_DECAY: 0.6, // un-held bounce = 60% of the impact speed → settles after a few hops
  BOUNCE_JUMP_MULT: 1.12, // jumping off a soft surface while standing on it

  /* landing */
  HARD_LAND_VEL: 11.2, // ≈ a 2.5 u (two toy heights) drop
  HARD_LAND_TIME: 0.22,
  HARD_LAND_SPEED_MULT: 0.5,
  SOFT_LAND_TIME: 0.08,

  /* ledge grab / pull-up */
  LEDGE_MIN: 0.42, // lip above feet: lower than this = mantle (quick hop-up)
  LEDGE_MAX: 1.42,
  LEDGE_REACH: 0.24,
  LEDGE_HANG_TIME: 0.16,
  LEDGE_CLIMB_TIME: 0.42,
  MANTLE_MIN: 0.16,

  /* climbable surfaces (bedsheet, cloth, net …) */
  CLIMB_SPEED: 1.75,
  CLIMB_REACH: 0.2,
  CLIMB_JUMP_OUT: 3.2,
  CLIMB_JUMP_UP: 5.6,

  /* push */
  PUSH_DELAY: 0.16, // lean into a block this long before it starts to move

  /* hazards */
  KNOCKBACK: 3.6,
  STUMBLE_TIME: 0.45,

  /* respawn */
  FALL_FADE_TIME: 0.5,
  HAZARD_FADE_DELAY: 0.4, // the "oops" reaction plays before the fade
  RESPAWN_TIME: 0.4,

  /* simulation */
  STEP: 1 / 120,
  MAX_FRAME_DT: 0.05,
  MAX_SUBSTEP_MOVE: 0.07, // never move more than this per collision pass → no tunnelling
};

/** Platforming Assist (Settings) — a little more forgiveness, never automation. */
export const ASSIST = {
  COYOTE: 0.2,
  JUMP_BUFFER: 0.21,
  LEDGE_MAX: 1.62,
  LEDGE_REACH: 0.36,
  ASSIST_LAND: 0.06, // extra support radius on moving platforms
};

export function tuning(assist) {
  return assist ? { ...MOVE, ...ASSIST, assist: true } : { ...MOVE, assist: false, ASSIST_LAND: 0 };
}

/**
 * Engine states. Visual animation states (IDLE / WALK / RUN / SPRINT /
 * JUMP_START / FALL / LAND_SOFT …) are derived from these + the player's
 * velocity in three/toy.js — they never drive gameplay.
 */
export const STATES = {
  GROUND: "ground", // idle / walk / run / sprint / balance / ride chosen by speed + ground
  AIR: "air", // jump ascend / fall / bounce chosen by vy + how we left the ground
  PUSH: "push",
  LEDGE: "ledge", // hang → pull up
  CLIMB: "climb", // on a climbable cloth / net face
  STUMBLE: "stumble",
  HURT: "hurt", // hit by a hazard: short reaction, then fade + respawn
  FALLING_OUT: "fallout", // below the room / in deep water, fading out
  RESPAWN: "respawn",
  FINISHED: "finished",
};
