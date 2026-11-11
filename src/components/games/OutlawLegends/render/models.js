/**
 * Procedural low-poly models: an articulated Western character (one rig,
 * many outfits), a horse, the four guns and the bigger props. Geometry and
 * materials are shared through small caches so a dozen gunmen cost little.
 *
 * poseRig(rig, st, dt) drives every joint from a plain state object (speed,
 * aim, melee, roll, death…) with critically-damped smoothing.
 */
import * as THREE from "three";

/* ------------------------------------------------------------ caches */
const geoCache = new Map();
const matCache = new Map();
export function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}
export function mat(color, { rough = 0.85, metal = 0, emissive = null, flat = true, map = null, transparent = false, opacity = 1, side = THREE.FrontSide } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${flat}|${map?.uuid || ""}|${transparent}|${opacity}|${side}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, flatShading: flat, map, transparent, opacity, side });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = 1;
    }
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}
export function disposeCaches() {
  for (const g of geoCache.values()) g.dispose();
  for (const m of matCache.values()) m.dispose();
  geoCache.clear();
  matCache.clear();
}
const BOX = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
const CYL = () => geo("cyl", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
const CYL6 = () => geo("cyl6", () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6));
const SPH = () => geo("sph", () => new THREE.SphereGeometry(0.5, 10, 8));
const CONE = () => geo("cone", () => new THREE.ConeGeometry(0.5, 1, 10));

export function box(color, w, h, d, opts) {
  const m = new THREE.Mesh(BOX(), typeof color === "string" ? mat(color, opts) : color);
  m.scale.set(w, h, d);
  m.castShadow = true;
  return m;
}
export function cyl(color, r, h, opts, six = false) {
  const m = new THREE.Mesh(six ? CYL6() : CYL(), typeof color === "string" ? mat(color, opts) : color);
  m.scale.set(r * 2, h, r * 2);
  m.castShadow = true;
  return m;
}
export function sph(color, r, opts) {
  const m = new THREE.Mesh(SPH(), typeof color === "string" ? mat(color, opts) : color);
  m.scale.setScalar(r * 2);
  m.castShadow = true;
  return m;
}
export function cone(color, r, h, opts) {
  const m = new THREE.Mesh(CONE(), typeof color === "string" ? mat(color, opts) : color);
  m.scale.set(r * 2, h, r * 2);
  m.castShadow = true;
  return m;
}
const at = (o, x, y, z) => {
  o.position.set(x, y, z);
  return o;
};

