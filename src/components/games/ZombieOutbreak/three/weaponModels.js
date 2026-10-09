/**
 * Zombie Outbreak — first-person weapon models (fictional designs), built
 * from primitives. Frame: barrel toward −Z, Y up, origin at the firing grip.
 *
 * Each returns:
 *   group     the model (with gloved hands attached)
 *   muzzle    Object3D at the muzzle (flash + tracer origin)
 *   sightY    height of the sight line above the origin (for ADS alignment)
 *   sightZ    eye relief: how far in front of the camera the rear sight sits
 *   mag       the magazine mesh/group (animated on reload) — or null
 *   slide     part that kicks back on each shot (slide / bolt / pump) — or null
 *   pump      true when `slide` is a pump that cycles after each shot
 *   leftHand  the support hand group (animated on reload)
 */
import * as THREE from "three";

const g0 = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 16),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  sph: new THREE.SphereGeometry(1, 14, 10),
  torus: new THREE.TorusGeometry(1, 0.22, 8, 20),
  cap: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
};

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {
    steel: new THREE.MeshStandardMaterial({ color: "#2b2e33", roughness: 0.38, metalness: 0.85 }),
    steelLight: new THREE.MeshStandardMaterial({ color: "#555a62", roughness: 0.32, metalness: 0.9 }),
    polymer: new THREE.MeshStandardMaterial({ color: "#16171a", roughness: 0.75, metalness: 0.1 }),
    tan: new THREE.MeshStandardMaterial({ color: "#8a7656", roughness: 0.8, metalness: 0.05 }),
    olive: new THREE.MeshStandardMaterial({ color: "#4c5338", roughness: 0.75, metalness: 0.1 }),
    wood: new THREE.MeshStandardMaterial({ color: "#5a3b22", roughness: 0.65, metalness: 0.05 }),
    glove: new THREE.MeshStandardMaterial({ color: "#1f1d1b", roughness: 0.9 }),
    sleeve: new THREE.MeshStandardMaterial({ color: "#4a4436", roughness: 0.95 }),
    skin: new THREE.MeshStandardMaterial({ color: "#b98a6c", roughness: 0.8 }),
    lens: new THREE.MeshStandardMaterial({ color: "#0a1418", roughness: 0.05, metalness: 0.9, emissive: "#0a2a30", emissiveIntensity: 0.4 }),
    red: new THREE.MeshBasicMaterial({ color: "#ff2a2a" }),
    glow: new THREE.MeshStandardMaterial({ color: "#3ad8ff", emissive: "#28c8ff", emissiveIntensity: 1.6, roughness: 0.3 }),
    brass: new THREE.MeshStandardMaterial({ color: "#b08a3a", roughness: 0.35, metalness: 0.9 }),
    shell: new THREE.MeshStandardMaterial({ color: "#8a1f1a", roughness: 0.5, metalness: 0.2 }),
  };
  for (const m of Object.values(MATS)) m.userData.shared = true;
  return MATS;
}

export function disposeWeaponMats() {
  if (!MATS) return;
  for (const m of Object.values(MATS)) m.dispose();
  MATS = null;
}

function b(parent, m, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(g0.box, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.rotation.set(rx, ry, rz);
  parent.add(o);
  return o;
}
/** Cylinder along Z (barrels). */
function cz(parent, m, x, y, z, r, len, geo = g0.cyl) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.scale.set(r, len, r);
  o.rotation.x = Math.PI / 2;
  parent.add(o);
  return o;
}

