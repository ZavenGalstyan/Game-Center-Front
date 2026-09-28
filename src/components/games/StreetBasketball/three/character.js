/**
 * Street Basketball — the stylized player: geometry + rig + IK + gait.
 *
 * Built from sculpted lathe profiles (tapered, muscled limbs; broad chest;
 * shaped head with face, ears and hair), not primitives. The rig is a plain
 * THREE.Group hierarchy:
 *
 *   root (x,z, facing)
 *    └ pelvis ─ spine ─ neck/head
 *         │       └ shoulder L/R ─ upperArm ─ foreArm ─ hand
 *         └ hip L/R ─ thigh ─ shin ─ foot
 *
 * Pose each frame with poseCharacter():
 *   • arms: 2-bone IK to the engine's gameplay hand points (on the ball, on
 *     the rim, reaching for a steal / block) — so what you see is what the
 *     game computed; otherwise procedural targets (run swing, D stance…);
 *   • legs: 2-bone IK to planted feet. A foot, once planted, stays fixed in
 *     the world until the stepping logic lifts it — the body can't slide
 *     over the ground, because nothing moves a planted foot.
 */
import * as THREE from "three";
import { BODY } from "../engine/athlete.js";
import { jerseyTexture } from "./textures.js";

const V = (x, y) => new THREE.Vector2(x, y);

function lathe(pts, seg = 16, sx = 1, sz = 1, phiStart = 0) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => V(r, y)), seg, phiStart);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

function ellipsoid(rx, ry, rz, ws = 20, hs = 14) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

