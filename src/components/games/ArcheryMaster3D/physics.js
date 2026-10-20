/**
 * Archery Master 3D — arrow ballistics and collision. Pure math on plain
 * {x, y, z} objects (no Three.js) so the game and the Node validator share
 * exactly the same flight model.
 *
 * Flight is constant acceleration: gravity plus a wind push. Each frame the
 * arrow advances in small substeps and the swept segment is tested against
 * every target face (a disc turned toward the archer), every obstacle box and
 * the ground.
 */

export const G = 9.81;
export const EYE = { x: 0, y: 1.6, z: 0 };
export const SPEED_MIN = 26;
export const SPEED_MAX = 74;
export const WIND_K = 0.32; // m/s² of push per m/s of wind
export const MIN_POWER = 0.18; // releases below this cancel the shot
export const SUBSTEP = 1 / 240;
export const MAX_FLIGHT = 4;
export const TARGET_DEPTH = 0.14; // boss thickness (visual) — the scored plane is the face

export const launchSpeed = (power) => SPEED_MIN + (SPEED_MAX - SPEED_MIN) * Math.max(0, Math.min(1, power));

/** Unit aim vector: yaw > 0 turns right, pitch > 0 looks up. */
export function aimDir(yaw, pitch) {
  const c = Math.cos(pitch);
  return { x: Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c };
}

/** Where a released arrow starts: just ahead of the eye along the aim. */
export function launchOrigin(dir) {
  return { x: EYE.x + dir.x * 0.5, y: EYE.y + dir.y * 0.5 - 0.02, z: EYE.z + dir.z * 0.5 };
}

export const accelOf = (wind) => ({ x: wind.x * WIND_K, y: -G, z: wind.z * WIND_K });

function motionOffset(m, t) {
  if (!m) return [0, 0];
  const w = m.s * t + m.p;
  switch (m.k) {
    case "slide":
      return [m.a * Math.sin(w), 0];
    case "bob":
      return [0, m.a * Math.sin(w)];
    case "circle":
      return [m.a * Math.cos(w), m.a * Math.sin(w)];
    case "eight":
      return [m.a * Math.sin(w), m.a * 0.45 * Math.sin(2 * w)];
    default:
      return [0, 0];
  }
}

/** Centre of a target (or obstacle) at level time t. */
export function posAt(o, t, out = { x: 0, y: 0, z: 0 }) {
  const [dx, dy] = motionOffset(o.motion, t);
  out.x = o.x + dx;
  out.y = o.y + dy;
  out.z = o.z;
  return out;
}

/** Target faces turn (yaw only) toward the archer. Unit normal pointing at them. */
export function targetNormal(tg) {
  const l = Math.hypot(tg.x, tg.z) || 1;
  return { x: -tg.x / l, y: 0, z: -tg.z / l };
}

/** Ring score 10…1 from distance-to-centre over radius; 0 off the face. */
export function ringScore(d, r) {
  if (d > r) return 0;
  return Math.max(1, 10 - Math.floor((d / r) * 10));
}
export const isPerfect = (d, r) => d <= r * 0.05;

/** Analytic no-wind/with-wind impact on the plane z = zPlane. Returns null if never reached. */
export function predict(origin, dir, speed, accel, zPlane) {
  const vz = dir.z * speed;
  const dz = zPlane - origin.z;
  // z(t) = oz + vz t + ½ az t²
  let t;
  if (Math.abs(accel.z) < 1e-9) {
    if (vz >= -1e-6) return null;
    t = dz / vz;
  } else {
    const A = 0.5 * accel.z, B = vz, C = -dz;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    const r1 = (-B - s) / (2 * A), r2 = (-B + s) / (2 * A);
    t = Math.min(...[r1, r2].filter((v) => v > 0));
    if (!Number.isFinite(t)) return null;
  }
  if (t <= 0) return null;
  return {
    t,
    x: origin.x + dir.x * speed * t + 0.5 * accel.x * t * t,
    y: origin.y + dir.y * speed * t + 0.5 * accel.y * t * t,
    z: zPlane,
  };
}

export function createArrow(origin, dir, speed) {
  return {
    p: { ...origin },
    v: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed },
    age: 0,
  };
}

/* segment p0→p1 against an axis-aligned box; returns entry fraction or -1 */
function segBox(p0, p1, c, hx, hy, hz) {
  let t0 = 0, t1 = 1;
  const ax = ["x", "y", "z"], h = { x: hx, y: hy, z: hz };
  for (const a of ax) {
    const d = p1[a] - p0[a];
    const lo = c[a] - h[a], hi = c[a] + h[a];
    if (Math.abs(d) < 1e-9) {
      if (p0[a] < lo || p0[a] > hi) return -1;
    } else {
      let ta = (lo - p0[a]) / d, tb = (hi - p0[a]) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) return -1;
    }
  }
  return t0;
}