/* ------------------------------------------------------------ outfits */
/** skin, shirt, pants, boots, hat, band, vest, coat (null = none), scarf, extra flags */
export const LOOKS = {
  hero: { skin: "#c98f68", shirt: "#3f5f86", pants: "#4a3a2c", boots: "#3a2416", hat: "#8a6a44", band: "#3a2416", vest: null, coat: "#6e4a2c", scarf: "#a8402c", beard: "#5a3a22", hair: "#4a2e1a", scale: 1, belt: "#2a1a10" },
  bandit: { skin: "#b9805a", shirt: "#8c8476", pants: "#5a4a3a", boots: "#2f2016", hat: "#5a4632", band: "#2a1e14", vest: "#4a3a2a", coat: null, mask: "#a8302a", hair: "#2a1a10", scale: 1 },
  gunslinger: { skin: "#c48a62", shirt: "#7a2e2a", pants: "#2e2a28", boots: "#1e1612", hat: "#1e1a18", band: "#8a7a5a", vest: "#1c1a1a", coat: null, scarf: "#1c1a1a", hair: "#1a120c", scale: 1 },
  shotgunner: { skin: "#a87050", shirt: "#6a5a3c", pants: "#3e3628", boots: "#2a1c12", hat: "#6a5236", band: "#3a2a1a", vest: null, coat: "#4c3e2c", beard: "#3a2a1a", hair: "#3a2a1a", scale: 1.08 },
  marksman: { skin: "#c08a64", shirt: "#5e6a4c", pants: "#4a4232", boots: "#2a2016", hat: "#6e6a52", band: "#2a2a1e", vest: null, coat: null, poncho: "#7c6a46", hair: "#3a2a1a", wide: true, scale: 1 },
  brawler: { skin: "#c08660", shirt: "#d8cdb2", pants: "#3a3530", boots: "#2a1c14", hat: null, band: null, vest: null, coat: null, suspenders: "#5a2a1e", beard: "#6a3a1e", hair: null, bald: true, scale: 1.12, rolled: true },
  elite: { skin: "#b47c56", shirt: "#2c2a2e", pants: "#1e1c1e", boots: "#141010", hat: "#141212", band: "#a82a22", vest: null, coat: "#24201e", sash: "#b8281e", scarf: "#a82a22", hair: "#141010", scale: 1.04 },
  rider: { skin: "#b9805a", shirt: "#7a6a52", pants: "#4a3c2c", boots: "#2a1c12", hat: "#4a3a28", band: "#2a1e14", vest: "#3a2e22", coat: null, mask: "#2e4a7a", hair: "#2a1a10", scale: 1 },
  boss: { skin: "#c08a64", shirt: "#e8e2d4", pants: "#1a1818", boots: "#0e0a08", hat: "#0e0c0c", band: "#c8c8c8", vest: "#3a1418", coat: "#121010", scarf: "#8a1a1a", beard: "#2a2420", hair: "#2a2420", scale: 1.12 },
  brute: { skin: "#b07a54", shirt: "#7a5a3a", pants: "#3a3a44", boots: "#2a1c14", hat: null, band: null, vest: null, coat: null, overalls: "#3e4a62", beard: "#3a2414", bald: true, scale: 1.3, rolled: true },
  sheriff: { skin: "#d39c76", shirt: "#c9b48a", pants: "#4a3c30", boots: "#3a2416", hat: "#c8b08a", band: "#5a3a22", vest: "#5a4632", coat: null, badge: true, hair: "#8a4a22", braid: true, scale: 0.97 },
  bartender: { skin: "#d6a07a", shirt: "#ece6d6", pants: "#2a2624", boots: "#1a1410", hat: "bowler", band: null, vest: "#5a1e1e", coat: null, apron: "#f0ece0", beard: "#4a2a18", hair: "#4a2a18", scale: 1 },
  townsman: { skin: "#c99470", shirt: "#8aa0b8", pants: "#5a4a3a", boots: "#3a2a1a", hat: "#a08a62", band: "#4a3a2a", vest: "#6a5a48", coat: null, beard: "#c8c0b0", hair: "#c8c0b0", scale: 1 },
  townswoman: { skin: "#d8a684", shirt: "#7a3e5a", pants: "#7a3e5a", boots: "#2a1a12", hat: null, band: null, vest: null, coat: null, dress: "#6a3450", hair: "#5a2e1a", braid: true, scale: 0.95 },
  miner: { skin: "#c08a64", shirt: "#8a6a4a", pants: "#3e4a62", boots: "#2a1c14", hat: "#5a4a3a", band: null, vest: null, coat: null, overalls: "#3e4a62", beard: "#4a3020", hair: "#4a3020", scale: 1 },
  conductor: { skin: "#d39c76", shirt: "#ece6d6", pants: "#1e2a4a", boots: "#141010", hat: "cap", band: null, vest: "#1e2a4a", coat: "#1e2a4a", beard: "#d8d0c0", hair: "#d8d0c0", scale: 1 },
  kate: { skin: "#d8a07a", shirt: "#a8302a", pants: "#3a2a20", boots: "#2a1a10", hat: "#7a5232", band: "#d8c08a", vest: "#4a2e1e", coat: null, scarf: "#e8d8b0", hair: "#8a3a1a", braid: true, scale: 0.98 },
  twin: { skin: "#b07650", shirt: "#e8dcc0", pants: "#2a2420", boots: "#1a1410", hat: "#2a2018", band: "#c8a050", vest: null, coat: null, poncho: "#6a2a2a", beard: "#1a1410", hair: "#1a1410", wide: true, scale: 1.02 },
};

/* ------------------------------------------------------------ guns */
export function buildGun(kind) {
  const g = new THREE.Group();
  const metal = mat("#3a3a40", { rough: 0.35, metal: 0.8 });
  const dark = mat("#1e1e22", { rough: 0.4, metal: 0.7 });
  const wood = mat("#6a3e22", { rough: 0.7 });
  const brass = mat("#b08a3a", { rough: 0.35, metal: 0.8 });
  if (kind === "revolver") {
    g.add(at(box(metal, 0.035, 0.035, 0.24), 0, 0.03, -0.12));
    g.add(at(cyl(dark, 0.034, 0.07), 0, 0.02, 0.0));
    g.children[1].rotation.x = Math.PI / 2;
    g.add(at(box(metal, 0.04, 0.05, 0.08), 0, 0.02, 0.05));
    const grip = at(box(wood, 0.035, 0.11, 0.045), 0, -0.04, 0.09);
    grip.rotation.x = -0.35;
    g.add(grip);
    g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.25);
  } else if (kind === "shotgun") {
    g.add(at(cyl(dark, 0.022, 0.62), -0.022, 0.03, -0.3));
    g.add(at(cyl(dark, 0.022, 0.62), 0.022, 0.03, -0.3));
    g.children[0].rotation.x = g.children[1].rotation.x = Math.PI / 2;
    g.add(at(box(wood, 0.07, 0.06, 0.24), 0, 0.0, -0.18));
    g.add(at(box(metal, 0.07, 0.07, 0.1), 0, 0.02, 0.02));
    const stock = at(box(wood, 0.06, 0.1, 0.32), 0, -0.04, 0.2);
    stock.rotation.x = 0.18;
    g.add(stock);
    g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.62);
  } else if (kind === "rifle") {
    g.add(at(cyl(dark, 0.016, 0.7), 0, 0.03, -0.34));
    g.children[0].rotation.x = Math.PI / 2;
    g.add(at(cyl(dark, 0.012, 0.55), 0, 0.0, -0.28));
    g.children[1].rotation.x = Math.PI / 2;
    g.add(at(box(wood, 0.05, 0.05, 0.3), 0, 0.0, -0.22));
    g.add(at(box(brass, 0.05, 0.07, 0.12), 0, 0.02, 0.02));
    const lever = at(box(metal, 0.015, 0.06, 0.09), 0, -0.04, 0.05);
    g.add(lever);
    const stock = at(box(wood, 0.05, 0.1, 0.34), 0, -0.04, 0.22);
    stock.rotation.x = 0.16;
    g.add(stock);
    g.add(at(box(metal, 0.01, 0.02, 0.02), 0, 0.055, -0.66));
    g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.7);
  } else if (kind === "carbine") {
    g.add(at(cyl(dark, 0.016, 0.5), 0, 0.03, -0.24));
    g.children[0].rotation.x = Math.PI / 2;
    g.add(at(box(wood, 0.05, 0.05, 0.24), 0, 0.0, -0.14));
    g.add(at(box(metal, 0.05, 0.07, 0.1), 0, 0.02, 0.02));
    const stock = at(box(wood, 0.05, 0.1, 0.28), 0, -0.04, 0.18);
    stock.rotation.x = 0.16;
    g.add(stock);
    g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.5);
  }
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

