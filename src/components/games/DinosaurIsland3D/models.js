/**
 * Dinosaur Island 3D — procedural low-poly models (no external assets).
 *
 * Every model is built from primitive geometries painted with vertex colours
 * and merged per moving part ("bone"), so a whole dinosaur is ~15 draw calls
 * and all of them share one flat-shaded material. Vegetation / props return a
 * single merged geometry for InstancedMesh use.
 *
 * Rigs: `buildSurvivor()`, `buildTheropod(kind)`, `buildStego()` return
 * { root, bones } and are animated by `animateSurvivor` / `animateDino`.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const TAU = Math.PI * 2;
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/* ------------------------------------------------------------------ geometry helpers */
function hash3(x, y, z, seed = 0) {
  let h = Math.imul(Math.round(x * 97) | 0, 73856093) ^ Math.imul(Math.round(y * 97) | 0, 19349663) ^ Math.imul(Math.round(z * 97) | 0, 83492791) ^ Math.imul(seed + 1, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Bake a transform into a geometry. */
export function T(geo, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  _e.set(r[0], r[1], r[2], r[3] || "XYZ");
  _q.setFromEuler(_e);
  _m.compose(_v.set(p[0], p[1], p[2]), _q, _s.set(typeof s === "number" ? s : s[0], typeof s === "number" ? s : s[1], typeof s === "number" ? s : s[2]));
  geo.applyMatrix4(_m);
  return geo;
}
/** Non-indexed copy with a solid (or vertical-gradient) vertex colour and no UVs. */
export function paint(geo, color, bottom = null) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
  const pos = g.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const top = new THREE.Color(color);
  const bot = bottom != null ? new THREE.Color(bottom) : null;
  let y0 = Infinity;
  let y1 = -Infinity;
  if (bot)
    for (let i = 0; i < n; i++) {
      y0 = Math.min(y0, pos.getY(i));
      y1 = Math.max(y1, pos.getY(i));
    }
  for (let i = 0; i < n; i++) {
    if (bot) _c.copy(bot).lerp(top, (pos.getY(i) - y0) / Math.max(1e-4, y1 - y0));
    else _c.copy(top);
    col[i * 3] = _c.r;
    col[i * 3 + 1] = _c.g;
    col[i * 3 + 2] = _c.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
/** Per-vertex random brightness variation (keeps coincident vertices identical). */
function speckle(g, amt = 0.12, seed = 0) {
  const pos = g.attributes.position;
  const col = g.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    const k = 1 + (hash3(pos.getX(i), pos.getY(i), pos.getZ(i), seed) - 0.5) * 2 * amt;
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  return g;
}
/** Push vertices in/out by a position hash — rocks, canopies. */
export function jitter(geo, amt, seed = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (hash3(x, y, z, seed) - 0.5) * 2 * amt;
    p.setXYZ(i, x * k, y * (1 + (hash3(z, x, y, seed + 3) - 0.5) * amt), z * k);
  }
  return geo;
}
export function merge(list) {
  const g = mergeGeometries(list, false);
  for (const x of list) x.dispose();
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cyl = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);
const cone = (r, h, n = 6) => new THREE.ConeGeometry(r, h, n);
const ico = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
/** Cylinder from point a to point b. */
function limb(a, b, r0, r1, n = 7) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = cyl(r1, r0, len, n);
  g.translate(0, len / 2, 0);
  const dir = B.clone().sub(A).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate(A.x, A.y, A.z);
  return g;
}
/** Flat board from point a to point b (palm fronds). */
function slab(a, b, w, t) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B) * 1.05;
  const g = box(w, t, len);
  g.translate(0, 0, len / 2);
  const dir = B.clone().sub(A).normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, dir.y)));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ")));
  g.translate(A.x, A.y, A.z);
  return g;
}
/** Box whose +z end is scaled down (snouts, hulls). */
function taper(w, h, d, front = 0.6, frontY = 0.7) {
  const g = box(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = Math.max(0, p.getZ(i) / d + 0.5) ** 1.5;
    p.setX(i, p.getX(i) * (1 - (1 - front) * t));
    p.setY(i, p.getY(i) * (1 - (1 - frontY) * t));
  }
  return g;
}

/* ------------------------------------------------------------------ materials */
export function makeMaterials() {
  const flat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.82, metalness: 0 });
  const skin = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.68, metalness: 0 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return { flat, skin, glow };
}

