/**
 * Street Basketball — the shot model.
 *
 * A shot is NEVER decided by a make/miss roll. The model works like a real
 * shooter:
 *   1. aim     — solve the ballistic launch that would drop the ball centre
 *                through the middle of the rim (or off the glass for a bank);
 *   2. error   — perturb WHERE that launch actually lands, by an amount set by
 *                release timing, distance, movement, contest, fatigue, rating;
 *   3. physics — release the ball with that velocity and let ballPhysics.js
 *                decide: swish, rim-in, rattle-out, front rim, back iron,
 *                glass, airball.
 * So the visual trajectory always IS the result.
 *
 * Release timing (the meter): holding Shoot fills 0 → 1 over METER_TIME.
 * The perfect window sits right after the top of the jump.
 */
import { G, RIM_Y, BOARD_Z, E_BOARD, FRIC_BOARD, ARC_R } from "./constants.js";

export const METER_TIME = 0.7; // seconds to fill the meter
export const PERFECT_CENTER = 0.83;
export const ZONES = {
  early: [0, 0.62],
  good1: [0.62, 0.785],
  perfect: [0.785, 0.875],
  good2: [0.875, 0.94],
  late: [0.94, 1.0001],
};

/** Perfect window gets a little wider with shooting rating (skill still dominates). */
export function perfectWindow(shooting = 5) {
  const extra = (shooting - 5) * 0.0035;
  return [ZONES.perfect[0] - extra, ZONES.perfect[1] + extra];
}

export function meterZone(v, shooting = 5) {
  const [p0, p1] = perfectWindow(shooting);
  if (v >= p0 && v <= p1) return "perfect";
  if (v < ZONES.good1[0]) return "early";
  if (v > ZONES.late[0]) return "late";
  return "good";
}

/** Analytic launch velocity: from p0 through target T at launch angle theta. Null if impossible. */
export function launchTo(p0, T, theta) {
  const dx = T.x - p0.x;
  const dz = T.z - p0.z;
  const d = Math.hypot(dx, dz);
  const h = T.y - p0.y;
  const c = Math.cos(theta);
  const denom = 2 * c * c * (d * Math.tan(theta) - h);
  if (denom <= 1e-6 || d < 1e-4) return null;
  const v = Math.sqrt((G * d * d) / denom);
  const vh = v * c;
  return { x: (vh * dx) / d, y: v * Math.sin(theta), z: (vh * dz) / d, speed: v };
}

/** Launch angle that looks like basketball: higher and softer up close. */
export function arcAngle(dist, kind = "jump") {
  if (kind === "layup") return (64 - Math.min(dist, 2) * 3) * (Math.PI / 180);
  const deg = dist < 1.5 ? 58 : dist < 3 ? 55 - (dist - 1.5) * 1.3 : 53 - Math.min(4, dist - 3) * 0.9;
  return deg * (Math.PI / 180);
}

/**
 * Glass solver for bank shots: aims at a point on the backboard and iterates
 * with a board-only ball flight until the rebound drops through the rim
 * centre. Returns the launch velocity (or null to fall back to a direct shot).
 */
export function solveBank(p0, theta, rimTarget = { x: 0, y: RIM_Y, z: 0 }) {
  // initial guess: mirror image of the rim behind the glass
  const aim = { x: rimTarget.x * 0.55 + p0.x * 0.0, y: RIM_Y + 0.42, z: BOARD_Z + 0.02 };
  aim.x = rimTarget.x + (p0.x - rimTarget.x) * -0.35; // opposite-side lead on the glass
  let best = null;
  for (let it = 0; it < 14; it++) {
    const v = launchTo(p0, aim, theta);
    if (!v) return null;
    const cross = flyBoardOnly(p0, v);
    if (!cross) {
      aim.y -= 0.08;
      continue;
    }
    const ex = cross.x - rimTarget.x;
    const ez = cross.z - rimTarget.z;
    best = { v, err: Math.hypot(ex, ez), hitBoard: cross.hitBoard };
    if (best.err < 0.004) break;
    aim.x -= ex * 0.9;
    // landing too far out (+z) → rebound too strong → aim higher on the glass
    aim.y += ez * 0.9;
  }
  if (!best || best.err > 0.05 || !best.hitBoard) return null;
  return best.v;
}

