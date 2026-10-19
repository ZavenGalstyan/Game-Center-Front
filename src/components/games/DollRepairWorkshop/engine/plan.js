/**
 * Body plans and face mapping shared by the model builder and the session.
 *
 * A plan is the measured skeleton of a doll type: head centre/radius, the
 * shoulder/hip heights, limb lengths and radii — every socket, crack path,
 * stitch line and paint target is derived from it, so the logic and the
 * picture always agree.
 *
 * Face coordinates: azimuth `az` (0 = straight ahead, + toward the doll's
 * left/+X) and elevation `el` on the head sphere. The paint grid covers
 * FACE.az0..az1 × FACE.el0..el1; SphereGeometry UVs map as
 *   u = 0.25 + az / 2π,  v = 0.5 + el / π.
 */
import { DOLL_TYPES } from "../data/dolls.js";
import { clamp } from "./rng.js";

const TAU = Math.PI * 2;

export function bodyPlan(type) {
  const T = DOLL_TYPES[type] || DOLL_TYPES.porcelain;
  const p = T.prop;
  const kind = T.body;
  if (kind === "teddy") {
    const hr = p.headR;
    return {
      type, kind, hr,
      headC: [0, 0.53, 0.01],
      bodyH: 0.42, bodyR: 0.165,
      shoulderY: 0.36, shoulderX: 0.125, hipY: 0.1, legX: 0.085,
      armLen: 0.19, armR0: 0.05, armR1: 0.042,
      legLen: 0.17, legR0: 0.06, legR1: 0.052,
      chestR: 0.13, waistR: 0.15, hipR: 0.16, neckR: 0.08,
      eyeAz: 0.33, eyeEl: 0.12, eyeR: hr * 0.13,
      height: 0.8,
      stand: false,
      paintable: T.paint,
    };
  }
  const H = p.height;
  const hr = p.headR;
  const headY = H - hr * 1.02;
  const chub = p.chub;
  const neckLen = p.neck;
  const shoulderY = headY - hr * 0.93 - neckLen;
  const torsoFrac = kind === "baby" ? 0.5 : 0.41 + (1 - p.limb) * 0.28;
  const torsoLen = shoulderY * torsoFrac;
  const hipY = shoulderY - torsoLen;
  const chestR = 0.088 * p.slim * (kind === "baby" ? 1.05 : 1);
  const waistR = chestR * (kind === "baby" ? 1.04 : 0.76);
  const hipR = chestR * (kind === "baby" ? 1.02 : 0.96);
  const armR0 = 0.026 * Math.sqrt(p.slim) * (1 + chub * 0.38);
  const legR0 = hipR * 0.5;
  const footH = 0.034;
  return {
    type, kind, hr,
    headC: [0, headY, 0],
    shoulderY,
    hipY,
    torsoLen,
    chestR,
    waistR,
    hipR,
    neckR: hr * (kind === "baby" ? 0.42 : 0.3),
    neckTop: headY - hr * 0.72,
    shoulderX: chestR * 0.98 + armR0 * 0.55,
    armLen: torsoLen * (kind === "baby" ? 0.95 : 1.08) * Math.min(1.1, p.limb),
    armR0,
    armR1: armR0 * (kind === "baby" ? 0.82 : 0.68),
    legX: hipR * 0.5,
    legLen: hipY - footH * 0.85,
    legR0,
    legR1: legR0 * (kind === "baby" ? 0.7 : 0.46),
    footH,
    eyeAz: kind === "baby" ? 0.4 : 0.36,
    eyeEl: kind === "baby" ? -0.08 : -0.02,
    eyeR: hr * (kind === "baby" ? 0.24 : kind === "human" && type === "fashion" ? 0.2 : 0.21),
    height: H,
    stand: true,
    jointed: kind === "puppet" || kind === "bjd",
    paintable: T.paint,
  };
}

/* ------------------------------------------------------------ face grid */
export const FACE = { az0: -0.78, az1: 0.78, el0: -0.66, el1: 0.5, W: 120, H: 90 };

export const uvToAE = (u, v) => ({ az: (u - 0.25) * TAU, el: (v - 0.5) * Math.PI });
export const aeToUV = (az, el) => ({ u: 0.25 + az / TAU, v: 0.5 + el / Math.PI });

/** Paint grid cell for a face az/el (fractional), or null when outside. */
export function aeToCell(az, el) {
  const x = ((az - FACE.az0) / (FACE.az1 - FACE.az0)) * FACE.W;
  const y = ((FACE.el1 - el) / (FACE.el1 - FACE.el0)) * FACE.H;
  if (x < 0 || y < 0 || x >= FACE.W || y >= FACE.H) return null;
  return { x, y };
}
export function cellToAE(x, y) {
  return { az: FACE.az0 + (x / FACE.W) * (FACE.az1 - FACE.az0), el: FACE.el1 - (y / FACE.H) * (FACE.el1 - FACE.el0) };
}

