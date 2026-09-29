/**
 * Street Basketball — free-ball physics. Pure functions over a plain ball
 * object; no Three.js, no DOM — so the exact same code runs in the game and in
 * the Node shot tests (tools/shotTest.mjs).
 *
 * Collision geometry is the real hoop, not a box:
 *   rim      — an exact sphere-vs-torus test (closest point on the rim circle)
 *   bracket  — the small plate joining rim to board
 *   board    — an oriented box (front face, edges and corners all collide)
 *   pole     — vertical cylinder behind the baseline
 *   floor    — plane y = 0 with restitution + rolling friction
 *   net      — a soft funnel that drags a ball passing through (no cloth sim)
 *
 * The step is fixed (PHYS_DT = 1/240 s): a ball at 9 m/s moves 3.75 cm per
 * step, well under the 12.9 cm ball+tube contact radius, so it can't tunnel
 * through the rim, and the same shot gives the same result at any frame rate.
 *
 * Basket detection lives here too: a basket is the ball CENTRE crossing the
 * rim plane downward while inside the rim — and not after having come up
 * through the hoop from below.
 */
import {
  G, RIM_Y, RIM_R, RIM_TUBE, RIM_INNER, BOARD_Z, BOARD_THICK, BOARD_W, BOARD_BOTTOM, BOARD_TOP,
  NET_DEPTH, NET_BOTTOM_R, POLE_Z, POLE_R, BALL_R, E_FLOOR, E_RIM, E_BOARD, E_POLE,
  FRIC_FLOOR, FRIC_RIM, FRIC_BOARD,
} from "./constants.js";

export function makeBall() {
  return {
    p: { x: 0, y: BALL_R, z: 6 },
    v: { x: 0, y: 0, z: 0 },
    /** visual spin (rad/s about each axis) */
    w: { x: 0, y: 0, z: 0 },
    /** accumulated rotation, for the renderer (quaternion-free: axis-angle integrated per frame) */
    belowEntry: false,
    netT: 0, // time since the ball last went through the net (for net animation)
    onFloor: false,
  };
}

function resolve(ball, nx, ny, nz, pen, e, fric, ev, kind, extra) {
  const b = ball;
  b.p.x += nx * pen;
  b.p.y += ny * pen;
  b.p.z += nz * pen;
  const vn = b.v.x * nx + b.v.y * ny + b.v.z * nz;
  if (vn >= 0) return false;
  // split into normal/tangent, reflect normal with restitution, damp tangent
  const tx = b.v.x - vn * nx;
  const ty = b.v.y - vn * ny;
  const tz = b.v.z - vn * nz;
  const rn = -vn * e;
  // contact flags (independent of the audible-impact threshold below)
  if (kind === "rim") b.rimHit = true;
  else if (kind === "board") b.boardHit = true;
  b.v.x = tx * fric + rn * nx;
  b.v.y = ty * fric + rn * ny;
  b.v.z = tz * fric + rn * nz;
  // contact kicks the visual spin toward rolling along the tangent
  b.w.x = (ny * tz - nz * ty) / BALL_R * 0.6 + b.w.x * 0.4;
  b.w.y = (nz * tx - nx * tz) / BALL_R * 0.6 + b.w.y * 0.4;
  b.w.z = (nx * ty - ny * tx) / BALL_R * 0.6 + b.w.z * 0.4;
  // resting contacts (a ball sitting on the rim / rolling) are not impacts
  if (ev && -vn > 0.3) ev.push({ type: kind, speed: -vn, x: b.p.x, y: b.p.y, z: b.p.z, ...extra });
  return true;
}

/** Sphere vs axis-aligned box. */
function collideBox(ball, x0, x1, y0, y1, z0, z1, e, fric, ev, kind) {
  const p = ball.p;
  const qx = Math.max(x0, Math.min(x1, p.x));
  const qy = Math.max(y0, Math.min(y1, p.y));
  const qz = Math.max(z0, Math.min(z1, p.z));
  let dx = p.x - qx;
  let dy = p.y - qy;
  let dz = p.z - qz;
  const d2 = dx * dx + dy * dy + dz * dz;
  if (d2 >= BALL_R * BALL_R) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // centre inside the box: push out through the front (+Z) face
    dx = 0; dy = 0; dz = 1;
    d = 0;
    return resolve(ball, 0, 0, 1, (z1 - p.z) + BALL_R, e, fric, ev, kind, {});
  }
  return resolve(ball, dx / d, dy / d, dz / d, BALL_R - d, e, fric, ev, kind, {});
}