/** Sneaker: an extruded, bevelled side profile + a separate sole. */
function shoeGeometries() {
  const upper = new THREE.Shape();
  // side profile in (z forward, y up); heel at z=-0.075, toe at z=0.215
  upper.moveTo(-0.075, 0.0);
  upper.lineTo(0.2, 0.0);
  upper.quadraticCurveTo(0.235, 0.005, 0.228, 0.035);
  upper.quadraticCurveTo(0.2, 0.065, 0.12, 0.075);
  upper.quadraticCurveTo(0.05, 0.1, 0.02, 0.13);
  upper.lineTo(-0.055, 0.135);
  upper.quadraticCurveTo(-0.09, 0.1, -0.082, 0.03);
  upper.lineTo(-0.075, 0.0);
  const ug = new THREE.ExtrudeGeometry(upper, { depth: 0.074, bevelEnabled: true, bevelThickness: 0.014, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 });
  ug.translate(0, 0, -0.037);
  ug.rotateY(-Math.PI / 2);
  const sole = new THREE.Shape();
  sole.moveTo(-0.085, -0.004);
  sole.lineTo(0.215, -0.004);
  sole.quadraticCurveTo(0.25, 0.0, 0.24, 0.024);
  sole.lineTo(-0.09, 0.024);
  sole.quadraticCurveTo(-0.1, 0.01, -0.085, -0.004);
  const sg = new THREE.ExtrudeGeometry(sole, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 6 });
  sg.translate(0, 0, -0.05);
  sg.rotateY(-Math.PI / 2);
  // rotateY(-90°) maps shape +x (forward) → world +z
  return { upper: ug, sole: sg };
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const shoe = shoeGeometries();
  SHARED = {
    // front of the torso at u = 0.25, back at u = 0.75 (phiStart −90°) so the jersey print never sits on the seam
    torso: lathe([[0.001, -0.02], [0.15, -0.02], [0.153, 0.07], [0.163, 0.16], [0.179, 0.25], [0.19, 0.32], [0.193, 0.37], [0.182, 0.415], [0.152, 0.45], [0.094, 0.47], [0.07, 0.468]], 28, 1.27, 0.74, -Math.PI / 2),
    shortsTop: lathe([[0.001, 0.1], [0.165, 0.1], [0.17, 0.05], [0.18, -0.03], [0.192, -0.1], [0.16, -0.14], [0.001, -0.14]], 24, 1.15, 0.85),
    waistband: new THREE.TorusGeometry(0.165, 0.014, 6, 28).rotateX(Math.PI / 2).scale(1.15, 1, 0.85),
    shortsLeg: lathe([[0.126, 0.05], [0.13, -0.05], [0.134, -0.2], [0.137, -0.31], [0.13, -0.33]], 18),
    shortsHem: new THREE.TorusGeometry(0.136, 0.009, 5, 20).rotateX(Math.PI / 2),
    thigh: lathe([[0.104, 0.03], [0.112, -0.05], [0.112, -0.15], [0.102, -0.27], [0.088, -0.38], [0.076, -0.45], [0.07, -0.49], [0.001, -0.51]], 16, 1, 1.06),
    knee: ellipsoid(0.03, 0.036, 0.018, 12, 8),
    shin: lathe([[0.001, 0.05], [0.05, 0.04], [0.068, 0.0], [0.074, -0.06], [0.079, -0.13], [0.068, -0.24], [0.053, -0.34], [0.045, -0.42], [0.045, -0.46]], 16, 1, 1.06),
    sock: lathe([[0.056, -0.25], [0.052, -0.33], [0.049, -0.41], [0.051, -0.47]], 14),
    shoeUpper: shoe.upper,
    shoeSole: shoe.sole,
    delt: ellipsoid(0.092, 0.084, 0.088, 18, 12),
    upperArm: lathe([[0.001, 0.07], [0.05, 0.06], [0.074, 0.02], [0.08, -0.05], [0.082, -0.12], [0.074, -0.2], [0.064, -0.27], [0.058, -0.31], [0.05, -0.345], [0.001, -0.36]], 16, 1, 1.05),
    elbow: ellipsoid(0.02, 0.03, 0.02, 8, 6),
    foreArm: lathe([[0.001, 0.045], [0.045, 0.035], [0.06, 0.0], [0.068, -0.06], [0.064, -0.13], [0.052, -0.22], [0.043, -0.29], [0.001, -0.3]], 16, 1.1, 0.92),
    palm: ellipsoid(0.048, 0.06, 0.027, 14, 10),
    fingers: ellipsoid(0.044, 0.043, 0.022, 12, 8),
    thumb: ellipsoid(0.016, 0.034, 0.016, 8, 6),
    neck: lathe([[0.068, -0.02], [0.064, 0.06], [0.06, 0.13], [0.001, 0.13]], 16, 1, 0.95),
    trap: ellipsoid(0.175, 0.06, 0.09, 18, 10),
    skull: ellipsoid(0.108, 0.132, 0.122, 28, 20),
    jaw: ellipsoid(0.092, 0.076, 0.097, 20, 14),
    cheek: ellipsoid(0.03, 0.024, 0.02, 10, 8),
    nose: ellipsoid(0.019, 0.03, 0.024, 10, 8),
    ear: ellipsoid(0.016, 0.031, 0.013, 10, 8),
    eyeW: new THREE.SphereGeometry(0.0165, 12, 10),
    pupil: new THREE.SphereGeometry(0.0095, 10, 8),
    brow: new THREE.BoxGeometry(0.042, 0.011, 0.014),
    mouth: new THREE.BoxGeometry(0.038, 0.008, 0.008),
    hairCap: new THREE.SphereGeometry(1, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
    headband: new THREE.TorusGeometry(0.119, 0.016, 6, 26).rotateX(Math.PI / 2).scale(1, 1, 1.12),
    wristband: lathe([[0.046, 0.0], [0.047, -0.05], [0.046, -0.06]], 12),
    bun: new THREE.SphereGeometry(0.055, 12, 10),
    curl: new THREE.SphereGeometry(0.034, 8, 6),
    twist: new THREE.CylinderGeometry(0.016, 0.011, 0.1, 6),
    beard: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
  };
  return SHARED;
}

const matCache = new Map();
function mat(color, rough = 0.7, extra = {}) {
  const key = `${color}|${rough}|${extra.side || 0}|${extra.map ? extra.map.uuid : ""}`;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }));
  return matCache.get(key);
}

/**
 * Build a character. `look`: { skin, hair, hairColor, jersey, jerseyTrim,
 * shorts, shorts Trim, shoes, shoeAccent, socks, headband, wristband, beard,
 * build, bulk, number }
 */
