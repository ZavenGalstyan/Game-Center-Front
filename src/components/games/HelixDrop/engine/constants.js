/**
 * Helix Drop — gameplay constants. The ONE place feel is tuned; the sim, the
 * level validator, the endless generator and the 3D view all read these.
 *
 * World units: the tower's vertical axis is Y (up). Layer i sits at
 * y = -i * FLOOR_SPACING (the tower is descended). Angles are radians in the
 * tower's local frame, normalised to [0, 2π): angle = atan2(z, x).
 *
 * The ball never orbits: it sits at a fixed world angle BALL_ANGLE (straight
 * toward the camera) and radius BALL_ORBIT. The tower rotates under it.
 *
 * Derived feel (G = 30, BOUNCE = 9.64):
 *   bounce apex  ≈ 1.55 u above the platform  (ball top 2.23 u, the layer above
 *                  starts 2.48 u up — the ball can never touch it)
 *   bounce loop  ≈ 0.64 s
 *   one-floor drop ≈ 0.43 s from the apex
 */
export const PHYS = {
  DT: 1 / 120,
  MAX_FRAME: 0.1,
  MAX_STEPS: 16,

  G: 30,
  BOUNCE: 9.64,
  MAX_FALL: 17, // u/s terminal speed (≈ 0.14 u per step — far below a layer gap)
  SMASH_EXIT: 5, // downward speed kept after crashing through a layer

  BALL_R: 0.34,
  BALL_ORBIT: 2.05, // radius of the ball's fixed world position
  BALL_ANGLE: Math.PI / 2, // +Z: the side facing the camera

  COLUMN_R: 0.86,
  INNER_R: 0.98,
  OUTER_R: 3.1,
  PLATFORM_H: 0.32,
  FLOOR_SPACING: 2.8,

  ROT_MAX_SPEED: 16, // rad/s cap on tower rotation (no violent spinning)
  KEY_SPEED: 4.2, // rad/s while A/D or ←/→ is held
  SENS: { low: 0.0055, medium: 0.0085, high: 0.012 }, // rad per CSS px of drag

  SMASH_STREAK: 3, // floors passed without landing → SMASH
  EDGE: 0.35, // edge forgiveness as a fraction of the ball's angular radius
};

export const TAU = Math.PI * 2;

/** Ball angular radius as seen from the tower axis (≈ 9.5°). */
export const BALL_ANG = Math.asin(PHYS.BALL_R / PHYS.BALL_ORBIT);

/** Normalise any angle to [0, 2π). */
export function norm(a) {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

export const deg = (d) => (d * Math.PI) / 180;
export const layerY = (i) => -i * PHYS.FLOOR_SPACING;
