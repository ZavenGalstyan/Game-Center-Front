/**
 * Penalty Kick — goalkeeper body. ONE pose function drives both the 3D model
 * and the collision spheres, so the visible keeper and its colliders can never
 * disagree ("no giant invisible keeper, no collider left standing mid-goal").
 *
 * The keeper stands just off the line (z = KZ) facing the shooter (+z).
 * Sides: the keeper's LEFT is +x (it faces +z), so every *L joint is on +x.
 *
 * READY stance: knees bent, feet ~shoulder width (left foot a touch ahead),
 * hips lowered, torso ~10° forward, arms open ~40° with bent elbows, gloves at
 * hip/waist height in front of the body. A slow idle loop shifts the weight
 * left/right (~1.6 s), pulses the knees a couple of cm and lifts the unweighted
 * heel; the head/upper torso follow the ball. `tension` (0→1 over the taker's
 * run-up) lowers the hips, opens the arms and adds a small preparation hop.
 *
 * A dive is aimed at a HAND TARGET (x, y) in the goal plane and runs
 *   LOAD (first 14%: hips dip, torso starts to lean, gloves start moving)
 *   → PUSH-OFF (the far-side leg drives from the grass)
 *   → EXTEND / REACH (leading glove furthest, the other just behind it)
 *   → LAND (side/shoulder contact, compression) → SETTLE → GET UP → READY.
 * Low dives drop the hips first and reach DOWN + OUT; high dives arc upward;
 * short reaches are a block (no dive, no fall).
 *
 * The body is physical: the pelvis travels at most PELVIS_TRAVEL·reach toward
 * the target and the arms add ARM_LEN, so a keeper standing in the middle
 * cannot touch a true top corner — corners are rewarding, not coin flips.
 */
import { clamp, lerp } from "./constants.js";

export const KZ = 0.32; // keeper plane (just off the line)
const READY_Y = 0.84; // pelvis height in the ready stance (knees bent)
const LEAN = 0.18; // forward component of the body axis (~10°)
const TORSO = 0.55;
const ARM_LEN = 0.62;
const UPPER = 0.32; // shoulder→elbow and elbow→glove
const LEG = 0.46; // hip→knee and knee→ankle
const PELVIS_TRAVEL = 1.55;
const HALF_STANCE = 0.23;
const LOAD = 0.14; // fraction of the dive spent loading

const easeOut = (s) => 1 - (1 - s) * (1 - s);
const smooth = (s) => s * s * (3 - 2 * s);
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** Two-bone IK: middle joint between root and end, pushed toward `bend`. */
function joint(root, end, bend, L) {
  const d = sub(end, root);
  const dist = Math.min(len(d), 2 * L - 1e-4);
  const dn = norm(d);
  const m = add(root, mul(dn, dist / 2));
  const h = Math.sqrt(Math.max(0, L * L - (dist / 2) ** 2));
  let b = sub(bend, mul(dn, dot(bend, dn)));
  if (len(b) < 1e-6) b = [0, 0, 1];
  return add(m, mul(norm(b), h));
}

const JOINTS = ["pelvis", "chest", "neck", "head", "shL", "shR", "elL", "elR", "hL", "hR", "hipL", "hipR", "knL", "knR", "ftL", "ftR"];

export class Keeper {
  /** stats: { reach (≈0.9–1.15), diveTime (s, 0.42–0.7), step (m/s) } */
  constructor(stats = {}) {
    this.stats = { reach: 1, diveTime: 0.55, step: 2.2, ...stats };
    this.reset(0);
  }

  reset(x = 0) {
    this.x = x; // lateral base position
    this.wantX = x;
    this.state = "READY";
    this.dive = null;
    this.hold = null;
    this.celebrateAt = null;
    this.idleSeed = 1.7; // fixed idle phase: colliders stay deterministic
    this.tension = 0; // 0 → 1 over the taker's run-up (set by the penalty)
    this.look = [0, 0.11, 11]; // what the head tracks (the ball)
  }

