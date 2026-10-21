/**
 * Authored skeletal clips — every fighting move the CC0 libraries don't have.
 *
 * Each clip is a list of keys `{ t, ...pose }` (see pose.js for the pose
 * fields). Keys inherit from the clip's base pose (usually STANCE). Between
 * keys the pose PARAMETERS are eased (smoothstep, or `e:` per key) and the
 * IK is re-solved every 1/30 s, so fists travel in straight lines to the
 * target and planted feet never slide. The result is a regular
 * THREE.AnimationClip of local bone rotations + pelvis position.
 *
 * Attack clip timing comes from engine/moves.js (startup / active / recovery),
 * and the animator drives `action.time` straight from the simulation's move
 * timer — the frame where the fist or shin reaches full extension IS the
 * frame the combat engine tests the hit volume.
 *
 * Ground clips come in top/bottom pairs authored in the BOTTOM fighter's
 * frame (bottom lies at the anchor, feet toward +Z); `top()` converts a pose
 * written in that frame into the top fighter's own character space using the
 * position's yaw / offset from GROUND_LAYOUT (shared with the renderer).
 */
import * as THREE from "three";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createPoser, POSE_BONES } from "./pose.js";
import { MOVES } from "../engine/moves.js";
import { GROUND_LAYOUT } from "../engine/constants.js";

const FPS = 30;

/* ------------------------------------------------------------------ stance */
// Orthodox stance (left foot / left hand lead), facing +Z.
export const STANCE = {
  hip: [0, -0.08, 0],
  hipR: [0, -28, 0],
  spine: [10, 14, 0],
  neck: [4, 6, 0],
  head: [6, 6, 0],
  lc: [0, 0, 0],
  rc: [0, 0, 0],
  lh: [0.1, 1.38, 0.32],
  le: [0.45, 0.95, 0.1],
  rh: [-0.1, 1.42, 0.2],
  re: [-0.45, 0.95, -0.05],
  lhR: [0, 0, 0],
  rhR: [0, 0, 0],
  lf: [0.13, 0.09, 0.2],
  lk: [0.4, 0.5, 1],
  lfR: [0, -18, 0],
  rf: [-0.14, 0.09, -0.24],
  rk: [-0.3, 0.5, 1],
  rfR: [0, -40, 0],
};

export { GROUND_LAYOUT };

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

/* ------------------------------------------------------------ helpers */
/** Attack clip from a move: chamber → impact (held through active) → recover. */
function attackKeys(move, chamber, impact, extra = {}) {
  const s = move.startup;
  const a = move.active;
  const r = move.recovery;
  return [
    { t: 0 },
    { t: s * 0.45, e: "out", ...chamber },
    { t: s, e: "in", ...impact },
    { t: s + a, e: "lin", ...impact, ...(extra.hold || {}) },
    ...(extra.mid ? [{ t: s + a + r * 0.45, e: "out", ...extra.mid }] : []),
    { t: s + a + r, e: "io" },
  ];
}

// pair-frame (bottom fighter's space) → top fighter's character space
function toTop(layout, p) {
  const c = Math.cos(-layout.yaw);
  const s = Math.sin(-layout.yaw);
  const x = p[0] - layout.off[0];
  const z = p[2] - layout.off[2];
  return [x * c + z * s, p[1], -x * s + z * c];
}
function top(pos, P) {
  const L = GROUND_LAYOUT[pos];
  const out = { ...P };
  for (const k of ["lh", "rh", "le", "re", "lf", "rf", "lk", "rk"]) if (P[k]) out[k] = toTop(L, P[k]);
  return out;
}

/* ------------------------------------------------------------ base poses */
const LYING = {
  // on the back, head toward −Z, feet toward +Z (bottom fighter)
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
};
const KNEEL = {
  // kneeling upright on both knees (top fighter in guard), own space
  hip: [0, -0.48, 0],
  hipR: [18, 0, 0],
  spine: [16, 0, 0],
  neck: [-6, 0, 0],
  head: [-6, 0, 0],
  lh: [0.22, 0.95, 0.4],
  le: [0.5, 0.9, 0],
  rh: [-0.22, 0.95, 0.4],
  re: [-0.5, 0.9, 0],
  lhR: [0, 0, 0],
  rhR: [0, 0, 0],
  lf: [0.18, 0.08, -0.48],
  lk: [0.25, 0.2, 1],
  lfR: [-70, 0, 0],
  rf: [-0.18, 0.08, -0.48],
  rk: [-0.25, 0.2, 1],
  rfR: [-70, 0, 0],
  lc: [0, 0, 0],
  rc: [0, 0, 0],
};