/* ------------------------------------------------------------ character */
function limb(color, w, len, d, opts) {
  // a joint group with a mesh hanging down from it
  const j = new THREE.Group();
  const m = box(color, w, len, d, opts);
  m.position.y = -len / 2;
  j.add(m);
  return j;
}

/**
 * buildCharacter(lookId, { weapon }) → rig with named joints.
 * weapon: "revolver" | "shotgun" | "rifle" | "carbine" | "dual" | null
 */
export function buildCharacter(lookId, { weapon = "revolver" } = {}) {
  const L = LOOKS[lookId] || LOOKS.bandit;
  const root = new THREE.Group();
  const body = new THREE.Group(); // tilt/roll pivot at the hips
  body.position.y = 0.95;
  root.add(body);
  const hips = new THREE.Group();
  body.add(hips);
  const lowerColor = L.overalls || L.pants;
  hips.add(at(box(L.dress || lowerColor, 0.36, 0.2, 0.23), 0, 0, 0));
  // legs
  const legs = [];
  for (const s of [-1, 1]) {
    const thigh = limb(L.dress ? L.dress : L.pants, 0.15, 0.45, 0.16);
    thigh.position.set(s * 0.1, -0.06, 0);
    const knee = limb(L.pants, 0.13, 0.42, 0.14);
    knee.position.y = -0.45;
    const boot = at(box(L.boots, 0.15, 0.12, 0.28), 0, -0.44, -0.05);
    knee.add(boot);
    thigh.add(knee);
    hips.add(thigh);
    legs.push({ thigh, knee });
  }
  if (L.dress) {
    const skirt = at(cone(L.dress, 0.36, 0.7), 0, -0.3, 0);
    hips.add(skirt);
  }
  // torso
  const spine = new THREE.Group();
  spine.position.y = 0.08;
  hips.add(spine);
  spine.add(at(box(L.shirt, 0.42, 0.52, 0.24), 0, 0.27, 0));
  if (L.overalls) spine.add(at(box(L.overalls, 0.43, 0.3, 0.25), 0, 0.12, 0));
  if (L.vest) spine.add(at(box(L.vest, 0.44, 0.42, 0.26), 0, 0.3, 0));
  if (L.apron) spine.add(at(box(L.apron, 0.38, 0.6, 0.02), 0, 0.02, -0.14));
  if (L.suspenders) for (const s of [-1, 1]) spine.add(at(box(L.suspenders, 0.05, 0.5, 0.26), s * 0.11, 0.28, 0));
  if (L.sash) {
    const sash = at(box(L.sash, 0.46, 0.08, 0.27), 0, 0.3, 0);
    sash.rotation.z = 0.6;
    spine.add(sash);
  }
  spine.add(at(box(L.belt || "#2a1a10", 0.44, 0.07, 0.26), 0, 0.03, 0));
  spine.add(at(box("#b89a4a", 0.07, 0.05, 0.02), 0, 0.03, -0.14));
  if (L.badge) spine.add(at(box("#e8c050", 0.07, 0.07, 0.02, { metal: 0.8, rough: 0.3 }), -0.11, 0.42, -0.135));
  let coat = null;
  if (L.coat) {
    spine.add(at(box(L.coat, 0.46, 0.5, 0.27), 0, 0.28, 0.005));
    // coat tails hang from the waist and swing
    coat = new THREE.Group();
    coat.position.set(0, 0.02, 0.02);
    const tails = at(box(L.coat, 0.46, 0.62, 0.05), 0, -0.31, 0.12);
    coat.add(tails);
    for (const s of [-1, 1]) coat.add(at(box(L.coat, 0.05, 0.6, 0.24), s * 0.23, -0.3, 0));
    spine.add(coat);
  }
  if (L.poncho) {
    const p = at(box(L.poncho, 0.62, 0.42, 0.36), 0, 0.42, 0);
    spine.add(p);
    const p2 = at(box(L.poncho, 0.66, 0.06, 0.4), 0, 0.22, 0);
    spine.add(p2);
  }
  // head
  const neck = new THREE.Group();
  neck.position.y = 0.55;
  spine.add(neck);
  neck.add(at(box(L.skin, 0.1, 0.08, 0.1), 0, 0.02, 0));
  const head = new THREE.Group();
  head.position.y = 0.06;
  neck.add(head);
  head.add(at(box(L.skin, 0.22, 0.25, 0.23), 0, 0.13, 0));
  head.add(at(box(L.skin, 0.05, 0.06, 0.05), 0, 0.12, -0.13)); // nose
  for (const s of [-1, 1]) head.add(at(box("#1a1410", 0.035, 0.025, 0.02), s * 0.055, 0.16, -0.116));
  if (L.hair && !L.bald) head.add(at(box(L.hair, 0.235, 0.12, 0.24), 0, 0.22, 0.01));
  if (L.hair && !L.bald) head.add(at(box(L.hair, 0.235, 0.18, 0.06), 0, 0.12, 0.11));
  if (L.braid) head.add(at(box(L.hair, 0.07, 0.36, 0.06), 0, -0.04, 0.15));
  if (L.beard) head.add(at(box(L.beard, 0.22, 0.1, 0.08), 0, 0.03, -0.09));
  if (L.beard) head.add(at(box(L.beard, 0.16, 0.03, 0.04), 0, 0.085, -0.125));
  if (L.mask) head.add(at(box(L.mask, 0.235, 0.12, 0.24), 0, 0.05, -0.005));
  if (L.scarf) neck.add(at(box(L.scarf, 0.2, 0.07, 0.2), 0, 0.02, -0.02));
  if (L.hat === "bowler") {
    head.add(at(cyl("#2a2422", 0.17, 0.02), 0, 0.27, 0));
    head.add(at(sph("#2a2422", 0.125), 0, 0.31, 0));
  } else if (L.hat === "cap") {
    head.add(at(cyl("#1e2a4a", 0.13, 0.1), 0, 0.3, 0));
    head.add(at(box("#141c30", 0.18, 0.02, 0.1), 0, 0.26, -0.13));
  } else if (L.hat) {
    const brimR = L.wide ? 0.36 : 0.27;
    const brim = at(cyl(L.hat, brimR, 0.025), 0, 0.27, 0);
    brim.scale.z = brimR * 2 * 0.92;
    head.add(brim);
    head.add(at(cyl(L.hat, 0.14, 0.17), 0, 0.36, 0));
    head.add(at(box(L.hat, 0.2, 0.03, 0.12), 0, 0.445, 0));
    if (L.band) head.add(at(cyl(L.band, 0.145, 0.035), 0, 0.3, 0));
  }
  // arms
  const arms = [];
  for (const s of [-1, 1]) {
    const sleeve = L.coat || L.shirt;
    const shoulder = limb(sleeve, 0.12, 0.32, 0.13);
    shoulder.position.set(s * 0.28, 0.48, 0);
    const elbow = limb(L.rolled ? L.skin : sleeve, 0.11, 0.3, 0.11);
    elbow.position.y = -0.32;
    shoulder.add(elbow);
    const hand = new THREE.Group();
    hand.position.y = -0.3;
    hand.add(at(box(L.skin, 0.09, 0.1, 0.09), 0, -0.04, 0));
    elbow.add(hand);
    spine.add(shoulder);
    arms.push({ shoulder, elbow, hand });
  }
  // weapons
  const guns = [];
  const addGun = (kind, side) => {
    const gun = buildGun(kind);
    gun.rotation.x = -Math.PI / 2;
    gun.position.set(0, -0.06, -0.02);
    arms[side].hand.add(gun);
    guns.push(gun);
    return gun;
  };
  if (weapon === "dual") {
    addGun("revolver", 1);
    addGun("revolver", 0);
  } else if (weapon) addGun(weapon, 1);
  // holster
  spine.add(at(box("#3a2414", 0.07, 0.16, 0.1), 0.24, -0.06, 0));
  root.scale.setScalar(L.scale || 1);
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  const rig = { root, body, hips, spine, neck, head, legs, arms, coat, guns, weapon, look: lookId, s: {}, phase: Math.random() * 10, twoHanded: weapon === "shotgun" || weapon === "rifle" || weapon === "carbine" };
  return rig;
}

