/**
 * Authored skeletal clips for Iron Fist (the CC0 libraries have no fighting
 * moves). Each clip is a list of keys `{ t, ...pose }` in CHARACTER space
 * (+Z toward the opponent, +X the fighter's left, metres; see pose.js). Pose
 * parameters are eased between keys and the IK is re-solved every 1/30 s, so
 * fists travel in straight lines and planted feet never slide. Output: plain
 * THREE.AnimationClips of local bone rotations + pelvis position.
 *
 * Attack clips are keyed from engine/moves.js (startup / active / recovery);
 * the view drives `action.time = moveTime / tempo`, so the frame of full
 * extension IS the frame the engine tests the hit.
 *
 * Clips are baked once per body (male / female skeletons differ slightly).
 */
import * as THREE from "three";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createPoser, POSE_BONES } from "./pose.js";
import { MOVES } from "../engine/moves.js";
import { KNOCKDOWN, DODGE } from "../engine/constants.js";

const FPS = 30;

/* ------------------------------------------------------------------ stance */
// Fighting stance (left foot / left hand lead), facing +Z.
export const STANCE = {
  hip: [0, -0.1, 0],
  hipR: [0, -30, 0],
  spine: [10, 16, 0],
  neck: [4, 6, 0],
  head: [4, 6, 0],
  lc: [0, 0, 0],
  rc: [0, 0, 0],
  lh: [0.1, 1.36, 0.32],
  le: [0.45, 0.95, 0.1],
  rh: [-0.1, 1.4, 0.18],
  re: [-0.45, 0.95, -0.05],
  lhR: [0, 0, 0],
  rhR: [0, 0, 0],
  lf: [0.14, 0.09, 0.22],
  lk: [0.4, 0.5, 1],
  lfR: [0, -18, 0],
  rf: [-0.15, 0.09, -0.26],
  rk: [-0.3, 0.5, 1],
  rfR: [0, -40, 0],
};

const LYING = {
  // on the back, head toward −Z (away from the opponent), feet toward +Z
  hip: [0, -0.74, 0],
  hipR: [-88, 0, 0],
  spine: [-4, 0, 0],
  neck: [12, 0, 0],
  head: [10, 0, 0],
  lh: [0.16, 0.45, -0.45],
  le: [0.5, 0.3, -0.2],
  rh: [-0.16, 0.45, -0.45],
  re: [-0.5, 0.3, -0.2],
  lhR: [0, 0, 0],
  rhR: [0, 0, 0],
  lf: [0.22, 0.12, 0.55],
  lk: [0.4, 1.2, 0.4],
  lfR: [0, 0, 0],
  rf: [-0.22, 0.12, 0.55],
  rk: [-0.4, 1.2, 0.4],
  rfR: [0, 0, 0],
  lc: [0, 0, 0],
  rc: [0, 0, 0],
};

const merge = (base, over) => ({ ...base, ...over });
const ease = {
  lin: (x) => x,
  in: (x) => x * x,
  out: (x) => 1 - (1 - x) * (1 - x),
  io: (x) => x * x * (3 - 2 * x),
  snap: (x) => 1 - Math.pow(1 - x, 3),
};

function lerpPose(a, b, k) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const va = a[key];
    const vb = b[key];
    if (!Array.isArray(va) || !Array.isArray(vb)) {
      out[key] = vb ?? va;
      continue;
    }
    out[key] = va.map((x, i) => x + (vb[i] - x) * k);
  }
  return out;
}

