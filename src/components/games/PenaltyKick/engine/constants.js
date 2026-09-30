/**
 * Penalty Kick — physical constants (metres, seconds, radians).
 *
 * World frame (shared by sim, AI, tests and the 3D view):
 *   origin = centre of the goal line on the grass
 *   +x     = to the RIGHT as seen by the penalty taker (facing the goal)
 *   +y     = up
 *   +z     = from the goal toward the penalty spot (spot at z = 11)
 * The goal mouth is the plane z = 0; the net is behind it (z < 0).
 * A goal needs the WHOLE ball past the plane: centre z < −BALL_R.
 */
export const PK = {
  DT: 1 / 240, // fixed physics step
  SUB: 4, // collision substeps per step (≤ 3.5 cm of travel each at 33 m/s)
  MAX_FRAME: 0.1,
  MAX_STEPS: 48,

  G: 9.81,
  BALL_R: 0.11,
  DRAG: 0.0085, // quadratic air drag coefficient (per metre)
  MAGNUS: 0.012, // curve acceleration per (rad/s · m/s), capped below
  MAX_CURVE_ACC: 7.5, // m/s² — no boomerangs, no 90° turns

  SPOT_Z: 11,
  GOAL_HALF_W: 3.66, // inner edge of each post
  GOAL_H: 2.44, // underside of the crossbar
  POST_R: 0.06, // posts & bar are 12 cm
  NET_DEPTH: 2.0,
  NET_TOP_BACK_H: 1.9, // the roof net slopes down toward the back

  E_POST: 0.62, // restitution off the woodwork
  E_GROUND: 0.55,
  E_BODY: 0.28,
  E_HAND: 0.4,
  E_NET: 0.04, // a net swallows the ball (plus drag inside the goal, see physics.js)

  SPEED_MIN: 15, // m/s at 0 power
  SPEED_MAX: 33, // m/s at full power
  OVERPOWER: 0.86, // above this, the strike gets riskier (see shot.js)
  SPIN_MAX: 42, // rad/s side-spin at full curve

  RESOLVE_TIMEOUT: 3.2, // s after contact to settle a shot that never reached the line
};

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, k) => a + (b - a) * k;

/** Post / crossbar centre lines (capsules of radius POST_R). */
export const WOODWORK = (() => {
  const x = PK.GOAL_HALF_W + PK.POST_R;
  const y = PK.GOAL_H + PK.POST_R;
  const z = -PK.POST_R; // the front of the woodwork sits on the goal line
  return [
    { id: "leftPost", kind: "post", a: [-x, 0, z], b: [-x, y, z] },
    { id: "rightPost", kind: "post", a: [x, 0, z], b: [x, y, z] },
    { id: "crossbar", kind: "bar", a: [-x, y, z], b: [x, y, z] },
  ];
})();
