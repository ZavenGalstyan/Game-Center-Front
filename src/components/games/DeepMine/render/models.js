/**
 * Low-poly models built from primitives: the three creature rigs, the
 * first-person weapons, pickups, mine props and the mine cart. Geometries
 * and most materials are shared; enemy materials are cloned per enemy only
 * so hit flashes stay individual. All rigs face −Z (yaw 0), matching the sim.
 */
import * as THREE from "three";
import { skinTexture, clothTexture, glowTexture, timberTexture, rustTexture } from "./textures.js";

const geo = new Map();
function G(key, make) {
  if (!geo.has(key)) geo.set(key, make());
  return geo.get(key);
}
const box = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cap = (r, l) => G(`c${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 8));
const sph = (r, a = 12, b = 10) => G(`s${r},${a},${b}`, () => new THREE.SphereGeometry(r, a, b));
const cyl = (rt, rb, h, n = 10) => G(`y${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const cone = (r, h, n = 8) => G(`k${r},${h},${n}`, () => new THREE.ConeGeometry(r, h, n));
const dodeca = (r) => G(`d${r}`, () => new THREE.DodecahedronGeometry(r, 0));
const octa = (r) => G(`o${r}`, () => new THREE.OctahedronGeometry(r, 0));

const sharedMats = new Map();
function M(key, make) {
  if (!sharedMats.has(key)) sharedMats.set(key, make());
  return sharedMats.get(key);
}
const std = (key, col, opt = {}) => M(key, () => new THREE.MeshStandardMaterial({ color: col, roughness: 0.75, ...opt }));
const basic = (key, col, opt = {}) => M(key, () => new THREE.MeshBasicMaterial({ color: col, ...opt }));
const timber = () => M("timber", () => new THREE.MeshStandardMaterial({ map: timberTexture(), roughness: 0.9 }));
const rust = (col) => M(`rust${col}`, () => new THREE.MeshStandardMaterial({ map: rustTexture(col), roughness: 0.7, metalness: 0.35 }));

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

/* ================================================================ creatures */
export function makeEnemy(type) {
  const flashy = [];
  const own = (m) => (flashy.push(m), m);
  const root = new THREE.Group();
  const P = {};
  const dark = std("dark", 0x15120f, { roughness: 0.9 });
  const crystal = std("crystalFlesh", 0x5ad8ff, { emissive: 0x1a6080, roughness: 0.3 });
  const limbs = (upper, lower, hand, foot, o) => {
    for (const s of [-1, 1]) {
      const sh = pivot(P.torso, s * o.sw, o.sy, 0);
      mesh(cap(o.ar, o.al), upper, 0, -o.al * 0.6, 0, sh);
      const el = pivot(sh, 0, -o.al * 1.3, 0);
      mesh(cap(o.ar * 0.85, o.al * (s > 0 && o.longR ? 1.5 : 0.95)), lower, 0, -o.al * (s > 0 && o.longR ? 0.75 : 0.5), 0, el);
      mesh(o.claw ? cone(o.ar * 1.2, o.ar * 4) : sph(o.ar * 1.3), hand, 0, -o.al * (s > 0 && o.longR ? 1.6 : 1.1), -0.02, el).rotation.x = o.claw ? Math.PI : 0;
      P[s < 0 ? "armL" : "armR"] = sh;
      P[s < 0 ? "foreL" : "foreR"] = el;
      const hip = pivot(P.hips, s * o.hw, -0.06, 0);
      mesh(cap(o.lr, o.ll), upper, 0, -o.ll * 0.65, 0, hip);
      const kn = pivot(hip, 0, -o.ll * 1.35, 0);
      mesh(cap(o.lr * 0.9, o.ll * 0.9), lower, 0, -o.ll * 0.55, 0, kn);
      mesh(box(o.fw, o.fh, o.fl), foot, 0, -o.ll * 1.2, -o.fl * 0.25, kn);
      P[s < 0 ? "legL" : "legR"] = hip;
      P[s < 0 ? "shinL" : "shinR"] = kn;
    }
  };
  if (type === "miner") {
    // a mutated night-shift worker: overalls, hard hat with a dead lamp, one swollen arm
    const suit = own(new THREE.MeshStandardMaterial({ map: clothTexture("overalls"), roughness: 0.9 }));
    const skin = own(new THREE.MeshStandardMaterial({ map: skinTexture("miner"), roughness: 0.75 }));
    const helmet = std("helmet", 0xc89a2a, { roughness: 0.45 });
    P.hips = pivot(root, 0, 0.92, 0);
    mesh(box(0.38, 0.22, 0.24), suit, 0, 0, 0, P.hips);
    P.torso = pivot(P.hips, 0, 0.1, 0);
    P.torso.rotation.x = -0.35;
    mesh(box(0.46, 0.56, 0.28), suit, 0, 0.3, 0, P.torso);
    for (let i = 0; i < 4; i++) mesh(octa(0.05 + (i % 2) * 0.03), crystal, -0.15 + i * 0.1, 0.5 - (i % 2) * 0.1, 0.15, P.torso); // crystals through the back
    P.head = pivot(P.torso, 0, 0.64, -0.04);
    mesh(box(0.24, 0.28, 0.26), skin, 0, 0.1, 0, P.head);
    mesh(box(0.2, 0.09, 0.06), dark, 0, -0.01, -0.13, P.head); // slack jaw
    mesh(cyl(0.17, 0.19, 0.13, 12), helmet, 0, 0.27, 0, P.head);
    mesh(cyl(0.22, 0.22, 0.02, 14), helmet, 0, 0.22, 0, P.head);
    mesh(cyl(0.04, 0.04, 0.05, 8), std("lampDead", 0x2a2a20), 0, 0.27, -0.18, P.head).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) mesh(sph(0.03), basic("eyeMiner", 0x9af0ff), s * 0.06, 0.13, -0.13, P.head);
    limbs(suit, skin, skin, dark, { sw: 0.3, sy: 0.5, ar: 0.07, al: 0.3, hw: 0.12, lr: 0.09, ll: 0.32, fw: 0.13, fh: 0.09, fl: 0.26, longR: true, claw: false });
    P.armBase = -1.1;
  } else if (type === "crawler") {
    // low, pale, many-jointed thing that runs on all fours
    const skin = own(new THREE.MeshStandardMaterial({ map: skinTexture("crawler"), roughness: 0.6 }));
    const bone = std("bone", 0xd8ccb0, { roughness: 0.6 });
    P.hips = pivot(root, 0, 0.62, 0.25);
    mesh(box(0.34, 0.2, 0.32), skin, 0, 0, 0, P.hips);
    P.torso = pivot(P.hips, 0, 0.04, 0);
    P.torso.rotation.x = -1.3;
    mesh(box(0.4, 0.66, 0.26), skin, 0, 0.32, 0, P.torso);
    for (let i = 0; i < 5; i++) mesh(cone(0.04, 0.16, 5), bone, 0, 0.1 + i * 0.13, 0.15, P.torso).rotation.x = 1.0;
    P.head = pivot(P.torso, 0, 0.7, -0.04);
    P.head.rotation.x = 1.1;
    mesh(box(0.24, 0.2, 0.34), skin, 0, 0.02, -0.08, P.head);
    mesh(box(0.22, 0.06, 0.2), dark, 0, -0.08, -0.17, P.head);
    for (let i = -2; i <= 2; i++) mesh(cone(0.015, 0.06), bone, i * 0.04, -0.06, -0.27, P.head).rotation.x = Math.PI;
    for (const s of [-1, 1]) for (const k of [0, 1]) mesh(sph(0.022), basic("eyeCrawler", 0xffe060), s * (0.05 + k * 0.05), 0.07 - k * 0.03, -0.24, P.head);
    limbs(skin, skin, bone, skin, { sw: 0.26, sy: 0.58, ar: 0.055, al: 0.4, hw: 0.14, lr: 0.07, ll: 0.28, fw: 0.09, fh: 0.05, fl: 0.18, claw: true });
    P.armBase = -0.2;
    P.crawl = true;
  } else {
    // the cave brute: hunched giant grown over with rock and crystal, a pickaxe in its back
    const skin = own(new THREE.MeshStandardMaterial({ map: skinTexture("brute"), roughness: 0.8 }));
    const rock = std("bruteRock", 0x4a4440, { roughness: 1, flatShading: true });
    const glow = new THREE.MeshBasicMaterial({ color: 0xff6a30 });
    flashy.push(glow);
    P.glowMat = glow;
    P.hips = pivot(root, 0, 1.3, 0);
    mesh(box(0.8, 0.4, 0.55), skin, 0, 0, 0, P.hips);
    P.torso = pivot(P.hips, 0, 0.15, 0);
    P.torso.rotation.x = -0.35;
    mesh(box(1.2, 0.95, 0.75), skin, 0, 0.5, 0, P.torso);
    mesh(box(1.0, 0.35, 0.65), skin, 0, 1.05, 0.05, P.torso);
    for (let i = 0; i < 9; i++) {
      const r = mesh(dodeca(0.16 + (i % 3) * 0.08), rock, -0.5 + (i % 5) * 0.25, 0.35 + Math.floor(i / 3) * 0.3, 0.32 + (i % 2) * 0.05, P.torso);
      r.rotation.set(i, i * 2, 0);
    }
    for (let i = 0; i < 5; i++) mesh(octa(0.09 + (i % 2) * 0.05), glow, -0.4 + i * 0.2, 1.1 + (i % 2) * 0.12, 0.25, P.torso); // glowing crystal ridge
    // pickaxe buried in the shoulder
    const pick = pivot(P.torso, 0.35, 1.05, 0.3);
    pick.rotation.set(0.6, 0, 0.5);
    mesh(cyl(0.035, 0.035, 0.9, 6), timber(), 0, 0.3, 0, pick);
    mesh(box(0.7, 0.08, 0.08), std("pickHead", 0x6a6a70, { metalness: 0.6, roughness: 0.4 }), 0, 0.72, 0, pick);
    P.head = pivot(P.torso, 0, 1.25, -0.25);
    mesh(box(0.42, 0.42, 0.44), skin, 0, 0.1, 0, P.head);
    mesh(box(0.46, 0.14, 0.2), dark, 0, -0.08, -0.2, P.head); // jaw
    for (const s of [-1, 1]) {
      mesh(sph(0.05), glow, s * 0.11, 0.15, -0.23, P.head);
      mesh(dodeca(0.12), rock, s * 0.22, 0.32, 0, P.head);
    }
    // the cracked remains of a hard hat, now part of the skull
    mesh(G("bruteHat", () => new THREE.SphereGeometry(0.28, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), std("helmet", 0xc89a2a, { roughness: 0.45 }), 0, 0.3, 0.02, P.head);
    for (const s of [-1, 1]) {
      const sh = pivot(P.torso, s * 0.75, 0.85, 0);
      mesh(dodeca(0.3), rock, 0, 0.05, 0, sh);
      mesh(cap(0.2, 0.55), skin, 0, -0.42, 0, sh);
      const el = pivot(sh, 0, -0.85, 0);
      mesh(cap(0.19, 0.5), skin, 0, -0.32, 0, el);
      mesh(dodeca(0.3), rock, 0, -0.78, 0, el); // stone fist
      P[s < 0 ? "armL" : "armR"] = sh;
      P[s < 0 ? "foreL" : "foreR"] = el;
      const hip = pivot(P.hips, s * 0.3, -0.12, 0);
      mesh(cap(0.18, 0.4), skin, 0, -0.3, 0, hip);
      const kn = pivot(hip, 0, -0.6, 0);
      mesh(cap(0.16, 0.36), skin, 0, -0.24, 0, kn);
      mesh(box(0.32, 0.16, 0.44), rock, 0, -0.52, -0.06, kn);
      P[s < 0 ? "legL" : "legR"] = hip;
      P[s < 0 ? "shinL" : "shinR"] = kn;
    }
    P.armBase = -0.25;
  }
  const emissive = flashy.filter((m) => m.emissive);
  return { root, parts: P, mats: flashy, emissive, type, torsoBase: P.torso.rotation.x, hipsY: P.hips.position.y };
}

export function poseEnemy(rig, e, now) {
  const P = rig.parts;
  const t = e.walkPh;
  const brute = rig.type === "brute";
  const sp = Math.min(1.4, e.speed / (rig.type === "crawler" ? 3.2 : brute ? 2 : 1.6));
  const sw = Math.sin(t * 2.2) * 0.65 * sp;
  P.legL.rotation.x = sw + (P.crawl ? 0.6 : 0);
  P.legR.rotation.x = -sw + (P.crawl ? 0.6 : 0);
  P.shinL.rotation.x = Math.max(0, -Math.sin(t * 2.2)) * 0.8 * sp + (P.crawl ? 0.4 : 0);
  P.shinR.rotation.x = Math.max(0, Math.sin(t * 2.2)) * 0.8 * sp + (P.crawl ? 0.4 : 0);
  P.hips.position.y = rig.hipsY + Math.abs(Math.sin(t * 2.2)) * (P.crawl ? 0.06 : 0.05) * sp;
  P.hips.rotation.z = rig.type === "miner" ? Math.sin(t * 1.1) * 0.08 * sp : 0;
  // crawlers walk on their arms too
  let aL = P.armBase - sw * (P.crawl ? 1 : 0.5), aR = P.armBase + sw * (P.crawl ? 1 : 0.5);
  let fL = P.crawl ? -0.5 : -0.3, fR = P.crawl ? -0.5 : -0.3;
  let zL = 0.15, zR = -0.15;
  let torso = rig.torsoBase;
  const idleSway = Math.sin(now * 1.3 + e.id) * 0.06;
  if (e.state === "idle") {
    aL = P.crawl ? -0.4 : -0.1 + idleSway;
    aR = P.crawl ? -0.4 : -0.2 - idleSway;
    torso += 0.08 + Math.sin(now * 0.8 + e.id) * 0.05;
    if (rig.type === "miner") P.head.rotation.z = Math.sin(now * 0.6 + e.id) * 0.3;
  }
  if (!brute) {
    if (e.state === "windup") {
      const k = Math.min(1, e.stateT / e.D.windup);
      if (P.crawl) {
        torso = rig.torsoBase + 0.5 * k; // rears up
        aL = aR = -1.6 * k;
      } else {
        aR = -2.5 * k;
        fR = -1.0 * k;
        aL = -0.6;
        torso = rig.torsoBase + 0.25 * k;
      }
    } else if (e.state === "recover") {
      const k = Math.max(0, 1 - e.stateT / 0.35);
      aR = -0.6 * k - 0.4;
      torso = rig.torsoBase - 0.3 * k;
    }
  } else {
    const s = e.state;
    const k = Math.min(1, e.stateT / 0.9);
    if (s === "slamWind") {
      aR = aL = -3.0 * k;
      fR = fL = -0.4 * k;
      torso = rig.torsoBase + 0.3 * k;
    } else if (s === "throwWind") {
      aR = -2.6 * k; // rips a rock from the floor
      fR = -0.8;
      aL = 0.3;
      torso = rig.torsoBase - 0.3 * (1 - k);
    } else if (s === "chargeWind") {
      torso = rig.torsoBase - 0.45 * k;
      aL = aR = 0.6 * k;
    } else if (s === "charge") {
      torso = rig.torsoBase - 0.55;
      aL = aR = 0.9;
    } else if (s === "dazed") {
      torso = rig.torsoBase + 0.3 + Math.sin(now * 6) * 0.08;
      P.head.rotation.z = Math.sin(now * 5) * 0.35;
      aL = aR = 0.2;
    } else if (s === "summon") {
      aL = aR = -2.6;
      zL = 0.8;
      zR = -0.8;
      torso = rig.torsoBase - 0.2 + Math.sin(now * 10) * 0.04;
    } else if (s === "recover") {
      const r = Math.max(0, 1 - e.stateT / 0.6);
      aL = aR = -0.6 * r;
      torso = rig.torsoBase - 0.3 * r;
    }
    if (s !== "dazed") P.head.rotation.z *= 0.9;
    const tele = s === "slamWind" || s === "throwWind" || s === "chargeWind" || s === "charge";
    const pulse = tele ? 0.6 + 0.4 * Math.sin(now * 20) : 0.45 + 0.1 * Math.sin(now * 2);
    P.glowMat.color.setRGB(1, 0.25 + pulse * 0.35, 0.1 * pulse);
  }
  if (e.hitT < 0.22) {
    const k = 1 - e.hitT / 0.22;
    torso += (brute ? 0.12 : 0.45) * k;
    P.head.rotation.z = Math.sin(e.id * 7) * 0.4 * k;
  } else if (e.state !== "idle" && !(brute && e.state === "dazed")) P.head.rotation.z *= 0.9;
  if (e.stagger > 0) {
    torso += 0.25 + Math.sin(now * 18) * 0.08;
    aL = aR = 0.3;
  }
  P.armL.rotation.x = aL;
  P.armR.rotation.x = aR;
  P.armL.rotation.z = zL;
  P.armR.rotation.z = zR;
  P.foreL.rotation.x = fL;
  P.foreR.rotation.x = fR;
  P.torso.rotation.x = torso;
  const flash = e.hitT < 0.12 ? 1 - e.hitT / 0.12 : 0;
  const burn = e.burnT > 0 ? 0.35 + Math.sin(now * 25) * 0.15 : 0;
  const enr = e.enraged ? 0.12 + Math.sin(now * 8) * 0.06 : 0;
  const daze = brute && e.dazed > 0 ? 0.25 + Math.sin(now * 12) * 0.15 : 0;
  for (const m of rig.emissive) m.emissive.setRGB(flash * 0.9 + burn + enr + daze, flash * 0.5 + burn * 0.4 + daze, flash * 0.4 + daze * 0.2);
  const rise = e.spawnT > 0 ? 1 - e.spawnT / 0.8 : 1;
  rig.root.scale.setScalar(0.3 + 0.7 * Math.max(0, Math.min(1, rise)));
  if (!e.alive) {
    const k = Math.min(1, e.deadT / 0.55);
    const ease = 1 - (1 - k) * (1 - k);
    rig.root.rotation.x = ease * (P.crawl ? 0 : 1.45);
    rig.root.rotation.z = P.crawl ? ease * 2.6 : 0;
    rig.root.position.y = -Math.max(0, e.deadT - 8) * 0.12 + ease * 0.12;
    P.armL.rotation.x = -2.6 * ease;
    P.armR.rotation.x = -2.4 * ease;
    for (const m of rig.emissive) m.emissive.setRGB(0, 0, 0);
  } else {
    rig.root.rotation.x = 0;
    rig.root.rotation.z = 0;
  }
}

export function disposeEnemy(rig) {
  for (const m of rig.mats) m.dispose();
}

/* ================================================================ first-person */
export function makeViewmodel() {
  const root = new THREE.Group();
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x5a4a32, roughness: 0.9 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.8 });
  const gun = new THREE.MeshStandardMaterial({ color: 0x34373c, roughness: 0.4, metalness: 0.45 });
  const gunLight = new THREE.MeshStandardMaterial({ color: 0x6a6e75, roughness: 0.35, metalness: 0.5 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.6 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xe0601a, roughness: 0.45 });
  const tape = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
  const glowM = new THREE.MeshBasicMaterial({ color: 0xff7a30 });

  const arm = () => {
    const g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.058, 0.07, 0.42, 10), sleeve, 0, 0, 0.18, g).rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.09, 0.075, 0.12), glove, 0, 0, -0.07, g);
    mesh(new THREE.BoxGeometry(0.095, 0.03, 0.04), glove, 0, -0.03, -0.13, g);
    return g;
  };
  // mining pistol: chunky service pistol with a lanyard ring
  const pistol = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.05, 0.06, 0.25), gun, 0, 0.03, -0.11, pistol);
  mesh(new THREE.BoxGeometry(0.046, 0.03, 0.2), gunLight, 0, -0.008, -0.08, pistol);
  mesh(new THREE.BoxGeometry(0.044, 0.13, 0.065), tape, 0, -0.06, 0.0, pistol).rotation.x = 0.25;
  mesh(new THREE.TorusGeometry(0.015, 0.004, 4, 8), gunLight, 0, -0.13, 0.03, pistol);
  const pMuzzle = pivot(pistol, 0, 0.03, -0.24);
  // pump shotgun
  const shotgun = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), gun, 0, 0.04, -0.3, shotgun).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), gun, 0, 0.0, -0.25, shotgun).rotation.x = Math.PI / 2;
  const pump = mesh(new THREE.BoxGeometry(0.052, 0.05, 0.16), wood, 0, 0.005, -0.32, shotgun);
  mesh(new THREE.BoxGeometry(0.056, 0.075, 0.2), gun, 0, 0.02, 0.02, shotgun);
  mesh(new THREE.BoxGeometry(0.046, 0.085, 0.26), wood, 0, -0.02, 0.22, shotgun).rotation.x = -0.15;
  const sMuzzle = pivot(shotgun, 0, 0.04, -0.62);
  // experimental flare gun: fat orange barrel, metal clamps, glowing chamber window
  const flare = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.32, 14), orange, 0, 0.04, -0.2, flare).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14), gunLight, 0, 0.04, -0.36, flare).rotation.x = Math.PI / 2;
  for (const z of [-0.1, -0.26]) mesh(new THREE.TorusGeometry(0.048, 0.008, 6, 14), gunLight, 0, 0.04, z, flare);
  mesh(new THREE.BoxGeometry(0.06, 0.07, 0.12), orange, 0, 0.03, -0.0, flare);
  const chamber = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.06), glowM, 0.031, 0.05, -0.02, flare);
  mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), tape, 0, -0.07, 0.04, flare).rotation.x = 0.25;
  const fMuzzle = pivot(flare, 0, 0.04, -0.38);

  const armR = arm();
  const armL = arm();
  root.add(armR, armL, pistol, shotgun, flare);
  const flashMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.22, 0.22, 1);
  flash.visible = false;
  root.add(flash);
  return {
    root,
    guns: { pistol, shotgun, flare },
    armR,
    armL,
    pump,
    chamber,
    glowM,
    flash,
    flashMat,
    muzzles: { pistol: pMuzzle, shotgun: sMuzzle, flare: fMuzzle },
    mats: [sleeve, glove, gun, gunLight, wood, orange, tape, glowM, flashMat],
  };
}

