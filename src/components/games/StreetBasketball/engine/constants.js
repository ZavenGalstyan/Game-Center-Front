/**
 * Street Basketball — world constants. Metres, seconds, Y up.
 *
 * The rim centre sits at (0, RIM_Y, 0). The court extends toward +Z (the top
 * of the key); the backboard is behind the rim at negative Z; the baseline is
 * further behind. Every system (physics, AI, renderer) reads these, so the
 * visible hoop and the collision hoop can never drift apart.
 */
export const G = 9.81;

/* ---------------------------------------------------------------- hoop */
export const RIM_Y = 3.05;
export const RIM_R = 0.2286 + 0.009; // centre of the rim tube (inner radius 0.2286)
export const RIM_TUBE = 0.009; // rim steel radius
export const RIM_INNER = RIM_R - RIM_TUBE;
export const BOARD_Z = -0.381 - 0.006; // front face of the backboard
export const BOARD_THICK = 0.05;
export const BOARD_W = 1.8;
export const BOARD_BOTTOM = 2.9;
export const BOARD_TOP = 3.95;
export const NET_DEPTH = 0.42;
export const NET_BOTTOM_R = 0.145;
/** Support pole behind the baseline (players and ball collide with it). */
export const POLE_Z = -1.95;
export const POLE_R = 0.11;

/* --------------------------------------------------------------- court */
export const BASELINE_Z = -1.55;
export const COURT_HALF_W = 7.2;
export const COURT_FAR_Z = 11.4; // "half-court" line
export const ARC_R = 6.0; // street scoring arc (outside = 2 points)
export const KEY_HALF_W = 2.45;
export const KEY_LEN = 5.8; // from baseline
export const CHECK_SPOT = { x: 0, z: 8.4 };

/* ---------------------------------------------------------------- ball */
export const BALL_R = 0.12;
export const E_FLOOR = 0.8;
export const E_RIM = 0.5;
export const E_BOARD = 0.62;
export const E_POLE = 0.45;
/** Tangential velocity kept after a contact (1 = frictionless). */
export const FRIC_FLOOR = 0.86;
export const FRIC_RIM = 0.9;
export const FRIC_BOARD = 0.82;

/* ------------------------------------------------------------- players */
export const BODY_R = 0.34;
export const PHYS_DT = 1 / 240; // fixed step for ball + players
export const MAX_FRAME_DT = 0.1; // larger frame gaps are dropped, never replayed

export function arcDistance(x, z) {
  return Math.hypot(x, z);
}

/** 2 points from outside the arc, 1 inside (street scoring). */
export function pointsFrom(x, z) {
  return arcDistance(x, z) > ARC_R ? 2 : 1;
}