/** Gravity + backboard plane only; first downward crossing of the rim plane. */
function flyBoardOnly(p0, v0) {
  const p = { ...p0 };
  const v = { x: v0.x, y: v0.y, z: v0.z };
  const dt = 1 / 480;
  let hitBoard = false;
  for (let i = 0; i < 1600; i++) {
    const py = p.y;
    v.y -= G * dt;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;
    if (!hitBoard && p.z < BOARD_Z + 0.12 && p.y > 2.9 && Math.abs(p.x) < 0.9 && v.z < 0) {
      p.z = BOARD_Z + 0.12;
      v.z = -v.z * E_BOARD;
      v.x *= FRIC_BOARD;
      v.y *= FRIC_BOARD;
      hitBoard = true;
    }
    if (py >= RIM_Y && p.y < RIM_Y && v.y < 0) {
      const f = (py - RIM_Y) / (py - p.y);
      return { x: p.x - v.x * dt * (1 - f), z: p.z - v.z * dt * (1 - f), hitBoard };
    }
    if (p.y < 0) return null;
  }
  return null;
}

/** Bank zone: angled mid-close looks off the glass. */
export function wantsBank(from, kind) {
  const d = Math.hypot(from.x, from.z);
  const ang = Math.abs(Math.atan2(from.x, Math.max(0.01, from.z))) * (180 / Math.PI);
  if (kind === "layup") return d > 0.5 && ang > 32 && ang < 72;
  return d > 1.9 && d < 3.9 && ang > 36 && ang < 58;
}

/**
 * Spread of the landing point at the rim (metres, 1σ) along the shot line
 * ("depth": short/long) and across it ("lateral": left/right).
 */
export function shotSpread(ctx) {
  const { zone, meter, dist, speed, contest, stamina, rating, kind, perfectCenter = PERFECT_CENTER } = ctx;
  let base = zone === "perfect" ? 0.034 : zone === "good" ? 0.075 : 0.11;
  if (kind === "layup") base = 0.105; // soft layups are forgiving: ~85% open, less at a sprint or contested
  if (kind === "dunk") base = 0;
  const distF = 1 + 0.085 * Math.max(0, dist - 1.5) + (dist > ARC_R ? 0.06 : 0);
  const moveF = 1 + Math.min(1.4, speed * 0.24);
  const contestF = 1 + contest * (kind === "layup" ? 1.2 : 1.6);
  const tiredF = 1 + Math.max(0, 0.5 - stamina) * 0.35;
  const ratingF = 1.16 - (rating - 1) * 0.034; // 1 → 1.16, 10 → 0.85
  const depth = base * distF * moveF * contestF * tiredF * ratingF;
  // timing bias: early releases drop short, late ones sail long (not for layups)
  let bias = 0;
  if (kind === "jump" && typeof meter === "number") {
    const off = meter - perfectCenter;
    if (zone === "early") bias = off * 0.85; // negative → short
    else if (zone === "late") bias = off * 2.5;
    else if (zone === "good") bias = off * 0.35;
  }
  return { depth, lateral: depth * 0.62, bias };
}

/**
 * Plan a release: returns { v (launch velocity), target, bank, spread }.
 * `rng` supplies the gaussians; everything else is deterministic.
 */
export function planShot(ctx, rng) {
  const { from, kind } = ctx;
  const dist = Math.hypot(from.x, from.z);
  const spread = shotSpread({ ...ctx, dist });
  const dirx = -from.x / (dist || 1);
  const dirz = -from.z / (dist || 1);
  // along the shot line: +depth = long (further from the shooter)
  const eDepth = spread.bias + rng.gauss() * spread.depth;
  const eLat = rng.gauss() * spread.lateral;
  const target = {
    x: dirx * eDepth + dirz * eLat,
    y: RIM_Y,
    z: dirz * eDepth - dirx * eLat,
  };
  const theta = arcAngle(dist, kind === "layup" ? "layup" : "jump");
  let v = null;
  let bank = false;
  if (wantsBank(from, kind)) {
    v = solveBank(from, theta, target);
    bank = !!v;
  }
  if (!v) v = launchTo(from, target, theta);
  // release point already high and tight to the rim: go steeper until it solves
  for (let k = 1; !v && k <= 6; k++) v = launchTo(from, target, Math.min(1.45, theta + k * 0.1));
  if (!v) {
    // basically on top of the target: a soft flip up and over
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    v = { x: dx * 1.6, y: 2.2, z: dz * 1.6 };
  }
  return { v, target, bank, spread, eDepth, eLat };
}