/* ------------------------------------------------------------ clip catalogue */
export function clipDefs() {
  const M = MOVES;
  const D = {};
  const atk = (move, chamber, impact, extra) => ({ keys: attackKeys(move, chamber, impact, extra) });

  /* ---------------- guard / idle */
  D.Stance = { keys: [{ t: 0 }, { t: 0.9, hip: [0, -0.1, 0.005], spine: [12, 14, 0], lh: [0.1, 1.36, 0.32], rh: [-0.1, 1.4, 0.2] }, { t: 1.8 }], loop: true };
  D.Tired = { keys: [{ t: 0, hip: [0, -0.1, 0], spine: [22, 12, 0], head: [10, 6, 0], lh: [0.14, 1.22, 0.32], rh: [-0.12, 1.25, 0.22] }, { t: 0.7, hip: [0, -0.13, 0], spine: [27, 12, 0], head: [14, 6, 0], lh: [0.14, 1.17, 0.32], rh: [-0.12, 1.2, 0.22] }, { t: 1.4, hip: [0, -0.1, 0], spine: [22, 12, 0], head: [10, 6, 0], lh: [0.14, 1.22, 0.32], rh: [-0.12, 1.25, 0.22] }], loop: true };
  const BLOCK_HI = { hip: [0, -0.11, -0.02], spine: [18, 8, 0], head: [16, 2, 0], neck: [8, 0, 0], lh: [0.09, 1.56, 0.2], le: [0.25, 1.1, 0.4], rh: [-0.09, 1.56, 0.17], re: [-0.25, 1.1, 0.4], lhR: [0, 0, -20], rhR: [0, 0, 20] };
  const BLOCK_LO = { hip: [0, -0.16, -0.02], spine: [26, 8, 0], head: [18, 2, 0], lh: [0.09, 1.38, 0.18], le: [0.2, 1.0, 0.25], rh: [-0.09, 1.38, 0.15], re: [-0.2, 1.0, 0.25] };
  D.Block = { keys: [{ t: 0, ...BLOCK_HI }, { t: 1.0, ...BLOCK_HI, hip: [0, -0.12, -0.02] }, { t: 2.0, ...BLOCK_HI }], loop: true };
  D.BlockBody = { keys: [{ t: 0, ...BLOCK_LO }, { t: 1.0, ...BLOCK_LO, hip: [0, -0.17, -0.02] }, { t: 2.0, ...BLOCK_LO }], loop: true };
  D.BlockHit = { keys: [{ t: 0, ...BLOCK_HI }, { t: 0.07, e: "snap", ...BLOCK_HI, hip: [0, -0.12, -0.08], spine: [8, 8, 0], lh: [0.09, 1.56, 0.12], rh: [-0.09, 1.56, 0.1] }, { t: 0.25, ...BLOCK_HI }] };
  D.BlockBodyHit = { keys: [{ t: 0, ...BLOCK_LO }, { t: 0.07, e: "snap", ...BLOCK_LO, hip: [0, -0.18, -0.08], spine: [32, 8, 6] }, { t: 0.25, ...BLOCK_LO }] };

  /* ---------------- footwork (in-place cycles; the animator matches playback to ground speed) */
  const step = (axis, S = 0.13, T = 0.44) => {
    // lead foot (left) swings in the first half while the rear foot is planted, then they swap
    const lf = (k) => [STANCE.lf[0] + (axis === "x" ? k * S : 0), 0.09 + (Math.abs(k) < 0.9 ? 0 : 0), STANCE.lf[2] + (axis === "z" ? k * S : 0)];
    const rf = (k) => [STANCE.rf[0] + (axis === "x" ? k * S : 0), 0.09, STANCE.rf[2] + (axis === "z" ? k * S : 0)];
    const lift = (p) => [p[0], p[1] + 0.06, p[2]];
    return {
      loop: true,
      keys: [
        { t: 0, lf: lf(-1), rf: rf(1) },
        { t: T * 0.25, e: "lin", lf: lift(lf(0)), rf: rf(0.5), hip: [0, -0.07, 0] },
        { t: T * 0.5, e: "lin", lf: lf(1), rf: rf(0), hip: [0, -0.085, 0] },
        { t: T * 0.75, e: "lin", lf: lf(0.5), rf: lift(rf(-0.5)), hip: [0, -0.07, 0] },
        { t: T, e: "lin", lf: lf(-1), rf: rf(1), hip: [0, -0.08, 0] },
      ],
    };
  };
  D.StepF = step("z");
  D.StepL = step("x");

  /* ---------------- dodges */
  D.SlipL = { keys: [{ t: 0 }, { t: 0.12, e: "snap", hip: [0.12, -0.16, 0], spine: [16, 10, 18], head: [8, 6, 10], lh: [0.24, 1.22, 0.28], rh: [0.02, 1.27, 0.16] }, { t: 0.3, hip: [0.12, -0.16, 0], spine: [16, 10, 18], head: [8, 6, 10], lh: [0.24, 1.22, 0.28], rh: [0.02, 1.27, 0.16] }, { t: 0.5 }] };
  D.SlipR = { keys: [{ t: 0 }, { t: 0.12, e: "snap", hip: [-0.12, -0.16, 0], spine: [16, 18, -18], head: [8, 6, -10], lh: [-0.02, 1.25, 0.3], rh: [-0.22, 1.24, 0.14] }, { t: 0.3, hip: [-0.12, -0.16, 0], spine: [16, 18, -18], head: [8, 6, -10], lh: [-0.02, 1.25, 0.3], rh: [-0.22, 1.24, 0.14] }, { t: 0.5 }] };
  D.Duck = { keys: [{ t: 0 }, { t: 0.13, e: "snap", hip: [0, -0.3, -0.05], spine: [34, 14, 0], head: [-8, 4, 0], lh: [0.12, 1.12, 0.32], rh: [-0.1, 1.14, 0.2], lf: [0.15, 0.09, 0.22], rf: [-0.16, 0.09, -0.26] }, { t: 0.3, hip: [0, -0.3, -0.05], spine: [34, 14, 0], head: [-8, 4, 0], lh: [0.12, 1.12, 0.32], rh: [-0.1, 1.14, 0.2] }, { t: 0.5 }] };
  D.Backstep = { keys: [{ t: 0 }, { t: 0.1, e: "snap", hip: [0, -0.06, -0.08], spine: [0, 14, 0], rf: [-0.14, 0.15, -0.34] }, { t: 0.22, hip: [0, -0.1, -0.02], spine: [4, 14, 0] }, { t: 0.4 }] };

  /* ---------------- punches */
  D.Jab = atk(M.jab, { lh: [0.1, 1.38, 0.36], spine: [10, 8, 0] }, { hip: [0, -0.09, 0.07], hipR: [0, -38, 0], spine: [8, 0, 0], head: [6, 0, 0], lh: [0.06, 1.45, 0.78], le: [0.5, 1.2, 0.3], lhR: [0, 0, -70], lf: [0.13, 0.09, 0.26], lc: [0, -10, 0] });
  D.Cross = atk(M.cross, { hipR: [0, -30, 0], rh: [-0.1, 1.42, 0.22], spine: [10, 16, 0] }, { hip: [0.03, -0.11, 0.12], hipR: [0, 6, 0], spine: [12, -22, 0], head: [6, -10, 0], rh: [0.02, 1.45, 0.82], re: [-0.5, 1.2, 0.3], rhR: [0, 0, 70], rfR: [12, -10, 0], rf: [-0.12, 0.11, -0.2], lh: [0.12, 1.4, 0.24], rc: [0, 10, 0] });
  D.HookL = atk(
    M.hookL,
    { hipR: [0, -38, 0], spine: [12, 22, 6], lh: [0.24, 1.38, 0.3] },
    { hip: [0.0, -0.11, 0.05], hipR: [0, -8, 0], spine: [12, -30, -4], head: [6, -12, 0], lh: [0.02, 1.46, 0.5], le: [0.6, 1.45, 0.3], lhR: [0, 0, -80], lfR: [0, 20, 0], lc: [0, -6, 6] }
  );
  D.HookR = atk(
    M.hookR,
    { hipR: [0, -36, 0], spine: [12, 30, -4], rh: [-0.26, 1.4, 0.18] },
    { hip: [0.04, -0.12, 0.08], hipR: [0, 18, 0], spine: [12, -22, 4], head: [6, -14, 0], rh: [-0.02, 1.46, 0.52], re: [-0.6, 1.45, 0.3], rhR: [0, 0, 80], rfR: [12, -10, 0], rf: [-0.12, 0.11, -0.2], rc: [0, 6, -6], lh: [0.12, 1.42, 0.24] }
  );
  D.Uppercut = atk(
    M.uppercut,
    { hip: [0, -0.2, 0.02], spine: [22, 26, 0], rh: [-0.12, 1.02, 0.3], re: [-0.4, 0.9, -0.1] },
    { hip: [0.02, -0.06, 0.1], hipR: [0, 4, 0], spine: [2, -16, 0], head: [-4, -6, 0], rh: [0.0, 1.5, 0.5], re: [-0.2, 0.9, 0.3], rhR: [0, 0, 40], rfR: [12, -10, 0], lh: [0.12, 1.42, 0.24] }
  );
  D.BodyJab = atk(M.bodyJab, { hip: [0, -0.2, 0.02], spine: [22, 8, 0] }, { hip: [0, -0.26, 0.1], hipR: [0, -38, 0], spine: [26, 0, 0], head: [-10, 0, 0], lh: [0.06, 1.15, 0.72], le: [0.5, 1.0, 0.3], lhR: [0, 0, -70], lf: [0.14, 0.09, 0.28] });
  D.BodyCross = atk(M.bodyCross, { hip: [0, -0.2, 0.02], spine: [24, 16, 0] }, { hip: [0.03, -0.26, 0.12], hipR: [0, 6, 0], spine: [26, -22, 0], head: [-10, -8, 0], rh: [0.02, 1.13, 0.76], re: [-0.5, 1.0, 0.3], rhR: [0, 0, 70], rfR: [12, -10, 0], rf: [-0.12, 0.11, -0.2], lh: [0.12, 1.3, 0.24] });
  D.BodyHook = atk(
    M.bodyHook,
    { hip: [0.05, -0.22, 0], hipR: [0, -38, 0], spine: [24, 22, 10], lh: [0.24, 1.1, 0.3] },
    { hip: [0.0, -0.24, 0.05], hipR: [0, -8, 0], spine: [24, -28, 4], head: [-6, -10, 0], lh: [0.0, 1.13, 0.48], le: [0.6, 1.1, 0.3], lhR: [0, 0, -80] }
  );

  /* ---------------- kicks (rear-leg roundhouse family + lead teep) */
  const roundhouse = (move, h, reach, lean) =>
    atk(
      move,
      { hip: [0.02, -0.05, 0.02], hipR: [0, -14, 0], spine: [6, 12, 0], rf: [-0.1, 0.5 + h * 0.1, -0.04], rk: [-0.6, 0.7 + h * 0.3, 0.6], rfR: [40, 0, 40], lfR: [0, 20, 0] },
      { hip: [0.08, 0.0 - h * 0.06, 0.02], hipR: [0, 46, -10 - h * 14], spine: [-4 - lean, -10, 10 + h * 10], head: [6, -20, -6 - h * 6], rf: [0.12, 0.42 + h * 0.8, reach], rk: [-0.8, 1.1 + h * 0.6, 0.5], rfR: [60, 0, 90], lh: [0.2, 1.42, 0.22], rh: [-0.34, 1.2 + h * 0.06, -0.12], lfR: [0, 55, 0], lf: [0.13, 0.09, 0.2] },
      { mid: { rf: [-0.18, 0.45, -0.1], rk: [-0.5, 0.8, 0.6], hipR: [0, -10, 0] } }
    );
  D.KickLow = roundhouse(M.kickLow, 0, 0.62, 2);
  D.KickBody = roundhouse(M.kickBody, 0.75, 0.72, 8);
  D.KickHead = roundhouse(M.kickHead, 1.35, 0.6, 22);
  D.KickFront = atk(
    M.kickFront,
    { hip: [0, -0.04, -0.02], hipR: [0, -20, 0], spine: [2, 14, 0], lf: [0.12, 0.62, 0.22], lk: [0.2, 1.2, 1], lfR: [30, 0, 0] },
    { hip: [0, -0.05, -0.12], hipR: [0, -20, 0], spine: [-12, 14, 0], head: [12, 6, 0], lf: [0.08, 0.98, 0.78], lk: [0.2, 1.3, 1], lfR: [-30, 0, 0], rf: [-0.14, 0.09, -0.24] },
    { mid: { lf: [0.13, 0.4, 0.3], lk: [0.3, 1.0, 1] } }
  );

  /* ---------------- hit reactions / stagger / knockdown */
  D.HitHead = { keys: [{ t: 0 }, { t: 0.06, e: "snap", hip: [0, -0.1, -0.08], spine: [-14, 24, 8], neck: [-14, 18, 0], head: [-18, 20, 6], lh: [0.2, 1.28, 0.18], rh: [-0.18, 1.32, 0.08] }, { t: 0.32 }] };
  D.HitHeadR = { keys: [{ t: 0 }, { t: 0.06, e: "snap", hip: [0, -0.1, -0.05], spine: [-4, -8, -10], neck: [-6, -24, -8], head: [-8, -30, -10], lh: [0.18, 1.28, 0.24], rh: [-0.18, 1.32, 0.1] }, { t: 0.32 }] };
  D.HitHeadL = { keys: [{ t: 0 }, { t: 0.06, e: "snap", hip: [0, -0.1, -0.05], spine: [-4, 30, 12], neck: [-6, 22, 10], head: [-8, 26, 12], lh: [0.18, 1.28, 0.24], rh: [-0.18, 1.32, 0.1] }, { t: 0.32 }] };
  D.HitUpper = { keys: [{ t: 0 }, { t: 0.06, e: "snap", hip: [0, -0.06, -0.08], spine: [-18, 14, 0], neck: [-20, 6, 0], head: [-28, 4, 0], lh: [0.24, 1.25, 0.2], rh: [-0.22, 1.28, 0.1] }, { t: 0.36 }] };
  D.HitBody = { keys: [{ t: 0 }, { t: 0.07, e: "snap", hip: [0, -0.18, -0.1], spine: [34, 10, -6], head: [-14, 4, 0], lh: [0.12, 1.1, 0.24], rh: [-0.06, 1.12, 0.14] }, { t: 0.4 }] };
  D.HitLeg = { keys: [{ t: 0 }, { t: 0.08, e: "snap", hip: [0.06, -0.15, -0.02], hipR: [0, -24, 8], spine: [16, 14, -10], lf: [0.2, 0.15, 0.16], lk: [0.6, 0.5, 0.6] }, { t: 0.42 }] };
  D.Rocked = {
    loop: true,
    keys: [
      { t: 0, hip: [0.04, -0.14, -0.04], spine: [14, 10, 8], head: [16, 10, 12], lh: [0.2, 1.15, 0.24], rh: [-0.16, 1.18, 0.12] },
      { t: 0.5, hip: [-0.05, -0.17, 0.01], spine: [18, 18, -8], head: [22, 0, -12], lh: [0.18, 1.1, 0.26], rh: [-0.18, 1.12, 0.1], lf: [0.16, 0.09, 0.18], rf: [-0.1, 0.09, -0.22] },
      { t: 1.0, hip: [0.04, -0.14, -0.04], spine: [14, 10, 8], head: [16, 10, 12], lh: [0.2, 1.15, 0.24], rh: [-0.16, 1.18, 0.12] },
    ],
  };
  // lying on the canvas after a knockdown / KO (matches the end of the library fall clips)
  D.Down = { base: LYING, loop: true, keys: [{ t: 0, lf: [0.28, 0.1, 0.62], rf: [-0.24, 0.24, 0.45], rk: [-0.35, 1.0, 0.6] }, { t: 1.5, lf: [0.28, 0.1, 0.63], rf: [-0.24, 0.25, 0.44], rk: [-0.35, 1.0, 0.6], hip: [0, -0.745, 0.005] }, { t: 3, lf: [0.28, 0.1, 0.62], rf: [-0.24, 0.24, 0.45], rk: [-0.35, 1.0, 0.6] }] };
  D.KOLie = { base: LYING, loop: true, keys: [{ t: 0, hip: [0, -0.78, 0], spine: [-6, 0, 6], neck: [-6, 30, 0], head: [-4, 28, 0], lh: [0.45, 0.12, -0.3], le: [0.6, 0.4, 0], rh: [-0.4, 0.12, -0.55], re: [-0.6, 0.4, -0.3], lf: [0.32, 0.1, 0.62], rf: [-0.2, 0.1, 0.64] }, { t: 2, hip: [0, -0.78, 0], spine: [-6, 0, 6], neck: [-6, 30, 0], head: [-4, 28, 0], lh: [0.45, 0.12, -0.3], le: [0.6, 0.4, 0], rh: [-0.4, 0.12, -0.55], re: [-0.6, 0.4, -0.3], lf: [0.32, 0.1, 0.62], rf: [-0.2, 0.1, 0.64] }] };

  /* ---------------- clinch (collar tie; both fighters use the same pose, face to face ~0.45 m apart) */
  const CLINCH = { hip: [0, -0.1, 0.03], hipR: [0, -8, 0], spine: [24, 4, 0], neck: [10, 0, 0], head: [8, 0, 0], lh: [0.12, 1.5, 0.42], le: [0.45, 1.3, 0.3], rh: [-0.12, 1.5, 0.44], re: [-0.45, 1.3, 0.3], lhR: [0, 0, -60], rhR: [0, 0, 60], lf: [0.16, 0.09, 0.12], rf: [-0.16, 0.09, -0.2], lfR: [0, -8, 0], rfR: [0, -20, 0] };
  D.Clinch = { base: CLINCH, loop: true, keys: [{ t: 0 }, { t: 0.8, hip: [0.02, -0.12, 0.03], spine: [26, 6, 3] }, { t: 1.6 }] };
  D.ClinchHeld = { base: CLINCH, loop: true, keys: [{ t: 0, spine: [34, 0, 0], head: [20, 0, 0], lh: [0.18, 1.2, 0.3], rh: [-0.18, 1.22, 0.28], le: [0.4, 1.0, 0.1], re: [-0.4, 1.0, 0.1] }, { t: 0.8, spine: [36, 2, 2], head: [22, 0, 0], lh: [0.18, 1.2, 0.3], rh: [-0.18, 1.22, 0.28], le: [0.4, 1.0, 0.1], re: [-0.4, 1.0, 0.1] }, { t: 1.6, spine: [34, 0, 0], head: [20, 0, 0], lh: [0.18, 1.2, 0.3], rh: [-0.18, 1.22, 0.28], le: [0.4, 1.0, 0.1], re: [-0.4, 1.0, 0.1] }] };
  D.Knee = { base: CLINCH, keys: attackKeys(M.knee, { rf: [-0.14, 0.3, -0.3], rk: [-0.2, 0.6, 1] }, { hip: [0, -0.04, 0.0], hipR: [0, 4, 0], spine: [30, 0, 0], rf: [-0.1, 0.5, 0.0], rk: [-0.1, 1.2, 1], rfR: [-50, 0, 0], lh: [0.12, 1.42, 0.4], rh: [-0.12, 1.42, 0.42] }) };
  D.Elbow = { base: CLINCH, keys: attackKeys(M.elbow, { rh: [-0.4, 1.5, 0.08], re: [-0.6, 1.7, 0], spine: [24, 24, 0] }, { rh: [0.18, 1.48, 0.22], re: [0.0, 1.55, 0.6], spine: [24, -24, 0], hipR: [0, 10, 0] }) };
  D.ShortPunch = { base: CLINCH, keys: attackKeys(M.shortPunch, { lh: [0.12, 1.05, 0.22], le: [0.4, 0.9, 0] }, { lh: [0.06, 1.42, 0.36], le: [0.3, 0.9, 0.3], spine: [18, -8, 0] }) };
  D.ClinchBreak = { base: CLINCH, keys: [{ t: 0 }, { t: 0.18, e: "snap", lh: [0.14, 1.35, 0.55], rh: [-0.14, 1.35, 0.55], spine: [10, 4, 0], hip: [0, -0.08, -0.08] }, { t: 0.45, ...STANCE }] };

  /* ---------------- takedowns */
  const SHOT = { hip: [0, -0.42, 0.25], hipR: [0, -10, 0], spine: [52, 4, 0], neck: [-24, 0, 0], head: [-22, 0, 0], lh: [0.25, 0.85, 0.75], le: [0.5, 0.8, 0.3], rh: [-0.25, 0.85, 0.75], re: [-0.5, 0.8, 0.3], lf: [0.15, 0.09, 0.62], lk: [0.3, 0.4, 1], rf: [-0.15, 0.06, -0.38], rk: [-0.2, 0.1, 1], rfR: [-55, 0, 0] };
  D.Shoot = { keys: [{ t: 0 }, { t: 0.18, e: "out", hip: [0, -0.3, 0.05], spine: [36, 8, 0], lh: [0.22, 1.05, 0.45], rh: [-0.2, 1.05, 0.4] }, { t: 0.4, e: "in", ...SHOT }, { t: 0.7, ...SHOT }] };
  D.Sprawl = { keys: [{ t: 0 }, { t: 0.18, e: "snap", hip: [0, -0.5, -0.3], hipR: [12, 0, 0], spine: [44, 0, 0], head: [-14, 0, 0], lh: [0.22, 0.5, 0.42], rh: [-0.22, 0.5, 0.42], lf: [0.25, 0.09, -0.7], rf: [-0.25, 0.09, -0.75], lk: [0.4, 0.2, -1], rk: [-0.4, 0.2, -1], lfR: [-60, 0, 0], rfR: [-60, 0, 0] }, { t: 0.7, hip: [0, -0.5, -0.3], hipR: [12, 0, 0], spine: [44, 0, 0], head: [-14, 0, 0], lh: [0.22, 0.5, 0.42], rh: [-0.22, 0.5, 0.42], lf: [0.25, 0.09, -0.7], rf: [-0.25, 0.09, -0.75], lk: [0.4, 0.2, -1], rk: [-0.4, 0.2, -1], lfR: [-60, 0, 0], rfR: [-60, 0, 0] }, { t: 1.1 }] };
  D.ShotStuffed = { keys: [{ t: 0, ...SHOT }, { t: 0.35, ...SHOT, hip: [0, -0.62, 0.15], spine: [62, 4, 0] }, { t: 0.9 }] };
  // the takedown finishes with the attacker landing in the defender's guard
  D.TakedownB = { keys: [{ t: 0 }, { t: 0.25, hip: [0, -0.1, -0.18], spine: [-14, 0, 0], head: [-10, 0, 0], lh: [0.3, 1.3, 0.1], rh: [-0.3, 1.3, 0.1], lf: [0.12, 0.2, 0.1], rf: [-0.12, 0.09, 0.0] }, { t: 0.55, e: "in", hip: [0, -0.55, -0.35], hipR: [-50, 0, 0], spine: [-10, 0, 0], head: [16, 0, 0], lh: [0.35, 0.7, -0.4], rh: [-0.35, 0.7, -0.4], lf: [0.2, 0.5, 0.4], rf: [-0.2, 0.5, 0.4] }, { t: 0.9, ...LYING }] };

  /* ---------------- ground positions (pairs) */
  // FULL GUARD — bottom on back, legs wrapped round the kneeling top fighter
  const GUARD_B = { ...LYING, lf: [0.12, 0.42, 0.85], lk: [0.6, 0.6, 0.6], rf: [-0.12, 0.42, 0.85], rk: [-0.6, 0.6, 0.6], lfR: [0, -60, 0], rfR: [0, 60, 0], lh: [0.18, 0.75, 0.15], le: [0.5, 0.4, 0], rh: [-0.18, 0.75, 0.15], re: [-0.5, 0.4, 0], neck: [24, 0, 0], head: [16, 0, 0] };
  const GUARD_T = { ...KNEEL, ...top("guard", { lh: [0.16, 0.42, 0.0], le: [0.5, 0.6, 0.4], rh: [-0.16, 0.42, 0.0], re: [-0.5, 0.6, 0.4] }), hipR: [24, 0, 0], spine: [26, 0, 0], neck: [-10, 0, 0], head: [-6, 0, 0] };
  // HALF GUARD — one of top's legs trapped
  const HALF_B = { ...LYING, hipR: [-84, 0, -16], lf: [-0.1, 0.32, 0.62], lk: [0.4, 0.8, 0.5], rf: [-0.05, 0.18, 0.62], rk: [-0.5, 0.8, 0.2], lfR: [0, -70, 0], lh: [-0.05, 0.5, 0.1], le: [0.4, 0.5, 0.2], rh: [-0.22, 0.6, 0.0], re: [-0.5, 0.3, -0.1], neck: [20, 0, 0] };
  const HALF_T = { ...KNEEL, hip: [0, -0.56, 0], hipR: [44, 0, 0], spine: [32, 0, 0], head: [-14, 0, 0], ...top("half", { lh: [0.25, 0.1, -0.35], le: [0.6, 0.5, 0], rh: [-0.28, 0.1, -0.2], re: [-0.6, 0.5, 0], lf: [0.1, 0.09, 0.95], rf: [-0.25, 0.12, 0.62] }), lfR: [-80, 0, 0], rfR: [-40, 0, 0] };
  // SIDE CONTROL — top perpendicular across the chest
  const SIDE_B = { ...LYING, hipR: [-88, 0, -10], lf: [0.2, 0.25, 0.55], rf: [-0.15, 0.25, 0.5], lh: [0.25, 0.45, -0.1], le: [0.5, 0.4, 0.2], rh: [0.1, 0.5, -0.35], re: [-0.2, 0.6, -0.3], neck: [6, 0, 0] };
  const SIDE_T = { ...KNEEL, hip: [0, -0.6, 0], hipR: [55, 0, 0], spine: [32, 0, 0], neck: [-14, 0, 0], head: [-14, 0, 0], ...top("side", { lh: [-0.25, 0.1, -0.55], le: [0.0, 0.6, -0.8], rh: [-0.15, 0.1, 0.25], re: [0.0, 0.6, 0.5], lf: [0.95, 0.09, -0.45], rf: [0.92, 0.09, 0.2] }), lfR: [-80, 0, 0], rfR: [-80, 0, 0], lk: [0, 0.1, 1], rk: [0, 0.1, 1] };
  // MOUNT — top sits on the hips, knees on the canvas
  const MOUNT_B = { ...LYING, lf: [0.25, 0.1, 0.62], rf: [-0.25, 0.1, 0.62], lk: [0.6, 0.5, 0.3], rk: [-0.6, 0.5, 0.3], lh: [0.2, 0.62, 0.0], le: [0.5, 0.35, -0.1], rh: [-0.2, 0.62, 0.0], re: [-0.5, 0.35, -0.1], neck: [20, 0, 0] };
  const MOUNT_T = { hip: [0, -0.62, 0], hipR: [10, 0, 0], spine: [10, 0, 0], neck: [-4, 0, 0], head: [8, 0, 0], ...top("mount", { lh: [0.22, 0.75, -0.1], le: [0.5, 0.6, 0.3], rh: [-0.22, 0.75, -0.1], re: [-0.5, 0.6, 0.3], lf: [-0.32, 0.08, 0.38], rf: [0.32, 0.08, 0.38], lk: [-0.5, 0.15, -0.2], rk: [0.5, 0.15, -0.2] }), lfR: [-80, 0, 0], rfR: [-80, 0, 0], lhR: [0, 0, 0], rhR: [0, 0, 0] };
  // BACK CONTROL — both seated, top behind with hooks in (rear-naked choke position)
  const BACK_B = { hip: [0, -0.72, 0], hipR: [-24, 0, 0], spine: [20, 0, 0], neck: [6, 0, 0], head: [6, 0, 0], lh: [0.14, 0.72, 0.2], le: [0.45, 0.6, 0.0], rh: [-0.14, 0.72, 0.2], re: [-0.45, 0.6, 0.0], lf: [0.25, 0.09, 0.62], rf: [-0.25, 0.09, 0.62], lk: [0.4, 1, 0.4], rk: [-0.4, 1, 0.4], lfR: [-30, 0, 0], rfR: [-30, 0, 0] };
  const BACK_T = { hip: [0, -0.74, 0], hipR: [-30, 0, 0], spine: [32, 0, 0], neck: [8, 0, 0], head: [10, 0, 0], ...top("back", { lh: [0.22, 0.72, 0.02], le: [0.45, 0.7, -0.3], rh: [-0.22, 0.72, 0.02], re: [-0.45, 0.7, -0.3], lf: [0.12, 0.22, 0.35], rf: [-0.12, 0.22, 0.35], lk: [0.6, 0.6, -0.1], rk: [-0.6, 0.6, -0.1] }), lfR: [0, 40, 0], rfR: [0, -40, 0] };

  D.TakedownA = { keys: [{ t: 0, ...SHOT }, { t: 0.35, ...SHOT, hip: [0, -0.32, 0.45], spine: [40, 0, 0], lh: [0.25, 0.75, 0.95], rh: [-0.25, 0.75, 0.95], lf: [0.15, 0.09, 0.7], rf: [-0.15, 0.09, 0.0] }, { t: 0.9, ...GUARD_T }] };
  D.TakedownB.keys[3] = { t: 0.9, ...GUARD_B };

  const breathe = (P, dy = 0.012) => ({ base: P, loop: true, keys: [{ t: 0 }, { t: 1.1, hip: [P.hip[0], P.hip[1] + dy, P.hip[2]] }, { t: 2.2 }] });
  Object.assign(D, {
    GuardB: breathe(GUARD_B, 0.01),
    GuardT: breathe(GUARD_T),
    HalfB: breathe(HALF_B, 0.01),
    HalfT: breathe(HALF_T),
    SideB: breathe(SIDE_B, 0.01),
    SideT: breathe(SIDE_T),
    MountB: breathe(MOUNT_B, 0.008),
    MountT: breathe(MOUNT_T),
    BackB: breathe(BACK_B, 0.008),
    BackT: breathe(BACK_T),
  });
  // ground strikes: top punches down to the bottom fighter's face; bottom punches up
  const gnp = (pos, P, hand, at) => {
    const k = hand === "rh" ? "rh" : "lh";
    const tgt = top(pos, { [k]: at })[k];
    return {
      base: P,
      keys: [{ t: 0 }, { t: 0.14, e: "out", [k]: [P[k][0], P[k][1] + 0.18, P[k][2] - 0.05], spine: [P.spine[0] - 8, P.spine[1] + (k === "rh" ? 16 : -16), 0] }, { t: 0.26, e: "in", [k]: tgt, spine: [P.spine[0] + 12, P.spine[1] + (k === "rh" ? -14 : 14), 0] }, { t: 0.32, [k]: tgt, spine: [P.spine[0] + 12, P.spine[1] + (k === "rh" ? -14 : 14), 0] }, { t: 0.58 }],
    };
  };
  const face = [0, 0.32, -0.62]; // bottom fighter's face in the pair frame
  D.GuardT_Punch = gnp("guard", GUARD_T, "rh", face);
  D.HalfT_Punch = gnp("half", HALF_T, "rh", face);
  D.SideT_Punch = gnp("side", SIDE_T, "rh", [0.0, 0.3, -0.6]);
  D.MountT_Punch = gnp("mount", MOUNT_T, "rh", face);
  D.MountT_PunchL = gnp("mount", MOUNT_T, "lh", face);
  D.BackT_Punch = gnp("back", BACK_T, "rh", [-0.1, 1.48, 0.18]);
  const upPunch = (P, k) => ({ base: P, keys: [{ t: 0 }, { t: 0.12, e: "out", [k]: [P[k][0], P[k][1] - 0.05, P[k][2] - 0.08] }, { t: 0.24, e: "in", [k]: [0, 0.95, 0.42] }, { t: 0.3, [k]: [0, 0.95, 0.42] }, { t: 0.55 }] });
  D.GuardB_Punch = upPunch(GUARD_B, "rh");
  D.HalfB_Punch = upPunch(HALF_B, "rh");
  // defensive cover on the bottom
  const cover = (P) => ({ base: P, loop: true, keys: [{ t: 0, lh: [0.08, 0.5, -0.52], rh: [-0.08, 0.5, -0.5], le: [0.3, 0.6, -0.1], re: [-0.3, 0.6, -0.1], head: [24, 0, 0] }, { t: 1, lh: [0.08, 0.51, -0.52], rh: [-0.08, 0.51, -0.5], le: [0.3, 0.6, -0.1], re: [-0.3, 0.6, -0.1], head: [24, 0, 0] }] });
  D.GuardB_Cover = cover(GUARD_B);
  D.HalfB_Cover = cover(HALF_B);
  D.SideB_Cover = cover(SIDE_B);
  D.MountB_Cover = cover(MOUNT_B);
  // hip-bump / scramble used for escapes, sweeps and position changes
  const scramble = (P, dx) => ({ base: P, keys: [{ t: 0 }, { t: 0.25, e: "out", hip: [P.hip[0] + dx, P.hip[1] + 0.12, P.hip[2]], hipR: [P.hipR[0] + 10, P.hipR[1], P.hipR[2] + (dx > 0 ? 20 : -20)] }, { t: 0.6 }] });
  D.GuardB_Scramble = scramble(GUARD_B, 0.1);
  D.HalfB_Scramble = scramble(HALF_B, -0.1);
  D.SideB_Scramble = scramble(SIDE_B, 0.12);
  D.MountB_Scramble = scramble(MOUNT_B, 0.08);
  D.BackB_Scramble = scramble(BACK_B, 0.1);
  const posture = (P) => ({ base: P, keys: [{ t: 0 }, { t: 0.3, e: "out", hip: [P.hip[0], P.hip[1] + 0.08, P.hip[2]], spine: [P.spine[0] - 14, P.spine[1], P.spine[2]] }, { t: 0.6 }] });
  D.GuardT_Pass = posture(GUARD_T);
  D.HalfT_Pass = posture(HALF_T);
  D.SideT_Pass = posture(SIDE_T);
  D.MountT_Pass = posture(MOUNT_T);
  D.BackT_Pass = posture(BACK_T);

  /* ---------------- submissions (looped struggle) */
  // ARMBAR from guard: bottom swings a leg over the head, extends the arm across the hips
  const ARMBAR_B = { ...GUARD_B, hipR: [-80, 0, 20], hip: [0.05, -0.72, 0.15], lf: [0.25, 0.55, 0.62], lk: [0.6, 1.0, 0.3], rf: [-0.35, 0.32, 0.65], rk: [-0.7, 0.8, 0.3], lh: [0.0, 0.62, 0.32], rh: [-0.06, 0.66, 0.36], le: [0.4, 0.3, 0.0], re: [-0.4, 0.3, 0.0] };
  const ARMBAR_T = { ...GUARD_T, spine: [34, 0, 0], ...top("guard", { lh: [-0.02, 0.62, 0.3], le: [0.4, 0.9, 0.5], rh: [-0.16, 0.42, 0.05], re: [-0.5, 0.6, 0.4] }) };
  // GUILLOTINE from guard: bottom wraps the head of the postured-down top fighter
  const GUIL_B = { ...GUARD_B, hipR: [-74, 0, 0], spine: [-10, 0, 0], neck: [30, 0, 0], lh: [0.08, 0.7, -0.05], le: [0.4, 0.75, -0.2], rh: [-0.06, 0.62, 0.05], re: [-0.4, 0.75, -0.2] };
  const GUIL_T = { ...GUARD_T, hip: [0, -0.56, 0], hipR: [58, 0, 0], spine: [40, 0, 0], neck: [12, 0, 0], head: [24, 0, 0], ...top("guard", { lh: [0.3, 0.06, -0.3], rh: [-0.3, 0.06, -0.3], le: [0.6, 0.5, 0], re: [-0.6, 0.5, 0] }) };
  // REAR-NAKED CHOKE from back control
  const RNC_B = { ...BACK_B, spine: [14, 0, 0], neck: [-10, 0, 0], head: [-14, 0, 0], lh: [0.09, 0.86, 0.0], rh: [-0.07, 0.84, 0.02], le: [0.4, 0.6, 0.3], re: [-0.4, 0.6, 0.3] };
  const RNC_T = { ...BACK_T, spine: [22, 0, 0], head: [16, 10, 0], ...top("back", { lh: [-0.1, 0.84, -0.06], le: [0.3, 0.8, -0.05], rh: [0.06, 0.95, -0.28], re: [-0.3, 0.95, -0.3] }) };
  const struggle = (P, amp) => ({ base: P, loop: true, keys: [{ t: 0 }, { t: 0.35, hip: [P.hip[0] + amp, P.hip[1] + 0.01, P.hip[2]], spine: [P.spine[0] + 4, P.spine[1] + 6, P.spine[2]] }, { t: 0.7 }] });
  Object.assign(D, {
    // armbar & guillotine: attacker is the bottom fighter of the "guard" layout;
    // rear-naked choke: attacker is the top (behind) fighter of the "back" layout
    Armbar_Att: struggle(ARMBAR_B, 0.02),
    Armbar_Def: struggle(ARMBAR_T, -0.02),
    Guillotine_Att: struggle(GUIL_B, 0.015),
    Guillotine_Def: struggle(GUIL_T, -0.02),
    RNC_Att: struggle(RNC_T, 0.01),
    RNC_Def: struggle(RNC_B, -0.015),
  });
  D.TapOut = { base: RNC_B, keys: [{ t: 0 }, { t: 0.15, lh: [0.3, 1.0, 0.1] }, { t: 0.3, lh: [0.3, 0.9, 0.1] }, { t: 0.45, lh: [0.3, 1.0, 0.1] }, { t: 0.6, lh: [0.3, 0.9, 0.1] }] };

  /* ---------------- stand-up from the ground, results */
  D.StandUp = { base: LYING, keys: [{ t: 0 }, { t: 0.35, hip: [0, -0.62, -0.05], hipR: [-45, 0, 0], spine: [20, 0, 0], lh: [0.3, 0.08, -0.25], rh: [-0.3, 0.12, -0.2], lf: [0.2, 0.09, 0.4], rf: [-0.2, 0.09, 0.35] }, { t: 0.75, hip: [0, -0.35, 0.0], hipR: [10, 0, 0], spine: [40, 0, 0], lh: [0.25, 0.5, 0.25], rh: [-0.25, 0.6, 0.0], lf: [0.15, 0.09, 0.3], rf: [-0.18, 0.09, -0.2] }, { t: 1.1, base: "stance", ...STANCE }] };
  D.Victory = { base: { ...STANCE, hipR: [0, 0, 0], spine: [-6, 0, 0], head: [-14, 0, 0], neck: [-6, 0, 0], lf: [0.16, 0.09, 0.04], rf: [-0.16, 0.09, -0.04], lfR: [0, 0, 0], rfR: [0, 0, 0] }, loop: true, keys: [{ t: 0, lh: [0.42, 2.1, 0.08], rh: [-0.42, 2.1, 0.08], le: [0.8, 1.6, 0], re: [-0.8, 1.6, 0] }, { t: 0.6, lh: [0.38, 2.14, 0.12], rh: [-0.38, 2.14, 0.12], le: [0.8, 1.6, 0], re: [-0.8, 1.6, 0], hip: [0, 0.01, 0] }, { t: 1.2, lh: [0.42, 2.1, 0.08], rh: [-0.42, 2.1, 0.08], le: [0.8, 1.6, 0], re: [-0.8, 1.6, 0] }] };
  D.Defeat = { base: { ...STANCE, hip: [0, -0.02, 0], hipR: [0, 0, 0], spine: [16, 0, 0], neck: [18, 0, 0], head: [24, 0, 0], lf: [0.15, 0.09, 0.03], rf: [-0.15, 0.09, -0.03], lfR: [0, 0, 0], rfR: [0, 0, 0], lh: [0.2, 1.0, 0.0], rh: [-0.2, 1.0, 0.0], le: [0.6, 1.0, -0.4], re: [-0.6, 1.0, -0.4] }, loop: true, keys: [{ t: 0 }, { t: 1.5, hip: [0, -0.03, 0] }, { t: 3 }] };
  D.Walkout = { base: { ...STANCE, hip: [0, -0.02, 0], hipR: [0, 0, 0], spine: [0, 0, 0], head: [0, 0, 0], neck: [0, 0, 0], lf: [0.13, 0.09, 0.05], rf: [-0.13, 0.09, -0.05], lfR: [0, 0, 0], rfR: [0, 0, 0] }, loop: true, keys: [{ t: 0, lh: [0.3, 0.95, 0.1], rh: [-0.3, 0.95, 0.1], le: [0.6, 1.2, -0.3], re: [-0.6, 1.2, -0.3] }, { t: 0.25, lh: [0.26, 1.35, 0.32], rh: [-0.3, 0.95, 0.1], spine: [6, -10, 0], le: [0.6, 1.2, -0.3], re: [-0.6, 1.2, -0.3], hip: [0, -0.04, 0] }, { t: 0.5, lh: [0.3, 0.95, 0.1], rh: [-0.3, 0.95, 0.1], le: [0.6, 1.2, -0.3], re: [-0.6, 1.2, -0.3] }, { t: 0.75, rh: [-0.26, 1.35, 0.32], lh: [0.3, 0.95, 0.1], spine: [6, 10, 0], le: [0.6, 1.2, -0.3], re: [-0.6, 1.2, -0.3], hip: [0, -0.04, 0] }, { t: 1.0, lh: [0.3, 0.95, 0.1], rh: [-0.3, 0.95, 0.1], le: [0.6, 1.2, -0.3], re: [-0.6, 1.2, -0.3] }] };
  return D;
}

/** Build every authored clip on a clone of the fighter skeleton. */
export function buildAuthoredClips(fighterScene) {
  const rig = skClone(fighterScene);
  rig.position.set(0, 0, 0);
  rig.quaternion.identity();
  rig.scale.set(1, 1, 1);
  const poser = createPoser(rig);
  const out = {};
  for (const [name, def] of Object.entries(clipDefs())) {
    // a key may switch the base mid-clip ("stance"/"kneel") — resolve it here
    const keys = def.keys.map((k) => {
      if (k.base === "stance") return { ...STANCE, ...k, base: undefined };
      if (k.base === "kneel") return { ...KNEEL, ...k, base: undefined };
      return k;
    });
    out[name] = bakeClip(poser, name, keys, { base: def.base || STANCE, loop: !!def.loop });
  }
  return out;
}

export { createPoser };
