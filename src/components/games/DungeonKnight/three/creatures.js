/**
 * Dungeon Knight — the non-humanoid enemies: slime, bat, spider, golem.
 * Each builder returns { root, update(state), … }; the enemy view drives them
 * from the AI state (enemies.js). Stylised, readable silhouettes; no gore —
 * defeated creatures melt, crumble or fall and fade into the floor.
 */
import * as THREE from "three";
import { mat, glow, lathe, ellipsoid, addMesh, group, geo } from "./materials.js";

/* ================================================================== slime */
export function buildSlime(colors, shadows = true) {
  const root = new THREE.Group();
  const body = group(root);
  // own material (hit flash / death fade are per slime)
  const skin = new THREE.MeshStandardMaterial({
    color: colors.body, roughness: 0.18, metalness: 0.0, transparent: true, opacity: 0.82,
    emissive: colors.glow, emissiveIntensity: 0.22,
  });
  const shell = addMesh(body, geo("slimeBody", () => lathe([[0.0, 0.0], [0.42, 0.02], [0.53, 0.14], [0.54, 0.3], [0.48, 0.52], [0.34, 0.74], [0.17, 0.87], [0.0, 0.9]], 26)), skin, null, null, null, shadows);
  const coreMat = new THREE.MeshStandardMaterial({ color: colors.core, roughness: 0.5, emissive: colors.glow, emissiveIntensity: 0.4, transparent: true, opacity: 0.9 });
  addMesh(body, geo("slimeCore", () => ellipsoid(0.2, 0.17, 0.2, 14, 10)), coreMat, [0.04, 0.3, -0.05], null, null, false);
  // bubbles inside
  for (let i = 0; i < 4; i++) addMesh(body, geo("bubble", () => new THREE.SphereGeometry(0.035, 8, 6)), mat("#ffffff", 0.1, 0, { transparent: true, opacity: 0.35 }), [Math.sin(i * 2.1) * 0.24, 0.18 + i * 0.12, Math.cos(i * 2.1) * 0.2], null, null, false);
  const eyeMat = glow(colors.eye, 2.4);
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = addMesh(body, geo("slimeEye", () => ellipsoid(0.065, 0.085, 0.04, 12, 10)), eyeMat, [s * 0.16, 0.56, 0.42], [0, s * 0.25, 0], null, false);
    addMesh(e, geo("slimePupil", () => ellipsoid(0.03, 0.042, 0.02, 10, 8)), mat("#05110f", 0.3), [0, -0.012, 0.03], null, null, false);
    eyes.push(e);
  }
  // little mouth
  addMesh(body, geo("slimeMouth", () => new THREE.TorusGeometry(0.06, 0.012, 5, 12, Math.PI)), mat("#06231c", 0.5), [0, 0.42, 0.47], [0, 0, Math.PI], null, false);
  const puddle = addMesh(root, geo("puddle", () => new THREE.CircleGeometry(0.75, 24)), new THREE.MeshStandardMaterial({ color: colors.body, roughness: 0.1, transparent: true, opacity: 0, emissive: colors.glow, emissiveIntensity: 0.25, depthWrite: false }), [0, 0.012, 0], [-Math.PI / 2, 0, 0], null, false);
  puddle.receiveShadow = false;
  return { kind: "slime", root, body, skin, coreMat, eyes, puddle, eyeMat, owned: [skin, coreMat, puddle.material] };
}

