/**
 * Bowling Master 3D — headless lane physics (no Three.js; simTest.mjs drives it).
 *
 * Lane runs toward -z, foul line at z = 0, head pin at z = -18.29 (real
 * dimensions, metres). The ball is a 2D disc that skids then hooks with spin
 * on the dry back end. Each pin is a capsule seen from above: base point +
 * a tilt vector (direction, angle). A standing pin rocks and recovers below
 * THETA_C and falls past it, so a toppling pin's head sweeps across the deck
 * and takes neighbours with it. Fixed 240 Hz substeps keep it deterministic.
 */
export const LANE_HALF = 0.527;
export const GUTTER_W = 0.235;
export const KICKBACK = 0.7;
export const DECK_START = -17.4;
export const DECK_END = -19.25;
export const HEAD_Z = -18.29;
export const BALL_R = 0.109;
export const PIN_R = 0.06;
export const PIN_L = 0.3; // collision length of a toppled pin
export const MAX_X = LANE_HALF - BALL_R;
const SP = 0.3048;
const ROW = SP * Math.sin(Math.PI / 3);
export const PIN_SPOTS = [];
for (let r = 0; r < 4; r++) for (let k = 0; k <= r; k++) PIN_SPOTS.push([(k - r / 2) * SP, HEAD_Z - r * ROW]);

const DT = 1 / 240;
const M_BALL = 7;
const M_PIN = 1.5;
const E_BALL = 0.7;
const E_PIN = 0.75;
const TILT_K = 9;
const THETA_C = 0.2;
const RESTORE = 22;
const FALL = 30;
const HOOK = 1.0;
const W_MAX = 22;
const V_MAX = 11;
const HALF_PI = Math.PI / 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export const powerToSpeed = (p) => 5 + 5.5 * clamp(p, 0, 1);

export function createSim() {
  return { t: 0, acc: 0, ball: { x: 0, z: 0.4, y: BALL_R, vx: 0, vz: 0, spin: 0, state: "idle", doneT: -1, roll: 0 }, pins: [], events: [] };
}

/** Set a fresh rack of ten (spots jittered by a few mm so no two racks are identical). */
export function rackPins(sim, rand = Math.random) {
  sim.pins = PIN_SPOTS.map(([x, z], id) => ({ id, x: x + (rand() - 0.5) * 0.004, z: z + (rand() - 0.5) * 0.004, vx: 0, vz: 0, tx: 0, tz: 0, wx: 0, wz: 0, state: "up", yaw: rand() * 6.28, yawRate: 0, y: 0 }));
}

/** Drop deadwood after the first ball: fallen pins vanish, standing pins are re-stood in place. */
export function sweepFallen(sim) {
  for (const p of sim.pins) {
    if (p.state !== "up" || Math.hypot(p.tx, p.tz) >= THETA_C) p.state = "gone";
    else Object.assign(p, { vx: 0, vz: 0, tx: 0, tz: 0, wx: 0, wz: 0, yawRate: 0, y: 0 });
  }
}

export const isStanding = (p) => p.state === "up" && Math.hypot(p.tx, p.tz) < THETA_C;
export const standingCount = (sim) => sim.pins.filter(isStanding).length;

export function launch(sim, { x, angle, speed, spin }) {
  const b = sim.ball;
  Object.assign(b, { x: clamp(x, -MAX_X, MAX_X), z: -0.2, y: BALL_R, vx: Math.sin(angle) * speed, vz: -Math.cos(angle) * speed, spin: clamp(spin, -1, 1), state: "roll", doneT: -1 });
  sim.t = 0;
  sim.acc = 0;
  sim.events.length = 0;
}

/** Ball-only path (no pins) for the aim guide; returns [x, z] pairs. */
export function predictPath(x, angle, speed, spin, toZ = HEAD_Z, step = 0.04) {
  const s = createSim();
  launch(s, { x, angle, speed, spin });
  const pts = [[s.ball.x, s.ball.z]];
  let n = 0;
  while (s.ball.z > toZ && s.ball.state === "roll" && n++ < 4000) {
    ballStep(s.ball, step);
    pts.push([s.ball.x, s.ball.z]);
  }
  return pts;
}

function ballStep(b, dt) {
  if (b.state === "roll") {
    b.vx += -b.spin * HOOK * smooth(-5, -15, b.z) * dt;
    const sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      const k = Math.max(0, sp - 0.12 * dt) / sp;
      b.vx *= k;
      b.vz *= k;
    }
    if (Math.abs(b.x) > LANE_HALF) b.state = "gutter";
  } else if (b.state === "gutter") {
    const gx = Math.sign(b.x) * (LANE_HALF + GUTTER_W / 2);
    b.x += (gx - b.x) * Math.min(1, dt * 10);
    b.y += (BALL_R - 0.07 - b.y) * Math.min(1, dt * 10);
    b.vx = 0;
  }
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.roll += (Math.hypot(b.vx, b.vz) / BALL_R) * dt;
  if (b.z < DECK_END - 0.15 && b.state !== "pit") b.state = "pit";
}

