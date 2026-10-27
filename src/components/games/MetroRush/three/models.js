/**
 * Metro Rush — procedural models: runner rigs, hoverboards, trains,
 * barriers, ramps, coins and power-up pickups. Everything is built from
 * primitives; no external assets.
 *
 * Runner rig: feet at y = 0, facing -z (the run direction). Joints are
 * Groups whose rotations animateRig() eases towards per-pose targets.
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CAR_L, RAMP_L, TRAIN_H } from "../engine/config.js";
import { glowMat, lampMat, mat, stripeTexture, track } from "./materials.js";

const TAU = Math.PI * 2;
const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = track(make());
    geoCache.set(key, g);
  }
  return g;
}
const capsule = (r, l) => geo(`cap${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 10));
const sphere = (r, w = 16, h = 12) => geo(`sph${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
const box = (x, y, z) => geo(`box${x}|${y}|${z}`, () => new THREE.BoxGeometry(x, y, z));
const rbox = (x, y, z, r = 0.04) => geo(`rbox${x}|${y}|${z}|${r}`, () => new RoundedBoxGeometry(x, y, z, 2, r));
const cyl = (a, b, h, s = 14) => geo(`cyl${a}|${b}|${h}|${s}`, () => new THREE.CylinderGeometry(a, b, h, s));
/** top cap of a sphere (hats, hair) — leaves the face uncovered */
const dome = (r, frac = 0.5) => geo(`dome${r}|${frac}`, () => new THREE.SphereGeometry(r, 22, 12, 0, Math.PI * 2, 0, Math.PI * frac));
/** back half of a sphere (hair behind the ears) */
const backHalf = (r, frac = 0.72) => geo(`back${r}|${frac}`, () => new THREE.SphereGeometry(r, 18, 12, 0, Math.PI, 0, Math.PI * frac));

function mesh(g, m, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = shadow;
  if (parent) parent.add(o);
  return o;
}
const group = (parent, x = 0, y = 0, z = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  if (parent) parent.add(g);
  return g;
};

