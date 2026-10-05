/**
 * Train Commander — the Rustjaw raiders (models + animation).
 *
 * Local frame: +X forward, y = 0 on the ground. The TRAIN side of a model is
 * +Z: a raider riding on the left of the train (z < 0) is drawn as built; one
 * on the right is mirrored (scale.z = −1), so weapons, sidecars and gun
 * mounts always face the train.
 *
 * Rigs are pooled by type by the renderer. Each rig owns one material clone
 * (hit flash + death fade without touching other rigs); geometry is cached.
 * Animation reads engine state only: ground velocity spins the wheels, the
 * attack timer drives the swing, so a blow visibly lands on the exact frame
 * the engine applies damage.
 */
import * as THREE from "three";
import { T, paint, merge, box, cyl, cylX, cylZ, sph, dome, cone, torus, prism, cached, vcMat, basicMat } from "./geo.js";
import { blobTexture, ringTexture } from "./textures.js";

const RUST = "#8c3b22";
const RUST2 = "#6a2c1a";
const IRON = "#3d3a38";
const IRON2 = "#57534f";
const HAZ = "#e2a92b";
const LEATHER = "#5a3d28";
const SKIN = "#c99472";
const CLOTH = "#a8432c";
const BONE = "#d8cdb4";

/* ================================================================ parts */
function wheel(r, w = 0.14, hub = IRON2, tyre = "#1e1d1c", spikes = 0) {
  return cached(`ew-${r}-${w}-${hub}-${spikes}`, () => {
    const P = [paint(cylZ(r, w, 16), tyre, 0.06), paint(cylZ(r * 0.6, w + 0.02, 12), hub)];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      P.push(paint(T(box(r * 0.75, 0.05, w + 0.04), Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3, 0, 0, 0, a), "#2a2826"));
    }
    for (let i = 0; i < spikes; i++) P.push(paint(T(cone(0.05, 0.16, 5), 0, 0, (w / 2 + 0.06) * (i % 2 ? 1 : -1), Math.PI / 2 * (i % 2 ? 1 : -1)), BONE));
    // tread blocks
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      P.push(paint(T(box(0.05, 0.05, w + 0.01), Math.cos(a) * r, Math.sin(a) * r, 0, 0, 0, a), "#141313"));
    }
    return merge(P);
  });
}

/** seated rider torso+head (no arms); helmet style per type */
function riderGeo(style) {
  return cached(`rider-${style}`, () => {
    const P = [];
    const add = (g, c, j = 0.05) => P.push(paint(g, c, j, P.length + 2));
    const jacket = style === "scout" ? "#6d6a3a" : style === "armored" ? IRON2 : style === "captain" ? "#3a2420" : LEATHER;
    // hips + thighs (seated) + shins
    add(T(box(0.26, 0.16, 0.34), 0, 0.0, 0), "#3a2f28");
    for (const s of [-1, 1]) {
      add(T(box(0.42, 0.13, 0.13), 0.18, 0.0, s * 0.12), "#3a2f28");
      add(T(box(0.12, 0.38, 0.12), 0.38, -0.18, s * 0.14), "#3a2f28");
      add(T(box(0.2, 0.08, 0.13), 0.44, -0.38, s * 0.14), "#1c1a19");
    }
    // torso leaning forward
    add(T(box(0.3, 0.46, 0.38), 0.04, 0.3, 0, 0, 0, -0.32), jacket);
    add(T(box(0.32, 0.08, 0.4), 0.0, 0.1, 0, 0, 0, -0.32), "#2a2422"); // belt
    if (style === "armored") {
      add(T(box(0.34, 0.3, 0.42), 0.06, 0.36, 0, 0, 0, -0.32), "#6d6863", 0.08);
      for (const s of [-1, 1]) add(T(sph(0.13, 8, 6), 0.0, 0.5, s * 0.24, 0, 0, 0, 1, 0.7, 1), "#7a746e");
    } else {
      // scarf
      add(T(box(0.18, 0.08, 0.36), 0.12, 0.52, 0, 0, 0, -0.3), style === "scout" ? "#d9b53a" : CLOTH);
      add(T(box(0.06, 0.26, 0.08), -0.12, 0.42, -0.16, 0.2, 0, 0.6), style === "scout" ? "#d9b53a" : CLOTH);
    }
    // head + helmet + goggles
    add(T(sph(0.13, 10, 8), 0.17, 0.66, 0), SKIN);
    if (style === "armored") {
      add(T(dome(0.17, 12, 6), 0.17, 0.66, 0), "#6d6863");
      add(T(box(0.06, 0.12, 0.26), 0.31, 0.64, 0), "#2a2826");
      for (const s of [-1, 1]) add(T(cone(0.045, 0.22, 6), 0.12, 0.84, s * 0.13, s * 0.6), BONE);
    } else if (style === "captain") {
      add(T(cyl(0.2, 0.2, 0.03, 14), 0.17, 0.76, 0), "#1f1a18");
      add(T(cyl(0.12, 0.14, 0.18, 12), 0.17, 0.86, 0), "#1f1a18");
      add(T(box(0.14, 0.04, 0.27), 0.18, 0.84, 0), "#e2a92b");
    } else {
      add(T(dome(0.15, 12, 6), 0.16, 0.68, 0), style === "scout" ? "#8c8a52" : "#4a4440");
      add(T(box(0.05, 0.06, 0.24), 0.29, 0.67, 0), "#1b2533");
      for (const s of [-1, 1]) add(T(cyl(0.045, 0.045, 0.04, 8), 0.3, 0.67, s * 0.07, 0, 0, Math.PI / 2), "#b8d8e8");
      if (style !== "scout") for (let i = 0; i < 4; i++) add(T(cone(0.03, 0.12, 4), 0.1 + i * 0.05, 0.82 - Math.abs(i - 1.5) * 0.02, 0), "#cf4a2a"); // mohawk crest
    }
    return merge(P);
  });
}