/** Gloved right hand wrapped around a grip at the origin. */
function rightHand(parent, M) {
  const h = new THREE.Group();
  b(h, M.glove, 0.0, -0.045, 0.012, 0.042, 0.075, 0.07, 0.25);
  // Fingers wrapped round the front of the grip.
  for (let i = 0; i < 3; i++) b(h, M.glove, 0, -0.022 - i * 0.022, -0.022, 0.044, 0.018, 0.022, 0.25);
  // Thumb along the side.
  b(h, M.glove, -0.026, -0.01, -0.008, 0.016, 0.018, 0.05, 0, 0.2, 0);
  // Wrist + sleeve back toward the camera, lower right.
  const s = new THREE.Mesh(g0.cap, M.sleeve);
  s.position.set(0.035, -0.12, 0.17);
  s.scale.set(0.06, 0.24, 0.06);
  s.rotation.set(1.15, 0, 0.25);
  h.add(s);
  const cuff = new THREE.Mesh(g0.cyl, M.glove);
  cuff.position.set(0.012, -0.065, 0.06);
  cuff.scale.set(0.034, 0.06, 0.034);
  cuff.rotation.set(1.15, 0, 0.25);
  h.add(cuff);
  h.userData.hand = true;
  parent.add(h);
  return h;
}

/** Support hand at (x, y, z), sleeve trailing back to the lower left. */
function leftHand(parent, M, x, y, z, under = true) {
  const h = new THREE.Group();
  h.position.set(x, y, z);
  b(h, M.glove, 0, under ? -0.012 : 0, 0, 0.07, 0.035, 0.08, 0, 0, under ? 0.2 : 0.4);
  for (let i = 0; i < 3; i++) b(h, M.glove, 0.03, 0.01, -0.025 + i * 0.022, 0.02, 0.04, 0.02, 0, 0, -0.3);
  const s = new THREE.Mesh(g0.cap, M.sleeve);
  s.position.set(-0.05, -0.12, 0.11);
  s.scale.set(0.055, 0.26, 0.055);
  s.rotation.set(0.8, 0, -0.45);
  h.add(s);
  h.userData.hand = true;
  parent.add(h);
  return h;
}

