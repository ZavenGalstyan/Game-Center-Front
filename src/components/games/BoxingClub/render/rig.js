/**
 * Boxing Club — fighter rig. Turns the engine's fighter state into joint
 * positions (metres, fighter-local: +x = the way the fighter faces, +y up,
 * +z toward the camera). Pure maths; the painter (fighterArt.js) draws it.
 *
 * Glove placement uses the SAME reach numbers as hit detection:
 * the glove extends to `attack.reach − hurtbox front` at full extension, and
 * on contact it stops at the opponent's surface (slightly compressed). So a
 * punch that visibly falls short can never have landed, and every landed
 * punch shows the glove on the target.
 *
 * Feet are planted in WORLD space and take discrete steps (lift + arc) when
 * the body drifts from them — fighters never slide across the canvas.
 */
import { ATTACKS, DODGE } from "../engine/attacks.js";

export const GLOVE_R = 0.1;
export const HURT_FRONT = { head: 0.13, body: 0.16 };
const UPPER = 0.35;
const FORE = 0.35;
const THIGH = 0.45;
const SHIN = 0.44;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const smooth = (t) => t * t * (3 - 2 * t);

/** Per-fighter animation memory (render side only). */
export function createAnim(f) {
  const lead = { home: 0.25, x: f.x + f.facing * 0.25, lift: 0, from: 0, to: 0, t: -1 };
  const rear = { home: -0.24, x: f.x - f.facing * 0.24, lift: 0, from: 0, to: 0, t: -1 };
  return { lead, rear, crouch: 0, lean: 0.1, twist: 0, headTilt: 0, headBack: 0, bodyCrunch: 0, hipShift: 0, down: 0, lastState: f.state, stepSound: 0, blockPose: 0 };
}

