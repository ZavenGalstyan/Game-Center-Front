/**
 * Arena Gladiator — the ONE place a fighter's hands and weapons are posed.
 *
 * `handPose(f, side)` returns the hand position + blade/shield direction in
 * fighter-local space for the fighter's current combat state. The engine uses
 * it for weapon hitboxes (swept every sub-step of the ACTIVE phase) and the
 * renderer uses the very same numbers to place the hands (IK) and weapons, so
 * a sword can never hit where it isn't drawn.
 */
import { BODY } from "./constants.js";
import { clamp, easeOut, lerp, smooth, localToWorld, dirToWorld } from "./math.js";

const SH = { R: 1, L: -1 };

/** Local hand pose → { hx,hy,hz (hand), dx,dy,dz (unit dir) } in (r,u,f). */
function resolve(out, side, hy, hp, hd, by, bp) {
  const sx = SH[side] * BODY.shoulderHalf;
  const ch = Math.cos(hp);
  out.hx = sx + Math.sin(hy) * ch * hd;
  out.hy = BODY.shoulderY + Math.sin(hp) * hd;
  out.hz = Math.cos(hy) * ch * hd;
  const cb = Math.cos(bp);
  out.dx = Math.sin(by) * cb;
  out.dy = Math.sin(bp);
  out.dz = Math.cos(by) * cb;
  return out;
}

const tmpA = [0, 0, 0, 0, 0];
const tmpB = [0, 0, 0, 0, 0];
function flat(p, arr) {
  arr[0] = p.h[0];
  arr[1] = p.h[1];
  arr[2] = p.h[2];
  arr[3] = p.b[0];
  arr[4] = p.b[1];
  return arr;
}
function mix(a, b, t, out) {
  for (let i = 0; i < 5; i++) out[i] = lerp(a[i], b[i], t);
  return out;
}

const guardArr = [0, 0, 0, 0, 0];
const blockArr = [0, 0, 0, 0, 0];
const baseArr = [0, 0, 0, 0, 0];
const res = [0, 0, 0, 0, 0];

/** The idle stance pose for one hand, with the guard raised by `f.guardBlend`. */
function stancePose(f, side, out) {
  const W = f.weapon;
  const g = W.guard[side];
  const b = W.block[side];
  if (!g) return null;
  flat(g, guardArr);
  flat(b || g, blockArr);
  mix(guardArr, blockArr, smooth(clamp(f.guardBlend, 0, 1)), out);
  // sprint: weapon lowered and back
  if (f.sprintBlend > 0) {
    const s = f.sprintBlend;
    // weapon arm drops to the hip, blade angled down-forward; the shield swings
    // round to the side of the body (so a running or resting gladiator reads open)
    out[1] = lerp(out[1], -1.15, s * 0.7);
    out[0] = lerp(out[0], side === "R" ? 0.45 : -0.55, s * 0.7);
    out[2] = lerp(out[2], 0.5, s * 0.5);
    if (side === "R") out[4] = lerp(out[4], -0.35, s * 0.6);
    else {
      out[3] = lerp(out[3], -1.35, s * 0.8);
      out[4] = lerp(out[4], -0.1, s * 0.8);
    }
  }
  return out;
}

/**
 * Pose for one hand given the fighter state. Returns a flat array
 * [hy, hp, hd, by, bp] (local angles) or null if the hand holds nothing.
 */