/** Sphere vs rim torus (exact). Returns contact side for sound/analysis. */
function collideRim(ball, ev) {
  const p = ball.p;
  const dx = p.x;
  const dz = p.z;
  let hl = Math.hypot(dx, dz);
  let ux = 1;
  let uz = 0;
  if (hl > 1e-6) {
    ux = dx / hl;
    uz = dz / hl;
  } else hl = 0;
  const qx = ux * RIM_R;
  const qz = uz * RIM_R;
  const nx = p.x - qx;
  const ny = p.y - RIM_Y;
  const nz = p.z - qz;
  const d = Math.hypot(nx, ny, nz);
  const lim = BALL_R + RIM_TUBE;
  if (d >= lim || d < 1e-6) return false;
  // front = the side facing the court (+Z), back = board side
  const side = uz > 0.5 ? "front" : uz < -0.5 ? "back" : "side";
  ball.rimTouch = true;
  return resolve(ball, nx / d, ny / d, nz / d, lim - d, E_RIM, FRIC_RIM, ev, "rim", { side });
}

function collidePole(ball, ev) {
  const p = ball.p;
  if (p.y > 3.7) return false;
  const dx = p.x;
  const dz = p.z - POLE_Z;
  const d = Math.hypot(dx, dz);
  const lim = BALL_R + POLE_R;
  if (d >= lim || d < 1e-6) return false;
  return resolve(ball, dx / d, 0, dz / d, lim - d, E_POLE, 0.8, ev, "pole", {});
}

/**
 * The net: once the ball is inside the funnel below the rim it is slowed
 * and gently centred — the "snap" of a swish — never stopped dead.
 */
function netInteraction(ball, dt) {
  const p = ball.p;
  const depth = RIM_Y - p.y;
  if (depth < 0 || depth > NET_DEPTH + BALL_R) return false;
  const t = Math.min(1, depth / NET_DEPTH);
  const r = RIM_INNER + (NET_BOTTOM_R - RIM_INNER) * t;
  const hl = Math.hypot(p.x, p.z);
  if (hl > r + BALL_R * 0.5) return false;
  // drag while threading the net
  const k = Math.exp(-2.6 * dt);
  ball.v.x *= k;
  ball.v.z *= k;
  if (ball.v.y < -1.5) ball.v.y *= Math.exp(-1.1 * dt);
  // funnel wall: keep the ball centre within the (stretching) mesh
  const allow = Math.max(0.02, r - BALL_R * 0.55);
  if (hl > allow) {
    const ux = p.x / hl;
    const uz = p.z / hl;
    const push = Math.min(hl - allow, 0.01);
    p.x -= ux * push;
    p.z -= uz * push;
    const vo = ball.v.x * ux + ball.v.z * uz;
    if (vo > 0) {
      ball.v.x -= vo * ux * 0.85;
      ball.v.z -= vo * uz * 0.85;
    }
  }
  return true;
}

/**
 * Advance a free ball one fixed step. Pushes collision / basket events into
 * `ev` (may be null for silent simulation, e.g. AI rebound prediction).
 */
