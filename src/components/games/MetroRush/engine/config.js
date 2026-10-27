/**
 * Metro Rush — simulation constants. Units are metres and seconds; the
 * runner moves along +z (distance), lanes sit at x = -LW, 0, +LW.
 *
 * Every number the fairness validator relies on lives here so the physics
 * (run.js) and the validator (validator.js) can never drift apart.
 */
export const LANES = 3;
export const LW = 2.6; // lane width
export const laneX = (l) => (l - 1) * LW;

/* ------------------------------------------------------------ speed */
export const SPEED_START = 14;
export const SPEED_MAX = 31;
export const SPEED_TAU = 175; // seconds to ~63 % of the way to max
export const speedAt = (t) => SPEED_START + (SPEED_MAX - SPEED_START) * (1 - Math.exp(-t / SPEED_TAU));
/** 0 → 1 difficulty from distance */
export const difficultyAt = (dist) => Math.min(1, Math.max(0, dist / 3600));

export const BOOST_MUL = 1.75;

/* ------------------------------------------------------------ runner body */
export const P_HALF_W = 0.32;
export const P_HALF_L = 0.25;
export const P_STAND_H = 1.7;
export const P_SLIDE_H = 0.72;

/* ------------------------------------------------------------ actions */
export const JUMP_APEX = 1.85;
export const G_BASE = 40;
/** gravity grows with speed so jump distance stays playable at high speed */
export const gravityAt = (v) => G_BASE * Math.pow(Math.max(v, SPEED_START) / SPEED_START, 0.55);
export const jumpVel = (g) => Math.sqrt(2 * g * JUMP_APEX);
export const SLIDE_T = 0.62;
export const SLIDE_DROP_T = 0.06; // time for the body to lower into the slide
export const FAST_FALL_V = -30;
export const LANE_T = 0.13; // seconds per lane change
export const LAT_SPEED = LW / LANE_T;
export const INPUT_BUFFER_T = 0.18; // jump/slide pressed just before landing still fires
export const STEP_UP = 0.6; // ramp surface can be climbed this much per step

/* ------------------------------------------------------------ obstacles */
export const BARRIER_H = 1.0;
export const BARRIER_L = 0.35;
export const OVERHEAD_Y = 1.15; // underside of the overhead bar
export const OVERHEAD_TOP = 2.7;
export const OVERHEAD_L = 0.3;
export const OB_HALF_W = 1.15;
export const TRAIN_H = 3.0;
export const TRAIN_HALF_W = 1.12;
export const CAR_L = 10.5;
export const RAMP_L = 7.5;
export const MOVING_ACT = 175; // a moving train departs when the runner is this far from its front

/* ------------------------------------------------------------ world */
export const STEP = 1 / 120;
export const GEN_AHEAD = 300;
export const DESPAWN_BEHIND = 24;
export const COIN_R = 1.05;
export const MAGNET_RX = 7;
export const MAGNET_RZ = 16;

/* ------------------------------------------------------------ power-ups (seconds) */
export const POWER_T = { magnet: 12, mult: 15, shield: 10, board: 30, boost: 5.5 };
export const POWER_KINDS = ["magnet", "mult", "shield", "board", "boost"];
export const GRACE_T = 1.4; // invulnerability after a board break / boost / revive

/* ------------------------------------------------------------ fairness */
export const REACT_T = 0.22; // human reaction margin added to every lane change
export const RECOVER_T = 0.1; // run time required between two actions
export const CELL = 0.5;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
