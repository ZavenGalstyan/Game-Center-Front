/**
 * Arena Gladiator — the gladiator model: geometry, rig, IK and procedural
 * animation, shared by the player, every opponent, menus and the equipment
 * preview. Original design: leather harness, belt with hanging leather
 * strips, segmented arm guard on the sword arm, shoulder plate, greaves,
 * strapped sandals, optional helmet.
 *
 *   root (x, z, yaw)
 *    └ body (dodge lean / defeat fall)
 *       └ pelvis ─ spine ─ chest ─ neck ─ head
 *            │               └ shoulder L/R ─ upper ─ fore ─ hand
 *            └ hip L/R ─ thigh ─ shin ─ foot
 *
 * Hands are placed by 2-bone IK on the ENGINE's hand positions and the
 * weapon/shield are placed directly from the engine pose (engine/pose.js), so
 * the rendered blade is exactly the blade that is hit-tested. Feet are
 * planted: once down, a foot stays put in the world until the stepping logic
 * lifts it, so the body never skates over the sand.
 */
import * as THREE from "three";
import { BODY, HURTBOXES } from "../engine/constants.js";
import { handPose, kickSegment } from "../engine/pose.js";
import { localToWorld, dirToWorld, clamp, wrap } from "../engine/math.js";
import { buildWeaponMesh, buildShieldMesh, disposeShield, matOf } from "./weapons3d.js";
import { leatherTexture, scaleTexture } from "./textures.js";

const V2 = (x, y) => new THREE.Vector2(x, y);
function lathe(pts, seg = 16, sx = 1, sz = 1, phiStart = 0, phiLen = Math.PI * 2) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg, phiStart, phiLen);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}
function ellipsoid(rx, ry, rz, ws = 18, hs = 12) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

let GEO = null;
function geo() {
  if (GEO) return GEO;
  GEO = {
    torso: lathe([[0.001, -0.03], [0.14, -0.03], [0.146, 0.06], [0.158, 0.15], [0.176, 0.25], [0.19, 0.33], [0.192, 0.37], [0.18, 0.415], [0.15, 0.448], [0.09, 0.468], [0.06, 0.466]], 26, 1.3, 0.74, -Math.PI / 2),
    pec: ellipsoid(0.1, 0.07, 0.05, 16, 10),
    abs: ellipsoid(0.1, 0.12, 0.05, 14, 10),
    cuirass: lathe([[0.155, -0.02], [0.162, 0.06], [0.175, 0.16], [0.19, 0.26], [0.2, 0.33], [0.2, 0.37], [0.188, 0.405], [0.001, 0.41]], 26, 1.3, 0.8, -Math.PI / 2),
    strap: new THREE.TorusGeometry(0.21, 0.014, 5, 28, Math.PI * 0.75),
    pelvisSkirt: lathe([[0.001, 0.12], [0.158, 0.12], [0.165, 0.05], [0.18, -0.06], [0.2, -0.16], [0.205, -0.2], [0.001, -0.2]], 22, 1.18, 0.9),
    belt: lathe([[0.168, 0.07], [0.175, 0.07], [0.175, 0.16], [0.168, 0.16]], 24, 1.2, 0.86),
    buckle: new THREE.BoxGeometry(0.07, 0.07, 0.02),
    ptera: new THREE.BoxGeometry(0.055, 0.25, 0.012),
    thigh: lathe([[0.1, 0.03], [0.108, -0.05], [0.108, -0.15], [0.098, -0.27], [0.084, -0.37], [0.072, -0.43], [0.066, -0.46], [0.001, -0.48]], 16, 1, 1.06),
    knee: ellipsoid(0.042, 0.048, 0.03, 12, 8),
    shin: lathe([[0.001, 0.05], [0.05, 0.04], [0.066, 0.0], [0.072, -0.06], [0.076, -0.13], [0.066, -0.24], [0.052, -0.34], [0.043, -0.42], [0.043, -0.44]], 16, 1, 1.06),
    greave: lathe([[0.075, 0.02], [0.082, -0.06], [0.086, -0.13], [0.075, -0.25], [0.06, -0.34], [0.056, -0.38]], 16, 1.02, 1.12, -Math.PI * 0.62, Math.PI * 1.24),
    greaveKnee: ellipsoid(0.07, 0.07, 0.045, 14, 10),
    wrap: lathe([[0.056, 0.0], [0.058, -0.03], [0.056, -0.06]], 12),
    footSkin: ellipsoid(0.045, 0.035, 0.11, 12, 8),
    sole: new THREE.BoxGeometry(0.1, 0.018, 0.25),
    ankleStrap: new THREE.TorusGeometry(0.048, 0.008, 5, 16),
    delt: ellipsoid(0.09, 0.085, 0.088, 16, 12),
    upperArm: lathe([[0.001, 0.07], [0.05, 0.06], [0.074, 0.02], [0.08, -0.05], [0.082, -0.12], [0.074, -0.2], [0.064, -0.26], [0.058, -0.29], [0.001, -0.3]], 16, 1, 1.05),
    elbow: ellipsoid(0.03, 0.035, 0.03, 8, 6),
    foreArm: lathe([[0.001, 0.045], [0.045, 0.035], [0.06, 0.0], [0.066, -0.06], [0.062, -0.13], [0.052, -0.2], [0.044, -0.25], [0.001, -0.27]], 16, 1.1, 0.92),
    bracer: lathe([[0.056, -0.1], [0.064, -0.13], [0.058, -0.24], [0.05, -0.26]], 14, 1.1, 0.95),
    manicaSeg: lathe([[0.085, 0.02], [0.092, 0.0], [0.09, -0.045], [0.08, -0.05]], 16, 1.02, 1.02),
    pauldron: new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
    fist: ellipsoid(0.048, 0.058, 0.044, 14, 10),
    knuckles: ellipsoid(0.05, 0.024, 0.036, 12, 8),
    thumb: ellipsoid(0.017, 0.034, 0.017, 8, 6),
    neck: lathe([[0.066, -0.02], [0.064, 0.06], [0.058, 0.13], [0.001, 0.13]], 14, 1, 0.95),
    trap: ellipsoid(0.17, 0.06, 0.09, 16, 10),
    skull: ellipsoid(0.105, 0.128, 0.12, 26, 18),
    jaw: ellipsoid(0.09, 0.075, 0.095, 18, 12),
    cheek: ellipsoid(0.03, 0.024, 0.02, 10, 8),
    nose: ellipsoid(0.018, 0.03, 0.024, 10, 8),
    ear: ellipsoid(0.016, 0.03, 0.013, 10, 8),
    eyeW: new THREE.SphereGeometry(0.016, 12, 10),
    pupil: new THREE.SphereGeometry(0.009, 10, 8),
    brow: new THREE.BoxGeometry(0.042, 0.012, 0.016),
    mouth: new THREE.BoxGeometry(0.036, 0.008, 0.008),
    hairCap: new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5),
    beard: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55),
    lock: new THREE.CylinderGeometry(0.02, 0.012, 0.16, 6),
    bun: new THREE.SphereGeometry(0.05, 12, 10),
    helmDome: new THREE.SphereGeometry(1, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.56),
    helmRim: new THREE.TorusGeometry(1, 0.08, 6, 30),
    brim: lathe([[0.12, 0.0], [0.2, -0.015], [0.24, -0.04], [0.235, -0.045], [0.195, -0.022], [0.12, -0.008]], 30, 1, 1.1),
    cheekGuard: ellipsoid(0.012, 0.07, 0.05, 8, 8),
    neckGuard: new THREE.SphereGeometry(1, 20, 8, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.5, Math.PI * 0.22),
    grilleBar: new THREE.CylinderGeometry(0.004, 0.004, 0.13, 5),
    faceplate: lathe([[0.001, 0.07], [0.098, 0.06], [0.118, 0.0], [0.114, -0.07], [0.09, -0.12], [0.001, -0.13]], 22, 1, 1.02, -Math.PI * 0.42, Math.PI * 0.84),
    slit: new THREE.BoxGeometry(0.05, 0.01, 0.02),
    crestBristle: new THREE.BoxGeometry(0.03, 0.09, 0.028),
  };
  return GEO;
}