/* ================================================================ pickups */
export const ITEM_GLOW = { a: 0xffd36a, s: 0xff6a4a, f: 0xff7a30, h: 0x6aff8a, b: 0x7ad8ff, k: 0xffe070, u: 0xff9a2a, x: 0xc0c8d0, G: 0xffd36a, S: 0xffc060, Y: 0xff7a30 };
export function makeItem(kind) {
  const g = new THREE.Group();
  const halo = new THREE.Sprite(M(`halo:${kind}`, () => new THREE.SpriteMaterial({ map: glowTexture(), color: ITEM_GLOW[kind] || 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
  halo.scale.set(0.95, 0.95, 1);
  halo.position.y = 0.25;
  g.add(halo);
  const body = new THREE.Group();
  g.add(body);
  if (kind === "a") {
    mesh(box(0.32, 0.16, 0.2), std("ammoBox", 0x4d5a2a), 0, 0.08, 0, body);
    mesh(box(0.33, 0.04, 0.21), std("ammoStrip", 0xd8b13a, { emissive: 0x6a5010 }), 0, 0.12, 0, body);
  } else if (kind === "s") {
    mesh(box(0.26, 0.14, 0.18), std("shellBox", 0x8a2418), 0, 0.07, 0, body);
    for (let i = 0; i < 4; i++) mesh(cyl(0.025, 0.025, 0.09, 8), std("shell", 0xd04a2a, { emissive: 0x401008 }), -0.09 + i * 0.06, 0.19, 0, body);
  } else if (kind === "f") {
    for (let i = 0; i < 3; i++) {
      mesh(cyl(0.035, 0.035, 0.22, 10), std("flareTube", 0xe0601a, { emissive: 0x401000 }), -0.06 + i * 0.06, 0.13, 0, body);
      mesh(cyl(0.036, 0.036, 0.04, 10), basic("flareCap", 0xffb060), -0.06 + i * 0.06, 0.25, 0, body);
    }
  } else if (kind === "h") {
    mesh(box(0.34, 0.2, 0.24), std("medBox", 0xe8e6e0), 0, 0.1, 0, body);
    const red = std("medRed", 0xd01818, { emissive: 0x500000 });
    mesh(box(0.06, 0.205, 0.16), red, 0, 0.1, 0, body);
    mesh(box(0.16, 0.205, 0.06), red, 0, 0.1, 0, body);
  } else if (kind === "b") {
    mesh(box(0.14, 0.24, 0.1), std("battery", 0x2a2a30, { metalness: 0.3 }), 0, 0.14, 0, body);
    mesh(box(0.145, 0.06, 0.105), basic("batteryBand", 0x7ad8ff), 0, 0.16, 0, body);
    mesh(cyl(0.02, 0.02, 0.03, 8), std("battTop", 0xc0c0c0, { metalness: 0.6 }), 0, 0.28, 0, body);
  } else if (kind === "k") {
    const brass = std("brass", 0xd8b04a, { metalness: 0.7, roughness: 0.3, emissive: 0x3a2a00 });
    mesh(G("keyRing", () => new THREE.TorusGeometry(0.06, 0.018, 6, 14)), brass, 0, 0.22, 0, body);
    mesh(box(0.025, 0.2, 0.02), brass, 0, 0.08, 0, body);
    mesh(box(0.06, 0.025, 0.02), brass, 0.03, 0.02, 0, body);
    mesh(box(0.045, 0.025, 0.02), brass, 0.022, 0.06, 0, body);
  } else if (kind === "u") {
    mesh(box(0.26, 0.34, 0.14), std("jerry", 0xb01c14, { roughness: 0.5 }), 0, 0.17, 0, body);
    mesh(box(0.08, 0.06, 0.1), std("jerryCap", 0x2a2a2a), 0.07, 0.37, 0, body);
    mesh(box(0.16, 0.03, 0.04), std("jerryCap", 0x2a2a2a), -0.03, 0.36, 0, body);
  } else if (kind === "x") {
    const steel = std("gear", 0xa0a8b0, { metalness: 0.75, roughness: 0.35 });
    const gear = new THREE.Group();
    gear.position.y = 0.24;
    body.add(gear);
    mesh(G("gearBody", () => new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16)), steel, 0, 0, 0, gear).rotation.x = Math.PI / 2;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const t = mesh(box(0.05, 0.05, 0.05), steel, Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0, gear);
      t.rotation.z = a;
    }
    mesh(cyl(0.04, 0.04, 0.07, 8), std("gearHub", 0x3a3a3a), 0, 0, 0, gear).rotation.x = Math.PI / 2;
  } else if (kind === "G") {
    mesh(box(0.06, 0.07, 0.3), std("pgun", 0x34373c, { metalness: 0.45, roughness: 0.4 }), 0, 0.2, 0, body);
    mesh(box(0.05, 0.16, 0.07), std("ptape", 0x1a1a1a), 0, 0.12, 0.12, body).rotation.x = 0.25;
    body.rotation.y = 0.6;
  } else if (kind === "S") {
    const gun = std("sgun", 0x34373c, { metalness: 0.4, roughness: 0.4 });
    const wood = std("swood", 0x5b3a22);
    mesh(cyl(0.025, 0.025, 0.75, 8), gun, 0, 0.18, -0.05, body).rotation.x = Math.PI / 2;
    mesh(box(0.07, 0.09, 0.22), gun, 0, 0.16, 0.38, body);
    mesh(box(0.06, 0.1, 0.32), wood, 0, 0.13, 0.62, body);
    mesh(box(0.07, 0.06, 0.18), wood, 0, 0.15, 0.08, body);
    body.rotation.y = 0.6;
  } else if (kind === "Y") {
    mesh(cyl(0.06, 0.06, 0.4, 12), std("fgun", 0xe0601a), 0, 0.2, 0, body).rotation.x = Math.PI / 2;
    mesh(box(0.06, 0.16, 0.08), std("ptape", 0x1a1a1a), 0, 0.1, 0.16, body).rotation.x = 0.25;
    body.rotation.y = 0.6;
  }
  return { root: g, body, halo };
}

/** a worker's note: a paper sheet on an upturned crate */
export function makeNote() {
  const g = new THREE.Group();
  mesh(box(0.6, 0.5, 0.5), timber(), 0, 0.25, 0, g);
  const paper = mesh(box(0.28, 0.01, 0.36), std("paper", 0xe8e0c8, { emissive: 0x2a2618 }), 0, 0.51, 0, g);
  paper.rotation.y = 0.3;
  const halo = new THREE.Sprite(M("noteHalo", () => new THREE.SpriteMaterial({ map: glowTexture(), color: 0xfff0b0, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })));
  halo.scale.set(0.8, 0.8, 1);
  halo.position.y = 0.6;
  g.add(halo);
  return { root: g, halo };
}

/* ================================================================ props */
export function makeDeco(kind, axis, R, theme) {
  const g = new THREE.Group();
  if (kind === "r") {
    const rock = std(`rubble${theme.rock}`, theme.rock === "blue" ? 0x3a4458 : theme.rock === "sand" ? 0x6a5a44 : 0x4a443e, { roughness: 1, flatShading: true });
    for (let i = 0; i < 6; i++) {
      const s = 0.25 + R() * 0.4;
      const m = mesh(dodeca(s), rock, (R() - 0.5) * 1.2, s * 0.6, (R() - 0.5) * 1.2, g);
      m.rotation.set(R() * 3, R() * 3, R() * 3);
    }
    // a broken support beam in the pile
    const beam = mesh(box(0.22, 0.22, 1.8), timber(), 0, 0.5, 0, g);
    beam.rotation.set(0.3, R() * 3, 0.2);
  } else if (kind === "t") {
    const top = mesh(box(1.3, 0.07, 0.8), timber(), 0, 0.78, 0, g);
    top.rotation.z = R() < 0.25 ? 0.1 : 0;
    for (const [x, z] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) mesh(box(0.07, 0.78, 0.07), timber(), x, 0.39, z, g);
    if (R() < 0.7) {
      mesh(cyl(0.08, 0.09, 0.18, 8), rust("#5a4a2a"), -0.3, 0.9, 0, g); // lantern
      mesh(sph(0.05), basic("tableLamp", 0xffb060), -0.3, 0.92, 0, g);
    }
    if (R() < 0.6) mesh(box(0.3, 0.02, 0.22), std("paper", 0xe8e0c8, { emissive: 0x2a2618 }), 0.3, 0.82, 0.1, g).rotation.y = R();
    g.rotation.y = (R() - 0.5) * 0.6;
  } else if (kind === "o") {
    if (R() < 0.55) {
      const s = 0.7 + R() * 0.3;
      mesh(box(s, s, s), timber(), 0, s / 2, 0, g).rotation.y = R();
      if (R() < 0.6) mesh(box(s * 0.65, s * 0.65, s * 0.65), timber(), 0.08, s + s * 0.32, 0.05, g).rotation.y = R();
    } else {
      const col = ["#3a5a4a", "#6a2a1a", "#3a4a6a"][Math.floor(R() * 3)];
      for (let i = 0; i < 2; i++) mesh(cyl(0.3, 0.3, 0.92, 12), rust(col), (i - 0.5) * 0.66, 0.46, (R() - 0.5) * 0.3, g);
    }
  } else if (kind === "M") {
    // industrial machinery: a housing, a big flywheel and pipes
    const body = rust("#4a5a50");
    mesh(box(1.7, 1.6, 1.4), body, 0, 0.8, 0, g);
    const wheel = mesh(G("flywheel", () => new THREE.TorusGeometry(0.55, 0.09, 8, 20)), std("steelDark", 0x3a3c40, { metalness: 0.7, roughness: 0.4 }), 0.9, 1.0, 0, g);
    wheel.rotation.y = Math.PI / 2;
    g.userData.spin = wheel;
    for (let i = 0; i < 3; i++) mesh(cyl(0.07, 0.07, 1.8, 8), rust("#6a4a2a"), -0.5 + i * 0.4, 2.3, 0, g);
    mesh(box(0.4, 0.3, 0.05), basic("gaugeGlow", 0xffc060), 0, 1.2, -0.72, g);
    if (axis === "z") g.rotation.y = Math.PI / 2;
  } else if (kind === "n") {
    // bunk bed or a canvas tent
    if (R() < 0.5) {
      for (const [x, z] of [[-0.42, -0.9], [0.42, -0.9], [-0.42, 0.9], [0.42, 0.9]]) mesh(box(0.07, 1.6, 0.07), timber(), x, 0.8, z, g);
      for (const y of [0.4, 1.25]) {
        mesh(box(0.9, 0.07, 1.85), timber(), 0, y, 0, g);
        mesh(box(0.82, 0.12, 1.75), std("mattress", 0x5e5848), 0, y + 0.09, 0, g).rotation.y = (R() - 0.5) * 0.1;
      }
    } else {
      const canvasM = std("tent", 0x5a5a40, { roughness: 1, side: THREE.DoubleSide, flatShading: true });
      const t = mesh(G("tent", () => new THREE.ConeGeometry(0.95, 1.7, 4, 1, true)), canvasM, 0, 0.85, 0, g);
      t.rotation.y = Math.PI / 4;
    }
    g.rotation.y = axis === "x" ? Math.PI / 2 : 0;
  } else if (kind === "l") {
    // lab specimen tank: green liquid and a floating silhouette
    mesh(cyl(0.55, 0.6, 0.3, 16), std("tankBase", 0x3a3e40, { metalness: 0.6, roughness: 0.4 }), 0, 0.15, 0, g);
    mesh(cyl(0.5, 0.5, 2.0, 16), std("tankGlass", 0x7affc0, { transparent: true, opacity: 0.32, emissive: 0x0a4a2a, roughness: 0.05 }), 0, 1.3, 0, g);
    mesh(cap(0.18, 0.7), std("specimen", 0x2a3a30, { roughness: 0.6 }), 0, 1.3, 0, g);
    mesh(cyl(0.55, 0.55, 0.2, 16), std("tankBase", 0x3a3e40, { metalness: 0.6, roughness: 0.4 }), 0, 2.4, 0, g);
    if (R() < 0.35) g.userData.broken = true;
  } else if (kind === "+") {
    const col = theme.crystal || 0x5ad8ff;
    const cm = M(`crys${col}`, () => new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.55), roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.88, flatShading: true }));
    for (let i = 0; i < 6; i++) {
      const h = 0.6 + R() * 1.4;
      const c = mesh(cone(0.12 + R() * 0.14, h, 6), cm, (R() - 0.5) * 0.9, h / 2, (R() - 0.5) * 0.9, g);
      c.rotation.set((R() - 0.5) * 0.7, R() * 3, (R() - 0.5) * 0.7);
    }
  } else if (kind === "g") {
    // diesel generator on skids
    const body = rust("#6a5a20");
    mesh(box(1.5, 0.12, 0.9), std("steelDark", 0x3a3c40, { metalness: 0.7, roughness: 0.4 }), 0, 0.06, 0, g);
    mesh(box(1.3, 0.9, 0.8), body, 0, 0.6, 0, g);
    mesh(cyl(0.3, 0.3, 0.9, 14), rust("#4a4a44"), 0.3, 0.75, 0, g).rotation.x = Math.PI / 2;
    mesh(cyl(0.06, 0.06, 0.8, 8), rust("#3a3a3a"), -0.45, 1.4, 0.2, g);
    const lamp = mesh(box(0.14, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2a1a }), -0.3, 0.85, -0.41, g);
    g.userData.lamp = lamp;
    g.userData.disposables = [lamp.material];
  } else if (kind === "V") {
    // elevator control console with a gear housing
    mesh(box(0.9, 1.2, 0.6), rust("#3a4a5a"), 0, 0.6, 0, g);
    mesh(box(0.7, 0.3, 0.05), std("panelFace", 0x1a1a1a), 0, 1.0, -0.31, g);
    const lamp = mesh(box(0.12, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2a1a }), 0.25, 1.25, -0.31, g);
    g.userData.lamp = lamp;
    g.userData.disposables = [lamp.material];
    for (let i = 0; i < 3; i++) mesh(cyl(0.12, 0.12, 0.05, 10), std("gearSlot", 0x0a0a0a), -0.22 + i * 0.22, 0.7, -0.31, g).rotation.x = Math.PI / 2;
  }
  return g;
}

/** rusty mine cart with wheels, rolling along X in its own frame */
export function makeCart() {
  const g = new THREE.Group();
  const body = rust("#5a3a24");
  mesh(box(1.1, 0.6, 1.4), body, 0, 0.62, 0, g);
  mesh(box(1.0, 0.05, 1.3), std("ore", 0x3a3430, { roughness: 1, flatShading: true }), 0, 0.88, 0, g);
  for (let i = 0; i < 5; i++) mesh(dodeca(0.16), std("oreRock", 0x4a443e, { roughness: 1, flatShading: true }), (i - 2) * 0.18, 0.95, (i % 2) * 0.2 - 0.1, g);
  const wheels = [];
  for (const x of [-0.5, 0.5])
    for (const z of [-0.45, 0.45]) {
      const w = mesh(cyl(0.17, 0.17, 0.08, 12), std("steelDark", 0x3a3c40, { metalness: 0.7, roughness: 0.4 }), x * 0.9, 0.17, z, g);
      w.rotation.z = Math.PI / 2;
      wheels.push(w);
    }
  return { root: g, wheels };
}

export function disposeModels() {
  for (const g of geo.values()) g.dispose();
  geo.clear();
  for (const m of sharedMats.values()) m.dispose();
  sharedMats.clear();
}