/* ======================================================================= runner */
export function buildRunner(ch, outfit) {
  const c = outfit.c;
  const robot = !!ch.robot;
  const sk = mat(c.skin, { rough: robot ? 0.35 : 0.65, metal: robot ? 0.6 : 0 });
  const top = mat(c.top, { rough: 0.7 });
  const top2 = mat(c.top2, { rough: 0.6 });
  const pants = mat(c.pants, { rough: 0.8 });
  const shoe = mat(c.shoes, { rough: 0.5 });
  const sole = mat(c.sole, { rough: 0.6 });
  const hairM = mat(c.hair, { rough: 0.75 });
  const hat = mat(c.hat, { rough: 0.6 });
  const acc = mat(c.acc, { rough: 0.55 });
  const white = mat("#ffffff", { rough: 0.3 });
  const dark = mat("#1a1414", { rough: 0.4 });

  const root = new THREE.Group();
  const body = group(root); // pitch / roll / yaw pivot, sits at the feet
  const pelvis = group(body, 0, 0.9, 0);
  mesh(capsule(0.15, 0.16), pants, 0, 0, 0, pelvis).rotation.z = Math.PI / 2;
  const spine = group(pelvis, 0, 0.04, 0);
  const torso = mesh(capsule(0.2, 0.26), top, 0, 0.27, 0, spine);
  torso.scale.set(1.12, 1, 0.78);
  const band = mesh(cyl(0.206, 0.206, 0.09, 16), top2, 0, 0.2, 0, spine);
  band.scale.set(1.12, 1, 0.78);
  mesh(cyl(0.1, 0.12, 0.05, 14), top2, 0, 0.53, 0, spine);

  // head
  const neck = group(spine, 0, 0.56, 0);
  mesh(cyl(0.065, 0.075, 0.12, 10), sk, 0, 0.04, 0, neck);
  const head = group(neck, 0, 0.22, 0);
  if (robot) {
    mesh(rbox(0.38, 0.34, 0.34, 0.08), sk, 0, 0, 0, head);
    mesh(rbox(0.32, 0.11, 0.06, 0.03), lampMat(c.acc), 0, 0.03, -0.165, head, false);
    mesh(box(0.08, 0.025, 0.02), lampMat(c.acc), 0, -0.08, -0.17, head, false);
    mesh(cyl(0.05, 0.05, 0.06, 10), dark, -0.2, 0, 0, head).rotation.z = Math.PI / 2;
    mesh(cyl(0.05, 0.05, 0.06, 10), dark, 0.2, 0, 0, head).rotation.z = Math.PI / 2;
  } else {
    const skull = mesh(sphere(0.19, 20, 16), sk, 0, 0, 0, head);
    skull.scale.set(1, 1.04, 1);
    mesh(sphere(0.045, 8, 6), sk, -0.185, -0.01, 0.01, head);
    mesh(sphere(0.045, 8, 6), sk, 0.185, -0.01, 0.01, head);
    for (const s of [-1, 1]) {
      const e = mesh(sphere(0.04, 12, 10), white, s * 0.07, 0.015, -0.16, head, false);
      e.scale.set(0.9, 1.15, 0.6);
      mesh(sphere(0.024, 10, 8), dark, s * 0.068, 0.012, -0.183, head, false);
      mesh(sphere(0.008, 6, 4), white, s * 0.062 + 0.006, 0.024, -0.199, head, false);
      mesh(box(0.065, 0.016, 0.02), hairM, s * 0.072, 0.075, -0.17, head, false).rotation.z = s * -0.12;
    }
    const smile = mesh(geo("smile", () => new THREE.TorusGeometry(0.034, 0.0085, 6, 14, Math.PI)), mat("#7a2a24", { rough: 0.5 }), 0, -0.075, -0.178, head, false);
    smile.rotation.z = Math.PI;
    for (const s2 of [-1, 1]) mesh(sphere(0.026, 8, 6), mat("#ff9a8a", { rough: 0.8, transparent: true, opacity: 0.45 }), s2 * 0.11, -0.05, -0.15, head, false).scale.set(1, 0.6, 0.4);
    mesh(sphere(0.022, 8, 6), sk, 0, -0.01, -0.19, head, false);
  }

  // hair / headwear
  const extras = {};
  const hs = ch.hair;
  if (hs === "cap") {
    mesh(backHalf(0.198), hairM, 0, 0.02, 0, head);
    const capTop = mesh(dome(0.205), hat, 0, 0.07, 0, head);
    capTop.scale.set(1, 0.86, 1);
    mesh(cyl(0.207, 0.207, 0.03, 22), top2, 0, 0.08, 0, head);
    const brim = mesh(box(0.27, 0.025, 0.17), hat, 0, 0.085, -0.25, head);
    brim.rotation.x = -0.12;
  } else if (hs === "pony") {
    mesh(backHalf(0.205, 0.78), hairM, 0, 0.02, 0.005, head);
    mesh(dome(0.208, 0.42), hairM, 0, 0.02, 0, head);
    const fr = mesh(box(0.3, 0.06, 0.08), hairM, 0.02, 0.12, -0.15, head);
    fr.rotation.set(0.5, 0, 0.18);
    const pony = group(head, 0, 0.1, 0.19);
    mesh(capsule(0.065, 0.22), hairM, 0, -0.15, 0.04, pony);
    mesh(cyl(0.05, 0.05, 0.04, 10), hat, 0, 0, 0, pony);
    extras.pony = pony;
  } else if (hs === "beanie") {
    mesh(backHalf(0.198, 0.65), hairM, 0, 0.02, 0, head);
    const b = mesh(dome(0.21, 0.5), hat, 0, 0.06, 0, head);
    b.scale.set(1, 1.15, 1);
    mesh(cyl(0.212, 0.212, 0.07, 22), top2, 0, 0.07, 0, head);
    mesh(sphere(0.06, 10, 8), top2, 0, 0.32, 0, head);
  } else if (hs === "buns") {
    mesh(backHalf(0.203, 0.8), hairM, 0, 0.02, 0.005, head);
    mesh(dome(0.206, 0.4), hairM, 0, 0.025, 0, head);
    mesh(sphere(0.085, 12, 10), hairM, -0.13, 0.17, 0.02, head);
    mesh(sphere(0.085, 12, 10), hairM, 0.13, 0.17, 0.02, head);
    const fr = mesh(box(0.32, 0.05, 0.08), hairM, 0, 0.12, -0.15, head);
    fr.rotation.x = 0.55;
  } else if (hs === "antenna") {
    mesh(cyl(0.012, 0.012, 0.2, 6), dark, 0.08, 0.26, 0, head);
    const tip = mesh(sphere(0.04, 10, 8), lampMat(c.hair), 0.08, 0.37, 0, head, false);
    extras.tip = tip;
  } else if (hs === "helmet") {
    const hm = mat(c.hair, { rough: 0.3 });
    mesh(backHalf(0.235, 0.85), hm, 0, 0.0, 0.0, head);
    mesh(dome(0.236, 0.32), hm, 0, 0.0, 0, head);
    const visor = mesh(sphere(0.228, 20, 12), mat(c.hat, { rough: 0.05, metal: 0.4, transparent: true, opacity: 0.32 }), 0, -0.005, -0.01, head, false);
    visor.scale.set(0.98, 0.9, 0.98);
    mesh(geo("helmring", () => new THREE.TorusGeometry(0.2, 0.025, 8, 20)), mat(c.acc, { rough: 0.4 }), 0, -0.18, 0, head).rotation.x = Math.PI / 2;
    mesh(sphere(0.12, 10, 8), hairM, 0, 0.05, 0.1, head).scale.set(1.3, 1, 0.8);
  }

  // accessories
  const ac = ch.accessory;
  if (ac === "backpack") {
    mesh(rbox(0.3, 0.34, 0.15, 0.05), acc, 0, 0.3, 0.19, spine);
    mesh(rbox(0.22, 0.12, 0.05, 0.02), top2, 0, 0.2, 0.275, spine);
  } else if (ac === "headphones") {
    mesh(geo("hpband", () => new THREE.TorusGeometry(0.21, 0.018, 6, 16, Math.PI)), acc, 0, 0.02, 0, head);
    mesh(cyl(0.065, 0.065, 0.05, 12), acc, -0.2, -0.01, 0, head).rotation.z = Math.PI / 2;
    mesh(cyl(0.065, 0.065, 0.05, 12), acc, 0.2, -0.01, 0, head).rotation.z = Math.PI / 2;
  } else if (ac === "bag") {
    mesh(rbox(0.12, 0.28, 0.3, 0.04), acc, 0.25, 0.05, 0.02, spine);
    const strap = mesh(box(0.05, 0.62, 0.02), acc, 0.02, 0.3, -0.16, spine);
    strap.rotation.z = 0.75;
  } else if (ac === "scarf") {
    mesh(geo("scarf", () => new THREE.TorusGeometry(0.11, 0.045, 8, 16)), acc, 0, 0.53, 0, spine).rotation.x = Math.PI / 2;
    const tail = group(spine, 0.06, 0.52, 0.1);
    mesh(box(0.08, 0.3, 0.03), acc, 0, -0.15, 0, tail);
    extras.scarf = tail;
  } else if (ac === "jets") {
    for (const s of [-1, 1]) {
      mesh(cyl(0.06, 0.07, 0.3, 10), acc === "jets" ? mat(c.acc, { rough: 0.3, metal: 0.5 }) : acc, s * 0.09, 0.3, 0.2, spine);
      const flame = mesh(geo("flame", () => new THREE.ConeGeometry(0.05, 0.22, 8)), lampMat(c.acc, 0.85), s * 0.09, 0.07, 0.2, spine, false);
      flame.rotation.x = Math.PI;
      (extras.flames ||= []).push(flame);
    }
  }

  // arms
  const arm = (side) => {
    const sh = group(spine, side * 0.25, 0.45, 0);
    mesh(sphere(0.085, 10, 8), top, 0, 0, 0, sh);
    mesh(capsule(0.065, 0.18), top, 0, -0.14, 0, sh);
    const el = group(sh, 0, -0.29, 0);
    mesh(capsule(0.055, 0.17), robot ? sk : sk, 0, -0.12, 0, el);
    mesh(geo("cuff", () => new THREE.CylinderGeometry(0.068, 0.068, 0.05, 10)), top2, 0, 0, 0, el);
    mesh(sphere(0.07, 10, 8), robot ? dark : sk, 0, -0.27, 0, el);
    return { sh, el };
  };
  const leg = (side) => {
    const hip = group(pelvis, side * 0.11, -0.03, 0);
    mesh(capsule(0.085, 0.27), pants, 0, -0.2, 0, hip);
    const kn = group(hip, 0, -0.42, 0);
    mesh(capsule(0.07, 0.27), pants, 0, -0.19, 0, kn);
    const ft = group(kn, 0, -0.41, 0);
    mesh(rbox(0.13, 0.1, 0.27, 0.04), shoe, 0, -0.02, -0.05, ft);
    mesh(rbox(0.135, 0.035, 0.28, 0.015), sole, 0, -0.075, -0.05, ft);
    return { hip, kn, ft };
  };
  const L = arm(-1);
  const R = arm(1);
  const LL = leg(-1);
  const RL = leg(1);

  root.scale.setScalar(ch.build?.h || 1);
  root.traverse((o) => {
    if (o.isMesh) o.receiveShadow = false;
  });
  const rig = {
    root, body, pelvis, spine, head, neck, L, R, LL, RL, extras,
    cur: {},
    phase: 0,
    t: 0,
  };
  return rig;
}