/**
 * Paint-target coverage for a feature at a face point: 1 inside the shape,
 * fading to 0 at the edge. Shapes follow the doll's eye/mouth placement.
 */
export function featureMask(feature, plan, az, el) {
  const eAz = plan.eyeAz;
  const eEl = plan.eyeEl;
  const isCloth = plan.kind === "cloth";
  const isPuppet = plan.kind === "puppet";
  if (feature === "lips") {
    const mEl = eEl - (plan.kind === "baby" ? 0.36 : 0.42);
    if (isCloth) {
      // embroidered smile — a curved band
      const x = az / 0.2;
      if (Math.abs(x) > 1) return 0;
      const yc = mEl + 0.06 * x * x;
      const d = Math.abs(el - yc);
      return clamp(1 - (d - 0.018) / 0.014, 0, 1) * clamp((1 - Math.abs(x)) / 0.12, 0, 1);
    }
    const w = isPuppet ? 0.17 : plan.kind === "baby" ? 0.1 : 0.12;
    const h = isPuppet ? 0.05 : 0.045;
    const x = az / w;
    const y = (el - mEl) / h;
    // full lips: upper bow dips at the centre
    const top = 1 - 0.25 * Math.exp(-x * x * 18);
    const r = x * x + (y > 0 ? (y / top) * (y / top) : y * y * 0.8);
    return clamp((1 - r) / 0.25, 0, 1);
  }
  if (feature === "brows") {
    let best = 0;
    for (const s of [-1, 1]) {
      const cx = s * (eAz + 0.02);
      const x = (az - cx) / 0.15;
      if (Math.abs(x) > 1) continue;
      const yc = eEl + 0.27 + 0.045 * (1 - x * x) - 0.02 * x * s;
      const d = Math.abs(el - yc);
      const thick = 0.022 * (1 - 0.5 * Math.abs(x + s * 0.3));
      best = Math.max(best, clamp(1 - (d - thick) / 0.012, 0, 1) * clamp((1 - Math.abs(x)) / 0.15, 0, 1));
    }
    return best;
  }
  if (feature === "cheeks") {
    let best = 0;
    for (const s of [-1, 1]) {
      const d = Math.hypot((az - s * (eAz + 0.08)) / 1.1, el - (eEl - 0.24));
      best = Math.max(best, clamp(1 - (d - 0.08) / 0.03, 0, 1));
    }
    return best;
  }
  return 0;
}

/** Original paint strength of a feature drawn in the face texture (faded → low). */
export const FADED_ALPHA = 0.12;

/** Torso silhouette [[r, y], …] bottom→top, and its front/back squash. */
export function torsoPoints(plan) {
  if (plan.kind === "teddy") {
    return { pts: [[0.0001, 0.0], [0.12, 0.006], [0.163, 0.07], [0.168, 0.14], [0.152, 0.24], [0.122, 0.33], [0.088, 0.4], [0.07, 0.44]], squash: 0.9 };
  }
  const { hipY, torsoLen, hipR, waistR, chestR, neckR, shoulderY, neckTop, legR0 } = plan;
  const crotch = hipY - legR0 * 0.85;
  const baby = plan.kind === "baby";
  return {
    pts: [
      [0.0001, crotch],
      [hipR * 0.75, crotch + 0.008],
      [hipR * 0.98, hipY],
      [hipR * 0.97, hipY + torsoLen * 0.18],
      [baby ? waistR * 1.05 : waistR, hipY + torsoLen * 0.45],
      [chestR, hipY + torsoLen * 0.75],
      [chestR * 0.93, shoulderY - 0.012],
      [neckR * 1.9, shoulderY + 0.004],
      [neckR * 1.05, shoulderY + 0.018],
      [neckR, neckTop],
    ],
    squash: plan.type === "fashion" ? 0.74 : baby ? 0.86 : 0.8,
  };
}

/** Radius of a [[r,y]] profile at height y (linear between samples). */
export function radiusAt(pts, y) {
  if (y <= pts[0][1]) return pts[0][0];
  for (let i = 1; i < pts.length; i++) {
    if (y <= pts[i][1]) {
      const t = (y - pts[i - 1][1]) / (pts[i][1] - pts[i - 1][1] || 1);
      return pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
    }
  }
  return pts[pts.length - 1][0];
}

export const waistY = (plan) => (plan.kind === "teddy" ? 0.2 : plan.hipY + plan.torsoLen * 0.45);