/**
 * look: { skin, hair, hairColor, beard, helmet, crest, cloth, leather, metal, accent, build, bulk }
 * equip: { weapon (data), armor (data id), shieldColor, shieldTrim, pattern }
 */
export function buildGladiator(look, equip, { shadows = true } = {}) {
  const G = geo();
  const L = {
    skin: "#b98563", hair: "short", hairColor: "#2a1d15", beard: false, helmet: "none", crest: null,
    cloth: "#8c2f23", leather: "#6b4a2e", metal: "#a9a39a", accent: "#d2a64a", build: 1, bulk: 1, ...look,
  };
  const armor = equip.armor || "balanced";
  const skin = matOf(L.skin, 0.58);
  const cloth = matOf(L.cloth, 0.9, 0, { side: THREE.DoubleSide });
  const leather = matOf(L.leather, 0.78, 0, { map: leatherTexture(L.leather) });
  const darkLeather = matOf("#3a2616", 0.8);
  const metal = matOf(L.metal, 0.32, 0.85);
  const accent = matOf(L.accent, 0.4, 0.7);
  const scale = matOf(L.metal, 0.4, 0.75, { map: scaleTexture(L.metal) });
  const hairMat = matOf(L.hairColor, 0.92);
  const dark = matOf("#1a1411", 0.5);
  const white = matOf("#f2efe8", 0.3);

  const all = [];
  const add = (parent, g, m, pos = null, rot = null, scl = null, tag = null) => {
    const mesh = new THREE.Mesh(g, m);
    if (pos) mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    if (scl) mesh.scale.set(scl[0], scl[1], scl[2]);
    mesh.castShadow = shadows;
    if (tag) mesh.userData.tag = tag;
    parent.add(mesh);
    all.push(mesh);
    return mesh;
  };
  const grp = (parent, pos = null) => {
    const g = new THREE.Group();
    if (pos) g.position.set(pos[0], pos[1], pos[2]);
    parent.add(g);
    return g;
  };

  const root = new THREE.Group();
  const body = grp(root);
  const scaler = grp(body);
  const sc = L.build;
  const bk = L.bulk;
  scaler.scale.set(sc * (0.95 + 0.05 * bk), sc, sc * (0.95 + 0.05 * bk));

  /* --------------------------------------------------------------- pelvis */
  const pelvis = grp(scaler, [0, BODY.hipY, 0]);
  add(pelvis, G.pelvisSkirt, cloth, null, null, [bk, 1, bk]);
  add(pelvis, G.belt, leather, [0, -0.03, 0], null, [bk, 1, bk]);
  add(pelvis, G.buckle, accent, [0, 0.085, 0.158 * bk]);
  // hanging leather strips (front and sides)
  const strips = armor === "light" ? 7 : 11;
  for (let i = 0; i < strips; i++) {
    const a = -1.25 + (2.5 * i) / (strips - 1);
    const r = 0.2 * bk;
    const s = add(pelvis, G.ptera, armor === "heavy" ? metal : leather, [Math.sin(a) * r * 1.18, -0.1, Math.cos(a) * r * 0.9], [0.08, a, 0]);
    s.userData.strip = a;
  }

  /* --------------------------------------------------------------- torso */
  const spine = grp(pelvis, [0, BODY.spineY, 0]);
  const chest = grp(spine);
  add(chest, G.torso, skin, null, null, [bk, 1, bk]);
  for (const s of [-1, 1]) add(chest, G.pec, skin, [s * 0.085 * bk, 0.31, 0.105 * bk], [0.2, 0, 0]);
  add(chest, G.abs, skin, [0, 0.14, 0.09 * bk], [0.1, 0, 0]);
  if (armor === "balanced") {
    // leather harness: chest strap crossing to the left shoulder plate
    add(chest, G.strap, leather, [0.0, 0.27, 0.0], [0.0, Math.PI * 0.5, 0.75], [1.05 * bk, 1, 0.75 * bk]);
    add(chest, G.strap, leather, [0.0, 0.24, 0.0], [0.0, -Math.PI * 0.5, 0.75], [1.02 * bk, 1, 0.72 * bk]);
    add(chest, G.cuirass, leather, [0, 0.0, 0], null, [bk * 1.01, 0.52, bk * 1.02]);
  } else if (armor === "heavy") {
    add(chest, G.cuirass, scale, [0, 0.0, 0], null, [bk * 1.03, 1, bk * 1.05]);
  } else {
    add(chest, G.strap, leather, [0.0, 0.26, 0.0], [0.0, Math.PI * 0.5, 0.75], [1.05 * bk, 1, 0.75 * bk]);
  }
  add(chest, G.trap, skin, [0, 0.43, -0.02], null, [bk, 1, 1]);
  add(chest, G.neck, skin, [0, 0.44, 0.0]);

  /* --------------------------------------------------------------- head */
  const head = grp(chest, [0, 0.66, 0.02]);
  const headMeshes = [];
  const addH = (g, m, pos, rot, scl) => {
    const mesh = add(head, g, m, pos, rot, scl);
    headMeshes.push(mesh);
    return mesh;
  };
  addH(G.skull, skin);
  addH(G.jaw, skin, [0, -0.055, 0.018]);
  addH(G.nose, skin, [0, -0.012, 0.115], [0.3, 0, 0]);
  for (const s of [-1, 1]) {
    addH(G.ear, skin, [s * 0.104, -0.006, -0.004]);
    addH(G.cheek, skin, [s * 0.05, -0.03, 0.084]);
    addH(G.eyeW, white, [s * 0.039, 0.012, 0.098]);
    addH(G.pupil, dark, [s * 0.039, 0.012, 0.11]);
    addH(G.brow, hairMat, [s * 0.04, 0.04, 0.106], [0.15, 0, s * -0.12]);
  }
  addH(G.mouth, matOf("#6a3a2c", 0.6), [0, -0.072, 0.104]);
  if (L.beard) addH(G.beard, hairMat, [0, -0.03, 0.012], null, [0.096, 0.108, 0.106]);
  const helmet = L.helmet || "none";
  if (helmet === "none" || helmet === "brim" || helmet === "cap") {
    const cap = (sx, sy, sz, y = 0.008, z = -0.006, tilt = -0.42) => addH(G.hairCap, hairMat, [0, y, z], [tilt, 0, 0], [sx, sy, sz]);
    if (L.hair === "bald") {
      /* nothing */
    } else if (L.hair === "long" || L.hair === "braid") {
      cap(0.113, 0.14, 0.128);
      for (let i = 0; i < 7; i++) addH(G.lock, hairMat, [-0.07 + i * 0.023, -0.06, -0.09], [0.3, 0, 0], [1, L.hair === "braid" ? 1.6 : 1.3, 1]);
    } else if (L.hair === "bun") {
      cap(0.113, 0.14, 0.128);
      addH(G.bun, hairMat, [0, 0.07, -0.11]);
    } else if (L.hair === "mohawk") {
      for (let i = 0; i < 9; i++) addH(G.crestBristle, hairMat, [0, 0.12 - Math.abs(i - 4) * 0.004, 0.08 - i * 0.025], [-0.3 + i * 0.08, 0, 0], [0.7, 0.9, 1]);
      cap(0.107, 0.132, 0.122);
    } else if (L.hair === "shaggy") {
      cap(0.118, 0.145, 0.132);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        addH(G.lock, hairMat, [Math.cos(a) * 0.1, 0.02, Math.sin(a) * 0.1 - 0.01], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], [1, 0.7, 1]);
      }
    } else cap(0.112, 0.138, 0.126);
  }
  if (helmet !== "none") {
    // every helmet: dome + rim
    const dome = addH(G.helmDome, metal, [0, 0.015, -0.004], [-0.12, 0, 0], [0.122, 0.142, 0.136]);
    dome.userData.helm = true;
    addH(G.helmRim, accent, [0, 0.03, -0.004], [Math.PI / 2 - 0.12, 0, 0], [0.122, 0.136, 0.14]);
    if (helmet === "cap" || helmet === "crest") {
      for (const s of [-1, 1]) addH(G.cheekGuard, metal, [s * 0.1, -0.05, 0.035], [0, s * 0.35, 0]);
      addH(G.neckGuard, metal, [0, 0.0, -0.01], null, [0.14, 0.2, 0.15]);
    }
    if (helmet === "brim") {
      addH(G.brim, metal, [0, 0.035, 0.0]);
      // grated visor bars in front of the face
      for (let i = 0; i < 7; i++) {
        const x = -0.066 + i * 0.022;
        addH(G.grilleBar, dark, [x, -0.035, 0.13 - Math.abs(x) * 0.35]);
      }
      for (const y of [0.0, -0.06]) addH(G.grilleBar, dark, [0, -0.035 + y + 0.03, 0.128], [0, 0, Math.PI / 2], [1, 1.15, 1]);
    }
    if (helmet === "crest") {
      const crestMat = matOf(L.crest || L.cloth, 0.95);
      for (let i = 0; i < 11; i++) {
        const a = -0.9 + (i / 10) * 1.9;
        addH(G.crestBristle, crestMat, [0, 0.03 + Math.cos(a) * 0.15, Math.sin(a) * 0.15], [a, 0, 0], [1, 1.1 - Math.abs(a) * 0.25, 1]);
      }
    }
    if (helmet === "full") {
      addH(G.faceplate, metal, [0, -0.04, 0.0]);
      for (const s of [-1, 1]) addH(G.slit, dark, [s * 0.038, 0.012, 0.112], [0, s * 0.25, 0]);
      addH(G.neckGuard, metal, [0, 0.0, -0.01], null, [0.145, 0.22, 0.155]);
      addH(G.grilleBar, dark, [0, -0.07, 0.117], [0, 0, 0], [2.2, 0.5, 2.2]);
    }
  }

  /* --------------------------------------------------------------- arms */
  const arms = {};
  for (const [side, sx] of [["R", 1], ["L", -1]]) {
    // character right is local −X (faces +Z): engine r=+1 → three x = −1
    const sh = grp(chest, [-sx * BODY.shoulderHalf, BODY.shoulderY - BODY.hipY - BODY.spineY, -0.01]);
    const armMeshes = [];
    const addA = (parent, g, m, pos, rot, scl) => {
      const mesh = add(parent, g, m, pos, rot, scl);
      armMeshes.push(mesh);
      return mesh;
    };
    addA(sh, G.delt, skin, [-sx * 0.012, -0.004, 0], null, [bk, 1, bk]);
    const upper = grp(sh);
    addA(upper, G.upperArm, skin, null, null, [bk, 1, bk]);
    addA(upper, G.elbow, skin, [0, -BODY.upperArm, -0.04]);
    const fore = grp(upper, [0, -BODY.upperArm, 0]);
    addA(fore, G.foreArm, skin, null, null, [bk, 1, bk]);
    addA(fore, G.bracer, leather, null, null, [bk, 1, bk]);
    const hand = grp(fore, [0, -BODY.foreArm, 0]);
    addA(hand, G.fist, matOf(L.skin, 0.62), [0, 0.0, 0.0]);
    addA(hand, G.knuckles, matOf(L.skin, 0.62), [0, -0.035, 0.02]);
    addA(hand, G.thumb, matOf(L.skin, 0.62), [sx * 0.035, -0.01, 0.03], [0.4, 0, sx * 0.4]);
    // armour on the arms
    const manica = (side === "R" && armor !== "light") || (armor === "heavy");
    if (manica) {
      for (let i = 0; i < 5; i++) addA(upper, G.manicaSeg, metal, [0, -0.03 - i * 0.052, 0], null, [bk * (1 - i * 0.03), 1, bk * (1 - i * 0.03)]);
      for (let i = 0; i < 4; i++) addA(fore, G.manicaSeg, metal, [0, -0.02 - i * 0.05, 0], null, [bk * (0.82 - i * 0.05), 1, bk * (0.8 - i * 0.05)]);
    }
    const plate = (side === "L" && armor !== "light") || armor === "heavy";
    if (plate) {
      addA(sh, G.pauldron, metal, [-sx * 0.02, 0.03, 0], [0, 0, -sx * 0.5], [0.13 * bk, 0.1, 0.12 * bk]);
      addA(sh, G.pauldron, accent, [-sx * 0.02, 0.0, 0], [0, 0, -sx * 0.5], [0.135 * bk, 0.07, 0.125 * bk]);
    }
    if (armor === "light") addA(fore, G.wrap, cloth, [0, -0.04, 0], null, [1.1, 1.4, 1.1]);
    arms[side] = { sh, upper, fore, hand, sx, meshes: armMeshes };
  }

  /* --------------------------------------------------------------- legs */
  const legs = {};
  for (const [side, sx] of [["R", 1], ["L", -1]]) {
    const hip = grp(pelvis, [-sx * BODY.hipHalf, -0.03, 0]);
    const thigh = grp(hip);
    add(thigh, G.thigh, skin, null, null, [bk, 1, bk]);
    const shin = grp(thigh, [0, -BODY.thigh, 0]);
    add(shin, G.shin, skin);
    add(shin, G.knee, skin, [0, 0.0, 0.052]);
    if (armor === "light") {
      for (let i = 0; i < 4; i++) add(shin, G.wrap, cloth, [0, -0.2 - i * 0.05, 0]);
    } else {
      add(shin, G.greave, metal, [0, -0.02, 0.004]);
      add(shin, G.greaveKnee, metal, [0, 0.0, 0.05], null, [0.8, 0.8, 0.8]);
    }
    const foot = grp(shin, [0, -BODY.shin, 0]);
    add(foot, G.footSkin, skin, [0, -0.035, 0.05]);
    add(foot, G.sole, darkLeather, [0, -0.062, 0.045]);
    add(foot, G.ankleStrap, leather, [0, -0.01, 0.005], [Math.PI / 2, 0, 0]);
    add(foot, G.ankleStrap, leather, [0, -0.04, 0.07], [Math.PI / 2 - 0.3, 0, 0], [1.05, 1.2, 1]);
    add(foot, G.ankleStrap, leather, [0, -0.045, 0.12], [Math.PI / 2 - 0.2, 0, 0], [1.0, 1.25, 1]);
    legs[side] = { hip, thigh, shin, foot, sx };
  }

  /* --------------------------------------------------------------- weapons (world-placed) */
  const W = equip.weapon;
  const weapons = {};
  for (const side of ["R", "L"]) {
    const bl = W.blades[side];
    if (bl) {
      const m = buildWeaponMesh(bl.model);
      root.add(m);
      weapons[side] = { mesh: m, blade: bl, prevDir: new THREE.Vector3(0, 1, 0) };
    }
  }
  let shield = null;
  if (W.shield) {
    shield = buildShieldMesh(W.shield.model, equip.shieldColor || L.cloth, equip.shieldTrim || L.accent, equip.pattern || 0);
    root.add(shield);
  }

  const rig = {
    root, body, scaler, pelvis, spine, chest, head, arms, legs, weapons, shield, all, headMeshes,
    look: L, equip, gait: null, scale: sc, fp: false,
  };
  root.userData.rig = rig;
  return rig;
}

