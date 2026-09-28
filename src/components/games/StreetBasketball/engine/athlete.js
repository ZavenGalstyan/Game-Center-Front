/**
 * Street Basketball — athletes: body dimensions (shared with the renderer's
 * rig so gameplay hand points and drawn hands agree), local→world helpers and
 * the locomotion integrator (acceleration, braking, turning, sprint, stamina).
 */
import { BODY_R, COURT_HALF_W, BASELINE_Z, COURT_FAR_Z, POLE_Z, POLE_R } from "./constants.js";

/** Body dimensions (metres). The renderer builds the character from these. */
export const BODY = {
  height: 1.93,
  hipY: 0.99,
  shoulderY: 1.5,
  shoulderHalf: 0.2,
  upperArm: 0.31,
  foreArm: 0.29,
  thigh: 0.47,
  shin: 0.46,
  footY: 0.07,
  hipHalf: 0.1,
};
export const ARM_REACH = BODY.upperArm + BODY.foreArm + 0.06;

export const ATHLETE_G = 9.81 * 1.05;

export function createAthlete(id, ratings, look) {
  return {
    id,
    r: { shooting: 5, finishing: 5, speed: 5, defense: 5, stamina: 5, steal: 5, block: 5, rebound: 5, handle: 5, ...ratings },
    look,
    x: 0,
    z: 6,
    vx: 0,
    vz: 0,
    y: 0,
    vy: 0,
    air: false,
    facing: Math.PI,
    hand: "R",
    stamina: 1,
    act: null, // current action {kind, t, ...}
    cd: { cross: 0, steal: 0, jump: 0, pickup: 0, squeak: 0 },
    slow: 0, // seconds of reduced mobility (failed steal / crossed up / fumble)
    slowK: 1,
    sprinting: false,
    drib: null,
    hands: { L: null, R: null },
    stance: 0, // 0 upright … 1 low defensive stance (smoothed)
    anim: "IDLE",
    prevX: 0,
    prevZ: 0,
    prevY: 0,
    prevFacing: Math.PI,
    lastMoveDir: { x: 0, z: -1 },
  };
}

export function fwd(a) {
  return { x: Math.sin(a.facing), z: Math.cos(a.facing) };
}

/** World point from athlete-local coords: side (+ = athlete's right), up (from floor), forward. */
export function local(a, side, up, fw, includeJump = true) {
  const fx = Math.sin(a.facing);
  const fz = Math.cos(a.facing);
  // right vector = (-fz, fx)
  return {
    x: a.x + fx * fw - fz * side,
    y: up + (includeJump ? a.y : 0),
    z: a.z + fz * fw + fx * side,
  };
}

export function handSign(h) {
  return h === "R" ? 1 : -1;
}

export function angleTo(a, x, z) {
  return Math.atan2(x - a.x, z - a.z);
}

export function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function turnToward(a, target, rate, dt) {
  const d = wrap(target - a.facing);
  const step = rate * dt;
  a.facing = wrap(a.facing + Math.max(-step, Math.min(step, d)));
}

export function maxSpeed(a, { sprint, withBall, defending, drive }) {
  let s = 4.15 + (a.r.speed - 5) * 0.11;
  if (sprint) s *= defending ? 1.22 : 1.38;
  else if (drive) s *= 1.12;
  if (withBall) s *= 0.94;
  if (a.slow > 0) s *= a.slowK;
  return s;
}

/**
 * Integrate horizontal movement toward the desired velocity. Acceleration is
 * higher when braking/turning than when speeding up in a straight line, so
 * cuts feel sharp but a sprinting player still carries momentum.
 */
export function integrateMove(a, dx, dz, mag, opts, dt) {
  if (a.air) {
    // no steering in the air; light drag
    const k = Math.exp(-0.4 * dt);
    a.vx *= k;
    a.vz *= k;
    return;
  }
  const top = maxSpeed(a, opts) * Math.min(1, mag);
  const tx = dx * top;
  const tz = dz * top;
  let ex = tx - a.vx;
  let ez = tz - a.vz;
  const el = Math.hypot(ex, ez);
  if (el < 1e-6) return;
  const sp = Math.hypot(a.vx, a.vz);
  const along = sp > 0.1 && mag > 0 ? (a.vx * dx + a.vz * dz) / sp : 1;
  const accel = mag < 0.05 ? 17 : along < 0.2 ? 21 : 13.5 + (a.r.speed - 5) * 0.4;
  const stp = Math.min(el, accel * dt);
  a.vx += (ex / el) * stp;
  a.vz += (ez / el) * stp;
}

/** Court bounds, the hoop pole, and nothing else (no fences inside the lines). */
export function clampToCourt(a) {
  const lim = COURT_HALF_W - 0.25;
  if (a.x < -lim) { a.x = -lim; if (a.vx < 0) a.vx = 0; }
  if (a.x > lim) { a.x = lim; if (a.vx > 0) a.vx = 0; }
  if (a.z < BASELINE_Z + 0.2) { a.z = BASELINE_Z + 0.2; if (a.vz < 0) a.vz = 0; }
  if (a.z > COURT_FAR_Z - 0.2) { a.z = COURT_FAR_Z - 0.2; if (a.vz > 0) a.vz = 0; }
  const dx = a.x;
  const dz = a.z - POLE_Z;
  const d = Math.hypot(dx, dz);
  const lim2 = POLE_R + BODY_R;
  if (d < lim2 && d > 1e-6) {
    a.x = (dx / d) * lim2;
    a.z = POLE_Z + (dz / d) * lim2;
  }
}

/** Robust circle separation between the two players. Returns overlap depth. */
export function separate(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const lim = BODY_R * 2;
  if (d >= lim) return 0;
  // one airborne well above the other (dunk over / block) still can't overlap bodies
  const ux = d > 1e-6 ? dx / d : 1;
  const uz = d > 1e-6 ? dz / d : 0;
  const pen = lim - d;
  // a controlled (dunking) athlete isn't pushed
  const wa = a.act && a.act.kind === "dunk" ? 0 : b.act && b.act.kind === "dunk" ? 1 : 0.5;
  a.x -= ux * pen * wa;
  a.z -= uz * pen * wa;
  b.x += ux * pen * (1 - wa);
  b.z += uz * pen * (1 - wa);
  // kill closing velocity
  const rv = (b.vx - a.vx) * ux + (b.vz - a.vz) * uz;
  if (rv < 0) {
    a.vx += ux * rv * 0.5;
    a.vz += uz * rv * 0.5;
    b.vx -= ux * rv * 0.5;
    b.vz -= uz * rv * 0.5;
  }
  return pen;
}
