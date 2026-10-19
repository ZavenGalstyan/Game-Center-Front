/**
 * Hulk: Open World 3D — enemy, civilian and boss models.
 *
 *  soldier / heavy / civilian  skinned "man" rig (rig.js) + rigid gear
 *                              (helmet, vest, rifle, launcher, gas mask)
 *  robot / heavyRobot          articulated rigid mechs (hip / knee / shoulder
 *                              / elbow pivots) with emissive visors
 *  apc                         8-wheel armoured vehicle, rotating turret
 *  turret                      sandbagged gun emplacement
 *  warMachine / colossus / titan   boss mechs with pose channels driven by
 *                              the sim (walk, aim, pods, hammer, kneel,
 *                              beam, shield, vents)
 * Materials and geometries are shared between instances.
 */
import * as THREE from "three";
import { buildRig, applyPose, zeroPose, POSE } from "./rig.js";

const MAT = new Map();
const GEO = new Map();
const mat = (key, make) => (MAT.has(key) ? MAT.get(key) : (MAT.set(key, make()), MAT.get(key)));
const geo = (key, make) => (GEO.has(key) ? GEO.get(key) : (GEO.set(key, make()), GEO.get(key)));
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, ...o });
const metal = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.65, ...o });
const glow = (color, k = 2) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
const BOX = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
const CYL = () => geo("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14));
const SPH = () => geo("sph", () => new THREE.SphereGeometry(0.5, 16, 12));
const CAP = () => geo("cap", () => new THREE.CapsuleGeometry(0.5, 1, 4, 10));

function part(g, m, parent, p = [0, 0, 0], s = [1, 1, 1], r = null, shadow = false) {
  const o = new THREE.Mesh(g, m);
  o.position.set(p[0], p[1], p[2]);
  o.scale.set(s[0], s[1], s[2]);
  if (r) o.rotation.set(r[0], r[1], r[2]);
  o.castShadow = shadow;
  parent.add(o);
  return o;
}
const grp = (parent, p = [0, 0, 0]) => {
  const g = new THREE.Group();
  g.position.set(p[0], p[1], p[2]);
  parent.add(g);
  return g;
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ================================================================ humans */
const SKIN = ["#c58c63", "#e0b38f", "#8d5a3c", "#f1c9a5", "#6b4430"];
const HAIR = ["#1d1611", "#3a2617", "#6b4a2b", "#b88a4a", "#121212"];
const SHIRT = ["#3b6fb6", "#b63b3b", "#e0c45a", "#2f8a5f", "#e8e8e8", "#7a3bb6", "#e07a2f", "#2b2b2b"];
const PANTS = ["#2c3e66", "#3a3a3a", "#6b5a43", "#1f2a38", "#8a8a7a"];

function humanMats(kind, look) {
  const r = (n) => (look >>> (n * 3)) % 997;
  if (kind === "soldier") {
    return {
      skin: mat(`skin${r(1) % 5}`, () => std(SKIN[r(1) % 5], { roughness: 0.6 })),
      top: mat("camoTop", () => std("#4d5a3a", { roughness: 0.9 })),
      bottom: mat("camoBot", () => std("#56603f", { roughness: 0.9 })),
      shoes: mat("boots", () => std("#1d1a16", { roughness: 0.7 })),
      hair: mat("hair0", () => std(HAIR[0])),
      plain: mat(`skin${r(1) % 5}`, () => std(SKIN[r(1) % 5], { roughness: 0.6 })),
      hands: mat("gloves", () => std("#26231f", { roughness: 0.8 })),
    };
  }
  if (kind === "heavy") {
    return {
      skin: mat("skin2", () => std(SKIN[2], { roughness: 0.6 })),
      top: mat("heavyTop", () => std("#2e3236", { roughness: 0.8 })),
      bottom: mat("heavyBot", () => std("#33373b", { roughness: 0.85 })),
      shoes: mat("boots", () => std("#1d1a16", { roughness: 0.7 })),
      hair: mat("hair0", () => std(HAIR[0])),
      plain: mat("skin2", () => std(SKIN[2], { roughness: 0.6 })),
      hands: mat("gloves", () => std("#26231f", { roughness: 0.8 })),
    };
  }
  return {
    skin: mat(`skin${r(1) % 5}`, () => std(SKIN[r(1) % 5], { roughness: 0.6 })),
    plain: mat(`skin${r(1) % 5}`, () => std(SKIN[r(1) % 5], { roughness: 0.6 })),
    top: mat(`shirt${r(2) % 8}`, () => std(SHIRT[r(2) % 8], { roughness: 0.85 })),
    bottom: mat(`pants${r(3) % 5}`, () => std(PANTS[r(3) % 5], { roughness: 0.85 })),
    shoes: mat("shoes", () => std("#2a2420", { roughness: 0.6 })),
    hair: mat(`hair${r(4) % 5}`, () => std(HAIR[r(4) % 5], { roughness: 0.8 })),
  };
}

function soldierGear(rig, kind) {
  const B = rig.bones;
  const olive = mat("olive", () => std("#4a5436", { roughness: 0.8 }));
  const dark = mat("gunmetal", () => metal("#2b2e31", { roughness: 0.5 }));
  const vestM = mat(kind === "heavy" ? "armorPlate" : "vest", () => std(kind === "heavy" ? "#3c4247" : "#5d6646", { roughness: 0.85, metalness: kind === "heavy" ? 0.3 : 0 }));
  // helmet
  const hel = part(geo("helmet", () => new THREE.SphereGeometry(0.135, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55)), kind === "heavy" ? vestM : olive, B.head, [0, 0.12, -0.005], [1.05, 1, 1.12]);
  hel.castShadow = false;
  if (kind === "heavy") {
    part(BOX(), mat("visor", () => glow("#ff5a2a", 1.2)), B.head, [0, 0.105, 0.105], [0.17, 0.04, 0.03]);
    part(geo("mask", () => new THREE.CylinderGeometry(0.05, 0.065, 0.08, 10)), dark, B.head, [0, 0.03, 0.1], [1, 1, 1], [Math.PI / 2, 0, 0]);
  } else {
    part(BOX(), mat("goggle", () => std("#14181c", { roughness: 0.2, metalness: 0.4 })), B.head, [0, 0.1, 0.1], [0.17, 0.035, 0.03]);
  }
  // vest / armour on the chest bone
  const vk = kind === "heavy" ? 1.25 : 1;
  part(BOX(), vestM, B.chest, [0, 0.1, 0.01], [0.38 * vk, 0.36, 0.27 * vk], null, true);
  part(BOX(), vestM, B.spine, [0, 0.06, 0.01], [0.33 * vk, 0.18, 0.24 * vk]);
  for (let i = -1; i <= 1; i++) part(BOX(), olive, B.chest, [i * 0.09, 0.02, 0.14 * vk], [0.07, 0.09, 0.04]);
  part(BOX(), olive, B.chest, [0, 0.08, -0.17 * vk], [0.26, 0.3, 0.12]); // backpack
  if (kind === "heavy") {
    for (const sx of [1, -1]) part(BOX(), vestM, B[sx > 0 ? "armL" : "armR"], [0, -0.04, 0], [0.14, 0.14, 0.15]);
    // rocket launcher on the right shoulder
    const tube = grp(B.chest, [-0.2, 0.32, 0.0]);
    part(CYL(), mat("launcher", () => std("#55603f", { roughness: 0.7 })), tube, [0, 0, 0.15], [0.13, 0.95, 0.13], [Math.PI / 2, 0, 0], true);
    part(CYL(), dark, tube, [0, 0, 0.64], [0.15, 0.05, 0.15], [Math.PI / 2, 0, 0]);
    part(BOX(), dark, tube, [0, -0.1, 0.25], [0.05, 0.12, 0.08]);
    rig.weapon = tube;
  } else {
    // rifle in the right hand
    const rifle = grp(B.handR, [0, -0.08, 0.02]);
    rifle.rotation.x = 2.1; // cancel the arm + elbow bend so the barrel points forward
    part(BOX(), dark, rifle, [0, 0, 0.2], [0.05, 0.08, 0.62], null, true);
    part(BOX(), dark, rifle, [0, -0.07, 0.12], [0.04, 0.12, 0.05]);
    part(BOX(), dark, rifle, [0, 0.06, 0.12], [0.03, 0.04, 0.18]);
    part(CYL(), dark, rifle, [0, 0.01, 0.58], [0.025, 0.2, 0.025], [Math.PI / 2, 0, 0]);
    part(BOX(), mat("stock", () => std("#3a3127", { roughness: 0.8 })), rifle, [0, -0.02, -0.12], [0.045, 0.1, 0.18]);
    rig.weapon = rifle;
    rig.muzzle = new THREE.Object3D();
    rig.muzzle.position.set(0, 0.01, 0.7);
    rifle.add(rig.muzzle);
  }
}

const GUN_HOLD = { rArX: -0.95, rArZ: 0.05, rArY: 0.2, rFoX: -1.35, lArX: -1.25, lArZ: -0.15, lArY: -0.45, lFoX: -0.95, lGrip: 0.8, rGrip: 0.9, rHaX: 0.2 };
const LAUNCH_HOLD = { rArX: -0.4, rArZ: 0.2, rFoX: -1.9, lArX: -0.9, lFoX: -1.4, lArZ: 0.1, rGrip: 0.9, lGrip: 0.9 };

function humanPose(p, kind, mode, t, ph, speed, e) {
  for (const k of POSE) p[k] = 0;
  const arms = kind === "soldier" ? GUN_HOLD : kind === "heavy" ? LAUNCH_HOLD : null;
  if (mode === "dead" || mode === "knocked") {
    const flip = mode === "dead" ? 1 : clamp(t * 2, 0, 1);
    Object.assign(p, { rootRX: -1.48 * flip, rootY: 0.12 * flip, lArZ: 1.1, rArZ: 0.9, lArX: -0.4, rFoX: -0.4, lThX: -0.2, rThX: 0.1, lShX: 0.3, rShX: 0.1, hdRX: 0.3 });
    if (mode === "knocked") Object.assign(p, { lArZ: 1.5, rArZ: 1.4, lThX: -0.8, rThX: -0.2, lShX: 1.0, spRX: -0.4 });
    return p;
  }
  if (mode === "cower") {
    Object.assign(p, { rootY: -0.42, spRX: 0.9, hdRX: 0.4, lThX: -1.6, rThX: -1.6, lShX: 2.4, rShX: 2.4, lArX: -1.9, rArX: -1.9, lFoX: -1.8, rFoX: -1.8, lArZ: 0.3, rArZ: 0.3, lFtX: -0.6, rFtX: -0.6 });
    return p;
  }
  if (mode === "cheer") {
    const b = Math.sin(t * 8);
    Object.assign(p, { lArX: -2.8, rArX: -2.8, lArZ: 0.3 + b * 0.1, rArZ: 0.3 - b * 0.1, lFoX: -0.3, rFoX: -0.3, rootY: Math.abs(b) * 0.06 });
    return p;
  }
  if (mode === "stagger") {
    Object.assign(p, { spRX: -0.35, chRX: -0.2, hdRX: -0.3, lArZ: 0.6, rArZ: 0.5, lArX: 0.3, rArX: 0.4, lThX: 0.25, rThX: -0.3, lShX: 0.4, rShX: 0.3 });
    return p;
  }
  if (speed > 0.3) {
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    const run = clamp((speed - 1.6) / 3.5, 0, 1);
    const amp = 0.45 + run * 0.4;
    p.lThX = s * amp;
    p.rThX = -s * amp;
    p.lShX = Math.max(0.05, -c * (0.5 + run * 0.6) + 0.3 + run * 0.4);
    p.rShX = Math.max(0.05, c * (0.5 + run * 0.6) + 0.3 + run * 0.4);
    p.rootY = Math.abs(c) * 0.03 - 0.02 - run * 0.02;
    p.spRX = 0.06 + run * 0.18;
    p.chRY = s * 0.12;
    if (!arms || mode === "flee") {
      p.lArX = -s * (0.4 + run * 0.6);
      p.rArX = s * (0.4 + run * 0.6);
      p.lFoX = -0.3 - run * 1.1;
      p.rFoX = -0.3 - run * 1.1;
      p.lArZ = 0.1;
      p.rArZ = 0.1;
    }
  } else {
    const b = Math.sin(t * 1.6) * 0.015;
    Object.assign(p, { spRX: 0.03 + b, lArZ: 0.08, rArZ: 0.08, lFoX: -0.15, rFoX: -0.15, hdRY: Math.sin(t * 0.3) * 0.2, lThX: -0.03, rThX: 0.03, lShX: 0.05, rShX: 0.05 });
  }
  if (arms && mode !== "flee") {
    Object.assign(p, arms);
    if (mode === "aim" || mode === "fire") {
      p.spRX = 0.08;
      if (kind === "soldier") p.chRY = -0.15;
    }
    if (e && e.recoil > 0) {
      p.rArX += e.recoil * 0.25;
      p.chRX = -e.recoil * 0.12;
    }
  }
  if (mode === "melee") Object.assign(p, { rArX: -1.6, rFoX: -0.4, chRY: -0.6, spRX: 0.25 });
  return p;
}

function legDrop(P, c) {
  const L = (thx, shx) => P.thigh * Math.cos(thx) + (P.shin + 0.04) * Math.cos(thx + shx);
  const rest = P.thigh + P.shin + 0.04;
  return Math.max(L(c.lThX, c.lShX), L(c.rThX, c.rShX)) - rest;
}

export function createHuman(kind, look = 1, { shadows = false } = {}) {
  const mats = humanMats(kind, look);
  const rig = buildRig({ build: "man", mats, outfit: kind, shadows, helmet: kind !== "civ", longSleeve: kind !== "civ" || look % 3 === 0 });
  if (kind !== "civ") soldierGear(rig, kind);
  const cur = zeroPose();
  const target = zeroPose();
  const S = { ph: Math.random() * 6, t: Math.random() * 10, knockT: 0 };
  const group = new THREE.Group();
  group.add(rig.root);
  const scale = kind === "heavy" ? 1.08 : 1;
  rig.root.scale.setScalar(scale);
  return {
    group,
    rig,
    kind,
    update(e, dt) {
      S.t += dt;
      const sp = Math.hypot(e.vx || 0, e.vz || 0);
      S.ph += (sp / 1.6) * Math.PI * dt;
      const mode = e.anim.mode;
      if (mode === "knocked") S.knockT += dt;
      else S.knockT = 0;
      if (e.recoil) e.recoil = Math.max(0, e.recoil - dt * 6);
      humanPose(target, kind, mode, mode === "knocked" ? S.knockT : S.t, S.ph, sp, e);
      const rate = mode === "dead" || mode === "knocked" ? 8 : 12;
      const k = 1 - Math.exp(-rate * dt);
      for (const key of POSE) cur[key] += ((target[key] || 0) - cur[key]) * k;
      const out = cur;
      const drop = mode === "dead" || mode === "knocked" || mode === "cower" ? 0 : legDrop(rig.P, cur);
      const ry = out.rootY;
      out.rootY = ry + drop;
      if (mode !== "dead" && mode !== "knocked") {
        out.lFtX = -(out.lThX + out.lShX);
        out.rFtX = -(out.rThX + out.rShX);
      }
      applyPose(rig, out);
      out.rootY = ry;
    },
    dispose() {
      rig.geos.forEach((g) => g.dispose());
    },
  };
}

/* ================================================================ robots */
export function createRobot(heavy = false, { shadows = false } = {}) {
  const k = heavy ? 1.9 : 1;
  const body = mat(heavy ? "hrBody" : "rBody", () => metal(heavy ? "#5b5f66" : "#8b9199", { roughness: 0.45 }));
  const trim = mat(heavy ? "hrTrim" : "rTrim", () => metal(heavy ? "#c98a1f" : "#2d5d8a", { roughness: 0.5 }));
  const dark = mat("rDark", () => metal("#25282d", { roughness: 0.55 }));
  const eye = mat(heavy ? "hrEye" : "rEye", () => glow(heavy ? "#ff3b1f" : "#ff2a2a", 2.4));
  const root = new THREE.Group();
  const pelvis = grp(root, [0, 1.05 * k, 0]);
  part(BOX(), dark, pelvis, [0, 0, 0], [0.5 * k, 0.22 * k, 0.32 * k], null, shadows);
  const torso = grp(pelvis, [0, 0.12 * k, 0]);
  part(BOX(), body, torso, [0, 0.42 * k, 0], [(heavy ? 1.15 : 0.72) * k, 0.62 * k, (heavy ? 0.75 : 0.45) * k], null, shadows);
  part(BOX(), trim, torso, [0, 0.46 * k, (heavy ? 0.39 : 0.24) * k], [0.36 * k, 0.32 * k, 0.04 * k]);
  part(BOX(), body, torso, [0, 0.14 * k, 0], [0.5 * k, 0.2 * k, 0.36 * k]);
  const coreM = mat(heavy ? "hrCore" : "rCore", () => glow(heavy ? "#ffb02e" : "#4fd2ff", 1.6));
  part(SPH(), coreM, torso, [0, 0.46 * k, (heavy ? 0.41 : 0.26) * k], [0.14 * k, 0.14 * k, 0.06 * k]);
  const head = grp(torso, [0, 0.82 * k, heavy ? 0.12 * k : 0]);
  part(BOX(), body, head, [0, 0.12 * k, 0], [(heavy ? 0.38 : 0.32) * k, 0.24 * k, 0.3 * k], null, shadows);
  part(BOX(), eye, head, [0, 0.14 * k, 0.155 * k], [0.24 * k, 0.05 * k, 0.02 * k]);
  part(CYL(), dark, head, [0.1 * k, 0.32 * k, -0.05 * k], [0.02 * k, 0.18 * k, 0.02 * k]);
  const arms = [];
  for (const sx of [1, -1]) {
    const sh = grp(torso, [sx * (heavy ? 0.72 : 0.47) * k, 0.62 * k, 0]);
    part(SPH(), trim, sh, [0, 0, 0], [(heavy ? 0.42 : 0.26) * k, (heavy ? 0.42 : 0.26) * k, (heavy ? 0.42 : 0.26) * k], null, shadows);
    part(BOX(), body, sh, [0, -0.25 * k, 0], [(heavy ? 0.3 : 0.16) * k, 0.42 * k, (heavy ? 0.3 : 0.16) * k], null, shadows);
    const el = grp(sh, [0, -0.48 * k, 0]);
    part(SPH(), dark, el, [0, 0, 0], [0.16 * k, 0.16 * k, 0.16 * k]);
    if (!heavy && sx < 0) {
      // blaster arm
      part(CYL(), dark, el, [0, -0.25 * k, 0.05 * k], [0.15 * k, 0.5 * k, 0.15 * k], null, shadows);
      part(CYL(), eye, el, [0, -0.52 * k, 0.05 * k], [0.09 * k, 0.04 * k, 0.09 * k]);
    } else {
      part(BOX(), body, el, [0, -0.24 * k, 0], [(heavy ? 0.34 : 0.15) * k, 0.42 * k, (heavy ? 0.34 : 0.15) * k], null, shadows);
      part(BOX(), dark, el, [0, -0.52 * k, 0], [(heavy ? 0.46 : 0.18) * k, (heavy ? 0.3 : 0.16) * k, (heavy ? 0.42 : 0.18) * k], null, shadows);
    }
    arms.push({ sh, el, sx });
  }
  if (heavy) {
    // shoulder cannon
    const can = grp(torso, [0.38 * k, 1.0 * k, -0.1 * k]);
    part(BOX(), dark, can, [0, 0, 0], [0.3 * k, 0.26 * k, 0.5 * k]);
    for (const dx of [-0.07, 0.07]) part(CYL(), dark, can, [dx * k, 0, 0.35 * k], [0.06 * k, 0.4 * k, 0.06 * k], [Math.PI / 2, 0, 0]);
    part(BOX(), dark, torso, [0, 0.5 * k, -0.45 * k], [0.7 * k, 0.5 * k, 0.2 * k]);
  }
  const legs = [];
  for (const sx of [1, -1]) {
    const hip = grp(pelvis, [sx * 0.2 * k, -0.08 * k, 0]);
    part(BOX(), body, hip, [0, -0.25 * k, 0], [0.2 * k, 0.48 * k, 0.24 * k], null, shadows);
    const kn = grp(hip, [0, -0.5 * k, 0]);
    part(SPH(), dark, kn, [0, 0, 0.04 * k], [0.18 * k, 0.18 * k, 0.18 * k]);
    part(BOX(), body, kn, [0, -0.24 * k, -0.02 * k], [0.18 * k, 0.46 * k, 0.2 * k], null, shadows);
    part(BOX(), dark, kn, [0, -0.47 * k, 0.07 * k], [0.24 * k, 0.1 * k, 0.4 * k], null, shadows);
    legs.push({ hip, kn, sx });
  }
  const S = { ph: Math.random() * 6, t: 0, swing: 0 };
  return {
    group: root,
    kind: heavy ? "heavyRobot" : "robot",
    coreM,
    update(e, dt) {
      S.t += dt;
      const sp = Math.hypot(e.vx || 0, e.vz || 0);
      S.ph += (sp / (heavy ? 2.6 : 1.7)) * Math.PI * dt;
      const mode = e.anim.mode;
      const s = Math.sin(S.ph);
      const walk = Math.min(1, sp / 2);
      for (const L of legs) {
        L.hip.rotation.x = s * 0.5 * walk * L.sx;
        L.kn.rotation.x = Math.max(0, -Math.cos(S.ph) * L.sx) * 0.7 * walk;
      }
      pelvis.position.y = 1.05 * k - Math.abs(Math.cos(S.ph)) * 0.05 * k * walk;
      torso.rotation.y = s * 0.08 * walk;
      // arms: aim the blaster / wind up a melee swing
      const aiming = mode === "aim" || mode === "fire";
      const melee = mode === "melee";
      S.swing = melee ? Math.min(1, S.swing + dt * 3) : Math.max(0, S.swing - dt * 4);
      for (const A of arms) {
        const gunArm = !heavy && A.sx < 0;
        let x = -s * 0.4 * walk * A.sx;
        let el = -0.3;
        if (aiming && (gunArm || heavy)) {
          x = -1.45;
          el = -0.1;
        }
        if (melee && (A.sx > 0 || heavy)) {
          x = -2.4 * S.swing + (S.swing > 0.95 ? 1.8 : 0);
          el = -0.5;
        }
        A.sh.rotation.x += (x - A.sh.rotation.x) * Math.min(1, dt * 10);
        A.el.rotation.x += (el - A.el.rotation.x) * Math.min(1, dt * 10);
        A.sh.rotation.z = A.sx * (heavy ? 0.18 : 0.08);
      }
      if (mode === "dead" || mode === "knocked") {
        root.rotation.x = Math.max(root.rotation.x - dt * 3, -1.45);
      } else if (mode === "stagger") root.rotation.x = Math.sin(S.t * 30) * 0.05 - 0.15;
      else root.rotation.x *= 0.85;
      coreM.emissiveIntensity = 1.4 + Math.sin(S.t * 5) * 0.4;
    },
    dispose() {},
  };
}

/* ================================================================ APC + turret */
export function createAPC({ shadows = false, military = true } = {}) {
  const hull = mat("apcHull", () => std("#4f5a3b", { roughness: 0.7, metalness: 0.25 }));
  const dark = mat("rDark", () => metal("#25282d", { roughness: 0.55 }));
  const tire = mat("tire", () => std("#151515", { roughness: 0.9 }));
  const root = new THREE.Group();
  const body = grp(root, [0, 0, 0]);
  part(BOX(), hull, body, [0, 1.3, 0], [3.0, 1.2, 6.2], null, shadows);
  part(BOX(), hull, body, [0, 1.15, 3.35], [2.9, 0.8, 0.8], [0.6, 0, 0], shadows); // sloped nose
  part(BOX(), hull, body, [0, 2.0, -0.4], [2.6, 0.35, 4.4]);
  part(BOX(), mat("apcWin", () => std("#1d2a33", { roughness: 0.2, metalness: 0.5 })), body, [0, 1.75, 3.0], [1.8, 0.25, 0.1], [0.5, 0, 0]);
  for (const sx of [-1, 1]) part(BOX(), dark, body, [sx * 1.55, 1.4, 0], [0.1, 0.25, 5.6]);
  const wheels = [];
  for (const z of [-2.3, -0.8, 0.8, 2.3]) {
    for (const sx of [-1, 1]) {
      const w = part(geo("wheel", () => new THREE.CylinderGeometry(0.62, 0.62, 0.5, 16).rotateZ(Math.PI / 2)), tire, body, [sx * 1.45, 0.62, z], [1, 1, 1], null, shadows);
      wheels.push(w);
    }
  }
  const turret = grp(body, [0, 2.2, -0.3]);
  part(CYL(), hull, turret, [0, 0.3, 0], [1.6, 0.6, 1.6], null, shadows);
  part(BOX(), hull, turret, [0, 0.35, 0.5], [1.1, 0.45, 1.0]);
  const gun = grp(turret, [0, 0.4, 0.9]);
  part(CYL(), dark, gun, [0, 0, 1.2], [0.2, 2.4, 0.2], [Math.PI / 2, 0, 0], shadows);
  part(CYL(), dark, gun, [0, 0, 2.4], [0.28, 0.3, 0.28], [Math.PI / 2, 0, 0]);
  const S = { roll: 0 };
  void military;
  return {
    group: root,
    kind: "apc",
    update(e, dt) {
      const sp = Math.hypot(e.vx || 0, e.vz || 0);
      S.roll += sp * dt / 0.62;
      for (const w of wheels) w.rotation.x = S.roll;
      // turret tracks the aim point (local yaw)
      if (e.aimAt) {
        const want = Math.atan2(e.aimAt.x - e.x, e.aimAt.z - e.z) - e.heading;
        turret.rotation.y += Math.atan2(Math.sin(want - turret.rotation.y), Math.cos(want - turret.rotation.y)) * Math.min(1, dt * 3);
      }
      gun.rotation.x = e.recoil ? -e.recoil * 0.2 : 0;
      if (e.recoil) e.recoil = Math.max(0, e.recoil - dt * 4);
      body.rotation.z = e.anim.mode === "dead" ? 0.12 : 0;
      body.position.y = e.anim.mode === "dead" ? -0.3 : Math.sin(S.roll * 3) * 0.02;
    },
    dispose() {},
  };
}
export function createTurret({ shadows = false } = {}) {
  const sand = mat("sandbag", () => std("#9b8a62", { roughness: 0.95 }));
  const dark = mat("rDark", () => metal("#25282d", { roughness: 0.55 }));
  const plate = mat("tPlate", () => metal("#4f5a3b", { roughness: 0.6 }));
  const root = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    part(CAP(), sand, root, [Math.sin(a) * 1.2, 0.3, Math.cos(a) * 1.2], [0.5, 0.35, 0.5], [0, a, Math.PI / 2], shadows);
  }
  const head = grp(root, [0, 0.9, 0]);
  part(CYL(), dark, head, [0, 0, 0], [0.3, 0.6, 0.3]);
  const gun = grp(head, [0, 0.55, 0]);
  part(BOX(), dark, gun, [0, 0, 0.2], [0.35, 0.3, 0.8], null, shadows);
  part(CYL(), dark, gun, [0, 0.03, 0.95], [0.08, 0.9, 0.08], [Math.PI / 2, 0, 0]);
  part(BOX(), plate, gun, [0, 0.15, 0.4], [1.1, 0.7, 0.06], null, shadows);
  return {
    group: root,
    kind: "turret",
    update(e, dt) {
      if (e.aimAt) {
        const want = Math.atan2(e.aimAt.x - e.x, e.aimAt.z - e.z) - e.heading;
        head.rotation.y += Math.atan2(Math.sin(want - head.rotation.y), Math.cos(want - head.rotation.y)) * Math.min(1, dt * 5);
      }
      if (e.anim.mode === "dead") gun.rotation.x = Math.min(0.6, gun.rotation.x + dt);
    },
    dispose() {},
  };
}

/* ================================================================ bosses */
export function createBoss(kind, { shadows = true } = {}) {
  if (kind === "warMachine") return warMachineModel(shadows);
  if (kind === "colossus") return colossusModel(shadows);
  return titanModel(shadows);
}

/** shared biped boss skeleton: pelvis, torso, two legs (hip/knee), returns pivots */
function bipedLegs(root, M, k, h, shadows, digitigrade = false) {
  const pelvis = grp(root, [0, h, 0]);
  const legs = [];
  for (const sx of [1, -1]) {
    const hip = grp(pelvis, [sx * 0.85 * k, -0.1 * k, 0]);
    part(SPH(), M.joint, hip, [0, 0, 0], [0.7 * k, 0.7 * k, 0.7 * k], null, shadows);
    part(BOX(), M.body, hip, [0, -0.85 * k, digitigrade ? 0.25 * k : 0], [0.65 * k, 1.6 * k, 0.75 * k], digitigrade ? [-0.35, 0, 0] : null, shadows);
    const kn = grp(hip, [0, -1.65 * k, digitigrade ? 0.5 * k : 0]);
    part(SPH(), M.joint, kn, [0, 0, 0], [0.55 * k, 0.55 * k, 0.55 * k]);
    part(BOX(), M.body, kn, [0, -0.85 * k, digitigrade ? -0.25 * k : 0], [0.55 * k, 1.7 * k, 0.6 * k], digitigrade ? [0.35, 0, 0] : null, shadows);
    part(BOX(), M.dark, kn, [0, -h / 1 + 1.65 * k + 0.2 * k, 0.3 * k], [1.0 * k, 0.4 * k, 1.6 * k], null, shadows);
    legs.push({ hip, kn, sx });
  }
  return { pelvis, legs };
}
function walkLegs(legs, ph, walk, kneel) {
  const s = Math.sin(ph);
  for (const L of legs) {
    L.hip.rotation.x = s * 0.35 * walk * L.sx - kneel * 0.7;
    L.kn.rotation.x = Math.max(0, -Math.cos(ph) * L.sx) * 0.5 * walk + kneel * 1.3;
  }
}

function warMachineModel(shadows) {
  const M = {
    body: mat("wmBody", () => metal("#5d6670", { roughness: 0.4 })),
    dark: mat("wmDark", () => metal("#22262b", { roughness: 0.5 })),
    joint: mat("wmJoint", () => metal("#33383e", { roughness: 0.45 })),
    trim: mat("wmTrim", () => std("#b02a1e", { roughness: 0.5, metalness: 0.3 })),
  };
  const vent = std("#ff6a1a", { emissive: "#ff4a10", emissiveIntensity: 0, roughness: 0.5 });
  const eye = mat("wmEye", () => glow("#ff2a12", 2.5));
  const k = 1;
  const root = new THREE.Group();
  const { pelvis, legs } = bipedLegs(root, M, k, 3.4, shadows, true);
  const torso = grp(pelvis, [0, 0.4, 0]);
  part(BOX(), M.body, torso, [0, 1.3, 0], [3.4, 2.2, 2.4], null, shadows);
  part(BOX(), M.trim, torso, [0, 1.5, 1.22], [1.6, 0.9, 0.08]);
  part(BOX(), M.dark, torso, [0, 2.55, 0.3], [1.4, 0.6, 1.4], null, shadows); // cockpit hood
  part(BOX(), eye, torso, [0, 2.55, 1.02], [1.1, 0.16, 0.05]);
  part(SPH(), mat("wmCore", () => glow("#ffd24a", 1.2)), torso, [0, 1.25, 1.24], [0.6, 0.6, 0.2]);
  // back vents (glow when overheating)
  for (let i = -1; i <= 1; i++) part(BOX(), vent, torso, [i * 0.8, 1.6, -1.22], [0.5, 1.2, 0.08]);
  // missile pods on the shoulders (lids open)
  const pods = [];
  for (const sx of [1, -1]) {
    const pod = grp(torso, [sx * 1.25, 2.55, -0.3]);
    part(BOX(), M.body, pod, [0, 0, 0], [1.0, 0.8, 1.4], null, shadows);
    for (let i = 0; i < 6; i++) part(CYL(), M.dark, pod, [((i % 3) - 1) * 0.28, 0.42, ((i / 3) | 0) * 0.4 - 0.2], [0.18, 0.06, 0.18]);
    const lid = grp(pod, [0, 0.42, -0.7]);
    part(BOX(), M.trim, lid, [0, 0, 0.7], [1.02, 0.08, 1.42]);
    pods.push(lid);
  }
  // arms: chaingun right, armored fist left
  const arms = [];
  for (const sx of [1, -1]) {
    const sh = grp(torso, [sx * 2.0, 1.85, 0]);
    part(SPH(), M.joint, sh, [0, 0, 0], [0.9, 0.9, 0.9], null, shadows);
    part(BOX(), M.body, sh, [0, -0.8, 0], [0.7, 1.4, 0.7], null, shadows);
    const el = grp(sh, [0, -1.5, 0]);
    if (sx < 0) {
      const barrels = grp(el, [0, -0.3, 0.6]);
      part(CYL(), M.dark, el, [0, -0.3, 0], [0.75, 1.0, 0.75], [Math.PI / 2, 0, 0], shadows);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        part(CYL(), M.dark, barrels, [Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0.9], [0.1, 1.8, 0.1], [Math.PI / 2, 0, 0]);
      }
      arms.push({ sh, el, sx, barrels });
    } else {
      part(BOX(), M.body, el, [0, -0.6, 0], [0.8, 1.2, 0.8], null, shadows);
      part(BOX(), M.dark, el, [0, -1.35, 0.05], [1.1, 0.7, 1.0], null, shadows);
      arms.push({ sh, el, sx });
    }
  }
  const S = { ph: 0, t: 0, spin: 0 };
  return {
    group: root,
    kind: "warMachine",
    update(b, dt, time) {
      S.t += dt;
      const A = b.anim;
      const sp = Math.hypot(b.vx || 0, b.vz || 0);
      S.ph += (sp / 4.5) * Math.PI * dt * (b.state === "charge" ? 1.6 : 1);
      walkLegs(legs, S.ph, Math.min(1, sp / 3), A.kneel);
      pelvis.position.y = 3.4 - A.kneel * 1.2 - Math.abs(Math.cos(S.ph)) * 0.12 * Math.min(1, sp / 3);
      torso.rotation.x = (b.state === "charge" || b.state === "chargeTele" ? 0.35 : 0) + A.kneel * 0.25;
      for (const L of pods) L.rotation.x = -A.pods * 1.4;
      const gunArm = arms.find((a) => a.barrels);
      const fist = arms.find((a) => !a.barrels);
      const aim = A.mode === "aim" || A.mode === "fire" ? 1 : 0;
      gunArm.sh.rotation.x += (-1.45 * aim - gunArm.sh.rotation.x) * Math.min(1, dt * 6);
      gunArm.el.rotation.x = 0;
      S.spin += (A.mode === "fire" ? 30 : 2) * dt;
      gunArm.barrels.rotation.z = S.spin;
      const stomp = A.mode === "stompTele" ? 1 : 0;
      fist.sh.rotation.x += ((stomp ? -2.2 : -Math.sin(S.ph) * 0.3) - fist.sh.rotation.x) * Math.min(1, dt * 6);
      if (stomp) legs[0].hip.rotation.x = -0.9;
      vent.emissiveIntensity = b.vuln > 0 || b.stun > 0 ? 2.5 + Math.sin(time * 14) : 0.1;
      root.rotation.z = A.mode === "stunned" ? Math.sin(S.t * 20) * 0.03 : 0;
      if (b.dead) {
        root.rotation.x = Math.min(1.35, (b.deadT - 2.4) * 1.2 > 0 ? (b.deadT - 2.4) * 1.2 : 0);
        torso.rotation.z = Math.sin(S.t * 25) * 0.03 * (b.deadT < 3 ? 1 : 0);
      }
    },
    dispose() {
      vent.dispose();
    },
  };
}

