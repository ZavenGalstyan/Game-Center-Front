/**
 * Low-poly models built from primitives: the three enemy rigs, the
 * first-person arms + weapons, pickups and furniture. Geometries are shared;
 * enemy materials are cloned per enemy only so hit flashes stay individual.
 * All rigs face −Z (yaw 0), matching the sim.
 */
import * as THREE from "three";
import { skinTexture, clothTexture, glowTexture } from "./textures.js";

const geo = new Map();
function G(key, make) {
  if (!geo.has(key)) geo.set(key, make());
  return geo.get(key);
}
const box = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cap = (r, l) => G(`c${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 8));
const sph = (r) => G(`s${r}`, () => new THREE.SphereGeometry(r, 12, 10));
const cyl = (rt, rb, h, n = 10) => G(`y${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const cone = (r, h) => G(`k${r},${h}`, () => new THREE.ConeGeometry(r, h, 6));

const sharedMats = new Map();
function M(key, make) {
  if (!sharedMats.has(key)) sharedMats.set(key, make());
  return sharedMats.get(key);
}

function mesh(g, m, x = 0, y = 0, z = 0, parent) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  if (parent) parent.add(o);
  return o;
}
function pivot(parent, x, y, z) {
  const p = new THREE.Group();
  p.position.set(x, y, z);
  parent.add(p);
  return p;
}

/* ================================================================ enemies */
/**
 * Rig layout: root (on the floor) → hips → torso → head / shoulders → arms,
 * hips → legs. Returns { root, parts, mats, type }.
 */
export function makeEnemy(type) {
  const skin = new THREE.MeshStandardMaterial({ map: skinTexture(type), roughness: 0.85, emissive: 0x000000 });
  const cloth = new THREE.MeshStandardMaterial({ map: clothTexture(type === "brute" ? "rags" : type === "creature" ? "rags" : "jumpsuit"), roughness: 0.95, emissive: 0x000000 });
  const eye = M(`eye:${type}`, () => new THREE.MeshBasicMaterial({ color: type === "creature" ? 0xff3b1f : type === "brute" ? 0xffa020 : 0xd8ff6a }));
  const dark = M("dark", () => new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.9 }));
  const metal = M("metal", () => new THREE.MeshStandardMaterial({ color: 0x6a6c70, roughness: 0.45, metalness: 0.35 }));
  const bone = M("bone", () => new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.6 }));
  const root = new THREE.Group();
  const P = {};
  if (type === "infected") {
    P.hips = pivot(root, 0, 0.95, 0);
    mesh(box(0.38, 0.22, 0.24), cloth, 0, 0, 0, P.hips);
    P.torso = pivot(P.hips, 0, 0.1, 0);
    P.torso.rotation.x = -0.32; // hunched forward
    mesh(box(0.46, 0.55, 0.28), cloth, 0, 0.3, 0, P.torso);
    mesh(box(0.2, 0.1, 0.05), skin, 0.06, 0.45, -0.15, P.torso); // torn chest
    P.head = pivot(P.torso, 0, 0.62, -0.04);
    mesh(box(0.24, 0.28, 0.26), skin, 0, 0.1, 0, P.head);
    mesh(box(0.2, 0.08, 0.06), dark, 0, 0.0, -0.13, P.head); // open jaw
    mesh(sph(0.032), eye, -0.06, 0.13, -0.13, P.head);
    mesh(sph(0.032), eye, 0.06, 0.13, -0.13, P.head);
    for (const s of [-1, 1]) {
      const sh = pivot(P.torso, s * 0.3, 0.5, 0);
      mesh(cap(0.07, 0.3), cloth, 0, -0.2, 0, sh);
      const el = pivot(sh, 0, -0.42, 0);
      mesh(cap(0.06, 0.28), skin, 0, -0.18, 0, el);
      mesh(box(0.1, 0.12, 0.06), skin, 0, -0.4, 0, el);
      P[s < 0 ? "armL" : "armR"] = sh;
      P[s < 0 ? "foreL" : "foreR"] = el;
      const hip = pivot(P.hips, s * 0.12, -0.08, 0);
      mesh(cap(0.09, 0.32), cloth, 0, -0.22, 0, hip);
      const kn = pivot(hip, 0, -0.44, 0);
      mesh(cap(0.08, 0.3), cloth, 0, -0.2, 0, kn);
      mesh(box(0.12, 0.08, 0.24), dark, 0, -0.42, -0.04, kn);
      P[s < 0 ? "legL" : "legR"] = hip;
      P[s < 0 ? "shinL" : "shinR"] = kn;
    }
    P.armBase = -1.2; // reaching forward
  } else if (type === "creature") {
    // lean, digitigrade, long clawed arms, spine ridge
    P.hips = pivot(root, 0, 0.8, 0);
    mesh(box(0.3, 0.2, 0.3), skin, 0, 0, 0, P.hips);
    P.torso = pivot(P.hips, 0, 0.06, 0);
    P.torso.rotation.x = -0.9;
    mesh(box(0.42, 0.62, 0.26), skin, 0, 0.32, 0, P.torso);
    for (let i = 0; i < 4; i++) mesh(cone(0.05, 0.18), bone, 0, 0.12 + i * 0.15, 0.16, P.torso).rotation.x = 0.9;
    P.head = pivot(P.torso, 0, 0.68, -0.06);
    P.head.rotation.x = 0.7;
    mesh(box(0.22, 0.2, 0.36), skin, 0, 0.04, -0.08, P.head);
    mesh(box(0.2, 0.06, 0.2), dark, 0, -0.06, -0.18, P.head);
    for (let i = -2; i <= 2; i++) mesh(cone(0.015, 0.06), bone, i * 0.035, -0.04, -0.27, P.head).rotation.x = Math.PI;
    for (const s of [-1, 1]) mesh(sph(0.03), eye, s * 0.07, 0.08, -0.24, P.head);
    for (const s of [-1, 1]) {
      const sh = pivot(P.torso, s * 0.27, 0.55, 0);
      mesh(cap(0.06, 0.42), skin, 0, -0.26, 0, sh);
      const el = pivot(sh, 0, -0.56, 0);
      mesh(cap(0.05, 0.42), skin, 0, -0.24, 0, el);
      for (let k = -1; k <= 1; k++) {
        const cl = mesh(cone(0.022, 0.22), bone, k * 0.035, -0.56, -0.02, el);
        cl.rotation.x = Math.PI - 0.25;
      }
      P[s < 0 ? "armL" : "armR"] = sh;
      P[s < 0 ? "foreL" : "foreR"] = el;
      const hip = pivot(P.hips, s * 0.13, -0.05, 0);
      mesh(cap(0.08, 0.28), skin, 0, -0.18, 0, hip);
      const kn = pivot(hip, 0, -0.38, 0);
      kn.rotation.x = 0.6;
      mesh(cap(0.06, 0.3), skin, 0, -0.2, 0, kn);
      mesh(box(0.1, 0.06, 0.22), dark, 0, -0.38, -0.06, kn);
      P[s < 0 ? "legL" : "legR"] = hip;
      P[s < 0 ? "shinL" : "shinR"] = kn;
    }
    P.armBase = -0.4;
  } else {
    // brute: massive shoulders, iron mask, chains, small legs
    P.hips = pivot(root, 0, 1.15, 0);
    mesh(box(0.75, 0.35, 0.5), cloth, 0, 0, 0, P.hips);
    P.torso = pivot(P.hips, 0, 0.15, 0);
    P.torso.rotation.x = -0.25;
    mesh(box(1.1, 0.85, 0.66), skin, 0, 0.45, 0, P.torso);
    mesh(box(0.9, 0.3, 0.6), skin, 0, 0.98, 0.04, P.torso); // traps
    // chains across the chest
    const chainMat = metal;
    for (let i = 0; i < 6; i++) mesh(box(0.12, 0.06, 0.04), chainMat, -0.45 + i * 0.18, 0.2 + i * 0.1, -0.35, P.torso).rotation.z = 0.5;
    P.head = pivot(P.torso, 0, 1.1, -0.18);
    mesh(box(0.38, 0.42, 0.4), skin, 0, 0.1, 0, P.head);
    mesh(box(0.42, 0.3, 0.12), metal, 0, 0.1, -0.2, P.head); // iron mask
    for (let i = -1; i <= 1; i++) mesh(box(0.03, 0.22, 0.03), dark, i * 0.1, 0.06, -0.27, P.head);
    for (const s of [-1, 1]) mesh(sph(0.04), eye, s * 0.1, 0.18, -0.27, P.head);
    for (const s of [-1, 1]) {
      const sh = pivot(P.torso, s * 0.7, 0.8, 0);
      mesh(sph(0.28), skin, 0, 0, 0, sh);
      mesh(cap(0.2, 0.5), skin, 0, -0.4, 0, sh);
      const el = pivot(sh, 0, -0.78, 0);
      mesh(cap(0.19, 0.45), skin, 0, -0.3, 0, el);
      mesh(box(0.42, 0.36, 0.36), skin, 0, -0.7, 0, el); // huge fists
      mesh(cyl(0.24, 0.24, 0.12), metal, 0, -0.2, 0, el); // shackle
      P[s < 0 ? "armL" : "armR"] = sh;
      P[s < 0 ? "foreL" : "foreR"] = el;
      const hip = pivot(P.hips, s * 0.25, -0.12, 0);
      mesh(cap(0.17, 0.35), cloth, 0, -0.26, 0, hip);
      const kn = pivot(hip, 0, -0.52, 0);
      mesh(cap(0.15, 0.3), cloth, 0, -0.22, 0, kn);
      mesh(box(0.28, 0.14, 0.4), dark, 0, -0.46, -0.06, kn);
      P[s < 0 ? "legL" : "legR"] = hip;
      P[s < 0 ? "shinL" : "shinR"] = kn;
    }
    P.armBase = -0.15;
  }
  root.traverse((o) => {
    if (o.isMesh) o.frustumCulled = true;
  });
  return { root, parts: P, mats: [skin, cloth], type, torsoBase: P.torso.rotation.x };
}

