/**
 * Lumberjack Life — the lumberjack: model, rig, procedural animation and IK.
 *
 *  root (x, y, z, yaw)          local frame: +Z forward, +X = character's LEFT
 *   └ pelvis (crouch, lean, twist) └ chest (lean, twist) └ neck └ head
 *  limbs are free segments placed every frame from joint positions:
 *   legs  — planted-foot gait: the stance foot stays fixed while the body
 *           moves (phase comes from distance walked), solved with 2-bone IK
 *           onto the terrain height under each foot → no foot sliding.
 *   arms  — 2-bone IK to grip points ON THE TOOL. The tool is posed first
 *           (keyframed grip + handle direction + blade facing), then the
 *           hands are solved onto its handle, so the axe can never float
 *           away from the hands. At the impact frame the axe's edge point
 *           is placed exactly on the engine's impact point.
 *
 * States: idle · walk · run · axe-ready · axe-swing (side felling chop /
 * overhead bucking chop) · pick-up · carry · drop/place · interact ·
 * chainsaw idle/start/cut · pull cart · drive (seated).
 */
import * as THREE from "three";
import { plaidTexture, canvasClothTexture } from "./textures.js";
import { buildAxe, buildChainsaw, AXE_EDGE, SAW_FRONT_GRIP } from "./tools3d.js";
import { clamp, damp, smooth } from "../engine/math.js";

/* ------------------------------------------------------------ dimensions */
export const DIM = {
  pelvisY: 0.95,
  hipX: 0.095,
  hipDrop: 0.07,
  thigh: 0.42,
  shin: 0.41,
  ankle: 0.075,
  chestY: 0.24,
  shoulderX: 0.19,
  shoulderY: 0.215,
  upper: 0.29,
  fore: 0.335, // forearm + hand to the grip centre
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const std = (color, rough = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });

function lathe(pts, seg = 14, sx = 1, sz = 1, phiStart = 0, phiLen = Math.PI * 2) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, phiStart, phiLen);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}
function ell(rx, ry, rz, w = 14, h = 10) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

