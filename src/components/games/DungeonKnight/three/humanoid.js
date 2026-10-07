/**
 * Dungeon Knight — the humanoid model + rig shared by the knight and every
 * two-legged enemy (skeletons, dark knights, mages, the five bosses).
 *
 *   root (x, z, yaw)
 *    └ body (dodge roll / defeat fall)
 *       └ hips ─ spine ─ chest ─ neck ─ head
 *          │              └ shoulder L/R ─ upper ─ fore ─ hand
 *          └ hip L/R ─ thigh ─ shin ─ foot
 *
 * Arms are two-bone IK onto hand targets (the knight's come straight from the
 * engine pose, so the drawn sword is the hit-tested sword). Legs are IK onto
 * gait foot targets whose stance phase moves backward at exactly the body's
 * speed — the feet stay planted, nothing skates.
 *
 * Styles (one builder, different parts): knight | skeleton | dark | mage |
 * guardian | warden | frost | jailer | king.
 */
import * as THREE from "three";
import { mat, steel, glow, lathe, ellipsoid, rbox, addMesh, group, geo } from "./materials.js";
import { buildSword, buildShield, buildEnemyWeapon, buildFlask } from "./equipment.js";
import { BODY } from "../engine/pose.js";

const UP = new THREE.Vector3(0, 1, 0);

/* ================================================================== IK */
const _m = new THREE.Matrix4();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
/** Point `g`'s local −Y along world `dir`, rolling its +Z toward `hint`. */
export function aimLimb(g, dir, hint) {
  _y.copy(dir).multiplyScalar(-1).normalize();
  _z.copy(hint).addScaledVector(_y, -hint.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  _q1.setFromRotationMatrix(_m);
  g.parent.getWorldQuaternion(_q2);
  g.quaternion.copy(_q2.invert().multiply(_q1));
  g.updateMatrixWorld(true);
}
const _A = new THREE.Vector3();
const _J = new THREE.Vector3();
const _E = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
/** Two-bone IK from `upper` origin to `target` (world), bending toward `pole`. Returns the reached end point. */
export function solveTwoBone(upper, lower, l1, l2, target, pole, out) {
  upper.getWorldPosition(_A);
  _d.subVectors(target, _A);
  let dist = _d.length();
  if (dist < 1e-5) return out.copy(target);
  _d.divideScalar(dist);
  dist = Math.min(dist, (l1 + l2) * 0.999);
  dist = Math.max(dist, Math.abs(l1 - l2) + 0.02);
  const a = (l1 * l1 + dist * dist - l2 * l2) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1);
  _p.normalize();
  _J.copy(_A).addScaledVector(_d, a).addScaledVector(_p, h);
  _E.copy(_A).addScaledVector(_d, dist);
  _t.subVectors(_J, _A).normalize();
  aimLimb(upper, _t, _p);
  _t.subVectors(_E, _J).normalize();
  aimLimb(lower, _t, _p);
  return out.copy(_E);
}

/* ================================================================== styles */
export const STYLES = {
  knight: { limbs: "plate", torso: "plate", head: "knightHelm", cape: true, tabard: true },
  skeleton: { limbs: "bone", torso: "ribs", head: "skull", helm: "rusty", loin: true },
  dark: { limbs: "plate", torso: "plate", head: "horned", cape: false, bulk: 1.15 },
  mage: { limbs: "sleeve", torso: "robe", head: "hood", robe: true },
  guardian: { limbs: "plate", torso: "plate", head: "greatHelm", cape: true, bulk: 1.2, broken: true },
  warden: { limbs: "bone", torso: "robe", head: "hood", robe: true, antlers: true },
  frost: { limbs: "plate", torso: "plate", head: "iceHelm", crystals: true, bulk: 1.15 },
  jailer: { limbs: "brute", torso: "brute", head: "mask", bulk: 1.35 },
  king: { limbs: "plate", torso: "plate", head: "crown", cape: true, bulk: 1.1 },
};

/**
 * spec: { style, colors: { metal, cloth, trim, leather, eye, bone, dark },
 *         weapon: { kind: "sword", look } | { kind: "shortsword" | … , colors },
 *         shield: look | null, scale, shadows }
 */