/** Bake a keyed clip. keys: [{t, e?, ...pose}] ; base = pose defaults. */
function bakeClip(poser, name, keys, { base = STANCE, loop = false } = {}) {
  const full = keys.map((k) => ({ t: k.t, e: k.e || "io", pose: merge(base, k) }));
  const dur = full[full.length - 1].t;
  const n = Math.max(2, Math.round(dur * FPS) + 1);
  const times = [];
  const rot = Object.fromEntries(POSE_BONES.map((b) => [b, []]));
  const pos = [];
  for (let i = 0; i < n; i++) {
    const t = Math.min(dur, (i / (n - 1)) * dur);
    let j = 0;
    while (j < full.length - 2 && t > full[j + 1].t) j++;
    const A = full[j];
    const Bk = full[j + 1] || A;
    const span = Bk.t - A.t;
    const k = span > 0 ? ease[Bk.e](THREE.MathUtils.clamp((t - A.t) / span, 0, 1)) : 1;
    const baked = poser.bake(lerpPose(A.pose, Bk.pose, k));
    times.push(t);
    for (const b of POSE_BONES) rot[b].push(...baked[b]);
    pos.push(...baked.$pelvisPos);
  }
  // keep quaternion hemispheres continuous
  for (const b of POSE_BONES) {
    const v = rot[b];
    for (let i = 4; i < v.length; i += 4) {
      if (v[i] * v[i - 4] + v[i + 1] * v[i - 3] + v[i + 2] * v[i - 2] + v[i + 3] * v[i - 1] < 0) for (let k = 0; k < 4; k++) v[i + k] = -v[i + k];
    }
  }
  const tracks = POSE_BONES.map((b) => new THREE.QuaternionKeyframeTrack(`${b}.quaternion`, times, rot[b]));
  tracks.push(new THREE.VectorKeyframeTrack("pelvis.position", times, pos));
  const clip = new THREE.AnimationClip(name, dur, tracks);
  clip.userData = { loop };
  return clip;
}

/** Attack clip from a move: chamber → impact (held through active) → recover. */
function attackKeys(move, chamber, impact, extra = {}) {
  const s = move.startup;
  const a = move.active;
  const r = move.recovery;
  return [
    { t: 0, ...(extra.from || {}) },
    { t: s * (extra.chamberAt ?? 0.5), e: "out", ...chamber },
    { t: s, e: extra.impactEase || "in", ...impact },
    { t: s + a, e: "lin", ...impact, ...(extra.hold || {}) },
    ...(extra.mid ? [{ t: s + a + r * (extra.midAt ?? 0.45), e: "out", ...extra.mid }] : []),
    { t: s + a + r, e: "io" },
  ];
}