/* ------------------------------------------------------------ model */
export function buildLumberjack({ shadows = true, look = {} } = {}) {
  const L = {
    skin: "#e2ae86",
    beard: "#6b452a",
    hat: "#d98a2b",
    shirtA: "#b3312a",
    shirtB: "#26191a",
    vest: "#4a5a3a",
    pants: "#3f4757",
    boots: "#5b3a22",
    sole: "#2a1d14",
    gloves: "#a06c3a",
    belt: "#3b2a1c",
    ...look,
  };
  const disp = [];
  const M = {
    skin: std(L.skin, 0.6),
    beard: std(L.beard, 0.95),
    hat: std(L.hat, 0.95, { map: canvasClothTexture(L.hat) }),
    shirt: std("#ffffff", 0.9, { map: plaidTexture(L.shirtA, L.shirtB) }),
    vest: std(L.vest, 0.9, { map: canvasClothTexture(L.vest), side: THREE.DoubleSide }),
    pants: std(L.pants, 0.92, { map: canvasClothTexture(L.pants) }),
    boots: std(L.boots, 0.7),
    sole: std(L.sole, 0.9),
    gloves: std(L.gloves, 0.75),
    belt: std(L.belt, 0.6),
    metal: new THREE.MeshStandardMaterial({ color: "#c9b37a", roughness: 0.35, metalness: 0.8 }),
    eye: std("#f5f2ea", 0.3),
    pupil: std("#2a1c14", 0.3),
  };
  disp.push(...Object.values(M));
  const meshes = [];
  const mk = (geo, mat, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadows;
    m.receiveShadow = true;
    disp.push(geo);
    parent.add(m);
    meshes.push(m);
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); // pitched/rolled for seated poses etc.
  root.add(body);
  const pelvis = new THREE.Group();
  pelvis.rotation.order = "YXZ";
  body.add(pelvis);
  const chest = new THREE.Group();
  chest.rotation.order = "YXZ";
  chest.position.y = DIM.chestY;
  pelvis.add(chest);
  const neck = new THREE.Group();
  neck.position.set(0, 0.29, 0.0);
  chest.add(neck);
  const head = new THREE.Group();
  head.rotation.order = "YXZ";
  head.position.set(0, 0.07, 0.01);
  neck.add(head);

  // pelvis: trousers seat + belt
  mk(lathe([[0.001, 0.05], [0.15, 0.05], [0.158, -0.02], [0.155, -0.09], [0.13, -0.14], [0.06, -0.16], [0.001, -0.165]], 18, 1.18, 0.9), M.pants, pelvis);
  mk(lathe([[0.158, 0.035], [0.163, 0.035], [0.163, 0.085], [0.158, 0.085]], 20, 1.2, 0.9), M.belt, pelvis);
  const buckle = mk(new THREE.BoxGeometry(0.06, 0.045, 0.012), M.metal, pelvis);
  buckle.position.set(0, 0.06, 0.15);

  // chest: plaid shirt torso + open vest + collar
  mk(lathe([[0.001, -0.22], [0.14, -0.22], [0.148, -0.12], [0.158, -0.02], [0.172, 0.09], [0.18, 0.17], [0.168, 0.235], [0.12, 0.275], [0.06, 0.29], [0.001, 0.292]], 20, 1.22, 0.84), M.shirt, chest);
  mk(lathe([[0.15, -0.2], [0.157, -0.1], [0.168, 0.0], [0.182, 0.1], [0.19, 0.17], [0.178, 0.235], [0.135, 0.27]], 20, 1.22, 0.86, 0.42, Math.PI * 2 - 0.84), M.vest, chest);
  const collar = mk(new THREE.TorusGeometry(0.068, 0.02, 6, 14), M.shirt, chest);
  collar.rotation.x = Math.PI / 2 + 0.25;
  collar.position.set(0, 0.275, 0.01);
  // vest pocket flaps
  for (const s of [-1, 1]) {
    const flap = mk(new THREE.BoxGeometry(0.075, 0.035, 0.01), M.vest, chest);
    flap.position.set(s * 0.1, 0.1, 0.15);
    flap.rotation.y = s * 0.25;
  }

  // neck + head
  mk(lathe([[0.056, -0.02], [0.054, 0.06], [0.05, 0.1], [0.001, 0.1]], 12), M.skin, neck);
  const skull = mk(ell(0.098, 0.115, 0.108, 22, 16), M.skin, head);
  skull.position.set(0, 0.1, 0);
  const beard = mk(new THREE.SphereGeometry(1, 18, 12, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58), M.beard, head);
  beard.scale.set(0.1, 0.11, 0.1);
  beard.position.set(0, 0.075, 0.02);
  const jaw = mk(ell(0.07, 0.055, 0.05), M.beard, head);
  jaw.position.set(0, 0.015, 0.06);
  const stache = mk(ell(0.045, 0.014, 0.02), M.beard, head);
  stache.position.set(0, 0.07, 0.1);
  const nose = mk(ell(0.018, 0.026, 0.024, 10, 8), M.skin, head);
  nose.position.set(0, 0.098, 0.108);
  for (const s of [-1, 1]) {
    const ear = mk(ell(0.014, 0.028, 0.02, 8, 6), M.skin, head);
    ear.position.set(s * 0.098, 0.1, 0.0);
    const eye = mk(new THREE.SphereGeometry(0.0135, 10, 8), M.eye, head);
    eye.position.set(s * 0.036, 0.122, 0.094);
    const pupil = mk(new THREE.SphereGeometry(0.0075, 8, 6), M.pupil, head);
    pupil.position.set(s * 0.036, 0.122, 0.106);
    const brow = mk(new THREE.BoxGeometry(0.036, 0.011, 0.014), M.beard, head);
    brow.position.set(s * 0.037, 0.145, 0.1);
    brow.rotation.z = s * -0.12;
  }
  // beanie with a folded rim
  const hat = mk(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.hat, head);
  hat.scale.set(0.106, 0.118, 0.114);
  hat.position.set(0, 0.125, -0.004);
  const rim = mk(lathe([[0.104, 0.0], [0.11, 0.0], [0.112, 0.045], [0.104, 0.05]], 20, 1, 1.07), M.hat, head);
  rim.position.set(0, 0.112, -0.004);
  rim.rotation.x = -0.08;

  // limb segments (origin at the proximal joint, extending along −Y)
  const seg = (name, build) => {
    const g = new THREE.Group();
    g.name = name;
    body.add(g);
    build(g);
    return g;
  };
  const limbs = {};
  for (const side of ["L", "R"]) {
    limbs[`thigh${side}`] = seg(`thigh${side}`, (g) => {
      mk(lathe([[0.001, 0.03], [0.072, 0.02], [0.084, -0.04], [0.08, -0.2], [0.066, -0.36], [0.06, -0.42], [0.001, -0.44]], 12, 1, 1.05), M.pants, g);
    });
    limbs[`shin${side}`] = seg(`shin${side}`, (g) => {
      mk(lathe([[0.001, 0.03], [0.06, 0.02], [0.062, -0.12], [0.052, -0.26], [0.05, -0.3], [0.001, -0.31]], 12, 1, 1.05), M.pants, g);
      // boot shaft
      mk(lathe([[0.058, -0.25], [0.062, -0.3], [0.064, -0.4], [0.06, -0.42], [0.001, -0.42]], 12, 1.05, 1.1), M.boots, g);
      const cuff = mk(new THREE.TorusGeometry(0.06, 0.01, 5, 14), M.boots, g);
      cuff.rotation.x = Math.PI / 2;
      cuff.position.y = -0.25;
    });
    limbs[`foot${side}`] = seg(`foot${side}`, (g) => {
      const toe = mk(ell(0.058, 0.052, 0.12, 14, 10), M.boots, g);
      toe.position.set(0, -0.028, 0.055);
      const sole = mk(new THREE.BoxGeometry(0.112, 0.026, 0.27), M.sole, g);
      sole.position.set(0, -DIM.ankle + 0.013, 0.045);
      const heel = mk(new THREE.BoxGeometry(0.1, 0.03, 0.07), M.sole, g);
      heel.position.set(0, -DIM.ankle + 0.03, -0.055);
      const lace = mk(new THREE.BoxGeometry(0.04, 0.012, 0.08), M.belt, g);
      lace.position.set(0, 0.01, 0.06);
      lace.rotation.x = -0.5;
    });
    limbs[`upper${side}`] = seg(`upper${side}`, (g) => {
      mk(ell(0.07, 0.07, 0.07, 12, 10), M.shirt, g);
      mk(lathe([[0.001, 0.02], [0.058, 0.01], [0.062, -0.06], [0.056, -0.2], [0.05, -0.29], [0.001, -0.3]], 12), M.shirt, g);
    });
    limbs[`fore${side}`] = seg(`fore${side}`, (g) => {
      mk(lathe([[0.001, 0.02], [0.05, 0.01], [0.054, -0.06], [0.046, -0.2], [0.04, -0.235], [0.001, -0.24]], 12), M.shirt, g);
      // glove cuff + hand (fist gripping a handle running along local X)
      mk(lathe([[0.045, -0.2], [0.052, -0.22], [0.05, -0.27], [0.001, -0.27]], 12), M.gloves, g);
      const palm = mk(ell(0.042, 0.052, 0.034, 12, 8), M.gloves, g);
      palm.position.set(0, -0.3, 0.004);
      const fingers = mk(ell(0.044, 0.03, 0.036, 12, 8), M.gloves, g);
      fingers.position.set(0, -0.335, 0.024);
      const thumb = mk(ell(0.015, 0.03, 0.015, 8, 6), M.gloves, g);
      thumb.position.set(side === "L" ? -0.035 : 0.035, -0.305, 0.03);
      thumb.rotation.z = side === "L" ? 0.5 : -0.5;
    });
  }

  // tools (posed in body space every frame)
  const toolRoot = new THREE.Group();
  body.add(toolRoot);

  const rig = {
    root,
    body,
    pelvis,
    chest,
    neck,
    head,
    limbs,
    toolRoot,
    tool: null,
    toolId: null,
    toolKind: null,
    meshes,
    shadows,
    // animation memory
    a: {
      crouch: 0,
      lean: 0,
      twist: 0,
      ready: 0,
      carry: 0,
      seated: 0,
      pull: 0,
      look: 0,
      breathe: 0,
      handL: V(0.24, 0.85, 0.05),
      handR: V(-0.24, 0.85, 0.05),
      grip: V(-0.2, 1.2, 0.2),
      toolQ: new THREE.Quaternion(),
      swingStart: null,
      swingKey: -1,
      lastSwingT: 0,
      feet: { L: null, R: null },
      interactT: 0,
      sawPull: 0,
    },
    dispose() {
      if (rig.tool && rig.tool.userData.dispose) rig.tool.userData.dispose();
      disp.forEach((d) => d.dispose());
    },
  };
  return rig;
}