/* ================================================================== bat */
export function buildBat(colors, shadows = true) {
  const root = new THREE.Group();
  const body = group(root);
  const fur = mat(colors.body, 0.95);
  addMesh(body, geo("batBody", () => ellipsoid(0.13, 0.17, 0.12, 12, 10)), fur, [0, 0, 0], null, null, shadows);
  const head = group(body, [0, 0.16, 0.06]);
  addMesh(head, geo("batHead", () => ellipsoid(0.1, 0.09, 0.09, 12, 10)), fur, null, null, null, false);
  for (const s of [-1, 1]) {
    addMesh(head, geo("batEar", () => new THREE.ConeGeometry(0.035, 0.12, 5)), fur, [s * 0.055, 0.1, -0.01], [0, 0, -s * 0.25], null, false);
    addMesh(head, geo("batEye", () => new THREE.SphereGeometry(0.02, 8, 6)), glow(colors.eye, 3), [s * 0.04, 0.02, 0.08], null, null, false);
  }
  addMesh(head, geo("fang", () => new THREE.ConeGeometry(0.008, 0.03, 4)), mat("#f2efe8", 0.4), [0.015, -0.06, 0.07], [Math.PI, 0, 0], null, false);
  const wingG = geo("batWing", () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(0.18, 0.12);
    s.lineTo(0.42, 0.1);
    s.quadraticCurveTo(0.36, -0.02, 0.4, -0.12);
    s.quadraticCurveTo(0.28, -0.06, 0.24, -0.16);
    s.quadraticCurveTo(0.14, -0.06, 0.06, -0.12);
    s.closePath();
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    return g;
  });
  const wingM = mat(colors.wing, 0.9, 0, { side: THREE.DoubleSide });
  const wings = [];
  for (const s of [-1, 1]) {
    const pivot = group(body, [s * 0.08, 0.04, 0]);
    const w = addMesh(pivot, wingG, wingM, null, null, [-s, 1, 1], shadows);
    w.rotation.y = 0;
    wings.push({ pivot, s });
  }
  return { kind: "bat", root, body, head, wings };
}

/* ================================================================== spider */
export function buildSpider(colors, shadows = true) {
  const root = new THREE.Group();
  const body = group(root, [0, 0.45, 0]);
  const shell = mat(colors.body, 0.55, 0.1);
  addMesh(body, geo("abdomen", () => ellipsoid(0.34, 0.27, 0.42, 16, 12)), shell, [0, 0.08, -0.38], null, null, shadows);
  addMesh(body, geo("abdomenMark", () => ellipsoid(0.12, 0.05, 0.2, 10, 8)), glow(colors.mark, 0.9), [0, 0.33, -0.4], [0.2, 0, 0], null, false);
  addMesh(body, geo("thorax", () => ellipsoid(0.22, 0.17, 0.26, 14, 10)), shell, [0, 0.02, 0.05], null, null, shadows);
  const head = group(body, [0, 0.02, 0.28]);
  addMesh(head, geo("spHead", () => ellipsoid(0.14, 0.11, 0.13, 12, 10)), shell, null, null, null, false);
  const eyeM = glow(colors.eye, 2.8);
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    const r = Math.floor(i / 2);
    addMesh(head, geo("spEye", () => new THREE.SphereGeometry(0.022, 8, 6)), eyeM, [s * (0.035 + r * 0.03), 0.05 - r * 0.025, 0.11 - r * 0.015], null, null, false);
  }
  for (const s of [-1, 1]) addMesh(head, geo("fangSp", () => new THREE.ConeGeometry(0.02, 0.09, 5)), mat("#1a1a1a", 0.5), [s * 0.04, -0.08, 0.1], [Math.PI * 0.85, 0, 0], null, false);
  const legM = mat(colors.leg, 0.6, 0.1);
  const segG = (r0, r1) => geo(`spSeg:${r0}:${r1}`, () => {
    const g = new THREE.CylinderGeometry(r1, r0, 1, 6);
    g.translate(0, 0.5, 0); // unit length along +Y from the joint
    return g;
  });
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? 1 : -1;
    const k = i % 4;
    const upper = addMesh(body, segG(0.034, 0.026), legM, null, null, null, shadows && k === 1);
    const lower = addMesh(body, segG(0.026, 0.01), legM, null, null, null, false);
    const knee = addMesh(body, geo("spKnee", () => new THREE.SphereGeometry(0.032, 8, 6)), legM, null, null, null, false);
    // spread: front legs reach forward, back legs reach back
    const spread = (1.5 - k) * 0.42;
    legs.push({ upper, lower, knee, side, k, spread, phase: (k % 2) * 0.5 + (side > 0 ? 0 : 0.5), ax: side * 0.15, az: 0.16 - k * 0.11 });
  }
  return { kind: "spider", root, body, head, legs, walk: 0 };
}