/* ------------------------------------------------------------ clip catalogue */
export function clipDefs() {
  const M = MOVES;
  const D = {};
  const atk = (move, chamber, impact, extra) => ({ keys: attackKeys(move, chamber, impact, extra) });

  /* ---------------- stance / guard / footwork */
  D.Stance = { loop: true, keys: [{ t: 0 }, { t: 0.8, hip: [0, -0.115, 0.005], spine: [12, 16, 0], lh: [0.1, 1.34, 0.32], rh: [-0.1, 1.38, 0.18] }, { t: 1.6 }] };
  const BLOCK = { hip: [0, -0.13, -0.03], spine: [18, 8, 0], head: [16, 2, 0], neck: [8, 0, 0], lh: [0.09, 1.55, 0.22], le: [0.25, 1.1, 0.42], rh: [-0.09, 1.55, 0.19], re: [-0.25, 1.1, 0.42], lhR: [0, 0, -20], rhR: [0, 0, 20] };
  D.Block = { loop: true, keys: [{ t: 0, ...BLOCK }, { t: 1.0, ...BLOCK, hip: [0, -0.14, -0.03] }, { t: 2.0, ...BLOCK }] };
  D.BlockHit = { keys: [{ t: 0, ...BLOCK }, { t: 0.06, e: "snap", ...BLOCK, hip: [0, -0.15, -0.1], spine: [8, 8, 0], lh: [0.09, 1.55, 0.14], rh: [-0.09, 1.55, 0.11] }, { t: 0.24, ...BLOCK }] };
  // fighting walk: lead foot steps, rear foot follows; a planted foot slides
  // back at exactly the body speed (D / T), the view matches playback to ground speed
  const step = (D = 0.7, T = 0.45) => {
    const q = D / 4;
    const lf = (k) => [STANCE.lf[0], 0.09, STANCE.lf[2] + k * q];
    const rf = (k) => [STANCE.rf[0], 0.09, STANCE.rf[2] + k * q];
    const lift = (p) => [p[0], p[1] + 0.08, p[2]];
    return {
      loop: true,
      speed: D / T,
      keys: [
        { t: 0, lf: lf(-1), rf: rf(1) },
        { t: T * 0.25, e: "lin", lf: lift(lf(0)), rf: rf(0), hip: [0, -0.09, 0] },
        { t: T * 0.5, e: "lin", lf: lf(1), rf: rf(-1), hip: [0, -0.11, 0] },
        { t: T * 0.75, e: "lin", lf: lf(0), rf: lift(rf(0)), hip: [0, -0.09, 0] },
        { t: T, e: "lin", lf: lf(-1), rf: rf(1), hip: [0, -0.1, 0] },
      ],
    };
  };
  D.Step = step();
  D.Sidestep = {
    keys: [
      { t: 0 },
      { t: DODGE.total * 0.3, e: "snap", hip: [0.05, -0.24, -0.02], hipR: [0, -10, 8], spine: [22, 6, 10], head: [8, 0, 8], lh: [0.18, 1.18, 0.28], rh: [-0.02, 1.2, 0.16], lf: [0.22, 0.09, 0.12], rf: [-0.2, 0.09, -0.3] },
      { t: DODGE.total * 0.7, hip: [0.05, -0.22, -0.02], hipR: [0, -10, 8], spine: [20, 6, 10], head: [8, 0, 8], lh: [0.18, 1.2, 0.28], rh: [-0.02, 1.22, 0.16], lf: [0.22, 0.09, 0.12], rf: [-0.2, 0.09, -0.3] },
      { t: DODGE.total },
    ],
  };
  D.JumpAir = { loop: true, keys: [{ t: 0, hip: [0, -0.02, 0], spine: [8, 10, 0], lf: [0.14, 0.5, 0.24], lk: [0.3, 1.0, 1], rf: [-0.14, 0.4, -0.08], rk: [-0.3, 0.9, 1], lfR: [30, 0, 0], rfR: [30, 0, 0], lh: [0.12, 1.42, 0.3], rh: [-0.12, 1.45, 0.18] }, { t: 1, hip: [0, -0.02, 0], spine: [8, 10, 0], lf: [0.14, 0.5, 0.24], lk: [0.3, 1.0, 1], rf: [-0.14, 0.4, -0.08], rk: [-0.3, 0.9, 1], lfR: [30, 0, 0], rfR: [30, 0, 0], lh: [0.12, 1.42, 0.3], rh: [-0.12, 1.45, 0.18] }] };
  D.Land = { keys: [{ t: 0, hip: [0, -0.26, 0], spine: [20, 14, 0], lf: [0.16, 0.09, 0.22], rf: [-0.16, 0.09, -0.26] }, { t: 0.2 }] };

  /* ---------------- punches: jab → cross → rising uppercut */
  D.Jab = atk(M.jab, { lh: [0.1, 1.38, 0.38], spine: [10, 8, 0] }, { hip: [0, -0.1, 0.09], hipR: [0, -40, 0], spine: [8, 0, 0], head: [6, 0, 0], lh: [0.05, 1.45, 0.8], le: [0.5, 1.2, 0.3], lhR: [0, 0, -70], lf: [0.14, 0.09, 0.28], lc: [0, -10, 0] });
  D.Cross = atk(M.cross, { hipR: [0, -30, 0], rh: [-0.1, 1.42, 0.22], spine: [10, 16, 0] }, { hip: [0.04, -0.13, 0.2], hipR: [0, 18, 0], spine: [12, -30, 0], head: [6, -14, 0], rh: [0.02, 1.45, 0.86], re: [-0.5, 1.2, 0.3], rhR: [0, 0, 70], rfR: [12, -10, 0], rf: [-0.12, 0.11, -0.2], lh: [0.12, 1.4, 0.24], rc: [0, 10, 0] });
  D.Uppercut = atk(
    M.uppercut,
    { hip: [0, -0.26, 0.04], spine: [24, 28, 0], rh: [-0.12, 0.98, 0.3], re: [-0.4, 0.85, -0.1] },
    { hip: [0.03, 0.02, 0.2], hipR: [0, 14, 0], spine: [-2, -22, 0], head: [-10, -8, 0], rh: [0.0, 1.62, 0.6], re: [-0.2, 0.9, 0.35], rhR: [0, 0, 40], rfR: [16, -10, 0], rf: [-0.12, 0.13, -0.2], lh: [0.12, 1.42, 0.24] },
    { mid: { hip: [0.02, -0.04, 0.1] } }
  );

  /* ---------------- kicks: low → mid → high roundhouse (rear leg) */
  const roundhouse = (move, h, reach, lean) =>
    atk(
      move,
      { hip: [0.02, -0.05, 0.02], hipR: [0, -14, 0], spine: [6, 12, 0], rf: [-0.1, 0.5 + h * 0.12, -0.02], rk: [-0.6, 0.7 + h * 0.3, 0.6], rfR: [40, 0, 40], lfR: [0, 20, 0] },
      { hip: [0.08, 0.0 - h * 0.06, 0.04], hipR: [0, 48, -10 - h * 14], spine: [-4 - lean, -10, 10 + h * 10], head: [6, -20, -6 - h * 6], rf: [0.12, 0.42 + h * 0.82, reach], rk: [-0.8, 1.1 + h * 0.6, 0.5], rfR: [60, 0, 90], lh: [0.2, 1.42, 0.22], rh: [-0.34, 1.2 + h * 0.06, -0.12], lfR: [0, 55, 0], lf: [0.14, 0.09, 0.2] },
      { mid: { rf: [-0.18, 0.45, -0.1], rk: [-0.5, 0.8, 0.6], hipR: [0, -10, 0] } }
    );
  D.LowKick = roundhouse(M.lowKick, 0, 0.72, 2);
  D.MidKick = roundhouse(M.midKick, 0.62, 0.84, 8);
  D.Roundhouse = roundhouse(M.roundhouse, 1.22, 0.76, 22);
  // flying side kick from a jump
  D.JumpKick = {
    keys: [
      { t: 0, hip: [0, -0.02, 0], spine: [8, 10, 0], lf: [0.14, 0.5, 0.24], lk: [0.3, 1.0, 1], rf: [-0.14, 0.4, -0.08], rk: [-0.3, 0.9, 1], lh: [0.12, 1.42, 0.3], rh: [-0.12, 1.45, 0.18] },
      { t: M.jumpKick.startup, e: "snap", hip: [0, 0.0, -0.05], hipR: [0, -70, -8], spine: [-14, 30, -6], head: [10, 40, 0], lf: [0.12, 0.72, 0.86], lk: [0.6, 0.8, 0.2], lfR: [0, -70, 80], rf: [-0.1, 0.55, -0.12], rk: [-0.2, 1.1, 1], rfR: [40, 0, 0], lh: [0.3, 1.32, 0.12], le: [0.6, 1.0, 0], rh: [-0.2, 1.45, 0.06] },
      { t: M.jumpKick.startup + M.jumpKick.active, hip: [0, 0.0, -0.05], hipR: [0, -70, -8], spine: [-14, 30, -6], head: [10, 40, 0], lf: [0.12, 0.72, 0.86], lk: [0.6, 0.8, 0.2], lfR: [0, -70, 80], rf: [-0.1, 0.55, -0.12], rk: [-0.2, 1.1, 1], rfR: [40, 0, 0], lh: [0.3, 1.32, 0.12], le: [0.6, 1.0, 0], rh: [-0.2, 1.45, 0.06] },
      { t: M.jumpKick.startup + M.jumpKick.active + 0.25, hip: [0, -0.02, 0], spine: [8, 10, 0], lf: [0.14, 0.4, 0.24], lk: [0.3, 1.0, 1], rf: [-0.14, 0.32, -0.08], rk: [-0.3, 0.9, 1], lh: [0.12, 1.42, 0.3], rh: [-0.12, 1.45, 0.18] },
    ],
  };

  /* ---------------- specials */
  // Ryuzen — Dragon Wave: chi gathered at the hip, both palms thrust forward
  D.DragonWave = atk(
    M.dragonWave,
    { hip: [0, -0.2, -0.04], hipR: [0, -52, 0], spine: [12, 40, 0], neck: [0, -20, 0], lh: [-0.14, 1.02, 0.02], rh: [-0.22, 0.96, -0.06], le: [0.3, 0.9, -0.3], re: [-0.5, 0.9, -0.3], lf: [0.18, 0.09, 0.32], rf: [-0.18, 0.09, -0.32], lhR: [0, 0, 40], rhR: [0, 0, -40] },
    { hip: [0, -0.22, 0.12], hipR: [0, -8, 0], spine: [6, 0, 0], head: [2, 0, 0], lh: [0.05, 1.26, 0.74], rh: [-0.05, 1.18, 0.72], le: [0.5, 1.1, 0.2], re: [-0.5, 1.0, 0.2], lf: [0.18, 0.09, 0.36], rf: [-0.18, 0.09, -0.32], lhR: [0, 0, -80], rhR: [0, 0, 80] },
    { chamberAt: 0.7, hold: {}, mid: { hip: [0, -0.2, 0.1] }, midAt: 0.5 }
  );
  // Blaze — Inferno Spin Kick: chambered knee, then a high spinning side kick (the view spins the body)
  D.InfernoKick = atk(
    M.infernoKick,
    { hip: [0, -0.05, 0], hipR: [0, -20, 0], spine: [6, 14, 0], rf: [-0.08, 0.66, 0.12], rk: [-0.3, 1.1, 1], rfR: [50, 0, 0], lh: [0.16, 1.4, 0.24], rh: [-0.18, 1.38, 0.1] },
    { hip: [0.06, -0.02, 0.0], hipR: [0, 60, -26], spine: [-16, -14, 22], head: [10, -30, -10], rf: [0.1, 1.42, 0.78], rk: [-0.8, 1.6, 0.4], rfR: [60, 0, 90], lh: [0.3, 1.25, 0.1], le: [0.6, 1.0, 0], rh: [-0.38, 1.2, -0.14], lfR: [0, 70, 0], lf: [0.14, 0.09, 0.16] },
    { chamberAt: 0.6, impactEase: "snap", mid: { rf: [-0.16, 0.5, -0.1], rk: [-0.5, 0.9, 0.6], hipR: [0, 0, 0] } }
  );
  // Titan — Earthquake Slam: fists raised overhead, double hammer into the floor
  D.QuakeSlam = atk(
    M.quakeSlam,
    { hip: [0, 0.03, -0.06], hipR: [0, -6, 0], spine: [-14, 0, 0], neck: [-8, 0, 0], head: [-12, 0, 0], lh: [0.12, 2.05, 0.06], rh: [-0.12, 2.05, 0.06], le: [0.5, 1.9, -0.1], re: [-0.5, 1.9, -0.1], lf: [0.2, 0.09, 0.2], rf: [-0.2, 0.09, -0.26] },
    { hip: [0, -0.46, 0.12], hipR: [0, 0, 0], spine: [46, 0, 0], neck: [-16, 0, 0], head: [-18, 0, 0], lh: [0.1, 0.38, 0.62], rh: [-0.1, 0.38, 0.62], le: [0.45, 0.9, 0.3], re: [-0.45, 0.9, 0.3], lf: [0.24, 0.09, 0.26], rf: [-0.24, 0.09, -0.3], lk: [0.5, 0.6, 1], rk: [-0.5, 0.6, 1], lfR: [0, 0, 0], rfR: [0, -20, 0] },
    { chamberAt: 0.72, impactEase: "in", mid: { hip: [0, -0.4, 0.1], spine: [38, 0, 0] }, midAt: 0.55 }
  );
  // Kira — Lightning Rush: low dashing superman punch
  D.LightningRush = atk(
    M.lightningRush,
    { hip: [0, -0.22, -0.02], hipR: [0, -36, 0], spine: [20, 18, 0], lh: [0.14, 1.28, 0.3], rh: [-0.12, 1.3, 0.12], lf: [0.16, 0.09, 0.3], rf: [-0.16, 0.09, -0.34] },
    { hip: [0, -0.16, 0.16], hipR: [0, -44, 0], spine: [24, 10, 0], head: [-6, 0, 0], lh: [0.05, 1.34, 0.8], le: [0.5, 1.2, 0.3], lhR: [0, 0, -70], rh: [-0.14, 1.32, 0.12], lf: [0.14, 0.24, 0.34], lk: [0.3, 0.6, 1], lfR: [20, 0, 0], rf: [-0.14, 0.12, -0.42], rfR: [-30, 0, 0] },
    { chamberAt: 0.6, impactEase: "snap" }
  );
  // Shadow — Shadow Step: hand seal, vanish, reappear with a palm strike
  D.ShadowStep = {
    keys: [
      { t: 0 },
      { t: 0.06, e: "snap", hip: [0, -0.22, 0], spine: [16, 0, 0], lh: [0.03, 1.24, 0.32], rh: [-0.03, 1.26, 0.32], le: [0.4, 1.0, 0.1], re: [-0.4, 1.0, 0.1] },
      { t: 0.24, hip: [0, -0.16, -0.04], hipR: [0, -36, 0], spine: [10, 22, 0], rh: [-0.16, 1.36, 0.06], lh: [0.12, 1.36, 0.3] },
      { t: M.shadowStep.startup, e: "in", hip: [0.04, -0.14, 0.2], hipR: [0, 18, 0], spine: [12, -30, 0], head: [6, -10, 0], rh: [0.02, 1.42, 0.84], re: [-0.5, 1.15, 0.3], rhR: [0, 0, 90], rf: [-0.12, 0.11, -0.22], rfR: [12, -10, 0], lh: [0.12, 1.36, 0.22] },
      { t: M.shadowStep.startup + M.shadowStep.active, e: "lin", hip: [0.04, -0.14, 0.2], hipR: [0, 18, 0], spine: [12, -30, 0], head: [6, -10, 0], rh: [0.02, 1.42, 0.84], re: [-0.5, 1.15, 0.3], rhR: [0, 0, 90], rf: [-0.12, 0.11, -0.22], rfR: [12, -10, 0], lh: [0.12, 1.36, 0.22] },
      { t: M.shadowStep.startup + M.shadowStep.active + M.shadowStep.recovery },
    ],
  };
  // Storm — Thunder Strike: call the storm with a raised arm, then point it down at the rival
  D.ThunderStrike = atk(
    M.thunderStrike,
    { hip: [0, -0.06, -0.04], hipR: [0, -14, 0], spine: [-14, 10, -6], neck: [-10, 0, 0], head: [-22, 0, 0], rh: [-0.18, 2.16, 0.1], re: [-0.55, 1.8, 0], lh: [0.18, 1.3, 0.26], lf: [0.18, 0.09, 0.24], rf: [-0.18, 0.09, -0.28] },
    { hip: [0, -0.2, 0.08], hipR: [0, 0, 0], spine: [20, -12, 0], neck: [6, 0, 0], head: [6, 0, 0], rh: [-0.04, 1.2, 0.78], re: [-0.5, 1.4, 0.2], rhR: [0, 0, 60], lh: [0.2, 1.3, 0.2], lf: [0.18, 0.09, 0.28], rf: [-0.18, 0.09, -0.3] },
    { chamberAt: 0.75, impactEase: "snap", mid: {}, midAt: 0.8 }
  );

  /* ---------------- hit reactions */
  D.HitHigh = { keys: [{ t: 0 }, { t: 0.06, e: "snap", hip: [0, -0.12, -0.1], spine: [-16, 24, 8], neck: [-14, 18, 0], head: [-20, 20, 6], lh: [0.2, 1.28, 0.18], rh: [-0.18, 1.32, 0.08] }, { t: 0.34 }] };
  D.HitMid = { keys: [{ t: 0 }, { t: 0.07, e: "snap", hip: [0, -0.2, -0.12], spine: [36, 10, -6], head: [-14, 4, 0], lh: [0.12, 1.1, 0.24], rh: [-0.06, 1.12, 0.14] }, { t: 0.4 }] };
  D.HitLow = { keys: [{ t: 0 }, { t: 0.08, e: "snap", hip: [0.06, -0.17, -0.02], hipR: [0, -24, 8], spine: [16, 14, -10], lf: [0.2, 0.15, 0.16], lk: [0.6, 0.5, 0.6] }, { t: 0.4 }] };

  /* ---------------- knockdown / KO / get-up */
  const F = KNOCKDOWN.fall;
  D.Fall = {
    keys: [
      { t: 0 },
      { t: F * 0.3, e: "out", hip: [0, -0.2, -0.22], hipR: [-30, 0, 0], spine: [-24, 0, 0], neck: [-20, 0, 0], head: [-14, 0, 0], lh: [0.4, 1.4, 0.0], le: [0.7, 1.2, 0], rh: [-0.4, 1.45, 0.05], re: [-0.7, 1.2, 0], lf: [0.14, 0.3, 0.32], rf: [-0.14, 0.09, 0.0] },
      { t: F * 0.75, e: "in", hip: [0, -0.58, -0.3], hipR: [-70, 0, 0], spine: [-10, 0, 0], neck: [8, 0, 0], head: [10, 0, 0], lh: [0.3, 0.7, -0.4], rh: [-0.3, 0.7, -0.4], le: [0.6, 0.6, -0.1], re: [-0.6, 0.6, -0.1], lf: [0.2, 0.4, 0.4], rf: [-0.2, 0.3, 0.4], lk: [0.4, 1.2, 0.6], rk: [-0.4, 1.2, 0.6] },
      { t: F, e: "out", ...LYING },
    ],
  };
  D.Down = { base: LYING, loop: true, keys: [{ t: 0, lf: [0.28, 0.1, 0.62], rf: [-0.24, 0.24, 0.45], rk: [-0.35, 1.0, 0.6] }, { t: 1.5, lf: [0.28, 0.1, 0.63], rf: [-0.24, 0.25, 0.44], rk: [-0.35, 1.0, 0.6], hip: [0, -0.745, 0.005] }, { t: 3, lf: [0.28, 0.1, 0.62], rf: [-0.24, 0.24, 0.45], rk: [-0.35, 1.0, 0.6] }] };
  const KOP = { hip: [0, -0.78, 0], spine: [-6, 0, 6], neck: [-6, 30, 0], head: [-4, 28, 0], lh: [0.45, 0.12, -0.3], le: [0.6, 0.4, 0], rh: [-0.4, 0.12, -0.55], re: [-0.6, 0.4, -0.3], lf: [0.32, 0.1, 0.62], rf: [-0.2, 0.1, 0.64] };
  D.KOLie = { base: LYING, loop: true, keys: [{ t: 0, ...KOP }, { t: 2, ...KOP }] };
  D.GetUp = {
    base: LYING,
    keys: [
      { t: 0 },
      { t: 0.35, hip: [0, -0.62, -0.05], hipR: [-45, 0, 0], spine: [20, 0, 0], lh: [0.3, 0.08, -0.25], rh: [-0.3, 0.12, -0.2], lf: [0.2, 0.09, 0.4], rf: [-0.2, 0.09, 0.35] },
      { t: 0.75, hip: [0, -0.35, 0.0], hipR: [10, 0, 0], spine: [40, 0, 0], lh: [0.25, 0.5, 0.25], rh: [-0.25, 0.6, 0.0], lf: [0.15, 0.09, 0.3], rf: [-0.18, 0.09, -0.2] },
      { t: 1.1, ...STANCE },
    ],
  };

  /* ---------------- results */
  const UPRIGHT = { ...STANCE, hip: [0, -0.02, 0], hipR: [0, 0, 0], spine: [-4, 0, 0], neck: [-4, 0, 0], head: [-10, 0, 0], lf: [0.16, 0.09, 0.04], rf: [-0.16, 0.09, -0.04], lfR: [0, 0, 0], rfR: [0, 0, 0] };
  D.Victory = { base: UPRIGHT, loop: true, keys: [{ t: 0, lh: [0.42, 2.1, 0.08], rh: [-0.42, 2.1, 0.08], le: [0.8, 1.6, 0], re: [-0.8, 1.6, 0] }, { t: 0.6, lh: [0.38, 2.14, 0.12], rh: [-0.38, 2.14, 0.12], le: [0.8, 1.6, 0], re: [-0.8, 1.6, 0], hip: [0, 0.0, 0] }, { t: 1.2, lh: [0.42, 2.1, 0.08], rh: [-0.42, 2.1, 0.08], le: [0.8, 1.6, 0], re: [-0.8, 1.6, 0] }] };
  D.VictoryFist = { base: UPRIGHT, loop: true, keys: [{ t: 0, rh: [-0.2, 2.15, 0.12], re: [-0.6, 1.8, 0], lh: [0.24, 1.0, 0.12], le: [0.6, 1.0, -0.2], spine: [-8, 10, 0] }, { t: 0.5, rh: [-0.2, 2.2, 0.14], re: [-0.6, 1.8, 0], lh: [0.24, 1.0, 0.12], le: [0.6, 1.0, -0.2], spine: [-10, 10, 0], hip: [0, 0.0, 0] }, { t: 1.0, rh: [-0.2, 2.15, 0.12], re: [-0.6, 1.8, 0], lh: [0.24, 1.0, 0.12], le: [0.6, 1.0, -0.2], spine: [-8, 10, 0] }] };
  D.Bow = { base: UPRIGHT, keys: [{ t: 0, lh: [0.06, 1.25, 0.3], rh: [-0.06, 1.25, 0.3], le: [0.5, 1.1, 0], re: [-0.5, 1.1, 0] }, { t: 0.5, spine: [30, 0, 0], neck: [10, 0, 0], head: [10, 0, 0], lh: [0.06, 1.1, 0.42], rh: [-0.06, 1.1, 0.42], le: [0.5, 1.0, 0], re: [-0.5, 1.0, 0] }, { t: 1.0, spine: [30, 0, 0], neck: [10, 0, 0], head: [10, 0, 0], lh: [0.06, 1.1, 0.42], rh: [-0.06, 1.1, 0.42], le: [0.5, 1.0, 0], re: [-0.5, 1.0, 0] }, { t: 1.5, lh: [0.06, 1.25, 0.3], rh: [-0.06, 1.25, 0.3], le: [0.5, 1.1, 0], re: [-0.5, 1.1, 0] }, { t: 2.0, ...STANCE }] };
  D.Defeat = { base: { ...UPRIGHT, spine: [18, 0, 0], neck: [18, 0, 0], head: [24, 0, 0], lh: [0.2, 1.0, 0.0], rh: [-0.2, 1.0, 0.0], le: [0.6, 1.0, -0.4], re: [-0.6, 1.0, -0.4] }, loop: true, keys: [{ t: 0 }, { t: 1.5, hip: [0, -0.04, 0] }, { t: 3 }] };
  return D;
}

/** Build every authored clip on a clone of a body's skeleton. */
export function buildClips(bodyScene) {
  const rig = skClone(bodyScene);
  rig.position.set(0, 0, 0);
  rig.quaternion.identity();
  rig.scale.set(1, 1, 1);
  const poser = createPoser(rig);
  const out = {};
  for (const [name, def] of Object.entries(clipDefs())) {
    out[name] = bakeClip(poser, name, def.keys, { base: def.base || STANCE, loop: !!def.loop });
    if (def.speed) out[name].userData.speed = def.speed; // ground speed (m/s) at playback 1
  }
  return out;
}

/** Clip name for each move id (engine → render). */
export const MOVE_CLIP = {
  jab: "Jab",
  cross: "Cross",
  uppercut: "Uppercut",
  lowKick: "LowKick",
  midKick: "MidKick",
  roundhouse: "Roundhouse",
  jumpKick: "JumpKick",
  dragonWave: "DragonWave",
  infernoKick: "InfernoKick",
  quakeSlam: "QuakeSlam",
  lightningRush: "LightningRush",
  shadowStep: "ShadowStep",
  thunderStrike: "ThunderStrike",
};

export { createPoser };