/** an arm hanging down from the shoulder pivot (y = 0), with a held item */
function armGeo(item, jacket = LEATHER) {
  return cached(`arm-${item}-${jacket}`, () => {
    const P = [];
    const add = (g, c) => P.push(paint(g, c, 0.04, P.length + 5));
    add(T(box(0.11, 0.3, 0.11), 0, -0.15, 0), jacket);
    add(T(box(0.1, 0.26, 0.1), 0.03, -0.4, 0, 0, 0, -0.15), jacket);
    add(T(sph(0.065, 6, 5), 0.06, -0.55, 0), "#2a2422");
    if (item === "club") {
      add(T(cyl(0.035, 0.035, 0.6, 6), 0.06, -0.55, 0.0, Math.PI / 2), "#6b4a2e");
      add(T(box(0.16, 0.16, 0.12), 0.06, -0.55, 0.32), IRON2);
      add(T(cone(0.04, 0.16, 5), 0.06, -0.47, 0.36, 0, 0, 0), BONE);
    } else if (item === "blade") {
      add(T(box(0.04, 0.06, 0.5), 0.06, -0.55, 0.3), "#c8ccd0");
      add(T(box(0.06, 0.08, 0.1), 0.06, -0.55, 0.04), "#3a2f28");
    } else if (item === "maul") {
      add(T(cyl(0.04, 0.04, 0.85, 6), 0.06, -0.55, 0.12, Math.PI / 2), "#4a3a2a");
      add(T(box(0.3, 0.24, 0.24), 0.06, -0.55, 0.55), "#5c5853");
      add(T(box(0.32, 0.06, 0.26), 0.06, -0.43, 0.55), HAZ);
    }
    return merge(P);
  });
}

/* ================================================================ vehicles */
function bikeGeo(kind) {
  return cached(`bike-${kind}`, () => {
    const P = [];
    const add = (g, c, j = 0.06) => P.push(paint(g, c, j, P.length + 1));
    const main = kind === "scout" ? "#8f7a2c" : kind === "armored" ? "#55504c" : RUST;
    const wb = kind === "scout" ? 0.62 : 0.68; // half wheelbase
    // frame tubes
    add(T(box(wb * 2 - 0.2, 0.08, 0.1), 0, 0.42, 0, 0, 0, 0.08), IRON);
    add(T(box(0.08, 0.5, 0.08), wb - 0.08, 0.6, 0, 0, 0, -0.38), IRON); // fork
    // engine block + exhaust
    add(T(box(0.36, 0.28, 0.28), -0.05, 0.38, 0), "#2b2928");
    for (let i = 0; i < 3; i++) add(T(box(0.32, 0.03, 0.3), -0.05, 0.3 + i * 0.07, 0), "#4a4643");
    add(T(cylX(0.05, 0.75, 8), -0.35, 0.3, -0.18), "#6a625c");
    add(T(cylX(0.075, 0.12, 8), -0.75, 0.32, -0.18), "#2a2826");
    // tank + seat
    add(T(box(0.42, 0.2, 0.26), 0.2, 0.62, 0, 0, 0, 0.12), main);
    add(T(box(0.4, 0.08, 0.22), -0.18, 0.62, 0), "#2a2220");
    // handlebars
    add(T(box(0.05, 0.05, 0.62), wb - 0.22, 0.86, 0), IRON);
    for (const s of [-1, 1]) add(T(box(0.1, 0.06, 0.06), wb - 0.2, 0.86, s * 0.3), "#1c1a19");
    // front armour plate with teeth
    add(T(box(0.06, 0.4, 0.36), wb + 0.05, 0.62, 0, 0, 0, -0.3), main);
    for (let i = -1; i <= 1; i++) add(T(cone(0.04, 0.14, 4), wb + 0.14, 0.44, i * 0.11, 0, 0, -Math.PI / 2), BONE);
    // headlamp
    add(T(cylX(0.07, 0.08, 10), wb + 0.08, 0.8, 0), "#ffd27a");
    // mudguards
    add(T(box(0.42, 0.04, 0.18), wb, 0.42, 0, 0, 0, -0.1), main);
    add(T(box(0.46, 0.04, 0.2), -wb, 0.44, 0, 0, 0, 0.1), main);
    if (kind === "scout") {
      // pennant pole
      add(T(cyl(0.015, 0.015, 1.1, 4), -wb + 0.05, 1.05, -0.08), "#2a2826");
      add(T(prism([[0, 0], [0.42, 0.1], [0, 0.22]], 0.01), -wb + 0.06, 1.38, -0.08), "#d9b53a");
    }
    if (kind === "raider") {
      // scrap saddlebags
      for (const s of [-1, 1]) add(T(box(0.26, 0.2, 0.08), -0.35, 0.52, s * 0.17), "#5a3d28");
    }
    if (kind === "armored") {
      // trike: rear axle housing + side armour
      add(T(box(0.3, 0.2, 0.9), -wb, 0.45, 0), "#3a3735");
      for (const s of [-1, 1]) {
        add(T(box(0.8, 0.36, 0.06), -0.25, 0.55, s * 0.32), "#6d6863", 0.08);
        add(T(box(0.8, 0.05, 0.08), -0.25, 0.74, s * 0.33), HAZ);
      }
    }
    return merge(P);
  });
}