/** Replace the gun(s) in a rig's hands. */
export function setRigWeapon(rig, weapon) {
  if (rig.weapon === weapon) return;
  for (const g of rig.guns) g.parent?.remove(g);
  rig.guns = [];
  const add = (kind, side) => {
    const gun = buildGun(kind);
    gun.rotation.x = -Math.PI / 2;
    gun.position.set(0, -0.06, -0.02);
    rig.arms[side].hand.add(gun);
    rig.guns.push(gun);
  };
  if (weapon === "dual") {
    add("revolver", 1);
    add("revolver", 0);
  } else if (weapon) add(weapon, 1);
  rig.weapon = weapon;
  rig.twoHanded = weapon === "shotgun" || weapon === "rifle" || weapon === "carbine";
}

/* ------------------------------------------------------------ pose */
const damp = (s, key, target, k, dt) => {
  const v = s[key] ?? target;
  s[key] = v + (target - v) * Math.min(1, k * dt);
  return s[key];
};

/**
 * st: { speed, sprint, aim (0-1), pitch, crouch, air, roll (0-1|null),
 * melee {kind, i, p}, block, hurt (0-1), down, dead (seconds), reload (0-1|null),
 * recoil (s since shot), tied, cheer, talk, seat, holster, tele }
 */
export function poseRig(rig, st, dt) {
  const s = rig.s;
  const t = (rig.phase += dt * (st.speed > 0.2 ? 1.6 + st.speed * 0.9 : 1));
  const A = rig.arms, Lg = rig.legs;
  const K = 14;
  let bodyY = 0.95, bodyX = 0, bodyZ = 0, spineX = 0, spineY = 0, headX = 0;
  let sL = [0, 0, 0.12], sR = [0, 0, -0.12]; // shoulder x,y,z
  let eL = 0, eR = 0; // elbow x
  const legT = [[0, 0], [0, 0]]; // thigh x, knee x
  let coatX = 0;

  if (st.dead != null || st.down) {
    // fall backwards and lie still
    const p = st.dead != null ? Math.min(1, st.dead / 0.55) : 1;
    const e = p * p * (3 - 2 * p);
    bodyX = (st.fallDir || 1) * 1.5 * e;
    bodyY = 0.95 - 0.68 * e;
    sL = [-0.6 * e, 0, 0.9 * e];
    sR = [-0.4 * e, 0, -1.1 * e];
    legT[0] = [-0.3 * e, 0.2 * e];
    legT[1] = [0.1 * e, 0.6 * e];
    headX = 0.2 * e;
  } else if (st.tied) {
    bodyY = 0.48;
    legT[0] = [-1.3, 1.9];
    legT[1] = [-1.3, 1.9];
    sL = [0.45, 0, 0.25];
    sR = [0.45, 0, -0.25];
    eL = eR = -1.2;
    headX = 0.25 + Math.sin(t * 0.8) * 0.05;
    spineX = 0.15;
  } else if (st.seat) {
    bodyY = 1.55;
    legT[0] = [-1.35, 1.2];
    legT[1] = [-1.35, 1.2];
    for (const lg of Lg) lg.thigh.rotation.z = 0;
    bodyZ = 0;
  } else if (st.roll != null) {
    const p = st.roll;
    bodyX = -p * Math.PI * 2;
    bodyY = 0.95 - Math.sin(p * Math.PI) * 0.55;
    legT[0] = [-1.6 * Math.sin(p * Math.PI), 2 * Math.sin(p * Math.PI)];
    legT[1] = [-1.6 * Math.sin(p * Math.PI), 2 * Math.sin(p * Math.PI)];
    sL = [-1.2, 0, 0.3];
    sR = [-1.2, 0, -0.3];
    eL = eR = -1.4;
  } else {
    // locomotion
    const sp = st.speed || 0;
    const stride = Math.min(1, sp / 4.5) * (st.sprint ? 1.25 : 1);
    const cyc = Math.sin(t * 2.2);
    if (sp > 0.2 && !st.air) {
      legT[0] = [cyc * 0.75 * stride, Math.max(0, -Math.cos(t * 2.2)) * 1.1 * stride + 0.05];
      legT[1] = [-cyc * 0.75 * stride, Math.max(0, Math.cos(t * 2.2)) * 1.1 * stride + 0.05];
      bodyY += Math.abs(Math.cos(t * 2.2)) * 0.05 * stride;
      spineX = (st.sprint ? 0.32 : 0.08) * stride;
      sL[0] = -cyc * 0.6 * stride;
      sR[0] = cyc * 0.6 * stride;
      eL = eR = -0.3 - 0.5 * stride;
      coatX = 0.25 * stride;
    } else if (st.air) {
      legT[0] = [-0.5, 0.9];
      legT[1] = [0.2, 0.4];
      sL = [-0.3, 0, 0.5];
      sR = [-0.3, 0, -0.5];
    } else {
      // idle breathing
      spineX = Math.sin(t * 0.9) * 0.02;
      sL[2] = 0.1 + Math.sin(t * 0.9) * 0.02;
      sR[2] = -0.1 - Math.sin(t * 0.9) * 0.02;
      if (st.talk) {
        sR = [0.6 + Math.sin(t * 2.4) * 0.25, 0, -0.3];
        eR = -0.9;
      }
    }
    if (st.crouch) {
      bodyY -= 0.38;
      legT[0] = [legT[0][0] - 1.1, legT[0][1] + 1.6];
      legT[1] = [legT[1][0] - 0.7, legT[1][1] + 1.5];
      spineX += 0.25;
    }
    // aiming (arms up to the camera pitch)
    const aim = st.aim || 0;
    if (aim > 0.01) {
      const pitch = st.pitch || 0;
      const up = Math.PI / 2 + pitch;
      const rec = st.recoil != null ? Math.max(0, 0.25 - st.recoil) * 1.6 : 0;
      if (rig.weapon === "dual") {
        sR = [lerpA(sR[0], up + rec, aim), 0, lerpA(sR[2], 0.05, aim)];
        sL = [lerpA(sL[0], up + rec * 0.7, aim), 0, lerpA(sL[2], -0.05, aim)];
        eR = lerpA(eR, 0, aim);
        eL = lerpA(eL, 0, aim);
      } else if (rig.twoHanded) {
        sR = [lerpA(sR[0], up - 0.15 + rec, aim), lerpA(0, 0.25, aim), lerpA(sR[2], -0.15, aim)];
        sL = [lerpA(sL[0], up + 0.15 + rec, aim), lerpA(0, -0.55, aim), lerpA(sL[2], 0.3, aim)];
        eR = lerpA(eR, -0.5, aim);
        eL = lerpA(eL, -0.35, aim);
        spineY = 0.25 * aim;
      } else {
        sR = [lerpA(sR[0], up + rec, aim), 0, lerpA(sR[2], -0.05, aim)];
        eR = lerpA(eR, 0, aim);
      }
      headX = -pitch * 0.4 * aim;
    } else if (rig.twoHanded && rig.weapon) {
      // carry the long gun across the body
      sR = [sR[0] + 0.5, 0.2, -0.2];
      eR = -1.1;
      sL = [sL[0] + 0.9, -0.3, 0.35];
      eL = -1.2;
    }
    if (st.reload != null) {
      const p = st.reload;
      sR = [0.9, 0, -0.1];
      eR = -1.3;
      sL = [0.7 + Math.sin(p * Math.PI * 4) * 0.15, 0, 0.3];
      eL = -1.4;
      headX = 0.3;
    }
    if (st.block) {
      sL = [2.2, 0.3, 0.3];
      sR = [2.2, -0.3, -0.3];
      eL = eR = -2.1;
      spineX += 0.1;
      headX = 0.2;
    }
    if (st.melee) {
      const { kind, i, p } = st.melee;
      const hit = Math.sin(Math.min(1, p * 1.6) * Math.PI);
      if (kind === "kick") {
        legT[1] = [-1.7 * hit, 0.2 * (1 - hit)];
        bodyX = -0.25 * hit;
        sL = [0.8, 0, 0.5];
        sR = [0.5, 0, -0.6];
        eL = eR = -1.4;
      } else if (i === 0) {
        sR = [lerpA(0.8, 1.65, hit), 0, -0.1];
        eR = lerpA(-1.8, -0.05, hit);
        sL = [1.0, 0, 0.2];
        eL = -1.9;
        spineY = -0.45 * hit;
      } else if (i === 1) {
        sL = [lerpA(0.8, 1.6, hit), lerpA(0, -0.8, hit), 0.4];
        eL = lerpA(-1.8, -0.5, hit);
        sR = [1.0, 0, -0.2];
        eR = -1.9;
        spineY = 0.55 * hit;
      } else {
        sR = [lerpA(0.3, 2.6, hit), 0, -0.1];
        eR = lerpA(-2.0, -0.6, hit);
        sL = [1.0, 0, 0.2];
        eL = -1.9;
        spineX = -0.25 * hit;
        bodyY += 0.06 * hit;
      }
    }
    if (st.cheer) {
      sL = [3.0 + Math.sin(t * 4) * 0.2, 0, 0.3];
      sR = [3.0 - Math.sin(t * 4) * 0.2, 0, -0.3];
      eL = eR = -0.3;
    }
    if (st.tele === "fan") {
      sL = [1.5, -0.4, 0.4];
      eL = -1.0;
    }
    if (st.tele === "dynamite") {
      sR = [2.6, 0, -0.3];
      eR = -0.8;
    }
    if (st.tele === "charge" || st.charge) {
      spineX = 0.6;
      headX = -0.3;
      sL = [0.3, 0, 0.6];
      sR = [0.3, 0, -0.6];
    }
    if (st.wind) {
      const k = st.wind;
      sR = [lerpA(sR[0], 1.4, k), 0.4 * k, -0.5 * k];
      eR = lerpA(eR, -2, k);
      spineY = -0.5 * k;
    }
    if (st.hurt > 0) {
      spineX -= 0.35 * st.hurt;
      headX -= 0.3 * st.hurt;
    }
    if (st.draw != null) {
      // duel: hand hovering over the holster, then the draw
      const p = st.draw;
      if (p < 0) {
        sR = [-0.15, 0, -0.32];
        eR = -0.35;
      }
    }
  }
  // apply with smoothing
  rig.body.position.y = damp(s, "by", bodyY, K, dt);
  rig.body.rotation.x = st.dead != null || st.down || st.roll != null ? bodyX : damp(s, "bx", bodyX, K, dt);
  if (st.dead == null && !st.down && st.roll == null) s.bx = rig.body.rotation.x;
  rig.body.rotation.z = damp(s, "bz", bodyZ, K, dt);
  rig.spine.rotation.x = damp(s, "spx", spineX, K, dt);
  rig.spine.rotation.y = damp(s, "spy", spineY, K, dt);
  rig.head.rotation.x = damp(s, "hx", headX, K, dt);
  const fast = st.melee || st.aim > 0.5 ? 30 : K;
  A[0].shoulder.rotation.set(damp(s, "s0x", sL[0], fast, dt), damp(s, "s0y", sL[1], fast, dt), damp(s, "s0z", sL[2], fast, dt));
  A[1].shoulder.rotation.set(damp(s, "s1x", sR[0], fast, dt), damp(s, "s1y", sR[1], fast, dt), damp(s, "s1z", sR[2], fast, dt));
  A[0].elbow.rotation.x = damp(s, "e0", eL, fast, dt);
  A[1].elbow.rotation.x = damp(s, "e1", eR, fast, dt);
  for (let i = 0; i < 2; i++) {
    Lg[i].thigh.rotation.x = damp(s, `t${i}`, legT[i][0], 18, dt);
    Lg[i].knee.rotation.x = damp(s, `k${i}`, legT[i][1], 18, dt);
    Lg[i].thigh.rotation.z = st.seat ? (i ? -0.45 : 0.45) : 0;
  }
  if (rig.coat) rig.coat.rotation.x = damp(s, "cx", coatX + (st.roll != null ? 0.6 : 0), 6, dt);
}
const lerpA = (a, b, t) => a + (b - a) * t;