export function buildCharacter(look, { shadows = false } = {}) {
  const S = shared();
  const L = {
    skin: "#c68a62", hair: "short", hairColor: "#1b1410", jersey: "#e8a33a", jerseyTrim: "#ffffff",
    shorts: "#2a2f3a", shortsTrim: "#ffffff", shoes: "#f2f2f2", shoeAccent: "#d9432f", socks: "#f4f4f4",
    headband: null, wristband: null, beard: false, build: 1, bulk: 1, number: "0", ...look,
  };
  const skin = mat(L.skin, 0.55);
  const jerseyTex = jerseyTexture(L.jersey, L.jerseyTrim, String(L.number));
  const jerseyMat = new THREE.MeshStandardMaterial({ map: jerseyTex, roughness: 0.82 });
  const shortsMat = mat(L.shorts, 0.75, { side: THREE.DoubleSide });
  const trimMat = mat(L.shortsTrim, 0.7);
  const shoeMat = mat(L.shoes, 0.45);
  const soleMat = mat(L.shoeAccent === L.shoes ? "#f5f5f0" : "#f5f5f0", 0.6);
  const accentMat = mat(L.shoeAccent, 0.5);
  const sockMat = mat(L.socks, 0.85);
  const hairMat = mat(L.hairColor, 0.9);
  const dark = mat("#1a1411", 0.5);
  const white = mat("#f6f4ee", 0.3);

  const meshes = [];
  const add = (parent, geo, material, pos = [0, 0, 0], rot = null, scale = null) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = shadows;
    m.receiveShadow = false;
    parent.add(m);
    meshes.push(m);
    return m;
  };
  const grp = (parent, pos = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();
  const scaler = grp(root);
  const sc = L.build;
  scaler.scale.set(sc * (0.96 + 0.04 * L.bulk), sc, sc * (0.96 + 0.04 * L.bulk));

  const pelvis = grp(scaler, [0, BODY.hipY, 0]);
  add(pelvis, S.shortsTop, shortsMat, [0, 0, 0], null, [L.bulk, 1, L.bulk]);
  add(pelvis, S.waistband, trimMat, [0, 0.098, 0], null, [L.bulk, 1, L.bulk]);

  const spine = grp(pelvis, [0, 0.06, 0]);
  add(spine, S.torso, jerseyMat, [0, 0, 0], null, [L.bulk, 1, L.bulk]);
  add(spine, S.trap, skin, [0, 0.43, -0.015], null, [L.bulk, 1, 1]);
  add(spine, S.neck, skin, [0, 0.45, 0.0]);
  const head = grp(spine, [0, 0.705, 0.014]);
  add(head, S.skull, skin);
  add(head, S.jaw, skin, [0, -0.056, 0.018]);
  add(head, S.nose, skin, [0, -0.014, 0.117], [0.3, 0, 0]);
  for (const s of [-1, 1]) {
    add(head, S.ear, skin, [s * 0.107, -0.006, -0.004]);
    add(head, S.cheek, skin, [s * 0.052, -0.03, 0.085]);
    add(head, S.eyeW, white, [s * 0.04, 0.012, 0.1]);
    add(head, S.pupil, dark, [s * 0.04, 0.012, 0.113]);
    add(head, S.brow, hairMat, [s * 0.041, 0.041, 0.108], [0.1, 0, s * -0.1]);
  }
  add(head, S.mouth, mat("#6d3b2e", 0.6), [0, -0.073, 0.106]);
  buildHair(head, L, hairMat, add, S);
  if (L.beard) add(head, S.beard, hairMat, [0, -0.032, 0.014], null, [0.097, 0.108, 0.106]);
  if (L.headband) add(head, S.headband, mat(L.headband, 0.8), [0, 0.056, -0.004], [-0.14, 0, 0]);

  const arms = {};
  for (const [side, sx] of [["R", -1], ["L", 1]]) {
    // character's right is local −X (it faces +Z)
    const sh = grp(spine, [sx * BODY.shoulderHalf, 0.405, -0.01]);
    add(sh, S.delt, skin, [sx * 0.012, -0.004, 0], null, [L.bulk, 1, L.bulk]);
    const upper = grp(sh);
    add(upper, S.upperArm, skin, [0, 0, 0], null, [L.bulk, 1, L.bulk]);
    add(upper, S.elbow, skin, [0, -BODY.upperArm, -0.05]);
    const fore = grp(upper, [0, -BODY.upperArm, 0]);
    add(fore, S.foreArm, skin, [0, 0, 0], null, [L.bulk, 1, L.bulk]);
    if (L.wristband && side === "L") add(fore, S.wristband, mat(L.wristband, 0.85), [0, -0.22, 0]);
    const hand = grp(fore, [0, -BODY.foreArm, 0]);
    add(hand, S.palm, skin, [0, -0.05, 0.004]);
    add(hand, S.fingers, skin, [0, -0.104, 0.01], [0.35, 0, 0]);
    add(hand, S.thumb, skin, [-sx * 0.04, -0.045, 0.024], [0.3, 0, sx * 0.5]);
    arms[side] = { sh, upper, fore, hand, sx };
  }

  const legs = {};
  for (const [side, sx] of [["R", -1], ["L", 1]]) {
    const hip = grp(pelvis, [sx * BODY.hipHalf, -0.03, 0]);
    const thigh = grp(hip);
    add(thigh, S.thigh, skin, [0, 0, 0], null, [L.bulk, 1, L.bulk]);
    add(thigh, S.shortsLeg, shortsMat, [0, 0, 0], null, [L.bulk, 1, L.bulk]);
    add(thigh, S.shortsHem, trimMat, [0, -0.325, 0], null, [L.bulk, 1, L.bulk]);
    const shin = grp(thigh, [0, -BODY.thigh, 0]);
    add(shin, S.shin, skin);
    add(shin, S.knee, skin, [0, 0.0, 0.058]);
    add(shin, S.sock, sockMat);
    const foot = grp(shin, [0, -BODY.shin, 0]);
    add(foot, S.shoeUpper, shoeMat, [0, -0.06, 0]);
    add(foot, S.shoeSole, soleMat, [0, -0.07, 0]);
    add(foot, new THREE.BoxGeometry(0.086, 0.012, 0.09), accentMat, [0, -0.01, -0.02]);
    legs[side] = { hip, thigh, shin, foot, sx };
  }

  const rig = {
    root, scaler, pelvis, spine, head, arms, legs, meshes, look: L,
    jerseyTex, jerseyMat,
    gait: null,
    scale: sc,
  };
  root.userData.rig = rig;
  return rig;
}