function sidecarGeo() {
  return cached("sidecar", () => {
    const P = [];
    const add = (g, c, j = 0.06) => P.push(paint(g, c, j, P.length + 1));
    // tub on the +Z (train) side
    add(T(box(1.0, 0.38, 0.55), -0.05, 0.52, 0.62), RUST2);
    add(T(box(0.4, 0.3, 0.5), 0.5, 0.5, 0.62, 0, 0, -0.5), RUST2);
    add(T(box(1.02, 0.05, 0.57), -0.05, 0.72, 0.62), HAZ);
    add(T(box(0.9, 0.06, 0.08), 0.0, 0.36, 0.3), IRON);
    // gun mount post
    add(T(cyl(0.05, 0.05, 0.3, 6), 0.15, 0.85, 0.62), IRON);
    return merge(P);
  });
}

function crossbowGeo() {
  return cached("ecrossbow", () => {
    const P = [];
    P.push(paint(T(box(0.7, 0.08, 0.1), 0.25, 0, 0), "#4a3a2a"));
    const arc = new THREE.TorusGeometry(0.34, 0.03, 5, 12, Math.PI * 0.6);
    arc.rotateX(Math.PI / 2);
    arc.rotateY(Math.PI * 0.7);
    P.push(paint(T(arc, 0.38, 0, 0), IRON2));
    P.push(paint(T(box(0.4, 0.05, 0.05), 0.4, 0.06, 0), "#d8cdb4"));
    P.push(paint(T(box(0.12, 0.12, 0.14), -0.05, -0.04, 0), "#2a2826"));
    return merge(P);
  });
}

function truckGeo(kind) {
  return cached(`truck-${kind}`, () => {
    const P = [];
    const add = (g, c, j = 0.07) => P.push(paint(g, c, j, P.length + 1));
    const big = kind === "hauler";
    const L = big ? 2.5 : 1.75;
    const Wd = big ? 0.95 : 0.8;
    // chassis
    add(T(box(L * 2, 0.24, Wd * 1.7), 0, 0.62, 0), IRON);
    // cab
    add(T(box(1.1, 0.75, Wd * 1.7), L - 0.75, 1.12, 0), RUST, 0.08);
    add(T(box(0.06, 0.18, Wd * 1.5), L - 0.18, 1.26, 0), "#141414"); // slit
    for (const s of [-1, 1]) add(T(box(0.5, 0.14, 0.04), L - 0.75, 1.26, s * Wd * 0.86), "#141414");
    add(T(box(1.14, 0.06, Wd * 1.74), L - 0.75, 1.5, 0), HAZ);
    // hood + grille + ram plow with spikes
    add(T(box(0.7, 0.5, Wd * 1.4), L + 0.1, 0.95, 0), RUST2);
    add(T(prism([[0, 0], [0.55, 0.15], [0.55, 0.65], [0, 0.85]], Wd * 2.1), L + 0.45, 0.25, 0), "#4a4642", 0.1);
    for (let i = -2; i <= 2; i++) add(T(cone(0.07, 0.36, 5), L + 1.12, 0.62, i * Wd * 0.4, 0, 0, -Math.PI / 2), BONE);
    // bed: armoured walls + junk
    const bx = big ? -0.6 : -0.5;
    const bl = big ? 2.9 : 1.9;
    for (const s of [-1, 1]) {
      add(T(box(bl, 0.55, 0.08), bx, 1.0, s * Wd * 0.85), "#5c4a3c", 0.1);
      add(T(box(bl, 0.05, 0.1), bx, 1.3, s * Wd * 0.86), HAZ);
      for (let k = 0; k < 4; k++) add(T(box(0.06, 0.6, 0.1), bx - bl / 2 + 0.2 + k * (bl - 0.4) / 3, 1.0, s * Wd * 0.88), IRON2);
    }
    add(T(box(0.08, 0.55, Wd * 1.7), bx - bl / 2, 1.0, 0), "#5c4a3c");
    add(T(box(0.5, 0.3, 0.5), bx - 0.3, 0.9, -0.2), "#6b5236");
    add(T(cyl(0.18, 0.18, 0.45, 10), bx + 0.4, 0.95, 0.25), "#3e4a3c");
    // exhaust stacks
    for (const s of [-1, 1]) {
      add(T(cyl(0.07, 0.07, 1.0, 8), L - 1.4, 1.6, s * Wd * 0.7), "#2a2826");
      add(T(cyl(0.1, 0.07, 0.12, 8), L - 1.4, 2.12, s * Wd * 0.7), "#1c1a19");
    }
    if (big) {
      // junk cannon mount on the bed + banner pole
      add(T(cyl(0.4, 0.45, 0.25, 14), bx + 0.3, 1.35, 0), IRON);
      add(T(cyl(0.03, 0.03, 2.2, 5), bx - 1.2, 2.2, -0.6), "#2a2826");
      add(T(box(0.04, 0.7, 0.9), bx - 1.2, 2.85, -0.15), CLOTH);
    }
    return merge(P);
  });
}