export function disposeGladiator(rig) {
  if (!rig) return;
  disposeShield(rig.shield);
  rig.root.removeFromParent();
}

/** First-person: hide own head, arms and held weapons (the view model draws them). */
export function setFirstPerson(rig, on) {
  if (rig.fp === on) return;
  rig.fp = on;
  for (const m of rig.headMeshes) m.visible = !on;
  for (const s of ["R", "L"]) for (const m of rig.arms[s].meshes) m.visible = !on;
  for (const w of Object.values(rig.weapons)) w.mesh.visible = !on;
  if (rig.shield) rig.shield.visible = !on;
}

/* ======================================================================
   IK + pose
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

/** Orient `group` (limb along local −Y) to point along world `dir`, roll from `hint`. */
export function aimLimb(group, dir, hint) {
  _yA.copy(dir).multiplyScalar(-1);
  _zA.copy(hint).addScaledVector(_yA, -hint.dot(_yA));
  if (_zA.lengthSq() < 1e-8) _zA.set(0, 0, 1).addScaledVector(_yA, -_yA.z);
  _zA.normalize();
  _xA.crossVectors(_yA, _zA);
  _m.makeBasis(_xA, _yA, _zA);
  _q1.setFromRotationMatrix(_m);
  group.parent.getWorldQuaternion(_q2);
  group.quaternion.copy(_q2.invert().multiply(_q1));
  group.updateMatrixWorld(true);
}

