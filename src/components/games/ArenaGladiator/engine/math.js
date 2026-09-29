/**
 * Arena Gladiator — tiny allocation-light vector helpers for the combat
 * engine. The engine never imports three.js, so it runs headless in Node
 * (tools/simTest.mjs) exactly as it runs in the browser.
 *
 * Vectors are plain {x, y, z} objects. Fighter-local coordinates are
 * (r, u, f) = (right, up, forward); a fighter facing yaw θ looks along
 * (sin θ, 0, cos θ) and its right is (−cos θ, 0, sin θ).
 */
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeIn = (t) => t * t;

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const copy = (o, a) => {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
  return o;
};

/** Wrap an angle into (−π, π]. */
export function wrap(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  else if (a <= -Math.PI) a += TAU;
  return a;
}

/** Move angle `a` toward `b` by at most `max` radians. */
export function turnToward(a, b, max) {
  const d = wrap(b - a);
  if (Math.abs(d) <= max) return b;
  return wrap(a + Math.sign(d) * max);
}

/** Fighter-local (r, u, f) → world, for a body at (px, pz) facing `yaw`. */
export function localToWorld(o, px, pz, yaw, r, u, f) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  o.x = px + s * f - c * r;
  o.y = u;
  o.z = pz + c * f + s * r;
  return o;
}

/** Fighter-local direction → world direction (no translation). */
export function dirToWorld(o, yaw, r, u, f) {
  const s = Math.sin(yaw);
  const c = Math.cos(yaw);
  o.x = s * f - c * r;
  o.y = u;
  o.z = c * f + s * r;
  return o;
}

/**
 * Squared distance between segments p1–q1 and p2–q2 (Ericson, Real-Time
 * Collision Detection §5.1.9). Writes the closest point on segment 1 into
 * `out1` when given.
 */
export function segSegDist2(p1, q1, p2, q2, out1) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s;
  let t;
  const EPS = 1e-9;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1x = p1.x + d1x * s, c1y = p1.y + d1y * s, c1z = p1.z + d1z * s;
  const c2x = p2.x + d2x * t, c2y = p2.y + d2y * t, c2z = p2.z + d2z * t;
  if (out1) {
    out1.x = c1x;
    out1.y = c1y;
    out1.z = c1z;
  }
  const dx = c1x - c2x, dy = c1y - c2y, dz = c1z - c2z;
  return dx * dx + dy * dy + dz * dz;
}

/** Deterministic PRNG (mulberry32) — AI decisions are reproducible per seed. */
export function createRng(seed = 1) {
  let s = seed >>> 0 || 1;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.chance = (p) => next() < p;
  next.pick = (arr) => arr[Math.floor(next() * arr.length) % arr.length];
  return next;
}