/** Make a bone (Object3D) with one merged mesh. */
function bone(parent, parts, mat, pos = [0, 0, 0], name = "") {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(pos[0], pos[1], pos[2]);
  if (parts && parts.length) {
    const mesh = new THREE.Mesh(merge(parts), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  parent.add(g);
  return g;
}

/* ================================================================== survivor */
const SV = { skin: 0xd6a07a, shirt: 0xc4ab74, shirt2: 0xa88f5c, pants: 0x4c5534, boots: 0x3a2a1d, hair: 0x3a281c, hat: 0x8f6f42, band: 0x4a3423, pack: 0x6a4a2b, roll: 0x5c6b4a, belt: 0x2f2418 };

export function buildTool(kind, mats) {
  const g = new THREE.Group();
  if (kind === "axe") {
    const parts = [paint(limb([0, -0.12, 0], [0, 0.55, 0], 0.025, 0.022), 0x7a5532), paint(T(taper(0.06, 0.12, 0.2, 0.45, 0.9), { p: [0, 0.48, 0.1] }), 0x8d8a82), paint(T(box(0.07, 0.07, 0.05), { p: [0, 0.48, 0] }), 0x5e4b33)];
    g.add(new THREE.Mesh(merge(parts), mats.flat));
  } else if (kind === "spear") {
    const parts = [paint(limb([0, -0.75, 0], [0, 1.15, 0], 0.024, 0.02), 0x8a6238), paint(T(cone(0.05, 0.22, 4), { p: [0, 1.26, 0] }), 0x9a958a), paint(T(cyl(0.032, 0.032, 0.1, 6), { p: [0, 1.12, 0] }), 0x4e3b26)];
    g.add(new THREE.Mesh(merge(parts), mats.flat));
  }
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return g;
}

export function buildSurvivor(mats) {
  const m = mats.skin;
  const root = new THREE.Group();
  const hips = bone(root, [paint(T(box(0.34, 0.18, 0.22), { p: [0, 0, 0] }), SV.pants), paint(T(box(0.36, 0.06, 0.24), { p: [0, 0.08, 0] }), SV.belt), paint(T(box(0.1, 0.12, 0.06), { p: [0.15, 0.02, 0.1] }), SV.pack)], m, [0, 0.98, 0], "hips");
  const torso = bone(
    hips,
    [
      paint(T(new THREE.CapsuleGeometry(0.19, 0.26, 3, 8), { p: [0, 0.27, 0], s: [1.08, 1, 0.68] }), SV.shirt, SV.shirt2),
      paint(T(box(0.07, 0.24, 0.02), { p: [0, 0.33, 0.13] }), SV.shirt2), // placket
      paint(T(box(0.3, 0.4, 0.17), { p: [0, 0.32, -0.2] }), SV.pack),
      paint(T(cyl(0.08, 0.08, 0.34, 8), { p: [0, 0.56, -0.2], r: [0, 0, Math.PI / 2] }), SV.roll),
      paint(T(box(0.04, 0.42, 0.03), { p: [0.1, 0.32, 0.12], r: [0.05, 0, 0] }), SV.band),
      paint(T(box(0.04, 0.42, 0.03), { p: [-0.1, 0.32, 0.12], r: [0.05, 0, 0] }), SV.band),
      paint(T(cyl(0.06, 0.065, 0.1, 8), { p: [0, 0.6, 0] }), SV.skin), // neck
    ],
    m,
    [0, 0.08, 0],
    "torso"
  );
  const head = bone(
    torso,
    [
      paint(T(sph(0.125, 12, 10), { p: [0, 0.1, 0.01], s: [0.95, 1.1, 1] }), SV.skin),
      paint(T(sph(0.13, 12, 8), { p: [0, 0.14, -0.015], s: [0.98, 0.85, 1] }), SV.hair),
      paint(T(box(0.035, 0.05, 0.04), { p: [0, 0.08, 0.125] }), 0xc98f69), // nose
      paint(T(sph(0.016, 6, 5), { p: [0.045, 0.12, 0.112] }), 0x1d1a17),
      paint(T(sph(0.016, 6, 5), { p: [-0.045, 0.12, 0.112] }), 0x1d1a17),
      paint(T(box(0.08, 0.012, 0.01), { p: [0, 0.03, 0.118] }), 0x8e5a44), // mouth
      paint(T(cyl(0.25, 0.25, 0.02, 14), { p: [0, 0.2, 0] }), SV.hat), // brim
      paint(T(cyl(0.12, 0.14, 0.12, 12), { p: [0, 0.27, 0] }), SV.hat),
      paint(T(cyl(0.142, 0.142, 0.03, 12), { p: [0, 0.225, 0] }), SV.band),
    ],
    m,
    [0, 0.6, 0],
    "head"
  );
  const arm = (side) => {
    const sh = bone(torso, [paint(T(sph(0.075, 8, 6), { p: [0, 0, 0] }), SV.shirt), paint(limb([0, 0, 0], [0, -0.27, 0], 0.07, 0.058), SV.shirt)], m, [0.25 * side, 0.46, 0], side > 0 ? "shoulderL" : "shoulderR");
    const el = bone(sh, [paint(limb([0, 0, 0], [0, -0.24, 0], 0.05, 0.042), SV.skin), paint(T(sph(0.05, 8, 6), { p: [0, -0.28, 0.01], s: [0.9, 1.1, 0.8] }), SV.skin)], m, [0, -0.28, 0], side > 0 ? "elbowL" : "elbowR");
    const hand = new THREE.Group();
    hand.position.set(0, -0.29, 0.02);
    el.add(hand);
    return { sh, el, hand };
  };
  const L = arm(1);
  const R = arm(-1);
  const leg = (side) => {
    const hip = bone(hips, [paint(limb([0, 0, 0], [0, -0.44, 0], 0.095, 0.075), SV.pants)], m, [0.1 * side, -0.06, 0], side > 0 ? "hipL" : "hipR");
    const knee = bone(hip, [paint(limb([0, 0, 0], [0, -0.4, 0], 0.07, 0.06), SV.pants), paint(T(cyl(0.068, 0.07, 0.14, 8), { p: [0, -0.36, 0] }), SV.boots), paint(T(box(0.12, 0.08, 0.24), { p: [0, -0.44, 0.04] }), SV.boots)], m, [0, -0.44, 0], side > 0 ? "kneeL" : "kneeR");
    return { hip, knee };
  };
  const LL = leg(1);
  const RL = leg(-1);
  const tools = { axe: buildTool("axe", mats), spear: buildTool("spear", mats) };
  for (const k in tools) {
    tools[k].visible = false;
    tools[k].rotation.x = Math.PI / 2; // shaft points forward from the fist
    R.hand.add(tools[k]);
  }
  tools.spear.position.set(0, 0, -0.1);
  return { root, bones: { hips, torso, head, L, R, LL, RL }, tools, phase: 0, swingT: 0, lean: 0, crouchK: 0, air: 0 };
}

/**
 * st = { speed, sprint, crouch, onGround, vy, swing (0..1 progress, 0 = none), tool, dead, deadT, dt }
 */
export function animateSurvivor(rig, st) {
  const { hips, torso, head, L, R, LL, RL } = rig.bones;
  const dt = st.dt;
  const sp = st.speed;
  const run = Math.min(1, sp / 5.4);
  const sprintK = st.sprint ? 1 : 0;
  rig.phase += dt * (sp > 0.2 ? 2.1 + sp * 0.95 : 0);
  const ph = rig.phase;
  rig.crouchK += ((st.crouch ? 1 : 0) - rig.crouchK) * Math.min(1, dt * 10);
  rig.air += ((st.onGround ? 0 : 1) - rig.air) * Math.min(1, dt * 10);
  const ck = rig.crouchK;
  const amp = run * (0.62 + sprintK * 0.3) * (1 - rig.air);
  for (const k in rig.tools) rig.tools[k].visible = st.tool === k;

  if (st.dead) {
    const t = Math.min(1, st.deadT * 2.2);
    rig.root.rotation.x = -t * (Math.PI / 2) * 0.96;
    hips.position.y = 0.98 - t * 0.78;
    torso.rotation.set(0, 0, 0);
    return;
  }
  rig.root.rotation.x = 0;
  const bob = Math.abs(Math.sin(ph)) * 0.05 * run;
  hips.position.y = 0.98 - ck * 0.36 + bob - (1 - rig.air) * 0 + (st.onGround ? 0 : 0.04);
  // legs
  const sL = Math.sin(ph);
  const sR = Math.sin(ph + Math.PI);
  const crouchHip = -1.0 * ck;
  const crouchKnee = 1.55 * ck;
  LL.hip.rotation.x = sL * amp + crouchHip - rig.air * 0.55;
  RL.hip.rotation.x = sR * amp + crouchHip - rig.air * 0.2;
  LL.knee.rotation.x = Math.max(0, -Math.cos(ph)) * amp * 1.5 + crouchKnee + rig.air * 0.9 + 0.05;
  RL.knee.rotation.x = Math.max(0, -Math.cos(ph + Math.PI)) * amp * 1.5 + crouchKnee + rig.air * 0.5 + 0.05;
  // torso lean & breathing
  const breathe = Math.sin(performance.now() * 0.0021) * 0.015;
  torso.rotation.x = run * 0.06 + sprintK * run * 0.22 + ck * 0.38 + breathe;
  torso.rotation.y = Math.sin(ph) * 0.08 * run;
  head.rotation.x = -torso.rotation.x * 0.6;
  // arms swing opposite to legs
  L.sh.rotation.x = -sL * amp * 0.85 - rig.air * 0.6;
  L.sh.rotation.z = 0.08 + rig.air * 0.25;
  L.el.rotation.x = -0.25 - run * 0.5 - sprintK * 0.5;
  let rx = -sR * amp * 0.85 - rig.air * 0.6;
  let rz = -0.08 - rig.air * 0.25;
  let ex = -0.25 - run * 0.5 - sprintK * 0.5;
  if (st.tool && st.tool !== "hands") {
    // carrying a tool: forearm forward
    rx = rx * 0.4 - 0.35;
    ex = -0.9;
  }
  if (st.swing > 0) {
    const p = st.swing;
    if (st.tool === "spear") {
      // thrust: draw back then punch forward
      const k = p < 0.4 ? p / 0.4 : 1 - (p - 0.4) / 0.6;
      const thrust = p < 0.4 ? -k * 0.4 : k;
      rx = -1.35 - thrust * 0.25;
      ex = -1.3 + Math.max(0, thrust) * 1.25;
      torso.rotation.y = -0.35 + thrust * 0.5;
    } else {
      // overhead chop / punch
      const up = p < 0.38 ? p / 0.38 : 1;
      const down = p < 0.38 ? 0 : Math.min(1, (p - 0.38) / 0.3);
      rx = -0.4 - up * 2.4 + down * 2.6;
      ex = -0.6 - up * 0.6 + down * 0.9;
      torso.rotation.x += down * 0.25 - up * 0.08;
      if (st.tool === "hands") {
        rx = -1.5 + Math.sin(p * Math.PI) * -0.2;
        ex = -1.6 + Math.sin(p * Math.PI) * 1.5;
        torso.rotation.y = -Math.sin(p * Math.PI) * 0.4;
      }
    }
  }
  R.sh.rotation.x = rx;
  R.sh.rotation.z = rz;
  R.el.rotation.x = ex;
}

/* ================================================================== theropods */
const DINO_LOOK = {
  raptor: { s: 1.2, head: 1, arm: 1, thick: 1, neck: 1, tail: 1, body: 0x8c7a4a, belly: 0xcdb98a, stripe: 0x4d3b22, eye: 0xf1c232, crest: 0x7a3326 },
  trex: { s: 2.9, head: 1.75, arm: 0.42, thick: 1.28, neck: 0.62, tail: 1.05, body: 0x4f5a34, belly: 0xa79a6a, stripe: 0x353c22, eye: 0xe0a020, crest: 0x6a3a26 },
};

export function buildTheropod(kind, mats) {
  const L = DINO_LOOK[kind];
  const s = L.s;
  const m = mats.skin;
  const root = new THREE.Group();
  const hipH = 1.0 * s;
  const th = L.thick;
  const sc = (v) => v * s;
  const body = bone(
    root,
    [
      speckle(paint(T(sph(1, 12, 9), { p: [0, sc(0.05), sc(0.22)], s: [sc(0.36 * th), sc(0.4 * th), sc(0.82)] }), L.body, L.belly), 0.08, 1),
      ...[-0.25, 0.05, 0.35, 0.62].map((z, i) => paint(T(box(sc(0.46 * th), sc(0.035), sc(0.07)), { p: [0, sc(0.4 * th) + sc(0.05) - sc(0.02), sc(z)], r: [0.1, 0, 0] }), L.stripe)),
      ...(kind === "raptor" ? [0, 0.25, 0.5].map((z) => paint(T(cone(sc(0.05), sc(0.14), 4), { p: [0, sc(0.46), sc(z)], r: [-0.5, 0, 0] }), L.crest)) : []),
    ],
    m,
    [0, hipH, 0],
    "body"
  );
  // neck & head
  const neck = bone(body, [paint(limb([0, 0, 0], [0, 0, sc(0.55 * L.neck)], sc(0.17 * th), sc(0.13 * th * (kind === "trex" ? 1.25 : 1))), L.body, L.belly)], m, [0, sc(0.16), sc(0.92)], "neck");
  neck.rotation.x = kind === "trex" ? -0.3 : -0.75;
  const H = L.head;
  const hs = (v) => sc(v * H);
  const headParts = [
    speckle(paint(T(taper(hs(0.27), hs(0.25), hs(0.56), 0.62, 0.62), { p: [0, hs(0.03), hs(0.22)] }), L.body, L.belly), 0.06, 2),
    paint(T(sph(hs(0.035), 6, 5), { p: [hs(0.115), hs(0.1), hs(0.12)] }), L.eye),
    paint(T(sph(hs(0.035), 6, 5), { p: [-hs(0.115), hs(0.1), hs(0.12)] }), L.eye),
    paint(T(sph(hs(0.018), 5, 4), { p: [hs(0.135), hs(0.1), hs(0.135)] }), 0x111111),
    paint(T(sph(hs(0.018), 5, 4), { p: [-hs(0.135), hs(0.1), hs(0.135)] }), 0x111111),
    paint(T(box(hs(0.29), hs(0.04), hs(0.1)), { p: [0, hs(0.14), hs(0.1)], r: [0.2, 0, 0] }), L.stripe), // brow ridge
  ];
  for (let i = 0; i < 6; i++) {
    const z = hs(0.08 + i * 0.07);
    const w = hs(0.11 - i * 0.008);
    headParts.push(paint(T(cone(hs(0.014), hs(0.05), 3), { p: [w, -hs(0.1), z], r: [Math.PI, 0, 0] }), 0xf2ead4));
    headParts.push(paint(T(cone(hs(0.014), hs(0.05), 3), { p: [-w, -hs(0.1), z], r: [Math.PI, 0, 0] }), 0xf2ead4));
  }
  const head = bone(neck, headParts, m, [0, 0, sc(0.55 * L.neck)], "head");
  head.rotation.x = kind === "trex" ? 0.3 : 0.75;
  const jawParts = [paint(T(taper(hs(0.22), hs(0.07), hs(0.46), 0.6, 0.8), { p: [0, -hs(0.04), hs(0.2)] }), L.belly)];
  for (let i = 0; i < 5; i++) {
    const z = hs(0.1 + i * 0.07);
    const w = hs(0.085 - i * 0.008);
    jawParts.push(paint(T(cone(hs(0.012), hs(0.04), 3), { p: [w, hs(0.0), z] }), 0xf2ead4));
    jawParts.push(paint(T(cone(hs(0.012), hs(0.04), 3), { p: [-w, hs(0.0), z] }), 0xf2ead4));
  }
  const jaw = bone(head, jawParts, m, [0, -hs(0.08), hs(0.02)], "jaw");
  // tail
  const tail = [];
  let parent = body;
  const segs = [0.6, 0.55, 0.5, 0.48];
  let r = 0.24 * th;
  let at = [0, sc(0.08), sc(-0.5)];
  for (let i = 0; i < segs.length; i++) {
    const len = sc(segs[i] * L.tail);
    const r2 = r * 0.68;
    const seg = bone(parent, [speckle(paint(limb([0, 0, 0], [0, 0, -len], sc(r), sc(r2)), L.body, L.belly), 0.06, 3 + i), ...(i < 2 ? [paint(T(box(sc(r * 1.6), sc(0.025), sc(0.06)), { p: [0, sc(r) * 0.9, -len * 0.5] }), L.stripe)] : [])], m, at, "tail" + i);
    tail.push(seg);
    parent = seg;
    at = [0, 0, -len];
    r = r2;
  }
  // legs (digitigrade)
  const legs = [];
  for (const side of [1, -1]) {
    const hip = bone(body, [speckle(paint(T(sph(1, 9, 7), { p: [0, sc(-0.18), sc(0.04)], s: [sc(0.13 * th), sc(0.3), sc(0.19 * th)] }), L.body, L.belly), 0.06, 7)], m, [sc(0.24 * th) * side, sc(-0.05), sc(0.1)], "hip");
    const knee = bone(hip, [paint(limb([0, 0, 0], [0, sc(-0.42), 0], sc(0.075 * th), sc(0.055 * th)), L.body)], m, [0, sc(-0.4), sc(0.06)], "knee");
    const ankle = bone(
      knee,
      [
        paint(limb([0, 0, 0], [0, sc(-0.3), 0], sc(0.045 * th), sc(0.04 * th)), L.body),
        paint(T(box(sc(0.14 * th), sc(0.05), sc(0.26)), { p: [0, sc(-0.31), sc(0.1)] }), L.stripe),
        ...(kind === "raptor" ? [paint(T(cone(sc(0.022), sc(0.12), 4), { p: [sc(-0.04) * side, sc(-0.24), sc(0.1)], r: [0.9, 0, 0] }), 0x2a2620)] : []),
        paint(T(cone(sc(0.02), sc(0.07), 4), { p: [0, sc(-0.32), sc(0.26)], r: [Math.PI / 2, 0, 0] }), 0x2a2620),
      ],
      m,
      [0, sc(-0.42), 0],
      "ankle"
    );
    legs.push({ hip, knee, ankle, side });
  }
  // little arms
  const arms = [];
  for (const side of [1, -1]) {
    const a = L.arm;
    const sh = bone(
      body,
      [
        paint(limb([0, 0, 0], [0, sc(-0.2 * a), sc(0.08 * a)], sc(0.045 * a * th), sc(0.035 * a * th)), L.body),
        paint(limb([0, sc(-0.2 * a), sc(0.08 * a)], [0, sc(-0.3 * a), sc(0.22 * a)], sc(0.035 * a * th), sc(0.03 * a * th)), L.body),
        paint(T(cone(sc(0.02 * a), sc(0.08 * a), 3), { p: [0, sc(-0.33 * a), sc(0.26 * a)], r: [2.2, 0, 0] }), 0x2a2620),
      ],
      m,
      [sc(0.2 * th) * side, sc(-0.08), sc(0.78)],
      "arm"
    );
    arms.push(sh);
  }
  root.traverse((o) => o.isMesh && (o.castShadow = true));
  return { root, kind, bones: { body, neck, head, jaw, tail, legs, arms }, phase: Math.random() * 10, s, hipH, fall: 0, lunge: 0, look: 0 };
}

/* ================================================================== stegosaur */
const STEGO = { body: 0x6f8452, belly: 0xb7b38a, plate: 0xc8692f, plate2: 0xe39a45, spike: 0xe8dcc0, dark: 0x4b5a37 };
export function buildStego(mats) {
  const m = mats.skin;
  const root = new THREE.Group();
  const k = 0.82;
  const sc = (v) => v * k;
  const plates = [];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const z = sc(1.1 - t * 2.4);
    const h = sc(0.28 + Math.sin(t * Math.PI) * 0.36);
    const y = sc(0.62 + Math.sin(t * Math.PI * 0.95 + 0.1) * 0.12);
    const side = i % 2 ? 1 : -1;
    plates.push(paint(T(new THREE.OctahedronGeometry(1, 0), { p: [sc(0.09) * side, y + h * 0.55, z], s: [sc(0.04), h, h * 0.75], r: [0, 0, side * 0.12] }), STEGO.plate2, STEGO.plate));
  }
  const body = bone(root, [speckle(paint(T(sph(1, 12, 9), { p: [0, 0, 0] , s: [sc(0.62), sc(0.62), sc(1.35)] }), STEGO.body, STEGO.belly), 0.08, 9), ...plates, ...[0.5, 0, -0.5].map((z) => paint(T(box(sc(0.9), sc(0.03), sc(0.12)), { p: [0, sc(0.5), sc(z)] }), STEGO.dark))], m, [0, sc(1.25), 0], "body");
  body.rotation.x = 0.08;
  const neck = bone(body, [paint(limb([0, 0, 0], [0, sc(-0.15), sc(0.55)], sc(0.24), sc(0.16)), STEGO.body, STEGO.belly)], m, [0, sc(-0.05), sc(1.15)], "neck");
  const head = bone(neck, [paint(T(taper(sc(0.24), sc(0.22), sc(0.42), 0.55, 0.55), { p: [0, 0, sc(0.18)] }), STEGO.body, STEGO.belly), paint(T(sph(sc(0.03), 5, 4), { p: [sc(0.1), sc(0.05), sc(0.12)] }), 0x1a1a14), paint(T(sph(sc(0.03), 5, 4), { p: [-sc(0.1), sc(0.05), sc(0.12)] }), 0x1a1a14)], m, [0, sc(-0.15), sc(0.55)], "head");
  const tail = [];
  let parent = body;
  let at = [0, sc(0.05), sc(-1.2)];
  let r = 0.4;
  for (let i = 0; i < 3; i++) {
    const len = sc(0.75 - i * 0.12);
    const r2 = r * 0.6;
    const parts = [paint(limb([0, 0, 0], [0, sc(0.02), -len], sc(r), sc(r2)), STEGO.body, STEGO.belly)];
    if (i < 2) parts.push(paint(T(new THREE.OctahedronGeometry(1, 0), { p: [0, sc(r) + sc(0.12), -len * 0.5], s: [sc(0.03), sc(0.2), sc(0.16)] }), STEGO.plate2, STEGO.plate));
    if (i === 2) for (const sd of [1, -1]) for (const zz of [0.55, 0.85]) parts.push(paint(T(cone(sc(0.04), sc(0.45), 5), { p: [sd * sc(0.18), sc(0.12), -len * zz], r: [0.5, 0, -sd * 1.0] }), STEGO.spike));
    const seg = bone(parent, parts, m, at, "tail" + i);
    tail.push(seg);
    parent = seg;
    at = [0, 0, -len];
    r = r2;
  }
  const legs = [];
  for (const [fx, fz, len, side] of [
    [0.36, 0.75, 0.85, 1],
    [-0.36, 0.75, 0.85, -1],
    [0.4, -0.55, 1.05, 1],
    [-0.4, -0.55, 1.05, -1],
  ]) {
    const hip = bone(body, [paint(limb([0, 0, 0], [0, sc(-len * 0.55), 0], sc(0.17), sc(0.12)), STEGO.body)], m, [sc(fx), sc(-0.25), sc(fz)], "leg");
    const knee = bone(hip, [paint(limb([0, 0, 0], [0, sc(-len * 0.5), 0], sc(0.11), sc(0.12)), STEGO.body), paint(T(cyl(sc(0.13), sc(0.15), sc(0.08), 8), { p: [0, sc(-len * 0.5), sc(0.02)] }), STEGO.dark)], m, [0, sc(-len * 0.55), 0], "knee");
    legs.push({ hip, knee, side, front: fz > 0 });
  }
  root.traverse((o) => o.isMesh && (o.castShadow = true));
  return { root, kind: "herb", bones: { body, neck, head, tail, legs }, phase: Math.random() * 10, fall: 0, graze: 0, hipH: sc(1.25) };
}

/**
 * Animate a dinosaur rig from sim state.
 * d: sim dino (state, speed, hurtT, alive, deadT, t) · dt seconds
 */
export function animateDino(rig, d, dt, time) {
  const B = rig.bones;
  const spd = d.speed || 0;
  if (rig.kind === "herb") {
    const gait = spd / 1.7;
    rig.phase += dt * (spd > 0.1 ? 2.2 + spd * 1.1 : 0);
    const ph = rig.phase;
    const amp = Math.min(0.55, gait * 0.3);
    for (const l of B.legs) {
      const off = (l.front ? 0 : Math.PI) + (l.side > 0 ? 0 : Math.PI);
      l.hip.rotation.x = Math.sin(ph + off) * amp;
      l.knee.rotation.x = Math.max(0, -Math.cos(ph + off)) * amp * 0.9;
    }
    const grazing = d.state === "idle" && spd < 0.3;
    rig.graze += ((grazing ? 1 : 0) - rig.graze) * Math.min(1, dt * 2);
    B.neck.rotation.x = rig.graze * 0.65 + Math.sin(time * 1.3 + rig.phase) * 0.04;
    B.head.rotation.x = rig.graze * 0.3 + (grazing ? Math.sin(time * 6) * 0.06 : 0);
    B.body.position.y = rig.hipH + Math.abs(Math.sin(ph)) * 0.04 * amp;
    B.tail.forEach((t, i) => {
      t.rotation.y = Math.sin(time * 1.6 + i * 0.7 + rig.phase * 0.3) * (0.08 + i * 0.04) * (d.state === "flee" ? 2 : 1);
      t.rotation.x = 0.05 * i;
    });
  } else {
    const run = d.state === "chase" || d.state === "flee";
    rig.phase += dt * (spd > 0.1 ? 1.6 + spd * (rig.kind === "trex" ? 0.38 : 1.05) : 0);
    const ph = rig.phase;
    const k = Math.min(1, spd / (rig.kind === "trex" ? 4 : 5));
    const amp = (0.25 + 0.45 * k) * (spd > 0.15 ? 1 : 0);
    for (const l of B.legs) {
      const p = ph + (l.side > 0 ? 0 : Math.PI);
      l.hip.rotation.x = -0.45 + Math.sin(p) * amp;
      l.knee.rotation.x = 1.05 + Math.max(0, Math.cos(p)) * amp * 0.9;
      l.ankle.rotation.x = -0.75 - Math.max(0, Math.cos(p)) * amp * 0.4;
    }
    // body pitch & bob
    const sF = rig.kind === "trex" ? 0.09 : 0.06;
    B.body.position.y = rig.hipH + Math.abs(Math.sin(ph)) * sF * k * rig.s - (d.state === "alert" ? 0 : 0) + (rig.lunge > 0 ? rig.lunge * 0.25 * rig.s : 0);
    const breathe = Math.sin(time * 2 + rig.phase) * 0.02;
    let bodyPitch = run ? 0.1 : 0.02;
    let neckX = rig.kind === "trex" ? -0.3 : -0.75;
    let headX = rig.kind === "trex" ? 0.3 : 0.75;
    let jaw = 0.04 + Math.max(0, Math.sin(time * 1.7 + rig.phase)) * 0.04;
    if (d.state === "alert") {
      // rear up and call
      bodyPitch = -0.22;
      neckX -= 0.25;
      headX -= 0.2;
      jaw = 0.75 + Math.sin(time * 30) * 0.05;
    }
    if (d.state === "attack") {
      const w = 1 - Math.max(0, d.t) / (rig.kind === "trex" ? 0.62 : 0.32);
      bodyPitch = 0.12 + w * 0.15;
      neckX += w * 0.35;
      headX += 0.15;
      jaw = 0.25 + w * 0.65;
      rig.lunge = rig.kind === "raptor" ? w : 0;
    } else if (d.state === "recover") {
      jaw = Math.max(0, 0.9 - (1 - d.t) * 3) * 0.6;
      rig.lunge = Math.max(0, rig.lunge - dt * 4);
    } else rig.lunge = Math.max(0, rig.lunge - dt * 4);
    if (d.state === "idle") {
      rig.look = Math.sin(time * 0.5 + rig.phase) * 0.6;
    } else rig.look *= 0.9;
    B.body.rotation.x = bodyPitch + breathe;
    B.neck.rotation.x = neckX + Math.sin(ph * 2) * 0.03 * k;
    B.neck.rotation.y = rig.look * 0.5;
    B.head.rotation.x = headX;
    B.head.rotation.y = rig.look * 0.4;
    B.jaw.rotation.x = jaw;
    B.tail.forEach((t, i) => {
      t.rotation.y = Math.sin(ph * 0.5 + i * 0.8) * (0.05 + 0.05 * i) * (0.4 + k) + Math.sin(time * 0.9 + i) * 0.04;
      t.rotation.x = -0.04 + i * 0.03 - bodyPitch * 0.4;
    });
    for (const a of B.arms) a.rotation.x = -0.3 + Math.sin(ph) * 0.15 * k;
  }
  // hurt flinch
  if (d.hurtT > 0) B.body.rotation.z = Math.sin(d.hurtT * 40) * 0.08;
  else B.body.rotation.z *= 0.8;
  // death: roll onto the side
  if (!d.alive) {
    rig.fall = Math.min(1, rig.fall + dt * 1.6);
    const e = 1 - (1 - rig.fall) ** 3;
    rig.root.rotation.z = e * (Math.PI / 2) * 0.92;
    B.body.position.y = rig.hipH * (1 - e * 0.55);
    if (B.jaw) B.jaw.rotation.x = 0.5 * e;
  } else if (rig.fall > 0) {
    rig.fall = 0;
    rig.root.rotation.z = 0;
  }
}

/* ================================================================== vegetation & props (merged geometries) */
export function palmGeo(seed = 1) {
  const parts = [];
  const segs = 7;
  let x = 0;
  let y = 0;
  const bend = 0.12 + (seed % 3) * 0.05;
  for (let i = 0; i < segs; i++) {
    const h = 0.95;
    const r0 = 0.24 - i * 0.018;
    const g = paint(limb([x, y, 0], [x + bend * (i / segs) * 1.2, y + h, 0], r0, r0 - 0.018, 7), i % 2 ? 0x8a6d47 : 0x7a5f3c);
    parts.push(g);
    x += bend * (i / segs) * 1.2;
    y += h;
  }
  const top = [x, y, 0];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + seed;
    let px = top[0];
    let py = top[1];
    let pz = top[2];
    const lens = [1.1, 1.0, 0.9];
    let pitch = 0.25;
    for (let j = 0; j < 3; j++) {
      const L = lens[j];
      const dx = Math.cos(a) * Math.cos(pitch) * L;
      const dz = Math.sin(a) * Math.cos(pitch) * L;
      const dy = -Math.sin(pitch) * L + (j === 0 ? 0.25 : 0);
      const leaf = paint(slab([px, py, pz], [px + dx, py + dy, pz + dz], 0.62 - j * 0.14, 0.04), j === 2 ? 0x5e8a2e : 0x3f7a2a, 0x2f5f22);
      parts.push(leaf);
      px += dx;
      py += dy;
      pz += dz;
      pitch += 0.38;
    }
  }
  for (let i = 0; i < 3; i++) parts.push(paint(T(sph(0.13, 6, 5), { p: [top[0] + Math.cos(i * 2.1) * 0.18, top[1] - 0.18, Math.sin(i * 2.1) * 0.18] }), 0x5a4224));
  return merge(parts);
}
export function jungleTreeGeo(seed = 1, big = false) {
  const parts = [];
  const H = big ? 11 : 6.2;
  const trunkR = big ? 0.75 : 0.42;
  parts.push(paint(limb([0, -0.3, 0], [0.2, H, 0.1], trunkR, trunkR * 0.55, 8), 0x6b5236, 0x4f3c28));
  // buttress roots
  for (let i = 0; i < (big ? 5 : 3); i++) {
    const a = (i / (big ? 5 : 3)) * TAU + seed;
    parts.push(paint(T(box(0.14 * (big ? 2 : 1), (big ? 1.8 : 0.8), (big ? 1.6 : 0.8)), { p: [Math.cos(a) * trunkR, (big ? 0.6 : 0.3), Math.sin(a) * trunkR], r: [0, -a + Math.PI / 2, 0] }), 0x5b4530));
  }
  if (big) {
    // broad layered canopy + a couple of branches
    parts.push(paint(limb([0.2, H * 0.7, 0], [2.6, H * 0.92, 1.2], 0.25, 0.12), 0x5b4530));
    parts.push(paint(limb([0.2, H * 0.62, 0], [-2.4, H * 0.86, -1.4], 0.25, 0.12), 0x5b4530));
    const blobs = [
      [0, H + 1.2, 0, 3.6],
      [2.8, H + 0.4, 1.4, 2.6],
      [-2.6, H + 0.2, -1.6, 2.7],
      [1.0, H + 2.4, -1.4, 2.4],
      [-1.4, H + 1.8, 1.8, 2.3],
    ];
    blobs.forEach(([x, y, z, r], i) => parts.push(speckle(paint(T(jitter(ico(r, 1), 0.22, seed + i), { p: [x, y, z], s: [1, 0.55, 1] }), i % 2 ? 0x2f6a2a : 0x3a7a30, 0x1f4a1f), 0.1, i)));
  } else {
    const blobs = [
      [0.2, H + 0.6, 0.1, 2.0],
      [1.1, H - 0.4, 0.6, 1.4],
      [-1.0, H - 0.2, -0.5, 1.5],
      [0.3, H + 1.7, -0.4, 1.3],
    ];
    blobs.forEach(([x, y, z, r], i) => parts.push(speckle(paint(T(jitter(ico(r, 1), 0.25, seed + i), { p: [x, y, z], s: [1, 0.8, 1] }), (seed + i) % 3 === 0 ? 0x4a8a34 : 0x367a2c, 0x22501e), 0.1, i)));
    // hanging vines
    for (let i = 0; i < 3; i++) {
      const a = i * 2.2 + seed;
      parts.push(paint(limb([Math.cos(a) * 1.5, H - 0.6, Math.sin(a) * 1.5], [Math.cos(a) * 1.6, H - 3.2, Math.sin(a) * 1.6], 0.035, 0.025, 4), 0x2e5a22));
    }
  }
  return merge(parts);
}
export function stumpGeo() {
  return merge([paint(limb([0, -0.2, 0], [0, 0.55, 0], 0.45, 0.4, 8), 0x6b5236), paint(T(cyl(0.38, 0.38, 0.04, 8), { p: [0, 0.56, 0] }), 0xc9a873), paint(T(box(0.15, 0.4, 1.0), { p: [0.4, 0.05, 0.3], r: [1.3, 0.6, 0] }), 0x5b4530)]);
}
export function bushGeo(seed = 1) {
  const parts = [];
  const blobs = [
    [0, 0.55, 0, 0.75],
    [0.55, 0.4, 0.2, 0.55],
    [-0.5, 0.45, -0.2, 0.6],
    [0.1, 0.4, -0.55, 0.5],
  ];
  blobs.forEach(([x, y, z, r], i) => parts.push(speckle(paint(T(jitter(ico(r, 1), 0.2, seed + i), { p: [x, y, z] }), 0x3e7a2e, 0x24481c), 0.12, i)));
  return merge(parts);
}
export function berriesGeo() {
  const parts = [];
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4;
    const yy = 0.35 + (i % 4) * 0.18;
    const r = 0.62 - Math.abs(yy - 0.6) * 0.5;
    parts.push(paint(T(ico(0.08, 0), { p: [Math.cos(a) * r, yy, Math.sin(a) * r] }), i % 3 ? 0x7a2a6a : 0xc0283a));
  }
  return merge(parts);
}
export function fernGeo(seed = 1) {
  // single-sided planes, drawn with a DoubleSide material (14 tris)
  const parts = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + seed;
    parts.push(paint(T(new THREE.PlaneGeometry(0.24, 1.15), { p: [Math.cos(a) * 0.45, 0.3, Math.sin(a) * 0.45], r: [Math.PI / 2 - 0.55, Math.PI / 2 - a, 0, "YXZ"] }), 0x4f8f35, 0x2c5a22));
  }
  return merge(parts);
}
export function grassGeo() {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    parts.push(paint(T(cone(0.05, 0.6 + (i % 3) * 0.2, 3), { p: [Math.cos(a) * 0.15, 0.3, Math.sin(a) * 0.15], r: [Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25] }), 0x7aa64a, 0x3e6a2a));
  }
  return merge(parts);
}
export function flowerGeo() {
  return merge([paint(limb([0, 0, 0], [0, 0.4, 0], 0.015, 0.012, 3), 0x3e6a2a), paint(T(cyl(0.11, 0.06, 0.03, 6), { p: [0, 0.42, 0] }), 0xf0a0c8), paint(T(ico(0.035, 0), { p: [0, 0.445, 0] }), 0xf8d84a)]);
}
export function rockGeo(seed = 1, mossy = false) {
  const g = jitter(new THREE.DodecahedronGeometry(1, 1), 0.28, seed);
  T(g, { s: [1, 0.68, 0.9] });
  return merge([speckle(paint(g, mossy ? 0x7c8270 : 0x8a8680, 0x5e5a55), 0.14, seed), ...(mossy ? [paint(T(jitter(ico(0.7, 1), 0.2, seed + 2), { p: [0.1, 0.45, 0], s: [1, 0.3, 1] }), 0x4f7a34)] : [])]);
}
export function stickGeo() {
  return merge([paint(limb([-0.5, 0.05, -0.1], [0.5, 0.06, 0.15], 0.04, 0.03, 5), 0x6e5032), paint(limb([-0.3, 0.06, 0.25], [0.45, 0.07, -0.2], 0.035, 0.03, 5), 0x7d5c3a), paint(limb([0.1, 0.06, 0.05], [0.25, 0.1, 0.4], 0.02, 0.015, 4), 0x6e5032)]);
}
export function stonesGeo() {
  return merge([0, 1, 2].map((i) => speckle(paint(T(jitter(new THREE.DodecahedronGeometry(0.16 + i * 0.03, 0), 0.25, i), { p: [Math.cos(i * 2.2) * 0.22, 0.1, Math.sin(i * 2.2) * 0.22] }), 0x99948c, 0x6f6a64), 0.1, i)));
}
export function cloudGeo(seed = 1) {
  const parts = [];
  for (let i = 0; i < 6; i++) parts.push(paint(T(jitter(ico(8 + (i % 3) * 3, 1), 0.2, seed + i), { p: [(i - 2.5) * 9, Math.sin(i * 1.7) * 2, Math.cos(i * 2.3) * 6], s: [1, 0.5, 1] }), 0xffffff, 0xd8e2ea));
  return merge(parts);
}
export function birdGeo() {
  return merge([paint(T(box(0.9, 0.04, 0.22), { p: [0.45, 0, 0], r: [0, 0, 0.25] }), 0x222222), paint(T(box(0.9, 0.04, 0.22), { p: [-0.45, 0, 0], r: [0, 0, -0.25] }), 0x222222), paint(T(box(0.12, 0.1, 0.5), {}), 0x2a2a2a)]);
}