const _A = new THREE.Vector3();
const _J = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
/** Two-bone IK in world space from `upper`'s origin to `target`, bending toward `pole`. */
export function solveTwoBone(upper, lower, l1, l2, target, pole, rollHint) {
  upper.getWorldPosition(_A);
  _dir.subVectors(target, _A);
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
  aimLimb(upper, _v1, rollHint || _pole);
  _v2.copy(_A).addScaledVector(_dir, d);
  _v3.subVectors(_v2, _J).normalize();
  aimLimb(lower, _v3, rollHint || _pole);
}

function makeGait() {
  return {
    feet: [
      { side: "R", sx: 1, planted: null, swing: null, yaw: 0 },
      { side: "L", sx: -1, planted: null, swing: null, yaw: 0 },
    ],
    last: 1,
    phase: 0,
    crouch: 0,
    lean: 0,
    roll: 0,
    twist: 0,
    headYaw: 0,
    headPitch: 0,
    hurtK: 0,
    fall: 0,
    idleT: Math.random() * 10,
    hands: { R: null, L: null },
  };
}

const _fw = new THREE.Vector3();
const _rt = new THREE.Vector3();
const _hipW = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const lp = {};
const wp = { x: 0, y: 0, z: 0 };
const wd = { x: 0, y: 0, z: 0 };
const _up = new THREE.Vector3(0, 1, 0);