function muzzleAt(parent, x, y, z) {
  const m = new THREE.Object3D();
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/* ------------------------------------------------------------------ models */

function pistol() {
  const M = mats();
  const g = new THREE.Group();
  const slide = new THREE.Group();
  g.add(slide);
  b(slide, M.steel, 0, 0.045, -0.075, 0.03, 0.034, 0.2);
  // Serrations + ejection port.
  for (let i = 0; i < 5; i++) b(slide, M.polymer, 0, 0.046, 0.0 + i * 0.008, 0.031, 0.03, 0.003);
  b(slide, M.polymer, 0.0155, 0.052, -0.06, 0.002, 0.012, 0.04);
  // Sights.
  b(slide, M.steel, 0.008, 0.066, 0.015, 0.007, 0.009, 0.01);
  b(slide, M.steel, -0.008, 0.066, 0.015, 0.007, 0.009, 0.01);
  b(slide, M.steel, 0, 0.066, -0.168, 0.005, 0.01, 0.008);
  b(slide, M.red, 0, 0.0705, -0.168, 0.003, 0.003, 0.003);
  cz(g, M.steelLight, 0, 0.045, -0.178, 0.008, 0.012);
  // Frame + rail + trigger guard.
  b(g, M.polymer, 0, 0.02, -0.07, 0.028, 0.02, 0.18);
  b(g, M.polymer, 0, 0.005, -0.06, 0.03, 0.006, 0.05);
  b(g, M.polymer, 0, -0.008, -0.03, 0.022, 0.006, 0.05);
  b(g, M.steel, 0, 0.0, -0.022, 0.004, 0.022, 0.006);
  // Grip.
  b(g, M.polymer, 0, -0.04, 0.012, 0.03, 0.09, 0.042, 0.25);
  b(g, M.tan, 0.0155, -0.04, 0.012, 0.002, 0.07, 0.034, 0.25);
  b(g, M.tan, -0.0155, -0.04, 0.012, 0.002, 0.07, 0.034, 0.25);
  const mag = new THREE.Group();
  g.add(mag);
  b(mag, M.steel, 0, -0.088, 0.024, 0.026, 0.012, 0.04, 0.25);
  rightHand(g, M);
  const lh = leftHand(g, M, -0.012, -0.03, -0.01, false);
  return { group: g, muzzle: muzzleAt(g, 0, 0.045, -0.19), sightY: 0.0675, sightZ: 0.28, mag, slide, leftHand: lh, hip: [0.15, -0.155, -0.3] };
}

function smg() {
  const M = mats();
  const g = new THREE.Group();
  b(g, M.polymer, 0, 0.035, -0.1, 0.045, 0.06, 0.26);
  b(g, M.steel, 0, 0.068, -0.1, 0.02, 0.008, 0.24);
  // Shroud with vents.
  const shroud = cz(g, M.steel, 0, 0.04, -0.29, 0.022, 0.14);
  void shroud;
  for (let i = 0; i < 4; i++) b(g, M.polymer, 0, 0.062, -0.24 - i * 0.028, 0.012, 0.004, 0.012);
  cz(g, M.steelLight, 0, 0.04, -0.37, 0.012, 0.03);
  // Red-dot.
  b(g, M.polymer, 0, 0.086, -0.08, 0.03, 0.026, 0.05);
  const lensM = new THREE.Mesh(g0.box, M.lens);
  lensM.position.set(0, 0.09, -0.08);
  lensM.scale.set(0.022, 0.016, 0.052);
  g.add(lensM);
  b(g, M.red, 0, 0.092, -0.106, 0.002, 0.002, 0.001);
  // Grip, foregrip, stock.
  b(g, M.polymer, 0, -0.035, 0.012, 0.032, 0.09, 0.042, 0.22);
  b(g, M.polymer, 0, -0.03, -0.2, 0.026, 0.08, 0.03, -0.1);
  b(g, M.steel, 0, 0.04, 0.09, 0.008, 0.008, 0.16);
  b(g, M.steel, 0, 0.0, 0.09, 0.008, 0.008, 0.16);
  b(g, M.polymer, 0, 0.02, 0.17, 0.02, 0.07, 0.015);
  const mag = new THREE.Group();
  g.add(mag);
  b(mag, M.steel, 0, -0.06, -0.06, 0.022, 0.13, 0.03, -0.05);
  const slide = new THREE.Group();
  g.add(slide);
  b(slide, M.steelLight, 0.024, 0.05, -0.06, 0.006, 0.01, 0.02);
  rightHand(g, M);
  const lh = leftHand(g, M, 0, -0.06, -0.2);
  return { group: g, muzzle: muzzleAt(g, 0, 0.04, -0.39), sightY: 0.092, sightZ: 0.3, mag, slide, leftHand: lh, hip: [0.14, -0.16, -0.37] };
}

function shotgun() {
  const M = mats();
  const g = new THREE.Group();
  b(g, M.steel, 0, 0.035, -0.08, 0.045, 0.065, 0.2);
  cz(g, M.steel, 0, 0.06, -0.38, 0.016, 0.46);
  cz(g, M.steel, 0, 0.022, -0.33, 0.017, 0.36);
  b(g, M.steelLight, 0, 0.08, -0.6, 0.006, 0.01, 0.008);
  b(g, M.steel, 0, 0.074, -0.05, 0.03, 0.01, 0.06);
  const pump = new THREE.Group();
  g.add(pump);
  cz(pump, M.wood, 0, 0.022, -0.3, 0.03, 0.15, g0.cyl6);
  for (let i = 0; i < 5; i++) b(pump, M.polymer, 0, 0.022, -0.24 - i * 0.025, 0.064, 0.064, 0.005);
  b(g, M.wood, 0, -0.035, 0.03, 0.035, 0.1, 0.05, 0.3);
  b(g, M.wood, 0, 0.01, 0.17, 0.045, 0.085, 0.24, -0.06);
  b(g, M.polymer, 0, 0.0, 0.29, 0.048, 0.1, 0.02);
  // Shells on the side saddle.
  const mag = new THREE.Group();
  g.add(mag);
  for (let i = 0; i < 4; i++) cz(mag, M.shell, 0.028, 0.04, -0.04 - i * 0.026, 0.009, 0.05).rotation.set(0, 0, 0);
  rightHand(g, M);
  const lh = leftHand(pump, M, 0, -0.025, -0.3);
  return { group: g, muzzle: muzzleAt(g, 0, 0.06, -0.62), sightY: 0.083, sightZ: 0.36, mag, slide: pump, pump: true, leftHand: lh, hip: [0.13, -0.165, -0.45] };
}

function rifle() {
  const M = mats();
  const g = new THREE.Group();
  b(g, M.olive, 0, 0.035, -0.06, 0.042, 0.06, 0.22);
  b(g, M.polymer, 0, 0.045, -0.29, 0.046, 0.055, 0.24);
  for (let i = 0; i < 7; i++) b(g, M.polymer, 0, 0.074, -0.19 - i * 0.03, 0.03, 0.006, 0.012);
  cz(g, M.steel, 0, 0.045, -0.47, 0.011, 0.16);
  cz(g, M.steelLight, 0, 0.045, -0.56, 0.016, 0.04, g0.cyl6);
  b(g, M.steel, 0, 0.07, -0.06, 0.024, 0.008, 0.22);
  // Holo sight.
  const holo = new THREE.Group();
  g.add(holo);
  b(holo, M.polymer, 0, 0.082, -0.04, 0.036, 0.014, 0.07);
  b(holo, M.polymer, 0.017, 0.105, -0.06, 0.004, 0.04, 0.03);
  b(holo, M.polymer, -0.017, 0.105, -0.06, 0.004, 0.04, 0.03);
  b(holo, M.polymer, 0, 0.126, -0.06, 0.038, 0.004, 0.03);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.0035, 0.0045, 20), M.red);
  ring.position.set(0, 0.106, -0.07);
  holo.add(ring);
  b(holo, M.red, 0, 0.106, -0.07, 0.0012, 0.0012, 0.0005);
  // Grip, stock, mag.
  b(g, M.polymer, 0, -0.035, 0.015, 0.032, 0.09, 0.042, 0.25);
  b(g, M.olive, 0, 0.03, 0.15, 0.04, 0.07, 0.2);
  b(g, M.polymer, 0, 0.025, 0.25, 0.045, 0.1, 0.02);
  const mag = new THREE.Group();
  g.add(mag);
  b(mag, M.olive, 0, -0.035, -0.09, 0.026, 0.08, 0.04, -0.12);
  b(mag, M.olive, 0, -0.1, -0.1, 0.026, 0.07, 0.04, -0.35);
  const slide = new THREE.Group();
  g.add(slide);
  b(slide, M.steelLight, 0.024, 0.045, -0.03, 0.006, 0.012, 0.03);
  rightHand(g, M);
  const lh = leftHand(g, M, 0, 0.0, -0.3);
  return { group: g, muzzle: muzzleAt(g, 0, 0.045, -0.59), sightY: 0.106, sightZ: 0.34, mag, slide, leftHand: lh, hip: [0.13, -0.165, -0.45] };
}

