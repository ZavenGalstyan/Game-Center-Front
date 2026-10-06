/**
 * Rooftop Dash — the runner: model + procedural animation.
 *
 *  root (feet position, yaw)            local frame: +Z forward, +X = LEFT, +Y up
 *   ├ body (pelvis offset / lean)
 *   │   ├ pelvis mesh
 *   │   └ spine → chest (hoodie) → neck → head (hair, face, hood)
 *   └ limbs: thigh/shin/shoe and upper-arm/forearm/hand segments, placed every
 *     frame by 2-bone IK from targets computed by the pose for the CURRENT
 *     ENGINE STATE (never from a guess):
 *        - locomotion feet are planted: stance-foot position comes from the
 *          engine's distance-driven stride phase, so foot speed = body speed;
 *        - vault hands are planted on the obstacle top, ledge hands on the
 *          lip, the wall-run hand on the wall plane — all from engine data.
 *
 * Poses cross-fade for ~0.12 s on a visual state change; locomotion is one
 * continuous pose family (walk → run → sprint) so it never cross-fades.
 */
import * as THREE from "three";
import { STATES as S } from "../engine/config.js";

/* ------------------------------------------------------------------ dimensions */
const D = {
  pelvisY: 0.99,
  hipX: 0.1,
  thigh: 0.47,
  shin: 0.46,
  ankle: 0.075,
  spine: 0.26,
  chest: 0.24,
  shoulderX: 0.2,
  shoulderY: 0.2, // above chest base
  upper: 0.29,
  fore: 0.27,
  neck: 0.09,
};
const LEG = D.thigh + D.shin;

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ outfits */
export const OUTFITS = [
  { id: "street", name: "Street Runner", stars: 0, hoodie: "#e8743b", hood2: "#c85a26", pants: "#2c3442", shoes: "#f2f2f2", sole: "#ff8a3d", accent: "#ffd166", skin: "#c98b62", hair: "#2a1d17", gloves: "#3a3a3a", wrap: "#f4efe6" },
  { id: "sunset", name: "Sunset Hoodie", stars: 10, hoodie: "#ff9f5a", hood2: "#ef6f6c", pants: "#3d2c3e", shoes: "#2b2b2b", sole: "#ffd166", accent: "#ffe0b3", skin: "#8d5a3c", hair: "#140d0a", gloves: "#262626", wrap: "#ff6f6c" },
  { id: "blue", name: "Urban Blue", stars: 25, hoodie: "#3e7cc9", hood2: "#2b5ea3", pants: "#1f2733", shoes: "#e9eef5", sole: "#4fc3ff", accent: "#9fd8ff", skin: "#e2b08c", hair: "#5a3a22", gloves: "#1b2430", wrap: "#dfe9f5" },
  { id: "night", name: "Night Runner", stars: 45, hoodie: "#2a2d3a", hood2: "#1c1e28", pants: "#14161d", shoes: "#3a3f52", sole: "#b06bff", accent: "#b06bff", skin: "#a8714f", hair: "#0d0d10", gloves: "#0f0f14", wrap: "#7a5cff" },
  { id: "construct", name: "Construction Orange", stars: 65, hoodie: "#ff8f1f", hood2: "#d96f00", pants: "#495466", shoes: "#5a4532", sole: "#2e2e2e", accent: "#d8ff3d", skin: "#d39a72", hair: "#3b2a1c", gloves: "#f2c14e", wrap: "#d8ff3d" },
  { id: "skyline", name: "Skyline White", stars: 90, hoodie: "#f1f3f7", hood2: "#d4d9e3", pants: "#5b6b85", shoes: "#ffffff", sole: "#4fc3ff", accent: "#4fc3ff", skin: "#f0c7a4", hair: "#d8b26a", gloves: "#dde4ee", wrap: "#4fc3ff" },
  { id: "emerald", name: "Emerald Dash", stars: 115, hoodie: "#1fa67a", hood2: "#147a58", pants: "#1e2a26", shoes: "#f5f5f0", sole: "#ffd166", accent: "#b8ffdf", skin: "#7a4a32", hair: "#120b08", gloves: "#1e2a26", wrap: "#b8ffdf" },
  { id: "crimson", name: "Crimson Runner", stars: 140, hoodie: "#c6283b", hood2: "#931b2b", pants: "#1d1b22", shoes: "#1d1b22", sole: "#ff4f5e", accent: "#ffd166", skin: "#e8b48f", hair: "#7a2e1c", gloves: "#1d1b22", wrap: "#ffd166" },
];
export const outfitById = (id) => OUTFITS.find((o) => o.id === id) || OUTFITS[0];