/* ------------------------------------------------------------ horse */
export function buildHorse(color = "#6a4228") {
  const root = new THREE.Group();
  const coat = mat(color);
  const dark = mat("#2a1a10");
  const body = new THREE.Group();
  body.position.y = 1.25;
  root.add(body);
  body.add(at(box(coat, 0.62, 0.66, 1.8), 0, 0, 0));
  const neck = new THREE.Group();
  neck.position.set(0, 0.25, -0.8);
  neck.rotation.x = 0.7;
  neck.add(at(box(coat, 0.34, 0.85, 0.42), 0, 0.4, 0));
  neck.add(at(box(dark, 0.08, 0.7, 0.2), 0, 0.42, 0.22));
  const head = new THREE.Group();
  head.position.set(0, 0.8, 0);
  head.rotation.x = -1.3;
  head.add(at(box(coat, 0.28, 0.62, 0.3), 0, 0.28, 0));
  head.add(at(box(dark, 0.06, 0.12, 0.08), 0.09, 0.0, 0.14));
  head.add(at(box(dark, 0.06, 0.12, 0.08), -0.09, 0.0, 0.14));
  neck.add(head);
  body.add(neck);
  // saddle
  body.add(at(box("#3a2010", 0.66, 0.12, 0.6), 0, 0.36, -0.05));
  body.add(at(box("#7a2a1a", 0.7, 0.3, 0.7), 0, 0.2, -0.05));
  const tail = new THREE.Group();
  tail.position.set(0, 0.2, 0.9);
  tail.add(at(box(dark, 0.12, 0.7, 0.12), 0, -0.3, 0.05));
  tail.rotation.x = 0.4;
  body.add(tail);
  const legs = [];
  for (const [x, z] of [[-0.22, -0.7], [0.22, -0.7], [-0.22, 0.72], [0.22, 0.72]]) {
    const up = limb(coat, 0.16, 0.55, 0.2);
    up.position.set(x, -0.25, z);
    const low = limb(coat, 0.11, 0.55, 0.12);
    low.position.y = -0.55;
    low.add(at(box(dark, 0.14, 0.1, 0.16), 0, -0.55, 0));
    up.add(low);
    body.add(up);
    legs.push({ up, low });
  }
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return { root, body, neck, head, tail, legs, phase: Math.random() * 6 };
}