/** Where a foot wants to be (world xz), stance offsets in the fighter frame. */
function idealFoot(out, foot, x, z, yaw, vx, vz, lead, fightStance) {
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = -fz;
  const rz = fx;
  // fighting stance: left foot forward, right foot back, shoulder-width apart
  const width = 0.13;
  const stagger = fightStance ? (foot.sx > 0 ? -0.14 : 0.12) : 0;
  out.set(x + rx * foot.sx * width + fx * stagger + vx * lead, 0, z + rz * foot.sx * width + fz * stagger + vz * lead);
  return out;
}

/**
 * Pose a gladiator from an engine fighter for this frame.
 * ctx: { time, target (other fighter), onStep(speed), fp }
 */
export function poseGladiator(rig, f, dt, ctx = {}) {
  if (!rig.gait) rig.gait = makeGait();
  const G = rig.gait;
  const k = Math.min(1, dt * 12);
  G.idleT += dt;
  const speed = Math.hypot(f.vx, f.vz);
  const act = f.act;
  const yaw = f.yaw;
  const sc = rig.scale;

  rig.root.position.set(f.x, 0, f.z);
  rig.root.rotation.set(0, yaw, 0);

  _fw.set(Math.sin(yaw), 0, Math.cos(yaw));
  _rt.set(-_fw.z, 0, _fw.x);
  // local velocity (for leans)
  const vf = f.vx * _fw.x + f.vz * _fw.z;
  const vr = f.vx * _rt.x + f.vz * _rt.z;

  /* ------------------------------------------------ body attitude */
  let crouch = 0.05 + (f.blocking ? 0.05 : 0) + Math.min(speed / 6, 1) * 0.03;
  let lean = 0.05 + clamp(vf / 6, -0.3, 0.6) * 0.25 + (f.sprinting ? 0.12 : 0);
  let roll = clamp(-vr / 5, -1, 1) * 0.08;
  let twist = 0;
  let bodyShiftX = 0;
  let bodyShiftZ = 0;
  let bodyRoll = 0;
  let bodyPitch = 0;
  if (act && act.type === "attack") {
    const tot = act.startup + act.active + act.recovery;
    const p = act.t / tot;
    if (act.kind === "kick") {
      lean = -0.18;
      crouch = 0.02;
    } else {
      // wind up: twist away; strike: twist through and lean in
      const s = act.t < act.startup ? act.t / act.startup : act.t < act.startup + act.active ? 1 + (act.t - act.startup) / act.active : 2 - clamp((act.t - act.startup - act.active) / act.recovery, 0, 1) * 2;
      const dirSign = act.atk.id === "slashL" || act.atk.id === "cutL" || act.atk.id === "chopL" ? -1 : 1;
      const heavyK = act.kind === "heavy" ? 1.3 : 1;
      if (s <= 1) twist = -0.28 * s * dirSign * heavyK;
      else if (s <= 2 && act.t < act.startup + act.active) twist = (-0.28 + 0.55 * (s - 1)) * dirSign * heavyK;
      else twist = 0.27 * dirSign * heavyK * clamp(s / 2, 0, 1);
      lean += act.t >= act.startup * 0.6 && act.t <= act.startup + act.active + act.recovery * 0.4 ? 0.14 * heavyK : 0.02;
      crouch += 0.04 * heavyK * Math.sin(clamp(p, 0, 1) * Math.PI);
      if (act.kind === "heavy" && act.t < act.startup) lean -= 0.1 * (act.t / act.startup);
    }
  } else if (act && act.type === "dodge") {
    const p = clamp(act.t / act.dur, 0, 1);
    const s = Math.sin(p * Math.PI);
    crouch += 0.2 * s;
    const lx = act.dx * _rt.x + act.dz * _rt.z;
    const lz = act.dx * _fw.x + act.dz * _fw.z;
    bodyRoll = -lx * 0.35 * s;
    bodyPitch = lz * 0.25 * s;
    lean += lz > 0 ? 0.2 * s : -0.08 * s;
  } else if (act && (act.type === "hurt" || act.type === "stagger")) {
    const p = clamp(act.t / act.dur, 0, 1);
    const s = Math.sin(Math.min(1, p * 1.4) * Math.PI);
    const big = act.type === "stagger" || act.heavy ? 1 : 0.6;
    lean -= 0.35 * s * big;
    twist += (act.reason === "parried" ? 0.35 : 0.15) * s * big;
    roll += 0.1 * s * big;
    crouch += 0.05 * s;
  } else if (act && act.type === "blockstun") {
    lean -= 0.12 * Math.sin(clamp(act.t / act.dur, 0, 1) * Math.PI);
  }
  // idle breathing
  const breathe = Math.sin(G.idleT * 1.8) * 0.006;

  if (f.defeated) {
    G.fall = Math.min(1, G.fall + dt * 0.9);
  } else G.fall = Math.max(0, G.fall - dt * 3);
  if (G.fall > 0) {
    const a = clamp(G.fall * 2, 0, 1); // to knees
    const b = clamp(G.fall * 2 - 1, 0, 1); // tip over
    crouch = 0.05 + 0.42 * a;
    lean = 0.35 * a;
    bodyRoll = 1.35 * b * b;
    bodyShiftX = -0.3 * b;
  }

  G.crouch += (crouch - G.crouch) * k;
  G.lean += (lean - G.lean) * Math.min(1, dt * 14);
  G.roll += (roll - G.roll) * k;
  G.twist += (twist - G.twist) * Math.min(1, dt * 22);

  // body group: dodge roll / defeat tip (pivot at the feet)
  rig.body.rotation.set(bodyPitch, 0, bodyRoll);
  rig.body.position.set(bodyShiftX, 0, bodyShiftZ);

  G.phase += (speed * dt) / 0.95 * Math.PI;
  const bob = -Math.abs(Math.sin(G.phase)) * Math.min(speed / 6, 1) * 0.03;
  rig.pelvis.position.y = BODY.hipY - G.crouch + bob + breathe;
  rig.pelvis.rotation.set(G.lean * 0.3, -G.twist * 0.35, G.roll * 0.5);
  rig.spine.rotation.set(G.lean * 0.4, G.twist * 0.45, G.roll * 0.4);
  rig.chest.rotation.set(G.lean * 0.3 + breathe * 2, G.twist * 0.35, 0);

  // head tracks the opponent
  const tgt = ctx.target;
  if (tgt && !f.defeated) {
    const yawTo = Math.atan2(tgt.x - f.x, tgt.z - f.z);
    const rel = clamp(wrap(yawTo - yaw), -1.1, 1.1);
    G.headYaw += (rel - G.headYaw) * Math.min(1, dt * 8);
  } else G.headYaw *= 0.9;
  rig.head.rotation.set(-G.lean * 0.5 + (f.defeated ? 0.5 : 0), G.headYaw - G.twist * 0.9, -G.roll * 0.3);
  rig.root.updateMatrixWorld(true);

  /* ------------------------------------------------ legs (planted feet) */
  const thighL = BODY.thigh * sc;
  const shinL = BODY.shin * sc;
  const ankleH = BODY.ankle * sc;
  const stepDur = Math.max(0.16, Math.min(0.3, 0.3 - 0.028 * speed));
  const lead = stepDur * 0.55;
  const inFight = !f.sprinting;
  const kicking = act && act.type === "attack" && act.kind === "kick" ? act : null;
  for (const foot of G.feet) {
    const leg = rig.legs[foot.side];
    const t = _tmp;
    if (!foot.planted) {
      idealFoot(t, foot, f.x, f.z, yaw, 0, 0, 0, inFight);
      foot.planted = { x: t.x, z: t.z };
      foot.yaw = yaw;
    }
    if (kicking && foot.side === "R" && !f.defeated) {
      // the kicking foot follows the engine's kick hitbox
      const K = kickingFoot(f, kicking);
      t.set(K.x, Math.max(ankleH, K.y), K.z);
      foot.swing = null;
      foot.kickPose = true;
    } else if (foot.swing) {
      const s = foot.swing;
      s.t += dt / s.dur;
      idealFoot(_v2, foot, f.x, f.z, yaw, f.vx, f.vz, lead, inFight);
      s.to.x += (_v2.x - s.to.x) * Math.min(1, dt * 10);
      s.to.z += (_v2.z - s.to.z) * Math.min(1, dt * 10);
      const e = Math.min(1, s.t);
      const ee = e * e * (3 - 2 * e);
      t.set(s.from.x + (s.to.x - s.from.x) * ee, Math.sin(e * Math.PI) * s.lift, s.from.z + (s.to.z - s.from.z) * ee);
      foot.yaw += wrap(yaw - foot.yaw) * Math.min(1, dt * 12);
      if (s.t >= 1) {
        foot.planted = { x: s.to.x, z: s.to.z };
        foot.swing = null;
        G.last = foot === G.feet[0] ? 0 : 1;
        if (ctx.onStep && speed > 0.6) ctx.onStep(speed);
      }
      t.y += ankleH;
    } else {
      if (foot.kickPose) {
        foot.kickPose = false;
        // kicked foot lands back under the body
        idealFoot(_v2, foot, f.x, f.z, yaw, 0, 0, 0, inFight);
        foot.swing = { t: 0.3, dur: 0.18, from: { x: _v2.x + _fw.x * 0.5, z: _v2.z + _fw.z * 0.5 }, to: { x: _v2.x, z: _v2.z }, lift: 0.12 };
      }
      t.set(foot.planted.x, ankleH, foot.planted.z);
    }
    foot.target = foot.target || new THREE.Vector3();
    foot.target.copy(t);
    void leg;
  }
  if (!f.defeated) {
    const moving = speed > 0.35;
    const swinging = G.feet.filter((ft) => ft.swing);
    const canStart = swinging.length === 0 || (swinging.length === 1 && swinging[0].swing.t > (speed > 3.5 ? 0.45 : 0.8));
    if (canStart && !kicking) {
      let best = null;
      let bestScore = 0;
      for (const foot of G.feet) {
        if (foot.swing) continue;
        idealFoot(_v1, foot, f.x, f.z, yaw, f.vx, f.vz, lead, inFight);
        const err = Math.hypot(_v1.x - foot.planted.x, _v1.z - foot.planted.z);
        rig.legs[foot.side].hip.getWorldPosition(_hipW);
        const reach = Math.hypot(_hipW.x - foot.planted.x, _hipW.y - ankleH, _hipW.z - foot.planted.z);
        const stretched = reach > (thighL + shinL) * 0.985;
        const yawErr = Math.abs(wrap(yaw - foot.yaw));
        const alt = (foot === G.feet[0] ? 0 : 1) !== G.last ? 1.25 : 1;
        const score = (err + (yawErr > 0.6 ? 0.2 : 0)) * alt + (stretched ? 1 : 0);
        const thresh = moving ? 0.05 : 0.12;
        if ((err > thresh || stretched || yawErr > 0.6) && score > bestScore) {
          bestScore = score;
          best = foot;
        }
      }
      if (best) {
        idealFoot(_v1, best, f.x, f.z, yaw, f.vx, f.vz, lead, inFight);
        const dodging = act && act.type === "dodge";
        best.swing = {
          t: 0,
          dur: dodging ? 0.13 : moving ? stepDur : 0.2,
          from: { ...best.planted },
          to: { x: _v1.x, z: _v1.z },
          lift: dodging ? 0.07 : moving ? Math.min(0.16, 0.05 + speed * 0.02) : 0.05,
        };
      }
    }
  }
  for (const foot of G.feet) {
    const leg = rig.legs[foot.side];
    // knee pole: forward, slightly outward
    _pole.set(_fw.x - _rt.x * foot.sx * 0.15, 0.05, _fw.z - _rt.z * foot.sx * 0.15);
    const pole = _pole.clone();
    solveTwoBone(leg.thigh, leg.shin, thighL, shinL, foot.target, pole, _fw);
    const pitch = foot.kickPose ? -0.6 : foot.swing ? -0.2 * Math.sin(Math.min(1, foot.swing.t) * Math.PI) : 0;
    _q1.setFromEuler(new THREE.Euler(pitch, foot.yaw, 0, "YXZ"));
    leg.shin.getWorldQuaternion(_q2);
    leg.foot.quaternion.copy(_q2.invert().multiply(_q1));
  }

  /* ------------------------------------------------ arms + weapons (engine pose) */
  if (rig.fp) return; // first person: the view model owns hands and weapons
  poseArmsAndWeapons(rig, f, dt);
}