const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const JOINTS = ["bodyX", "bodyY", "bodyZ", "lift", "spineX", "spineY", "headX", "headY", "lShX", "lShZ", "rShX", "rShZ", "lEl", "rEl", "lHip", "rHip", "lHipZ", "rHipZ", "lKn", "rKn", "lFt", "rFt"];

/**
 * st: { mode: run|jump|fall|slide|board|crash|idle|cheer|stumble, speed, lean, dt, t, air (0..1 jump progress) }
 */
export function animateRig(rig, st) {
  const dt = Math.min(st.dt, 0.05);
  rig.t += dt;
  const T = {};
  for (const j of JOINTS) T[j] = 0;
  const m = st.mode;
  const spd = st.speed || 0;
  if (m === "run" || m === "stumble" || m === "board") rig.phase += dt * (m === "board" ? 0.8 : 1.35 + spd * 0.045);
  const ph = rig.phase * TAU;
  const s = Math.sin(ph);
  let k = 20;

  if (m === "run" || m === "stumble") {
    T.lHip = 0.95 * s;
    T.rHip = -0.95 * s;
    T.lKn = -(0.25 + 1.1 * (0.5 + 0.5 * Math.sin(ph + 1.9)));
    T.rKn = -(0.25 + 1.1 * (0.5 + 0.5 * Math.sin(ph + 1.9 + Math.PI)));
    T.lFt = 0.25 * Math.sin(ph + 0.6);
    T.rFt = -0.25 * Math.sin(ph + 0.6);
    T.lShX = -0.85 * s;
    T.rShX = 0.85 * s;
    T.lEl = 1.35;
    T.rEl = 1.35;
    T.lShZ = -0.12;
    T.rShZ = 0.12;
    T.spineX = 0.22 + Math.min(0.12, spd * 0.003);
    T.spineY = 0.12 * s;
    T.headX = -0.16;
    T.lift = 0.05 * Math.abs(Math.cos(ph)) - 0.02;
    T.bodyZ = -(st.lean || 0) * 0.28;
    if (m === "stumble") {
      T.spineX = 0.6;
      T.headX = 0.2;
      T.lShZ = -1.1;
      T.rShZ = 1.1;
      T.lShX = -0.6;
      T.rShX = -0.6;
    }
  } else if (m === "jump" || m === "fall") {
    const up = m === "jump";
    T.lHip = up ? 1.15 : 0.35;
    T.rHip = up ? 0.55 : 0.1;
    T.lKn = up ? -1.6 : -0.5;
    T.rKn = up ? -1.0 : -0.3;
    T.lShX = up ? -0.5 : 0.4;
    T.rShX = up ? 1.0 : 0.4;
    T.lShZ = -0.7;
    T.rShZ = 0.7;
    T.lEl = 0.7;
    T.rEl = 0.9;
    T.spineX = up ? 0.28 : 0.05;
    T.headX = -0.15;
    T.bodyZ = -(st.lean || 0) * 0.32;
    T.bodyX = up ? 0.05 : -0.05;
    k = 16;
  } else if (m === "slide") {
    T.bodyX = 1.12;
    T.lift = -0.48;
    T.lHip = 0.25;
    T.rHip = -0.35;
    T.lKn = -0.15;
    T.rKn = -1.3;
    T.lShX = -1.4;
    T.rShX = -1.25;
    T.lShZ = -0.35;
    T.rShZ = 0.35;
    T.lEl = 0.25;
    T.rEl = 0.3;
    T.spineX = -0.15;
    T.headX = -0.85;
    T.bodyZ = -(st.lean || 0) * 0.2;
    k = 24;
  } else if (m === "board") {
    T.bodyY = -0.95;
    T.lHip = 0.45 + 0.05 * s;
    T.rHip = 0.3 - 0.05 * s;
    T.lKn = -0.8;
    T.rKn = -0.65;
    T.lHipZ = -0.25;
    T.rHipZ = 0.25;
    T.lShZ = -1.05 - 0.1 * s;
    T.rShZ = 1.0 + 0.1 * s;
    T.lShX = 0.2;
    T.rShX = -0.2;
    T.lEl = 0.4;
    T.rEl = 0.4;
    T.spineX = 0.2;
    T.spineY = 0.25;
    T.headY = 0.85;
    T.lift = -0.12 + 0.03 * s;
    T.bodyZ = -(st.lean || 0) * 0.4;
  } else if (m === "crash") {
    T.bodyX = 1.35;
    T.lift = -0.55;
    T.lHip = 0.9;
    T.rHip = 0.5;
    T.lKn = -0.6;
    T.rKn = -1.2;
    T.lShX = 2.6;
    T.rShX = 2.3;
    T.lShZ = -0.6;
    T.rShZ = 0.6;
    T.headX = -0.4;
    k = 9;
  } else if (m === "cheer") {
    const w = Math.sin(rig.t * 9);
    T.lShX = 2.9;
    T.rShX = 2.9;
    T.lShZ = -0.35 + 0.2 * w;
    T.rShZ = 0.35 - 0.2 * w;
    T.lEl = 0.4;
    T.rEl = 0.4;
    T.lift = 0.06 * Math.abs(Math.sin(rig.t * 6));
    T.spineX = -0.1;
    T.headX = -0.2;
    k = 12;
  } else {
    // idle: breathing, weight shift, glance around, a wave now and then
    const b = Math.sin(rig.t * 2.1);
    const sway = Math.sin(rig.t * 0.7);
    T.spineX = 0.02 + 0.02 * b;
    T.spineY = 0.08 * sway;
    T.headY = 0.35 * Math.sin(rig.t * 0.45) - 0.08 * sway;
    T.headX = -0.04 + 0.03 * Math.sin(rig.t * 0.9);
    T.lShZ = -0.12 - 0.03 * b;
    T.rShZ = 0.12 + 0.03 * b;
    T.lEl = 0.25;
    T.rEl = 0.25;
    T.lHip = 0.05;
    T.rHip = -0.05;
    T.lHipZ = -0.04 + 0.03 * sway;
    T.rHipZ = 0.06 + 0.03 * sway;
    T.lift = 0.008 * b;
    const wave = (rig.t % 7) / 7;
    if (wave > 0.72 && wave < 0.92) {
      const ww = Math.sin(rig.t * 12);
      T.rShX = 0.3;
      T.rShZ = 2.5 + 0.25 * ww;
      T.rEl = 0.6 + 0.3 * ww;
    }
    k = 8;
  }

  const C = rig.cur;
  for (const j of JOINTS) C[j] = damp(C[j] ?? T[j], T[j], k, dt);
  rig.body.rotation.set(C.bodyX, C.bodyY, C.bodyZ);
  rig.pelvis.position.y = 0.9 + C.lift;
  rig.spine.rotation.set(C.spineX, C.spineY, 0);
  rig.head.rotation.set(C.headX, C.headY, 0);
  rig.L.sh.rotation.set(C.lShX, 0, C.lShZ);
  rig.R.sh.rotation.set(C.rShX, 0, C.rShZ);
  rig.L.el.rotation.x = C.lEl;
  rig.R.el.rotation.x = C.rEl;
  rig.LL.hip.rotation.set(C.lHip, 0, C.lHipZ);
  rig.RL.hip.rotation.set(C.rHip, 0, C.rHipZ);
  rig.LL.kn.rotation.x = C.lKn;
  rig.RL.kn.rotation.x = C.rKn;
  rig.LL.ft.rotation.x = C.lFt;
  rig.RL.ft.rotation.x = C.rFt;
  // secondary motion
  const e = rig.extras;
  if (e.pony) e.pony.rotation.x = 0.35 + 0.35 * Math.sin(ph * 2) + (m === "jump" ? -0.5 : 0) + (m === "slide" ? -0.8 : 0);
  if (e.scarf) e.scarf.rotation.x = 0.9 + 0.25 * Math.sin(ph * 2 + 1) + Math.min(0.5, spd * 0.02);
  if (e.tip) e.tip.scale.setScalar(1 + 0.25 * Math.sin(rig.t * 6));
  if (e.flames) for (const f of e.flames) f.scale.set(1, (st.boost ? 2.6 : 0.6) + 0.3 * Math.sin(rig.t * 40 + f.position.x * 9), 1);
}

