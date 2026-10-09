/**
 * Stunt Racer 3D — moving obstacles. Every obstacle is a pure function of
 * the run clock (no randomness, no state), so its pattern is perfectly
 * predictable and the player can watch, learn and time it.
 *
 * Shapes live in the obstacle's local road plane: x = metres along the
 * track from the obstacle's position, y = lateral (+ = left), plus the
 * height band they occupy above the road. The car is tested as two circles
 * (front and rear axle) — cheap, and it fits a car's footprint well.
 *
 *   spinner  bar rotating about a post in the middle of the road
 *   arm      long arm rotating about a post at one edge
 *   hammer   pendulum hammer swinging across the road from a gantry
 *   ball     wrecking ball swinging across the road
 *   slider   block sliding from side to side
 *   gate     static narrow gate (two blocks, one opening)
 *   doors    two walls closing towards the centre and opening again
 *   wall     a wall with a hole that slides across the road
 * (crumbling floor tiles are part of the track: engine/run.js)
 *
 * Hits never wreck the car: they push it out, bounce and slow it. Only an
 * unguarded edge can turn a hit into a fall.
 */
import { CAR_HW, CAR_HL } from "./car.js";
import { clamp } from "./util.js";

const TAU = Math.PI * 2;
const CAR_R = CAR_HW + 0.05;
const AXLE = CAR_HL - CAR_R;

export function obstacleDefaults(o, hw) {
  const d = { lat: 0, phase: 0, ...o };
  switch (o.type) {
    case "spinner":
      return { len: Math.min(hw * 0.78, 5.2), rate: 1.0, ...d };
    case "arm":
      return { side: 1, len: hw * 1.25, rate: 0.9, ...d, lat: (o.side ?? 1) * (hw + 0.6) };
    case "hammer":
      return { period: 2.8, amp: 62, len: 8, ...d };
    case "ball":
      return { period: 3.2, amp: 55, len: 9, r: 1.5, ...d };
    case "slider":
      return { size: [3.2, 3.6], amp: Math.max(1, hw - 2.4), period: 3.2, ...d };
    case "gate":
      return { gap: 4.6, ...d };
    case "doors":
      return { period: 3.6, open: Math.min(hw * 1.5, 9), ...d };
    case "wall":
      return { hole: 5, amp: Math.max(1, hw - 3.2), period: 3.8, ...d };
    default:
      return d;
  }
}

/** Shapes of one obstacle at time t: { k: "seg"|"box"|"circle", ... , top, bot }. */
export function shapesAt(o, t, hw) {
  const ph = o.phase * TAU;
  switch (o.type) {
    case "spinner":
    case "arm": {
      const a = ph + o.rate * t;
      const cx = 0;
      const cy = o.lat;
      const dx = Math.cos(a) * o.len;
      const dy = Math.sin(a) * o.len;
      const out = [{ k: "circle", x: cx, y: cy, r: 0.6, bot: -1, top: 3 }];
      if (o.type === "spinner") out.push({ k: "seg", ax: cx - dx, ay: cy - dy, bx: cx + dx, by: cy + dy, r: 0.42, bot: -1, top: 1.6 });
      else out.push({ k: "seg", ax: cx, ay: cy, bx: cx + dx, by: cy + dy, r: 0.42, bot: -1, top: 1.6 });
      return out;
    }
    case "hammer":
    case "ball": {
      const phi = ((o.amp * Math.PI) / 180) * Math.sin(ph + (TAU * t) / o.period);
      const y = o.lat + o.len * Math.sin(phi);
      const hgt = 1.05 + o.len * (1 - Math.cos(phi));
      if (o.type === "hammer") return [{ k: "box", x: 0, y, hx: 1.25, hy: 1.15, rot: 0, bot: hgt - 1.1, top: hgt + 1.1, phi }];
      return [{ k: "circle", x: 0, y, r: o.r, bot: hgt - o.r, top: hgt + o.r, phi }];
    }
    case "slider": {
      const y = o.lat + o.amp * Math.sin(ph + (TAU * t) / o.period);
      return [{ k: "box", x: 0, y, hx: o.size[0] / 2, hy: o.size[1] / 2, rot: 0, bot: -1, top: 2.4 }];
    }
    case "gate": {
      const g = o.gap / 2;
      const lo = o.lat - g;
      const hi = o.lat + g;
      const far = hw + 1.5;
      const out = [];
      if (hi < far) out.push({ k: "box", x: 0, y: (hi + far) / 2, hx: 0.6, hy: (far - hi) / 2, rot: 0, bot: -1, top: 3.2 });
      if (lo > -far) out.push({ k: "box", x: 0, y: (lo - far) / 2, hx: 0.6, hy: (lo + far) / 2, rot: 0, bot: -1, top: 3.2 });
      return out;
    }
    case "doors": {
      // opening width cycles 0 → open → 0, with a hold while fully open
      const c = 0.5 + 0.5 * Math.sin(ph + (TAU * t) / o.period);
      const open = o.open * clamp(c * 1.35 - 0.1, 0, 1);
      const far = hw + 1.5;
      const g = open / 2;
      return [
        { k: "box", x: 0, y: (g + far) / 2, hx: 0.7, hy: Math.max(0.05, (far - g) / 2), rot: 0, bot: -1, top: 3.4 },
        { k: "box", x: 0, y: -(g + far) / 2, hx: 0.7, hy: Math.max(0.05, (far - g) / 2), rot: 0, bot: -1, top: 3.4 },
      ];
    }
    case "wall": {
      const c = o.lat + o.amp * Math.sin(ph + (TAU * t) / o.period);
      const g = o.hole / 2;
      const far = hw + 1.5;
      return [
        { k: "box", x: 0, y: (c + g + far) / 2, hx: 0.7, hy: Math.max(0.05, (far - c - g) / 2), rot: 0, bot: -1, top: 3.6 },
        { k: "box", x: 0, y: (c - g - far) / 2, hx: 0.7, hy: Math.max(0.05, (c - g + far) / 2), rot: 0, bot: -1, top: 3.6 },
      ];
    }
    default:
      return [];
  }
}

