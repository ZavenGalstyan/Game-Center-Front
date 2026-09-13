/**
 * Stonewild — shared tunables.
 *
 * Chunk size follows the spec's 16x16 horizontal footprint. Height is capped
 * well below a full "infinite" voxel game (64) — plenty of room for surface
 * terrain, shallow caves and mountains later, without every chunk mesh
 * iterating a needlessly tall column.
 */

export const CHUNK_SIZE_X = 16;
export const CHUNK_SIZE_Z = 16;
export const CHUNK_HEIGHT = 64;

/** y=0 is the world floor. Terrain generation keeps columns within this. */
export const MIN_HEIGHT = 3;
export const MAX_HEIGHT = CHUNK_HEIGHT - 8;

/** Render-distance presets (chunk radius around the player), Settings screen. */
export const RENDER_DISTANCE = {
  low: 3,
  medium: 4,
  high: 6,
};
export const UNLOAD_MARGIN = 1; // hysteresis so edge chunks don't thrash

/** How many chunk meshes to (re)build per animation frame — keeps movement smooth. */
export const CHUNK_BUILDS_PER_FRAME = 1;

/** Player body (spec: height 1.7-1.9, width ~0.6). */
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_RADIUS = 0.3;

/** Movement feel. */
export const WALK_SPEED = 4.3; // blocks/sec
export const SPRINT_MULT = 1.6;
export const JUMP_SPEED = 8.0;
export const GRAVITY = -26;
export const MAX_FALL_SPEED = -50;
export const AIR_CONTROL = 0.6; // horizontal accel multiplier while airborne
export const GROUND_ACCEL = 45; // how fast we reach target speed on ground
export const FALL_DAMAGE_MIN_BLOCKS = 4; // fall distance before it starts hurting

/** Mouse look. */
export const DEFAULT_SENSITIVITY = 0.0022;
export const PITCH_LIMIT = Math.PI / 2 - 0.01;

/** Physics step is fixed and clamped so a tab-hidden lag spike never launches
 *  the player through terrain (anti-bug requirement: no giant physics jumps). */
export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.1; // clamp a single rAF delta to at most this
export const MAX_SUBSTEPS = 6;

/** Interaction: targeting, breaking, placing. */
export const REACH_DISTANCE = 5;
export const HAND_BREAK_MULT = 1; // hand times are authored directly in blocks.js

/** Inventory / hotbar. */
export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 27;
export const STACK_SIZE_BLOCK = 64;
export const STACK_SIZE_FOOD = 32;
export const STACK_SIZE_TOOL = 1;

/** Tool tiers, weakest to strongest — indexes double as a speed/damage rank. */
export const TOOL_TIERS = ["wood", "stone", "iron", "crystal"];

/** Dropped world items. */
export const DROP_PICKUP_RADIUS = 1.4; // collected once this close
export const DROP_MAGNET_RADIUS = 2.6; // starts drifting toward the player this close
export const DROP_MAGNET_SPEED = 5;
export const DROP_GRAVITY = -20;
export const DROP_DESPAWN_SEC = 180; // ground clutter doesn't accumulate forever

/** Survival stats. */
export const MAX_HEALTH = 100;
export const MAX_HUNGER = 100;
export const HUNGER_DRAIN_IDLE = 100 / (20 * 60); // fully drains over ~20 real minutes of just standing
export const HUNGER_DRAIN_SPRINT_MULT = 3;
export const HUNGER_DRAIN_MINING_MULT = 1.6;
export const STARVATION_DAMAGE_PER_SEC = 1.5; // applied only while hunger is at 0
export const HEALTH_REGEN_PER_SEC = 1.2; // only above the "well fed" hunger threshold
export const HUNGER_WELL_FED = 70;
export const HUNGER_LOW = 30; // below this, sprinting is disabled

/** Autosave. */
export const AUTOSAVE_INTERVAL_SEC = 20;

/** Fall damage: free above the threshold, then scales per extra block. */
export const FALL_DAMAGE_PER_BLOCK = 8;

/** How often the survival tick (hunger drain, regen, starvation) runs —
 *  batched instead of every frame so the HUD isn't re-rendering at 60fps. */
export const SURVIVAL_TICK_INTERVAL = 0.25;