/** Advance footwork + smoothed pose parameters. Returns true when a step lands (for a footstep sound). */
export function updateAnim(anim, f, dt, reduced) {
  let landed = false;
  const k = (ms) => 1 - Math.exp(-dt / ms);
  // ---- feet: step when the body has drifted from a planted foot
  const feet = [anim.lead, anim.rear];
  const moving = f.state !== "down";
  for (const [i, foot] of feet.entries()) {
    const home = f.x + f.facing * foot.home;
    if (foot.t >= 0) {
      foot.t += dt;
      const p = clamp(foot.t / 150, 0, 1);
      foot.x = lerp(foot.from, foot.to, smooth(p));
      foot.lift = Math.sin(p * Math.PI) * 0.055;
      if (p >= 1) {
        foot.t = -1;
        foot.lift = 0;
        landed = true;
      }
    } else if (moving) {
      const other = feet[1 - i];
      const off = home - foot.x;
      if (Math.abs(off) > 0.1 && other.t < 0) {
        // step slightly past home in the direction of travel (natural gait)
        foot.from = foot.x;
        foot.to = home + Math.sign(off) * Math.min(0.06, Math.abs(off) * 0.3);
        foot.t = 0;
      }
    }
  }
  // ---- smoothed body parameters
  const a = f.attack;
  let crouch = 0.02;
  let lean = 0.1;
  let twist = 0;
  let hipShift = 0;
  let headBack = 0;
  let headTilt = 0;
  let crunch = 0;
  let block = 0;
  if (f.state === "block") {
    crouch = 0.05;
    lean = 0.14;
    block = 1;
  }
  if (f.state === "attack" && a) {
    const e = extension(a);
    if (a.def.kind === "straight") {
      lean = 0.1 + (a.def.hand === "rear" ? 0.26 : 0.16) * e;
      twist = (a.def.hand === "rear" ? 1 : 0.35) * e;
      hipShift = 0.05 * e;
      if (a.def.target === "body") crouch = 0.14 * e;
      if (a.whiff && a.t > a.su + a.ac) lean += 0.08; // over-reached
    } else {
      lean = 0.12 + 0.12 * e;
      twist = (a.def.hand === "rear" ? 0.8 : -0.5) * e;
      headTilt = (a.def.hand === "rear" ? 0.1 : -0.1) * e;
      if (a.def.target === "body") crouch = 0.16 * e;
    }
  }
  if (f.state === "dodge" && f.dodge) {
    const p = clamp(f.dodge.t / DODGE.duration, 0, 1);
    const env = Math.sin(Math.min(1, p * 1.25) * Math.PI);
    if (f.dodge.dir === "back") {
      lean = 0.1 - 0.42 * env;
      hipShift = -0.1 * env;
      crouch = 0.04;
    } else {
      crouch = 0.24 * env;
      lean = 0.1 + 0.38 * env;
      headTilt = 0.18 * env;
    }
  }
  if (f.react) {
    const p = f.react.t / f.react.dur;
    const env = p < 0.18 ? p / 0.18 : 1 - (p - 0.18) / 0.82;
    const s = f.react.strength * (reduced ? 0.7 : 1);
    if (f.react.kind === "body") {
      crunch = 0.35 * env * s;
      crouch += 0.08 * env * s;
      hipShift = -0.06 * env * s;
    } else if (f.react.kind === "block") {
      headBack = 0.08 * env * s;
      block = 1;
    } else if (f.react.kind === "heavy") {
      headTilt = (f.react.side === "rear" ? -0.75 : 0.75) * env * s;
      headBack = 0.24 * env * s;
      lean = 0.1 - 0.16 * env * s;
      hipShift = -0.04 * env * s;
    } else {
      headBack = (f.react.kind === "medium" ? 0.42 : 0.26) * env * s;
      lean = 0.1 - (f.react.kind === "medium" ? 0.24 : 0.12) * env * s;
      hipShift = -(f.react.kind === "medium" ? 0.05 : 0.02) * env * s;
    }
  }
  if (f.telegraph) {
    // wind-up: shoulder cocks back (readable tell)
    twist = -0.35;
    lean = 0.04;
  }
  if (f.state === "neutral" && f.stamina < 12) {
    crouch += 0.05;
    lean += 0.08;
  }
  const kk = k(f.state === "attack" || f.react ? 35 : 80);
  anim.crouch += (crouch - anim.crouch) * kk;
  anim.lean += (lean - anim.lean) * kk;
  anim.twist += (twist - anim.twist) * k(30);
  anim.hipShift += (hipShift - anim.hipShift) * kk;
  anim.headBack += (headBack - anim.headBack) * k(25);
  anim.headTilt += (headTilt - anim.headTilt) * k(30);
  anim.bodyCrunch += (crunch - anim.bodyCrunch) * k(30);
  anim.blockPose += (block - anim.blockPose) * k(45);
  // knockdown fall / get up
  let down = 0;
  if (f.state === "down" && f.down) {
    if (f.down.phase === "fall") down = easeOut(clamp(f.down.t / 600, 0, 1));
    else if (f.down.phase === "floor") down = 1;
    else if (f.down.phase === "getup") down = 1 - smooth(clamp(f.down.t / 750, 0, 1));
  }
  anim.down = down;
  return landed;
}

/** 0→1 glove extension over the attack's life (snap out, hold, return). */
export function extension(a) {
  const t = a.t;
  if (t < a.su) {
    const p = t / a.su;
    // cock slightly back first (the tell), then whip out
    return p < 0.3 ? -0.12 * (p / 0.3) : -0.12 + 1.12 * Math.pow((p - 0.3) / 0.7, 1.6);
  }
  if (t < a.su + a.ac) return 1;
  const p = clamp((t - a.su - a.ac) / (a.rc + a.extra), 0, 1);
  return 1 - easeOut(p);
}