function marksman() {
  const M = mats();
  const g = new THREE.Group();
  b(g, M.tan, 0, 0.035, -0.08, 0.044, 0.06, 0.26);
  b(g, M.tan, 0, 0.04, -0.33, 0.046, 0.05, 0.26);
  cz(g, M.steel, 0, 0.045, -0.58, 0.012, 0.3);
  cz(g, M.steelLight, 0, 0.045, -0.75, 0.018, 0.05, g0.cyl6);
  // Scope.
  const sc = new THREE.Group();
  g.add(sc);
  cz(sc, M.polymer, 0, 0.11, -0.1, 0.022, 0.26);
  cz(sc, M.polymer, 0, 0.11, -0.25, 0.03, 0.06);
  cz(sc, M.polymer, 0, 0.11, 0.04, 0.027, 0.04);
  const lensF = cz(sc, M.lens, 0, 0.11, -0.281, 0.026, 0.002);
  void lensF;
  b(sc, M.steel, 0, 0.083, -0.04, 0.016, 0.03, 0.02);
  b(sc, M.steel, 0, 0.083, -0.16, 0.016, 0.03, 0.02);
  b(sc, M.polymer, 0.03, 0.11, -0.1, 0.012, 0.02, 0.02);
  // Grip + stock + mag.
  b(g, M.polymer, 0, -0.035, 0.015, 0.032, 0.09, 0.042, 0.25);
  b(g, M.tan, 0, 0.03, 0.16, 0.04, 0.08, 0.22);
  b(g, M.tan, 0, 0.075, 0.12, 0.03, 0.025, 0.1);
  const mag = new THREE.Group();
  g.add(mag);
  b(mag, M.steel, 0, -0.03, -0.1, 0.026, 0.07, 0.05);
  const slide = new THREE.Group();
  g.add(slide);
  b(slide, M.steelLight, 0.028, 0.05, -0.04, 0.02, 0.008, 0.008);
  rightHand(g, M);
  const lh = leftHand(g, M, 0, 0.0, -0.33);
  return { group: g, muzzle: muzzleAt(g, 0, 0.045, -0.79), sightY: 0.11, sightZ: 0.36, mag, slide, leftHand: lh, scope: true, hip: [0.13, -0.165, -0.47] };
}