/** pose a rig from the sim enemy state */
export function poseEnemy(rig, e, now) {
  const P = rig.parts;
  const t = e.walkPh;
  const sp = Math.min(1.4, e.speed / (e.type === "creature" ? 3 : 1.6));
  const sw = Math.sin(t * 2.2) * 0.65 * sp;
  // legs
  P.legL.rotation.x = sw;
  P.legR.rotation.x = -sw;
  P.shinL.rotation.x = (rig.type === "creature" ? 0.6 : 0) + Math.max(0, -Math.sin(t * 2.2)) * 0.8 * sp;
  P.shinR.rotation.x = (rig.type === "creature" ? 0.6 : 0) + Math.max(0, Math.sin(t * 2.2)) * 0.8 * sp;
  P.hips.position.y = (rig.type === "brute" ? 1.15 : rig.type === "creature" ? 0.8 : 0.95) - Math.abs(Math.sin(t * 2.2)) * 0.05 * sp;
  // arms
  let aL = rig.parts.armBase - sw * 0.5, aR = rig.parts.armBase + sw * 0.5;
  let fL = -0.3, fR = -0.3;
  let torso = rig.torsoBase;
  const idleSway = Math.sin(now * 1.3 + e.id) * 0.06;
  if (e.state === "idle") {
    aL = -0.1 + idleSway;
    aR = -0.2 - idleSway;
    fL = fR = -0.2;
    torso += 0.15 + Math.sin(now * 0.8 + e.id) * 0.05;
  }
  if (e.state === "windup") {
    const k = Math.min(1, e.stateT / (e.D.windup / (e.enraged ? 1.25 : 1)));
    if (rig.type === "brute") {
      aL = aR = -2.8 * k; // both fists overhead
      fL = fR = -0.6 * k;
      torso = rig.torsoBase + 0.35 * k;
    } else {
      aR = -2.4 * k;
      fR = -1.0 * k;
      aL = -0.6;
      torso = rig.torsoBase + 0.2 * k;
    }
  } else if (e.state === "recover") {
    const k = Math.max(0, 1 - e.stateT / 0.35);
    if (rig.type === "brute") {
      aL = aR = -1.2 * k;
      torso = rig.torsoBase - 0.3 * k;
    } else {
      aR = -0.6 * k - 0.4;
      fR = -0.1;
      torso = rig.torsoBase - 0.25 * k;
    }
  }
  // hit flinch
  if (e.hitT < 0.22) {
    const k = 1 - e.hitT / 0.22;
    torso += 0.45 * k;
    P.head.rotation.z = Math.sin(e.id * 7) * 0.4 * k;
  } else P.head.rotation.z *= 0.9;
  if (e.stagger > 0) {
    torso += 0.25 + Math.sin(now * 18) * 0.08;
    aL = 0.3;
    aR = 0.3;
  }
  P.armL.rotation.x = aL;
  P.armR.rotation.x = aR;
  P.armL.rotation.z = 0.15;
  P.armR.rotation.z = -0.15;
  P.foreL.rotation.x = fL;
  P.foreR.rotation.x = fR;
  P.torso.rotation.x = torso;
  if (rig.type === "infected") P.head.rotation.x = Math.sin(now * 2 + e.id) * 0.1;
  // emissive hit flash
  const flash = e.hitT < 0.12 ? 1 - e.hitT / 0.12 : 0;
  const enr = e.enraged ? 0.18 + Math.sin(now * 8) * 0.08 : 0;
  for (const m of rig.mats) m.emissive.setRGB(flash * 0.9 + enr, flash * 0.12, flash * 0.08);
  // spawn: rise from a crouch
  const rise = e.spawnT > 0 ? 1 - e.spawnT / 0.6 : 1;
  rig.root.scale.y = 0.4 + 0.6 * Math.max(0, Math.min(1, rise));
  // death: topple backwards and sink later
  if (!e.alive) {
    const k = Math.min(1, e.deadT / 0.55);
    const ease = 1 - (1 - k) * (1 - k);
    rig.root.rotation.x = ease * 1.45;
    rig.root.position.y = -Math.max(0, e.deadT - 8) * 0.12 + ease * 0.12;
    torso = rig.torsoBase;
    P.armL.rotation.x = -2.6 * ease;
    P.armR.rotation.x = -2.4 * ease;
    for (const m of rig.mats) m.emissive.setRGB(0, 0, 0);
  } else rig.root.rotation.x = 0;
}

