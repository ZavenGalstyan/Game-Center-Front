/**
 * Zombie Outbreak — body pose + hit volumes.
 *
 * The skeleton (all in the zombie's local frame, model faces +Z):
 *
 *   root      (x, rootY, z), rotation.y = yaw, uniform scale s
 *   └ hips    (0, hipY, 0), rotation (lean, 0, roll)      ← spine pivot
 *       ├ torso   centred (0, torsoLen/2, 0)
 *       ├ neck    (0, torsoLen, 0), rotation (headPitch, 0, headRoll)
 *       │   └ head (0, headR*1.05, headR*0.15)
 *       └ arms    (±shoulder, torsoLen*0.86, 0), rotation (pitch, 0, ±spread), elbow
 *   └ legs    (±hipW, hipY, 0), rotation (swing), knee
 *
 * computePose() turns a zombie's animation state into those numbers once per
 * engine step. three/ZombieRig applies exactly the same numbers to its
 * meshes, and hitVolumes() runs the same transform chain in plain math — so
 * a headshot is a hit on the head you can see, whatever the animation is
 * doing (lunging, staggering, rising out of the ground or falling over).
 */
import { clamp } from "./math.js";

export function newPose() {
  return {
    rootY: 0,
    hipY: 0.9,
    lean: 0,
    roll: 0,
    headPitch: 0,
    headRoll: 0,
    jaw: 0,
    glow: 0,
    armL: { p: 0, s: 0, e: 0 },
    armR: { p: 0, s: 0, e: 0 },
    legL: { p: 0, k: 0 },
    legR: { p: 0, k: 0 },
  };
}

const ease = (t) => t * t * (3 - 2 * t);