// closest points between segments p1q1 and p2q2 (2D) → [s, t]
function segSeg(p1x, p1z, q1x, q1z, p2x, p2z, q2x, q2z) {
  const d1x = q1x - p1x, d1z = q1z - p1z, d2x = q2x - p2x, d2z = q2z - p2z, rx = p1x - p2x, rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z, e = d2x * d2x + d2z * d2z, f = d2x * rx + d2z * rz;
  if (a < 1e-9 && e < 1e-9) return [0, 0];
  if (a < 1e-9) return [0, clamp(f / e, 0, 1)];
  const c = d1x * rx + d1z * rz;
  if (e < 1e-9) return [clamp(-c / a, 0, 1), 0];
  const b = d1x * d2x + d1z * d2z, den = a * e - b * b;
  let s = den > 1e-12 ? clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
  return [s, t];
}

// pin's top-down capsule: base → tip, plus the tip's horizontal velocity
function pinSeg(p) {
  const th = Math.hypot(p.tx, p.tz);
  if (p.state === "down") { const dx = Math.cos(p.yaw), dz = Math.sin(p.yaw); return [p.x + dx * PIN_L, p.z + dz * PIN_L, 0, 0]; }
  if (th < 1e-6) return [p.x, p.z, 0, 0];
  const l = PIN_L * Math.sin(Math.min(th, HALF_PI));
  const c = PIN_L * Math.cos(th);
  return [p.x + (p.tx / th) * l, p.z + (p.tz / th) * l, p.wx * c, p.wz * c, TILT_K * c];
}

// inverse mass felt at param u along a pin (the tilt response makes the head lighter)
const invMass = (g, u) => (1 + (g[4] || 0) * u) / M_PIN;

function pushPin(p, jx, jz, u) {
  p.vx += jx / M_PIN;
  p.vz += jz / M_PIN;
  if (p.state === "up") {
    p.wx = clamp(p.wx + (jx / M_PIN) * TILT_K, -W_MAX, W_MAX);
    p.wz = clamp(p.wz + (jz / M_PIN) * TILT_K, -W_MAX, W_MAX);
  } else {
    const cr = Math.cos(p.yaw) * jz - Math.sin(p.yaw) * jx;
    p.yawRate = clamp(p.yawRate + ((u - 0.5) * cr * 12) / (M_PIN * PIN_L), -25, 25);
  }
}

const active = (p) => p.state === "up" || p.state === "down";

function collide(sim) {
  const b = sim.ball;
  const pins = sim.pins;
  const segs = pins.map((p) => (active(p) ? pinSeg(p) : null));
  if (b.state === "roll" && b.z < DECK_START + 0.5) {
    for (let i = 0; i < pins.length; i++) {
      const p = pins[i], g = segs[i];
      if (!g) continue;
      const [, u] = segSeg(b.x, b.z, b.x, b.z, p.x, p.z, g[0], g[1]);
      const qx = p.x + (g[0] - p.x) * u, qz = p.z + (g[1] - p.z) * u;
      let nx = b.x - qx, nz = b.z - qz;
      const d = Math.hypot(nx, nz);
      if (d >= BALL_R + PIN_R || d < 1e-9) continue;
      nx /= d; nz /= d;
      const pen = BALL_R + PIN_R - d;
      b.x += nx * pen * 0.18; b.z += nz * pen * 0.18;
      p.x -= nx * pen * 0.82; p.z -= nz * pen * 0.82;
      const vn = (b.vx - p.vx - g[2] * u) * nx + (b.vz - p.vz - g[3] * u) * nz;
      if (vn >= 0) continue;
      const j = (-(1 + E_BALL) * vn) / (1 / M_BALL + invMass(g, u));
      b.vx += (j * nx) / M_BALL;
      b.vz = Math.min(b.vz + (j * nz) / M_BALL, -1.2); // a 7 kg ball always drives through
      pushPin(p, -j * nx, -j * nz, u);
      sim.events.push({ type: "hit", v: -vn, ball: true });
    }
  }
  for (let i = 0; i < pins.length; i++) {
    const a = pins[i], ga = segs[i];
    if (!ga) continue;
    for (let k = i + 1; k < pins.length; k++) {
      const c = pins[k], gc = segs[k];
      if (!gc) continue;
      const [s, t] = segSeg(a.x, a.z, ga[0], ga[1], c.x, c.z, gc[0], gc[1]);
      const ax = a.x + (ga[0] - a.x) * s, az = a.z + (ga[1] - a.z) * s;
      const cx = c.x + (gc[0] - c.x) * t, cz = c.z + (gc[1] - c.z) * t;
      let nx = ax - cx, nz = az - cz;
      const d = Math.hypot(nx, nz);
      if (d >= 2 * PIN_R || d < 1e-9) continue;
      nx /= d; nz /= d;
      const pen = (2 * PIN_R - d) * 0.5;
      a.x += nx * pen; a.z += nz * pen; c.x -= nx * pen; c.z -= nz * pen;
      const vn = (a.vx + ga[2] * s - c.vx - gc[2] * t) * nx + (a.vz + ga[3] * s - c.vz - gc[3] * t) * nz;
      if (vn >= 0) continue;
      const j = (-(1 + E_PIN) * vn) / (invMass(ga, s) + invMass(gc, t));
      pushPin(a, j * nx, j * nz, s);
      pushPin(c, -j * nx, -j * nz, t);
      // a falling pin spends its swing on what it hits
      if (s > 0.3) { a.wx *= 0.7; a.wz *= 0.7; }
      if (t > 0.3) { c.wx *= 0.7; c.wz *= 0.7; }
      if (-vn > 0.4) sim.events.push({ type: "hit", v: -vn, ball: false });
    }
  }
}