/** Penetration of a circle (px, py, r) into a shape → { d, nx, ny } or null. */
function circleVs(sh, px, py, r) {
  if (sh.k === "circle") {
    const dx = px - sh.x;
    const dy = py - sh.y;
    const L = Math.hypot(dx, dy);
    const d = r + sh.r - L;
    if (d <= 0) return null;
    return L > 1e-6 ? { d, nx: dx / L, ny: dy / L } : { d, nx: -1, ny: 0 };
  }
  if (sh.k === "seg") {
    const ex = sh.bx - sh.ax;
    const ey = sh.by - sh.ay;
    const L2 = ex * ex + ey * ey || 1;
    const u = clamp(((px - sh.ax) * ex + (py - sh.ay) * ey) / L2, 0, 1);
    const cx = sh.ax + ex * u;
    const cy = sh.ay + ey * u;
    const dx = px - cx;
    const dy = py - cy;
    const L = Math.hypot(dx, dy);
    const d = r + sh.r - L;
    if (d <= 0) return null;
    return L > 1e-6 ? { d, nx: dx / L, ny: dy / L } : { d, nx: -1, ny: 0 };
  }
  // box (axis aligned in the road plane)
  const dx = px - sh.x;
  const dy = py - sh.y;
  const qx = clamp(dx, -sh.hx, sh.hx);
  const qy = clamp(dy, -sh.hy, sh.hy);
  const ox = dx - qx;
  const oy = dy - qy;
  const L = Math.hypot(ox, oy);
  if (L > 1e-6) {
    const d = r - L;
    if (d <= 0) return null;
    return { d, nx: ox / L, ny: oy / L };
  }
  // centre inside the box: push out along the shallow axis
  const px2 = sh.hx - Math.abs(dx);
  const py2 = sh.hy - Math.abs(dy);
  if (px2 < py2) return { d: px2 + r, nx: Math.sign(dx) || -1, ny: 0 };
  return { d: py2 + r, nx: 0, ny: Math.sign(dy) || 1 };
}

/**
 * Does the car (as two axle circles at local position x = car.s − o.s,
 * y = car.lat, heading psi, height h above the road) overlap the obstacle
 * at time t? Returns the deepest contact { d, nx, ny, vx, vy } or null;
 * (vx, vy) is the obstacle's surface velocity there (for the knock).
 */
export function collide(o, t, hw, x, y, psi, h = 0, pad = 0) {
  const cps = Math.cos(psi);
  const sps = Math.sin(psi);
  const shapes = shapesAt(o, t, hw);
  let best = null;
  for (let i = 0; i < shapes.length; i++) {
    const sh = shapes[i];
    if (h > sh.top || h + 1.3 < sh.bot) continue;
    for (const k of [-1, 1]) {
      const c = circleVs(sh, x + cps * AXLE * k, y + sps * AXLE * k, CAR_R + pad);
      if (c && (!best || c.d > best.d)) best = { ...c, idx: i };
    }
  }
  if (!best) return null;
  // obstacle velocity by finite difference (patterns are smooth)
  const sh0 = shapes[best.idx];
  const sh1 = shapesAt(o, t + 0.02, hw)[best.idx];
  const cx = (sh) => (sh.k === "seg" ? (sh.ax + sh.bx) / 2 : sh.x);
  const cy = (sh) => (sh.k === "seg" ? (sh.ay + sh.by) / 2 : sh.y);
  let vx = (cx(sh1) - cx(sh0)) / 0.02;
  let vy = (cy(sh1) - cy(sh0)) / 0.02;
  if (sh0.k === "seg") {
    // rotating bar: surface speed at the contact radius
    const a0 = Math.atan2(sh0.by - sh0.ay, sh0.bx - sh0.ax);
    const a1 = Math.atan2(sh1.by - sh1.ay, sh1.bx - sh1.ax);
    let da = a1 - a0;
    if (da > Math.PI) da -= TAU;
    if (da < -Math.PI) da += TAU;
    const w = da / 0.02;
    const rx = x - cx(sh0);
    const ry = y - cy(sh0);
    vx = -w * ry;
    vy = w * rx;
  }
  return { ...best, vx, vy };
}

/** Is a lane at lateral y blocked at time t (for the bot / validator)? */
export function blockedAt(o, t, hw, y, pad = 0.2) {
  return !!collide(o, t, hw, 0, y, 0, 0, pad);
}
