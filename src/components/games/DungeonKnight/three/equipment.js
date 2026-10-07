/**
 * Dungeon Knight — held objects: swords (from item looks), shields (round /
 * kite / tower), the potion flask and the enemies' weapons.
 *
 * Conventions: a weapon group's origin is the grip (where the hand closes),
 * the blade/shaft runs along local +Y; the blade's flat faces ±Z (so the
 * renderer can turn the edge into the swing). A shield group's origin is its
 * centre, the face looks along +Z, "up" is +Y.
 */
import * as THREE from "three";
import { mat, steel, glow, lathe, ellipsoid, addMesh, group, geo } from "./materials.js";
import { woodTexture } from "./textures.js";

function bladeGeometry(len, width, tipLen = 0.18) {
  const w = 0.05 * width;
  const s = new THREE.Shape();
  s.moveTo(-w, 0);
  s.lineTo(-w * 0.86, len - tipLen);
  s.quadraticCurveTo(-w * 0.6, len - tipLen * 0.4, 0, len);
  s.quadraticCurveTo(w * 0.6, len - tipLen * 0.4, w * 0.86, len - tipLen);
  s.lineTo(w, 0);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.012, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -0.003);
  g.computeVertexNormals();
  return g;
}

/** Knight's sword from an item `look` ({ blade, hilt, guard, len, width, glow }). */
export function buildSword(look, shadows = true) {
  const root = new THREE.Group();
  const L = look.len;
  const W = look.width || 1;
  const bladeMat = look.glow ? mat(look.blade, 0.25, 0.75, { emissive: look.glow, emissiveIntensity: 0.35 }) : steel(look.blade, 0.28);
  const blade = addMesh(root, geo(`blade:${L}:${W}`, () => bladeGeometry(L - 0.1, W)), bladeMat, [0, 0.1, 0], null, null, shadows);
  // fuller (a darker groove down the middle)
  addMesh(root, geo(`fuller:${L}`, () => new THREE.BoxGeometry(0.012, (L - 0.1) * 0.62, 0.02)), mat("#3a3d44", 0.4, 0.8), [0, 0.1 + (L - 0.1) * 0.36, 0], null, null, false);
  // guard, grip, pommel
  addMesh(root, geo("guard", () => new THREE.BoxGeometry(0.22, 0.032, 0.045)), steel(look.guard, 0.38), [0, 0.085, 0], null, null, shadows);
  for (const s of [-1, 1]) addMesh(root, geo("guardEnd", () => ellipsoid(0.022, 0.022, 0.026, 10, 8)), steel(look.guard, 0.38), [s * 0.115, 0.085, 0], null, null, false);
  addMesh(root, geo("grip", () => new THREE.CylinderGeometry(0.019, 0.021, 0.17, 10)), mat(look.hilt, 0.85), [0, -0.0, 0], null, null, false);
  for (let i = 0; i < 4; i++) addMesh(root, geo("wrap", () => new THREE.TorusGeometry(0.021, 0.004, 4, 12)), mat("#2a1a10", 0.9), [0, -0.06 + i * 0.04, 0], [Math.PI / 2, 0, 0.3], null, false);
  addMesh(root, geo("pommel", () => ellipsoid(0.03, 0.034, 0.03, 12, 10)), steel(look.guard, 0.38), [0, -0.11, 0], null, null, false);
  root.userData.blade = blade;
  root.userData.len = L;
  return root;
}