function cannonTop(kind) {
  return cached(`etop-${kind}`, () => {
    const P = [];
    const add = (g, c) => P.push(paint(g, c, 0.06, P.length + 1));
    if (kind === "hauler") {
      add(T(box(0.8, 0.5, 0.8), 0, 0.25, 0), RUST2);
      add(T(cylX(0.13, 1.4, 12), 0.8, 0.32, 0), IRON);
      add(T(cylX(0.18, 0.2, 12), 1.48, 0.32, 0), "#2a2826");
      add(T(box(0.82, 0.05, 0.82), 0, 0.5, 0), HAZ);
    } else if (kind === "warwagon") {
      add(T(cyl(0.95, 1.05, 0.65, 16), 0, 0.32, 0), "#5c4a3c");
      add(T(dome(0.8, 14, 5), 0, 0.64, 0, 0, 0, 0, 1, 0.55, 1), RUST);
      for (const z of [-0.3, 0, 0.3]) add(T(cylX(0.11, 1.8, 10), 1.3, 0.4, z), IRON);
      add(T(torus(0.98, 0.05, 6, 24), 0, 0.64, 0, Math.PI / 2), HAZ);
    } else if (kind === "walker") {
      add(T(cylX(0.32, 1.2, 14, 0.42), 0.2, 0.55, 0, 0, 0, 0.9), IRON);
      add(T(box(0.9, 0.6, 1.0), -0.15, 0.3, 0), RUST2);
      add(T(torus(0.42, 0.05, 6, 16), 0.55, 1.0, 0, 0, 0, Math.PI / 2 - 0.9), HAZ);
    } else if (kind === "leviathan") {
      add(T(box(1.4, 0.7, 1.4), 0, 0.35, 0), RUST2);
      add(T(box(1.44, 0.06, 1.44), 0, 0.72, 0), HAZ);
      for (const z of [-0.25, 0.25]) add(T(cylX(0.14, 2.0, 10), 1.5, 0.42, z), IRON);
    }
    return merge(P);
  });
}