  /** Lateral shuffle target (before a dive). */
  stepTo(x) {
    if (this.state === "READY" || this.state === "STEP") this.wantX = clamp(x, -1.4, 1.4);
  }

  /** Commit a dive toward hand target (hx, hy) at time t. Returns the committed dive. */
  diveTo(hx, hy, t) {
    if (this.dive) return this.dive; // ONE dive per shot
    const P0 = [this.x, READY_Y];
    const ty = clamp(hy, 0.12, 2.5);
    const dx = hx - P0[0];
    const dy = ty - P0[1];
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;
    const travel = clamp(dist - (TORSO + ARM_LEN) * 0.9, 0, PELVIS_TRAVEL * this.stats.reach);
    const dur = this.stats.diveTime * (0.75 + 0.25 * Math.min(1, dist / 2.6));
    // a reach close to the body is a two-handed block, whatever its direction
    const side = Math.abs(ux) < 0.35 || dist < 0.75 ? "CENTER" : ux < 0 ? "RIGHT" : "LEFT"; // keeper's own left/right
    const height = uy > 0.45 ? "HIGH" : uy < -0.2 ? "LOW" : "MID";
    this.dive = {
      t0: t,
      from: P0,
      to: [P0[0] + ux * travel, P0[1] + uy * travel],
      dir: [ux, uy],
      hand: [hx, ty],
      height,
      // short reaches are a lean + arms (no full-body dive, no fall)
      tilt: clamp(dist / 1.9, 0.3, 1),
      falls: travel > 0.3 || hy < 0.45,
      lead: side === "CENTER" ? null : ux > 0 ? "L" : "R",
      tension: this.tension,
      dur,
      label: side === "CENTER" ? (uy > 0.4 && dist >= 0.75 ? "DIVE_HIGH_CENTER" : "BLOCK_CENTER") : `DIVE_${height === "MID" ? "" : height + "_"}${ux < 0 ? "LEFT" : "RIGHT"}`,
    };
    this.state = "DIVE";
    return this.dive;
  }

  catchBall(t) {
    this.state = "CATCH";
    this.hold = t;
  }

  update(t, dt) {
    if (this.state === "READY" || this.state === "STEP") {
      const d = this.wantX - this.x;
      const m = this.stats.step * dt;
      this.x += Math.abs(d) <= m ? d : Math.sign(d) * m;
      this.state = Math.abs(d) > 0.02 ? "STEP" : "READY";
    }
  }

  /* ------------------------------------------------------------ READY */
  readyPose(t, x = this.x, T = this.tension) {
    const z = KZ;
    const w = t * 3.93 + this.idleSeed; // ≈1.6 s weight-shift cycle
    const shift = Math.sin(w) * 0.045; // left / right weight shift
    const pulse = (Math.sin(2 * w + 0.6) * 0.5 + 0.5) * 0.022; // knee pulse
    // preparation hop late in the run-up
    const hop = T > 0.72 && T < 0.9 ? Math.sin(((T - 0.72) / 0.18) * Math.PI) * 0.035 : 0;
    const py = READY_Y - pulse - 0.05 * T + hop;
    const pelvis = [x + shift, py, z - 0.02 + 0.03 * T];
    const up = norm([-shift * 0.35, 1, LEAN + 0.06 * T]);
    // upper torso / head follow the ball a little
    const track = clamp((this.look[0] - x) * 0.015, -0.035, 0.035);
    const chest = add(add(pelvis, mul(up, TORSO * 0.62)), [track * 0.6, 0, 0]);
    const neck = add(add(pelvis, mul(up, TORSO)), [track, 0, 0]);
    const head = add(add(pelvis, mul(up, TORSO + 0.2)), [track * 1.3, 0, 0.02]);
    const shL = add(neck, [0.2, -0.03, 0]);
    const shR = add(neck, [-0.2, -0.03, 0]);
    // gloves: open ~40° from the torso, elbows bent, at hip/waist height, in front
    const open = 0.45 + 0.07 * T;
    const wob = Math.sin(t * 3.1 + this.idleSeed) * 0.025;
    const hy = py + 0.1 + 0.02 * T;
    const hL = [pelvis[0] + open, hy + wob, z + 0.3];
    const hR = [pelvis[0] - open, hy - wob, z + 0.3];
    const elL = joint(shL, hL, [0.8, -0.7, -0.45], UPPER);
    const elR = joint(shR, hR, [-0.8, -0.7, -0.45], UPPER);
    const hipL = add(pelvis, [0.12, -0.02, 0]);
    const hipR = add(pelvis, [-0.12, -0.02, 0]);
    // feet planted ~shoulder width, left foot slightly ahead; the unweighted heel lifts
    const wide = 0.025 * T;
    const ftL = [x + HALF_STANCE + wide, 0.05 + Math.max(0, -shift) * 0.35 + hop * 0.8, z + 0.07];
    const ftR = [x - HALF_STANCE - wide, 0.05 + Math.max(0, shift) * 0.35 + hop * 0.8, z - 0.03];
    // knees bend forward and a little outward
    const knL = joint(hipL, ftL, [0.35, 0.1, 1], LEG);
    const knR = joint(hipR, ftR, [-0.35, 0.1, 1], LEG);
    const gaze = norm(sub(this.look, head));
    return { pelvis, chest, neck, head, shL, shR, elL, elR, hL, hR, hipL, hipR, knL, knR, ftL, ftR, up, gaze, reachS: 0, fall: 0 };
  }

