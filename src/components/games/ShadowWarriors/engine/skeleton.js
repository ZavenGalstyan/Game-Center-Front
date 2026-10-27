/**
 * Shadow Warriors — 2D skeleton. A pose is a flat object of joint angles
 * (degrees, authored facing right); `solve()` turns it into world-space joint
 * positions. The renderer draws exactly these joints and the combat code
 * builds hurt/hit capsules from them, so what you see is what hits.
 *
 * Angles: arms/legs are absolute, measured from straight down, positive =
 * rotating toward the facing direction (90 = horizontal forward, 180 = up).
 * Elbow bend `e*` is added to the upper arm; knee bend `k*` is subtracted
 * (shins fold backward). Weapon angle `w*` is added to the forearm.
 * Torso `t` leans forward from vertical; head `h` is relative to the torso.
 */
export const BONES = { torso: 50, neck: 7, headR: 13, upper: 29, fore: 27, thigh: 41, shin: 41 };
export const HIP_H = BONES.thigh + BONES.shin;

export const POSE_KEYS = ["hx", "hy", "t", "h", "aF", "eF", "aB", "eB", "lF", "kF", "lB", "kB", "wF", "wB", "wl", "rot"];

export const BASE_POSE = { hx: 0, hy: -4, t: 10, h: -6, aF: 48, eF: 76, aB: 26, eB: 100, lF: 30, kF: 34, lB: -14, kB: 24, wF: 30, wB: 30, wl: 1, rot: 0 };

export function pose(p) {
  return { ...BASE_POSE, ...p };
}

export function blendPose(a, b, t, out = {}) {
  for (let i = 0; i < POSE_KEYS.length; i++) {
    const k = POSE_KEYS[i];
    const x = a[k] ?? BASE_POSE[k];
    const y = b[k] ?? BASE_POSE[k];
    out[k] = x + (y - x) * t;
  }
  return out;
}

const RAD = Math.PI / 180;
const ease = (t) => t * t * (3 - 2 * t);

/** keyframes: [[frame, pose], ...] sorted; returns the eased pose at `f`. */
export function samplePose(keys, f, out = {}) {
  if (f <= keys[0][0]) return blendPose(keys[0][1], keys[0][1], 0, out);
  for (let i = 1; i < keys.length; i++) {
    const [f1, p1] = keys[i];
    if (f <= f1) {
      const [f0, p0] = keys[i - 1];
      const t = f1 > f0 ? (f - f0) / (f1 - f0) : 1;
      return blendPose(p0, p1, ease(t), out);
    }
  }
  const last = keys[keys.length - 1][1];
  return blendPose(last, last, 0, out);
}

const pt = () => ({ x: 0, y: 0 });
export function makeJoints() {
  return { hip: pt(), neck: pt(), head: pt(), sh: pt(), elF: pt(), haF: pt(), elB: pt(), haB: pt(), knF: pt(), ftF: pt(), knB: pt(), ftB: pt(), tipF: pt(), butF: pt(), tipB: pt(), butB: pt(), grounded: true };
}

function put(o, x, y) {
  o.x = x;
  o.y = y;
}

/**
 * Solve joints for a pose. `f` facing (+1/-1), (x, y) the fighter's feet
 * origin, `wpn` = { len, back, dual } describing the held weapon(s),
 * `ground` = snap the lowest foot to y (grounded states).
 */
export function solve(p, x, y, f, wpn, ground, J = makeJoints()) {
  const rot = (p.rot || 0) * RAD; // whole-body rotation (flips, knockdowns) around the hip
  const hx = x + p.hx * f;
  const hy = y + HIP_H + p.hy;
  // local helper: direction from straight-down angle a (deg) → world vector
  // `rot` turns the whole body (top toward facing); "down" angles grow the
  // other way round, hence the minus
  const down = (a, len) => {
    const r = a * RAD - rot;
    return [Math.sin(r) * len * f, -Math.cos(r) * len];
  };
  const up = (a, len) => {
    const r = a * RAD + rot;
    return [Math.sin(r) * len * f, Math.cos(r) * len];
  };
  put(J.hip, hx, hy);
  let d = up(p.t, BONES.torso);
  put(J.neck, hx + d[0], hy + d[1]);
  d = up(p.t, BONES.torso - 5);
  put(J.sh, hx + d[0], hy + d[1]);
  d = up(p.t + p.h, BONES.neck + BONES.headR);
  put(J.head, J.neck.x + d[0], J.neck.y + d[1]);
  // arms
  d = down(p.aF, BONES.upper);
  put(J.elF, J.sh.x + d[0], J.sh.y + d[1]);
  d = down(p.aF + p.eF, BONES.fore);
  put(J.haF, J.elF.x + d[0], J.elF.y + d[1]);
  d = down(p.aB, BONES.upper);
  put(J.elB, J.sh.x + d[0], J.sh.y + d[1]);
  d = down(p.aB + p.eB, BONES.fore);
  put(J.haB, J.elB.x + d[0], J.elB.y + d[1]);
  // legs
  d = down(p.lF, BONES.thigh);
  put(J.knF, hx + d[0], hy + d[1]);
  d = down(p.lF - p.kF, BONES.shin);
  put(J.ftF, J.knF.x + d[0], J.knF.y + d[1]);
  d = down(p.lB, BONES.thigh);
  put(J.knB, hx + d[0], hy + d[1]);
  d = down(p.lB - p.kB, BONES.shin);
  put(J.ftB, J.knB.x + d[0], J.knB.y + d[1]);
  // weapons
  const len = (wpn?.len || 0) * (p.wl ?? 1);
  const back = wpn?.back || 0;
  const wa = p.aF + p.eF + p.wF;
  d = down(wa, 1);
  put(J.tipF, J.haF.x + d[0] * len, J.haF.y + d[1] * len);
  put(J.butF, J.haF.x - d[0] * back, J.haF.y - d[1] * back);
  const wb = p.aB + p.eB + p.wB;
  d = down(wb, 1);
  const lenB = wpn?.dual ? len : 0;
  put(J.tipB, J.haB.x + d[0] * lenB, J.haB.y + d[1] * lenB);
  put(J.butB, J.haB.x, J.haB.y);
  J.grounded = ground;
  if (ground) {
    const low = Math.min(J.ftF.y, J.ftB.y, J.knF.y - 6, J.knB.y - 6) - y;
    if (low !== 0) for (const k in J) if (J[k] && typeof J[k] === "object") J[k].y -= low;
  }
  return J;
}