/* ================================================================== golem */
export function buildGolem(colors, shadows = true) {
  const root = new THREE.Group();
  const rock = mat(colors.body, 0.85, 0.05, { flat: true });
  const rock2 = mat(colors.body2 || colors.body, 0.9, 0.05, { flat: true });
  const vein = glow(colors.glow, 1.8);
  const body = group(root, [0, 1.25, 0]);
  addMesh(body, geo("gTorso", () => {
    const g = new THREE.DodecahedronGeometry(0.62, 0);
    g.scale(1.25, 1.0, 0.85);
    return g;
  }), rock, [0, 0.25, 0], null, null, shadows);
  addMesh(body, geo("gChestRock", () => new THREE.DodecahedronGeometry(0.32, 0)), rock2, [0.1, 0.42, 0.42], [0.3, 0.5, 0], null, false);
  addMesh(body, geo("gCore", () => new THREE.OctahedronGeometry(0.14, 0)), vein, [0, 0.3, 0.5], null, null, false);
  for (let i = 0; i < 6; i++) addMesh(body, geo("gVein", () => new THREE.BoxGeometry(0.035, 0.32, 0.03)), vein, [Math.sin(i * 1.7) * 0.45, 0.15 + Math.cos(i * 2.3) * 0.25, 0.5 - Math.abs(Math.sin(i)) * 0.2], [0, 0, i * 0.9], null, false);
  addMesh(body, geo("gPelvis", () => {
    const g = new THREE.DodecahedronGeometry(0.42, 0);
    g.scale(1.3, 0.7, 0.9);
    return g;
  }), rock2, [0, -0.45, 0], null, null, shadows);
  const head = group(body, [0, 0.95, 0.12]);
  addMesh(head, geo("gHead", () => {
    const g = new THREE.DodecahedronGeometry(0.26, 0);
    g.scale(1.1, 0.85, 1);
    return g;
  }), rock, null, null, null, shadows);
  const eyes = [];
  for (const s of [-1, 1]) eyes.push(addMesh(head, geo("gEye", () => new THREE.BoxGeometry(0.08, 0.04, 0.04)), vein, [s * 0.09, 0.0, 0.22], null, null, false));
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = group(body, [s * 0.86, 0.45, 0]);
    addMesh(sh, geo("gShoulder", () => new THREE.DodecahedronGeometry(0.34, 0)), rock2, null, null, null, shadows);
    const upper = group(sh);
    addMesh(upper, geo("gUpper", () => {
      const g = new THREE.DodecahedronGeometry(0.27, 0);
      g.scale(0.9, 1.5, 0.9);
      g.translate(0, -0.42, 0);
      return g;
    }), rock, null, null, null, shadows);
    const fore = group(upper, [0, -0.78, 0]);
    addMesh(fore, geo("gFore", () => {
      const g = new THREE.DodecahedronGeometry(0.33, 0);
      g.scale(1.0, 1.45, 1.0);
      g.translate(0, -0.42, 0);
      return g;
    }), rock2, null, null, null, shadows);
    addMesh(fore, geo("gFist", () => new THREE.DodecahedronGeometry(0.3, 0)), rock, [0, -0.9, 0.05], null, null, false);
    arms.push({ sh, upper, fore, s });
  }
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = group(body, [s * 0.38, -0.55, 0]);
    addMesh(hip, geo("gLeg", () => {
      const g = new THREE.DodecahedronGeometry(0.3, 0);
      g.scale(1, 1.6, 1);
      g.translate(0, -0.35, 0);
      return g;
    }), rock2, null, null, null, shadows);
    addMesh(hip, geo("gFoot", () => {
      const g = new THREE.BoxGeometry(0.42, 0.18, 0.55);
      return g;
    }), rock, [0, -0.62, 0.08], null, null, false);
    legs.push({ hip, s });
  }
  return { kind: "golem", root, body, head, eyes, arms, legs };
}
