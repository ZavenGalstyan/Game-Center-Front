/**
 * Color Platforms — gameplay constants and the ONE color rule.
 *
 * World units are pixels at scale 1, y grows downward. A platform's `y` is
 * its walkable top; the player's `y` is the bottom of its feet.
 *
 * Gameplay compares semantic color IDs only (never CSS strings) — the
 * renderer maps IDs to whatever shade the active cosmetic uses.
 */

export const BLUE = "BLUE";
export const RED = "RED";
export const YELLOW = "YELLOW";
export const NEUTRAL = "NEUTRAL";

/** Player colors, in key order (1, 2, 3). */
export const PLAYER_COLORS = [BLUE, RED, YELLOW];
export const PLATFORM_COLORS = [BLUE, RED, YELLOW, NEUTRAL];
export const PLATFORM_TYPES = ["normal", "bounce"];

/**
 * The game's single rule: Neutral holds everyone, a colored platform holds
 * only the matching player color. Every support / landing check calls this.
 */
export function canStandOn(plat, playerColor) {
  return plat.color === NEUTRAL || plat.color === playerColor;
}

export const PHYS = {
  DT: 1 / 120, // fixed simulation step
  MAX_FRAME: 0.05, // real frame delta clamp (tab restore, debugger, lag spike)
  MAX_STEPS: 6,

  GRAVITY: 2600,
  FALL_MULT: 1.25, // a little heavier on the way down — no floaty arcs
  CUT_MULT: 2.0, // rising with jump released → shorter hop (variable jump)
  MAX_FALL: 950,

  RUN: 300,
  ACCEL: 3200,
  DECEL: 3800,
  TURN: 5200,
  AIR_ACCEL: 2000,
  AIR_DECEL: 700,

  JUMP_V: 880, // ≈150 px full jump, ≈75 px tap
  BOUNCE_V: 1300, // ≈ 300 px bounce

  COYOTE: 0.11,
  BUFFER: 0.13,

  W: 28, // body width (render + hazard box)
  H: 30,
  FOOT: 10, // half-width of the support box — 4 px of body must be over the edge

  RESPAWN_OUT: 0.36, // fade out, then teleport
  RESPAWN_IN: 0.3, // fade in (input already live)
  FINISH_DELAY: 1.1, // celebration before the results panel

  PLAT_H: 22,
  STAR_R: 16,
};