function pinStep(p, dt) {
  if (p.state === "out") {
    p.y = Math.max(-0.45, p.y - 2.4 * dt);
    const k = Math.exp(-6 * dt);
    p.vx *= k; p.vz *= k;
    p.x += p.vx * dt; p.z += p.vz * dt;
    return;
  }
  if (p.state === "gone") return;
  if (p.state === "up") {
    let th = Math.hypot(p.tx, p.tz);
    const wl = Math.hypot(p.wx, p.wz);
    if (th > 1e-6 || wl > 1e-6) {
      const ux = th > 1e-6 ? p.tx / th : p.wx / wl, uz = th > 1e-6 ? p.tz / th : p.wz / wl;
      const a = th < THETA_C ? -RESTORE : FALL * Math.sin(th);
      p.wx += ux * a * dt; p.wz += uz * a * dt;
      if (th < THETA_C) { const k = Math.exp(-3 * dt); p.wx *= k; p.wz *= k; }
      p.tx += p.wx * dt; p.tz += p.wz * dt;
      th = Math.hypot(p.tx, p.tz);
      if (th < 0.004 && Math.hypot(p.wx, p.wz) < 0.08) p.tx = p.tz = p.wx = p.wz = 0;
      if (th >= HALF_PI) {
        const dx = p.tx / th, dz = p.tz / th;
        p.state = "down";
        p.yaw = Math.atan2(dz, dx);
        p.vx += dx * 0.5; p.vz += dz * 0.5;
        p.yawRate = 0;
        p.tx = p.tz = p.wx = p.wz = 0;
      }
    }
  } else {
    p.yaw += p.yawRate * dt;
    p.yawRate *= Math.exp(-1.6 * dt);
  }
  const sp = Math.hypot(p.vx, p.vz);
  if (sp > 0) {
    const k = Math.min(V_MAX, Math.max(0, sp - (p.state === "up" ? 3.5 : 2.2) * dt)) / sp;
    p.vx *= k; p.vz *= k;
  }
  p.x += p.vx * dt; p.z += p.vz * dt;
  if (Math.abs(p.x) > KICKBACK) { p.x = Math.sign(p.x) * KICKBACK; p.vx = -p.vx * 0.5; }
  if (p.z < DECK_END || (Math.abs(p.x) > LANE_HALF + 0.03 && Math.hypot(p.vx, p.vz) < 2.5)) {
    p.state = "out";
    if (p.z < DECK_END) p.vz = Math.min(p.vz, -0.5);
  }
}

/** Advance real time `dt` (s) in fixed substeps. */
export function stepSim(sim, dt) {
  sim.acc += Math.min(dt, 0.1);
  while (sim.acc >= DT) {
    sim.acc -= DT;
    sim.t += DT;
    ballStep(sim.ball, DT);
    for (const p of sim.pins) pinStep(p, DT);
    collide(sim);
    const b = sim.ball;
    if (b.doneT < 0 && (b.state === "pit" || b.z < DECK_END)) b.doneT = sim.t;
  }
}

/** True once the ball is gone and nothing on the deck is still moving (or the time cap hit). */
export function isSettled(sim) {
  const b = sim.ball;
  if (sim.t > 14) return true;
  if (b.state === "roll" || b.state === "gutter") return false;
  if (b.doneT >= 0 && sim.t - b.doneT > 4) return true;
  return sim.pins.every((p) => {
    if (p.state === "gone") return true;
    if (p.state === "out") return p.y <= -0.44;
    const still = Math.hypot(p.vx, p.vz) < 0.03;
    if (p.state === "down") return still && Math.abs(p.yawRate) < 0.3;
    return still && Math.hypot(p.wx, p.wz) < 0.06 && Math.hypot(p.tx, p.tz) < 0.02;
  });
}

/** Run a whole throw headlessly; returns the number of pins knocked down. */
export function simulateThrow(sim, shot, maxT = 20) {
  const before = standingCount(sim);
  launch(sim, shot);
  while (!isSettled(sim) && sim.t < maxT) stepSim(sim, 1 / 60);
  return before - standingCount(sim);
}

export { THETA_C, HALF_PI };