function buildHair(head, L, hm, add, S) {
  const style = L.hair;
  if (style === "bald") return;
  // hemisphere cap tilted back: hairline above the brows in front, down to the nape behind
  const cap = (sx, sy, sz, y = 0.008, z = -0.006, tilt = -0.42) => add(head, S.hairCap, hm, [0, y, z], [tilt, 0, 0], [sx, sy, sz]);
  if (style === "buzz") cap(0.111, 0.136, 0.126, 0.004);
  else if (style === "fade") {
    cap(0.111, 0.138, 0.126, 0.004);
    cap(0.106, 0.1, 0.118, 0.05, -0.004, -0.25);
  } else if (style === "short") cap(0.116, 0.142, 0.13, 0.008);
  else if (style === "swept") {
    cap(0.116, 0.142, 0.13, 0.008);
    add(head, S.bun, hm, [0.02, 0.1, 0.05], [0.4, 0, 0.3], [1.3, 0.55, 1.2]);
  } else if (style === "curly") {
    cap(0.116, 0.142, 0.13, 0.008);
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      const r2 = i % 2 ? 0.085 : 0.06;
      add(head, S.curl, hm, [Math.cos(a) * r2, 0.1 + (i % 3) * 0.012, Math.sin(a) * r2 - 0.01]);
    }
  } else if (style === "twists") {
    cap(0.116, 0.142, 0.13, 0.008);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      const r2 = 0.08;
      const up = Math.sin(a) < 0.3;
      add(head, S.twist, hm, [Math.cos(a) * r2, 0.1, Math.sin(a) * r2 - 0.01], [up ? -Math.sin(a) * 0.9 : 0.3, 0, Math.cos(a) * 0.9]);
    }
  } else if (style === "bun") {
    cap(0.116, 0.142, 0.13, 0.008);
    add(head, S.bun, hm, [0, 0.12, -0.06]);
  } else if (style === "ponytail") {
    cap(0.116, 0.142, 0.13, 0.008);
    add(head, S.bun, hm, [0, 0.07, -0.1], null, [0.7, 0.7, 0.7]);
    add(head, S.twist, hm, [0, -0.02, -0.13], [0.25, 0, 0], [2.2, 2.2, 2.2]);
  } else if (style === "braids") {
    cap(0.116, 0.142, 0.13, 0.008);
    for (let i = 0; i < 7; i++) {
      const x = -0.06 + i * 0.02;
      add(head, S.twist, hm, [x, -0.04, -0.1], [0.25, 0, 0], [1.1, 2.6, 1.1]);
    }
  } else cap(0.116, 0.142, 0.13, 0.008);
}

