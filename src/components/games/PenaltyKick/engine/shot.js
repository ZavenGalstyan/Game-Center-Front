/**
 * Penalty Kick — shot model. Turns continuous input into a launch.
 *
 *   input  = { aimX, aimY }  a point on the goal plane (continuous; the mouth
 *                             is x ∈ [−3.66, 3.66], y ∈ [0, 2.44] — you can
 *                             aim outside it and miss)
 *            power ∈ [0,1]   → speed 15…33 m/s
 *            curve ∈ [−1,1]  → side-spin (+ bends to the shooter's right)
 *
 * The launch velocity is SOLVED by simulating the exact free-flight forces the
 * real ball will feel (gravity, drag, capped Magnus), so a clean strike arrives
 * where it was aimed and curve changes the PATH, not the destination.
 *
 * No random numbers. Imprecision is deterministic and explained:
 *   • OVERPOWER (power > PK.OVERPOWER): the strike gets under the ball → it
 *     rises (up to +0.9 m at full power) and drifts with the curve. That is how
 *     a smashed shot sails over the bar.
 *   • AIM EDGE: aiming outside the frame simply misses.
 */
import { PK, clamp, lerp } from "./constants.js";
import { makeBall, stepBall, v3 } from "./physics.js";

export const SPOT = [0, PK.BALL_R, PK.SPOT_Z];

export function shotSpeed(power) {
  return lerp(PK.SPEED_MIN, PK.SPEED_MAX, clamp(power, 0, 1));
}

/** Where the strike REALLY goes (deterministic overpower penalty). */
export function effectiveTarget(input) {
  const over = Math.max(0, (input.power - PK.OVERPOWER) / (1 - PK.OVERPOWER));
  return {
    x: input.aimX + over * 0.35 * (input.curve || 0),
    y: Math.max(PK.BALL_R, input.aimY + over * 0.9),
    over,
  };
}

/** Free flight until the ball reaches the goal plane; returns the crossing point. */
function flyToPlane(v0, w) {
  const b = makeBall(SPOT);
  b.v = [...v0];
  b.w = [...w];
  b.moving = true;
  for (let i = 0; i < 2400; i++) {
    const p0 = b.p;
    stepBall(b, [], { free: true });
    if (b.p[2] <= 0) {
      const f = p0[2] / (p0[2] - b.p[2]);
      return [p0[0] + (b.p[0] - p0[0]) * f, p0[1] + (b.p[1] - p0[1]) * f];
    }
    if (b.p[1] < -2) return [b.p[0], -5];
  }
  return [0, -5];
}

/**
 * Solve the launch for an input. Returns
 * { v0, w, speed, target:{x,y}, over }  — pure & deterministic.
 */
export function solveShot(input) {
  const speed = shotSpeed(input.power);
  const t = effectiveTarget(input);
  // side-spin about +y; with the ball travelling −z, −y spin bends toward +x
  const spin = -(input.curve || 0) * PK.SPIN_MAX;
  // driven shots carry some topspin (visual roll; kept small so it barely dips)
  const w = [-speed * 0.9, spin, 0];
  // initial guess: straight line to the target, plus a gravity allowance
  let aim = [t.x, t.y + 0.5 * PK.G * (PK.SPOT_Z / speed) ** 2 * 1.05];
  let best = null;
  for (let it = 0; it < 12; it++) {
    const dir = v3.norm([aim[0] - SPOT[0], aim[1] - SPOT[1], -SPOT[2]]);
    const v0 = v3.mul(dir, speed);
    const [hx, hy] = flyToPlane(v0, w);
    const ex = t.x - hx;
    const ey = t.y - hy;
    best = { v0, err: Math.hypot(ex, ey) };
    if (best.err < 0.004) break;
    aim = [aim[0] + ex, aim[1] + ey];
  }
  return { v0: best.v0, w, speed, target: t, over: t.over, err: best.err };
}
