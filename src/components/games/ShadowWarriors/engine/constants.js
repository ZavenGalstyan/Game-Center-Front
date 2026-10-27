/** Shadow Warriors — simulation constants. World units: x right, y up,
 *  ground at y = 0. The sim runs at a fixed 60 Hz; all frame data is in
 *  60 Hz frames. */
export const FPS = 60;
export const DT = 1 / FPS;

export const ARENA_W = 1000; // wall to wall
export const WALL = ARENA_W / 2 - 30; // fighters' x is clamped to ±WALL
export const GRAVITY = 2500;
export const JUMP_VY = 860;
export const JUMP_VX = 250;
export const WALK = 230;
export const WALK_BACK = 185;
export const DASH_V = 660;
export const DASH_F = 13;
export const BACKDASH_V = 600;
export const BACKDASH_F = 12;
export const DOUBLE_TAP_F = 14;
export const PUSH_HALF = 33; // pushbox half-width
export const BUFFER_F = 9; // attack input buffer

export const STAMINA_REGEN = 26; // per second
export const STAMINA_DELAY = 30; // frames after spending before regen starts
export const PARRY_F = 6; // block pressed this many frames before a hit → parry
export const COMBO_CAP = 7; // the hit that reaches this count forces a knockdown

export const ROUND_TIME = 60;
export const BOSS_TIME = 75;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
