/**
 * Third-person orbit camera (framework-free; the renderer copies the result
 * into a THREE.PerspectiveCamera).
 *
 * yaw: direction the camera LOOKS along the ground (0 = +z); pitch: elevation
 * above the bear. Mouse / touch drag adds to yaw/pitch; while the bear runs
 * and the player hasn't touched the camera for a moment, it drifts gently
 * behind the bear. A ray from the bear's head to the camera is tested against
 * every solid box so walls pull the camera in instead of hiding the bear.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export const PITCH_MIN = 0.08;
export const PITCH_MAX = 1.15;

export function createCamera() {
  return {
    yaw: 0,
    pitch: 0.38,
    dist: 7.2,
    want: 7.2,
    cur: 7.2,
    tx: 0,
    ty: 0,
    tz: 0,
    x: 0,
    y: 0,
    z: 0,
    idle: 9, // seconds since the player last moved the camera
    shake: 0,
  };
}

/** snap behind the bear (level start / respawn) */
export function snapCamera(c, g, yaw) {
  const p = g.player;
  c.yaw = yaw ?? p.face;
  c.pitch = 0.38;
  c.tx = p.x;
  c.ty = p.y + 1.3;
  c.tz = p.z;
  c.cur = c.want;
  place(c, g, true);
}

/** forward / right unit vectors on the ground for the current yaw */
export function camAxes(c) {
  const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw);
  return { fx, fz, rx: -fz, rz: fx };
}

export function rotateCamera(c, dx, dy) {
  c.yaw = wrap(c.yaw - dx);
  c.pitch = clamp(c.pitch + dy, PITCH_MIN, PITCH_MAX);
  c.idle = 0;
}

export function updateCamera(c, g, dt, { follow = true, focus = null } = {}) {
  const p = g.player;
  c.idle += dt;
  // follow target (smoothed; vertical smoothing is softer so jumps don't bob the view)
  const gx = focus ? focus.x : p.x, gz = focus ? focus.z : p.z;
  const gy = (focus ? focus.y : p.y) + 1.3;
  const kx = 1 - Math.exp(-dt * 12);
  const ky = 1 - Math.exp(-dt * (p.grounded ? 8 : 3.5));
  c.tx += (gx - c.tx) * kx;
  c.tz += (gz - c.tz) * kx;
  c.ty += (gy - c.ty) * ky;
  if (Math.abs(gy - c.ty) > 4) c.ty = gy - Math.sign(gy - c.ty) * 4;

  // gentle auto-follow behind a running bear
  if (follow && c.idle > 1.6 && p.speed > 2 && g.status === "play") {
    const mv = Math.atan2(p.vx, p.vz);
    const d = wrap(mv - c.yaw);
    if (Math.abs(d) < 1.0) c.yaw = wrap(c.yaw + d * Math.min(1, dt * 0.9 * (p.speed / 5)));
    c.pitch += (0.38 - c.pitch) * Math.min(1, dt * 0.6);
  }
  place(c, g, false, dt);
}

function place(c, g, snap, dt = 0) {
  const cast = (pitch) => {
    const cp = Math.cos(pitch);
    const dx = -Math.sin(c.yaw) * cp, dy = Math.sin(pitch), dz = -Math.cos(c.yaw) * cp;
    // from the (smoothed) look target AND from the bear's chest, so a wall
    // edge between the camera and the body also counts
    const p = g.player;
    const hit = Math.min(rayBoxes(g.boxes, c.tx, c.ty, c.tz, dx, dy, dz, c.want + 0.4), rayBoxes(g.boxes, p.x, p.y + 0.85, p.z, dx, dy, dz, c.want + 0.4));
    return hit < Infinity ? hit - 0.45 : c.want;
  };
  // wall avoidance: when a wall squeezes the boom, look over it from higher up
  let pitch = c.pitch;
  let free = cast(pitch);
  if (free < 2.8) {
    for (let p2 = pitch + 0.15; p2 <= 1.4; p2 += 0.15) {
      const f2 = cast(p2);
      if (f2 > free + 0.3) {
        pitch = p2;
        free = f2;
      }
      if (f2 >= 2.8) break;
    }
  }
  if (c.eff === undefined || snap) c.eff = pitch;
  c.eff += (pitch - c.eff) * Math.min(1, dt * (pitch > c.eff ? 10 : 3));
  free = Math.max(0.8, Math.min(free, cast(c.eff)));
  const cp = Math.cos(c.eff), sp = Math.sin(c.eff);
  const dx = -Math.sin(c.yaw) * cp, dy = sp, dz = -Math.cos(c.yaw) * cp;
  if (snap || free < c.cur) c.cur = free;
  else c.cur = Math.min(free, c.cur + dt * 5);
  c.x = c.tx + dx * c.cur;
  c.y = c.ty + dy * c.cur;
  c.z = c.tz + dz * c.cur;
  if (c.shake > 0) {
    c.shake = Math.max(0, c.shake - dt * 2.5);
    const s = c.shake * 0.25;
    c.x += (Math.random() - 0.5) * s;
    c.y += (Math.random() - 0.5) * s;
    c.z += (Math.random() - 0.5) * s;
  }
}

/** distance along the ray to the nearest solid box (slab test), Infinity if none */
export function rayBoxes(boxes, ox, oy, oz, dx, dy, dz, maxT) {
  let best = Infinity;
  for (const b of boxes) {
    if (!b.solid) continue;
    let t0 = 0, t1 = maxT;
    let ok = true;
    for (const [o, d, lo, hi] of [
      [ox, dx, b.x0 - 0.15, b.x1 + 0.15],
      [oy, dy, b.y0 - 0.15, b.y1 + 0.15],
      [oz, dz, b.z0 - 0.15, b.z1 + 0.15],
    ]) {
      if (Math.abs(d) < 1e-6) {
        if (o < lo || o > hi) {
          ok = false;
          break;
        }
      } else {
        let a = (lo - o) / d, c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        if (t0 > t1) {
          ok = false;
          break;
        }
      }
    }
    // a box the head is already inside (standing against a wall top) doesn't count
    if (ok && t0 > 0.05 && t0 < best) best = t0;
  }
  return best;
}