export function poseHorse(h, speed, dt, dead = 0) {
  h.phase += dt * (1 + speed * 1.1);
  const g = Math.min(1, speed / 8);
  const p = h.phase * 2.2;
  const offs = [0, 0.5, 0.2, 0.7];
  h.legs.forEach((L, i) => {
    const c = Math.sin((p + offs[i] * Math.PI * 2) * 1);
    L.up.rotation.x = c * 0.7 * g;
    L.low.rotation.x = Math.max(0, -Math.cos(p + offs[i] * Math.PI * 2)) * 1.1 * g;
  });
  h.body.position.y = 1.25 + Math.abs(Math.sin(p)) * 0.12 * g;
  h.body.rotation.x = Math.sin(p) * 0.06 * g;
  h.tail.rotation.x = 0.4 + g * 0.8 + Math.sin(p * 1.3) * 0.1;
  h.neck.rotation.x = 0.7 + Math.sin(p) * 0.12 * g;
  if (dead) {
    h.body.rotation.z = Math.min(1.4, dead * 3);
    h.body.position.y = 1.25 - Math.min(0.7, dead * 1.6);
  }
}

/* ------------------------------------------------------------ props */
export function buildWagon(cover = true, wreck = false) {
  const g = new THREE.Group();
  const wood = mat(wreck ? "#2a1e16" : "#7a5434");
  const dark = mat(wreck ? "#141010" : "#3e2a1a");
  g.add(at(box(wood, 1.8, 0.16, 3.6), 0, 0.85, 0));
  g.add(at(box(wood, 0.08, 0.5, 3.6), -0.88, 1.15, 0));
  g.add(at(box(wood, 0.08, 0.5, 3.6), 0.88, 1.15, 0));
  g.add(at(box(wood, 1.8, 0.5, 0.08), 0, 1.15, 1.78));
  g.add(at(box(wood, 1.8, 0.5, 0.08), 0, 1.15, -1.78));
  for (const z of [-1.2, 1.2])
    for (const x of [-1, 1]) {
      const wh = at(cyl(dark, 0.5, 0.08), x * 1.0, 0.5, z);
      wh.rotation.z = Math.PI / 2;
      g.add(wh);
      const hub = at(cyl(mat("#8a7a5a", { metal: 0.5, rough: 0.5 }), 0.1, 0.12), x * 1.02, 0.5, z);
      hub.rotation.z = Math.PI / 2;
      g.add(hub);
    }
  if (cover && !wreck) {
    const canvas = mat("#e6dcc4", { side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const hoop = new THREE.Mesh(geo("hoop", () => new THREE.TorusGeometry(0.9, 0.03, 4, 12, Math.PI)), dark);
      hoop.position.set(0, 1.35, -1.4 + i * 0.93);
      g.add(hoop);
    }
    const cv = new THREE.Mesh(geo("cover", () => new THREE.CylinderGeometry(0.92, 0.92, 3.4, 12, 1, true, -Math.PI / 2, Math.PI)), canvas);
    // half-cylinder: its axis along z, the arc on top
    cv.rotation.set(-Math.PI / 2, 0, 0);
    cv.position.set(0, 1.35, 0);
    g.add(cv);
  }
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return g;
}

export function buildCoach() {
  const g = new THREE.Group();
  const paint = mat("#7a1e1a");
  const trim = mat("#d8b050", { metal: 0.6, rough: 0.4 });
  const dark = mat("#2a1a12");
  g.add(at(box(paint, 2.2, 1.6, 3.2), 0, 1.5, 0));
  g.add(at(box(dark, 2.3, 0.12, 3.4), 0, 2.36, 0));
  g.add(at(box(trim, 2.24, 0.08, 3.24), 0, 0.72, 0));
  for (const s of [-1, 1]) g.add(at(box("#1a1410", 0.02, 0.6, 0.9), s * 1.11, 1.7, 0));
  g.add(at(box(dark, 1.6, 0.5, 1.0), 0, 1.0, -2.0));
  g.add(at(box(mat("#6a5a40"), 2.0, 0.4, 0.8), 0, 2.6, 0.6));
  for (const z of [-1.3, 1.3])
    for (const x of [-1, 1]) {
      const r = z < 0 ? 0.55 : 0.72;
      if (x === 1 && z > 0) continue; // the broken wheel
      const wh = at(cyl(dark, r, 0.1), x * 1.15, r, z);
      wh.rotation.z = Math.PI / 2;
      g.add(wh);
    }
  const broken = at(cyl(dark, 0.72, 0.1), 2.0, 0.08, 1.6);
  g.add(broken);
  g.rotation.z = 0.05;
  g.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  return g;
}

export function buildCactus(h) {
  const g = new THREE.Group();
  const green = mat("#4e7a3a");
  g.add(at(cyl(green, 0.24, h, {}, true), 0, h / 2, 0));
  g.add(at(sph(green, 0.24), 0, h, 0));
  const arm = (s, y, len) => {
    const a = at(cyl(green, 0.15, 0.5, {}, true), s * 0.4, y, 0);
    a.rotation.z = (s * Math.PI) / 2;
    g.add(a);
    g.add(at(cyl(green, 0.15, len, {}, true), s * 0.6, y + len / 2, 0));
    g.add(at(sph(green, 0.15), s * 0.6, y + len, 0));
  };
  arm(1, h * 0.45, h * 0.32);
  arm(-1, h * 0.6, h * 0.25);
  return g;
}