function colossusModel(shadows) {
  const M = {
    body: mat("coBody", () => metal("#6e5a44", { roughness: 0.55, metalness: 0.5 })),
    dark: mat("coDark", () => metal("#2b2622", { roughness: 0.6 })),
    joint: mat("coJoint", () => metal("#3d3631", { roughness: 0.55 })),
    rust: mat("coRust", () => std("#8a4a22", { roughness: 0.85, metalness: 0.2 })),
  };
  const furnace = std("#ff7a1a", { emissive: "#ff5a0a", emissiveIntensity: 1.2, roughness: 0.5 });
  const k = 1.75;
  const root = new THREE.Group();
  const { pelvis, legs } = bipedLegs(root, M, k, 5.6, shadows, false);
  const torso = grp(pelvis, [0, 0.6, 0]);
  part(CYL(), M.body, torso, [0, 2.6, 0], [5.4, 4.6, 4.2], null, shadows); // boiler barrel
  part(BOX(), M.rust, torso, [0, 2.6, 0], [5.6, 0.5, 4.3]);
  part(BOX(), M.rust, torso, [0, 4.4, 0], [5.0, 0.4, 4.0]);
  const core = part(SPH(), furnace, torso, [0, 2.4, 2.0], [1.8, 1.8, 0.9]); // furnace chest core (weak point)
  part(BOX(), M.dark, torso, [0, 2.4, 2.15], [2.4, 0.14, 0.2]);
  for (const sx of [-1, 1]) part(CYL(), M.dark, torso, [sx * 1.3, 5.6, -1.4], [0.7, 2.6, 0.7], null, shadows); // smokestacks
  const head = grp(torso, [0, 5.1, 1.0]);
  part(BOX(), M.body, head, [0, 0.4, 0], [1.6, 1.0, 1.4], null, shadows);
  part(BOX(), mat("coEye", () => glow("#ffcc33", 2.5)), head, [0, 0.45, 0.72], [1.1, 0.18, 0.05]);
  // right arm: giant hammer; left arm: magnet claw
  const arms = [];
  for (const sx of [1, -1]) {
    const sh = grp(torso, [sx * 3.3, 4.0, 0]);
    part(SPH(), M.joint, sh, [0, 0, 0], [1.8, 1.8, 1.8], null, shadows);
    part(BOX(), M.body, sh, [0, -1.6, 0], [1.3, 2.8, 1.3], null, shadows);
    const el = grp(sh, [0, -3.0, 0]);
    part(SPH(), M.joint, el, [0, 0, 0], [1.2, 1.2, 1.2]);
    part(BOX(), M.body, el, [0, -1.3, 0], [1.2, 2.4, 1.2], null, shadows);
    if (sx < 0) {
      const ham = grp(el, [0, -2.8, 0]);
      part(BOX(), M.dark, ham, [0, -0.2, 0], [3.2, 1.8, 1.8], null, shadows);
      part(BOX(), M.rust, ham, [0, -0.2, 0], [3.3, 0.4, 1.9]);
      arms.push({ sh, el, sx, ham });
    } else {
      const claw = grp(el, [0, -2.7, 0]);
      part(CYL(), M.dark, claw, [0, 0, 0], [1.9, 0.5, 1.9], null, shadows);
      const coil = part(CYL(), mat("coCoil", () => glow("#6ec8ff", 0.4)), claw, [0, -0.35, 0], [1.6, 0.2, 1.6]);
      arms.push({ sh, el, sx, coil });
    }
  }
  const S = { ph: 0, t: 0 };
  return {
    group: root,
    kind: "colossus",
    update(b, dt, time) {
      S.t += dt;
      const A = b.anim;
      const sp = Math.hypot(b.vx || 0, b.vz || 0);
      S.ph += (sp / 4.5) * Math.PI * dt;
      walkLegs(legs, S.ph, Math.min(1, sp / 2.5), A.kneel);
      pelvis.position.y = 5.6 - A.kneel * 2.2 - Math.abs(Math.cos(S.ph)) * 0.2 * Math.min(1, sp / 2.5);
      torso.rotation.x = A.kneel * 0.35 + (A.mode === "slamTele" ? -0.15 * A.hammer : 0) + (A.mode === "vuln" ? 0.35 : 0);
      const hamArm = arms.find((a) => a.ham);
      const claw = arms.find((a) => a.coil);
      let hx = -Math.sin(S.ph) * 0.25;
      if (A.mode === "slamTele" || A.mode === "hurlTele") hx = -3.0 * A.hammer;
      if (A.mode === "vuln") hx = -1.25;
      if (A.mode === "hurl") hx = -1.6;
      hamArm.sh.rotation.x += (hx - hamArm.sh.rotation.x) * Math.min(1, dt * (A.mode === "vuln" ? 18 : 5));
      let cx = Math.sin(S.ph) * 0.25;
      if (A.mode === "magnet") cx = -1.5;
      if (A.mode === "sweep") cx = -1.2 + Math.min(1, b.stT * 2) * 0.2;
      claw.sh.rotation.x += (cx - claw.sh.rotation.x) * Math.min(1, dt * 6);
      claw.sh.rotation.z = A.mode === "sweep" ? -1.2 + b.stT * 3 : 0;
      claw.coil.material.emissiveIntensity = A.mode === "magnet" ? 2.5 + Math.sin(time * 20) : 0.4;
      furnace.emissiveIntensity = (A.mode === "flame" || A.mode === "flameTele" ? 3 : 1.2) + (b.vuln > 0 ? 2.5 + Math.sin(time * 12) * 1.2 : 0);
      core.scale.setScalar(1);
      core.scale.set(1.8, 1.8, 0.9 + (b.vuln > 0 ? 0.3 : 0));
      if (b.dead) root.rotation.x = Math.max(0, Math.min(1.35, (b.deadT - 2.4) * 1.1));
    },
    dispose() {
      furnace.dispose();
    },
  };
}

