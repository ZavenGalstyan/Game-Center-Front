/**
 * Shadow Runner — every physics number lives here. World units are "view
 * pixels" of a 540-unit-tall camera; y grows DOWN (canvas convention).
 *
 * Reference numbers (at RUN 380):
 *   full jump apex   = JUMP_V² / 2G           ≈ 131u  (~2.3 bodies)
 *   full jump range  = 2·JUMP_V/G · 380        ≈ 262u  (same height)
 *   tap jump apex    ≈ 60u
 *   mantle reach     = MANTLE_H above the feet (auto-climb a ledge face)
 */
export const DT = 1 / 120;
export const VIEW_H = 540;

export const PHYS = {
  G: 2200,
  MAX_FALL: 1150,

  RUN: 380, // default top speed (levels override per district)
  START_V: 190,
  ACCEL: 620, // ground acceleration toward top speed
  BRAKE_V: 80, // speed while holding "brake"
  BRAKE_ACCEL: 1400,
  AIR_BRAKE: 380, // gentle air braking (still auto-forward)

  JUMP_V: 760,
  JUMP_CUT: 420, // releasing jump early caps upward speed here
  AIR_JUMP_V: 640,
  COYOTE: 0.1,
  BUFFER: 0.12,

  W: 22,
  H: 56,
  SLIDE_H: 26,
  SLIDE_T: 0.55,
  SLIDE_MAX: 1.3, // holding down extends a slide up to this long
  SLIDE_MIN_V: 120,
  FAST_FALL: 720,

  STEP: 8, // ledges this low are walked up
  VAULT_H: 46, // grounded runner auto-vaults obstacles this low
  VAULT_T: 0.13,
  MANTLE_H: 92, // auto-climb a face whose top is this far above the feet
  MANTLE_T: 0.24,
  MANTLE_KEEP: 0.72, // fraction of speed kept after a climb

  STUN_T: 0.32, // bonk into a wall at speed
  BONK_V: 150,

  WALL_SLIDE: 170,
  WALL_COYOTE: 0.1,
  WJ_VX: 330,
  WJ_VY: 760,

  SPRING_V: 1080,

  COIN_R: 11,
  DEAD_T: 0.75,
};

/** Hunter (the pursuer): follows your exact path a fixed lead behind. */
export const CHASE = {
  LEAD: 260, // path-units of head start
  MAX_LEAD: 330, // a clean run can't build an infinite cushion
  START_DELAY: 0.9,
  RATIO: 0.9, // hunter speed as a fraction of the level's top speed
};
