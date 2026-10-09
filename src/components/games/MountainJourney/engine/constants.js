/**
 * Mountain Journey — shared engine constants.
 *
 * STATE is the authoritative game state (engine/game.js). PAUSED and MENU
 * live outside the engine (the React shell simply stops stepping it), so the
 * engine only ever sees the states it can act on.
 */

export const STATE = Object.freeze({
  PLAYING: "PLAYING",
  CLIMBING: "CLIMBING",
  FALLING: "FALLING",
  RESPAWNING: "RESPAWNING",
  VIEWPOINT: "VIEWPOINT",
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
});

/** Fixed simulation step. */
export const STEP = 1 / 120;

export const PHYS = Object.freeze({
  radius: 0.34, // explorer collision radius
  height: 1.72, // explorer standing height
  stepUp: 0.45, // tallest rise walked onto without a jump
  snapDown: 0.42, // stays glued to ground walking down this much per step
  walk: 4.3,
  run: 7.0,
  wadeMul: 0.72,
  accel: 32,
  decel: 28,
  airAccel: 13,
  iceAccel: 7,
  iceDecel: 2.6,
  gravity: 24,
  jumpV: 8.4,
  maxFall: 30,
  coyote: 0.13,
  jumpBuffer: 0.15,
  turnRate: 13,
  maxSlope: 1.05, // gradient (rise/run) beyond which ground is a wall
  slide: 5.5, // downhill slide speed on too-steep ground
  fallLimit: 7.5, // metres below the last safe ground → respawn
  drownDepth: 0.85, // water deeper than this at the feet → respawn
  wadeDepth: 0.12,
});

export const CLIMB = Object.freeze({
  ledgeTime: 1.15,
  ladderSpeed: 2.3,
  mountTime: 0.6,
  reach: 0.95, // how close to a face (m) a climb can start
});

export const RESPAWN = Object.freeze({
  fallTime: 0.55,
  fadeTime: 0.75,
});

export const VIEW_TIME = 5.2;
