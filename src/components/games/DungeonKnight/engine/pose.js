/**
 * Dungeon Knight — the ONE place the knight's sword and shield are posed.
 *
 * Every step the engine writes the sword hand + blade direction and the shield
 * hand + facing into the player (local r/u/f frame, see math.js). The renderer
 * places the hands (two-bone IK) and the meshes from exactly these numbers,
 * and the hit test sweeps exactly this blade — so the sword can only hurt
 * where it is drawn.
 *
 * Outside an attack the pose eases toward a stance target (guard / block /
 * run / dodge / potion …). Inside an attack it is a keyed sweep (config.js
 * ATTACKS) that starts from wherever the sword was, winds up, slashes through
 * the ACTIVE window and settles back.
 */
import { ATTACKS } from "./config.js";
import { clamp, easeOut, lerp, smooth } from "./math.js";

/** Knight body constants shared with the renderer (local frame, metres). */
export const BODY = { shoulderY: 1.42, shoulderHalf: 0.22, upperArm: 0.34, foreArm: 0.32, hipY: 0.98 };
const HAND_R = 0.42;
const SHO = [0, 0, 0];
export const twistFor = (ang) => clamp(ang * 0.38, -0.62, 0.62);
/** Shoulder position (side +1 = sword/right, −1 = shield/left) for a chest twisted by `tw` (+ = toward the right). */
export function shoulderAt(side, tw, out) {
  const r = side * BODY.shoulderHalf;
  const f = 0.02;
  out[0] = r * Math.cos(tw) + f * Math.sin(tw);
  out[1] = BODY.shoulderY;
  out[2] = -r * Math.sin(tw) + f * Math.cos(tw);
  return out;
}

const tmpH = [0, 0, 0];
const tmpD = [0, 0, 0];

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  v[0] /= l;
  v[1] /= l;
  v[2] /= l;
  return v;
}
function set(v, a, b, c) {
  v[0] = a;
  v[1] = b;
  v[2] = c;
  return v;
}
function mixInto(out, a, b, t) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
  return out;
}

/** Stance targets (local r, u, f) for the sword hand / blade dir and shield hand / normal. */
export function stanceTarget(p, out) {
  const st = p.stance;
  const H = out.sH;
  const D = out.sD;
  const SH = out.hH;
  const SN = out.hN;
  if (st === "block" || st === "blockHit") {
    set(H, 0.34, 1.0, 0.02);
    set(D, 0.12, 0.92, 0.38);
    set(SH, -0.08, 1.22 + (st === "blockHit" ? 0.04 : 0), st === "blockHit" ? 0.36 : 0.46);
    set(SN, 0.05, 0.05, 1);
  } else if (st === "run") {
    set(H, 0.34, 0.92, 0.12);
    set(D, 0.18, -0.38, 0.9);
    set(SH, -0.36, 0.98, 0.08);
    set(SN, -0.8, 0.0, 0.55);
  } else if (st === "dodge") {
    set(H, 0.22, 0.72, 0.3);
    set(D, 0.1, -0.2, 1);
    set(SH, -0.2, 0.8, 0.3);
    set(SN, -0.4, 0.1, 0.9);
  } else if (st === "hurt") {
    set(H, 0.42, 1.0, -0.05);
    set(D, 0.4, 0.6, -0.2);
    set(SH, -0.38, 1.0, 0.1);
    set(SN, -0.7, 0.3, 0.6);
  } else if (st === "potion") {
    set(H, 0.38, 0.92, 0.1);
    set(D, 0.2, -0.5, 0.85);
    set(SH, -0.36, 0.95, 0.06);
    set(SN, -0.85, 0.0, 0.5);
  } else if (st === "interact") {
    set(H, 0.36, 0.95, 0.06);
    set(D, 0.15, -0.45, 0.85);
    set(SH, -0.26, 1.0, 0.4);
    set(SN, -0.3, 0.2, 0.9);
  } else if (st === "victory") {
    set(H, 0.3, 1.95, 0.2);
    set(D, 0.04, 1, 0.12);
    set(SH, -0.36, 1.05, 0.12);
    set(SN, -0.7, 0.0, 0.7);
  } else if (st === "defeated") {
    set(H, 0.4, 0.5, 0.3);
    set(D, 0.4, -0.3, 0.8);
    set(SH, -0.4, 0.55, 0.2);
    set(SN, -0.5, 0.5, 0.5);
  } else {
    // guard (idle / walk): sword ready, point up-forward; shield across the body
    set(H, 0.3, 1.0, 0.3);
    set(D, 0.1, 0.62, 0.78);
    set(SH, -0.3, 1.04, 0.3);
    set(SN, -0.45, 0.0, 0.9);
  }
  norm(D);
  norm(SN);
  return out;
}

/**
 * The slash pose for an attack at time t. Returns { H, D } into the provided
 * arrays (local frame). `act` = { name, t, su, ac, re, tilt, fromH, fromD }.
 */