/* ------------------------------------------------------------------ geometry helpers */
function lathe(pts, seg = 16, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}
function ell(rx, ry, rz, w = 18, h = 12) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}
/** limb segment hanging along -Y from its joint, tapered */
function limb(len, r0, r1, seg = 12) {
  const g = new THREE.CapsuleGeometry(1, 1, 4, seg);
  // reshape the unit capsule into a tapered limb of length `len`
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); // -1.5..1.5 (radius 1 caps + length 1)
    const t = clamp((1.5 - y) / 3, 0, 1); // 0 at the joint (top) → 1 at the far end
    const r = lerp(r0, r1, t);
    p.setX(i, p.getX(i) * r);
    p.setZ(i, p.getZ(i) * r);
    p.setY(i, -t * len);
  }
  g.computeVertexNormals();
  return g;
}
const mat = (color, rough = 0.78, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

/* ------------------------------------------------------------------ model */
export function buildRunner(outfitId = "street", { shadows = true } = {}) {
  const O = outfitById(outfitId);
  const M = {
    hoodie: mat(O.hoodie, 0.86),
    hood2: mat(O.hood2, 0.9),
    pants: mat(O.pants, 0.88),
    shoes: mat(O.shoes, 0.55),
    sole: mat(O.sole, 0.6),
    accent: mat(O.accent, 0.6),
    skin: mat(O.skin, 0.62),
    hair: mat(O.hair, 0.75),
    gloves: mat(O.gloves, 0.7),
    wrap: mat(O.wrap, 0.8),
    eye: mat("#1b1b22", 0.3),
    white: mat("#f5f1ea", 0.5),
  };
  const geos = [];
  const G = (g) => {
    geos.push(g);
    return g;
  };
  const mesh = (g, m, parent, pos, rot) => {
    const o = new THREE.Mesh(G(g), m);
    o.castShadow = shadows;
    o.receiveShadow = false;
    if (pos) o.position.set(...pos);
    if (rot) o.rotation.set(...rot);
    parent.add(o);
    return o;
  };

  const root = new THREE.Group();
  root.name = "runner";
  const body = new THREE.Group();
  root.add(body);

  /* pelvis + hoodie hem */
  const pelvis = new THREE.Group();
  body.add(pelvis);
  mesh(ell(0.165, 0.11, 0.115), M.pants, pelvis, [0, 0.0, 0]);
  // waistband
  mesh(new THREE.CylinderGeometry(0.168, 0.17, 0.05, 18), M.hood2, pelvis, [0, 0.085, 0]);

  /* spine → chest */
  const spine = new THREE.Group();
  spine.position.set(0, 0.06, 0);
  pelvis.add(spine);
  const chest = new THREE.Group();
  chest.position.set(0, D.spine * 0.55, 0);
  spine.add(chest);
  // hoodie torso: lathe (waist → chest → shoulders)
  const torso = lathe(
    [
      [0.0, -0.2],
      [0.168, -0.2],
      [0.178, -0.12],
      [0.19, 0.0],
      [0.205, 0.1],
      [0.21, 0.18],
      [0.19, 0.25],
      [0.12, 0.3],
      [0.0, 0.305],
    ],
    20,
    1.12,
    0.72,
  );
  mesh(torso, M.hoodie, chest, [0, 0.0, 0]);
  // kangaroo pocket
  mesh(new THREE.BoxGeometry(0.22, 0.085, 0.03), M.hood2, chest, [0, -0.1, 0.128], [0.12, 0, 0]);
  // zip / accent stripe down the front
  mesh(new THREE.BoxGeometry(0.018, 0.26, 0.012), M.accent, chest, [0, 0.07, 0.146], [-0.1, 0, 0]);
  // drawstrings
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), M.white, chest, [s * 0.045, 0.19, 0.12], [0.18, 0, 0]);
  // hood (down, resting on the upper back)
  const hood = lathe(
    [
      [0.0, -0.05],
      [0.09, -0.04],
      [0.13, 0.0],
      [0.12, 0.05],
      [0.06, 0.08],
      [0.0, 0.085],
    ],
    16,
    1.25,
    0.95,
  );
  mesh(hood, M.hood2, chest, [0, 0.27, -0.1], [0.9, 0, 0]);
  // sling bag strap across the chest + small bag on the back
  mesh(new THREE.BoxGeometry(0.035, 0.5, 0.012), M.gloves, chest, [0.0, 0.06, 0.142], [0, 0, 0.75]);
  mesh(new THREE.BoxGeometry(0.2, 0.13, 0.07), M.gloves, chest, [-0.05, -0.04, -0.15], [0, 0, 0.3]);
  mesh(new THREE.BoxGeometry(0.12, 0.02, 0.072), M.accent, chest, [-0.05, 0.01, -0.152], [0, 0, 0.3]);

  /* neck + head */
  const neck = new THREE.Group();
  neck.position.set(0, 0.29, 0.01);
  chest.add(neck);
  mesh(new THREE.CylinderGeometry(0.048, 0.055, 0.1, 10), M.skin, neck, [0, 0.03, 0]);
  const head = new THREE.Group();
  head.position.set(0, 0.1, 0.0);
  neck.add(head);
  mesh(ell(0.105, 0.125, 0.115), M.skin, head, [0, 0.07, 0.01]);
  // jaw / chin
  mesh(ell(0.08, 0.055, 0.075), M.skin, head, [0, 0.0, 0.035]);
  // ears
  for (const s of [-1, 1]) mesh(ell(0.018, 0.032, 0.022, 8, 6), M.skin, head, [s * 0.104, 0.065, 0.0]);
  // hair: cap + a swept fringe
  const hairCap = new THREE.SphereGeometry(1, 18, 10, 0, TAU, 0, Math.PI * 0.55);
  hairCap.scale(0.113, 0.12, 0.124);
  mesh(hairCap, M.hair, head, [0, 0.095, -0.005], [-0.18, 0, 0]);
  mesh(ell(0.09, 0.035, 0.05), M.hair, head, [0.02, 0.16, 0.075], [0.5, 0.2, -0.2]);
  mesh(ell(0.05, 0.03, 0.04), M.hair, head, [-0.05, 0.15, 0.08], [0.6, -0.3, 0.3]);
  // face: eyes, brows, nose
  for (const s of [-1, 1]) {
    mesh(ell(0.016, 0.02, 0.01, 8, 6), M.white, head, [s * 0.038, 0.075, 0.106]);
    mesh(ell(0.009, 0.012, 0.006, 6, 6), M.eye, head, [s * 0.038, 0.074, 0.114]);
    mesh(new THREE.BoxGeometry(0.032, 0.007, 0.01), M.hair, head, [s * 0.04, 0.103, 0.108], [0, 0, s * -0.12]);
  }
  mesh(ell(0.013, 0.022, 0.016, 8, 6), M.skin, head, [0, 0.045, 0.12]);
  mesh(new THREE.BoxGeometry(0.035, 0.006, 0.006), mat("#8a4a3a", 0.6), head, [0, 0.012, 0.112]);

  /* limbs (children of root, posed every frame) */
  const seg = (geo, m, name) => {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    mesh(geo, m, g);
    return g;
  };
  const limbs = {};
  for (const side of ["L", "R"]) {
    const s = side === "L" ? 1 : -1;
    // legs: joggers, tapered; cuff at the ankle
    limbs[`thigh${side}`] = seg(limb(D.thigh, 0.1, 0.074), M.pants, `thigh${side}`);
    const shin = seg(limb(D.shin, 0.074, 0.052), M.pants, `shin${side}`);
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), M.hood2, shin, [0, -D.shin + 0.03, 0]);
    limbs[`shin${side}`] = shin;
    // shoe: upper + sole + toe cap + accent swoosh-free stripe
    const foot = new THREE.Group();
    foot.name = `foot${side}`;
    root.add(foot);
    mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.06, 10), mat(O.wrap, 0.8), foot, [0, 0.0, -0.005]);
    const upper = new THREE.BoxGeometry(0.1, 0.075, 0.24, 2, 2, 3);
    {
      const p = upper.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const z = p.getZ(i);
        const y = p.getY(i);
        // round the toe down and the heel in
        if (z > 0.06) p.setY(i, y - (z - 0.06) * 0.35 * (y > 0 ? 1 : 0));
        p.setX(i, p.getX(i) * (z > 0.08 ? 0.86 : 1));
      }
      upper.computeVertexNormals();
    }
    mesh(upper, M.shoes, foot, [0, -0.035, 0.05]);
    mesh(new THREE.BoxGeometry(0.108, 0.03, 0.255), M.sole, foot, [0, -0.083, 0.05]);
    mesh(new THREE.BoxGeometry(0.104, 0.012, 0.05), M.accent, foot, [s * 0.0, -0.01, -0.045]);
    mesh(new THREE.BoxGeometry(0.012, 0.035, 0.12), M.accent, foot, [s * 0.052, -0.04, 0.04]);
    limbs[`foot${side}`] = foot;
    // arms: sleeve upper + sleeve forearm with cuff, wrist wrap, gloved hand
    limbs[`upper${side}`] = seg(limb(D.upper, 0.058, 0.048), M.hoodie, `upper${side}`);
    const fore = seg(limb(D.fore - 0.04, 0.047, 0.04), M.hoodie, `fore${side}`);
    mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.045, 10), M.hood2, fore, [0, -D.fore + 0.07, 0]);
    mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.05, 10), M.wrap, fore, [0, -D.fore + 0.025, 0]);
    limbs[`fore${side}`] = fore;
    const hand = new THREE.Group();
    hand.name = `hand${side}`;
    root.add(hand);
    mesh(new THREE.BoxGeometry(0.075, 0.085, 0.035), M.gloves, hand, [0, -0.045, 0]);
    mesh(new THREE.BoxGeometry(0.07, 0.04, 0.03), M.skin, hand, [0, -0.1, 0.004]);
    mesh(ell(0.016, 0.035, 0.016, 6, 6), M.gloves, hand, [s * 0.04, -0.045, 0.012], [0, 0, s * 0.5]);
    limbs[`hand${side}`] = hand;
  }

  const R = {
    root,
    body,
    pelvis,
    spine,
    chest,
    neck,
    head,
    limbs,
    outfit: O.id,
    pose: newPose(),
    prevPose: newPose(),
    blend: 1,
    blendT: 0.12,
    vstate: "idle",
    t: 0,
    landK: 0,
    idleT: 0,
    lookYaw: 0,
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of Object.values(M)) m.dispose();
    },
  };
  applyPose(R, R.pose);
  return R;
}