/* ------------------------------------------------------------------ campfire, parts, crates */
export function campfireGeo() {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    parts.push(speckle(paint(T(jitter(new THREE.DodecahedronGeometry(0.17, 0), 0.25, i), { p: [Math.cos(a) * 0.62, 0.08, Math.sin(a) * 0.62] }), 0x8a857c, 0x5a564f), 0.12, i));
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    parts.push(paint(limb([Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5], [Math.cos(a) * 0.05, 0.42, Math.sin(a) * 0.05], 0.06, 0.045, 6), 0x5a3e24));
  }
  parts.push(paint(T(cyl(0.38, 0.42, 0.04, 10), { p: [0, 0.02, 0] }), 0x2a2420));
  return merge(parts);
}
export function flameGeo() {
  return merge([paint(T(cone(0.3, 0.95, 7), { p: [0, 0.47, 0] }), 0xb83a06, 0xd86a10), paint(T(cone(0.17, 0.62, 6), { p: [0.14, 0.33, 0.08] }), 0xd0700e, 0xa82c04), paint(T(cone(0.15, 0.55, 6), { p: [-0.12, 0.3, -0.1] }), 0xd8801a, 0xa02a04), paint(T(cone(0.1, 0.4, 5), { p: [0, 0.25, 0] }), 0xffd26a, 0xffb040)]);
}
export function partGeo(id) {
  if (id === "battery")
    return merge([paint(T(box(0.42, 0.32, 0.28), { p: [0, 0.16, 0] }), 0x2a2a2e), paint(T(box(0.43, 0.08, 0.29), { p: [0, 0.3, 0] }), 0xf2c230), paint(T(cyl(0.035, 0.035, 0.07, 6), { p: [0.12, 0.37, 0] }), 0xc83a2a), paint(T(cyl(0.035, 0.035, 0.07, 6), { p: [-0.12, 0.37, 0] }), 0x333333)]);
  if (id === "antenna")
    return merge([paint(limb([0, 0, 0], [0, 1.0, 0], 0.03, 0.02, 6), 0xb8b8bc), paint(T(new THREE.SphereGeometry(0.3, 10, 6, 0, TAU, 0, 1.1), { p: [0, 0.75, 0.05], r: [-1.2, 0, 0] }), 0xdedee2), paint(T(box(0.3, 0.12, 0.2), { p: [0, 0.06, 0] }), 0x55585e)]);
  return merge([paint(T(box(0.42, 0.03, 0.3), { p: [0, 0.015, 0] }), 0x1f7a3a), paint(T(box(0.1, 0.04, 0.1), { p: [0.08, 0.05, 0.04] }), 0x1a1a1a), paint(T(box(0.07, 0.04, 0.12), { p: [-0.1, 0.05, -0.05] }), 0x1a1a1a), paint(T(box(0.04, 0.03, 0.04), { p: [0.15, 0.045, -0.1] }), 0xd8a030)]);
}
export function crateGeo() {
  const parts = [paint(T(box(1.0, 0.72, 0.8), { p: [0, 0.36, 0] }), 0x9a7a4a, 0x7a5c34)];
  for (const [x, z, w, d] of [
    [0, 0.41, 1.04, 0.06],
    [0, -0.41, 1.04, 0.06],
    [0.51, 0, 0.06, 0.86],
    [-0.51, 0, 0.06, 0.86],
  ])
    parts.push(paint(T(box(w, 0.74, d), { p: [x, 0.36, z] }), 0x5e4528));
  parts.push(paint(T(box(0.5, 0.2, 0.01), { p: [0, 0.42, 0.412] }), 0xd0402a));
  return merge(parts);
}
export function crateLidGeo() {
  return merge([paint(T(box(1.04, 0.08, 0.84), { p: [0, 0.04, -0.42] }), 0x8a6a3c), paint(T(box(0.2, 0.09, 0.86), { p: [0.3, 0.045, -0.42] }), 0x5e4528), paint(T(box(0.2, 0.09, 0.86), { p: [-0.3, 0.045, -0.42] }), 0x5e4528)]);
}