export function stepBall(ball, dt, ev) {
  const p = ball.p;
  const v = ball.v;
  const py = p.y;
  const px = p.x;
  const pz = p.z;

  v.y -= G * dt;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;

  ball.rimTouch = false;
  // hoop (only bother when near it)
  if (p.y > 2.4 && p.y < 4.3 && p.z < 1.2 && p.z > BOARD_Z - 0.4 && Math.abs(p.x) < 1.3) {
    collideRim(ball, ev);
    // bracket plate between rim and board
    if (collideBox(ball, -0.07, 0.07, RIM_Y - 0.035, RIM_Y + 0.004, BOARD_Z, -RIM_R - RIM_TUBE * 0.5, E_RIM, FRIC_RIM, ev, "rim")) ball.rimTouch = true;
    collideBox(ball, -BOARD_W / 2, BOARD_W / 2, BOARD_BOTTOM, BOARD_TOP, BOARD_Z - BOARD_THICK, BOARD_Z, E_BOARD, FRIC_BOARD, ev, "board");
    if (netInteraction(ball, dt)) ball.inNet = true;
  }
  collidePole(ball, ev);
  // a ball perched on the rim never balances forever: after a moment it
  // tips the way it is already leaning (in → basket, out → off the rim)
  if (ball.rimTouch && Math.hypot(v.x, v.y, v.z) < 1.2) {
    ball.perchT = (ball.perchT || 0) + dt;
    if (ball.perchT > 0.45) {
      const hl = Math.hypot(p.x, p.z) || 1;
      let dx;
      let dz;
      if (p.z < -0.15 && hl > RIM_R * 0.8) {
        // wedged between rim and glass: roll off to the side it favours
        dx = p.x >= 0 ? 1 : -1;
        dz = 0.25;
      } else {
        const dir = hl < RIM_R ? -1 : 1;
        dx = (p.x / hl) * dir;
        dz = (p.z / hl) * dir;
      }
      v.x += dx * 3.6 * dt;
      v.z += dz * 3.6 * dt;
    }
  } else ball.perchT = 0;

  // floor
  ball.onFloor = false;
  if (p.y < BALL_R) {
    p.y = BALL_R;
    if (v.y < 0) {
      const impact = -v.y;
      if (impact > 0.35) {
        v.y = impact * E_FLOOR;
        v.x *= FRIC_FLOOR;
        v.z *= FRIC_FLOOR;
        if (ev) ev.push({ type: "floor", speed: impact, x: p.x, y: 0, z: p.z });
      } else {
        v.y = 0;
      }
    }
    if (Math.abs(v.y) < 1e-3) {
      // rolling: roll friction + spin locked to motion
      ball.onFloor = true;
      const sp = Math.hypot(v.x, v.z);
      if (sp > 0) {
        const nsp = Math.max(0, sp - 0.55 * dt);
        v.x *= nsp / sp;
        v.z *= nsp / sp;
      }
      ball.w.x = v.z / BALL_R;
      ball.w.z = -v.x / BALL_R;
      ball.w.y *= 0.98;
    }
  }

  // basket bookkeeping: centre crossing the rim plane
  if (py >= RIM_Y && p.y < RIM_Y) {
    const f = (py - RIM_Y) / (py - p.y);
    const cx = px + (p.x - px) * f;
    const cz = pz + (p.z - pz) * f;
    if (Math.hypot(cx, cz) < RIM_INNER && !ball.belowEntry && ev) {
      ev.push({ type: "basket", x: cx, z: cz });
    }
  } else if (py < RIM_Y && p.y >= RIM_Y) {
    const f = (RIM_Y - py) / (p.y - py);
    const cx = px + (p.x - px) * f;
    const cz = pz + (p.z - pz) * f;
    if (Math.hypot(cx, cz) < RIM_R + BALL_R) ball.belowEntry = true;
  }
  if (ball.belowEntry && p.y > RIM_Y + BALL_R && Math.hypot(p.x, p.z) > RIM_R + BALL_R + 0.05) ball.belowEntry = false;
  if (ball.belowEntry && p.y < 1.5) ball.belowEntry = false;
}

/** Deep copy for look-ahead simulation (AI rebound prediction, shot solver). */
export function cloneBall(b) {
  return {
    p: { ...b.p },
    v: { ...b.v },
    w: { ...b.w },
    belowEntry: b.belowEntry,
    netT: 0,
    onFloor: b.onFloor,
  };
}

/**
 * Predict where a free ball will be reachable: steps a silent copy and
 * returns the first point (within `maxT`) where it has come down below
 * `reachY` after its apex, or where it first touches the floor.
 */
export function predictLanding(ball, reachY = 2.6, maxT = 3, dt = 1 / 120) {
  const b = cloneBall(ball);
  let t = 0;
  let wasFalling = false;
  while (t < maxT) {
    stepBall(b, dt, null);
    t += dt;
    if (b.v.y < 0) wasFalling = true;
    if (wasFalling && b.p.y < reachY && b.p.z > -1.2) return { x: b.p.x, y: b.p.y, z: b.p.z, t };
    if (b.onFloor) return { x: b.p.x, y: b.p.y, z: b.p.z, t };
  }
  return { x: b.p.x, y: b.p.y, z: b.p.z, t };
}