// ------------------------------------------------------------------ capsules
/** Hurt capsules for a solved skeleton: [ax, ay, bx, by, r, part] */
export function hurtCapsules(J, out = []) {
  out.length = 0;
  out.push([J.hip.x, J.hip.y, J.neck.x, J.neck.y, 17, "torso"]);
  out.push([J.head.x, J.head.y, J.head.x, J.head.y, 14, "head"]);
  out.push([J.sh.x, J.sh.y, J.elF.x, J.elF.y, 7, "arm"]);
  out.push([J.elF.x, J.elF.y, J.haF.x, J.haF.y, 7, "arm"]);
  out.push([J.hip.x, J.hip.y, J.knF.x, J.knF.y, 10, "leg"]);
  out.push([J.knF.x, J.knF.y, J.ftF.x, J.ftF.y, 8, "leg"]);
  out.push([J.hip.x, J.hip.y, J.knB.x, J.knB.y, 10, "leg"]);
  out.push([J.knB.x, J.knB.y, J.ftB.x, J.ftB.y, 8, "leg"]);
  return out;
}

/** Striking capsule for a limb name. */
export function strikeCapsule(J, limb) {
  switch (limb) {
    case "handF":
      return [J.elF.x, J.elF.y, J.haF.x, J.haF.y, 9];
    case "handB":
      return [J.elB.x, J.elB.y, J.haB.x, J.haB.y, 9];
    case "footF":
      return [J.knF.x, J.knF.y, J.ftF.x, J.ftF.y, 10];
    case "footB":
      return [J.knB.x, J.knB.y, J.ftB.x, J.ftB.y, 10];
    // weapons strike from the elbow: at point-blank range the hilt and
    // forearm still connect instead of the blade passing the target
    case "weaponF":
      return [J.elF.x, J.elF.y, J.tipF.x, J.tipF.y, 8];
    case "weaponB":
      return [J.elB.x, J.elB.y, J.tipB.x, J.tipB.y, 8];
    case "body":
      return [J.hip.x, J.hip.y, J.neck.x, J.neck.y, 22];
    default:
      return null;
  }
}

function segDist2(ax, ay, bx, by, cx, cy, dx, dy) {
  // squared distance between segments AB and CD
  const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy, wx = ax - cx, wy = ay - cy;
  const a = ux * ux + uy * uy, b = ux * vx + uy * vy, c = vx * vx + vy * vy, d = ux * wx + uy * wy, e = vx * wx + vy * wy;
  const D = a * c - b * b;
  let sN, sD = D, tN, tD = D;
  if (D < 1e-7) {
    sN = 0;
    sD = 1;
    tN = e;
    tD = c;
  } else {
    sN = b * e - c * d;
    tN = a * e - b * d;
    if (sN < 0) {
      sN = 0;
      tN = e;
      tD = c;
    } else if (sN > sD) {
      sN = sD;
      tN = e + b;
      tD = c;
    }
  }
  if (tN < 0) {
    tN = 0;
    if (-d < 0) sN = 0;
    else if (-d > a) sN = sD;
    else {
      sN = -d;
      sD = a;
    }
  } else if (tN > tD) {
    tN = tD;
    if (-d + b < 0) sN = 0;
    else if (-d + b > a) sN = sD;
    else {
      sN = -d + b;
      sD = a;
    }
  }
  const sc = Math.abs(sN) < 1e-7 ? 0 : sN / (sD || 1);
  const tc = Math.abs(tN) < 1e-7 ? 0 : tN / (tD || 1);
  const px = wx + sc * ux - tc * vx;
  const py = wy + sc * uy - tc * vy;
  return px * px + py * py;
}

export function capsuleHit(a, b) {
  const r = a[4] + b[4];
  return segDist2(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]) <= r * r;
}

/** Axis-aligned box vs capsule (projectiles / ground zones). box = {x0,y0,x1,y1} */
export function boxHitsCapsule(box, c) {
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = c[0] + (c[2] - c[0]) * t;
    const y = c[1] + (c[3] - c[1]) * t;
    const cx = Math.max(box.x0, Math.min(box.x1, x));
    const cy = Math.max(box.y0, Math.min(box.y1, y));
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= c[4] * c[4]) return true;
  }
  return false;
}