export function disposeCharacter(rig) {
  rig.jerseyTex.dispose();
  rig.jerseyMat.dispose();
}

/* ======================================================================
   Pose / IK
   ====================================================================== */

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _xA = new THREE.Vector3();
const _yA = new THREE.Vector3();
const _zA = new THREE.Vector3();

/** Orient `group` (whose limb extends along local −Y) so it points along `dir` (world), roll from `hint`. */
function aim(group, dir, hint) {
  _yA.copy(dir).multiplyScalar(-1);
  _zA.copy(hint).addScaledVector(_yA, -hint.dot(_yA));
  if (_zA.lengthSq() < 1e-8) _zA.set(0, 0, 1).addScaledVector(_yA, -_yA.z);
  _zA.normalize();
  _xA.crossVectors(_yA, _zA);
  _m.makeBasis(_xA, _yA, _zA);
  _q1.setFromRotationMatrix(_m); // desired world rotation
  group.parent.getWorldQuaternion(_q2);
  group.quaternion.copy(_q2.invert().multiply(_q1));
  group.updateMatrixWorld(true);
}

const _A = new THREE.Vector3();
const _T = new THREE.Vector3();
const _J = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();

/**
 * Two-bone IK in world space: root joint (upper group's world position) →
 * target, bending toward `pole`. Leaves the lower group aimed at the target.
 */
function solveTwoBone(upper, lower, l1, l2, target, pole, rollHint) {
  upper.getWorldPosition(_A);
  _T.copy(target);
  _dir.subVectors(_T, _A);
  let d = _dir.length();
  if (d < 1e-5) return;
  _dir.divideScalar(d);
  d = Math.min(d, (l1 + l2) * 0.999);
  d = Math.max(d, Math.abs(l1 - l2) + 0.02);
  const a = (l1 * l1 + d * d - l2 * l2) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _pole.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_pole.lengthSq() < 1e-8) _pole.set(0, 0, 1);
  _pole.normalize();
  _J.copy(_A).addScaledVector(_dir, a).addScaledVector(_pole, h);
  _v1.subVectors(_J, _A).normalize();
  aim(upper, _v1, rollHint || _pole);
  _v2.copy(_A).addScaledVector(_dir, d);
  _v3.subVectors(_v2, _J).normalize();
  aim(lower, _v3, rollHint || _pole);
}

/**
 * Per-character animation state that lives outside the engine (visual only):
 * foot plants, swing progress, run phase, smoothed values.
 */