export function disposeRunner(rig) {
  rig.root.removeFromParent();
}

/* ======================================================================= hoverboard */
export function buildBoard(b) {
  const g = new THREE.Group();
  const deckShape = new THREE.Shape();
  const L = b.shape === "twin" ? 0.62 : 0.66;
  const W = b.shape === "wing" ? 0.25 : 0.22;
  deckShape.moveTo(-W, -L + 0.18);
  deckShape.quadraticCurveTo(-W, -L, 0, -L - (b.shape === "fin" || b.shape === "flame" ? 0.08 : 0));
  deckShape.quadraticCurveTo(W, -L, W, -L + 0.18);
  deckShape.lineTo(W, L - 0.18);
  deckShape.quadraticCurveTo(W, L, 0, L + (b.shape === "twin" ? 0 : 0.04));
  deckShape.quadraticCurveTo(-W, L, -W, L - 0.18);
  deckShape.closePath();
  const deckGeo = geo(`deck${b.shape}`, () => {
    const x = new THREE.ExtrudeGeometry(deckShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.025, bevelSegments: 2, curveSegments: 10 });
    x.rotateX(Math.PI / 2);
    x.translate(0, 0.03, 0);
    return x;
  });
  const deck = mesh(deckGeo, mat(b.deck, { rough: 0.35, metal: 0.2 }), 0, 0, 0, g);
  deck.castShadow = true;
  mesh(box(0.08, 0.012, L * 1.5), mat(b.stripe, { rough: 0.4 }), 0, 0.075, 0, g, false);
  mesh(box(0.3, 0.012, 0.05), mat(b.stripe, { rough: 0.4 }), 0, 0.075, -L * 0.62, g, false);
  const under = mesh(box(W * 1.5, 0.02, L * 1.6), lampMat(b.under), 0, -0.02, 0, g, false);
  under.userData.glow = true;
  // shape extras
  if (b.shape === "fin" || b.shape === "flame") {
    const fin = mesh(geo("fin", () => {
      const s = new THREE.Shape();
      s.moveTo(0, 0);
      s.lineTo(0.22, 0);
      s.lineTo(0.02, 0.2);
      s.closePath();
      const x = new THREE.ExtrudeGeometry(s, { depth: 0.025, bevelEnabled: false });
      x.rotateY(Math.PI / 2);
      return x;
    }), mat(b.stripe, { rough: 0.4 }), 0.012, 0.06, L * 0.55, g);
    fin.castShadow = true;
  }
  if (b.shape === "wing") {
    for (const s of [-1, 1]) {
      const w = mesh(box(0.28, 0.02, 0.22), mat(b.stripe, { rough: 0.35, metal: 0.4 }), s * (W + 0.1), 0.04, L * 0.35, g);
      w.rotation.y = s * -0.45;
      w.rotation.z = s * 0.15;
    }
  }
  if (b.shape === "flame") {
    for (const s of [-1, 0, 1]) mesh(geo("flamecone", () => new THREE.ConeGeometry(0.05, 0.25, 6)), lampMat(b.glow, 0.8), s * 0.1, 0.0, L + 0.12, g, false).rotation.x = Math.PI / 2;
  }
  if (b.shape === "twin") {
    for (const z of [-1, 1]) mesh(cyl(0.05, 0.05, 0.03, 10), lampMat(b.glow), 0, -0.035, z * L * 0.6, g, false);
  }
  const halo = new THREE.Sprite(glowMat(b.glow, 0.7));
  halo.scale.set(1.3, 1.3, 1);
  halo.position.y = -0.12;
  g.add(halo);
  g.userData.halo = halo;
  return g;
}