/** Fills z.pose from z.anim / z.def.rig. Pure function of state. */
export function computePose(z) {
  const P = z.pose;
  const A = z.anim;
  const rig = z.rig;
  const v = z.variant;
  const ph = A.phase;
  const mv = A.move;
  const rn = A.run;
  const gait = z.def.gait;
  const t = A.time;

  // ---------------------------------------------------------- locomotion
  let lean = rig.hunch + rn * 0.25;
  let roll = 0;
  let hipY = rig.legLen;
  let headPitch = -rig.hunch * 0.7 + v.headTilt * 0.3;
  let headRoll = v.headTilt;
  const sw = Math.sin(ph);
  const cw = Math.cos(ph);
  let legSwing = 0.42 * mv + 0.5 * rn;
  let legLp = sw * legSwing;
  let legRp = -sw * legSwing;
  let legLk = Math.max(0, -cw) * (0.5 * mv + 0.7 * rn);
  let legRk = Math.max(0, cw) * (0.5 * mv + 0.7 * rn);
  if (v.limp && gait !== "run") {
    legRp *= 0.4;
    legRk *= 0.3;
    roll += Math.max(0, sw) * 0.12 * mv;
  }
  hipY -= Math.abs(cw) * 0.03 * (mv + rn) + rn * 0.06;

  // Arms: classic reach-forward for shamblers, pumping for runners.
  let aLp;
  let aRp;
  let aLe;
  let aRe;
  let aLs = 0.12;
  let aRs = 0.12;
  if (gait === "run") {
    aLp = -0.35 - sw * 0.9 * (mv + rn) * 0.6;
    aRp = -0.35 + sw * 0.9 * (mv + rn) * 0.6;
    aLe = -1.0;
    aRe = -1.0;
    aLs = 0.25;
    aRs = 0.25;
  } else if (v.armsUp) {
    aLp = -1.35 + Math.sin(t * 1.7) * 0.08 + sw * 0.12 * mv;
    aRp = -1.25 + Math.sin(t * 1.9 + 1) * 0.08 - sw * 0.12 * mv;
    aLe = -0.25;
    aRe = -0.35;
  } else {
    aLp = -0.15 - sw * 0.35 * mv + Math.sin(t * 1.3) * 0.04;
    aRp = v.deadArm ? 0.05 + sw * 0.1 * mv : -0.15 + sw * 0.35 * mv;
    aLe = -0.35;
    aRe = v.deadArm ? -0.05 : -0.3;
  }
  if (gait === "stomp") {
    roll += sw * 0.07 * mv;
    lean += 0.04;
  } else if (gait === "waddle") {
    roll += sw * 0.1 * mv;
  } else if (gait === "shamble") {
    roll += sw * 0.05 * mv + Math.sin(t * 0.9) * 0.03;
  }
  // Idle sway.
  lean += Math.sin(t * 1.1 + v.seed) * 0.03 * (1 - mv);
  headRoll += Math.sin(t * 0.7 + v.seed * 2) * 0.08 * (1 - mv * 0.5);

  let jaw = 0.15 + Math.max(0, Math.sin(t * 2.3 + v.seed)) * 0.25;
  let glow = 0;
  let rootY = 0;

  // ---------------------------------------------------------- actions
  if (A.atk >= 0) {
    const w = z.atkWindup || 0.5;
    const k = A.atk / w; // 0..1 windup, >1 follow-through
    const kind = A.atkKind;
    if (kind === "slam" || kind === "heavy") {
      // Both arms high overhead, then smash down.
      const up = k < 1 ? ease(clamp(k, 0, 1)) : Math.max(0, 1 - (k - 1) * 5);
      const down = k < 1 ? 0 : ease(clamp((k - 1) * 4, 0, 1));
      aLp = aRp = -2.7 * up + -0.7 * down * (1 - up);
      aLe = aRe = -0.3 * up;
      aLs = aRs = 0.25;
      lean = rig.hunch - 0.35 * up + 0.75 * down;
      headPitch = -0.35 * up + 0.3 * down;
      jaw = 0.4 + up * 0.5;
      hipY -= 0.12 * down;
      glow = up;
    } else if (kind === "spit") {
      const up = ease(clamp(k, 0, 1));
      const fwd = k < 1 ? 0 : Math.max(0, 1 - (k - 1) * 3);
      lean = rig.hunch - 0.45 * up + 0.6 * fwd;
      headPitch = -0.6 * up + 0.4 * fwd;
      jaw = 0.3 + up * 0.7;
      aLp = aRp = -0.2;
      aLs = aRs = 0.5 * up;
      glow = up;
    } else if (kind === "roar") {
      const up = ease(clamp(k, 0, 1));
      lean = rig.hunch - 0.4 * up;
      headPitch = -0.7 * up;
      jaw = 1;
      aLp = aRp = -0.6 * up;
      aLs = aRs = 1.2 * up;
      aLe = aRe = -0.6;
      glow = up;
    } else if (kind === "leap" || kind === "charge" || kind === "dash" || kind === "lunge") {
      const crouch = ease(clamp(k, 0, 1));
      lean = rig.hunch + 0.5 * crouch + (kind === "charge" ? 0.25 : 0);
      hipY -= 0.25 * crouch * rig.legLen;
      legLk = legRk = 0.9 * crouch;
      legLp = legRp = -0.5 * crouch;
      aLp = aRp = 0.6 * crouch;
      aLs = aRs = 0.4;
      headPitch = -0.3;
      jaw = 0.6 + 0.4 * crouch;
      glow = crouch;
    } else {
      // Claw swipe (default): one arm winds back, then rakes across.
      const up = k < 1 ? ease(clamp(k, 0, 1)) : Math.max(0, 1 - (k - 1) * 3);
      const strike = k < 1 ? 0 : ease(clamp((k - 1) * 4, 0, 1)) * Math.max(0, 1 - (k - 1) * 1.5);
      aRp = -1.9 * up - 1.2 * strike;
      aRs = 0.6 * up - 0.3 * strike;
      aRe = -0.9 * up;
      aLp = -1.0 * up - 0.6 * strike;
      lean = rig.hunch - 0.15 * up + 0.4 * strike;
      headPitch = -0.15 * up + 0.2 * strike;
      jaw = 0.4 + up * 0.6;
      glow = up * 0.5;
    }
  }
  if (A.air > 0) {
    // Airborne (boss leap): tucked legs.
    legLk = legRk = 1.1;
    legLp = legRp = -0.7;
    aLp = aRp = -2.2;
    aLs = aRs = 0.5;
    lean = rig.hunch + 0.2;
  }
  if (A.arm > 0) {
    // Bomber about to burst: shaking, swelling, arms out.
    const k = A.arm;
    roll += Math.sin(t * 60) * 0.05 * k;
    lean = rig.hunch - 0.25 * k;
    headPitch = -0.5 * k;
    aLs = aRs = 0.9 * k;
    aLp = aRp = -0.6 * k;
    jaw = 1;
    glow = Math.max(glow, k);
  }
  if (A.charge > 0) glow = Math.max(glow, A.charge);
  if (A.stun > 0) {
    // Boss recovery window: slumped, head down.
    const k = Math.min(1, A.stun);
    lean = rig.hunch + 0.5 * k;
    headPitch = 0.5 * k;
    aLp = aRp = 0.15;
    aLe = aRe = -0.1;
    hipY -= 0.15 * k * rig.legLen;
    legLk = legRk = 0.5 * k;
    jaw = 0.9;
  }
  if (A.hit > 0) {
    const k = clamp(A.hit / (z.def.staggerTime || 0.4), 0, 1);
    const e = Math.sin(k * Math.PI * 0.5);
    lean -= 0.4 * e * A.hitPow;
    roll += 0.25 * e * A.hitSide * A.hitPow;
    headPitch -= 0.55 * e * A.hitPow;
    headRoll += 0.35 * e * A.hitSide * A.hitPow;
    aLs += 0.5 * e;
    aRs += 0.5 * e;
    jaw = Math.max(jaw, 0.8 * e);
  }
  if (A.spawn < 1) {
    // Clawing up out of the ground / rubble.
    const k = ease(clamp(A.spawn, 0, 1));
    rootY = -(rig.legLen + rig.torsoLen + rig.headR * 2) * z.scale * (1 - k);
    aLp = -2.6 + k * 1.4 + Math.sin(t * 9) * 0.15;
    aRp = -2.5 + k * 1.3 + Math.sin(t * 9 + 1.5) * 0.15;
    lean = rig.hunch + (1 - k) * 0.3;
    jaw = 0.7;
  }
  if (A.death >= 0) {
    const fall = ease(clamp(A.death / 0.75, 0, 1));
    const dir = v.fallFwd ? 1 : -1;
    lean = lean * (1 - fall) + dir * 1.52 * fall;
    roll *= 1 - fall;
    hipY = rig.legLen * (1 - fall) + (rig.torsoR * 0.9) * fall;
    legLp = legLp * (1 - fall) + dir * -1.35 * fall;
    legRp = legRp * (1 - fall) + dir * -1.2 * fall;
    legLk = legLk * (1 - fall);
    legRk = legRk * (1 - fall) + 0.4 * fall;
    aLp = aLp * (1 - fall) + dir * -2.6 * fall;
    aRp = aRp * (1 - fall) + dir * -2.2 * fall;
    aLs = aLs * (1 - fall) + 0.7 * fall;
    aRs = aRs * (1 - fall) + 0.5 * fall;
    headPitch = headPitch * (1 - fall) + dir * 0.3 * fall;
    jaw = 0.8;
    glow = 0;
    // Sink away at the end so corpses never pop.
    if (A.death > 2.6) rootY = -Math.min(1, (A.death - 2.6) / 0.8) * 0.6 * z.scale;
  }

  P.rootY = rootY;
  P.hipY = hipY;
  P.lean = lean;
  P.roll = roll;
  P.headPitch = headPitch;
  P.headRoll = headRoll;
  P.jaw = clamp(jaw, 0, 1);
  P.glow = clamp(glow, 0, 1);
  P.armL.p = aLp;
  P.armL.s = aLs;
  P.armL.e = aLe;
  P.armR.p = aRp;
  P.armR.s = aRs;
  P.armR.e = aRe;
  P.legL.p = legLp;
  P.legL.k = legLk;
  P.legR.p = legRp;
  P.legR.k = legRk;
  return P;
}

