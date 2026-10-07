/**
 * Night Corridor — tuning constants shared by the engine, the renderer and
 * the Node test suite. Distances are metres, speeds metres/second.
 */

/** One map character = one CELL x CELL square of floor or wall. */
export const CELL = 2;
export const WALL_H = 3;

export const FIXED_DT = 1 / 60;

// ---------------------------------------------------------------- player
export const PLAYER_R = 0.28;
export const EYE_H = 1.62;
export const CROUCH_EYE_H = 1.02;
export const WALK_SPEED = 2.3;
export const SPRINT_SPEED = 4.6;
export const CROUCH_SPEED = 1.25;
export const ACCEL = 13;
export const DECEL = 11;

/** Full stamina lasts ~6.5 s of sprinting; refills in ~4.5 s after a short delay. */
export const STAMINA_DRAIN = 1 / 6.5;
export const STAMINA_REGEN = 1 / 4.5;
export const STAMINA_DELAY = 0.6;
/** Once fully drained, sprint is locked until stamina is back to this. */
export const STAMINA_RESTART = 0.3;

/** Flashlight battery: ~5 min of on-time, recovers in ~1 min when switched off. Never fully dies. */
export const BATTERY_DRAIN = 1 / 300;
export const BATTERY_RECOVER = 1 / 60;
export const BATTERY_FLOOR = 0.14;

export const REACH = 2.4;

// -------------------------------------------------------------- creature
export const CREATURE_R = 0.34;
export const CREATURE_HEIGHT = 2.45;
export const CREATURE_WALK = 1.15;
export const CREATURE_INVESTIGATE = 1.9;
export const CREATURE_CHASE = 3.9;
export const CATCH_DIST = 0.95;
/** How long a closed door holds the creature before it bursts through. */
export const DOOR_BANG_TIME = 2.6;
/** Spawns closer than this to the player are rejected. */
export const MIN_SPAWN_DIST = 7;

// ------------------------------------------------------------------ doors
export const DOOR_JAMB = 0.5;
export const DOOR_OPEN_SPEED = 2.4; // fraction per second (≈0.4 s)
export const DOOR_SLAM_SPEED = 7;
export const DOOR_COOLDOWN = 0.3;