export function slashPose(act, t, H, D) {
  const A = ATTACKS[act.name];
  const { su, ac, re } = act;
  let ang;
  let k;
  let blendIn = 1;
  let blendOut = 0;
  if (t < su) {
    k = clamp(t / su, 0, 1);
    ang = lerp(A.from, A.wind, easeOut(k));
    blendIn = smooth(k / 0.55);
    k = 0;
  } else if (t < su + ac) {
    const s = clamp((t - su) / ac, 0, 1);
    k = s * s * (3 - 2 * s);
    ang = lerp(A.wind, A.a1, k);
  } else {
    const r = clamp((t - su - ac) / re, 0, 1);
    k = 1;
    ang = lerp(A.a1, A.end, easeOut(Math.min(1, r * 2.2)));
    blendOut = smooth((r - 0.38) / 0.62);
  }
  if (A.kind === "h") {
    // diagonal horizontal slash: the chest twists with the swing and the hand
    // circles the (twisted) sword shoulder, so the arm can always reach it.
    // Height + pitch run from the start of the sweep to its end; the aim tilt
    // bends the plane toward low (slime) or high (bat) targets.
    const p0 = A === ATTACKS.light1 ? 0.38 : -0.5;
    const p1 = A === ATTACKS.light1 ? -0.62 : 0.28;
    const h0 = A === ATTACKS.light1 ? 1.36 : 1.0;
    const h1 = A === ATTACKS.light1 ? 0.98 : 1.3;
    const pitch = lerp(p0, p1, k) + act.tilt;
    const hy = clamp(lerp(h0, h1, k) + act.tilt * 0.35, 0.94, 1.7); // the arm can't drop further: the blade pitch does the rest
    const tw = twistFor(ang);
    shoulderAt(1, tw, SHO);
    set(H, SHO[0] + Math.sin(ang) * HAND_R, hy, SHO[2] + Math.cos(ang) * HAND_R);
    const cp = Math.cos(pitch);
    set(D, Math.sin(ang) * cp, Math.sin(pitch), Math.cos(ang) * cp);
    act.twist = tw * blendIn * (1 - blendOut);
  } else {
    // vertical overhead: the hand rises over the shoulder and chops down the centre line
    const p = ang + act.tilt * 0.5;
    set(H, 0.12 - 0.08 * Math.sin(p), 1.3 + Math.sin(p) * 0.44, 0.16 + Math.cos(p) * 0.44);
    set(D, -0.06, Math.sin(p), Math.cos(p));
    act.twist = 0;
  }
  norm(D);
  if (blendIn < 1) {
    mixInto(H, act.fromH, H, blendIn);
    mixInto(D, act.fromD, D, blendIn);
    norm(D);
  }
  return blendOut;
}

/**
 * Advance the knight's pose one step. Attacks set the pose exactly; every
 * other stance is approached with a fast exponential ease (so the rendered
 * arms never pop) — the same numbers are drawn and hit-tested.
 */
const stanceOut = { sH: [0, 0, 0], sD: [0, 0, 0], hH: [0, 0, 0], hN: [0, 0, 0] };
export function updatePose(p, dt) {
  stanceTarget(p, stanceOut);
  const act = p.act;
  const k = 1 - Math.exp(-(p.stance === "block" || p.stance === "blockHit" ? 26 : 16) * dt);
  if (act && act.type === "attack") {
    const out = slashPose(act, act.t, tmpH, tmpD);
    if (out > 0) {
      mixInto(tmpH, tmpH, stanceOut.sH, out);
      mixInto(tmpD, tmpD, stanceOut.sD, out);
      norm(tmpD);
    }
    p.swordH[0] = tmpH[0];
    p.swordH[1] = tmpH[1];
    p.swordH[2] = tmpH[2];
    p.swordD[0] = tmpD[0];
    p.swordD[1] = tmpD[1];
    p.swordD[2] = tmpD[2];
    p.twist = act.twist || 0;
    // shield tucks in to the chest while swinging
    const sk = 1 - Math.exp(-14 * dt);
    mixInto(p.shieldH, p.shieldH, [-0.3, 1.1, 0.16], sk);
    mixInto(p.shieldN, p.shieldN, [-0.7, 0.0, 0.7], sk);
    norm(p.shieldN);
  } else {
    p.twist = (p.twist || 0) * (1 - k);
    mixInto(p.swordH, p.swordH, stanceOut.sH, k);
    mixInto(p.swordD, p.swordD, stanceOut.sD, k);
    norm(p.swordD);
    mixInto(p.shieldH, p.shieldH, stanceOut.hH, k);
    mixInto(p.shieldN, p.shieldN, stanceOut.hN, k);
    norm(p.shieldN);
  }
}

/** Sword pose at an arbitrary time inside the current attack (blade sub-sampling). */
export function attackPoseAt(act, t, H, D) {
  const out = slashPose(act, t, H, D);
  return out;
}

export const BLADE_SAMPLES = 7;