  /* ------------------------------------------------------------ DIVE */
  divePose(t) {
    const dv = this.dive;
    const z = KZ;
    const start = this.readyPose(dv.t0, this.x, dv.tension);
    const s = clamp((t - dv.t0) / dv.dur, 0, 1);
    const lk = smooth(clamp(s / LOAD, 0, 1)); // load
    const ex = s <= LOAD ? 0 : easeOut((s - LOAD) / (1 - LOAD)); // push-off → extension
    const reachS = 0.25 * lk + 0.75 * ex;
    const [ux, uy] = dv.dir;
    const low = dv.height === "LOW";
    const high = dv.height === "HIGH";
    // pelvis: dip + shift during the load, then drive toward the target
    const dip = low ? 0.16 : high ? 0.05 : 0.08;
    // (the dip fades out as the push-off extends; travel follows the same curve as the gloves)
    const endP = dv.to;
    let px = lerp(start.pelvis[0], endP[0], reachS);
    let py = lerp(start.pelvis[1], endP[1], reachS) - dip * lk * (1 - ex) + Math.sin(Math.PI * ex) * (high ? 0.12 : low ? 0 : 0.05);
    // body axis: from the forward-leaning ready axis toward the dive direction
    const k = (0.15 * lk + 0.85 * ex) * dv.tilt;
    let a2 = [lerp(0, ux, k), lerp(1, uy, k)];
    let al = Math.hypot(a2[0], a2[1]) || 1;
    a2 = [a2[0] / al, a2[1] / al];
    // LAND: after full stretch the keeper comes down onto side/shoulder
    const tf = t - dv.t0 - dv.dur;
    let fall = 0;
    if (dv.falls && tf > 0 && this.state !== "CELEBRATE") {
      fall = clamp(tf / 0.38, 0, 1);
      const f2 = fall * fall;
      const side = Math.sign(ux) || 1;
      a2 = [lerp(a2[0], side * 0.97, f2 * 0.6), lerp(a2[1], 0.24, f2 * 0.6)];
      al = Math.hypot(a2[0], a2[1]) || 1;
      a2 = [a2[0] / al, a2[1] / al];
      const squash = Math.sin(Math.PI * clamp((tf - 0.3) / 0.25, 0, 1)) * 0.03; // impact compression
      py = lerp(py, 0.19 + Math.max(0, a2[1]) * 0.08 - squash, f2);
    }
    const lean = LEAN * (1 - ex) * Math.max(0, a2[1]);
    const up = norm([a2[0], a2[1], lean]);
    const sideL = [a2[1], -a2[0], 0]; // keeper's left, perpendicular to the body axis
    const pelvis = [px, py, z - 0.02 * (1 - ex)];
    const chest = add(pelvis, mul(up, TORSO * 0.62));
    const neck = add(pelvis, mul(up, TORSO));
    const head = add(pelvis, mul(up, TORSO + 0.2));
    let shL = add(neck, mul(sideL, 0.2));
    let shR = add(neck, mul(sideL, -0.2));
    // gloves: the leading glove goes furthest toward the target, the other supports behind it
    const toH = [dv.hand[0] - neck[0], dv.hand[1] - neck[1], 0];
    const dH = Math.hypot(toH[0], toH[1]) || 1;
    const armL = Math.min(ARM_LEN, Math.max(0.25, dH));
    const dirH = [toH[0] / dH, toH[1] / dH, 0];
    const tip = [neck[0] + dirH[0] * armL, neck[1] + dirH[1] * armL, z + 0.12];
    let tL;
    let tR;
    if (dv.lead === "L") {
      tL = tip;
      tR = add(add(tip, mul(dirH, -0.08)), mul(sideL, -0.16));
    } else if (dv.lead === "R") {
      tR = tip;
      tL = add(add(tip, mul(dirH, -0.08)), mul(sideL, 0.16));
    } else {
      tL = add(tip, mul(sideL, 0.1));
      tR = add(tip, mul(sideL, -0.1));
    }
    let hL = mix(start.hL, tL, reachS);
    let hR = mix(start.hR, tR, reachS);
    if (fall > 0) {
      const f2 = fall * fall;
      hL = [hL[0], lerp(hL[1], Math.max(0.12, hL[1] - 0.8), f2), hL[2]];
      hR = [hR[0], lerp(hR[1], Math.max(0.12, hR[1] - 0.8), f2), hR[2]];
    }
    hL[1] = Math.max(0.1, hL[1]);
    hR[1] = Math.max(0.1, hR[1]);
    // at full stretch the shoulder reaches toward the glove (no over-long arm)
    const reachSh = (sh, h) => {
      const d = sub(h, sh);
      const l = len(d);
      return l > 2 * UPPER - 0.01 ? add(sh, mul(d, (l - (2 * UPPER - 0.01)) / l)) : sh;
    };
    shL = reachSh(shL, hL);
    shR = reachSh(shR, hR);
    const elL = joint(shL, hL, add(mul(sideL, 1), [0, -0.4, -0.5]), UPPER);
    const elR = joint(shR, hR, add(mul(sideL, -1), [0, -0.4, -0.5]), UPPER);
    const hipL = add(pelvis, mul(sideL, 0.12));
    const hipR = add(pelvis, mul(sideL, -0.12));
    // legs: the far-side leg pushes off the grass, then both trail the body line;
    // the leading leg tucks. A block (no lead) keeps both feet planted.
    const legFor = (hip, which) => {
      const standFoot = which === "L" ? start.ftL : start.ftR;
      const push = dv.lead && which !== dv.lead;
      const leadLeg = dv.lead && which === dv.lead;
      let foot;
      if (!dv.lead || !dv.falls) {
        foot = mix(standFoot, add(standFoot, [ux * 0.18, 0, 0.05]), ex);
      } else if (push) {
        const trail = add(hip, mul(up, -0.9));
        foot = mix(standFoot, trail, smooth(clamp((ex - 0.2) / 0.45, 0, 1)));
      } else {
        const tuck = add(add(hip, mul(up, -0.62)), [0, 0, 0.12]);
        foot = mix(standFoot, tuck, smooth(clamp(ex / 0.5, 0, 1)));
      }
      // a leg can't stretch: once fully extended the push foot leaves the grass
      const fd = sub(foot, hip);
      const fl = len(fd);
      if (fl > 2 * LEG - 0.02) foot = add(hip, mul(fd, (2 * LEG - 0.02) / fl));
      foot = [foot[0], Math.max(0.05, foot[1]), foot[2]];
      // push leg compresses in the load (knee forward), lead leg bends more
      const bend = add([which === "L" ? 0.25 : -0.25, 0.1, 1], mul(up, leadLeg ? 0.3 : 0.1));
      const knee = joint(hip, foot, bend, LEG);
      return [[knee[0], Math.max(0.08, knee[1]), knee[2]], foot];
    };
    const [knL, ftL] = legFor(hipL, "L");
    const [knR, ftR] = legFor(hipR, "R");
    const gaze = norm(sub(this.look, head));
    return { pelvis, chest, neck, head, shL, shR, elL, elR, hL, hR, hipL, hipR, knL, knR, ftL, ftR, up, gaze, reachS, fall };
  }