export function handAngles(f, side) {
  const W = f.weapon;
  if (!W.guard[side]) return null;
  const base = stancePose(f, side, baseArr);
  const act = f.act;
  if (act && act.type === "attack" && act.atk.kind !== "kick") {
    const atk = act.atk;
    const k = atk[side];
    if (!k) {
      // off hand during a one-handed attack: tuck toward the body a touch
      return base;
    }
    const w = flat(k.w, tmpA);
    const e = flat(k.e, tmpB);
    // phase from the clock (the hit sampler re-poses at sub-step times)
    const t = act.t;
    if (t < act.startup) {
      const p = clamp(t / act.startup, 0, 1);
      return mix(base, w, easeOut(Math.min(1, p * 1.15)), res);
    }
    if (t <= act.startup + act.active) {
      const p = clamp((t - act.startup) / act.active, 0, 1);
      return mix(w, e, p, res);
    }
    // recovery: hold the follow-through, then settle back into guard
    const p = clamp((t - act.startup - act.active) / act.recovery, 0, 1);
    const q = p < 0.25 ? 0 : smooth((p - 0.25) / 0.75);
    if (act.bounced) {
      // blocked / clashed: the weapon rebounds back toward the wind-up
      const r = Math.sin(Math.min(1, p * 2.2) * Math.PI) * 0.5;
      const mid = mix(e, w, r, tmpA);
      return mix(mid, base, q, res);
    }
    return mix(e, base, q, res);
  }
  if (act && (act.type === "stagger" || act.type === "hurt")) {
    // arms thrown off-line
    const p = clamp(act.t / act.dur, 0, 1);
    const k = Math.sin(Math.min(1, p * 1.6) * Math.PI) * (act.type === "stagger" ? 1 : 0.55);
    res[0] = base[0] + (side === "R" ? 0.6 : -0.6) * k;
    res[1] = base[1] + 0.35 * k;
    res[2] = base[2] - 0.08 * k;
    res[3] = base[3] + (side === "R" ? 0.9 : -0.9) * k;
    res[4] = base[4] + 0.5 * k;
    return res;
  }
  if (act && act.type === "defeated") {
    res[0] = side === "R" ? 0.3 : -0.3;
    res[1] = -1.35;
    res[2] = 0.5;
    res[3] = side === "R" ? 0.4 : -0.4;
    res[4] = -1.0;
    return res;
  }
  if (act && act.type === "attack" && act.atk.kind === "kick") {
    // arms swing back for balance
    const p = clamp(act.t / (act.startup + act.active + act.recovery), 0, 1);
    const k = Math.sin(p * Math.PI);
    res[0] = base[0] + (side === "R" ? 0.3 : -0.2) * k;
    res[1] = base[1] + 0.15 * k;
    res[2] = base[2] - 0.05 * k;
    res[3] = base[3];
    res[4] = base[4] + 0.2 * k;
    return res;
  }
  return base;
}

/** Local pose object for a hand: { hx,hy,hz, dx,dy,dz } or null. */
export function handPose(f, side, out = {}) {
  const a = handAngles(f, side);
  if (!a) return null;
  return resolve(out, side, a[0], a[1], a[2], a[3], a[4]);
}

const lp = {};
const wd = { x: 0, y: 0, z: 0 };
/**
 * World-space hit segment of the blade in `side` hand.
 * Writes into segA / segB (the part that deals damage). Returns false if
 * that hand holds no blade.
 */
export function bladeSegment(f, side, segA, segB, full = false) {
  const bl = f.weapon.blades[side];
  if (!bl) return false;
  if (!handPose(f, side, lp)) return false;
  localToWorld(segA, f.x, f.z, f.yaw, lp.hx, lp.hy, lp.hz);
  dirToWorld(wd, f.yaw, lp.dx, lp.dy, lp.dz);
  const from = bl.grip + bl.length * (full ? 0 : bl.hitFrom);
  const to = bl.grip + bl.length;
  segB.x = segA.x + wd.x * to;
  segB.y = segA.y + wd.y * to;
  segB.z = segA.z + wd.z * to;
  segA.x += wd.x * from;
  segA.y += wd.y * from;
  segA.z += wd.z * from;
  return true;
}

/** World centre of the fighter's shield (or null). */
export function shieldCenter(f, out) {
  if (!f.weapon.shield) return null;
  if (!handPose(f, "L", lp)) return null;
  return localToWorld(out, f.x, f.z, f.yaw, lp.hx + lp.dx * 0.05, lp.hy + lp.dy * 0.05, lp.hz + lp.dz * 0.05);
}

/** Kick foot capsule (world): knee → foot. */
export function kickSegment(f, atk, t, segA, segB) {
  const K = atk.foot;
  const p = clamp((t - atk.startup) / atk.active, 0, 1);
  const r = lerp(K.from[0], K.to[0], p);
  const u = lerp(K.from[1], K.to[1], p);
  const fw = lerp(K.from[2], K.to[2], p);
  localToWorld(segB, f.x, f.z, f.yaw, r, u, fw);
  localToWorld(segA, f.x, f.z, f.yaw, r, u + 0.05, fw * 0.45);
}