function blaster() {
  const M = mats();
  const g = new THREE.Group();
  b(g, M.steel, 0, 0.04, -0.1, 0.07, 0.085, 0.32);
  b(g, M.olive, 0, 0.09, -0.12, 0.05, 0.02, 0.26);
  cz(g, M.steel, 0, 0.04, -0.36, 0.03, 0.22);
  const coils = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(g0.torus, M.glow);
    t.position.set(0, 0.04, -0.29 - i * 0.05);
    t.scale.setScalar(0.04);
    g.add(t);
    coils.push(t);
  }
  cz(g, M.steelLight, 0, 0.04, -0.49, 0.045, 0.05, g0.cyl6);
  const emitter = cz(g, M.glow, 0, 0.04, -0.515, 0.026, 0.006);
  void emitter;
  // Top handle + sight.
  b(g, M.steel, 0, 0.13, -0.08, 0.016, 0.012, 0.14);
  b(g, M.steel, 0, 0.11, -0.02, 0.012, 0.04, 0.012);
  b(g, M.steel, 0, 0.11, -0.14, 0.012, 0.04, 0.012);
  b(g, M.glow, 0, 0.143, -0.1, 0.004, 0.006, 0.004);
  // Grip + cell.
  b(g, M.polymer, 0, -0.035, 0.015, 0.034, 0.09, 0.044, 0.25);
  const mag = new THREE.Group();
  g.add(mag);
  b(mag, M.steel, 0, -0.02, -0.12, 0.05, 0.06, 0.08);
  b(mag, M.glow, 0, -0.02, -0.12, 0.052, 0.03, 0.06);
  b(g, M.steel, 0, 0.03, 0.12, 0.05, 0.08, 0.14);
  rightHand(g, M);
  const lh = leftHand(g, M, 0, -0.02, -0.3);
  return { group: g, muzzle: muzzleAt(g, 0, 0.04, -0.53), sightY: 0.143, sightZ: 0.36, mag, slide: null, leftHand: lh, coils, hip: [0.15, -0.18, -0.45] };
}

const BUILDERS = { pistol, smg, shotgun, rifle, marksman, blaster };

export function buildWeaponModel(id) {
  const w = (BUILDERS[id] || pistol)();
  w.group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
    }
  });
  w.magHome = w.mag ? w.mag.position.clone() : null;
  w.slideHome = w.slide ? w.slide.position.clone() : null;
  w.leftHome = w.leftHand ? w.leftHand.position.clone() : null;
  return w;
}
