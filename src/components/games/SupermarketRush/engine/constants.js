// Supermarket Rush — tunable constants shared across the engine.

export const PLAYER_RADIUS = 0.32;
export const PLAYER_HEIGHT = 1.75;
export const PLAYER_EYE_HEIGHT = 1.62;
export const WALK_SPEED = 2.6;
export const SPRINT_MULT = 1.55;
export const GROUND_ACCEL = 16;
export const PITCH_LIMIT = Math.PI / 2 - 0.05;

export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 0.1;
export const MAX_SUBSTEPS = 6;

export const INTERACT_REACH = 1.9;
export const RESTOCK_UNIT_SECONDS = 0.42; // one carton/can onto the shelf, before upgrades
export const SPILL_CLEAN_SECONDS = 1.6;
export const HELP_ANSWER_SECONDS = 0;

export const HEAD_BOB_AMPLITUDE = 0.028;
export const HEAD_BOB_SPEED = 9.5;

export const CUSTOMER_SPEED = 1.15;
export const CUSTOMER_SHOP_TIME = [1.4, 2.6]; // seconds spent "browsing" per stop, [min,max]
export const CUSTOMER_CHECKOUT_ITEM_SECONDS = 0.9;
export const CUSTOMER_BASE_PATIENCE = 55; // seconds before satisfaction starts dropping in queue

export const FAST_CHECKOUT_SECONDS = 3.2; // per-item scan time under which a customer counts as "fast"