/* ------------------------------------------------------------------ hit volumes */

// v ← Rx(ax) Rz(az) v   (three.js Euler 'XYZ' with y = 0)
function rotXZ(v, ax, az) {
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  let x = v[0] * cz - v[1] * sz;
  let y = v[0] * sz + v[1] * cz;
  let z = v[2];
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const y2 = y * cx - z * sx;
  const z2 = y * sx + z * cx;
  v[0] = x;
  v[1] = y2;
  v[2] = z2;
  return v;
}

const tv = [0, 0, 0];

/** Local (root-space, unscaled) point → world, written into out[0..2]. */
function toWorld(z, lx, ly, lz, out) {
  const s = z.scale;
  const c = Math.cos(z.yaw);
  const sn = Math.sin(z.yaw);
  // Ry(yaw): x' = x cos + z sin, z' = -x sin + z cos
  out[0] = z.x + (lx * c + lz * sn) * s;
  out[1] = z.pose.rootY + ly * s + (z.y || 0);
  out[2] = z.z + (-lx * sn + lz * c) * s;
  return out;
}

/** Point in spine space (hips frame) → world. */
export function spinePoint(z, x, y, zz, out) {
  const P = z.pose;
  tv[0] = x;
  tv[1] = y;
  tv[2] = zz;
  rotXZ(tv, P.lean, P.roll);
  return toWorld(z, tv[0], tv[1] + P.hipY, tv[2], out);
}