/* ======================================================================= trains */
/** livery materials (shared by every train; recoloured per city) */
export function createTrainMaterials() {
  const m = (opts) => track(new THREE.MeshStandardMaterial(opts));
  return {
    body: m({ color: "#ffffff", roughness: 0.38, metalness: 0.35 }),
    stripe: m({ color: "#ff7a1a", roughness: 0.45, metalness: 0.2 }),
    band: m({ color: "#26323d", roughness: 0.5, metalness: 0.3 }),
    roof: m({ color: "#a9b4bd", roughness: 0.6, metalness: 0.4 }),
    glass: m({ color: "#1d3a52", roughness: 0.08, metalness: 0.6, emissive: new THREE.Color("#000000") }),
    dark: m({ color: "#1a1c22", roughness: 0.7, metalness: 0.3 }),
    light: track(new THREE.MeshBasicMaterial({ color: "#fff6d0", toneMapped: false })),
    tail: track(new THREE.MeshBasicMaterial({ color: "#ff3a2a", toneMapped: false })),
  };
}
export function paintTrain(mats, liv, night) {
  mats.body.color.set(liv.body);
  mats.stripe.color.set(liv.stripe);
  mats.band.color.set(liv.band);
  mats.roof.color.set(liv.roof);
  mats.glass.color.set(liv.glass);
  mats.glass.emissive.set(night ? liv.stripe : "#000000");
  mats.glass.emissiveIntensity = night ? 0.18 : 0;
  mats.stripe.emissive = mats.stripe.emissive || new THREE.Color();
  mats.stripe.emissive.set(liv.glow ? liv.stripe : "#000000");
  mats.stripe.emissiveIntensity = liv.glow ? 1.2 : 0;
}

