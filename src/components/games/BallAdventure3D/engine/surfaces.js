/**
 * Ball Adventure 3D — surface material behaviour.
 *
 * The ball controller reads the surface of whatever it's standing on (via a
 * ground raycast hitting a collider tagged with one of these ids) and uses
 * these tuning numbers on top of Rapier's collision, rather than relying on
 * physics-engine friction alone — that's what lets ICE/SAND/MUD/BOOST/BOUNCE
 * each feel distinct while collision stays reliable.
 *
 *  - accel:      how fast the ball reaches its target speed (per second)
 *  - decel:      how fast it sheds speed once input stops (per second)
 *  - maxSpeed:   multiplier on the ball's base max speed
 *  - boost:      one-shot forward impulse magnitude added on contact (BOOST)
 *  - bounce:     one-shot upward impulse magnitude added on contact (BOUNCE)
 *  - conveyorSpeed: continuous push magnitude applied every frame while
 *                 standing on a conveyor-tagged platform (direction comes
 *                 from that platform's own `conveyorDir` data, not here) —
 *                 a static belt, never a moving platform.
 */
export const SURFACES = {
  normal: { accel: 14, decel: 10, maxSpeed: 1 },
  ice: { accel: 5, decel: 1.4, maxSpeed: 1.05 },
  sand: { accel: 7, decel: 12, maxSpeed: 0.55 },
  mud: { accel: 4.5, decel: 16, maxSpeed: 0.4 },
  metal: { accel: 14, decel: 10, maxSpeed: 1 },
  boost: { accel: 14, decel: 10, maxSpeed: 1, boost: 9 },
  bounce: { accel: 14, decel: 10, maxSpeed: 1, bounce: 11 },
  conveyor: { accel: 14, decel: 10, maxSpeed: 1, conveyorSpeed: 3.2 },
};

export function surfaceFor(id) {
  return SURFACES[id] || SURFACES.normal;
}