/* ------------------------------------------------------------------ pose data */
function newPose() {
  return {
    px: 0,
    py: D.pelvisY,
    pz: 0,
    pPitch: 0,
    pRoll: 0,
    pYaw: 0,
    cPitch: 0,
    cRoll: 0,
    cYaw: 0,
    hPitch: 0,
    hYaw: 0,
    fL: V3(D.hipX, D.ankle, 0.02),
    fR: V3(-D.hipX, D.ankle, 0.02),
    fLp: 0,
    fRp: 0,
    hL: V3(0.26, 0.92, 0.05),
    hR: V3(-0.26, 0.92, 0.05),
    kneeL: V3(0, 0, 1),
    kneeR: V3(0, 0, 1),
    elbL: V3(0.3, -0.2, -1),
    elbR: V3(-0.3, -0.2, -1),
  };
}
function copyPose(a, b) {
  for (const k of Object.keys(a)) {
    if (a[k] instanceof THREE.Vector3) b[k].copy(a[k]);
    else b[k] = a[k];
  }
}
function mixPose(a, b, t, out) {
  for (const k of Object.keys(a)) {
    if (a[k] instanceof THREE.Vector3) out[k].copy(a[k]).lerp(b[k], t);
    else out[k] = lerp(a[k], b[k], t);
  }
}

/* ------------------------------------------------------------------ IK + placement */
const _a = V3();
const _b = V3();
const _c = V3();
const _d = V3();
const _n = V3();
const DOWN = V3(0, -1, 0);
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();

/** 2-bone IK: returns the mid joint into `mid`; `end` may be pulled in if unreachable */
function solve2(root, end, l1, l2, hint, mid) {
  _a.subVectors(end, root);
  let dist = _a.length();
  const maxL = (l1 + l2) * 0.999;
  if (dist > maxL) {
    _a.multiplyScalar(maxL / dist);
    end.copy(root).add(_a);
    dist = maxL;
  }
  if (dist < 1e-4) {
    mid.copy(root).addScaledVector(hint, l1);
    return;
  }
  const dir = _b.copy(_a).divideScalar(dist);
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  // bend plane: hint made perpendicular to dir
  _n.copy(hint).addScaledVector(dir, -hint.dot(dir));
  if (_n.lengthSq() < 1e-6) _n.set(0, 0, 1).addScaledVector(dir, -dir.z);
  _n.normalize();
  mid.copy(root).addScaledVector(dir, l1 * cosA).addScaledVector(_n, l1 * sinA);
}