export function disposeEnemy(rig) {
  for (const m of rig.mats) m.dispose();
}

/* ================================================================ first-person */
export function makeViewmodel() {
  const root = new THREE.Group();
  const sleeve = new THREE.MeshStandardMaterial({ map: clothTexture("jumpsuit"), roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const gun = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.4, metalness: 0.35 });
  const gunLight = new THREE.MeshStandardMaterial({ color: 0x6a6e75, roughness: 0.35, metalness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });

  const arm = (side) => {
    const g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.42, 10), sleeve, 0, 0, 0.18, g).rotation.x = Math.PI / 2;
    const hand = mesh(new THREE.BoxGeometry(0.085, 0.07, 0.11), skin, 0, 0, -0.06, g);
    hand.name = "hand";
    mesh(new THREE.BoxGeometry(0.09, 0.03, 0.04), skin, 0, -0.03, -0.12, g); // knuckles
    g.userData.side = side;
    return g;
  };
  // pistol
  const pistol = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.05, 0.055, 0.24), gun, 0, 0.03, -0.1, pistol); // slide
  mesh(new THREE.BoxGeometry(0.045, 0.03, 0.2), gunLight, 0, -0.005, -0.08, pistol);
  mesh(new THREE.BoxGeometry(0.042, 0.12, 0.06), grip, 0, -0.06, 0.0, pistol).rotation.x = 0.25;
  mesh(new THREE.BoxGeometry(0.012, 0.015, 0.012), gunLight, 0, 0.065, -0.2, pistol); // sight
  const pMuzzle = pivot(pistol, 0, 0.03, -0.24);
  // shotgun
  const shotgun = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8), gun, 0, 0.04, -0.3, shotgun).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), gun, 0, 0.0, -0.25, shotgun).rotation.x = Math.PI / 2;
  const pump = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), wood, 0, 0.005, -0.32, shotgun);
  mesh(new THREE.BoxGeometry(0.055, 0.075, 0.2), gun, 0, 0.02, 0.02, shotgun); // receiver
  mesh(new THREE.BoxGeometry(0.045, 0.08, 0.26), wood, 0, -0.02, 0.22, shotgun).rotation.x = -0.15; // stock
  const sMuzzle = pivot(shotgun, 0, 0.04, -0.62);

  const armR = arm(1);
  const armL = arm(-1);
  root.add(armR, armL, pistol, shotgun);
  // muzzle flash sprite
  const flashMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.22, 0.22, 1);
  flash.visible = false;
  root.add(flash);
  return { root, pistol, shotgun, armR, armL, pump, flash, flashMat, muzzles: { pistol: pMuzzle, shotgun: sMuzzle }, mats: [sleeve, skin, gun, gunLight, wood, grip, flashMat] };
}