export function setRigTool(rig, tool) {
  if (rig.toolId === tool.id) return;
  if (rig.tool) {
    rig.tool.removeFromParent();
    if (rig.tool.userData.dispose) rig.tool.userData.dispose();
  }
  rig.tool = tool.kind === "axe" ? buildAxe(tool.look, { shadows: rig.shadows }) : buildChainsaw(tool.look, tool.bar, { shadows: rig.shadows });
  rig.toolRoot.add(rig.tool);
  rig.toolId = tool.id;
  rig.toolKind = tool.kind;
}

/* ------------------------------------------------------------ IK + placement helpers */
const _d = V();
const _b = V();
const _x = V();
const _y = V();
const _z = V();
const _m = new THREE.Matrix4();

/** analytic two-bone IK. Writes the middle joint into `mid` and the reached end into `end`. */
export function solveTwoBone(a, target, l1, l2, pole, mid, end) {
  _d.subVectors(target, a);
  let dist = _d.length();
  const minD = Math.abs(l1 - l2) + 1e-3;
  const maxD = l1 + l2 - 1e-4;
  if (dist < 1e-6) _d.set(0, -1, 0);
  else _d.multiplyScalar(1 / dist);
  dist = clamp(dist, minD, maxD);
  const cosA = clamp((l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist), -1, 1);
  const sinA = Math.sqrt(1 - cosA * cosA);
  _b.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_b.lengthSq() < 1e-8) _b.set(0, 0, 1).addScaledVector(_d, -_d.z);
  _b.normalize();
  mid.copy(a).addScaledVector(_d, l1 * cosA).addScaledVector(_b, l1 * sinA);
  end.copy(a).addScaledVector(_d, dist);
}