/** orient a segment group (mesh hanging along -Y) from a → b, keeping its local +Z near `fwd` */
function placeSeg(g, a, b, fwd) {
  g.position.copy(a);
  _c.subVectors(b, a).normalize();
  // build a basis: y = -dir, z = fwd ⟂ dir
  const y = _d.copy(_c).negate();
  _n.copy(fwd).addScaledVector(y, -fwd.dot(y));
  if (_n.lengthSq() < 1e-6) _n.set(0, 0, 1).addScaledVector(y, -y.z);
  _n.normalize();
  const x = _a.crossVectors(y, _n);
  _m.makeBasis(x, y, _n);
  g.quaternion.setFromRotationMatrix(_m);
}

const hipL = V3();
const hipR = V3();
const shL = V3();
const shR = V3();
const kneeP = V3();
const elbP = V3();
const tgt = V3();
const fwdZ = V3(0, 0, 1);
const tmpV = V3();

function applyPose(R, P) {
  const { body, pelvis, spine, chest, head, limbs, root } = R;
  body.position.set(P.px, P.py, P.pz);
  pelvis.rotation.set(P.pPitch, P.pYaw, P.pRoll, "YXZ");
  spine.rotation.set(P.cPitch * 0.45, P.cYaw * 0.5, P.cRoll * 0.5, "YXZ");
  chest.rotation.set(P.cPitch * 0.55, P.cYaw * 0.5, P.cRoll * 0.5, "YXZ");
  head.rotation.set(P.hPitch, P.hYaw, 0, "YXZ");
  root.updateMatrixWorld(true);
  // joint positions in ROOT space
  _m.copy(root.matrixWorld).invert();
  hipL.set(D.hipX, -0.04, 0).applyMatrix4(pelvis.matrixWorld).applyMatrix4(_m);
  hipR.set(-D.hipX, -0.04, 0).applyMatrix4(pelvis.matrixWorld).applyMatrix4(_m);
  shL.set(D.shoulderX, D.shoulderY, -0.01).applyMatrix4(chest.matrixWorld).applyMatrix4(_m);
  shR.set(-D.shoulderX, D.shoulderY, -0.01).applyMatrix4(chest.matrixWorld).applyMatrix4(_m);

  for (const side of ["L", "R"]) {
    const L = side === "L";
    const hip = L ? hipL : hipR;
    // ankle target from the foot target
    tgt.copy(L ? P.fL : P.fR);
    solve2(hip, tgt, D.thigh, D.shin, L ? P.kneeL : P.kneeR, kneeP);
    placeSeg(limbs[`thigh${side}`], hip, kneeP, fwdZ);
    tmpV.copy(tgt);
    placeSeg(limbs[`shin${side}`], kneeP, tmpV, fwdZ);
    const foot = limbs[`foot${side}`];
    foot.position.copy(tgt);
    foot.rotation.set(L ? P.fLp : P.fRp, 0, 0);
    // arm
    const sh = L ? shL : shR;
    tgt.copy(L ? P.hL : P.hR);
    solve2(sh, tgt, D.upper, D.fore, L ? P.elbL : P.elbR, elbP);
    placeSeg(limbs[`upper${side}`], sh, elbP, L ? P.elbL : P.elbR);
    placeSeg(limbs[`fore${side}`], elbP, tgt, fwdZ);
    const hand = limbs[`hand${side}`];
    hand.position.copy(tgt);
    hand.quaternion.copy(limbs[`fore${side}`].quaternion);
  }
}

/* ------------------------------------------------------------------ poses */