const _kA = { x: 0, y: 0, z: 0 };
const _kB = { x: 0, y: 0, z: 0 };
function kickingFoot(f, act) {
  const t = act.t;
  const a = act.atk;
  if (t < a.startup) {
    // chamber: knee up
    const p = t / a.startup;
    localToWorld(_kB, f.x, f.z, f.yaw, 0.1, 0.1 + 0.35 * p, 0.05 + 0.2 * p);
    return _kB;
  }
  if (t <= a.startup + a.active) {
    kickSegment(f, a, t, _kA, _kB);
    return _kB;
  }
  const p = clamp((t - a.startup - a.active) / a.recovery, 0, 1);
  kickSegment(f, a, a.startup + a.active, _kA, _kB);
  const x = _kB.x + (f.x - _kB.x) * p;
  const z = _kB.z + (f.z - _kB.z) * p;
  _kB.x = x;
  _kB.z = z;
  _kB.y = _kB.y * (1 - p);
  return _kB;
}

const _hand = new THREE.Vector3();
const _bd = new THREE.Vector3();
const _w = new THREE.Vector3();
const _n = new THREE.Vector3();
const _basis = new THREE.Matrix4();

/** Blade frame: Y along the blade, X = edge direction (leading the motion). */
export function orientBlade(obj, pos, dir, prevDir, sideHint) {
  _w.subVectors(dir, prevDir);
  if (_w.lengthSq() > 1e-5) {
    _w.addScaledVector(dir, -_w.dot(dir)).normalize();
    obj.userData.edge = obj.userData.edge || new THREE.Vector3();
    obj.userData.edge.lerp(_w, 0.5).normalize();
    _w.copy(obj.userData.edge);
  } else {
    // at rest: edge toward the hint (forward/down for a guard)
    _w.copy(sideHint).addScaledVector(dir, -sideHint.dot(dir));
    if (_w.lengthSq() < 1e-6) _w.set(1, 0, 0);
    _w.normalize();
    if (obj.userData.edge) {
      obj.userData.edge.lerp(_w, 0.2).normalize();
      _w.copy(obj.userData.edge);
    }
  }
  _w.addScaledVector(dir, -_w.dot(dir)).normalize();
  _n.crossVectors(_w, dir);
  _basis.makeBasis(_w, dir, _n);
  obj.quaternion.setFromRotationMatrix(_basis);
  obj.position.copy(pos);
}