const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
function placed(g, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const c = nonIdx(g.clone());
  const m4 = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  c.applyMatrix4(m4);
  for (const k of Object.keys(c.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") c.deleteAttribute(k);
  if (!c.attributes.uv) c.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((c.attributes.position.count) * 2), 2));
  return c;
}

/**
 * Geometry for a train of `cars` cars, local origin at the FRONT (the end
 * facing the runner), extending to -z. Returns merged geometries per material.
 */
export function trainGeometries(cars) {
  return geo(`train${cars}`, () => {
    const parts = { body: [], stripe: [], band: [], roof: [], glass: [], dark: [], light: [], tail: [] };
    const len = cars * CAR_L;
    const W = 2.2;
    for (let i = 0; i < cars; i++) {
      const zc = -(i + 0.5) * CAR_L;
      const Lc = CAR_L - 0.35;
      parts.body.push(placed(new RoundedBoxGeometry(W, 2.62, Lc, 3, 0.2), 0, 0.34 + 1.31, zc));
      parts.roof.push(placed(new RoundedBoxGeometry(W - 0.16, 0.12, Lc - 0.3, 2, 0.05), 0, 2.94, zc));
      for (const s of [-1, 1]) {
        parts.stripe.push(placed(new THREE.BoxGeometry(0.04, 0.2, Lc - 0.5), s * (W / 2 + 0.005), 1.0, zc));
        parts.stripe.push(placed(new THREE.BoxGeometry(0.04, 0.07, Lc - 0.5), s * (W / 2 + 0.005), 1.22, zc));
        parts.glass.push(placed(new THREE.BoxGeometry(0.05, 0.62, Lc - 1.6), s * (W / 2 + 0.008), 1.9, zc));
        for (const dz of [-Lc / 4, Lc / 4]) {
          parts.band.push(placed(new THREE.BoxGeometry(0.06, 2.0, 1.15), s * (W / 2 + 0.012), 1.38, zc + dz));
          parts.glass.push(placed(new THREE.BoxGeometry(0.07, 0.55, 0.42), s * (W / 2 + 0.02), 1.95, zc + dz - 0.27));
          parts.glass.push(placed(new THREE.BoxGeometry(0.07, 0.55, 0.42), s * (W / 2 + 0.02), 1.95, zc + dz + 0.27));
        }
      }
      // bogies + wheels
      for (const dz of [-Lc * 0.32, Lc * 0.32]) {
        parts.dark.push(placed(new THREE.BoxGeometry(1.7, 0.36, 2.3), 0, 0.27, zc + dz));
        for (const s of [-1, 1]) for (const w of [-0.65, 0.65]) parts.dark.push(placed(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 14), s * 0.78, 0.3, zc + dz + w, 0, 0, Math.PI / 2));
      }
      parts.dark.push(placed(new THREE.BoxGeometry(1.9, 0.2, Lc - 1), 0, 0.42, zc));
      // couplings
      if (i > 0) parts.band.push(placed(new THREE.BoxGeometry(1.5, 2.2, 0.5), 0, 1.5, -i * CAR_L));
    }
    // front cab
    parts.glass.push(placed(new THREE.BoxGeometry(1.78, 0.85, 0.06), 0, 2.05, 0.02, -0.12));
    parts.band.push(placed(new THREE.BoxGeometry(2.0, 0.34, 0.12), 0, 0.62, 0.04));
    parts.stripe.push(placed(new THREE.BoxGeometry(2.1, 0.18, 0.05), 0, 1.0, 0.03));
    parts.band.push(placed(new THREE.BoxGeometry(0.7, 0.2, 0.05), 0, 2.62, 0.04));
    for (const s of [-1, 1]) {
      parts.light.push(placed(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 14), s * 0.68, 1.28, 0.05, Math.PI / 2));
      parts.light.push(placed(new THREE.BoxGeometry(0.22, 0.07, 0.05), s * 0.68, 0.92, 0.05));
    }
    // tail plate at the far end
    for (const s of [-1, 1]) parts.tail.push(placed(new THREE.BoxGeometry(0.2, 0.12, 0.05), s * 0.7, 1.1, -len - 0.02));
    const out = {};
    for (const [k, list] of Object.entries(parts)) out[k] = list.length ? mergeGeometries(list) : null;
    for (const list of Object.values(parts)) for (const g of list) g.dispose();
    out.dispose = () => Object.values(out).forEach((g) => g && g.dispose && g.dispose());
    return out;
  });
}