/* ------------------------------------------------------------------ IK */

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => {
  const l = len(a) || 1;
  return mul(a, 1 / l);
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

/** Two-bone IK: joint between root and target, bending toward `pole`. */
function ik(root, target, l1, l2, pole) {
  let d = sub(target, root);
  let dist = len(d);
  const maxD = (l1 + l2) * 0.999;
  if (dist > maxD) {
    target = add(root, mul(d, maxD / dist));
    d = sub(target, root);
    dist = maxD;
  }
  const dir = norm(d);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let pv = sub(pole, mul(dir, dot(pole, dir)));
  if (len(pv) < 1e-4) pv = { x: 0, y: -1, z: 0 };
  pv = norm(pv);
  return { joint: add(add(root, mul(dir, a)), mul(pv, h)), end: target };
}

/* ---------------------------------------------------------------- pose */

/**
 * Full pose. `dist` = centre distance to the opponent (for glove contact).
 * Returns joints in fighter-local coords + a list of the parts' z for ordering.
 */
export function computePose(f, anim, dist, time, look = {}) {
  const facing = f.facing;
  const leadZ = -0.13 * facing;
  const rearZ = 0.13 * facing;
  const build = look.build ?? 1;
  const breathe = Math.sin(f.breath * 2.2 * Math.PI) * 0.006;
  const idle = f.state === "neutral" || f.state === "block" || f.state === "frozen";
  const bounce = idle && anim.down === 0 ? Math.abs(Math.sin(time * 5.4 + (facing > 0 ? 0 : 1.3))) * 0.018 : 0;
  const sway = idle ? Math.sin(time * 2.7 + (facing > 0 ? 0.5 : 2)) * 0.02 : 0;

  const hip = { x: -0.01 + anim.hipShift + sway, y: 0.9 - anim.crouch + bounce + breathe, z: 0 };
  const lean = anim.lean + anim.bodyCrunch * 0.7;
  const spine = 0.52;
  const chest = { x: hip.x + Math.sin(lean) * spine * 0.55, y: hip.y + Math.cos(lean) * spine * 0.55, z: 0 };
  const neck = { x: hip.x + Math.sin(lean) * spine, y: hip.y + Math.cos(lean) * spine, z: 0 };
  const headLean = lean * 0.5 - anim.headBack;
  const head = {
    x: neck.x + Math.sin(headLean) * 0.15 + 0.035,
    y: neck.y + Math.cos(headLean) * 0.15,
    z: anim.headTilt * 0.12 * facing,
  };

  // shoulders: twist brings the rear shoulder forward (cross) or back (wind-up)
  const tw = anim.twist;
  const sh = { x: neck.x - 0.01, y: neck.y - 0.055, z: 0 };
  const leadSh = { x: sh.x + 0.05 - Math.max(0, tw) * 0.05 + Math.max(0, -tw) * 0.08, y: sh.y, z: leadZ * 1.25 * build };
  const rearSh = { x: sh.x - 0.07 + Math.max(0, tw) * 0.15 - Math.max(0, -tw) * 0.04, y: sh.y - 0.005, z: rearZ * 1.25 * build * (1 - Math.max(0, tw) * 0.45) };

  // ---- gloves
  const guardBob = idle ? Math.sin(time * 4.1 + (facing > 0 ? 0 : 2)) * 0.012 : 0;
  const bp = anim.blockPose;
  const guardLead = { x: lerp(0.34, 0.27, bp), y: lerp(neck.y + 0.0, neck.y + 0.12, bp) + guardBob, z: lerp(leadZ * 0.7, leadZ * 0.25, bp) };
  const guardRear = { x: lerp(0.19, 0.25, bp), y: lerp(neck.y - 0.02, neck.y + 0.09, bp) - guardBob, z: lerp(rearZ * 0.45, rearZ * 0.25, bp) };
  let gl = guardLead;
  let gr = guardRear;
  let poleL = { x: -0.2, y: -1, z: leadZ * 2 };
  let poleR = { x: -0.2, y: -1, z: rearZ * 2 };

  const a = f.attack;
  if (f.state === "attack" && a) {
    const def = a.def;
    const e = extension(a);
    const target = def.target;
    const surface = HURT_FRONT[target];
    // how far the glove centre goes: full reach, or the opponent's surface on contact
    const touching = (a.hit || a.blocked) && dist <= def.reach + 0.02;
    const reachX = (touching ? Math.min(def.reach, dist) : def.reach) - surface - GLOVE_R * (touching ? 0.2 : 0.35);
    const ty = target === "head" ? 1.58 - anim.crouch * 0.6 : 1.15 - anim.crouch * 0.4;
    const hand = def.hand === "lead" ? "lead" : "rear";
    const base = hand === "lead" ? guardLead : guardRear;
    const sideZ = hand === "lead" ? leadZ : rearZ;
    let g;
    if (def.kind === "straight") {
      const ee = Math.max(e, -0.2);
      g = {
        x: lerp(base.x, reachX, Math.max(0, ee)) + Math.min(0, ee) * 0.4,
        y: lerp(base.y, ty, Math.max(0, ee)),
        z: lerp(base.z, sideZ * 0.15, Math.max(0, ee)),
      };
    } else {
      // hook: glove swings round from the side, elbow up, in a flat arc
      const ang = Math.max(0, e);
      const swing = Math.cos(ang * Math.PI * 0.5);
      g = {
        x: lerp(base.x - 0.05, reachX, ang),
        y: lerp(base.y, ty, ang),
        z: sideZ * (0.2 + 2.4 * swing * Math.min(1, ang * 3 + 0.3)),
      };
      if (e < 0) g.x += e * 0.4;
    }
    if (hand === "lead") {
      gl = g;
      if (def.kind === "hook") poleL = { x: -0.1, y: 0.35, z: leadZ * 3 };
    } else {
      gr = g;
      if (def.kind === "hook") poleR = { x: -0.1, y: 0.35, z: rearZ * 3 };
    }
  }
  if (f.state === "down" || anim.down > 0) {
    // arms drop, guard gone
    const k = anim.down;
    gl = { x: lerp(gl.x, 0.05, k), y: lerp(gl.y, hip.y - 0.1, k), z: gl.z };
    gr = { x: lerp(gr.x, -0.05, k), y: lerp(gr.y, hip.y - 0.12, k), z: gr.z };
  }
  if (look.pose === "win") {
    gl = { x: 0.12, y: head.y + 0.42, z: leadZ * 1.5 };
    gr = { x: -0.05, y: head.y + 0.45, z: rearZ * 1.5 };
    poleL = { x: 0.3, y: 0, z: leadZ * 3 };
    poleR = { x: 0.3, y: 0, z: rearZ * 3 };
  } else if (look.pose === "lose") {
    gl = { x: 0.2, y: hip.y + 0.05, z: leadZ };
    gr = { x: 0.1, y: hip.y, z: rearZ };
  }

  const armL = ik(leadSh, gl, UPPER, FORE, poleL);
  const armR = ik(rearSh, gr, UPPER, FORE, poleR);

  // ---- legs (feet are world-planted; convert to local)
  const footLocal = (foot) => ({ x: (foot.x - f.x) * facing, y: 0.04 + foot.lift, z: 0 });
  const lf = footLocal(anim.lead);
  lf.z = leadZ * 0.9;
  const rf = footLocal(anim.rear);
  rf.z = rearZ * 0.9;
  const hipL = { x: hip.x + 0.02, y: hip.y - 0.02, z: leadZ * 0.7 * build };
  const hipR = { x: hip.x - 0.03, y: hip.y - 0.02, z: rearZ * 0.7 * build };
  const legL = ik(hipL, lf, THIGH, SHIN, { x: 1, y: 0.1, z: 0 });
  const legR = ik(hipR, rf, THIGH, SHIN, { x: 1, y: 0.1, z: 0 });

  return {
    facing, hip, chest, neck, head, leadSh, rearSh, leadZ, rearZ,
    elbowL: armL.joint, gloveL: armL.end, elbowR: armR.joint, gloveR: armR.end,
    hipL, hipR, kneeL: legL.joint, footL: legL.end, kneeR: legR.joint, footR: legR.end,
    lean, down: anim.down, headTilt: anim.headTilt,
  };
}
