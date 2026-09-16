/**
 * Farm Life — shared tunables.
 *
 * One place for world scale, movement speed, tool ranges and the game-time
 * rate so every system (player, farmGrid, chickens, clock) agrees on units.
 * 1 world unit = 1 meter = 1 soil tile.
 */

export const SAVE_VERSION = 1;

// --- Player -----------------------------------------------------------
export const PLAYER_RADIUS = 0.32;
export const WALK_SPEED = 3.6;
export const SPRINT_MULT = 1.7;
export const GROUND_ACCEL = 22;
export const INTERACT_RANGE = 1.65;
export const TOOL_USE_SECONDS = 0.5; // swing/use animation lock

// --- Camera (top-down 2D) ------------------------------------------------
// Pixels per world unit. The camera always centers on the player and never
// rotates — a fixed bird's-eye view, per the spec's "full 2D" direction.
export const PIXELS_PER_UNIT_MIN = 28;
export const PIXELS_PER_UNIT_MAX = 64;
export const PIXELS_PER_UNIT_DEFAULT = 44;

// --- Game clock -----------------------------------------------------------
// A full in-game day advances this many game-minutes per real second while
// unpaused. Tuned short (a few real minutes per day) so crop/animal
// progression is satisfying within a single browser session — the spec is
// explicit that growth must not require real-world hours. Day/night visuals
// land in a later phase; this clock already ticks so that later phase only
// has to listen to it, not invent a second time source.
export const GAME_MINUTES_PER_REAL_SECOND = 2.4; // 1 in-game day (1440 min) ≈ 10 real minutes
export const MINUTES_PER_DAY = 1440;
export const START_MINUTE_OF_DAY = 6 * 60; // 06:00
export const DAYS_PER_SEASON = 7;
export const SEASONS = ["Spring", "Summer", "Autumn", "Winter"];

// --- Inventory ------------------------------------------------------------
export const HOTBAR_SIZE = 9;
export const BACKPACK_SIZE = 27;
export const DEFAULT_STACK_SIZE = 99;

// --- Watering can ----------------------------------------------------------
export const WATERING_CAN_BASE_CAPACITY = 8;

// --- Economy ----------------------------------------------------------------
export const STARTING_MONEY = 120;

// --- Autosave ----------------------------------------------------------------
export const AUTOSAVE_INTERVAL_SEC = 20;