const _c = { x: 0, y: 0, z: 0 };

/**
 * Advance one arrow by dt seconds (in SUBSTEP slices) at level time `time`
 * (the level clock at the START of this dt). Returns null while in flight,
 * otherwise the impact record.
 */
export function stepArrow(arrow, dt, level, accel, time) {
  let left = dt;
  let t = time;
  while (left > 1e-9) {
    const h = Math.min(SUBSTEP, left);
    left -= h;
    t += h;
    const p0 = arrow.p;
    const v = arrow.v;
    const p1 = {
      x: p0.x + v.x * h + 0.5 * accel.x * h * h,
      y: p0.y + v.y * h + 0.5 * accel.y * h * h,
      z: p0.z + v.z * h + 0.5 * accel.z * h * h,
    };
    const v1 = { x: v.x + accel.x * h, y: v.y + accel.y * h, z: v.z + accel.z * h };
    arrow.age += h;

    let best = null;
    // target faces
    level.targets.forEach((tg, i) => {
      const c = posAt(tg, t, { x: 0, y: 0, z: 0 });
      const n = targetNormal(tg);
      const d0 = (p0.x - c.x) * n.x + (p0.y - c.y) * n.y + (p0.z - c.z) * n.z;
      const d1 = (p1.x - c.x) * n.x + (p1.y - c.y) * n.y + (p1.z - c.z) * n.z;
      if (d0 < 0 || d1 > 0) return; // must cross from the front
      const f = d0 / (d0 - d1);
      const q = { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, z: p0.z + (p1.z - p0.z) * f };
      const dist = Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z);
      if (dist > tg.r) return;
      if (!best || f < best.f) best = { f, kind: "target", index: i, point: q, center: c, dist, score: ringScore(dist, tg.r), perfect: isPerfect(dist, tg.r) };
    });
    // obstacles
    level.obstacles.forEach((ob, i) => {
      posAt(ob, t, _c);
      const f = segBox(p0, p1, _c, ob.w / 2, ob.h / 2, ob.d / 2);
      if (f < 0 || (best && f >= best.f)) return;
      best = { f, kind: "obstacle", index: i, point: { x: p0.x + (p1.x - p0.x) * f, y: p0.y + (p1.y - p0.y) * f, z: p0.z + (p1.z - p0.z) * f }, center: { ..._c }, score: 0 };
    });
    // ground
    if (p1.y <= 0 && p0.y > 0) {
      const f = p0.y / (p0.y - p1.y);
      if (!best || f < best.f) best = { f, kind: "ground", point: { x: p0.x + (p1.x - p0.x) * f, y: 0, z: p0.z + (p1.z - p0.z) * f }, score: 0 };
    }
    if (best) {
      arrow.p = best.point;
      arrow.v = v1;
      best.time = t;
      best.velocity = { ...v1 };
      return best;
    }
    arrow.p = p1;
    arrow.v = v1;
    if (arrow.age > MAX_FLIGHT || p1.z < -160 || Math.abs(p1.x) > 120) return { kind: "lost", point: { ...p1 }, score: 0, time: t, velocity: { ...v1 } };
  }
  return null;
}

/**
 * Aim solver: the yaw/pitch that sends an arrow at `speed` through point(t)
 * — a function of flight time, so moving targets get a lead. Used by the
 * level validator's bot (the player gets no aim assist).
 */
export function solveAim(origin, point, speed, accel) {
  let t = 0.5;
  for (let k = 0; k < 30; k++) {
    const P = point(t);
    const vx = (P.x - origin.x - 0.5 * accel.x * t * t) / t;
    const vy = (P.y - origin.y - 0.5 * accel.y * t * t) / t;
    const vz = (P.z - origin.z - 0.5 * accel.z * t * t) / t;
    const m = Math.hypot(vx, vy, vz);
    const nt = t * (m / speed);
    if (Math.abs(nt - t) < 1e-7) {
      t = nt;
      break;
    }
    t = nt;
  }
  const P = point(t);
  const vx = (P.x - origin.x - 0.5 * accel.x * t * t) / t;
  const vy = (P.y - origin.y - 0.5 * accel.y * t * t) / t;
  const vz = (P.z - origin.z - 0.5 * accel.z * t * t) / t;
  const m = Math.hypot(vx, vy, vz);
  return { yaw: Math.atan2(vx / m, -vz / m), pitch: Math.asin(vy / m), t };
}