  /**
   * Joint positions at time t (world metres). Keys: pelvis, chest, neck, head,
   * shL/shR, elL/elR, hL/hR (gloves), hipL/hipR, knL/knR, ftL/ftR, up (body
   * axis), gaze (head direction).
   */
  pose(t) {
    const dv = this.dive;
    if (!dv) return this.readyPose(t);
    let p = this.divePose(t);
    if (this.state === "CELEBRATE") {
      const k = clamp((t - this.celebrateAt) / 0.3, 0, 1);
      p.hL = [p.shL[0] + 0.15, p.shL[1] + 0.62 * k, KZ + 0.05];
      p.hR = [p.shR[0] - 0.15, p.shR[1] + 0.62 * k, KZ + 0.05];
      return p;
    }
    // SETTLE, then GET UP where the keeper landed, back to the ready stance
    const settle = dv.falls ? dv.t0 + dv.dur + 0.38 + 0.35 : dv.t0 + dv.dur + 0.45;
    const rec = smooth(clamp((t - settle) / 0.75, 0, 1));
    if (rec > 0) {
      const r = this.readyPose(t, p.pelvis[0], 0);
      const q = {};
      for (const j of JOINTS) q[j] = mix(p[j], r[j], rec);
      q.up = norm(mix(p.up, r.up, rec));
      q.gaze = r.gaze;
      q.reachS = p.reachS * (1 - rec);
      q.fall = p.fall * (1 - rec);
      p = q;
    }
    return p;
  }

