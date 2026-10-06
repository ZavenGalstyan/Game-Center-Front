/**
 * Rooftop Dash — every movement / feel number in one place.
 *
 * Units: metres, seconds, m/s, m/s². The engine is a fixed-step kinematic
 * controller (see player.js); nothing here depends on frame rate.
 *
 * Jump maths (full hold, flat ground):
 *   apex height  h = JUMP_VEL² / (2·GRAVITY)            ≈ 1.47 m
 *   time to apex t = JUMP_VEL / GRAVITY                  ≈ 0.32 s
 *   fall back    t = √(2h / (GRAVITY·FALL_MULT))         ≈ 0.28 s
 *   → ~0.60 s airtime: ≈ 4.2 m at run speed, ≈ 6.0 m at sprint speed.
 * Level gaps are authored against these numbers (see data/kit.js GAP).
 */
export const MOVE = {
  /* collider (vertical cylinder) */
  RADIUS: 0.34,
  HEIGHT: 1.78,
  SLIDE_HEIGHT: 0.92,
  STEP_UP: 0.32, // curbs / roof lips are walked over without a jump

  /* ground speeds */
  WALK_SPEED: 3.0, // small stick deflection
  RUN_SPEED: 7.2,
  SPRINT_SPEED: 10.0,
  CROUCH_SPEED: 2.6,
  GROUND_ACCEL: 46,
  SPRINT_ACCEL: 26, // run → sprint ramps a little slower so sprint has "weight"
  GROUND_DECEL: 42,
  TURN_DECEL: 70, // braking component when reversing direction
  ROT_SPEED: 15, // character yaw toward travel direction (rad/s, exp. damped)

  /* air */
  AIR_ACCEL: 15,
  AIR_MAX_GAIN: 4.2, // air control can't push horizontal speed above max(entry speed, this)
  AIR_DRAG: 0.15, // per-second fraction of horizontal speed lost when no input
  GRAVITY: 27.5,
  FALL_MULT: 1.32, // heavier on the way down = not floaty
  JUMP_CUT_MULT: 1.6, // released early while rising → extra gravity until apex (variable jump)
  MAX_FALL: 38,
  JUMP_VEL: 9.0,
  JUMP_SPRINT_BONUS: 0.25, // m/s of extra lift when jumping at full sprint
  COYOTE: 0.12,
  JUMP_BUFFER: 0.15,

  /* landing */
  HARD_LAND_VEL: 15.5, // impact speed (m/s down) that counts as a hard landing
  HARD_LAND_TIME: 0.16, // brief recovery, controls stay live
  HARD_LAND_SPEED_MULT: 0.62,
  SOFT_LAND_TIME: 0.08,

  /* sprint */
  SPRINT_MIN_INPUT: 0.55,

  /* dash */
  DASH_SPEED: 18.5,
  DASH_TIME: 0.19,
  DASH_EXIT_SPEED: 11.2, // horizontal speed kept after the burst
  DASH_GROUND_COOLDOWN: 0.55,
  DASH_LIFT: 1.2, // tiny upward kick on an air dash so it reads as "pushing on"

  /* slide */
  SLIDE_MIN_SPEED: 4.2,
  SLIDE_BOOST: 1.6,
  SLIDE_MAX_SPEED: 12.5,
  SLIDE_FRICTION: 5.2,
  SLIDE_MIN_TIME: 0.42,
  SLIDE_MAX_TIME: 1.05,
  SLIDE_END_SPEED: 3.2,
  SLIDE_STEER: 2.2, // rad/s of steering while sliding

  /* vault */
  VAULT_MIN_SPEED: 3.4,
  VAULT_LOW_MAX: 0.95, // obstacle top above feet
  VAULT_HIGH_MAX: 1.32,
  VAULT_MIN_H: 0.42, // below this it's a step / lip, just run over or hop
  VAULT_MAX_DEPTH: 1.7,
  VAULT_LOW_TIME: 0.34,
  VAULT_HIGH_TIME: 0.46,
  VAULT_REACH: 0.75, // how close (front face to collider surface) the vault triggers

  /* wall run */
  WALLRUN_MIN_SPEED: 5.0,
  WALLRUN_TIME: 1.15,
  WALLRUN_GRAVITY: 6.5,
  WALLRUN_ENTRY_VY_MIN: -7.5, // falling faster than this → too late to catch the wall
  WALLRUN_LIFT: 2.2, // small upward bias at entry
  WALLRUN_SPEED: 9.6,
  WALLRUN_REACH: 0.5, // wall within this of the collider surface
  WALLRUN_MAX_PER_AIR: 3,
  WALLRUN_MAX_ANGLE: 0.8, // rad between travel direction and wall tangent (≈46°)
  WALLJUMP_OUT: 6.4,
  WALLJUMP_UP: 8.4,
  WALLJUMP_FORWARD: 8.2,
  WALLJUMP_LOCK: 0.22, // air control reduced right after a wall jump

  /* ledge */
  LEDGE_MIN: 0.95, // ledge top above feet
  LEDGE_MAX: 2.15,
  LEDGE_REACH: 0.42,
  LEDGE_HANG_TIME: 0.12,
  LEDGE_CLIMB_TIME: 0.38,

  /* hazards */
  KNOCKBACK: 7.5,
  STUMBLE_TIME: 0.38,

  /* respawn */
  FALL_FADE_TIME: 0.45,
  RESPAWN_TIME: 0.38,
  RESPAWN_PENALTY: 3,

  /* simulation */
  STEP: 1 / 120,
  MAX_FRAME_DT: 0.05,
  MAX_SUBSTEP_MOVE: 0.14, // never move more than this per collision pass → no tunnelling
};

/** Parkour Assist (Settings) — a little more forgiveness, never automation. */
export const ASSIST = {
  COYOTE: 0.19,
  JUMP_BUFFER: 0.2,
  LEDGE_MAX: 2.4,
  LEDGE_REACH: 0.62,
  VAULT_MIN_SPEED: 2.4,
  VAULT_REACH: 0.95,
};

export function tuning(assist) {
  return assist ? { ...MOVE, ...ASSIST } : MOVE;
}

/** Flow (combo) — purely a bonus layer. */
export const FLOW = {
  WINDOW: 1.7, // seconds between parkour actions to keep the chain
  LABELS: [
    [9, "PERFECT FLOW"],
    [6, "SMOOTH"],
    [4, "GREAT"],
    [2, "GOOD"],
  ],
};

export const STATES = {
  GROUND: "ground", // idle / walk / run / sprint chosen by speed
  AIR: "air", // jump ascend / fall chosen by vy + how we left the ground
  SLIDE: "slide",
  CROUCH: "crouch", // slide ended under a low ceiling
  VAULT: "vault",
  WALLRUN: "wallrun",
  DASH: "dash",
  LEDGE: "ledge", // hang → climb
  STUMBLE: "stumble",
  FALLING_OUT: "fallout", // below the route, fading out
  RESPAWN: "respawn",
  FINISHED: "finished",
};