/** locomotion (idle → walk → run → sprint), continuous in speed; also crouch-walk */
function locoPose(out, sp, phase, t, opts) {
  const crouch = opts.crouch ? 1 : 0;
  const k = clamp(sp / 10, 0, 1); // 0 idle … 1 sprint
  const moving = clamp(sp / 0.6, 0, 1);
  const cycle = 0.9 + 0.37 * sp;
  // stance length (foot travel while planted) and its share of the cycle
  const S = sp < 0.05 ? 0 : clamp(0.38 + sp * 0.055, 0.42, 0.98) * (crouch ? 0.7 : 1);
  const st = clamp(S / cycle, 0.2, 0.62);
  const lift = lerp(0.1, 0.36, k) * (crouch ? 0.6 : 1);
  const kick = lerp(0.05, 0.32, clamp((sp - 3) / 7, 0, 1));
  const pelvisBase = lerp(D.pelvisY - 0.015, D.pelvisY - 0.075, k) - crouch * 0.42;
  const zc = -0.07 * k; // stance centred a touch behind the hip
  const foot = (ph, x, vec) => {
    const p = ((ph % 1) + 1) % 1;
    let y = D.ankle;
    let z;
    let pitch = 0;
    if (p < st) {
      const u = p / st;
      z = zc + S / 2 - u * S;
      // heel lift at toe-off
      y += Math.max(0, u - 0.6) * 0.18 * k;
      pitch = -Math.max(0, u - 0.55) * 0.9 * k;
    } else {
      const u = (p - st) / (1 - st);
      z = zc - S / 2 + S * smooth(u) - kick * Math.sin(Math.PI * Math.min(1, u * 1.35)) * (1 - u);
      y += lift * Math.sin(Math.PI * u) + kick * 0.9 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u);
      pitch = lerp(-0.6 * k, 0.15, u);
    }
    vec.set(x * moving + x * (1 - moving), y, z);
    return pitch;
  };
  out.fLp = foot(phase, D.hipX + 0.01, out.fL);
  out.fRp = foot(phase + 0.5, -D.hipX - 0.01, out.fR);
  if (moving < 1) {
    // settle into a relaxed stance as we stop
    const idleL = V3(D.hipX + 0.03, D.ankle, 0.05);
    const idleR = V3(-D.hipX - 0.03, D.ankle, -0.04);
    out.fL.lerp(idleL, 1 - moving);
    out.fR.lerp(idleR, 1 - moving);
    out.fLp *= moving;
    out.fRp *= moving;
  }
  // pelvis bob: lowest mid-stance, twice a cycle
  const q = (((phase * 2) % 1) + 1) % 1;
  const bob = moving * (sp < 3.5 ? 0.03 : 0.05) * Math.cos(TAU * q);
  out.py = pelvisBase - bob;
  out.px = 0;
  out.pz = 0.02 * k;
  out.pYaw = Math.sin(TAU * phase) * 0.16 * moving;
  out.pRoll = Math.sin(TAU * phase) * 0.04 * moving;
  out.pPitch = lerp(0.04, 0.16, k) + crouch * 0.35;
  out.cPitch = lerp(0.02, 0.24, k) + crouch * 0.3 + (opts.accelLean || 0);
  out.cYaw = -out.pYaw * 1.5;
  out.cRoll = 0;
  out.hPitch = -out.cPitch * 0.7 - out.pPitch * 0.6;
  out.hYaw = -out.cYaw * 0.6;
  // arms swing opposite the legs, elbows bent more with speed
  const swing = lerp(0.12, 0.42, k) * moving;
  const elbowBend = lerp(0.0, 0.3, k);
  const armPh = TAU * phase;
  const sY = pelvisBase + 0.48;
  const hand = (s, ph, vec) => {
    const z = Math.sin(ph) * swing;
    vec.set(s * (0.23 - 0.05 * k), sY - 0.42 + elbowBend * 0.55 + Math.max(0, z) * 0.55 * k, z + 0.04 + elbowBend * 0.18);
  };
  hand(1, armPh + Math.PI, out.hL);
  hand(-1, armPh, out.hR);
  out.kneeL.set(0.08, 0, 1);
  out.kneeR.set(-0.08, 0, 1);
  out.elbL.set(0.35, 0, -1);
  out.elbR.set(-0.35, 0, -1);
  // idle breathing / weight shift
  if (moving < 1) {
    const b = Math.sin(t * 1.7) * 0.008 * (1 - moving);
    out.py += b;
    out.cPitch += b * 2;
    out.hL.set(0.25, out.py - 0.06, 0.02 + b);
    out.hR.set(-0.25, out.py - 0.06, 0.02 - b);
    out.hL.lerp(V3(0.23, sY - 0.42 + elbowBend * 0.55, 0.04), moving);
    out.hR.lerp(V3(-0.23, sY - 0.42 + elbowBend * 0.55, 0.04), moving);
    out.elbL.set(0.5, 0, -1);
    out.elbR.set(-0.5, 0, -1);
  }
}

/** idle variations for the menu: stretch / hands on hips / look over the city */
function menuPose(out, t) {
  locoPose(out, 0, 0, t, {});
  const cyc = t % 14;
  if (cyc < 5) {
    // hands on hips, weight on one leg, looking out
    out.hL.set(0.25, D.pelvisY + 0.03, -0.02);
    out.hR.set(-0.25, D.pelvisY + 0.03, -0.02);
    out.elbL.set(1, 0, -0.4);
    out.elbR.set(-1, 0, -0.4);
    out.pRoll = 0.05;
    out.px = 0.03;
    out.hYaw = Math.sin(t * 0.5) * 0.35;
    out.hPitch = -0.08;
  } else if (cyc < 9.5) {
    // overhead stretch
    const u = smooth(clamp((cyc - 5) / 0.8, 0, 1)) * smooth(clamp((9.5 - cyc) / 0.8, 0, 1));
    out.hL.lerp(V3(0.08, D.pelvisY + 1.02, 0.06), u);
    out.hR.lerp(V3(-0.08, D.pelvisY + 1.02, 0.06), u);
    out.elbL.set(1, 0.2, 0);
    out.elbR.set(-1, 0.2, 0);
    out.cRoll = Math.sin((cyc - 5) * 1.1) * 0.18 * u;
    out.hPitch = -0.15 * u;
    out.py += 0.01 * u;
  } else {
    // shake out the arms, glance back
    out.hL.x += Math.sin(t * 9) * 0.03;
    out.hR.x -= Math.sin(t * 9 + 1) * 0.03;
    out.hYaw = Math.sin((cyc - 9.5) * 1.4) * 0.8;
  }
}

/* ------------------------------------------------------------------ main update */
const _local = V3();
/** world point → runner-root local */
function toLocal(R, x, y, z, out) {
  out.set(x, y, z);
  return R.root.worldToLocal(out);
}

/**
 * Pose the runner for this frame from the engine player `P`.
 * world: for ground height under the runner (vault/ledge hand targets come from P).
 */