export function buildHumanoid(spec) {
  const S = STYLES[spec.style] || STYLES.knight;
  const C = { metal: "#b9bec6", cloth: "#2a7f86", trim: "#c9a45a", leather: "#5b3a22", eye: "#7fe6ff", bone: "#d9d2bd", dark: "#2b2e36", ...spec.colors };
  const shadows = spec.shadows !== false;
  const bulk = S.bulk || 1;

  const metalM = steel(C.metal, 0.32);
  const darkM = steel(C.dark, 0.42);
  const clothM = mat(C.cloth, 0.88, 0, { side: THREE.DoubleSide });
  const trimM = steel(C.trim, 0.3);
  const leatherM = mat(C.leather, 0.8);
  const boneM = mat(C.bone, 0.75);
  const eyeM = glow(C.eye, 2.6);

  const all = [];
  const add = (parent, g, m, pos, rot, scl, cast = true) => {
    const mesh = addMesh(parent, g, m, pos, rot, scl, shadows && cast);
    all.push(mesh);
    return mesh;
  };

  const root = new THREE.Group();
  const body = group(root);
  const hips = group(body, [0, BODY.hipY, 0]);
  const spine = group(hips, [0, 0.06, 0]);
  const chest = group(spine, [0, 0.26, 0]);
  const neck = group(chest, [0, 0.2, 0]);
  const head = group(neck, [0, 0.15, 0.01]);
  const bk = bulk;

  /* ------------------------------------------------------------ torso */
  if (S.torso === "plate") {
    add(chest, geo(`breast:${bk}`, () => lathe([[0.15, -0.3], [0.17, -0.18], [0.2, -0.04], [0.215, 0.08], [0.2, 0.16], [0.14, 0.21], [0.07, 0.22]], 22, 1.28 * bk, 0.82 * bk)), metalM);
    add(chest, geo("ridge", () => new THREE.BoxGeometry(0.018, 0.34, 0.03)), trimM, [0, -0.04, 0.165 * bk], [0.08, 0, 0], null, false);
    add(chest, geo(`gorget:${bk}`, () => lathe([[0.1, 0.16], [0.12, 0.2], [0.09, 0.26]], 16, 1.1 * bk, 1 * bk)), darkM, null, null, null, false);
    // faulds (hanging lames) + belt
    add(hips, geo(`faulds:${bk}`, () => lathe([[0.19, 0.04], [0.205, -0.04], [0.22, -0.12], [0.23, -0.18]], 20, 1.2 * bk, 0.9 * bk)), metalM);
    add(hips, geo(`belt:${bk}`, () => lathe([[0.2, 0.09], [0.207, 0.09], [0.207, 0.035], [0.2, 0.035]], 20, 1.2 * bk, 0.88 * bk)), leatherM, null, null, null, false);
    add(hips, geo("buckle", () => new THREE.BoxGeometry(0.06, 0.05, 0.02)), trimM, [0, 0.062, 0.19 * bk], null, null, false);
    if (S.tabard) {
      // tabard: front + back cloth panels with a trim hem
      const tab = geo("tabard", () => {
        const g = new THREE.PlaneGeometry(0.3, 0.5, 2, 6);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const y = p.getY(i);
          p.setX(i, p.getX(i) * (1 + (0.25 - y) * 0.25));
          p.setZ(i, -((y - 0.25) ** 2) * 0.12);
        }
        g.computeVertexNormals();
        return g;
      });
      const front = add(hips, tab, clothM, [0, -0.16, 0.2], [0.05, 0, 0]);
      const back = add(hips, tab, clothM, [0, -0.16, -0.17], [-0.05, Math.PI, 0]);
      add(front, geo("hem", () => new THREE.BoxGeometry(0.3, 0.025, 0.01)), trimM, [0, -0.25, 0.012], null, null, false);
      // the emblem: a stylised silver tower
      add(chest, geo("emblem", () => new THREE.BoxGeometry(0.07, 0.11, 0.01)), mat(C.cloth, 0.8), [0, -0.12, 0.19], [0.08, 0, 0], null, false);
      hips.userData.tabards = [front, back];
    }
  } else if (S.torso === "ribs") {
    add(chest, geo("spineBone", () => new THREE.CylinderGeometry(0.03, 0.035, 0.48, 7)), boneM, [0, -0.12, -0.04]);
    for (let i = 0; i < 5; i++) {
      const r = 0.15 - Math.abs(i - 1.6) * 0.015;
      add(chest, geo(`rib:${i}`, () => {
        const g = new THREE.TorusGeometry(r, 0.014, 5, 16, Math.PI * 1.55);
        g.rotateX(Math.PI / 2);
        g.rotateY(Math.PI * 0.78);
        g.scale(1.15, 1, 0.85);
        return g;
      }), boneM, [0, 0.1 - i * 0.07, 0.0], null, null, i === 1);
    }
    add(chest, geo("sternum", () => new THREE.BoxGeometry(0.03, 0.22, 0.02)), boneM, [0, -0.02, 0.12], null, null, false);
    add(chest, geo("clavicle", () => new THREE.CylinderGeometry(0.014, 0.014, 0.42, 6)), boneM, [0, 0.12, 0.02], [0, 0, Math.PI / 2], null, false);
    add(hips, geo("pelvisBone", () => lathe([[0.03, 0.06], [0.12, 0.03], [0.14, -0.04], [0.06, -0.08]], 12, 1.2, 0.7)), boneM);
    if (S.loin) {
      const loin = geo("loin", () => {
        const g = new THREE.PlaneGeometry(0.26, 0.34, 3, 4);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.1) p.setX(i, p.getX(i) + Math.sin(i * 7.1) * 0.03); // torn hem
        return g;
      });
      add(hips, loin, clothM, [0, -0.16, 0.14], [0.1, 0, 0]);
      add(hips, loin, clothM, [0, -0.16, -0.12], [-0.1, Math.PI, 0]);
      add(hips, geo("loinBelt", () => new THREE.TorusGeometry(0.15, 0.018, 5, 18)), leatherM, [0, 0.0, 0], [Math.PI / 2, 0, 0], [1.15, 0.85, 1], false);
    }
  } else if (S.torso === "robe") {
    add(chest, geo("robeTop", () => lathe([[0.13, -0.32], [0.17, -0.2], [0.2, -0.02], [0.2, 0.1], [0.15, 0.2], [0.07, 0.23]], 18, 1.2, 0.9)), clothM);
    add(hips, geo("robeSkirt", () => lathe([[0.2, 0.06], [0.24, -0.2], [0.3, -0.55], [0.36, -0.85], [0.37, -0.94], [0.0, -0.94]], 22, 1.1, 1)), clothM);
    add(hips, geo("sash", () => lathe([[0.205, 0.06], [0.21, 0.06], [0.21, -0.01], [0.205, -0.01]], 18, 1.2, 0.95)), trimM, null, null, null, false);
    add(chest, geo("mantle", () => lathe([[0.24, 0.0], [0.26, 0.06], [0.2, 0.17], [0.1, 0.22]], 18, 1.15, 1)), mat(C.trim, 0.8), [0, 0.0, 0]);
  } else if (S.torso === "brute") {
    add(chest, geo("bruteChest", () => lathe([[0.17, -0.3], [0.21, -0.16], [0.26, 0.0], [0.27, 0.1], [0.22, 0.2], [0.1, 0.24]], 20, 1.3, 0.95)), mat(C.leather, 0.65));
    add(chest, geo("bruteHarness", () => new THREE.TorusGeometry(0.29, 0.022, 5, 24, Math.PI)), darkM, [0, -0.02, 0], [0, 0, 0.9], [1.1, 1.0, 0.75], false);
    add(hips, geo("bruteBelt", () => lathe([[0.25, 0.1], [0.26, 0.1], [0.26, 0.0], [0.25, 0.0]], 20, 1.2, 0.95)), darkM);
    add(hips, geo("bruteSkirt", () => lathe([[0.24, 0.0], [0.27, -0.14], [0.29, -0.3]], 18, 1.2, 0.95)), mat(C.leather, 0.85));
    for (let i = 0; i < 3; i++) add(hips, geo("keyRing", () => new THREE.TorusGeometry(0.04, 0.008, 5, 12)), trimM, [0.2 - i * 0.04, -0.02, 0.22], [0, 0.4, 0], null, false);
  }
  if (S.crystals) {
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45;
      add(chest, geo("crystal", () => new THREE.OctahedronGeometry(0.07, 0)), mat("#bfe9ff", 0.15, 0.1, { emissive: "#5fc8ff", emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }), [Math.sin(a) * 0.2, 0.2 + Math.cos(a) * 0.02, -0.12 + Math.abs(a) * 0.05], [0.3, a, 0.2], [0.7, 1.8, 0.7], false);
    }
  }

  /* ------------------------------------------------------------ head */
  const headMeshes = [];
  const addH = (g, m, pos, rot, scl, cast = true) => {
    const mesh = add(head, g, m, pos, rot, scl, cast);
    headMeshes.push(mesh);
    return mesh;
  };
  const eyes = [];
  const eyePair = (y, z, sx = 0.035, size = 1) => {
    for (const s of [-1, 1]) eyes.push(addH(geo("eye", () => new THREE.SphereGeometry(0.016, 8, 6)), eyeM, [s * sx, y, z], null, [size, size * 0.8, size], false));
  };
  switch (S.head) {
    case "knightHelm": {
      addH(geo("helmDome", () => lathe([[0.0, 0.17], [0.07, 0.165], [0.115, 0.13], [0.135, 0.07], [0.14, 0.0], [0.135, -0.07], [0.12, -0.13], [0.1, -0.15]], 22, 1, 1.1)), darkM);
      addH(geo("visor", () => lathe([[0.143, 0.05], [0.15, 0.0], [0.145, -0.06], [0.125, -0.12]], 16, 1, 1.12, -Math.PI * 0.42, Math.PI * 0.84)), steel(C.dark, 0.32), [0, 0, 0.004]);
      addH(geo("slit", () => new THREE.BoxGeometry(0.16, 0.014, 0.03)), mat("#05070a", 1), [0, 0.03, 0.15], null, null, false);
      for (let i = 0; i < 5; i++) addH(geo("breath", () => new THREE.BoxGeometry(0.008, 0.035, 0.02)), mat("#05070a", 1), [-0.04 + i * 0.02, -0.055, 0.15], null, null, false);
      addH(geo("crest", () => new THREE.BoxGeometry(0.018, 0.05, 0.26)), steel(C.dark, 0.3), [0, 0.165, -0.01], null, null, false);
      addH(geo("helmTrim", () => new THREE.TorusGeometry(0.142, 0.01, 5, 26)), trimM, [0, -0.02, 0], [Math.PI / 2, 0, 0], [1, 1.1, 1], false);
      // a short teal plume
      for (let i = 0; i < 6; i++) addH(geo("plume", () => ellipsoid(0.03, 0.022, 0.06, 8, 6)), clothM, [0, 0.19 - i * 0.012, -0.05 - i * 0.045], [0.3 + i * 0.15, 0, 0], [1 - i * 0.08, 1, 1], false);
      break;
    }
    case "greatHelm":
    case "horned":
    case "iceHelm":
    case "crown": {
      const m = S.head === "iceHelm" ? steel(C.metal, 0.2) : darkM;
      addH(geo("greatHelm", () => lathe([[0.0, 0.18], [0.09, 0.17], [0.135, 0.12], [0.15, 0.03], [0.15, -0.08], [0.14, -0.15], [0.0, -0.16]], 20, 1, 1.08)), m);
      // the visor slit glows with the eye colour: readable at a distance
      eyes.push(addH(geo("gSlit", () => new THREE.BoxGeometry(0.17, 0.024, 0.04)), glow(C.eye, 1.8), [0, 0.02, 0.145], null, null, false));
      eyePair(0.02, 0.16, 0.042, 1.8);
      if (S.head === "horned") {
        for (const s of [-1, 1]) addH(geo("horn", () => {
          const g = new THREE.ConeGeometry(0.035, 0.3, 7);
          g.translate(0, 0.15, 0);
          return g;
        }), mat("#d8cdb8", 0.6), [s * 0.12, 0.1, 0], [0, 0, -s * 1.0], null, false);
      } else if (S.head === "iceHelm") {
        for (let i = 0; i < 5; i++) addH(geo("iceSpike", () => new THREE.ConeGeometry(0.03, 0.22, 5)), mat("#cfefff", 0.1, 0.1, { emissive: "#6fd0ff", emissiveIntensity: 0.6 }), [-0.1 + i * 0.05, 0.2, -0.02], [-0.25, 0, (i - 2) * 0.2], null, false);
      } else if (S.head === "crown") {
        addH(geo("crownBand", () => lathe([[0.15, 0.13], [0.16, 0.13], [0.16, 0.2], [0.15, 0.2]], 20)), steel(C.trim, 0.25), null, null, null, false);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          addH(geo("crownSpike", () => new THREE.ConeGeometry(0.025, 0.12, 4)), steel(C.trim, 0.25), [Math.sin(a) * 0.155, 0.25, Math.cos(a) * 0.155], null, null, false);
        }
        addH(geo("crownGem", () => new THREE.OctahedronGeometry(0.025, 0)), glow(C.eye, 2.2), [0, 0.17, 0.163], null, null, false);
      } else if (spec.style === "guardian") {
        addH(geo("gCrest", () => new THREE.BoxGeometry(0.02, 0.07, 0.3)), m, [0, 0.19, 0], null, null, false);
      }
      break;
    }
    case "skull": {
      addH(geo("skull", () => ellipsoid(0.105, 0.115, 0.12, 16, 12)), boneM);
      addH(geo("jaw", () => ellipsoid(0.07, 0.04, 0.075, 10, 8)), boneM, [0, -0.085, 0.03]);
      for (const s of [-1, 1]) addH(geo("socket", () => new THREE.SphereGeometry(0.03, 8, 6)), mat("#0b0806", 1), [s * 0.042, 0.0, 0.095], null, [1, 0.85, 0.6], false);
      eyePair(0.0, 0.108, 0.042, 0.8);
      if (S.helm === "rusty") {
        addH(geo("rustHelm", () => new THREE.SphereGeometry(0.128, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.48)), steel("#7a6650", 0.75), [0, 0.03, -0.005]);
        addH(geo("rustNasal", () => new THREE.BoxGeometry(0.02, 0.09, 0.02)), steel("#6a5844", 0.75), [0, -0.01, 0.125], null, null, false);
      }
      break;
    }
    case "hood": {
      // open at the front: a dark face with glowing eyes inside the cowl
      addH(geo("hood", () => lathe([[0.0, 0.2], [0.1, 0.18], [0.15, 0.1], [0.16, 0.0], [0.15, -0.1], [0.16, -0.17]], 18, 1, 1.15, 0.55, Math.PI * 2 - 1.1)), clothM);
      addH(geo("hoodFace", () => ellipsoid(0.11, 0.13, 0.08, 12, 10)), mat("#050407", 1), [0, -0.02, 0.06], null, null, false);
      eyePair(0.0, 0.16, 0.035, 1.1);
      if (S.antlers) {
        for (const s of [-1, 1]) {
          const ant = group(head, [s * 0.1, 0.14, -0.02]);
          ant.rotation.set(0, 0, -s * 0.6);
          add(ant, geo("antler", () => new THREE.CylinderGeometry(0.012, 0.022, 0.32, 5)), mat("#4a3a2a", 0.9), [0, 0.16, 0], null, null, false);
          add(ant, geo("antlerTine", () => new THREE.CylinderGeometry(0.008, 0.014, 0.14, 5)), mat("#4a3a2a", 0.9), [s * 0.04, 0.2, 0], [0, 0, -s * 0.8], null, false);
        }
      }
      break;
    }
    case "mask": {
      addH(geo("bruteHead", () => ellipsoid(0.13, 0.14, 0.13, 14, 10)), mat("#3a2a24", 0.8));
      addH(geo("ironMask", () => lathe([[0.0, 0.12], [0.12, 0.09], [0.145, 0.0], [0.13, -0.1], [0.0, -0.13]], 16, 1, 1, -Math.PI * 0.45, Math.PI * 0.9)), steel("#4a4440", 0.55), [0, 0, 0.01]);
      for (let i = 0; i < 4; i++) addH(geo("maskBar", () => new THREE.BoxGeometry(0.012, 0.16, 0.012)), steel("#2a2624", 0.5), [-0.045 + i * 0.03, -0.02, 0.145], null, null, false);
      eyePair(0.03, 0.14, 0.045, 1.3);
      break;
    }
    default:
      break;
  }
  if (S.head === "knightHelm") {
    // no eyes visible behind the slit: a faint inner glow keeps it alive
    eyePair(0.03, 0.135, 0.04, 0.6);
  }

  /* ------------------------------------------------------------ cape */
  let cape = null;
  if (S.cape) {
    // a short cloak wrapped round the back (a slice of a flared cylinder), not a flat board
    const cg = new THREE.CylinderGeometry(0.2 * bk, 0.3 * bk, 0.72, 10, 6, true, Math.PI * 0.62, Math.PI * 0.76);
    cg.translate(0, -0.36, 0);
    const pa = cg.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      // ragged hem
      if (pa.getY(i) < -0.7) pa.setY(i, pa.getY(i) + Math.abs(Math.sin(i * 2.7)) * 0.06);
    }
    const base = pa.array.slice();
    cape = add(chest, cg, mat(C.cloth, 0.9, 0, { side: THREE.DoubleSide }), [0, 0.15, -0.03 * bk], [0.06, 0, 0]);
    cape.userData.base = base;
    cape.userData.own = true;
  }

  /* ------------------------------------------------------------ arms */
  const arms = {};
  const UA = BODY.upperArm;
  const FA = BODY.foreArm;
  for (const [side, sx] of [["R", 1], ["L", -1]]) {
    // engine right (+r) is three −x
    const sh = group(chest, [-sx * BODY.shoulderHalf * bk, BODY.shoulderY - BODY.hipY - 0.32, 0.02]);
    const upper = group(sh);
    const fore = group(upper, [0, -UA, 0]);
    const hand = group(fore, [0, -FA, 0]);
    if (S.limbs === "plate") {
      add(sh, geo(`pauldron:${bk}`, () => {
        const g = new THREE.SphereGeometry(0.12 * bk, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
        g.scale(1.05, 0.85, 1.1);
        return g;
      }), metalM, [-sx * 0.02, 0.03, 0], [0, 0, sx * 0.35]);
      add(sh, geo(`pauldron2:${bk}`, () => {
        const g = new THREE.SphereGeometry(0.128 * bk, 16, 6, 0, Math.PI * 2, Math.PI * 0.32, Math.PI * 0.2);
        g.scale(1.05, 0.85, 1.1);
        return g;
      }), trimM, [-sx * 0.02, 0.0, 0], [0, 0, sx * 0.35], null, false);
      add(upper, geo(`upperArmP:${bk}`, () => lathe([[0.0, 0.03], [0.06, 0.02], [0.065, -0.1], [0.058, -0.28], [0.0, -0.32]], 12, bk, bk)), spec.style === "knight" ? mat(C.cloth, 0.85) : darkM);
      add(upper, geo("elbowCop", () => ellipsoid(0.055, 0.055, 0.06, 12, 8)), metalM, [0, -UA, 0.0], null, null, false);
      add(fore, geo(`vambrace:${bk}`, () => lathe([[0.0, 0.0], [0.055, -0.02], [0.06, -0.14], [0.05, -0.27], [0.0, -0.3]], 12, bk, bk)), metalM);
      add(hand, geo(`gauntlet:${bk}`, () => rbox(0.085 * bk, 0.1, 0.075 * bk, 0.015)), darkM, [0, -0.03, 0.0]);
    } else if (S.limbs === "bone") {
      add(sh, geo("shoulderKnob", () => new THREE.SphereGeometry(0.045, 10, 8)), boneM);
      add(upper, geo("humerus", () => new THREE.CylinderGeometry(0.022, 0.026, UA, 7)), boneM, [0, -UA / 2, 0]);
      add(upper, geo("elbowKnob", () => new THREE.SphereGeometry(0.032, 8, 6)), boneM, [0, -UA, 0], null, null, false);
      add(fore, geo("radius", () => new THREE.CylinderGeometry(0.018, 0.022, FA, 6)), boneM, [0.012, -FA / 2, 0]);
      add(fore, geo("ulna", () => new THREE.CylinderGeometry(0.014, 0.017, FA, 6)), boneM, [-0.018, -FA / 2, 0], null, null, false);
      add(hand, geo("boneHand", () => rbox(0.06, 0.08, 0.035, 0.01)), boneM, [0, -0.03, 0]);
      if (spec.style === "warden") {
        add(upper, geo("sleeveW", () => lathe([[0.07, 0.03], [0.09, -0.1], [0.12, -0.3]], 12)), clothM, null, null, null, false);
      }
    } else if (S.limbs === "sleeve") {
      add(sh, geo("sleeveSh", () => new THREE.SphereGeometry(0.07, 10, 8)), clothM);
      add(upper, geo("sleeveU", () => lathe([[0.0, 0.02], [0.06, 0.0], [0.07, -0.15], [0.08, -0.32], [0.0, -0.34]], 12)), clothM);
      add(fore, geo("sleeveF", () => lathe([[0.0, 0.0], [0.07, -0.02], [0.1, -0.2], [0.12, -0.3], [0.0, -0.3]], 12)), clothM);
      add(hand, geo("mageHand", () => ellipsoid(0.04, 0.05, 0.03, 10, 8)), mat("#b9a6c9", 0.7), [0, -0.03, 0]);
    } else if (S.limbs === "brute") {
      add(sh, geo("bruteSh", () => {
        const g = new THREE.SphereGeometry(0.16, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
        g.scale(1.1, 0.9, 1.1);
        return g;
      }), darkM, [-sx * 0.03, 0.04, 0], [0, 0, sx * 0.3]);
      add(upper, geo("bruteU", () => lathe([[0.0, 0.04], [0.085, 0.02], [0.095, -0.12], [0.08, -0.3], [0.0, -0.34]], 12)), mat("#4a3328", 0.75));
      add(fore, geo("bruteF", () => lathe([[0.0, 0.0], [0.08, -0.03], [0.085, -0.15], [0.07, -0.29], [0.0, -0.31]], 12)), darkM);
      add(hand, geo("bruteHand", () => rbox(0.11, 0.12, 0.1, 0.02)), darkM, [0, -0.04, 0]);
    }
    arms[side] = { sh, upper, fore, hand, sx };
  }

  /* ------------------------------------------------------------ legs */
  const legs = {};
  const TH = 0.46;
  const SHN = 0.46;
  for (const [side, sx] of [["R", 1], ["L", -1]]) {
    const hip = group(hips, [-sx * 0.11 * bk, -0.03, 0]);
    const thigh = group(hip);
    const shin = group(thigh, [0, -TH, 0]);
    const foot = group(shin, [0, -SHN, 0]);
    if (S.robe) {
      // legs hidden by the robe: just feet peeking out
      add(foot, geo("robeFoot", () => rbox(0.09, 0.06, 0.2, 0.02)), mat("#1b1714", 0.9), [0, -0.035, 0.04]);
    } else if (S.limbs === "bone") {
      add(thigh, geo("femur", () => new THREE.CylinderGeometry(0.026, 0.03, TH, 7)), boneM, [0, -TH / 2, 0]);
      add(shin, geo("kneeKnob", () => new THREE.SphereGeometry(0.036, 8, 6)), boneM, null, null, null, false);
      add(shin, geo("tibia", () => new THREE.CylinderGeometry(0.02, 0.026, SHN, 6)), boneM, [0, -SHN / 2, 0]);
      add(foot, geo("boneFoot", () => rbox(0.07, 0.04, 0.17, 0.01)), boneM, [0, -0.025, 0.04]);
    } else if (S.limbs === "brute") {
      add(thigh, geo("bruteT", () => lathe([[0.0, 0.03], [0.11, 0.0], [0.1, -0.2], [0.08, -0.43], [0.0, -0.46]], 12)), mat(C.leather, 0.8));
      add(shin, geo("bruteS", () => lathe([[0.0, 0.0], [0.09, -0.03], [0.09, -0.2], [0.075, -0.42], [0.0, -0.46]], 12)), darkM);
      add(foot, geo("bruteBoot", () => rbox(0.13, 0.08, 0.26, 0.03)), mat("#1d1612", 0.85), [0, -0.04, 0.05]);
    } else {
      add(thigh, geo(`cuisse:${bk}`, () => lathe([[0.0, 0.04], [0.085, 0.02], [0.088, -0.12], [0.075, -0.32], [0.065, -0.44], [0.0, -0.46]], 12, bk, bk)), spec.style === "knight" ? mat("#3a3530", 0.8) : darkM);
      add(thigh, geo(`cuissePlate:${bk}`, () => lathe([[0.09, 0.0], [0.094, -0.12], [0.082, -0.3]], 12, bk, bk, -Math.PI * 0.45, Math.PI * 0.9)), metalM, null, null, null, false);
      add(shin, geo("kneeCop", () => ellipsoid(0.06, 0.06, 0.055, 12, 8)), metalM, [0, 0, 0.03], null, null, false);
      add(shin, geo(`greave:${bk}`, () => lathe([[0.0, 0.0], [0.065, -0.04], [0.07, -0.16], [0.055, -0.34], [0.05, -0.4], [0.0, -0.44]], 12, bk, bk)), metalM);
      add(foot, geo(`boot:${bk}`, () => rbox(0.1 * bk, 0.075, 0.24, 0.025)), spec.style === "knight" ? leatherM : darkM, [0, -0.04, 0.045]);
      add(foot, geo("bootCuff", () => lathe([[0.065, 0.04], [0.07, 0.0], [0.065, -0.03]], 12)), spec.style === "knight" ? leatherM : darkM, [0, 0.0, 0], null, null, false);
    }
    legs[side] = { hip, thigh, shin, foot, sx, TH, SHN };
  }

  /* ------------------------------------------------------------ held items */
  let weapon = null;
  let weaponLen = 1;
  if (spec.weapon) {
    if (spec.weapon.kind === "sword") weapon = buildSword(spec.weapon.look, shadows);
    else weapon = buildEnemyWeapon(spec.weapon.kind, spec.weapon.colors || {}, shadows);
    weaponLen = weapon.userData.len || 1;
    root.add(weapon);
  }
  let shield = null;
  if (spec.shield) {
    shield = buildShield(spec.shield, shadows);
    if (spec.style === "guardian") {
      // a broken shield: a wedge has split off
      shield.userData.broken = true;
      shield.children[0].scale.set(1, 0.72, 1);
      shield.children[0].position.y = 0.06;
    }
    root.add(shield);
  }
  const flask = spec.style === "knight" ? buildFlask() : null;
  if (flask) {
    flask.visible = false;
    root.add(flask);
  }

  const scale = spec.scale || 1;
  body.scale.setScalar(scale);
  const rig = {
    root, body, hips, spine, chest, neck, head, arms, legs, weapon, weaponLen, shield, flask, cape, eyes, headMeshes, all,
    style: spec.style, scale, bulk: bk,
    gait: { phase: 0, idle: Math.random() * 6, lastX: null, lastZ: null, speed: 0, dirX: 0, dirZ: 1, swayV: 0, sway: 0 },
    edge: new THREE.Vector3(1, 0, 0),
    prevD: new THREE.Vector3(0, 1, 0),
    eyeBase: 2.6,
  };
  root.userData.rig = rig;
  return rig;
}

/** Replace the knight's sword / shield / armour colours when equipment changes. */
export function swapKnightWeapon(rig, look, shadows = true) {
  if (rig.weapon) {
    rig.root.remove(rig.weapon);
  }
  rig.weapon = buildSword(look, shadows);
  rig.weaponLen = look.len;
  rig.root.add(rig.weapon);
}
export function swapKnightShield(rig, look, shadows = true) {
  if (rig.shield) rig.root.remove(rig.shield);
  rig.shield = buildShield(look, shadows);
  rig.root.add(rig.shield);
}

/* ================================================================== posing */
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _h = new THREE.Vector3();
const _n = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _reach = new THREE.Vector3();
const _mx = new THREE.Matrix4();
const _bx = new THREE.Vector3();
const _by = new THREE.Vector3();
const _bz = new THREE.Vector3();

/** local engine frame (r, u, f) → rig root space (x = −r) */
function rootLocal(out, r, u, f) {
  return out.set(-r, u, f);
}

/**
 * P = {
 *   x, z, yaw,                world placement
 *   vx, vz,                   velocity (gait)
 *   twist, lean, crouch,      torso (rad, rad, m)
 *   roll, rollAxis,           dodge roll (rad) about the root's local X
 *   fall, fallSide,           defeat (0..1)
 *   hurt,                     0..1 flinch
 *   hR: [r,u,f], dR: [r,u,f]  right hand target + weapon direction (engine local)
 *   hL: [r,u,f], nL: [r,u,f]  left hand target + shield facing
 *   flask: bool, eyes: 0..1 extra glow, headYaw, idleK
 * }
 */
export function poseHumanoid(rig, P, dt, time) {
  const g = rig.gait;
  const s = rig.scale;
  rig.root.position.set(P.x, P.y || 0, P.z);
  rig.root.rotation.set(0, P.yaw, 0);

  /* ---- gait */
  if (g.lastX === null) {
    g.lastX = P.x;
    g.lastZ = P.z;
  }
  const mx = P.x - g.lastX;
  const mz = P.z - g.lastZ;
  g.lastX = P.x;
  g.lastZ = P.z;
  const moved = Math.hypot(mx, mz);
  const sp = dt > 0 ? Math.min(12, moved / dt) : 0;
  g.speed += (sp - g.speed) * (1 - Math.exp(-10 * dt));
  if (moved > 1e-4) {
    // movement direction in the rig's local frame
    const c = Math.cos(P.yaw);
    const si = Math.sin(P.yaw);
    const lx = (mx * c - mz * si) / moved; // local x (three)
    const lz = (mx * si + mz * c) / moved; // local z (forward)
    g.dirX += (lx - g.dirX) * (1 - Math.exp(-12 * dt));
    g.dirZ += (lz - g.dirZ) * (1 - Math.exp(-12 * dt));
  }
  const run = g.speed > 4.6;
  const stride = (run ? 2.0 : 1.3) * s; // metres per full cycle
  g.phase = (g.phase + moved / stride) % 1;
  g.idle += dt;
  const moving = g.speed > 0.35 && !P.noGait;
  const amp = moving ? Math.min(1, g.speed / 1.4) : 0;
  g.amp = (g.amp || 0) + (amp - (g.amp || 0)) * (1 - Math.exp(-10 * dt));

  /* ---- body (roll / fall) */
  const body = rig.body;
  body.position.set(0, 0, 0);
  body.rotation.set(0, 0, 0);
  if (P.roll) {
    // tuck-and-roll about the hips
    const piv = 0.55 * s;
    body.position.y = piv - Math.cos(P.roll) * piv - Math.sin(Math.min(Math.PI, P.roll)) * 0.38 * s;
    body.position.z = Math.sin(P.roll) * piv * (P.rollBack ? -1 : 1);
    body.rotation.x = (P.rollBack ? -1 : 1) * P.roll;
  }
  if (P.fall) {
    const f = P.fall;
    body.rotation.z = (P.fallSide || 1) * f * 1.35;
    body.rotation.x = f * 0.25;
    body.position.y = -f * 0.22 * s;
    body.position.x = (P.fallSide || 1) * f * -0.2 * s;
  }

  /* ---- hips / torso */
  const bob = g.amp * (run ? 0.045 : 0.03) * Math.abs(Math.cos(g.phase * Math.PI * 2));
  const crouch = P.crouch || 0;
  rig.hips.position.y = BODY.hipY - bob - crouch;
  rig.hips.rotation.set(0, Math.sin(g.phase * Math.PI * 2) * 0.08 * g.amp, 0);
  const breathe = Math.sin(g.idle * 1.8) * 0.012 * (1 - g.amp);
  const lean = (P.lean || 0) + g.amp * (run ? 0.18 : 0.06) * g.dirZ;
  rig.spine.rotation.set(lean + breathe, 0, -g.dirX * 0.06 * g.amp);
  rig.chest.rotation.set(-(P.hurt || 0) * 0.35, -(P.twist || 0) - Math.sin(g.phase * Math.PI * 2) * 0.1 * g.amp, 0);
  rig.neck.rotation.set(-lean * 0.6 + (P.hurt || 0) * 0.2, P.headYaw || 0, 0);
  if (rig.root.parent) rig.root.updateMatrixWorld(true);

  /* ---- legs */
  for (const side of ["R", "L"]) {
    const L = rig.legs[side];
    const off = side === "R" ? 0 : 0.5;
    const u = (g.phase + off) % 1;
    const A = (stride / s) / 4; // stance half-length (local units)
    let fz;
    let fy;
    if (u < 0.5) {
      fz = A * (1 - 4 * u);
      fy = 0;
    } else {
      const k = (u - 0.5) * 2;
      fz = -A + 2 * A * (k * k * (3 - 2 * k));
      fy = Math.sin(k * Math.PI) * (run ? 0.17 : 0.11);
    }
    const am = g.amp;
    const sideX = -L.sx * 0.12 * rig.bulk;
    // feet travel along the movement direction (strafing / backpedalling)
    const footX = sideX + g.dirX * fz * am;
    const footZ = 0.02 + g.dirZ * fz * am + (P.stanceZ || 0) * L.sx;
    const footY = 0.075 + fy * am;
    _v.set(footX, footY - (P.footDrop || 0), footZ);
    rig.body.localToWorld(_v);
    _pole.set(0, 0, 1).applyQuaternion(rig.root.quaternion).add(_w.set(0, 0.2, 0));
    solveTwoBone(L.thigh, L.shin, L.TH * s, L.SHN * s, _v, _pole, _reach);
    // foot flat with the body, toes lifting a little on the swing
    L.shin.getWorldQuaternion(_qa);
    rig.body.getWorldQuaternion(_qb);
    L.foot.quaternion.copy(_qa.invert().multiply(_qb));
    L.foot.rotateX(-fy * am * 1.2);
  }

  /* ---- arms */
  armTo(rig, "R", P.hR, P.dR, s);
  armTo(rig, "L", P.hL, P.nL, s);

  /* ---- held items */
  placeWeapon(rig, P, dt);
  placeShield(rig, P);
  if (rig.flask) {
    rig.flask.visible = !!P.flask;
    if (P.flask) {
      rig.arms.L.hand.getWorldPosition(_h);
      rig.root.worldToLocal(_h);
      rig.flask.position.copy(_h);
      rig.flask.rotation.set(-0.6, 0, 0.2);
    }
  }

  /* ---- cape sway */
  if (rig.cape) {
    const cp = rig.cape.geometry.attributes.position;
    const base = rig.cape.userData.base;
    const target = Math.min(1, g.speed / 5) * 0.9 + Math.max(0, lean) * 0.6;
    g.sway += (target - g.sway) * (1 - Math.exp(-4 * dt));
    for (let i = 0; i < cp.count; i++) {
      const y = base[i * 3 + 1];
      const k = Math.min(1, -y / 0.72); // 0 at the shoulders → 1 at the hem
      const flutter = Math.sin(time * 6 + base[i * 3] * 8 + k * 3) * 0.02 * k * (0.3 + g.sway);
      cp.setZ(i, base[i * 3 + 2] - k * k * g.sway * 0.4 + flutter);
      cp.setY(i, y + k * k * g.sway * 0.1);
    }
    cp.needsUpdate = true;
    rig.cape.geometry.computeVertexNormals();
  }
  /* ---- eyes */
  if (rig.eyes.length && P.eyes !== undefined) {
    const sc = 1 + P.eyes * 0.8;
    for (const e of rig.eyes) e.scale.setScalar(sc * (e.userData.s0 || (e.userData.s0 = e.scale.x)));
  }
}

function armTo(rig, side, h, d, s) {
  const A = rig.arms[side];
  if (!h) return;
  // targets live in the upright body frame (body carries the scale, roll and fall)
  rootLocal(_v, h[0], h[1], h[2]);
  rig.body.localToWorld(_v);
  // elbows point down and out (right elbow → right, i.e. −x)
  _pole.set(-A.sx * 0.7, -0.6, -0.35).applyQuaternion(rig.root.quaternion);
  solveTwoBone(A.upper, A.fore, BODY.upperArm * s, BODY.foreArm * s, _v, _pole, _reach);
  A.reached = A.reached || new THREE.Vector3();
  A.reached.copy(_reach);
  // the hand follows the weapon / shield direction
  if (d) {
    rootLocal(_n, d[0], d[1], d[2]).normalize().transformDirection(rig.body.matrixWorld);
    A.dirW = A.dirW || new THREE.Vector3();
    A.dirW.copy(_n);
  }
}

const _tmp = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

function placeWeapon(rig, P, dt) {
  const W = rig.weapon;
  if (!W) return;
  const A = rig.arms.R;
  if (!A.reached || !A.dirW) return;
  _h.copy(A.reached);
  rig.root.worldToLocal(_h);
  W.position.copy(_h);
  // blade direction (root-local)
  _by.copy(A.dirW).transformDirection(_mx.copy(rig.root.matrixWorld).invert());
  _by.normalize();
  // edge leads into the swing: blend toward the blade's angular velocity
  _tmp.subVectors(_by, rig.prevD);
  rig.prevD.copy(_by);
  let ex;
  if (_tmp.lengthSq() > 1e-5 && P.swinging) {
    ex = _tmp.normalize();
    rig.edge.lerp(ex, 1 - Math.exp(-30 * dt));
  } else {
    // at rest: edge forward-ish (flat to the side)
    _bz.crossVectors(_by, UP);
    if (_bz.lengthSq() < 1e-4) _bz.set(1, 0, 0);
    _bz.normalize();
    _bx.crossVectors(_bz, _by).normalize();
    rig.edge.lerp(_bx, 1 - Math.exp(-10 * dt));
  }
  // orthonormal basis: Y = blade, X = edge, Z = flat normal
  _bx.copy(rig.edge).addScaledVector(_by, -rig.edge.dot(_by));
  if (_bx.lengthSq() < 1e-6) _bx.set(1, 0, 0).addScaledVector(_by, -_by.x);
  _bx.normalize();
  _bz.crossVectors(_bx, _by).normalize();
  _mx.makeBasis(_bx, _by, _bz);
  W.quaternion.setFromRotationMatrix(_mx);
  W.scale.setScalar(rig.scale);
}

function placeShield(rig, P) {
  const S = rig.shield;
  if (!S) return;
  const A = rig.arms.L;
  if (!A.reached || !A.dirW) return;
  _h.copy(A.reached);
  rig.root.worldToLocal(_h);
  // the face looks along the shield normal; strapped to the forearm, so it sits a little out
  _bz.copy(A.dirW).transformDirection(_mx.copy(rig.root.matrixWorld).invert()).normalize();
  _bx.crossVectors(UP, _bz);
  if (_bx.lengthSq() < 1e-4) _bx.set(1, 0, 0);
  _bx.normalize();
  _by.crossVectors(_bz, _bx).normalize();
  _mx.makeBasis(_bx, _by, _bz);
  S.quaternion.setFromRotationMatrix(_mx);
  S.position.copy(_h).addScaledVector(_bz, 0.06 * rig.scale);
  S.scale.setScalar(rig.scale * (rig.style === "guardian" ? 1.15 : 1));
}

export function disposeHumanoid(rig) {
  if (!rig) return;
  if (rig.cape) rig.cape.geometry.dispose();
  rig.root.removeFromParent();
}