const _sideHint = new THREE.Vector3();
const _shN = new THREE.Vector3();
const _shX = new THREE.Vector3();
const _shY = new THREE.Vector3();

export function poseArmsAndWeapons(rig, f, dt) {
  const G = rig.gait;
  const sc = rig.scale;
  const upperL = BODY.upperArm * sc;
  const foreL = BODY.foreArm * sc;
  const yaw = f.yaw;
  _fw.set(Math.sin(yaw), 0, Math.cos(yaw));
  _rt.set(-_fw.z, 0, _fw.x);
  for (const side of ["R", "L"]) {
    const arm = rig.arms[side];
    const sgn = side === "R" ? 1 : -1;
    const pose = handPose(f, side, lp);
    if (pose) {
      localToWorld(wp, f.x, f.z, yaw, lp.hx, lp.hy, lp.hz);
      _hand.set(wp.x, wp.y + rig.body.position.y, wp.z);
    } else {
      // empty hand: hangs by the side / swings with the gait
      const sw = Math.sin(G.phase) * Math.min(Math.hypot(f.vx, f.vz) / 5, 1);
      localToWorld(wp, f.x, f.z, yaw, sgn * 0.3, 0.95 - G.crouch * 0.5, 0.05 + sw * sgn * 0.25);
      _hand.set(wp.x, wp.y, wp.z);
    }
    if (f.defeated && G.fall > 0) {
      // arms go slack during the fall: follow the body
      arm.sh.getWorldPosition(_v1);
      _hand.lerp(_v1.add(_up.clone().multiplyScalar(-0.5)), Math.min(1, G.fall * 1.5));
    }
    const hs = G.hands;
    if (!hs[side]) hs[side] = _hand.clone();
    const attacking = f.act && f.act.type === "attack";
    // exact while attacking (the blade must be where the hitbox is), smoothed otherwise
    if (attacking) hs[side].copy(_hand);
    else hs[side].lerp(_hand, Math.min(1, dt * 26));
    _pole.set(-_fw.x * 0.4 + _rt.x * sgn * 0.8, -0.6, -_fw.z * 0.4 + _rt.z * sgn * 0.8);
    const pole = _pole.clone();
    solveTwoBone(arm.upper, arm.fore, upperL, foreL, hs[side], pole, null);

    // held weapon / shield, placed from the (smoothed) engine pose
    const wpn = rig.weapons[side];
    if (wpn && pose) {
      dirToWorld(wd, yaw, lp.dx, lp.dy, lp.dz);
      _bd.set(wd.x, wd.y, wd.z).normalize();
      // guard: edge faces forward-down
      _sideHint.copy(_fw).multiplyScalar(0.6).add(_rt.clone().multiplyScalar(-sgn * 0.4));
      if (!wpn.smoothDir) wpn.smoothDir = _bd.clone();
      if (attacking) wpn.smoothDir.copy(_bd);
      else wpn.smoothDir.lerp(_bd, Math.min(1, dt * 26)).normalize();
      orientBlade(wpn.mesh, hs[side], wpn.smoothDir, wpn.prevDir, _sideHint);
      wpn.prevDir.copy(wpn.smoothDir);
      wpn.mesh.position.sub(rig.root.position); // weapons are children of root (world-aligned)
      wpn.mesh.quaternion.premultiply(_q1.setFromEuler(new THREE.Euler(0, -yaw, 0)));
    }
    if (side === "L" && rig.shield && pose) {
      dirToWorld(wd, yaw, lp.dx, lp.dy, lp.dz);
      _shN.set(wd.x, wd.y, wd.z).normalize();
      _shX.crossVectors(_up, _shN).normalize();
      _shY.crossVectors(_shN, _shX);
      _basis.makeBasis(_shX, _shY, _shN);
      rig.shield.quaternion.setFromRotationMatrix(_basis);
      rig.shield.position.copy(hs[side]).addScaledVector(_shN, 0.05).sub(rig.root.position);
      rig.shield.quaternion.premultiply(_q1.setFromEuler(new THREE.Euler(0, -yaw, 0)));
      // rotate position into root-local
      rig.shield.position.applyAxisAngle(_up, -yaw);
    }
    if (wpn && pose) wpn.mesh.position.applyAxisAngle(_up, -yaw);
  }
}

/** Debug helper: hurtbox capsule centres (world) for a fighter. */
export function hurtboxCentres(f) {
  return HURTBOXES.map((h) => {
    const a = localToWorld({}, f.x, f.z, f.yaw, h.a[0], h.a[1], h.a[2]);
    const b = localToWorld({}, f.x, f.z, f.yaw, h.b[0], h.b[1], h.b[2]);
    return { a, b, r: h.r };
  });
}