export function updateRunner(R, P, dt, ctx = {}) {
  R.t += dt;
  const root = R.root;
  // root follows the engine (smooth only the step-up pop on the visual y)
  root.position.x = P.x;
  root.position.z = P.z;
  const ty = P.y;
  if (ctx.snap || Math.abs(root.position.y - ty) > 0.6 || P.state === S.VAULT || P.state === S.LEDGE || P.state === S.WALLRUN || !P.grounded) root.position.y = ty;
  else root.position.y += (ty - root.position.y) * (1 - Math.exp(-28 * dt));
  root.rotation.set(0, P.yaw, 0);
  root.updateMatrixWorld(true);

  const vs = visualState(P, ctx);
  if (vs !== R.vstate) {
    // cross-fade from the CURRENT displayed pose
    copyPose(R.pose, R.prevPose);
    R.blend = 0;
    R.blendT = vs === "land" || R.vstate === "land" ? 0.07 : vs === "loco" || R.vstate === "loco" ? 0.12 : 0.1;
    if (vs === "land") R.landK = 0;
    R.vstate = vs;
  }
  const target = R._target || (R._target = newPose());
  const sp = Math.hypot(P.vx, P.vz);
  const phase = P.stride;
  switch (vs) {
    case "menu":
      menuPose(target, R.t);
      break;
    case "loco":
      locoPose(target, P.grounded ? sp : 0, phase, R.t, { crouch: P.state === S.CROUCH });
      break;
    case "land": {
      locoPose(target, sp, phase, R.t, {});
      const k = P.landHard ? 1 : 0.55;
      const u = clamp(P.landT / (P.landHard ? 0.16 : 0.08), 0, 1);
      const dip = Math.sin(Math.PI * Math.min(1, (1 - u) * 1.2 + 0.25)) * (P.landHard ? 0.24 : 0.12) * k;
      target.py -= dip;
      target.cPitch += dip * 1.6;
      if (P.landHard) {
        target.hL.set(0.24, target.py + 0.15, 0.32);
        target.hR.set(-0.24, target.py + 0.15, 0.32);
      }
      break;
    }
    case "jump":
    case "fall":
    case "longfall":
    case "walljumpAir":
      airPose(target, P, R.t, vs);
      break;
    case "slide":
      slidePose(target, P, R.t);
      break;
    case "vault":
      vaultPose(R, target, P);
      break;
    case "wallrun":
      wallPose(R, target, P, phase);
      break;
    case "dash":
      dashPose(target, P);
      break;
    case "ledge":
      ledgePose(R, target, P);
      break;
    case "stumble":
      stumblePose(target, P, R.t);
      break;
    case "victory":
      victoryPose(target, R.t);
      break;
    default:
      locoPose(target, 0, 0, R.t, {});
  }
  if (R.blend < 1) {
    R.blend = Math.min(1, R.blend + dt / R.blendT);
    mixPose(R.prevPose, target, smooth(R.blend), R.pose);
  } else copyPose(target, R.pose);
  applyPose(R, R.pose);
}

function visualState(P, ctx) {
  if (ctx.menu) return "menu";
  switch (P.state) {
    case S.GROUND:
      return P.landT > 0 && P.landHard ? "land" : "loco";
    case S.CROUCH:
      return "loco";
    case S.SLIDE:
      return "slide";
    case S.VAULT:
      return "vault";
    case S.WALLRUN:
      return "wallrun";
    case S.DASH:
      return P.dashAir ? "dash" : "dash";
    case S.LEDGE:
      return "ledge";
    case S.STUMBLE:
      return "stumble";
    case S.FINISHED:
      return P.grounded && Math.hypot(P.vx, P.vz) < 1.2 ? "victory" : P.grounded ? "loco" : "fall";
    case S.FALLING_OUT:
      return "longfall";
    case S.RESPAWN:
      return "loco";
    case S.AIR:
    default:
      if (P.leftBy === "walljump" && P.stateT < 0.32) return "walljumpAir";
      if (P.airT > 0.85 && P.vy < -12) return "longfall";
      if (P.vy > 1.2 && (P.leftBy === "jump" || P.leftBy === "walljump")) return "jump";
      return "fall";
  }
}

function airPose(out, P, t, vs) {
  locoPose(out, 0, 0, t, {});
  const vy = P.vy;
  if (vs === "jump") {
    // take-off: lead knee drives up, trail leg extended behind; arms drive forward/up
    const lead = Math.floor(P.stride * 2) % 2 === 0 ? 1 : -1;
    const u = clamp(P.stateT / 0.18, 0, 1);
    const L = lead > 0;
    (L ? out.fL : out.fR).set(lead * D.hipX, lerp(0.25, 0.48, u), lerp(0.2, 0.3, u));
    (L ? out.fR : out.fL).set(-lead * D.hipX, lerp(0.1, 0.3, u), lerp(-0.4, -0.25, u));
    (L ? out.kneeL : out.kneeR).set(0, 0.3, 1);
    out.fLp = L ? 0.3 : -0.5;
    out.fRp = L ? -0.5 : 0.3;
    out.py = D.pelvisY + 0.02;
    out.cPitch = 0.12;
    out.pPitch = 0.08;
    (L ? out.hR : out.hL).set(-lead * 0.22, 1.32, 0.36);
    (L ? out.hL : out.hR).set(lead * 0.24, 0.98, -0.2);
    out.hPitch = -0.15;
  } else if (vs === "fall") {
    // reach down for the landing; knees bent, arms out for balance
    const k = clamp(-vy / 10, 0, 1);
    out.fL.set(D.hipX + 0.04, lerp(0.3, 0.12, k), lerp(0.18, 0.08, k));
    out.fR.set(-D.hipX - 0.04, lerp(0.2, 0.1, k), lerp(-0.15, 0.0, k));
    out.fLp = 0.2;
    out.fRp = -0.15;
    out.py = D.pelvisY + 0.01;
    out.hL.set(0.42, 1.18 + k * 0.1, 0.12);
    out.hR.set(-0.42, 1.2 + k * 0.08, 0.05);
    out.elbL.set(1, 0, -0.4);
    out.elbR.set(-1, 0, -0.4);
    out.cPitch = 0.08 - k * 0.06;
    out.hPitch = 0.12 * k;
  } else if (vs === "walljumpAir") {
    const u = clamp(P.stateT / 0.32, 0, 1);
    out.fL.set(D.hipX + 0.06, 0.32 + 0.1 * u, -0.25 + 0.3 * u);
    out.fR.set(-D.hipX - 0.06, 0.2 + 0.15 * u, -0.35 + 0.35 * u);
    out.hL.set(0.38, 1.5 - 0.2 * u, 0.2);
    out.hR.set(-0.38, 1.48 - 0.2 * u, 0.25);
    out.elbL.set(1, 0, 0);
    out.elbR.set(-1, 0, 0);
    out.py = D.pelvisY;
    out.cPitch = -0.12;
    out.pRoll = 0;
  } else {
    // long fall: arms wheel, legs cycle
    const w = t * 9;
    out.fL.set(D.hipX + 0.05, 0.3 + Math.sin(w) * 0.12, Math.cos(w) * 0.25);
    out.fR.set(-D.hipX - 0.05, 0.3 - Math.sin(w) * 0.12, -Math.cos(w) * 0.25);
    out.hL.set(0.38 + Math.cos(w) * 0.1, 1.35 + Math.sin(w) * 0.25, Math.cos(w) * 0.25);
    out.hR.set(-0.38 - Math.cos(w) * 0.1, 1.35 - Math.sin(w) * 0.25, -Math.cos(w) * 0.25);
    out.elbL.set(1, 0, 0);
    out.elbR.set(-1, 0, 0);
    out.cPitch = -0.2;
    out.hPitch = 0.35;
  }
}