  /** Collision spheres derived from the pose (id, kind, centre, radius). Sized to the drawn body. */
  collidersAt(t) {
    const p = this.pose(t);
    const mid = (a, b, k = 0.5) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    return [
      { id: "handL", kind: "hand", c: p.hL, r: 0.1 },
      { id: "handR", kind: "hand", c: p.hR, r: 0.1 },
      { id: "foreL", kind: "body", c: mid(p.elL, p.hL, 0.55), r: 0.055 },
      { id: "foreR", kind: "body", c: mid(p.elR, p.hR, 0.55), r: 0.055 },
      { id: "upperL", kind: "body", c: mid(p.shL, p.elL), r: 0.062 },
      { id: "upperR", kind: "body", c: mid(p.shR, p.elR), r: 0.062 },
      { id: "head", kind: "body", c: p.head, r: 0.12 },
      { id: "chest", kind: "body", c: p.chest, r: 0.19 },
      { id: "belly", kind: "body", c: mid(p.pelvis, p.chest, 0.35), r: 0.17 },
      { id: "thighL", kind: "body", c: mid(p.hipL, p.knL), r: 0.085 },
      { id: "thighR", kind: "body", c: mid(p.hipR, p.knR), r: 0.085 },
      { id: "shinL", kind: "body", c: mid(p.knL, p.ftL), r: 0.065 },
      { id: "shinR", kind: "body", c: mid(p.knR, p.ftR), r: 0.065 },
      { id: "footL", kind: "body", c: p.ftL, r: 0.07 },
      { id: "footR", kind: "body", c: p.ftR, r: 0.07 },
    ];
  }

  /** Colliders with velocities (finite difference over the physics step). */
  colliders(t, dt) {
    const a = this.collidersAt(t - dt);
    const b = this.collidersAt(t);
    return b.map((c, i) => ({ ...c, v: [(c.c[0] - a[i].c[0]) / dt, (c.c[1] - a[i].c[1]) / dt, (c.c[2] - a[i].c[2]) / dt] }));
  }
}