export function buildTrain(cars, mats) {
  const G = trainGeometries(cars);
  const g = new THREE.Group();
  for (const k of ["body", "stripe", "band", "roof", "glass", "dark", "light", "tail"]) {
    if (!G[k]) continue;
    const m = new THREE.Mesh(G[k], mats[k]);
    m.castShadow = k === "body";
    m.receiveShadow = k === "body" || k === "roof";
    g.add(m);
  }
  // headlight glows (bright on moving trains)
  const glows = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.Sprite(glowMat("#fff2c0", 0.9));
    sp.position.set(s * 0.68, 1.28, 0.25);
    sp.scale.set(1.4, 1.4, 1);
    g.add(sp);
    glows.push(sp);
  }
  g.userData.glows = glows;
  g.userData.len = cars * CAR_L;
  return g;
}

/* ======================================================================= barriers */
export function createObstacleMaterials(theme) {
  const tex = stripeTexture(theme.barrier[0], theme.barrier[1], 6, true);
  const texV = stripeTexture(theme.barrier[0], theme.barrier[1], 8, true);
  const rampTex = stripeTexture("#ffcf3a", "#2a2a2a", 10, false);
  rampTex.wrapS = rampTex.wrapT = THREE.RepeatWrapping;
  return {
    tex,
    texV,
    board: track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 })),
    boardV: track(new THREE.MeshStandardMaterial({ map: texV, roughness: 0.55 })),
    leg: mat("#3a3f48", { rough: 0.6, metal: 0.4 }),
    post: track(new THREE.MeshStandardMaterial({ color: "#d9dde2", roughness: 0.45, metalness: 0.5 })),
    lamp: lampMat("#ffb21f"),
    rampTop: track(new THREE.MeshStandardMaterial({ map: rampTex, roughness: 0.6, metalness: 0.2 })),
    rampSide: mat("#4a4f58", { rough: 0.6, metal: 0.5 }),
    snow: mat("#ffffff", { rough: 0.9 }),
    recolor(th) {
      tex.userData.redraw(th.barrier[0], th.barrier[1]);
      texV.userData.redraw(th.barrier[0], th.barrier[1]);
    },
  };
}

export function buildBarrier(M) {
  const g = new THREE.Group();
  const b = mesh(box(2.15, 0.36, 0.12), M.board, 0, 0.74, -0.17, g);
  b.receiveShadow = true;
  mesh(box(2.15, 0.14, 0.1), M.board, 0, 0.3, -0.17, g);
  for (const s of [-1, 1]) {
    const l1 = mesh(box(0.08, 1.0, 0.08), M.leg, s * 0.92, 0.5, -0.06, g);
    l1.rotation.x = 0.18;
    const l2 = mesh(box(0.08, 1.0, 0.08), M.leg, s * 0.92, 0.5, -0.28, g);
    l2.rotation.x = -0.18;
    mesh(box(0.1, 0.06, 0.5), M.leg, s * 0.92, 0.03, -0.17, g);
  }
  const lamp = mesh(cyl(0.06, 0.06, 0.08, 10), M.lamp, 0.7, 0.98, -0.17, g, false);
  const sp = new THREE.Sprite(glowMat("#ffb21f", 0.8));
  sp.position.set(0.7, 1.0, -0.1);
  sp.scale.set(0.6, 0.6, 1);
  g.add(sp);
  g.userData.blink = [lamp, sp];
  return g;
}

export function buildOverhead(M) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    mesh(box(0.13, 2.75, 0.13), M.post, s * 1.17, 1.375, -0.15, g);
    mesh(box(0.34, 0.08, 0.34), M.leg, s * 1.17, 0.04, -0.15, g);
  }
  mesh(box(2.5, 0.2, 0.2), M.post, 0, 2.65, -0.15, g);
  const board = mesh(box(2.2, 0.78, 0.1), M.boardV, 0, 1.57, -0.15, g);
  board.receiveShadow = true;
  for (const s of [-0.7, 0.7]) mesh(box(0.05, 0.5, 0.05), M.leg, s, 2.2, -0.15, g);
  return g;
}

