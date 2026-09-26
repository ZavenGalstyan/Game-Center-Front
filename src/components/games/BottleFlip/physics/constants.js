/**
 * Bottle Flip — physics constants.
 *
 * World units are roughly centimetres, y points UP, the floor is y = 0.
 * Every bottle skin shares these numbers: skins are paint only.
 */

export const PHYS = {
  dt: 1 / 300, // fixed sub-step (s) — independent of monitor refresh
  maxFrame: 1 / 20, // largest real frame fed to the accumulator (tab switch guard)
  g: 1500, // gravity (u/s²) — a touch stronger than real for snappy arcs

  // throw
  vMin: 175, // speed at 0% power (small hop)
  vMax: 700, // speed at 100% power (clamped)
  minAngle: (14 * Math.PI) / 180, // launch never flatter than this
  spinK: 0.042, // angular speed (rad/s) per unit of launch speed above…
  spinMax: 14, // soft ceiling on spin (rad/s): long throws stay learnable
  spinFrom: 150, // …this speed, so gentle hops barely turn (reposition hops)

  // flight
  airAngDamp: 0.12, // gentle air drag on spin (1/s)
  liquidWindow: (55 * Math.PI) / 180, // how far from upright the water acts
  liquidDamp: 24, // spin damping near upright while falling (1/s)
  liquidPull: 70, // gentle righting torque near upright while falling

  // contact
  restThreshold: 70, // below this approach speed there is no bounce
  iterations: 10,
  slop: 0.03,
  gripDamp: 28, // extra rocking damping while bottom-down inside tolerance
  catchKeep: 0.22, // share of spin kept each time the base slaps down upright
  slapSpeed: 25, // approach speed that counts as a slap
};

export const BOTTLE = {
  w: 8,
  h: 22,
  com: 8, // centre of mass above the base (liquid sits low)
  invMass: 1,
  invI: 1 / 50,
};

const B = -BOTTLE.com;
const T = BOTTLE.h - BOTTLE.com;

/** Collision probe points in body space (origin = centre of mass). */
export const BOTTLE_POINTS = [
  [-4, B],
  [4, B],
  [4, B + 11.5],
  [2.3, B + 17],
  [2.3, T],
  [-2.3, T],
  [-2.3, B + 17],
  [-4, B + 11.5],
];
/** Convex hull (CCW) used for furniture-corner-inside-bottle tests. */
export const BOTTLE_HULL = [
  [-4, B],
  [4, B],
  [4, B + 11.5],
  [2.3, T],
  [-2.3, T],
  [-4, B + 11.5],
];
export const BOTTOM_Y = B;
export const TOP_Y = T;

/** Surface materials: restitution / friction + which impact sound to use. */
export const SURFACES = {
  wood: { e: 0.12, mu: 0.85, sound: "wood" },
  soft: { e: 0.06, mu: 1.0, sound: "soft", damp: 10 },
  metal: { e: 0.18, mu: 0.6, sound: "metal" },
  card: { e: 0.1, mu: 0.9, sound: "card" },
  stone: { e: 0.14, mu: 0.8, sound: "wood" },
  slick: { e: 0.18, mu: 0.14, sound: "metal" },
  neon: { e: 0.2, mu: 0.8, sound: "metal" },
  floor: { e: 0.2, mu: 0.8, sound: "wood" },
};

export const TAU = Math.PI * 2;
/** Wrap an angle to (-π, π]. */
export function wrap(a) {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}