/* ================================================================ pickups */
export function makeItem(kind) {
  const g = new THREE.Group();
  const glowCol = { a: 0xffd36a, o: 0xff6a4a, h: 0x6aff8a, m: 0xff5a5a, k: 0x5ab8ff, S: 0xffc060 }[kind] || 0xffffff;
  const halo = new THREE.Sprite(M(`halo:${kind}`, () => new THREE.SpriteMaterial({ map: glowTexture(), color: glowCol, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
  halo.scale.set(0.9, 0.9, 1);
  halo.position.y = 0.25;
  g.add(halo);
  const body = new THREE.Group();
  g.add(body);
  const std = (key, col, opt = {}) => M(key, () => new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, ...opt }));
  if (kind === "a") {
    mesh(box(0.32, 0.16, 0.2), std("ammoBox", 0x4d5a2a), 0, 0.08, 0, body);
    mesh(box(0.33, 0.04, 0.21), std("ammoStrip", 0xd8b13a, { emissive: 0x6a5010 }), 0, 0.12, 0, body);
  } else if (kind === "o") {
    mesh(box(0.26, 0.14, 0.18), std("shellBox", 0x8a2418), 0, 0.07, 0, body);
    for (let i = 0; i < 4; i++) mesh(cyl(0.025, 0.025, 0.09, 8), std("shell", 0xd04a2a, { emissive: 0x401008 }), -0.09 + i * 0.06, 0.19, 0, body);
  } else if (kind === "h" || kind === "m") {
    const big = kind === "m";
    const s = big ? 1.3 : 1;
    mesh(box(0.34 * s, 0.2 * s, 0.24 * s), std("medBox", 0xe8e6e0), 0, 0.1 * s, 0, body);
    const red = std("medRed", 0xd01818, { emissive: 0x500000 });
    mesh(box(0.06 * s, 0.205 * s, 0.16 * s), red, 0, 0.1 * s, 0, body);
    mesh(box(0.16 * s, 0.205 * s, 0.06 * s), red, 0, 0.1 * s, 0, body);
    if (big) mesh(box(0.2, 0.04, 0.04), std("handle", 0x333333), 0, 0.3, 0, body);
  } else if (kind === "k") {
    mesh(box(0.2, 0.012, 0.13), std("card", 0x2a6ad8, { emissive: 0x0a2a6a }), 0, 0.12, 0, body).rotation.x = 0.3;
  } else if (kind === "S") {
    const gun = std("sgun", 0x3a3d42, { metalness: 0.35, roughness: 0.4 });
    const wood = std("swood", 0x5b3a22);
    mesh(cyl(0.025, 0.025, 0.75, 8), gun, 0, 0.18, -0.05, body).rotation.x = Math.PI / 2;
    mesh(box(0.07, 0.09, 0.22), gun, 0, 0.16, 0.38, body);
    mesh(box(0.06, 0.1, 0.32), wood, 0, 0.13, 0.62, body);
    mesh(box(0.07, 0.06, 0.18), wood, 0, 0.15, 0.08, body);
    body.rotation.y = 0.6;
  }
  return { root: g, body, halo };
}

/* ================================================================ furniture */
export function makeDeco(kind, axis, R) {
  const g = new THREE.Group();
  const std = (key, col, opt = {}) => M(key, () => new THREE.MeshStandardMaterial({ color: col, roughness: 0.8, ...opt }));
  const metal = std("dmetal", 0x6a6d70, { metalness: 0.35, roughness: 0.5 });
  const rust = std("drust", 0x6a4028, { metalness: 0.4, roughness: 0.8 });
  if (kind === "B") {
    // bunk bed
    const frame = R() < 0.5 ? metal : rust;
    for (const [x, z] of [[-0.42, -0.9], [0.42, -0.9], [-0.42, 0.9], [0.42, 0.9]]) mesh(box(0.06, 1.6, 0.06), frame, x, 0.8, z, g);
    for (const y of [0.4, 1.25]) {
      mesh(box(0.9, 0.06, 1.85), frame, 0, y, 0, g);
      const mat = mesh(box(0.82, 0.12, 1.75), std("mattress", 0x6e6858), 0, y + 0.09, 0, g);
      mat.rotation.y = (R() - 0.5) * 0.1;
    }
    if (axis === "x") g.rotation.y = Math.PI / 2;
  } else if (kind === "t") {
    const top = std("desk", 0x4a4a46, { metalness: 0.3 });
    const t = mesh(box(1.3, 0.06, 0.8), top, 0, 0.78, 0, g);
    t.rotation.z = R() < 0.25 ? 0.12 : 0;
    for (const [x, z] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) mesh(box(0.05, 0.78, 0.05), metal, x, 0.39, z, g);
    if (R() < 0.6) mesh(box(0.42, 0.3, 0.08), std("monitor", 0x1a1a1a), -0.2, 0.96, -0.1, g); // old monitor
    if (R() < 0.6) mesh(box(0.3, 0.02, 0.22), std("paper", 0xc8c0a8), 0.3, 0.82, 0.1, g).rotation.y = R();
    g.rotation.y = (R() - 0.5) * 0.6;
  } else if (kind === "r") {
    const wood = std("crate", 0x6a5236);
    const s = 0.7 + R() * 0.35;
    mesh(box(s, s, s), wood, 0, s / 2, 0, g).rotation.y = R();
    if (R() < 0.6) mesh(box(s * 0.6, s * 0.6, s * 0.6), wood, 0.1, s + s * 0.3, 0.05, g).rotation.y = R();
    for (let i = 0; i < 4; i++) mesh(box(0.2 + R() * 0.3, 0.08, 0.15), std("rubble", 0x5a5852), (R() - 0.5) * 1.1, 0.04, (R() - 0.5) * 1.1, g).rotation.y = R() * 3;
  } else if (kind === "l") {
    const lk = std("locker", 0x4d6570, { metalness: 0.3, roughness: 0.55 });
    for (let i = -1; i <= 1; i++) {
      mesh(box(0.42, 1.9, 0.5), lk, i * 0.45, 0.95, 0, g);
      mesh(box(0.3, 0.04, 0.02), std("vent", 0x1a1a1a), i * 0.45, 1.6, -0.26, g);
    }
    if (axis === "x") g.rotation.y = Math.PI / 2;
  }
  return g;
}

export function disposeModels() {
  for (const g of geo.values()) g.dispose();
  geo.clear();
  for (const m of sharedMats.values()) m.dispose();
  sharedMats.clear();
}