function titanModel(shadows) {
  const M = {
    body: mat("tiBody", () => metal("#2b3240", { roughness: 0.35, metalness: 0.75 })),
    dark: mat("tiDark", () => metal("#14171d", { roughness: 0.4 })),
    joint: mat("tiJoint", () => metal("#1e232c", { roughness: 0.4 })),
  };
  const line = mat("tiLine", () => glow("#3ff2ff", 2.2));
  const coreM = std("#7af7ff", { emissive: "#3ff2ff", emissiveIntensity: 1.5, roughness: 0.3 });
  const k = 1.9;
  const root = new THREE.Group();
  const { pelvis, legs } = bipedLegs(root, M, k, 6.4, shadows, true);
  const torso = grp(pelvis, [0, 0.8, 0]);
  part(BOX(), M.body, torso, [0, 2.6, 0], [5.6, 3.8, 3.4], null, shadows);
  part(BOX(), M.body, torso, [0, 4.9, -0.2], [6.6, 1.3, 3.0], null, shadows); // shoulder yoke
  for (const sx of [-1, 1]) part(BOX(), line, torso, [sx * 2.0, 2.6, 1.72], [0.12, 3.0, 0.04]);
  part(BOX(), line, torso, [0, 4.3, 1.55], [3.6, 0.1, 0.04]);
  const core = part(SPH(), coreM, torso, [0, 2.6, 1.75], [1.5, 1.5, 0.6]);
  const head = grp(torso, [0, 6.0, 0.6]);
  part(BOX(), M.body, head, [0, 0.4, 0], [1.6, 1.0, 1.5], null, shadows);
  const eye = part(SPH(), mat("tiEye", () => glow("#ff2a5a", 3)), head, [0, 0.45, 0.78], [0.5, 0.3, 0.2]);
  // shoulder cannons
  const cannons = [];
  for (const sx of [1, -1]) {
    const c = grp(torso, [sx * 2.6, 6.0, -0.6]);
    part(BOX(), M.dark, c, [0, 0, 0], [1.1, 0.9, 2.0], null, shadows);
    part(CYL(), M.dark, c, [0, 0, 1.6], [0.4, 1.4, 0.4], [Math.PI / 2, 0, 0]);
    part(CYL(), line, c, [0, 0, 2.32], [0.3, 0.06, 0.3], [Math.PI / 2, 0, 0]);
    cannons.push(c);
  }
  const arms = [];
  for (const sx of [1, -1]) {
    const sh = grp(torso, [sx * 3.6, 4.3, 0]);
    part(SPH(), M.joint, sh, [0, 0, 0], [1.7, 1.7, 1.7], null, shadows);
    part(BOX(), M.body, sh, [0, -1.6, 0], [1.2, 2.8, 1.2], null, shadows);
    part(BOX(), line, sh, [0, -1.6, 0.62], [0.08, 2.2, 0.04]);
    const el = grp(sh, [0, -3.1, 0]);
    part(BOX(), M.body, el, [0, -1.3, 0], [1.1, 2.4, 1.1], null, shadows);
    part(BOX(), M.dark, el, [0, -2.8, 0], [1.6, 1.0, 1.4], null, shadows);
    arms.push({ sh, el, sx });
  }
  // energy shield dome
  const shieldM = new THREE.MeshStandardMaterial({ color: "#59e8ff", emissive: "#2bd0ff", emissiveIntensity: 0.8, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const shield = new THREE.Mesh(geo("shield", () => new THREE.SphereGeometry(1, 28, 18)), shieldM);
  shield.scale.setScalar(11);
  shield.position.y = 7;
  root.add(shield);
  const S = { ph: 0, t: 0 };
  return {
    group: root,
    kind: "titan",
    update(b, dt, time) {
      S.t += dt;
      const A = b.anim;
      const sp = Math.hypot(b.vx || 0, b.vz || 0);
      S.ph += (sp / 5) * Math.PI * dt;
      walkLegs(legs, S.ph, Math.min(1, sp / 2.5), A.kneel);
      pelvis.position.y = 6.4 - A.kneel * 2.4 - Math.abs(Math.cos(S.ph)) * 0.2 * Math.min(1, sp / 2.5);
      torso.rotation.x = A.kneel * 0.3;
      const beam = A.mode === "beam" || A.mode === "beamTele";
      head.rotation.x = beam ? 0.35 : 0;
      for (const A2 of arms) {
        let x = -Math.sin(S.ph) * 0.25 * A2.sx;
        if (A.mode === "strike") x = -2.6;
        if (A.mode === "drones") x = -1.2;
        if (A.mode === "stompTele") x = -1.8;
        A2.sh.rotation.x += (x - A2.sh.rotation.x) * Math.min(1, dt * 5);
      }
      for (const c of cannons) c.rotation.x = A.mode === "strike" ? -0.9 : 0;
      eye.scale.set(0.5 + A.beam * 0.4, 0.3 + A.beam * 0.3, 0.2);
      coreM.emissiveIntensity = 1.5 + (b.vuln > 0 ? 3 + Math.sin(time * 14) * 1.5 : 0);
      core.scale.set(1.5, 1.5, 0.6 + (b.vuln > 0 ? 0.3 : 0));
      shield.visible = !!b.shield;
      shieldM.opacity = 0.16 + Math.sin(time * 3) * 0.05 + (b.flash > 0 ? 0.25 : 0);
      if (b.dead) root.rotation.x = Math.max(0, Math.min(1.35, (b.deadT - 2.4) * 1.1));
    },
    dispose() {
      coreM.dispose();
      shieldM.dispose();
    },
  };
}

/** muzzle point for a human (rifle) in world space, or null */
export function disposeActorCache() {
  for (const m of MAT.values()) m.dispose();
  MAT.clear();
  for (const g of GEO.values()) g.dispose();
  GEO.clear();
}