/** World position of the head centre. */
export function headPoint(z, out) {
  const P = z.pose;
  const rig = z.rig;
  // Head centre in neck space, rotated by the neck, then offset to the neck.
  tv[0] = 0;
  tv[1] = rig.headR * 1.05;
  tv[2] = rig.headR * 0.15;
  rotXZ(tv, P.headPitch, P.headRoll);
  const hx = tv[0];
  const hy = tv[1] + rig.torsoLen;
  const hz = tv[2];
  return spinePoint(z, hx, hy, hz, out);
}

/**
 * Fills z.hit (preallocated sphere list) from the current pose:
 * [x, y, z, r, zone] with zone 0 = head, 1 = body, 2 = legs, 3 = weak point.
 */
export function hitVolumes(z) {
  const list = z.hit;
  const rig = z.rig;
  const s = z.scale;
  let n = 0;
  const put = (p, r, zone, mult = 1) => {
    const h = list[n++];
    h[0] = p[0];
    h[1] = p[1];
    h[2] = p[2];
    h[3] = r;
    h[4] = zone;
    h[5] = mult;
  };
  const p = [0, 0, 0];
  headPoint(z, p);
  put(p, rig.headR * 1.28 * s, 0);
  for (const f of [0.2, 0.55, 0.88]) {
    spinePoint(z, 0, rig.torsoLen * f, 0, p);
    put(p, rig.torsoR * 1.15 * s, 1);
  }
  if (z.anim.death < 0) {
    const hipY = z.pose.hipY;
    for (const f of [0.3, 0.72]) {
      toWorld(z, 0, hipY * f, 0, p);
      put(p, (rig.hipW + rig.legR) * 1.15 * s, 2);
    }
  }
  if (z.def.weak) {
    for (const w of z.def.weak) {
      spinePoint(z, w[0], rig.torsoLen * w[1], w[2], p);
      put(p, w[3] * s, 3, w[4]);
    }
  }
  z.hitCount = n;
  return n;
}

export function allocHit(def) {
  const n = 6 + (def.weak ? def.weak.length : 0);
  return Array.from({ length: n }, () => [0, 0, 0, 0, 0, 1]);
}