export function makeGait() {
  return {
    feet: [
      { side: "R", sx: -1, planted: null, swing: null, yaw: 0 },
      { side: "L", sx: 1, planted: null, swing: null, yaw: 0 },
    ],
    lastLanded: 1,
    runPhase: 0,
    crouch: 0,
    lean: 0,
    roll: 0,
    twist: 0,
    landDip: 0,
    wasAir: false,
    headYaw: 0,
    handSmooth: { R: null, L: null },
    celebrateT: 0,
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const _fw = new THREE.Vector3();
const _rt = new THREE.Vector3();
const _hipW = new THREE.Vector3();
const _tmp = new THREE.Vector3();

function idealFoot(out, s, pos, vel, facing, stance, lead, stagger) {
  const fx = Math.sin(facing);
  const fz = Math.cos(facing);
  // character's right = (−fz, fx); foot sx: R = −1 (local −X) … world: right*(+1)
  const side = s.sx === -1 ? 1 : -1;
  const width = 0.12 + 0.13 * stance;
  out.set(
    pos.x + -fz * side * width + fx * stagger * (side > 0 ? 1 : -1) + vel.x * lead,
    0,
    pos.z + fx * side * width + fz * stagger * (side > 0 ? 1 : -1) + vel.z * lead,
  );
  return out;
}

/**
 * Pose one character for this frame.
 * st: interpolated athlete state {x,z,y,facing,vx,vz,air,anim,act,actT,stance,
 *     hands:{L,R}, hand, holding, withBall, speed, dunkStyle, celebrate}
 */
export function poseCharacter(rig, st, dt, ctx = {}) {
  if (!rig.gait) rig.gait = makeGait();
  const G = rig.gait;
  const k = Math.min(1, dt * 12);
  const speed = Math.hypot(st.vx, st.vz);
  const act = st.act;
  const airborne = st.y > 0.025 || st.air;

  // ---------------------------------------------------------- root
  rig.root.position.set(st.x, 0, st.z);
  rig.root.rotation.set(0, st.facing, 0);

  // ---------------------------------------------------------- crouch / lean
  let crouch = 0.03 + 0.12 * st.stance + Math.min(speed / 6, 1) * 0.05;
  if (st.withBall) crouch += 0.05;
  let lean = 0.06 + Math.min(speed / 6.5, 1) * 0.2 + 0.24 * st.stance + (st.withBall ? 0.1 : 0);
  let roll = 0;
  let twist = st.withBall && !act ? (st.hand === "R" ? 0.14 : -0.14) : 0;
  if (act === "shoot") {
    if (!st.actJumped) crouch += Math.sin(Math.min(1, st.actT / 0.2) * Math.PI) * 0.13;
    lean = st.actJumped ? -0.04 : 0.1;
    twist = st.hand === "R" ? 0.12 : -0.12;
  } else if (act === "layup" || act === "dunk") {
    if (!airborne) crouch += 0.1;
    lean = airborne ? -0.05 : 0.22;
  } else if (act === "cross") {
    const p = Math.min(1, st.actT / 0.3);
    roll = Math.sin(p * Math.PI) * 0.22 * (st.crossDir || 1);
    crouch += 0.06;
    lean += 0.06;
  } else if (act === "steal") {
    const p = Math.min(1, st.actT / 0.42);
    lean += Math.sin(p * Math.PI) * 0.35;
    crouch += Math.sin(p * Math.PI) * 0.08;
  } else if (act === "land") {
    crouch += 0.1;
  }
  // strafe lean into the slide
  if (speed > 0.5 && !act) {
    const fx = Math.sin(st.facing);
    const fz = Math.cos(st.facing);
    const lat = (st.vx * -fz + st.vz * fx) / Math.max(speed, 1e-3);
    roll += -lat * Math.min(speed / 4, 1) * 0.1;
  }
  // landing absorb
  if (G.wasAir && !airborne) G.landDip = 0.12;
  G.wasAir = airborne;
  G.landDip = Math.max(0, G.landDip - dt * 0.6);
  crouch += G.landDip;
  // celebrate bounce
  if (st.anim === "CELEBRATE") {
    G.celebrateT += dt;
    crouch += Math.max(0, Math.sin(G.celebrateT * 9)) * -0.02;
  } else G.celebrateT = 0;

  G.crouch += (crouch - G.crouch) * k;
  G.lean += (lean - G.lean) * k;
  G.roll += (roll - G.roll) * Math.min(1, dt * 14);
  G.twist += (twist - G.twist) * k;

  // run phase (arm swing + bob)
  G.runPhase += (speed * dt) / 1.05 * Math.PI;
  const bob = airborne ? 0 : -Math.abs(Math.sin(G.runPhase)) * Math.min(speed / 6, 1) * 0.035;

  const hipY = BODY.hipY - G.crouch + bob;
  rig.pelvis.position.y = airborne ? BODY.hipY + st.y - 0.02 : hipY;
  rig.pelvis.rotation.set(G.lean * 0.35, G.twist * -0.4, G.roll * 0.5);
  rig.spine.rotation.set(G.lean * 0.75, G.twist, G.roll * 0.6);

  // head looks at the ball / hoop
  const look = ctx.lookAt;
  if (look) {
    const yawTo = Math.atan2(look.x - st.x, look.z - st.z);
    let rel = yawTo - st.facing;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    rel = Math.max(-1.0, Math.min(1.0, rel));
    G.headYaw += (rel - G.headYaw) * Math.min(1, dt * 8);
  }
  rig.head.rotation.set(-G.lean * 0.55 + (act === "shoot" ? -0.15 : 0), G.headYaw - G.twist, -G.roll * 0.3);

  rig.root.updateMatrixWorld(true);

  // ---------------------------------------------------------- legs
  const pos = { x: st.x, z: st.z };
  const vel = { x: st.vx, z: st.vz };
  const sc = rig.scale;
  const thighL = BODY.thigh * sc;
  const shinL = BODY.shin * sc;
  const ankleH = 0.075 * sc;
  _fw.set(Math.sin(st.facing), 0, Math.cos(st.facing));
  _rt.set(-_fw.z, 0, _fw.x);

  const swingDur = Math.max(0.15, Math.min(0.34, 0.34 - 0.034 * speed));
  const lead = swingDur * 0.55;
  const stagger = st.stance > 0.5 ? 0.06 : 0;

  for (const f of G.feet) {
    const leg = rig.legs[f.side];
    leg.hip.getWorldPosition(_hipW);
    const tgt = _tmp;
    if (airborne) {
      // dangling / tucked legs follow the body
      const tuck = act === "dunk" ? (f.side === "L" ? 0.3 : 0.12) : act === "jump" ? 0.12 : act === "layup" ? (f.side === (st.hand === "R" ? "L" : "R") ? 0.34 : 0.08) : 0.06;
      const side = f.sx === -1 ? 1 : -1;
      tgt.set(
        _hipW.x + _rt.x * side * 0.05 + _fw.x * (tuck * 0.55),
        Math.max(ankleH, _hipW.y - (thighL + shinL) * (0.96 - tuck * 0.9)),
        _hipW.z + _rt.z * side * 0.05 + _fw.z * (tuck * 0.55),
      );
      f.planted = { x: tgt.x, z: tgt.z };
      f.swing = null;
      f.yaw = st.facing;
    } else {
      if (!f.planted) {
        idealFoot(tgt, f, pos, { x: 0, z: 0 }, st.facing, st.stance, 0, stagger);
        f.planted = { x: tgt.x, z: tgt.z };
        f.yaw = st.facing;
      }
      if (f.swing) {
        const s = f.swing;
        s.t += dt / s.dur;
        idealFoot(_v2, f, pos, vel, st.facing, st.stance, lead, stagger);
        // re-aim the landing spot (smoothly) while in the air
        s.to.x += (_v2.x - s.to.x) * Math.min(1, dt * 10);
        s.to.z += (_v2.z - s.to.z) * Math.min(1, dt * 10);
        const e = Math.min(1, s.t);
        const ee = e * e * (3 - 2 * e);
        tgt.set(s.from.x + (s.to.x - s.from.x) * ee, 0, s.from.z + (s.to.z - s.from.z) * ee);
        tgt.y = Math.sin(e * Math.PI) * s.lift;
        f.yaw += (st.facing - f.yaw) * Math.min(1, dt * 12);
        if (s.t >= 1) {
          f.planted = { x: s.to.x, z: s.to.z };
          f.swing = null;
          G.lastLanded = f === G.feet[0] ? 0 : 1;
          if (ctx.onStep && speed > 1.2) ctx.onStep(speed);
        }
      } else {
        tgt.set(f.planted.x, 0, f.planted.z);
      }
      tgt.y += ankleH;
    }
    f.target = tgt.clone();
  }

  if (!airborne) {
    // stepping decision: alternate feet; in a run allow overlap (flight phase)
    const [a, b] = G.feet;
    const swinging = G.feet.filter((f) => f.swing);
    const canStart = swinging.length === 0 || (swinging.length === 1 && swinging[0].swing.t > (speed > 3.2 ? 0.45 : 0.8));
    if (canStart) {
      const cands = G.feet.filter((f) => !f.swing);
      let best = null;
      let bestErr = 0;
      for (const f of cands) {
        idealFoot(_v1, f, pos, vel, st.facing, st.stance, lead, stagger);
        const err = Math.hypot(_v1.x - f.planted.x, _v1.z - f.planted.z);
        // over-stretched leg must step regardless
        rig.legs[f.side].hip.getWorldPosition(_hipW);
        const reach = Math.hypot(_hipW.x - f.planted.x, _hipW.y - ankleH, _hipW.z - f.planted.z);
        const stretched = reach > (thighL + shinL) * 0.985;
        const yawErr = Math.abs(Math.atan2(Math.sin(st.facing - f.yaw), Math.cos(st.facing - f.yaw)));
        const alt = (f === a ? 0 : 1) !== G.lastLanded ? 1.25 : 1; // prefer alternating
        const score = (err + (yawErr > 0.7 ? 0.2 : 0)) * alt + (stretched ? 1 : 0);
        const thresh = speed > 0.35 ? 0.05 : 0.13;
        if ((err > thresh || stretched || yawErr > 0.7) && score > bestErr) {
          bestErr = score;
          best = f;
        }
      }
      if (best) {
        idealFoot(_v1, best, pos, vel, st.facing, st.stance, lead, stagger);
        best.swing = {
          t: 0,
          dur: speed > 0.35 ? swingDur : 0.2,
          from: { ...best.planted },
          to: { x: _v1.x, z: _v1.z },
          lift: speed > 0.35 ? Math.min(0.2, 0.06 + speed * 0.022) : 0.05,
        };
      }
    }
  }

  for (const f of G.feet) {
    const leg = rig.legs[f.side];
    // knee pole: forward, a touch outward
    const side = f.sx === -1 ? 1 : -1;
    _pole.set(_fw.x + _rt.x * side * 0.15, 0.05, _fw.z + _rt.z * side * 0.15);
    const pole = _pole.clone();
    solveTwoBone(leg.thigh, leg.shin, thighL, shinL, f.target, pole, _fw);
    // foot: flat on the ground when planted (yaw fixed at plant), toe-down in the air
    const pitch = airborne ? 0.45 : f.swing ? -0.15 * Math.sin(Math.min(1, f.swing.t) * Math.PI) : 0;
    _q1.setFromEuler(new THREE.Euler(pitch, f.yaw, 0, "YXZ"));
    leg.shin.getWorldQuaternion(_q2);
    leg.foot.quaternion.copy(_q2.invert().multiply(_q1));
  }

  // ---------------------------------------------------------- arms
  const upperL = BODY.upperArm * sc;
  const foreL = BODY.foreArm * sc;
  const swing = Math.sin(G.runPhase) * Math.min(speed / 5, 1);
  for (const side of ["R", "L"]) {
    const arm = rig.arms[side];
    const sgn = side === "R" ? 1 : -1; // +1 = character's right
    let target = st.hands && st.hands[side];
    if (target) {
      _v1.set(target.x, target.y, target.z);
    } else {
      // procedural pose in character-local metres: (right, up, forward)
      let r = 0.3;
      let u = 0.93;
      let fwd = 0.06;
      if (st.anim === "DEFENSIVE_STANCE" || (st.stance > 0.5 && !act)) {
        r = 0.55;
        u = 1.12 - G.crouch * 0.5 + Math.sin(ctx.time * 3 + sgn) * 0.03;
        fwd = 0.3;
      } else if (st.anim === "CELEBRATE") {
        r = 0.28;
        u = 2.15 + Math.sin(G.celebrateT * 9 + sgn) * 0.08;
        fwd = 0.1;
      } else if (act === "shoot" && st.actLaunched && side === st.hand) {
        // follow-through: wrist snapped, arm up
        r = 0.1;
        u = 2.28;
        fwd = 0.36;
      } else if ((act === "layup" || act === "dunk") && side === st.hand) {
        r = 0.16;
        u = 2.35;
        fwd = 0.3;
      } else if (st.withBall && st.guardArm && side !== st.hand) {
        // arm bar protecting the dribble
        r = 0.34;
        u = 1.2 - G.crouch * 0.5;
        fwd = 0.32;
      } else if (speed > 0.6) {
        r = 0.27;
        u = 1.0 - G.crouch * 0.4 + Math.abs(swing) * 0.08;
        fwd = 0.06 + swing * sgn * 0.3;
      } else if (act === "fumble") {
        r = 0.4;
        u = 1.05;
        fwd = 0.25;
      }
      const baseY = st.y;
      _v1.set(
        st.x + _fw.x * fwd + _rt.x * sgn * r,
        baseY + u,
        st.z + _fw.z * fwd + _rt.z * sgn * r,
      );
    }
    // smooth procedural → engine target transitions (never snap the hand)
    const hs = G.handSmooth;
    if (!hs[side]) hs[side] = _v1.clone();
    const rate = target ? 30 : 14;
    hs[side].lerp(_v1, Math.min(1, dt * rate));
    // elbow pole: back, out and down
    _pole.set(-_fw.x * 0.5 + _rt.x * sgn * 0.8, -0.45, -_fw.z * 0.5 + _rt.z * sgn * 0.8);
    const pole = _pole.clone();
    solveTwoBone(arm.upper, arm.fore, upperL, foreL, hs[side], pole, null);
  }
}