/** Shield from an item look ({ face, rim, boss, shape, emblem }). */
export function buildShield(look, shadows = true) {
  const root = new THREE.Group();
  const face = mat(look.face, 0.75, 0.05, { map: look.shape === "round" && look.face.startsWith("#7") ? woodTexture() : null });
  const rim = steel(look.rim, 0.35);
  const boss = steel(look.boss, 0.3);
  if (look.shape === "round") {
    const r = 0.31;
    addMesh(root, geo("shieldRound", () => {
      const g = lathe([[0.0, 0.07], [0.12, 0.062], [0.24, 0.035], [r, 0.0], [r, -0.02], [0.0, -0.02]], 28);
      g.rotateX(Math.PI / 2);
      return g;
    }), face, null, null, null, shadows);
    addMesh(root, geo("shieldRoundRim", () => new THREE.TorusGeometry(r, 0.018, 6, 32)), rim, [0, 0, 0.0], null, null, false);
    addMesh(root, geo("shieldBoss", () => ellipsoid(0.075, 0.075, 0.05, 14, 10)), boss, [0, 0, 0.075], null, null, false);
    if (look.emblem) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        addMesh(root, geo("stud", () => ellipsoid(0.016, 0.016, 0.012, 8, 6)), mat(look.emblem, 0.4, 0.7), [Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.045], null, null, false);
      }
    }
  } else {
    const kite = look.shape === "kite";
    const shapeG = geo(`shield:${look.shape}`, () => {
      const s = new THREE.Shape();
      if (kite) {
        s.moveTo(0, 0.36);
        s.quadraticCurveTo(0.25, 0.36, 0.25, 0.18);
        s.quadraticCurveTo(0.24, -0.12, 0, -0.42);
        s.quadraticCurveTo(-0.24, -0.12, -0.25, 0.18);
        s.quadraticCurveTo(-0.25, 0.36, 0, 0.36);
      } else {
        const w = 0.26;
        const h = 0.42;
        const r = 0.06;
        s.moveTo(-w + r, h);
        s.lineTo(w - r, h);
        s.quadraticCurveTo(w, h, w, h - r);
        s.lineTo(w, -h + 0.12);
        s.quadraticCurveTo(w, -h, 0, -h - 0.04);
        s.quadraticCurveTo(-w, -h, -w, -h + 0.12);
        s.lineTo(-w, h - r);
        s.quadraticCurveTo(-w, h, -w + r, h);
      }
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.014, bevelSegments: 2, curveSegments: 10 });
      // curve it around the arm
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        p.setZ(i, p.getZ(i) - x * x * 0.55);
      }
      g.computeVertexNormals();
      return g;
    });
    addMesh(root, shapeG, face, [0, 0, -0.01], null, null, shadows);
    addMesh(root, geo(`shieldRim:${look.shape}`, () => {
      const g = shapeG.clone();
      g.scale(1.06, 1.05, 0.6);
      return g;
    }), rim, [0, 0, -0.022], null, null, false);
    addMesh(root, geo("shieldBoss", () => ellipsoid(0.075, 0.075, 0.05, 14, 10)), boss, [0, 0.06, 0.05], null, null, false);
    if (look.emblem) {
      // a simple chevron emblem
      addMesh(root, geo("emblemBar", () => new THREE.BoxGeometry(0.05, 0.42, 0.012)), mat(look.emblem, 0.5, 0.3), [0, -0.02, 0.05], null, null, false);
      addMesh(root, geo("emblemCross", () => new THREE.BoxGeometry(0.34, 0.05, 0.012)), mat(look.emblem, 0.5, 0.3), [0, 0.14, 0.048], null, null, false);
    }
  }
  return root;
}

/** Potion flask (held during a drink). */
export function buildFlask() {
  const root = new THREE.Group();
  addMesh(root, geo("flask", () => lathe([[0.0, -0.06], [0.05, -0.055], [0.062, -0.02], [0.055, 0.02], [0.022, 0.05], [0.018, 0.09], [0.022, 0.1], [0.0, 0.1]], 14)), mat("#cfe8ff", 0.1, 0.1, { transparent: true, opacity: 0.45 }), null, null, null, false);
  addMesh(root, geo("flaskLiquid", () => ellipsoid(0.05, 0.04, 0.05, 12, 8)), glow("#ff3b55", 1.6), [0, -0.025, 0], null, null, false);
  addMesh(root, geo("cork", () => new THREE.CylinderGeometry(0.016, 0.02, 0.03, 8)), mat("#8a6a44", 0.9), [0, 0.11, 0], null, null, false);
  return root;
}

/**
 * Enemy weapons (visual only — enemy hits are resolved by attack shapes).
 * kind: shortsword | greatsword | heavysword | scythe | staff | flail
 */