function slidePose(out, P, t) {
  locoPose(out, 0, 0, t, {});
  // low, leaning back; lead leg straight ahead, trail leg folded under; one hand skims the roof
  out.py = 0.44;
  out.pz = -0.05;
  out.pPitch = -0.35;
  out.cPitch = -0.15;
  out.hPitch = 0.35;
  out.fL.set(D.hipX, D.ankle + 0.01, 0.82);
  out.fLp = -0.35;
  out.fR.set(-0.05, D.ankle, 0.08);
  out.fRp = 0.25;
  out.kneeL.set(0, 1, 0.3);
  out.kneeR.set(-0.6, 1, 0.4);
  out.hR.set(-0.42, 0.08, -0.12);
  out.elbR.set(-1, 0.3, -0.5);
  out.hL.set(0.3, 0.75, 0.38);
  out.elbL.set(1, -0.2, -0.5);
  out.cRoll = 0.12;
  // tiny chatter
  out.py += Math.sin(t * 40) * 0.004;
}

const _plant = V3();
function vaultPose(R, out, P) {
  const V = P.vault;
  locoPose(out, 0, 0, R.t, {});
  if (!V) return;
  const u = clamp(V.t / V.T, 0, 1);
  // plant point(s) on the obstacle top (world) → local, so hands don't slide
  const b = V.box;
  const near = V.dirX !== 0 ? (V.dirX > 0 ? b.min[0] : b.max[0]) : V.dirZ > 0 ? b.min[2] : b.max[2];
  const px = V.dirX !== 0 ? near + V.dirX * 0.22 : V.x0;
  const pz = V.dirZ !== 0 ? near + V.dirZ * 0.22 : V.z0;
  const top = b.max[1];
  const handOn = u > 0.08 && u < 0.72;
  if (V.low) {
    // speed vault: body turns sideways over the obstacle, legs swing across, one hand planted
    const side = 1;
    toLocal(R, px + (V.dirZ !== 0 ? 0.12 : 0), top, pz + (V.dirX !== 0 ? 0.12 : 0), _plant);
    out.py = D.pelvisY - 0.12;
    out.pRoll = -0.85 * Math.sin(Math.PI * clamp(u * 1.1, 0, 1)) * side;
    out.pPitch = 0.1;
    out.cRoll = 0.4 * Math.sin(Math.PI * u);
    out.cPitch = 0.25;
    out.fL.set(0.42, 0.42 + 0.18 * Math.sin(Math.PI * u), lerp(-0.2, 0.45, u));
    out.fR.set(0.22, 0.38 + 0.15 * Math.sin(Math.PI * u), lerp(-0.35, 0.3, u));
    out.kneeL.set(0.5, 0.2, 1);
    out.kneeR.set(0.5, 0.2, 1);
    if (handOn) out.hR.copy(_plant);
    else out.hR.set(-0.3, 1.05, 0.3);
    out.elbR.set(-1, 0.2, -0.2);
    out.hL.set(0.4, 1.35, 0.15);
    out.elbL.set(1, 0, 0);
    out.hPitch = -0.2;
  } else {
    // kong vault: both hands planted, body near-horizontal, legs tucked through
    toLocal(R, px, top, pz, _plant);
    const dive = Math.sin(Math.PI * clamp(u * 1.15, 0, 1));
    out.py = D.pelvisY - 0.05 + dive * 0.12;
    out.pPitch = 0.25 + dive * 0.75;
    out.cPitch = 0.2 + dive * 0.25;
    out.hPitch = -0.6 * dive;
    out.pz = 0.05 * dive;
    const tuck = Math.sin(Math.PI * clamp((u - 0.15) / 0.75, 0, 1));
    out.fL.set(D.hipX, 0.25 + tuck * 0.55, lerp(-0.5, 0.35, u));
    out.fR.set(-D.hipX, 0.25 + tuck * 0.5, lerp(-0.55, 0.3, u));
    out.kneeL.set(0, 0.4, 1);
    out.kneeR.set(0, 0.4, 1);
    if (handOn) {
      out.hL.set(_plant.x + 0.16, _plant.y, _plant.z);
      out.hR.set(_plant.x - 0.16, _plant.y, _plant.z);
    } else {
      out.hL.set(0.25, 1.15, 0.45);
      out.hR.set(-0.25, 1.15, 0.45);
    }
    out.elbL.set(0.6, 0.5, -1);
    out.elbR.set(-0.6, 0.5, -1);
  }
}