export function buildRamp(M) {
  const g = new THREE.Group();
  const W = 2.1;
  // local origin at the train front (top end); slope runs to +z (towards the runner)
  const top = geo("rampTop", () => {
    const p = new THREE.PlaneGeometry(W, Math.hypot(RAMP_L, TRAIN_H), 1, 1);
    p.rotateX(-Math.PI / 2);
    p.rotateX(Math.atan2(TRAIN_H, RAMP_L));
    p.translate(0, TRAIN_H / 2, RAMP_L / 2);
    const uv = p.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1, uv.getY(i) * 3);
    return p;
  });
  const t = mesh(top, M.rampTop, 0, 0.02, 0, g);
  t.receiveShadow = true;
  const side = geo("rampSide", () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(RAMP_L, 0);
    s.lineTo(0, TRAIN_H);
    s.closePath();
    const x = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false });
    x.rotateY(-Math.PI / 2);
    return x;
  });
  for (const sx of [-1, 1]) mesh(side, M.rampSide, sx * (W / 2) + (sx < 0 ? 0 : 0.1), 0, 0, g);
  for (const z of [1.5, 3.5, 5.5]) mesh(box(0.1, TRAIN_H * (1 - z / RAMP_L), 0.1), M.rampSide, 0, (TRAIN_H * (1 - z / RAMP_L)) / 2, z, g);
  return g;
}

/* ======================================================================= coins + pickups */
export function coinGeometry() {
  return geo("coin", () => {
    const parts = [new THREE.CylinderGeometry(0.36, 0.36, 0.075, 22), new THREE.TorusGeometry(0.3, 0.035, 6, 22)];
    parts[0].rotateX(Math.PI / 2);
    const a = nonIdx(parts[0]);
    const b = nonIdx(parts[1]);
    b.translate(0, 0, 0.04);
    const c = nonIdx(new THREE.TorusGeometry(0.3, 0.035, 6, 22));
    c.translate(0, 0, -0.04);
    const merged = mergeGeometries([a, b, c]);
    [parts[0], parts[1], a, b, c].forEach((x) => x.dispose());
    return merged;
  });
}

export const PICKUP_COLORS = { magnet: "#ff4a5a", mult: "#a46bff", shield: "#29d8ff", board: "#3fe07a", boost: "#ff9a1f" };

export function buildPickup(kind) {
  const g = new THREE.Group();
  const inner = group(g, 0, 0, 0);
  const col = PICKUP_COLORS[kind];
  const shiny = mat(col, { rough: 0.25, metal: 0.5, emissive: col, ei: 0.35 });
  if (kind === "magnet") {
    mesh(geo("magU", () => new THREE.TorusGeometry(0.24, 0.09, 10, 20, Math.PI)), shiny, 0, 0.05, 0, inner).rotation.z = Math.PI;
    for (const s of [-1, 1]) {
      mesh(cyl(0.09, 0.09, 0.2, 12), shiny, s * 0.24, 0.12, 0, inner);
      mesh(cyl(0.092, 0.092, 0.1, 12), mat("#e9eef2", { rough: 0.3, metal: 0.8 }), s * 0.24, 0.27, 0, inner);
    }
  } else if (kind === "mult") {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.16 : 0.36;
      const a = (i / 10) * TAU + Math.PI / 2;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
    const star = geo("star", () => {
      const x = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
      x.translate(0, 0, -0.05);
      return x;
    });
    mesh(star, shiny, 0, 0, 0, inner);
    mesh(geo("x2", () => new THREE.TorusGeometry(0.08, 0.025, 6, 12)), mat("#ffe53b", { rough: 0.3, emissive: "#ffe53b", ei: 0.6 }), 0, 0, 0.09, inner);
  } else if (kind === "shield") {
    mesh(sphere(0.3, 20, 14), mat(col, { rough: 0.1, metal: 0.2, transparent: true, opacity: 0.45, emissive: col, ei: 0.4 }), 0, 0, 0, inner, false);
    const core = mesh(geo("shieldCore", () => new THREE.OctahedronGeometry(0.16, 0)), mat("#ffffff", { rough: 0.2, emissive: col, ei: 0.9 }), 0, 0, 0, inner);
    core.userData.spin = true;
  } else if (kind === "board") {
    const d = mesh(rbox(0.26, 0.05, 0.62, 0.025), shiny, 0, 0, 0, inner);
    d.rotation.x = -0.5;
    mesh(box(0.06, 0.06, 0.5), mat("#ffffff", { rough: 0.4 }), 0, 0.02, 0.0, inner).rotation.x = -0.5;
  } else if (kind === "boost") {
    const s = new THREE.Shape();
    s.moveTo(0.06, 0.38);
    s.lineTo(-0.2, -0.02);
    s.lineTo(-0.02, -0.02);
    s.lineTo(-0.08, -0.38);
    s.lineTo(0.2, 0.06);
    s.lineTo(0.02, 0.06);
    s.closePath();
    const bolt = geo("bolt", () => {
      const x = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 2 });
      x.translate(0, 0, -0.05);
      return x;
    });
    mesh(bolt, shiny, 0, 0, 0, inner);
  }
  const ring = mesh(geo("pring", () => new THREE.TorusGeometry(0.5, 0.025, 6, 32)), lampMat(col, 0.85), 0, 0, 0, g, false);
  const halo = new THREE.Sprite(glowMat(col, 0.75));
  halo.scale.set(1.8, 1.8, 1);
  g.add(halo);
  g.userData = { inner, ring, halo };
  return g;
}

export function disposeModelGeometry() {
  geoCache.clear();
}
