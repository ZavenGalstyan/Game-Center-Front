/**
 * Shared tuning for the Iron Fist combat simulation (pure data, no Three.js).
 * Distances are metres along the fighting plane (world X), time is seconds.
 */
export const SIM_DT = 1 / 60;
export const ROUND_TIME = 60;
export const WINS_NEEDED = 2;
export const MAX_ROUNDS = 5; // draws (double KO / equal time-out) don't count, so cap the match
export const ARENA_HALF = 4.3; // fighters' centres are clamped to ±ARENA_HALF
export const START_GAP = 2.4; // centre distance at the start of every round
export const PUSH_DIST = 0.62; // bodies never overlap closer than this
export const BODY_TOP = 1.78; // standing hurtbox height above the fighter's feet
export const GRAVITY = 16;
export const JUMP_V = 5.6;
export const JUMP_VX = 2.5;
export const WALK_FWD = 2.25;
export const WALK_BACK = 1.75;
export const TURN_DELAY = 0.12; // a fighter needs this long to turn round after a cross-up
export const BUFFER_T = 0.18; // pressed buttons are remembered this long
export const DODGE = { total: 0.42, invulFrom: 0.04, invulTo: 0.3, cooldown: 0.85 };
export const KNOCKDOWN = { fall: 0.55, lie: 0.55, getup: 0.6 };
export const INTRO_T = 2.0; // "ROUND n" … "FIGHT!"
export const ROUND_END_T = 3.2; // KO slow motion + result banner
export const HITSTOP = { light: 0.05, heavy: 0.09, special: 0.12 };