/** put a limb segment at `from`, its −Y axis toward `to`, +Z toward `fwd` */
function place(seg, from, to, fwd) {
  _y.subVectors(from, to).normalize();
  _z.copy(fwd).addScaledVector(_y, -fwd.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  seg.quaternion.setFromRotationMatrix(_m);
  seg.position.copy(from);
}

/** quaternion for a tool whose +Y is the handle `dir` and +Z the blade facing `face` */
const _tq = new THREE.Quaternion();
function toolQuat(dir, face, out = _tq) {
  _y.copy(dir).normalize();
  _z.copy(face).addScaledVector(_y, -face.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

/* ------------------------------------------------------------ axe keyframes */
const nrm = (x, y, z) => V(x, y, z).normalize();
/** grip = LEFT hand at the knob; dir = handle axis toward the head; face = blade edge direction */
const AXE_KEYS = {
  ready: { grip: V(-0.08, 0.9, 0.3), dir: nrm(-0.32, 0.8, 0.5), face: nrm(-0.3, 0.2, 0.95) },
  shoulder: { grip: V(-0.24, 1.08, 0.3), dir: nrm(-0.04, 0.8, -0.6), face: nrm(-0.9, 0.1, -0.2) },
  side: [
    { t: 0.0, k: "start" },
    { t: 0.42, grip: V(-0.22, 1.5, 0.05), dir: nrm(-0.45, 0.5, -0.75), face: nrm(-0.2, 0.9, 0.3), twist: -0.55, crouch: 0.03, lean: 0.05 },
    { t: 0.52, grip: V(-0.3, 1.5, 0.42), dir: nrm(-0.15, 0.98, 0.15), face: nrm(0.25, -0.05, 1), twist: -0.4, crouch: 0.07, lean: 0.18 },
    { t: 0.58, k: "impact", twist: -0.3, crouch: 0.13, lean: 0.36 },
    { t: 0.68, k: "after", twist: -0.25, crouch: 0.12, lean: 0.32 },
    { t: 1.0, k: "ready", twist: 0, crouch: 0.04, lean: 0.1 },
  ],
  down: [
    { t: 0.0, k: "start" },
    { t: 0.42, grip: V(-0.04, 1.62, -0.02), dir: nrm(0.02, 0.45, -0.9), face: nrm(0, 0.9, 0.4), twist: -0.1, crouch: 0.0, lean: -0.08 },
    { t: 0.52, grip: V(-0.04, 1.48, 0.28), dir: nrm(0.0, 0.97, 0.25), face: nrm(0, 0.2, 1), twist: -0.08, crouch: 0.05, lean: 0.15 },
    { t: 0.58, k: "impact", twist: -0.05, crouch: 0.2, lean: 0.55 },
    { t: 0.68, k: "after", twist: -0.05, crouch: 0.2, lean: 0.52 },
    { t: 1.0, k: "ready", twist: 0, crouch: 0.04, lean: 0.1 },
  ],
};

/** axe pose that puts AXE_EDGE exactly on `T` (body-local), blade facing `face` */
function impactPose(T, style, trunkC) {
  let dir;
  let face;
  if (style === "down") {
    dir = nrm(0, -0.5, 0.86);
    face = V(0, -1, 0);
  } else {
    dir = nrm(0.42, -0.86, 0.12);
    face = V(trunkC.x - T.x, 0, trunkC.z - T.z);
    if (face.lengthSq() < 1e-6) face.set(0, 0, 1);
    face.normalize();
  }
  // edge = grip + Q·AXE_EDGE  →  grip = T − Q·AXE_EDGE
  const q = toolQuat(dir, face, new THREE.Quaternion());
  const e = AXE_EDGE.clone().applyQuaternion(q);
  return { grip: T.clone().sub(e), dir, face: V(0, 0, 1).applyQuaternion(q) };
}

const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _p0 = V();
function lerpPose(a, b, k, out) {
  out.grip.lerpVectors(a.grip, b.grip, k);
  toolQuat(a.dir, a.face, _qa);
  toolQuat(b.dir, b.face, _qb);
  out.q.slerpQuaternions(_qa, _qb, k);
  out.twist = (a.twist ?? 0) + ((b.twist ?? 0) - (a.twist ?? 0)) * k;
  out.crouch = (a.crouch ?? 0) + ((b.crouch ?? 0) - (a.crouch ?? 0)) * k;
  out.lean = (a.lean ?? 0) + ((b.lean ?? 0) - (a.lean ?? 0)) * k;
  return out;
}

/* ------------------------------------------------------------ the pose solver */
const SAW_KEYS = {
  idle: { grip: V(-0.17, 0.93, 0.22), dir: nrm(0, 0.15, 1), face: nrm(0, 1, 0) },
  carry: { grip: V(-0.27, 0.86, 0.05), dir: nrm(0, -0.25, 1), face: nrm(0.1, 1, 0) },
};

const _hip = V();
const _knee = V();
const _ankle = V();
const _fwd = V(0, 0, 1);
const _pole = V();
const _sh = V();
const _el = V();
const _wr = V();
const _t = V();
const _t2 = V();
const _tmp = V();
const _q = new THREE.Quaternion();

/**
 * Pose the rig for one frame.
 * S = {
 *   mode: 'loco'|'swing'|'act'|'carry'|'saw'|'pull'|'drive',
 *   speed, phase, sprint, dt, time, reducedMotion,
 *   ready (0..1 target), carryLog: {len, r} | null,
 *   swing: { t (0..1), style, result, impact: Vector3 (body-local edge target), trunkC: Vector3 },
 *   act: { type, k (0..1), at (0..1), log: {pos: Vector3 local, yaw local} },
 *   saw: { state, t, cut: bool, target: Vector3|null, kind },
 *   pull: { L: Vector3, R: Vector3 }, drive: { wheel: Vector3, steer }
 *   ground(lx, lz) → local y of terrain
 * }
 */
export function poseLumberjack(rig, S) {
  const A = rig.a;
  const dt = Math.min(0.05, S.dt);
  const tool = rig.tool;
  const mode = S.mode;

  /* ---------- body attitude targets */
  let crouchT = 0;
  let leanT = 0.04;
  let twistT = 0;
  let seated = mode === "drive" ? 1 : 0;
  A.seated = damp(A.seated, seated, 10, dt);
  A.breathe += dt * (mode === "loco" && S.speed < 0.2 ? 1.6 : 2.4);
  const run = clamp((S.speed - 3.6) / 2.2, 0, 1);
  if (mode === "loco") leanT = 0.05 + run * 0.16 + (S.ready > 0.5 ? 0.06 : 0);
  if (mode === "carry") leanT = 0.1 + run * 0.05;
  if (mode === "pull") leanT = 0.22;

  /* ---------- tool pose (body-local grip + quaternion) */
  const pose = { grip: V(), q: new THREE.Quaternion(), twist: 0, crouch: 0, lean: 0 };
  let twoHands = false;
  let stowed = false;
  let sawFront = false;
  let swingDriven = false;
  if (rig.toolKind === "axe") {
    if (mode === "swing" && S.swing) {
      const W = S.swing;
      const keys = AXE_KEYS[W.style === "down" ? "down" : "side"];
      // resolve keyframes
      if (A.swingKey !== W.id) {
        A.swingKey = W.id;
        A.swingStart = { grip: A.grip.clone(), dir: V(0, 1, 0).applyQuaternion(A.toolQ), face: V(0, 0, 1).applyQuaternion(A.toolQ), twist: A.twist, crouch: A.crouch, lean: A.lean };
      }
      const imp = W.impact ? impactPose(W.impact, W.style, W.trunkC || W.impact) : { ...keys[2], grip: keys[2].grip.clone().add(V(0.1, -0.5, 0.35)) };
      const after = W.result === "hit" ? { grip: imp.grip.clone().add(V(0, 0.01, -0.025)), dir: imp.dir, face: imp.face } : W.style === "down" ? { grip: V(-0.04, 0.62, 0.42), dir: nrm(0, -0.85, 0.5), face: V(0, -0.4, -1) } : { grip: V(0.12, 0.82, 0.4), dir: nrm(0.95, -0.25, -0.1), face: nrm(-0.2, 0, -1) };
      const R = AXE_KEYS.ready;
      const resolved = keys.map((k) => {
        if (k.k === "start") return { ...A.swingStart, t: k.t };
        if (k.k === "impact") return { ...imp, ...k, grip: imp.grip, dir: imp.dir, face: imp.face };
        if (k.k === "after") return { ...after, ...k, grip: after.grip, dir: after.dir, face: after.face };
        if (k.k === "ready") return { ...R, ...k };
        return k;
      });
      let i = 0;
      while (i < resolved.length - 2 && W.t > resolved[i + 1].t) i++;
      const a = resolved[i];
      const b = resolved[i + 1];
      let k = clamp((W.t - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
      // wind-up eases in/out, the strike accelerates into the wood, recovery eases
      if (b.k === "impact") k = k * k;
      else if (a.k === "impact") k = W.result === "hit" ? 0 + k : smooth(k);
      else k = smooth(k);
      lerpPose(a, b, k, pose);
      twoHands = true;
      swingDriven = true;
    } else if (mode === "loco" || mode === "act" && false) {
      // shoulder-carry while walking, two-handed ready stance near a tree
      A.ready = damp(A.ready, S.ready, 7, dt);
      lerpPose(AXE_KEYS.shoulder, AXE_KEYS.ready, smooth(A.ready), pose);
      // walk bob on the shoulder pose
      if (A.ready < 0.5) pose.grip.y += Math.sin(S.phase * 2) * 0.012 * clamp(S.speed / 3, 0, 1);
      twoHands = A.ready > 0.5;
    } else {
      stowed = true;
    }
  } else if (rig.toolKind === "chainsaw") {
    if (mode === "saw" || (mode === "loco" && S.saw && S.saw.state !== "OFF")) {
      const sw = S.saw || {};
      let p = SAW_KEYS.idle;
      if (sw.cut && sw.target) {
        // bar straight into the cut: rear grip pulled back from the target along the facing
        const T = sw.target;
        if (sw.kind === "cut") {
          const dir = nrm(0, -0.75, 0.66);
          p = { grip: V(T.x, T.y + 0.36, T.z - 0.52), dir, face: nrm(0, 0.66, 0.75) };
          crouchT = 0.22;
          leanT = 0.45;
        } else {
          p = { grip: V(T.x - 0.02, T.y + 0.1, T.z - 0.62), dir: nrm(0, -0.06, 1), face: nrm(0, 1, 0.06) };
          crouchT = 0.2;
          leanT = 0.32;
        }
      }
      // pose quaternion: chainsaw +Z = bar direction, +Y = top
      pose.grip.copy(p.grip);
      toolQuat(p.face, p.dir, pose.q); // +Y = face(top), +Z ≈ dir(bar)
      sawFront = true;
      twoHands = true;
      if (sw.state === "STARTING") {
        A.sawPull += dt;
      } else A.sawPull = 0;
    } else if (mode === "loco") {
      pose.grip.copy(SAW_KEYS.carry.grip);
      pose.grip.z += Math.sin(S.phase) * 0.06 * clamp(S.speed / 3, 0, 1);
      toolQuat(SAW_KEYS.carry.face, SAW_KEYS.carry.dir, pose.q);
    } else stowed = true;
  }

  if (swingDriven) {
    twistT = pose.twist;
    crouchT = pose.crouch;
    leanT = pose.lean;
  } else if (A.ready > 0.5 && mode === "loco") {
    crouchT = 0.05 * A.ready;
  }

  /* ---------- pick-up / place / interact bends */
  if (mode === "act" && S.act) {
    const k = S.act.k;
    const down = S.act.type === "pickup" || S.act.type === "take" ? (k < S.act.at ? smooth(k / S.act.at) : 1 - smooth((k - S.act.at) / (1 - S.act.at))) : k < S.act.at ? smooth(k / S.act.at) : 1 - smooth((k - S.act.at) / (1 - S.act.at));
    const deep = S.act.type === "pickup" ? 1 : S.act.type === "drop" ? 0.85 : 0.4;
    crouchT = 0.42 * down * deep;
    leanT = 0.15 + 0.85 * down * deep;
  }

  if (swingDriven) {
    // no smoothing during the swing — the keyframes ARE the motion
    A.crouch = crouchT;
    A.lean = leanT;
    A.twist = twistT;
  } else {
    A.crouch = damp(A.crouch, crouchT, 9, dt);
    A.lean = damp(A.lean, leanT, 8, dt);
    A.twist = damp(A.twist, twistT, 8, dt);
  }

  /* ---------- pelvis + spine */
  const gait = clamp(S.speed / 1.2, 0, 1) * (mode === "drive" ? 0 : 1);
  const u = ((S.phase / (Math.PI * 2)) % 1 + 1) % 1;
  const bob = mode === "drive" ? 0 : gait * (run > 0.3 ? 0.035 * Math.abs(Math.cos(u * Math.PI * 2)) : 0.022 * (1 - Math.abs(Math.cos(u * Math.PI * 2))));
  const breath = Math.sin(A.breathe) * 0.006;
  const pelvisY = DIM.pelvisY - A.crouch - bob + (seated ? 0 : 0);
  rig.pelvis.position.set(0, pelvisY * (1 - A.seated) + A.seated * 0.98, A.seated * -0.05);
  rig.pelvis.rotation.set(A.lean * 0.45, A.twist * 0.35 + Math.sin(u * Math.PI * 2) * 0.06 * gait, 0);
  rig.chest.rotation.set(A.lean * 0.55 + breath - A.seated * 0.1, A.twist * 0.65 - Math.sin(u * Math.PI * 2) * 0.09 * gait, 0);
  rig.head.rotation.set(-A.lean * 0.6 + (S.look || 0) * 0.3, -A.twist * 0.5, 0);
  rig.body.updateMatrixWorld(true);

  /* ---------- tool placement */
  if (tool) {
    tool.visible = true;
    if (stowed) {
      // on the back, diagonal
      _t.set(0.02, 0.05, -0.17);
      rig.chest.updateMatrixWorld(true);
      rig.chest.localToWorld(_t);
      rig.body.worldToLocal(_t);
      tool.position.copy(_t);
      rig.chest.getWorldQuaternion(_q);
      rig.body.getWorldQuaternion(_qa).invert();
      _q.premultiply(_qa);
      tool.quaternion.copy(_q).multiply(_qb.setFromEuler(new THREE.Euler(0, 0, rig.toolKind === "axe" ? 2.5 : 1.6)));
      if (rig.toolKind === "chainsaw") tool.visible = mode !== "drive";
      A.grip.copy(tool.position);
      A.toolQ.copy(tool.quaternion);
    } else {
      tool.position.copy(pose.grip);
      tool.quaternion.copy(pose.q);
      A.grip.copy(pose.grip);
      A.toolQ.copy(pose.q);
    }
    tool.updateMatrix();
  }

  /* ---------- hand targets */
  const hR = _t.set(-0.24, 0.86, 0.04);
  const hL = _t2.set(0.24, 0.86, 0.04);
  const armSwing = gait * (0.16 + run * 0.18);
  const sw = Math.sin(u * Math.PI * 2);
  hR.z += -sw * armSwing;
  hL.z += sw * armSwing;
  hR.y += Math.abs(sw) * armSwing * 0.25;
  hL.y += Math.abs(sw) * armSwing * 0.25;
  if (tool && !stowed) {
    if (rig.toolKind === "axe") {
      // left hand at the knob (grip), right hand up the handle
      const knob = V(0, 0.035, 0).applyQuaternion(pose.q).add(pose.grip);
      const upH = V(0, twoHands ? 0.27 : 0.3, 0).applyQuaternion(pose.q).add(pose.grip);
      if (twoHands) {
        hL.copy(knob);
        hR.copy(upH);
      } else {
        hR.copy(upH);
      }
    } else {
      const rear = V(0, 0, -0.02).applyQuaternion(pose.q).add(pose.grip);
      hR.copy(rear);
      if (sawFront) {
        const front = SAW_FRONT_GRIP.clone().applyQuaternion(pose.q).add(pose.grip);
        hL.copy(front);
        if (A.sawPull > 0) {
          // pull-start: yank the cord up and back a few times
          const yk = Math.max(0, Math.sin(A.sawPull * 11));
          hL.set(0.18 + yk * 0.05, 1.0 + yk * 0.35, 0.2 - yk * 0.15);
        }
      }
    }
  }
  if (mode === "carry" && S.carryLog) {
    // log on the right shoulder: right hand on top, left hand steadying the front
    hR.set(-0.2, 1.62, 0.28);
    hL.set(-0.02, 1.48, 0.42);
  }
  if (mode === "act" && S.act && S.act.grab) {
    const k = S.act.k;
    const g = S.act.grab; // { a: Vector3, b: Vector3 } world→local grab points on the log
    const toLog = S.act.type === "pickup" || S.act.type === "take" ? (k < S.act.at ? smooth(k / S.act.at) : 1) : k < S.act.at ? 1 : 1 - smooth((k - S.act.at) / (1 - S.act.at));
    _tmp.set(-0.2, 1.62, 0.28);
    hR.lerpVectors(hR.set(-0.22, 0.9, 0.2), g.b, toLog);
    hL.lerpVectors(hL.set(0.22, 0.9, 0.2), g.a, toLog);
  }
  if (mode === "pull" && S.pull) {
    hR.copy(S.pull.R);
    hL.copy(S.pull.L);
  }
  if (mode === "drive" && S.drive) {
    const st = S.drive.steer || 0;
    hR.set(-0.17 + st * 0.03, 1.2 + st * 0.06, 0.42);
    hL.set(0.17 + st * 0.03, 1.2 - st * 0.06, 0.42);
  }
  if (A.interactT > 0) {
    A.interactT = Math.max(0, A.interactT - dt);
    const k = Math.sin((1 - A.interactT / 0.6) * Math.PI);
    if (!(tool && !stowed && twoHands)) hL.lerp(_tmp.set(0.12, 1.45, 0.5), k);
  }

  // smooth hands except while the tool drives them (they must stay ON the tool)
  const handsOnTool = tool && !stowed && (rig.toolKind === "axe" || sawFront);
  if (handsOnTool) {
    A.handR.copy(hR);
    if (twoHands) A.handL.copy(hL);
    else A.handL.lerp(hL, 1 - Math.exp(-14 * dt));
  } else {
    A.handR.lerp(hR, 1 - Math.exp(-14 * dt));
    A.handL.lerp(hL, 1 - Math.exp(-14 * dt));
  }

  /* ---------- arms (IK from shoulders in body space) */
  for (const side of ["L", "R"]) {
    const s = side === "L" ? 1 : -1;
    _sh.set(s * DIM.shoulderX, DIM.shoulderY, -0.01);
    rig.chest.localToWorld(_sh);
    rig.body.worldToLocal(_sh);
    const target = side === "L" ? A.handL : A.handR;
    _pole.set(s * 0.7, -0.6, -0.7);
    solveTwoBone(_sh, target, DIM.upper, DIM.fore, _pole, _el, _wr);
    _fwd.set(0, 0, 1);
    place(rig.limbs[`upper${side}`], _sh, _el, _tmp.set(s * 0.2, 0, 1));
    place(rig.limbs[`fore${side}`], _el, _wr, _tmp.set(s * 0.6, 0.3, 1));
  }

  /* ---------- legs: planted-foot gait + terrain IK */
  const stride = run > 0.5 ? 2.05 : 1.32;
  const duty = 0.62 - run * 0.24;
  for (const side of ["L", "R"]) {
    const s = side === "L" ? 1 : -1;
    _hip.set(s * DIM.hipX, -DIM.hipDrop, 0);
    rig.pelvis.localToWorld(_hip);
    rig.body.worldToLocal(_hip);
    // foot target (body-local, before terrain): from the gait cycle
    const uu = (u + (side === "L" ? 0 : 0.5)) % 1;
    let fz = 0;
    let lift = 0;
    const half = (duty * stride) / 2;
    if (uu < duty) fz = half - (uu / duty) * 2 * half;
    else {
      const k = (uu - duty) / (1 - duty);
      fz = -half + smooth(k) * 2 * half;
      lift = Math.sin(k * Math.PI) * (0.07 + run * 0.08);
    }
    fz *= gait;
    lift *= gait;
    // idle stance: feet a little apart, staggered while chopping
    const stance = mode === "swing" || (mode === "loco" && A.ready > 0.5) || mode === "saw" ? 1 : 0;
    const fx = s * (0.11 + stance * 0.07);
    fz += (1 - gait) * stance * (side === "L" ? 0.16 : -0.14);
    let fy;
    if (A.seated > 0.5) {
      // seated: feet forward on the floor of the cab
      _ankle.set(s * 0.13, 0.42, 0.38);
      fy = _ankle.y;
    } else {
      fy = (S.ground ? S.ground(fx, fz) : 0) + DIM.ankle + lift;
      _ankle.set(fx, fy, fz);
    }
    _pole.set(0, 0, 1);
    solveTwoBone(_hip, _ankle, DIM.thigh, DIM.shin, _pole, _knee, _wr);
    place(rig.limbs[`thigh${side}`], _hip, _knee, _tmp.set(0, 0, 1));
    place(rig.limbs[`shin${side}`], _knee, _wr, _tmp.set(0, 0, 1));
    const foot = rig.limbs[`foot${side}`];
    foot.position.copy(_wr);
    const toe = uu >= duty && gait > 0.3 ? Math.sin(((uu - duty) / (1 - duty)) * Math.PI) * -0.35 * gait : 0;
    foot.quaternion.setFromEuler(new THREE.Euler(toe, s * 0.06, 0));
  }
}

/** short arm flourish for board / buyer interactions */
export function rigInteract(rig) {
  rig.a.interactT = 0.6;
}