function wallPose(R, out, P, phase) {
  const w = P.wall;
  locoPose(out, 9.6, phase, R.t, {});
  if (!w) return;
  const s = w.side === "left" ? 1 : -1; // wall on +X (left) or -X (right) in local space
  // body leans away from the wall; feet run on a line closer to it
  out.pRoll = -s * 0.32;
  out.cRoll = -s * 0.12;
  out.px = -s * 0.05;
  out.fL.x += s * 0.16;
  out.fR.x += s * 0.16;
  out.fL.y += s > 0 ? 0.12 : 0.02;
  out.fR.y += s < 0 ? 0.12 : 0.02;
  // wall-side hand brushes the wall ahead at shoulder height
  const hand = s > 0 ? out.hL : out.hR;
  hand.set(s * 0.36, 1.32 + Math.sin(R.t * 12) * 0.03, 0.32);
  (s > 0 ? out.elbL : out.elbR).set(s * 1, 0.3, -0.3);
  const other = s > 0 ? out.hR : out.hL;
  other.set(-s * 0.36, 1.08, -0.05);
  out.hYaw = -s * 0.12;
}

function dashPose(out, P) {
  locoPose(out, 0, 0, 0, {});
  const u = clamp(P.dashT / 0.19, 0, 1);
  const k = Math.sin(Math.PI * Math.min(1, u * 1.3 + 0.1));
  out.py = D.pelvisY - 0.05;
  out.pPitch = 0.35 * k + 0.1;
  out.cPitch = 0.4 * k + 0.1;
  out.hPitch = -0.55 * k;
  // arms swept back, legs split
  out.hL.set(0.3, 0.98, -0.45);
  out.hR.set(-0.3, 0.98, -0.45);
  out.elbL.set(1, 0, 0);
  out.elbR.set(-1, 0, 0);
  out.fL.set(D.hipX, P.dashAir ? 0.42 : 0.2, 0.35);
  out.fR.set(-D.hipX, P.dashAir ? 0.38 : 0.12, -0.45);
  out.fLp = 0.2;
  out.fRp = -0.7;
  out.kneeL.set(0, 0.3, 1);
}

function ledgePose(R, out, P) {
  const L = P.ledge;
  locoPose(out, 0, 0, R.t, {});
  if (!L) return;
  // lip points (world) → local; hands stay on the lip through the whole climb
  const lipX = L.x0 - L.nx * 0.33;
  const lipZ = L.z0 - L.nz * 0.33;
  const tx = L.nz !== 0 ? 1 : 0;
  const tz = L.nx !== 0 ? 1 : 0;
  toLocal(R, lipX + tx * 0.2, L.top + 0.02, lipZ + tz * 0.2, _plant);
  const pa = _plant.clone();
  toLocal(R, lipX - tx * 0.2, L.top + 0.02, lipZ - tz * 0.2, _plant);
  const pb = _plant.clone();
  // assign the left hand to whichever point is on the local +X side
  if (pa.x > pb.x) {
    out.hL.copy(pa);
    out.hR.copy(pb);
  } else {
    out.hL.copy(pb);
    out.hR.copy(pa);
  }
  out.elbL.set(1, 0, -0.3);
  out.elbR.set(-1, 0, -0.3);
  if (L.phase === "hang") {
    out.py = D.pelvisY - 0.02;
    out.pPitch = -0.05;
    out.cPitch = 0.0;
    out.hPitch = -0.35;
    out.fL.set(D.hipX, 0.35, 0.3);
    out.fR.set(-D.hipX, 0.22, 0.28);
    out.kneeL.set(0, 0, 1);
    out.kneeR.set(0, 0, 1);
  } else {
    const u = clamp(L.t / 0.38, 0, 1);
    out.py = D.pelvisY - 0.15 * Math.sin(Math.PI * u);
    out.pPitch = 0.55 * Math.sin(Math.PI * u);
    out.cPitch = 0.4 * Math.sin(Math.PI * u);
    out.hPitch = -0.2;
    // knee up onto the edge, then step through
    out.fL.set(D.hipX, lerp(0.45, D.ankle, smooth(u)), lerp(0.35, 0.1, u));
    out.fR.set(-D.hipX, lerp(0.2, D.ankle, smooth(clamp((u - 0.3) / 0.7, 0, 1))), lerp(0.1, -0.05, u));
    out.kneeL.set(0, 0.5, 1);
    if (u > 0.85) {
      out.hL.lerp(V3(0.25, 0.95, 0.1), (u - 0.85) / 0.15);
      out.hR.lerp(V3(-0.25, 0.95, 0.1), (u - 0.85) / 0.15);
    }
  }
}

function stumblePose(out, P, t) {
  locoPose(out, 0, 0, t, {});
  const w = t * 14;
  out.cPitch = -0.3;
  out.pPitch = -0.15;
  out.cYaw = Math.sin(w * 0.5) * 0.3;
  out.hPitch = 0.3;
  out.hL.set(0.45, 1.35 + Math.sin(w) * 0.15, 0.1);
  out.hR.set(-0.45, 1.3 - Math.sin(w) * 0.15, 0.15);
  out.elbL.set(1, 0, 0);
  out.elbR.set(-1, 0, 0);
  out.fL.set(D.hipX + 0.05, 0.12 + Math.max(0, Math.sin(w)) * 0.15, 0.15);
  out.fR.set(-D.hipX - 0.05, 0.12 + Math.max(0, -Math.sin(w)) * 0.15, -0.15);
}

function victoryPose(out, t) {
  locoPose(out, 0, 0, t, {});
  const u = t % 2.4;
  const pump = Math.max(0, Math.sin(u * Math.PI * 2.2)) * (u < 1.1 ? 1 : 0);
  out.hL.set(0.3, 1.86 + pump * 0.05, 0.12);
  out.hR.set(-0.3, 1.86 + pump * 0.05, 0.12);
  out.elbL.set(1, 0.4, 0);
  out.elbR.set(-1, 0.4, 0);
  out.py += pump * 0.04;
  out.cPitch = -0.15;
  out.hPitch = -0.3;
}

/** helper for the renderer: world position of a runner joint (for trails / particles) */
export function runnerFootWorld(R, side, out) {
  const f = R.limbs[`foot${side}`];
  f.getWorldPosition(out);
  return out;
}
