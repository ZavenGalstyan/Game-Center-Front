/**
 * Jump Ball — physics constants. The ONE place gameplay feel is tuned.
 *
 * World space is y-UP (height grows upward), 1 unit ≈ 1 CSS px at the
 * reference view height. Every level, the bot/validator, the endless
 * generator and the live game read these same numbers, so a change here is
 * immediately re-checked by `tools/validateLevels.mjs`.
 *
 * Derived feel (G = 2600, BOUNCE = 1150):
 *   apex height      = BOUNCE² / 2G   ≈ 254 u
 *   time to apex     = BOUNCE / G     ≈ 0.44 s
 *   flat bounce loop                   ≈ 0.89 s   (springy, not floaty)
 *   spring apex      = SPRING² / 2G   ≈ 523 u
 */
export const PHYS = {
  DT: 1 / 120, // fixed simulation step (s)
  MAX_FRAME: 0.1, // largest real frame delta the accumulator will honour (s)
  MAX_STEPS: 16, // hard cap per frame — never spiral after a stall

  G: 2600, // gravity (u/s²)
  BOUNCE: 1150, // take-off speed from a normal landing (u/s)
  SPRING: 1650, // take-off speed from a spring pad (u/s)
  MAX_FALL: 1900, // terminal fall speed (u/s)

  R: 26, // ball radius (u) — identical for every skin
  FOOT: 0.72, // landing footprint half-width, as a fraction of R

  ACCEL: 2500, // horizontal acceleration while holding a direction (u/s²)
  TURN: 2300, // extra braking while holding against current motion (u/s²)
  DRAG: 1900, // deceleration with no input (u/s²)
  MAX_VX: 430, // horizontal speed cap (u/s)

  ICE_DRAG: 240, // drag while the ice effect is active
  ICE_ACCEL: 0.55, // control multiplier while the ice effect is active
  ICE_TIME: 1.1, // seconds the ice effect lasts after an ice landing

  WIDTH: 600, // playfield width for handcrafted levels (hard walls at 0 / WIDTH)
  VIEW_H: 900, // minimum visible world height
  CAM_ANCHOR: 200, // last landed platform sits this far above the camera bottom
  CAM_TOP_PAD: 90, // keep the ball at least this far below the top of VIEW_H

  PLATFORM_H: 30, // visual/logical platform thickness (u)
  STAR_R: 20, // collectible star pickup radius (u), added to R
};

/** Perfect-landing half-window around a platform centre. */
export const perfectHalf = (w) => Math.max(10, Math.min(18, w * 0.1));