/* ================================================================ rigs */
function rigBase(type) {
  const root = new THREE.Group();
  const flip = new THREE.Group(); // mirrors to face the train
  const body = new THREE.Group(); // lean / bob / lunge
  root.add(flip);
  flip.add(body);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.15, flatShading: true, transparent: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basicMat("tc-eshadow", { map: blobTexture(), color: "#000000", transparent: true, opacity: 0.38, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  shadow.renderOrder = 1;
  root.add(shadow);
  // hostile marker: a soft red ring on the ground, readable in any light
  const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), basicMat("tc-ering", { map: ringTexture(), color: "#ff4a3a", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  ring.renderOrder = 2;
  root.add(ring);
  return { type, root, flip, body, mat, shadow, ring, wheels: [], parts: {}, hpShown: 1 };
}

function addMesh(rig, geo, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, rig.mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function addWheel(rig, geo, parent, x, y, z, r) {
  const m = addMesh(rig, geo, parent, x, y, z);
  m.userData.r = r;
  rig.wheels.push(m);
  return m;
}

function hpBar(rig, w, y) {
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.06, 0.15), basicMat("tc-hpbg", { color: "#120f0e", transparent: true, opacity: 0.78, depthTest: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.09), new THREE.MeshBasicMaterial({ color: "#ff5a3c", depthTest: false }));
  fill.position.z = 0.001;
  bg.renderOrder = 20;
  fill.renderOrder = 21;
  bar.add(bg, fill);
  bar.position.y = y;
  rig.root.add(bar);
  rig.bar = bar;
  rig.barFill = fill;
  rig.barW = w;
}

export function buildEnemy(type) {
  const rig = rigBase(type);
  const b = rig.body;
  if (type === "raider" || type === "scout" || type === "armored") {
    const kind = type;
    addMesh(rig, bikeGeo(kind), b);
    const wb = kind === "scout" ? 0.62 : 0.68;
    const wr = kind === "armored" ? 0.36 : kind === "scout" ? 0.32 : 0.34;
    const wg = wheel(wr, kind === "armored" ? 0.2 : 0.13, IRON2, "#1e1d1c", kind === "raider" ? 2 : 0);
    addWheel(rig, wg, b, wb, wr, 0, wr);
    if (kind === "armored") {
      addWheel(rig, wg, b, -wb, wr, 0.42, wr);
      addWheel(rig, wg, b, -wb, wr, -0.42, wr);
    } else addWheel(rig, wg, b, -wb, wr, 0, wr);
    const rider = new THREE.Group();
    rider.position.set(-0.12, 0.72, 0);
    b.add(rider);
    addMesh(rig, riderGeo(kind), rider);
    const jacket = kind === "scout" ? "#6d6a3a" : kind === "armored" ? IRON2 : LEATHER;
    const arm = new THREE.Group();
    arm.position.set(0.1, 0.48, 0.2);
    rider.add(arm);
    addMesh(rig, armGeo(kind === "armored" ? "maul" : kind === "scout" ? "blade" : "club", jacket), arm);
    const arm2 = new THREE.Group();
    arm2.position.set(0.14, 0.46, -0.2);
    arm2.rotation.z = -1.1;
    rider.add(arm2);
    addMesh(rig, armGeo("none", jacket), arm2);
    rig.parts = { rider, arm, arm2 };
    rig.shadow.scale.set(1.9, 0.9, 1);
    hpBar(rig, 0.9, kind === "armored" ? 2.15 : 2.0);
    rig.scale = kind === "armored" ? 1.45 : kind === "scout" ? 1.25 : 1.35;
  } else if (type === "ranged") {
    addMesh(rig, bikeGeo("raider"), b);
    addMesh(rig, sidecarGeo(), b);
    const wg = wheel(0.34, 0.13);
    addWheel(rig, wg, b, 0.68, 0.34, 0, 0.34);
    addWheel(rig, wg, b, -0.68, 0.34, 0, 0.34);
    addWheel(rig, wheel(0.28, 0.12), b, -0.05, 0.28, 0.95, 0.28);
    const driver = new THREE.Group();
    driver.position.set(-0.12, 0.72, 0);
    b.add(driver);
    addMesh(rig, riderGeo("raider"), driver);
    const gunner = new THREE.Group();
    gunner.position.set(-0.25, 0.62, 0.62);
    b.add(gunner);
    addMesh(rig, riderGeo("scout"), gunner);
    const aim = new THREE.Group();
    aim.position.set(0.3, 0.38, 0.0);
    gunner.add(aim);
    addMesh(rig, crossbowGeo(), aim);
    rig.parts = { gunner, aim };
    rig.shadow.scale.set(2.1, 1.6, 1);
    rig.shadow.position.z = 0.3;
    hpBar(rig, 1.0, 2.0);
    rig.scale = 1.32;
  } else if (type === "vehicle" || type === "hauler") {
    const big = type === "hauler";
    addMesh(rig, truckGeo(type), b);
    const r = big ? 0.6 : 0.5;
    const wg = wheel(r, big ? 0.32 : 0.28, IRON2, "#1e1d1c", 4);
    const xs = big ? [1.75, 0.2, -1.6] : [1.15, -1.2];
    const Wd = big ? 0.95 : 0.8;
    for (const x of xs) for (const s of [-1, 1]) addWheel(rig, wg, b, x, r, s * Wd * 0.95, r);
    // crew in the bed
    const crew = new THREE.Group();
    crew.position.set(big ? -1.4 : -0.9, 1.0, 0.25);
    b.add(crew);
    addMesh(rig, riderGeo("raider"), crew);
    const arm = new THREE.Group();
    arm.position.set(0.1, 0.48, 0.2);
    crew.add(arm);
    addMesh(rig, armGeo("club"), arm);
    rig.parts = { crew, arm };
    if (big) {
      const top = new THREE.Group();
      top.position.set(-0.3, 1.45, 0);
      b.add(top);
      addMesh(rig, cannonTop("hauler"), top);
      rig.parts.top = top;
    }
    rig.shadow.scale.set(big ? 6.4 : 4.4, big ? 2.6 : 2.2, 1);
    hpBar(rig, big ? 2.2 : 1.6, big ? 3.6 : 2.8);
    rig.scale = big ? 1.2 : 1.15;
    rig.exhaust = [new THREE.Vector3((big ? 2.5 : 1.75) - 1.4, 2.2, Wd * 0.7)];
  } else if (type === "warwagon") {
    addMesh(
      rig,
      cached("warwagon-hull", () => {
        const P = [];
        const add = (g, c, j = 0.08) => P.push(paint(g, c, j, P.length + 1));
        // tracked hull
        for (const s of [-1, 1]) {
          add(T(box(5.2, 0.9, 0.7), 0, 0.55, s * 1.25), "#2b2928");
          add(T(box(5.0, 0.08, 0.74), 0, 1.02, s * 1.25), "#44403c");
          for (let k = 0; k < 13; k++) add(T(box(0.12, 0.92, 0.74), -2.4 + k * 0.4, 0.55, s * 1.25), "#1c1b1a");
          add(T(box(5.0, 0.55, 0.08), 0, 1.25, s * 1.62), RUST, 0.1);
          for (let k = 0; k < 6; k++) add(T(sph(0.05, 5, 3), -2.2 + k * 0.88, 1.3, s * 1.67), IRON2);
        }
        add(T(box(5.0, 0.95, 2.2), 0, 1.35, 0), RUST2);
        add(T(prism([[0, 0], [1.1, 0.4], [1.1, 1.1], [0, 1.4]], 3.2), 2.5, 0.5, 0), "#4a4642");
        for (let i = -3; i <= 3; i++) add(T(cone(0.09, 0.5, 5), 3.75, 1.0, i * 0.42, 0, 0, -Math.PI / 2), BONE);
        add(T(box(5.0, 0.08, 2.26), 0, 1.84, 0), HAZ);
        // boiler vents (glow when open — separate mesh)
        for (const s of [-1, 1]) add(T(cyl(0.18, 0.2, 1.2, 10), -1.9, 2.4, s * 0.7), "#2a2826");
        return merge(P);
      }),
      b
    );
    const top = new THREE.Group();
    top.position.set(0.3, 1.88, 0);
    b.add(top);
    addMesh(rig, cannonTop("warwagon"), top);
    rig.parts = { top };
    const ventMat = new THREE.MeshStandardMaterial({ color: "#331100", emissive: "#ff6a1a", emissiveIntensity: 0.2 });
    const vents = new THREE.Mesh(cached("ww-vents", () => merge([-1, 1].map((s) => paint(T(cyl(0.14, 0.14, 0.05, 10), -1.9, 3.02, s * 0.7), "#ffffff")))), ventMat);
    b.add(vents);
    rig.ventMat = ventMat;
    // track "wheels" (road wheels) visible through the gaps
    const wg = wheel(0.32, 0.5, IRON2);
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) addWheel(rig, wg, b, -2 + k, 0.36, s * 1.25, 0.32);
    rig.shadow.scale.set(7.5, 4.6, 1);
    hpBar(rig, 3.0, 4.2);
    rig.scale = 1;
    rig.exhaust = [new THREE.Vector3(-1.9, 3.1, 0.7), new THREE.Vector3(-1.9, 3.1, -0.7)];
  } else if (type === "walker") {
    const hull = new THREE.Group();
    hull.position.y = 2.6;
    b.add(hull);
    addMesh(
      rig,
      cached("walker-hull", () => {
        const P = [];
        const add = (g, c, j = 0.08) => P.push(paint(g, c, j, P.length + 1));
        add(T(box(3.2, 1.1, 2.2), 0, 0, 0), RUST2);
        add(T(prism([[0, -0.55], [0.8, -0.2], [0.8, 0.3], [0, 0.55]], 2.0), 1.6, 0, 0), RUST);
        add(T(box(0.1, 0.18, 1.6), 2.42, 0.1, 0), "#140f0c");
        add(T(box(3.24, 0.08, 2.24), 0, 0.58, 0), HAZ);
        for (const s of [-1, 1]) for (let k = 0; k < 5; k++) add(T(sph(0.06, 5, 3), -1.3 + k * 0.65, 0.3, s * 1.12), IRON2);
        add(T(cyl(0.12, 0.12, 0.9, 8), -1.2, 0.9, 0.6), "#2a2826");
        return merge(P);
      }),
      hull
    );
    const top = new THREE.Group();
    top.position.set(-0.3, 0.6, 0);
    hull.add(top);
    addMesh(rig, cannonTop("walker"), top);
    // four legs: hip at hull, thigh + shin, pivot animated
    const legGeo = cached("walker-leg", () =>
      merge([paint(T(box(0.32, 1.4, 0.32), 0, -0.7, 0), IRON), paint(T(sph(0.26, 8, 6), 0, 0, 0), IRON2), paint(T(box(0.6, 0.12, 0.5), 0.1, -1.38, 0), "#2a2826")])
    );
    const thighGeo = cached("walker-thigh", () => merge([paint(T(box(0.4, 1.2, 0.4), 0, -0.6, 0), RUST2), paint(T(sph(0.3, 8, 6), 0, 0, 0), IRON)]));
    const legs = [];
    for (const [x, z] of [[1.1, 1.25], [1.1, -1.25], [-1.1, 1.25], [-1.1, -1.25]]) {
      const hip = new THREE.Group();
      hip.position.set(x, 2.4, z);
      b.add(hip);
      addMesh(rig, thighGeo, hip);
      const knee = new THREE.Group();
      knee.position.set(0, -1.2, 0);
      hip.add(knee);
      addMesh(rig, legGeo, knee);
      legs.push({ hip, knee, phase: (x > 0 ? 0 : Math.PI) + (z > 0 ? 0 : Math.PI) });
    }
    rig.parts = { hull, top, legs };
    rig.shadow.scale.set(5, 4, 1);
    hpBar(rig, 3.0, 4.8);
    rig.scale = 1;
    rig.exhaust = [new THREE.Vector3(-1.2, 4.0, 0.6)];
  } else if (type === "captain") {
    addMesh(
      rig,
      cached("captain-car", () => {
        const P = [];
        const add = (g, c, j = 0.07) => P.push(paint(g, c, j, P.length + 1));
        add(T(box(4.0, 0.4, 1.9), 0, 0.7, 0), "#2a2420");
        add(T(prism([[0, 0], [1.3, 0.1], [1.3, 0.45], [0, 0.75]], 1.8), 1.2, 0.6, 0), "#7a1f1a");
        add(T(box(1.6, 0.5, 1.9), -0.9, 1.1, 0), "#7a1f1a", 0.09);
        add(T(box(1.64, 0.06, 1.94), -0.9, 1.36, 0), HAZ);
        add(T(box(0.06, 0.45, 1.7), 0.55, 1.2, 0, 0, 0, -0.4), "#9cc8e0"); // windscreen
        for (let i = -2; i <= 2; i++) add(T(cone(0.07, 0.4, 5), 2.3, 0.75, i * 0.36, 0, 0, -Math.PI / 2), BONE);
        for (const s of [-1, 1]) {
          add(T(cylX(0.08, 1.5, 8), -0.4, 0.5, s * 1.0), "#c0b8a8"); // side pipes
          add(T(box(1.2, 0.3, 0.06), 1.0, 0.85, s * 0.96), RUST);
        }
        add(T(cyl(0.03, 0.03, 2.6, 5), -1.5, 2.4, -0.7), "#2a2826");
        add(T(box(0.04, 0.9, 1.3), -1.5, 3.2, -0.05), CLOTH);
        add(T(box(0.05, 0.3, 0.3), -1.5, 3.25, -0.05), BONE);
        return merge(P);
      }),
      b
    );
    const wg = wheel(0.5, 0.36, "#8a8070", "#1e1d1c", 6);
    for (const x of [1.4, -1.4]) for (const s of [-1, 1]) addWheel(rig, wg, b, x, 0.5, s * 0.95, 0.5);
    const cap = new THREE.Group();
    cap.position.set(-0.4, 1.4, 0.1);
    b.add(cap);
    addMesh(rig, riderGeo("captain"), cap);
    const arm = new THREE.Group();
    arm.position.set(0.1, 0.48, 0.2);
    cap.add(arm);
    addMesh(rig, armGeo("blade", "#3a2420"), arm);
    rig.parts = { crew: cap, arm };
    rig.shadow.scale.set(5.2, 2.6, 1);
    hpBar(rig, 2.6, 3.8);
    rig.scale = 1;
    rig.exhaust = [new THREE.Vector3(-2.0, 0.55, 1.0), new THREE.Vector3(-2.0, 0.55, -1.0)];
  } else if (type === "leviathan") {
    // an armoured enemy train on the parallel line: engine + two gun cars
    const cars = [];
    const carGeo = cached("lev-car", () => {
      const P = [];
      const add = (g, c, j = 0.08) => P.push(paint(g, c, j, P.length + 1));
      add(T(box(5.2, 0.3, 1.6), 0, 0.85, 0), IRON);
      add(T(box(5.0, 1.0, 2.5), 0, 1.5, 0), RUST2);
      add(T(box(5.04, 0.08, 2.54), 0, 2.02, 0), HAZ);
      for (const s of [-1, 1]) for (let k = 0; k < 8; k++) add(T(sph(0.06, 5, 3), -2.2 + k * 0.63, 1.8, s * 1.27), IRON2);
      for (const x of [-1.6, 1.6]) add(T(box(1.6, 0.4, 1.7), x, 0.45, 0), "#2a2826");
      return merge(P);
    });
    const engGeo = cached("lev-engine", () => {
      const P = [];
      const add = (g, c, j = 0.08) => P.push(paint(g, c, j, P.length + 1));
      add(T(box(6.0, 0.3, 1.6), 0, 0.85, 0), IRON);
      add(T(cylX(0.95, 4.2, 16), 0.6, 1.95, 0), RUST);
      add(T(box(1.8, 2.2, 2.6), -2.0, 2.0, 0), RUST2);
      add(T(prism([[0, 0], [1.0, 0.2], [1.0, 1.4], [0, 1.9]], 2.6), 2.9, 0.4, 0), "#4a4642");
      for (let i = -3; i <= 3; i++) add(T(cone(0.09, 0.5, 5), 4.0, 0.95, i * 0.35, 0, 0, -Math.PI / 2), BONE);
      add(T(cyl(0.32, 0.4, 1.2, 12), 1.8, 3.2, 0), "#1c1a19");
      add(T(box(1.84, 0.08, 2.64), -2.0, 3.12, 0), HAZ);
      add(T(box(0.06, 0.3, 1.6), -1.08, 2.5, 0), "#ff7a2a");
      for (const x of [-1.8, 0, 1.8]) add(T(box(1.2, 0.4, 1.7), x, 0.45, 0), "#2a2826");
      return merge(P);
    });
    const xs = [6.4, 0, -5.8];
    xs.forEach((x, i) => {
      const g = new THREE.Group();
      g.position.x = x;
      b.add(g);
      addMesh(rig, i === 0 ? engGeo : carGeo, g);
      if (i > 0) {
        const top = new THREE.Group();
        top.position.set(0, 2.06, 0);
        g.add(top);
        addMesh(rig, cannonTop("leviathan"), top);
        cars.push(top);
      }
    });
    const wg = wheel(0.45, 0.14, "#5a5450", "#2a2826");
    for (const x of [8.2, 7.0, 5.0, 1.6, -1.6, -4.2, -7.4]) for (const s of [-1, 1]) addWheel(rig, wg, b, x, 0.45, s * 0.75, 0.45);
    const ventMat = new THREE.MeshStandardMaterial({ color: "#331100", emissive: "#ff6a1a", emissiveIntensity: 0.2 });
    const vents = new THREE.Mesh(cached("lev-vents", () => merge([0, -5.8].map((x) => paint(T(box(1.2, 0.06, 0.5), x, 2.08, -0.6), "#ffffff")))), ventMat);
    b.add(vents);
    rig.ventMat = ventMat;
    rig.parts = { tops: cars };
    rig.shadow.scale.set(19, 3.4, 1);
    hpBar(rig, 4.0, 4.6);
    rig.scale = 1;
    rig.exhaust = [new THREE.Vector3(8.2, 3.9, 0)];
  }
  const sx = rig.shadow.scale.x;
  const sy = rig.shadow.scale.y;
  rig.ring.scale.set(Math.max(sx, sy) * 0.75 + 0.6, Math.max(sx, sy) * 0.75 + 0.6, 1);
  rig.ring.position.z = rig.shadow.position.z;
  rig.root.traverse((o) => {
    if (o.isMesh && o !== rig.shadow && o !== rig.ring && !(rig.bar && (o.parent === rig.bar))) o.castShadow = true;
  });
  return rig;
}

export function resetRig(rig) {
  rig.root.visible = true;
  rig.root.rotation.set(0, 0, 0);
  rig.root.scale.setScalar(rig.scale || 1);
  rig.flip.scale.set(1, 1, 1);
  rig.body.position.set(0, 0, 0);
  rig.body.rotation.set(0, 0, 0);
  rig.mat.opacity = 1;
  rig.mat.transparent = false;
  rig.mat.emissive.setRGB(0, 0, 0);
  rig.hpShown = 1;
  rig.shadow.visible = true;
  rig.ring.visible = true;
  rig.heading = null;
  rig.wheelA = 0;
  rig.walk = 0;
  if (rig.bar) rig.bar.visible = false;
  if (rig.parts.arm) rig.parts.arm.rotation.set(-0.35, 0, 0);
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Pose a rig from engine state. `e` = engine enemy, dt = animation step
 * (0 while paused), t = engine clock.
 */
export function animateEnemy(rig, e, dt, t, attack) {
  const gs = Math.hypot(e.gvx, e.gvz);
  // wheels roll with ground speed (sign from forward motion)
  const roll = (e.gvx >= -0.2 ? 1 : -1) * gs * dt;
  for (const w of rig.wheels) w.rotation.z -= roll / w.userData.r;
  // heading follows ground velocity (stable when slow); bosses keep facing forward
  const want = gs > 1.2 ? Math.atan2(-e.gvz, Math.max(0.6, e.gvx)) : 0;
  if (rig.heading == null) rig.heading = want;
  rig.heading += (want - rig.heading) * (1 - Math.exp(-5 * dt));
  rig.root.rotation.y = rig.heading;
  // lean into lateral motion + engine vibration
  const vib = dt > 0 ? Math.sin(t * 40 + e.id) * 0.012 : 0;
  rig.body.rotation.x = -Math.max(-0.35, Math.min(0.35, e.gvz * 0.05)) * (rig.flip.scale.z || 1);
  rig.body.position.y = vib;
  const dying = e.state === "DYING";
  const def = e.def;
  // attack poses
  const a = def.attack;
  if (!dying && a && e.atkT >= 0) {
    const w = a.windup;
    const k = e.atkT;
    if (a.kind === "melee" && rig.parts.arm) {
      // raise over the train side, slam on the impact frame, recover
      const up = -2.5;
      const hit = -0.85;
      let rx;
      if (k < w * 0.7) rx = -0.35 + (up + 0.35) * (k / (w * 0.7));
      else if (k < w) rx = up + (hit - up) * ((k - w * 0.7) / (w * 0.3));
      else rx = hit + (-0.35 - hit) * clamp01((k - w) / 0.35);
      rig.parts.arm.rotation.x = rx;
      rig.parts.rider.rotation.x = -Math.min(0.25, k * 0.6);
    } else if (a.kind === "ram") {
      // swerve away, then lunge into the car on the impact frame
      let off;
      if (k < w) off = -0.45 * Math.sin((k / w) * Math.PI * 0.5);
      else off = -0.45 + 0.9 * clamp01((k - w) / 0.12) - 0.45 * clamp01((k - w - 0.12) / 0.25);
      rig.body.position.z = off;
      rig.body.rotation.x += off * 0.08;
      if (rig.parts.arm) rig.parts.arm.rotation.x = k < w ? -2.2 : -0.9;
    } else if (a.kind === "ranged" && rig.parts.aim) {
      rig.parts.aim.rotation.z = k < w ? 0.15 * (k / w) : 0.15 - 0.25 * clamp01((k - w) / 0.15);
    }
  } else if (!dying) {
    if (rig.parts.arm) rig.parts.arm.rotation.x += (-0.35 - rig.parts.arm.rotation.x) * (1 - Math.exp(-8 * dt));
    if (rig.parts.rider) rig.parts.rider.rotation.x *= 1 - Math.min(1, dt * 6);
    rig.body.position.z *= 1 - Math.min(1, dt * 8);
  }
  // ranged gunner turns toward the train (+Z in model space)
  if (rig.parts.gunner) rig.parts.gunner.rotation.y = -0.9;
  // walker gait
  if (rig.parts.legs) {
    rig.walk += gs * dt * 0.9 + (dt > 0 ? dt * 0.6 : 0);
    for (const L of rig.parts.legs) {
      const p = rig.walk + L.phase;
      L.hip.rotation.z = Math.sin(p) * 0.35;
      L.knee.rotation.z = -Math.max(0, Math.cos(p)) * 0.5;
    }
    rig.parts.hull.position.y = 2.6 + Math.abs(Math.sin(rig.walk * 2)) * 0.12;
  }
  // boss turrets track the train side
  if (rig.parts.top && e.boss) rig.parts.top.rotation.y = Math.sin(t * 0.7) * 0.15 - 1.2;
  if (rig.parts.tops) rig.parts.tops.forEach((tp, i) => (tp.rotation.y = -1.25 + Math.sin(t * 0.8 + i) * 0.12));
  if (rig.ventMat) rig.ventMat.emissiveIntensity = e.ventT > 0 ? 2.2 + Math.sin(t * 18) * 0.6 : 0.2;
  // hit flash
  // brief, modest hit flash (rapid fire must not bleach the model)
  const flash = e.hitT > 0.06 && !dying ? (e.hitT - 0.06) / 0.06 : 0;
  const fk = e.boss || def.vehicle ? 0.22 : 0.4;
  rig.mat.emissive.setRGB(flash * fk, flash * fk * 0.8, flash * fk * 0.6);
  // defeat: tip over, sink, fade
  if (dying) {
    const k = e.deadT;
    const veh = def.vehicle || e.boss;
    if (!veh) {
      rig.body.rotation.x = -Math.min(1.35, k * 3.2);
      rig.body.position.y = -Math.max(0, k - 0.6) * 0.5;
    } else {
      rig.body.rotation.z = Math.min(0.12, k * 0.2);
      rig.body.position.y = -Math.max(0, k - 0.8) * 0.6;
      rig.mat.color.setRGB(Math.max(0.35, 1 - k * 0.9), Math.max(0.3, 1 - k), Math.max(0.3, 1 - k));
    }
    const fade = clamp01(1 - (k - (veh ? 1.0 : 0.65)) / 0.55);
    rig.mat.transparent = fade < 1;
    rig.mat.opacity = fade;
    rig.shadow.visible = fade > 0.3;
    rig.ring.visible = false;
  } else rig.mat.color.setRGB(1, 1, 1);
}