export function buildEnemyWeapon(kind, colors = {}, shadows = true) {
  const root = new THREE.Group();
  const metal = colors.metal || "#8f8a80";
  const glowC = colors.glow || null;
  if (kind === "shortsword" || kind === "greatsword" || kind === "heavysword") {
    const len = kind === "shortsword" ? 0.78 : kind === "greatsword" ? 1.45 : 1.3;
    const w = kind === "shortsword" ? 0.9 : kind === "greatsword" ? 1.35 : 1.6;
    const bm = glowC ? mat(metal, 0.35, 0.7, { emissive: glowC, emissiveIntensity: 0.2 }) : steel(metal, kind === "shortsword" ? 0.7 : 0.4);
    addMesh(root, geo(`eblade:${len}:${w}`, () => bladeGeometry(len - 0.1, w, kind === "shortsword" ? 0.12 : 0.24)), bm, [0, 0.1, 0], null, null, shadows);
    addMesh(root, geo(`eguard:${w}`, () => new THREE.BoxGeometry(0.16 + w * 0.08, 0.04, 0.05)), steel(colors.guard || "#5a544c", 0.5), [0, 0.085, 0], null, null, false);
    addMesh(root, geo(`egrip:${len}`, () => new THREE.CylinderGeometry(0.02, 0.022, kind === "shortsword" ? 0.15 : 0.32, 8)), mat("#2a1d14", 0.9), [0, kind === "shortsword" ? 0 : -0.06, 0], null, null, false);
    root.userData.len = len;
  } else if (kind === "scythe") {
    addMesh(root, geo("scytheShaft", () => new THREE.CylinderGeometry(0.025, 0.03, 2.0, 8)), mat("#3a2a1c", 0.9), [0, 0.55, 0], null, null, shadows);
    const blade = geo("scytheBlade", () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.quadraticCurveTo(0.45, 0.22, 0.9, -0.18);
      s.quadraticCurveTo(0.45, 0.06, 0, -0.1);
      s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.01, bevelSegments: 1 });
      return g;
    });
    addMesh(root, blade, glowC ? mat(metal, 0.35, 0.6, { emissive: glowC, emissiveIntensity: 0.5 }) : steel(metal, 0.5), [0, 1.48, 0], [0, 0, 0], null, shadows);
    root.userData.len = 1.6;
  } else if (kind === "staff") {
    addMesh(root, geo("staffShaft", () => new THREE.CylinderGeometry(0.022, 0.03, 1.7, 8)), mat("#3b2a20", 0.9), [0, 0.35, 0], null, null, shadows);
    for (let i = 0; i < 3; i++) addMesh(root, geo("staffProng", () => new THREE.ConeGeometry(0.02, 0.22, 5)), mat("#4a3a2a", 0.8), [Math.cos((i / 3) * 6.28) * 0.06, 1.22, Math.sin((i / 3) * 6.28) * 0.06], [Math.sin((i / 3) * 6.28) * 0.4, 0, -Math.cos((i / 3) * 6.28) * 0.4], null, false);
    const orb = addMesh(root, geo("staffOrb", () => new THREE.SphereGeometry(0.085, 14, 10)), glow(glowC || "#8f7bff", 2.4), [0, 1.3, 0], null, null, false);
    root.userData.orb = orb;
    root.userData.len = 1.3;
  } else if (kind === "flail") {
    addMesh(root, geo("flailHandle", () => new THREE.CylinderGeometry(0.03, 0.035, 0.45, 8)), mat("#2b1d16", 0.9), [0, 0.12, 0], null, null, shadows);
    const chain = group(root, [0, 0.36, 0]);
    for (let i = 0; i < 9; i++) addMesh(chain, geo("link", () => new THREE.TorusGeometry(0.035, 0.011, 5, 10)), steel(metal, 0.55), [0, i * 0.075, 0], [0, i % 2 ? Math.PI / 2 : 0, 0], null, false);
    const ball = addMesh(chain, geo("flailBall", () => new THREE.IcosahedronGeometry(0.16, 1)), steel(metal, 0.5), [0, 0.76, 0], null, null, shadows);
    for (let i = 0; i < 8; i++) {
      const a = new THREE.Vector3().randomDirection();
      const sp = addMesh(ball, geo("spike", () => new THREE.ConeGeometry(0.03, 0.1, 5)), steel(metal, 0.4), [a.x * 0.16, a.y * 0.16, a.z * 0.16], null, null, false);
      sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), a);
    }
    if (glowC) addMesh(ball, geo("flailGlow", () => new THREE.SphereGeometry(0.13, 10, 8)), glow(glowC, 1.2), null, null, null, false);
    root.userData.chain = chain;
    root.userData.len = 1.2;
  }
  return root;
}
