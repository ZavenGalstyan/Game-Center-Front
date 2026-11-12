/**
 * Low-poly models built from primitives: the four clown rigs, the
 * first-person arms + weapons, pickups, carnival furniture and the two big
 * rides (carousel, Ferris wheel). Geometries are shared; enemy materials are
 * cloned per enemy only so hit flashes stay individual.
 * All rigs face −Z (yaw 0), matching the sim.
 */
import * as THREE from "three";
import { skinTexture, costumeTexture, glowTexture } from "./textures.js";

const geo = new Map();
function G(key, make) {
  if (!geo.has(key)) geo.set(key, make());
  return geo.get(key);
}
const box = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cap = (r, l) => G(`c${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 8));
const sph = (r, a = 12, b = 10) => G(`s${r},${a}`, () => new THREE.SphereGeometry(r, a, b));
const cyl = (rt, rb, h, n = 10) => G(`y${rt},${rb},${h},${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const cone = (r, h, n = 8) => G(`k${r},${h},${n}`, () => new THREE.ConeGeometry(r, h, n));
const torus = (r, t, a = 8, b = 16) => G(`t${r},${t},${a},${b}`, () => new THREE.TorusGeometry(r, t, a, b));

const sharedMats = new Map();
function M(key, make) {
  if (!sharedMats.has(key)) sharedMats.set(key, make());
  return sharedMats.get(key);
}
const std = (key, col, opt = {}) => M(key, () => new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, ...opt }));
const basic = (key, col, opt = {}) => M(key, () => new THREE.MeshBasicMaterial({ color: col, ...opt }));

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
  const flashy = []; // materials that flash on hit
  const own = (m) => (flashy.push(m), m);
  const root = new THREE.Group();
  const P = {};
  const dark = std("dark", 0x141016, { roughness: 0.9 });
  const red = std("red", 0xc81a1a, { roughness: 0.4 });
  const white = std("white", 0xefe6d8, { roughness: 0.6 });
  const gold = std("gold", 0xd8a83a, { roughness: 0.35, metalness: 0.6 });
  const limbs = (cloth, skin, shoe, o) => {
    for (const s of [-1, 1]) {
      const sh = pivot(P.torso, s * o.sw, o.sy, 0);
      mesh(cap(o.ar, o.al), cloth, 0, -o.al * 0.6, 0, sh);
      const el = pivot(sh, 0, -o.al * 1.3, 0);
      mesh(cap(o.ar * 0.9, o.al * 0.9), cloth, 0, -o.al * 0.5, 0, el);
      // white gloves
      mesh(sph(o.ar * 1.5), o.glove || white, 0, -o.al * 1.15, -0.02, el);
      P[s < 0 ? "armL" : "armR"] = sh;
      P[s < 0 ? "foreL" : "foreR"] = el;
      const hip = pivot(P.hips, s * o.hw, -0.06, 0);
      mesh(cap(o.lr, o.ll), cloth, 0, -o.ll * 0.65, 0, hip);
      const kn = pivot(hip, 0, -o.ll * 1.35, 0);
      mesh(cap(o.lr * 0.9, o.ll * 0.9), cloth, 0, -o.ll * 0.55, 0, kn);
      // oversized shoes
      const foot = mesh(box(o.fw, o.fh, o.fl), shoe, 0, -o.ll * 1.2, -o.fl * 0.28, kn);
      if (o.curl) {
        const tip = mesh(cone(o.fw * 0.4, o.fl * 0.5), shoe, 0, o.fh * 0.6, -o.fl * 0.55, foot);
        tip.rotation.x = -1.2;
      }
      P[s < 0 ? "legL" : "legR"] = hip;
      P[s < 0 ? "shinL" : "shinR"] = kn;
    }
  };
  if (type === "clown") {
    const suit = own(new THREE.MeshStandardMaterial({ map: costumeTexture("polka"), roughness: 0.85 }));
    const face = own(new THREE.MeshStandardMaterial({ map: skinTexture("pale"), roughness: 0.6 }));
    const hair = std("hairOrange", 0xe8601a, { roughness: 1 });
    P.hips = pivot(root, 0, 0.92, 0);
    mesh(sph(0.3), suit, 0, 0, 0, P.hips).scale.set(1.1, 0.8, 0.9); // baggy pants
    P.torso = pivot(P.hips, 0, 0.12, 0);
    P.torso.rotation.x = -0.12;
    mesh(sph(0.34), suit, 0, 0.28, 0, P.torso).scale.set(1, 1.15, 0.85); // round belly
    for (let i = 0; i < 3; i++) mesh(sph(0.045), red, 0, 0.48 - i * 0.14, -0.28, P.torso); // pom-pom buttons
    mesh(torus(0.2, 0.07, 6, 14), white, 0, 0.62, 0, P.torso).rotation.x = Math.PI / 2; // ruff collar
    P.head = pivot(P.torso, 0, 0.72, -0.02);
    mesh(sph(0.24), face, 0, 0.12, 0, P.head).scale.set(1, 1.1, 1);
    mesh(sph(0.075), red, 0, 0.1, -0.24, P.head); // nose
    mesh(box(0.22, 0.05, 0.04), dark, 0, -0.02, -0.21, P.head); // stitched grin
    for (const s of [-1, 1]) {
      mesh(box(0.035, 0.08, 0.03), red, s * 0.1, 0.02, -0.21, P.head).rotation.z = s * 0.6; // grin corners up
      mesh(box(0.05, 0.11, 0.03), dark, s * 0.09, 0.22, -0.2, P.head); // diamond eye paint
      mesh(sph(0.026), basic("eyeClown", 0xfff060), s * 0.09, 0.22, -0.225, P.head);
      const tuft = mesh(sph(0.13, 8, 6), hair, s * 0.22, 0.2, 0.04, P.head);
      tuft.scale.set(0.9, 1.1, 1);
    }
    mesh(cone(0.08, 0.2), red, 0, 0.42, 0, P.head); // tiny hat
    limbs(suit, face, red, { sw: 0.32, sy: 0.48, ar: 0.07, al: 0.28, hw: 0.15, lr: 0.1, ll: 0.3, fw: 0.16, fh: 0.1, fl: 0.42 });
    P.armBase = -1.0;
  } else if (type === "jester") {
    const suit = own(new THREE.MeshStandardMaterial({ map: costumeTexture("diamond"), roughness: 0.75 }));
    const mask = own(new THREE.MeshStandardMaterial({ map: skinTexture("pale"), roughness: 0.4 }));
    const purple = std("jPurple", 0x6a1a8a);
    const green = std("jGreen", 0x1a7a4a);
    P.hips = pivot(root, 0, 0.82, 0);
    mesh(box(0.3, 0.16, 0.2), suit, 0, 0, 0, P.hips);
    P.torso = pivot(P.hips, 0, 0.06, 0);
    P.torso.rotation.x = -0.5; // hunched sprinter
    mesh(box(0.34, 0.5, 0.22), suit, 0, 0.28, 0, P.torso);
    // zig-zag collar
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = mesh(cone(0.06, 0.16, 4), i % 2 ? purple : green, Math.cos(a) * 0.17, 0.56, Math.sin(a) * 0.14, P.torso);
      p.rotation.z = -Math.cos(a) * 1.2;
      p.rotation.x = Math.sin(a) * 1.2;
    }
    P.head = pivot(P.torso, 0, 0.66, -0.04);
    P.head.rotation.x = 0.35;
    mesh(sph(0.19), mask, 0, 0.08, 0, P.head).scale.set(0.95, 1.15, 1);
    mesh(box(0.2, 0.04, 0.04), dark, 0, 0.0, -0.17, P.head); // wide smile
    for (const s of [-1, 1]) {
      mesh(box(0.06, 0.03, 0.03), dark, s * 0.11, 0.03, -0.15, P.head).rotation.z = s * -0.7;
      mesh(sph(0.03), basic("eyeJester", 0x5affd0), s * 0.07, 0.12, -0.17, P.head);
      mesh(box(0.02, 0.1, 0.02), dark, s * 0.07, 0.03, -0.18, P.head); // tear lines
    }
    // three-pointed hat with bells
    for (const [s, m] of [[-1, purple], [0, green], [1, purple]]) {
      const h = pivot(P.head, s * 0.1, 0.24, 0);
      h.rotation.z = -s * 0.9;
      h.rotation.x = s === 0 ? -0.7 : 0;
      mesh(cone(0.07, 0.36, 6), m, 0, 0.18, 0, h);
      mesh(sph(0.045), gold, 0, 0.38, 0, h);
    }
    limbs(suit, mask, purple, { sw: 0.22, sy: 0.44, ar: 0.05, al: 0.28, hw: 0.11, lr: 0.065, ll: 0.3, fw: 0.1, fh: 0.07, fl: 0.32, curl: true, glove: green });
    P.armBase = -0.5;
  } else if (type === "armored") {
    const plate = own(new THREE.MeshStandardMaterial({ map: costumeTexture("plate"), roughness: 0.45, metalness: 0.55 }));
    const suit = own(new THREE.MeshStandardMaterial({ map: costumeTexture("polka"), roughness: 0.85, color: 0x9a8a8a }));
    const face = own(new THREE.MeshStandardMaterial({ map: skinTexture("pale"), roughness: 0.6 }));
    const iron = std("iron", 0x4a4640, { metalness: 0.6, roughness: 0.5 });
    P.hips = pivot(root, 0, 1.0, 0);
    mesh(box(0.6, 0.3, 0.4), plate, 0, 0, 0, P.hips);
    P.torso = pivot(P.hips, 0, 0.14, 0);
    P.torso.rotation.x = -0.1;
    mesh(box(0.8, 0.7, 0.5), suit, 0, 0.36, 0, P.torso);
    mesh(box(0.84, 0.62, 0.12), plate, 0, 0.38, -0.27, P.torso); // breastplate
    for (const s of [-1, 1]) mesh(sph(0.22, 10, 8), plate, s * 0.5, 0.72, 0, P.torso).scale.set(1, 0.7, 1); // pauldrons
    P.head = pivot(P.torso, 0, 0.86, -0.06);
    mesh(sph(0.23), face, 0, 0.1, 0, P.head);
    // dented cooking-pot helmet with a visor slot
    mesh(cyl(0.27, 0.26, 0.26, 12), iron, 0, 0.24, 0, P.head);
    mesh(box(0.34, 0.05, 0.08), iron, 0, 0.12, -0.24, P.head);
    mesh(sph(0.07), red, 0, 0.05, -0.23, P.head); // nose
    mesh(box(0.2, 0.04, 0.04), dark, 0, -0.05, -0.2, P.head);
    for (const s of [-1, 1]) mesh(sph(0.03), basic("eyeArmored", 0xff5020), s * 0.08, 0.17, -0.235, P.head);
    mesh(box(0.08, 0.1, 0.08), red, 0, 0.42, 0, P.head); // helmet plume
    limbs(suit, face, iron, { sw: 0.5, sy: 0.6, ar: 0.11, al: 0.32, hw: 0.2, lr: 0.13, ll: 0.32, fw: 0.2, fh: 0.12, fl: 0.44, glove: iron });
    // giant mallet in the right hand
    const mallet = pivot(P.foreR, 0, -0.42, -0.05);
    mesh(cyl(0.035, 0.035, 1.1, 8), std("handle", 0x5a3a20), 0, 0, -0.3, mallet).rotation.x = Math.PI / 2;
    const headM = mesh(cyl(0.2, 0.2, 0.42, 12), red, 0, 0, -0.82, mallet);
    headM.rotation.z = Math.PI / 2;
    mesh(cyl(0.21, 0.21, 0.06, 12), white, 0.16, 0, -0.82, mallet).rotation.z = Math.PI / 2;
    mesh(cyl(0.21, 0.21, 0.06, 12), white, -0.16, 0, -0.82, mallet).rotation.z = Math.PI / 2;
    P.armBase = -0.6;
  } else {
    // THE CLOWN KING — tall, caped, crowned, half-black half-white mask
    const robe = own(new THREE.MeshStandardMaterial({ map: costumeTexture("velvet"), roughness: 0.7 }));
    const mask = own(new THREE.MeshStandardMaterial({ map: skinTexture("king"), roughness: 0.35 }));
    const cape = std("cape", 0x8a0e1e, { roughness: 0.8, side: THREE.DoubleSide });
    P.hips = pivot(root, 0, 1.55, 0);
    mesh(cyl(0.42, 0.6, 0.5, 12), robe, 0, -0.1, 0, P.hips);
    P.torso = pivot(P.hips, 0, 0.18, 0);
    mesh(cyl(0.58, 0.45, 0.95, 12), robe, 0, 0.45, 0, P.torso);
    mesh(box(0.3, 0.8, 0.05), gold, 0, 0.45, -0.52, P.torso); // gold placket
    // huge layered ruff
    for (let i = 0; i < 2; i++) mesh(cyl(0.95 - i * 0.18, 0.95 - i * 0.18, 0.1, 18), i ? red : white, 0, 0.95 + i * 0.08, 0, P.torso);
    // cape
    const capeM = mesh(G("capeG", () => new THREE.CylinderGeometry(0.6, 1.25, 2.4, 14, 1, true, Math.PI * 0.15, Math.PI * 1.7)), cape, 0, -0.25, 0.05, P.torso);
    capeM.rotation.y = 0;
    P.cape = capeM;
    P.head = pivot(P.torso, 0, 1.25, -0.02);
    const hd = mesh(sph(0.42, 16, 12), mask, 0, 0.12, 0, P.head);
    hd.scale.set(0.95, 1.15, 0.95);
    // black half of the face
    const half = mesh(G("halfFace", () => new THREE.SphereGeometry(0.425, 16, 12, Math.PI, Math.PI)), std("halfBlack", 0x12080c, { roughness: 0.35 }), 0, 0.12, 0, P.head);
    half.scale.set(0.95, 1.15, 0.95);
    half.rotation.y = Math.PI / 2;
    mesh(sph(0.11), red, 0, 0.08, -0.42, P.head); // nose
    // eyes glow (shared, brightened when charging)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
    flashy.push(eyeMat);
    P.eyeMat = eyeMat;
    for (const s of [-1, 1]) {
      mesh(box(0.1, 0.16, 0.04), dark, s * 0.15, 0.27, -0.36, P.head);
      mesh(sph(0.045), eyeMat, s * 0.15, 0.27, -0.39, P.head);
    }
    // gold-lipped grin with teeth
    mesh(box(0.42, 0.08, 0.06), dark, 0, -0.12, -0.36, P.head);
    for (let i = -3; i <= 3; i++) mesh(box(0.04, 0.05, 0.02), white, i * 0.055, -0.1, -0.395, P.head);
    // crown
    mesh(cyl(0.34, 0.3, 0.2, 14), gold, 0, 0.6, 0, P.head);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      mesh(cone(0.06, 0.28, 5), gold, Math.cos(a) * 0.3, 0.82, Math.sin(a) * 0.3, P.head);
      mesh(sph(0.04), i % 2 ? red : std("gem", 0x3a8ae0, { emissive: 0x0a2050 }), Math.cos(a) * 0.32, 0.62, Math.sin(a) * 0.32, P.head);
    }
    // arms
    for (const s of [-1, 1]) {
      const sh = pivot(P.torso, s * 0.66, 0.82, 0);
      mesh(sph(0.22), robe, 0, 0, 0, sh);
      mesh(cap(0.15, 0.55), robe, 0, -0.42, 0, sh);
      const el = pivot(sh, 0, -0.82, 0);
      mesh(cap(0.13, 0.5), robe, 0, -0.32, 0, el);
      mesh(cyl(0.2, 0.14, 0.18, 10), white, 0, -0.62, 0, el); // lace cuff
      mesh(sph(0.15), white, 0, -0.78, 0, el); // glove
      P[s < 0 ? "armL" : "armR"] = sh;
      P[s < 0 ? "foreL" : "foreR"] = el;
      const hip = pivot(P.hips, s * 0.26, -0.3, 0);
      mesh(cap(0.16, 0.45), robe, 0, -0.3, 0, hip);
      const kn = pivot(hip, 0, -0.62, 0);
      mesh(cap(0.14, 0.4), dark, 0, -0.25, 0, kn);
      mesh(box(0.28, 0.14, 0.6), red, 0, -0.55, -0.12, kn);
      P[s < 0 ? "legL" : "legR"] = hip;
      P[s < 0 ? "shinL" : "shinR"] = kn;
    }
    // scepter with a glowing orb
    const sc = pivot(P.foreR, 0, -0.78, 0);
    mesh(cyl(0.04, 0.04, 1.6, 8), gold, 0, 0.2, 0, sc);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xff40c0 });
    flashy.push(orbMat);
    P.orbMat = orbMat;
    mesh(sph(0.16), orbMat, 0, 1.05, 0, sc);
    const halo = new THREE.Sprite(M("kingHalo", () => new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff40c0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })));
    halo.scale.set(0.9, 0.9, 1);
    halo.position.y = 1.05;
    sc.add(halo);
    P.scepter = sc;
    P.armBase = -0.3;
  }
  root.traverse((o) => {
    if (o.isMesh) o.frustumCulled = true;
  });
  const emissive = flashy.filter((m) => m.emissive);
  return { root, parts: P, mats: flashy, emissive, type, torsoBase: P.torso.rotation.x, hipsY: P.hips.position.y };
}

/** pose a rig from the sim enemy state */
export function poseEnemy(rig, e, now) {
  const P = rig.parts;
  const t = e.walkPh;
  const king = rig.type === "king";
  const sp = Math.min(1.4, e.speed / (rig.type === "jester" ? 3.2 : king ? 2 : 1.6));
  const sw = Math.sin(t * 2.2) * 0.65 * sp;
  P.legL.rotation.x = sw;
  P.legR.rotation.x = -sw;
  P.shinL.rotation.x = Math.max(0, -Math.sin(t * 2.2)) * 0.8 * sp;
  P.shinR.rotation.x = Math.max(0, Math.sin(t * 2.2)) * 0.8 * sp;
  // clowns waddle, jesters bounce
  const bounce = rig.type === "jester" ? Math.abs(Math.sin(t * 2.2)) * 0.12 * sp : Math.abs(Math.sin(t * 2.2)) * 0.05 * sp;
  P.hips.position.y = rig.hipsY + bounce;
  P.hips.rotation.z = rig.type === "clown" ? Math.sin(t * 2.2) * 0.12 * sp : 0;
  let aL = P.armBase - sw * 0.5, aR = P.armBase + sw * 0.5;
  let fL = -0.3, fR = -0.3;
  let zL = 0.15, zR = -0.15;
  let torso = rig.torsoBase;
  const idleSway = Math.sin(now * 1.3 + e.id) * 0.06;
  if (e.state === "idle") {
    aL = -0.1 + idleSway;
    aR = -0.2 - idleSway;
    fL = fR = -0.2;
    torso += 0.1 + Math.sin(now * 0.8 + e.id) * 0.05;
    if (rig.type === "clown") P.head.rotation.z = Math.sin(now * 0.7 + e.id) * 0.25; // creepy head tilt
  }
  if (!king) {
    if (e.state === "windup") {
      const k = Math.min(1, e.stateT / (e.D.windup / (e.enraged ? 1.25 : 1)));
      if (rig.type === "armored") {
        aR = -2.9 * k; // mallet overhead
        fR = -0.4 * k;
        aL = -0.8;
        torso = rig.torsoBase + 0.3 * k;
      } else {
        aR = -2.4 * k;
        fR = -1.0 * k;
        aL = -0.6;
        torso = rig.torsoBase + 0.2 * k;
      }
    } else if (e.state === "recover") {
      const k = Math.max(0, 1 - e.stateT / 0.35);
      aR = rig.type === "armored" ? -0.2 * k - 0.3 : -0.6 * k - 0.4;
      fR = -0.1;
      torso = rig.torsoBase - 0.3 * k;
    }
    if (e.dodgeT > 0 && rig.type === "jester") {
      zL = 1.2;
      zR = -1.2;
      torso -= 0.3;
    }
  } else {
    // king poses
    const s = e.state;
    const k = Math.min(1, e.stateT / 0.9);
    P.cape.rotation.x = -Math.min(0.5, e.speed * 0.08);
    if (s === "slamWind") {
      aR = -3.0 * k;
      aL = -3.0 * k;
      fR = fL = -0.4 * k;
      torso = rig.torsoBase + 0.25 * k;
    } else if (s === "throwWind") {
      // juggling: hands alternate quickly
      aL = -1.6 + Math.sin(now * 16) * 0.6;
      aR = -1.6 - Math.sin(now * 16) * 0.6;
      fL = fR = -0.8;
    } else if (s === "chargeWind") {
      torso = rig.torsoBase - 0.5 * k;
      aL = aR = 0.6 * k;
    } else if (s === "charge") {
      torso = rig.torsoBase - 0.6;
      aL = aR = 0.9;
    } else if (s === "dazed") {
      torso = rig.torsoBase + 0.3 + Math.sin(now * 6) * 0.08;
      P.head.rotation.z = Math.sin(now * 5) * 0.35;
      aL = aR = 0.2;
    } else if (s === "summon") {
      aL = -2.6;
      aR = -2.6;
      zL = 0.8;
      zR = -0.8;
      torso = rig.torsoBase - 0.15 + Math.sin(now * 10) * 0.04;
    } else if (s === "recover") {
      const r = Math.max(0, 1 - e.stateT / 0.6);
      aL = aR = -0.6 * r;
      torso = rig.torsoBase - 0.3 * r;
    } else {
      aR = -0.6 + Math.sin(now * 1.5) * 0.1; // scepter forward
    }
    if (s !== "dazed") P.head.rotation.z *= 0.9;
    // glowing eyes / orb while telegraphing
    const tele = s === "slamWind" || s === "throwWind" || s === "chargeWind" || s === "charge";
    const pulse = tele ? 0.6 + 0.4 * Math.sin(now * 20) : 0.4;
    P.eyeMat.color.setRGB(1, 0.15 + pulse * 0.4, 0.1);
    P.orbMat.color.setRGB(1, 0.25 * pulse, 0.75 + 0.25 * pulse);
  }
  if (e.hitT < 0.22) {
    const k = 1 - e.hitT / 0.22;
    torso += (king ? 0.12 : 0.45) * k;
    P.head.rotation.z = Math.sin(e.id * 7) * 0.4 * k;
  } else if (e.state !== "idle" && !(king && e.state === "dazed")) P.head.rotation.z *= 0.9;
  if (e.stagger > 0) {
    torso += 0.25 + Math.sin(now * 18) * 0.08;
    aL = 0.3;
    aR = 0.3;
  }
  P.armL.rotation.x = aL;
  P.armR.rotation.x = aR;
  P.armL.rotation.z = zL;
  P.armR.rotation.z = zR;
  P.foreL.rotation.x = fL;
  P.foreR.rotation.x = fR;
  P.torso.rotation.x = torso;
  // hit flash (emissive) — the king's orb / eyes are basic materials
  const flash = e.hitT < 0.12 ? 1 - e.hitT / 0.12 : 0;
  const enr = e.enraged ? 0.16 + Math.sin(now * 8) * 0.08 : 0;
  const daze = king && e.dazed > 0 ? 0.25 + Math.sin(now * 12) * 0.15 : 0;
  for (const m of rig.emissive) m.emissive.setRGB(flash * 0.9 + enr + daze, flash * 0.5 + daze, flash * 0.5 + daze * 0.2);
  // spawn: pop up out of the ground
  const rise = e.spawnT > 0 ? 1 - e.spawnT / 0.7 : 1;
  const rr = Math.max(0, Math.min(1, rise));
  rig.root.scale.setScalar(0.3 + 0.7 * rr);
  if (!e.alive) {
    const k = Math.min(1, e.deadT / 0.55);
    const ease = 1 - (1 - k) * (1 - k);
    rig.root.rotation.x = ease * 1.45;
    rig.root.position.y = -Math.max(0, e.deadT - 8) * 0.12 + ease * 0.12;
    P.armL.rotation.x = -2.6 * ease;
    P.armR.rotation.x = -2.4 * ease;
    for (const m of rig.emissive) m.emissive.setRGB(0, 0, 0);
  } else rig.root.rotation.x = 0;
}

export function disposeEnemy(rig) {
  for (const m of rig.mats) m.dispose();
}

/* ================================================================ first-person */
export function makeViewmodel() {
  const root = new THREE.Group();
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x2a3a4a, roughness: 0.8 });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89878, roughness: 0.7 });
  const gun = new THREE.MeshStandardMaterial({ color: 0x34373c, roughness: 0.4, metalness: 0.4 });
  const gunLight = new THREE.MeshStandardMaterial({ color: 0x6a6e75, roughness: 0.35, metalness: 0.45 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b3a20, roughness: 0.55 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.8 });
  const candyR = new THREE.MeshStandardMaterial({ color: 0xe02a5a, roughness: 0.35, metalness: 0.2 });
  const candyY = new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 0.35, metalness: 0.2 });
  const candyB = new THREE.MeshStandardMaterial({ color: 0x3a6ae0, roughness: 0.35, metalness: 0.2 });
  const energy = new THREE.MeshBasicMaterial({ color: 0xff5ae0 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.28, roughness: 0.05 });

  const arm = (side) => {
    const g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.055, 0.068, 0.42, 10), sleeve, 0, 0, 0.18, g).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.05, 10), cuff, 0, 0, -0.02, g).rotation.x = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.085, 0.07, 0.11), skin, 0, 0, -0.07, g);
    mesh(new THREE.BoxGeometry(0.09, 0.03, 0.04), skin, 0, -0.03, -0.13, g);
    g.userData.side = side;
    return g;
  };
  // pistol: a worn revolver-style sidearm
  const pistol = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.05, 0.055, 0.24), gun, 0, 0.03, -0.1, pistol);
  mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.12, 8), gunLight, 0, 0.04, -0.27, pistol).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.045, 0.03, 0.2), gunLight, 0, -0.005, -0.08, pistol);
  mesh(new THREE.BoxGeometry(0.044, 0.13, 0.065), wood, 0, -0.06, 0.0, pistol).rotation.x = 0.25;
  mesh(new THREE.BoxGeometry(0.012, 0.015, 0.012), candyY, 0, 0.065, -0.2, pistol);
  const pMuzzle = pivot(pistol, 0, 0.04, -0.34);
  // pump shotgun
  const shotgun = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), gun, 0, 0.04, -0.3, shotgun).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.5, 8), gun, 0, 0.0, -0.25, shotgun).rotation.x = Math.PI / 2;
  const pump = mesh(new THREE.BoxGeometry(0.052, 0.05, 0.16), wood, 0, 0.005, -0.32, shotgun);
  mesh(new THREE.BoxGeometry(0.056, 0.075, 0.2), gun, 0, 0.02, 0.02, shotgun);
  mesh(new THREE.BoxGeometry(0.046, 0.085, 0.26), wood, 0, -0.02, 0.22, shotgun).rotation.x = -0.15;
  const sMuzzle = pivot(shotgun, 0, 0.04, -0.62);
  // carnival blaster: candy-striped barrel, glowing energy tank, fins
  const blaster = new THREE.Group();
  for (let i = 0; i < 6; i++) mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.06, 12), i % 2 ? candyR : candyY, 0, 0.03, -0.2 - i * 0.06, blaster).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.045, 0.03, 0.06, 12), candyB, 0, 0.03, -0.56, blaster).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.08, 0.09, 0.22), candyB, 0, 0.02, -0.02, blaster);
  // glowing energy orb in a glass bubble; it shrinks as the magazine empties
  const tank = mesh(new THREE.SphereGeometry(0.038, 14, 10), energy, 0, 0.1, -0.12, blaster);
  mesh(new THREE.SphereGeometry(0.05, 14, 10), glass, 0, 0.1, -0.12, blaster);
  mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.03, 12), gunLight, 0, 0.06, -0.12, blaster);
  for (const s of [-1, 1]) {
    const fin = mesh(new THREE.BoxGeometry(0.01, 0.07, 0.12), candyR, s * 0.05, 0.05, -0.32, blaster);
    fin.rotation.z = s * 0.5;
  }
  mesh(new THREE.BoxGeometry(0.045, 0.12, 0.07), grip, 0, -0.07, 0.04, blaster).rotation.x = 0.2;
  const bMuzzle = pivot(blaster, 0, 0.03, -0.6);

  const armR = arm(1);
  const armL = arm(-1);
  root.add(armR, armL, pistol, shotgun, blaster);
  const flashMat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Sprite(flashMat);
  flash.scale.set(0.22, 0.22, 1);
  flash.visible = false;
  root.add(flash);
  return {
    root,
    guns: { pistol, shotgun, blaster },
    armR,
    armL,
    pump,
    tank,
    energy,
    flash,
    flashMat,
    muzzles: { pistol: pMuzzle, shotgun: sMuzzle, blaster: bMuzzle },
    mats: [sleeve, cuff, skin, gun, gunLight, wood, grip, candyR, candyY, candyB, energy, glass, flashMat],
  };
}

/* ================================================================ pickups */
export const ITEM_GLOW = { p: 0xffd36a, s: 0xff6a4a, e: 0xff5ae0, h: 0x6aff8a, f: 0xff9a2a, G: 0xffd36a, S: 0xffc060, B: 0xff5ae0 };
export function makeItem(kind) {
  const g = new THREE.Group();
  const glowCol = ITEM_GLOW[kind] || 0xffffff;
  const halo = new THREE.Sprite(M(`halo:${kind}`, () => new THREE.SpriteMaterial({ map: glowTexture(), color: glowCol, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })));
  halo.scale.set(0.95, 0.95, 1);
  halo.position.y = 0.25;
  g.add(halo);
  const body = new THREE.Group();
  g.add(body);
  if (kind === "p") {
    mesh(box(0.32, 0.16, 0.2), std("ammoBox", 0x3a4a6a), 0, 0.08, 0, body);
    mesh(box(0.33, 0.04, 0.21), std("ammoStrip", 0xd8b13a, { emissive: 0x6a5010 }), 0, 0.12, 0, body);
  } else if (kind === "s") {
    mesh(box(0.26, 0.14, 0.18), std("shellBox", 0x8a2418), 0, 0.07, 0, body);
    for (let i = 0; i < 4; i++) mesh(cyl(0.025, 0.025, 0.09, 8), std("shell", 0xd04a2a, { emissive: 0x401008 }), -0.09 + i * 0.06, 0.19, 0, body);
  } else if (kind === "e") {
    mesh(cyl(0.08, 0.08, 0.3, 12), basic("cell", 0xff5ae0), 0, 0.18, 0, body);
    mesh(cyl(0.09, 0.09, 0.05, 12), std("cellCap", 0xd0d0d8, { metalness: 0.6, roughness: 0.3 }), 0, 0.04, 0, body);
    mesh(cyl(0.09, 0.09, 0.05, 12), std("cellCap", 0xd0d0d8, { metalness: 0.6, roughness: 0.3 }), 0, 0.34, 0, body);
  } else if (kind === "h") {
    mesh(box(0.34, 0.2, 0.24), std("medBox", 0xe8e6e0), 0, 0.1, 0, body);
    const red = std("medRed", 0xd01818, { emissive: 0x500000 });
    mesh(box(0.06, 0.205, 0.16), red, 0, 0.1, 0, body);
    mesh(box(0.16, 0.205, 0.06), red, 0, 0.1, 0, body);
  } else if (kind === "f") {
    mesh(cyl(0.06, 0.06, 0.26, 10), basic("fuseGlass", 0xffa040), 0, 0.17, 0, body);
    mesh(cyl(0.07, 0.07, 0.05, 10), std("fuseCap", 0xb08a3a, { metalness: 0.6 }), 0, 0.03, 0, body);
    mesh(cyl(0.07, 0.07, 0.05, 10), std("fuseCap", 0xb08a3a, { metalness: 0.6 }), 0, 0.31, 0, body);
  } else if (kind === "G") {
    const gun = std("pgun", 0x34373c, { metalness: 0.4, roughness: 0.4 });
    mesh(box(0.06, 0.07, 0.32), gun, 0, 0.2, 0, body);
    mesh(box(0.05, 0.16, 0.07), std("pwood", 0x6b3a20), 0, 0.12, 0.13, body).rotation.x = 0.25;
    body.rotation.y = 0.6;
  } else if (kind === "S") {
    const gun = std("sgun", 0x34373c, { metalness: 0.35, roughness: 0.4 });
    const wood = std("swood", 0x6b3a20);
    mesh(cyl(0.025, 0.025, 0.75, 8), gun, 0, 0.18, -0.05, body).rotation.x = Math.PI / 2;
    mesh(box(0.07, 0.09, 0.22), gun, 0, 0.16, 0.38, body);
    mesh(box(0.06, 0.1, 0.32), wood, 0, 0.13, 0.62, body);
    mesh(box(0.07, 0.06, 0.18), wood, 0, 0.15, 0.08, body);
    body.rotation.y = 0.6;
  } else if (kind === "B") {
    for (let i = 0; i < 6; i++) mesh(cyl(0.05, 0.05, 0.09, 12), i % 2 ? std("bR", 0xe02a5a) : std("bY", 0xffd23a), 0, 0.2, -0.2 + i * 0.09, body).rotation.x = Math.PI / 2;
    mesh(box(0.12, 0.13, 0.3), std("bB", 0x3a6ae0), 0, 0.2, 0.32, body);
    mesh(cyl(0.05, 0.05, 0.22, 10), basic("cell", 0xff5ae0), 0, 0.31, 0.3, body).rotation.x = Math.PI / 2;
    body.rotation.y = 0.6;
  }
  return { root: g, body, halo };
}

/* ================================================================ furniture */
export function makeDeco(kind, axis, R, neon, tent = false) {
  const g = new THREE.Group();
  if (kind === "b" && tent) {
    // circus bleachers: three stepped wooden tiers
    const wood = std("bleach", 0x6a4428, { roughness: 0.8 });
    const trim = std("bleachTrim", 0xb81c2a, { roughness: 0.6 });
    for (let i = 0; i < 3; i++) {
      mesh(box(1.8, 0.45 * (i + 1), 0.55), wood, 0, 0.225 * (i + 1), 0.6 - i * 0.55, g);
      mesh(box(1.82, 0.05, 0.57), trim, 0, 0.45 * (i + 1), 0.6 - i * 0.55, g);
    }
    g.rotation.y = R() * 0.3 - 0.15 + (axis === "x" ? 0 : Math.PI / 2);
    return g;
  }
  if (kind === "A") {
    // arcade cabinet with a glowing screen + marquee
    const col = neon[Math.floor(R() * neon.length)];
    const cab = std(`cab${col}`, new THREE.Color(col).multiplyScalar(0.25).getHex(), { roughness: 0.5 });
    mesh(box(1.0, 1.9, 0.8), cab, 0, 0.95, 0.1, g);
    mesh(box(1.02, 0.08, 0.82), std("cabTrim", 0x111111), 0, 1.9, 0.1, g);
    const scr = mesh(box(0.7, 0.55, 0.05), basic(`scr${col}`, col, { transparent: true, opacity: 0.85 }), 0, 1.38, -0.29, g);
    scr.rotation.x = -0.25;
    mesh(box(0.9, 0.2, 0.06), basic(`mq${col}`, new THREE.Color(col).lerp(new THREE.Color(0xffffff), 0.4).getHex()), 0, 1.78, -0.31, g);
    mesh(box(0.9, 0.08, 0.4), cab, 0, 1.0, -0.38, g); // control deck
    for (const x of [-0.2, 0.15, 0.28]) mesh(sph(0.035), basic(`btn${x}`, x < 0 ? 0xff3030 : 0xffe040), x, 1.06, -0.45, g);
    g.rotation.y = axis === "x" ? 0 : Math.PI / 2;
    if (R() < 0.3) g.rotation.z = 0.06; // tilted, broken
  } else if (kind === "b") {
    if (R() < 0.5) {
      const wood = std("crate", 0x7a5232);
      const s = 0.75 + R() * 0.3;
      mesh(box(s, s, s), wood, 0, s / 2, 0, g).rotation.y = R();
      if (R() < 0.6) mesh(box(s * 0.6, s * 0.6, s * 0.6), wood, 0.1, s + s * 0.3, 0.05, g).rotation.y = R();
    } else {
      const col = [0xc81a1a, 0x2a5ab0, 0xd8a83a][Math.floor(R() * 3)];
      for (let i = 0; i < 2; i++) {
        mesh(cyl(0.32, 0.32, 0.95, 12), std(`barrel${col}`, col, { roughness: 0.5 }), (i - 0.5) * 0.7, 0.475, (R() - 0.5) * 0.4, g);
        mesh(cyl(0.33, 0.33, 0.06, 12), std("hoop", 0xefe6d8), (i - 0.5) * 0.7, 0.6, 0, g);
      }
    }
  } else if (kind === "t") {
    // ticket counter / table with striped skirt
    mesh(box(1.4, 0.08, 1.0), std("counterTop", 0x5a3a20), 0, 1.0, 0, g);
    for (let i = 0; i < 7; i++) mesh(box(0.2, 0.96, 0.96), i % 2 ? std("skirtR", 0xa81a1a) : std("skirtW", 0xe8dcc0), -0.6 + i * 0.2, 0.48, 0, g);
    if (R() < 0.6) mesh(box(0.3, 0.2, 0.25), std("register", 0x8a7a3a, { metalness: 0.5, roughness: 0.4 }), 0.3, 1.14, 0, g);
    if (R() < 0.5) mesh(cyl(0.08, 0.06, 0.2, 8), std("popcorn", 0xe8e0c8), -0.4, 1.14, 0.1, g);
    if (axis === "z") g.rotation.y = Math.PI / 2;
  } else if (kind === "Y") {
    // prize stall: counter, striped awning, dangling plush toys
    const col = neon[Math.floor(R() * neon.length)];
    mesh(box(1.7, 0.9, 0.9), std("stallBase", 0x3a2418), 0, 0.45, 0, g);
    for (const s of [-1, 1]) mesh(box(0.08, 2.6, 0.08), std("stallPost", 0xd8a83a, { metalness: 0.4 }), s * 0.82, 1.3, 0.4, g);
    for (let i = 0; i < 6; i++) {
      const aw = mesh(box(0.3, 0.06, 1.0), std(i % 2 ? "awW" : `aw${col}`, i % 2 ? 0xefe6d8 : col), -0.75 + i * 0.3, 2.55, 0.1, g);
      aw.rotation.x = -0.25;
    }
    for (let i = 0; i < 4; i++) {
      const toy = mesh(sph(0.12, 8, 6), std(`toy${i}`, [0xe8a0c0, 0xa0d8e8, 0xe8e0a0, 0xc0a0e8][i]), -0.6 + i * 0.4, 2.0 - R() * 0.4, 0.3, g);
      toy.scale.y = 1.3;
    }
    g.rotation.y = R() * Math.PI * 2;
  } else if (kind === "n") {
    // circus drum pedestal with stars
    const col = neon[Math.floor(R() * neon.length)];
    mesh(cyl(0.7, 0.75, 0.9, 16), std(`drum${col}`, col, { roughness: 0.4 }), 0, 0.45, 0, g);
    mesh(cyl(0.72, 0.72, 0.08, 16), std("drumTrim", 0xd8a83a, { metalness: 0.5 }), 0, 0.9, 0, g);
    mesh(cyl(0.77, 0.77, 0.08, 16), std("drumTrim", 0xd8a83a, { metalness: 0.5 }), 0, 0.04, 0, g);
    mesh(torus(0.6, 0.05, 6, 20), std("drumStripe", 0xefe6d8), 0, 0.45, 0, g).rotation.x = Math.PI / 2;
  } else if (kind === "F") {
    // fortune machine: cabinet with a glass dome and a puppet head
    mesh(box(1.0, 1.1, 0.8), std("fortune", 0x4a1a5a, { roughness: 0.5 }), 0, 0.55, 0, g);
    mesh(box(1.04, 0.08, 0.84), std("gold", 0xd8a83a, { roughness: 0.35, metalness: 0.6 }), 0, 1.12, 0, g);
    mesh(G("dome", () => new THREE.SphereGeometry(0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)), std("domeGlass", 0x9ad0ff, { transparent: true, opacity: 0.3, roughness: 0.05 }), 0, 1.16, 0, g);
    const head = mesh(sph(0.2), std("puppet", 0xefe6d8), 0, 1.4, 0, g);
    head.scale.y = 1.15;
    mesh(sph(0.05), std("red", 0xc81a1a, { roughness: 0.4 }), 0, 1.38, -0.2, g);
    mesh(cone(0.14, 0.3, 6), std("puppetHat", 0x6a1a8a), 0, 1.65, 0, g);
    mesh(sph(0.11, 10, 8), basic("crystal", 0x9a5aff), 0.3, 1.25, -0.15, g);
    g.userData.glow = true;
  }
  return g;
}

/* ================================================================ big rides */
/** carousel: rotating platform with horses on poles under a striped canopy */
export function makeCarousel(neon) {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const gold = std("gold", 0xd8a83a, { roughness: 0.35, metalness: 0.6 });
  mesh(cyl(4.4, 4.6, 0.5, 32), std("carBase", 0x3a1a2a), 0, 0.25, 0, root);
  mesh(cyl(4.3, 4.3, 0.12, 32), std("carDeck", 0x6a3a28), 0, 0.56, 0, spin);
  mesh(cyl(0.6, 0.7, 4.4, 16), std("carCore", 0x5a1a3a), 0, 2.6, 0, root);
  for (let i = 0; i < 8; i++) mesh(box(0.3, 3.4, 0.05), std(i % 2 ? "mirrorPanel" : "carPanel", i % 2 ? 0xd0d8f0 : 0xa82a3a, { roughness: 0.2, metalness: i % 2 ? 0.6 : 0.1 }), Math.cos((i / 8) * Math.PI * 2) * 0.66, 2.4, Math.sin((i / 8) * Math.PI * 2) * 0.66, root).rotation.y = -(i / 8) * Math.PI * 2 + Math.PI / 2;
  // canopy: striped cone
  const can = new THREE.Group();
  can.position.y = 4.9;
  spin.add(can);
  for (let i = 0; i < 16; i++) {
    const seg = mesh(G("canopySeg", () => new THREE.ConeGeometry(4.8, 1.6, 2, 1, true, 0, Math.PI / 8)), std(i % 2 ? "canW" : "canR", i % 2 ? 0xe8dcc0 : 0xb81c2a, { side: THREE.DoubleSide, roughness: 0.8, emissive: i % 2 ? 0x2a2418 : 0x300408 }), 0, 0, 0, can);
    seg.rotation.y = (i / 16) * Math.PI * 2;
  }
  mesh(cyl(4.85, 4.85, 0.3, 32, 1), gold, 0, -0.85, 0, can);
  mesh(sph(0.3), gold, 0, 1, 0, can);
  // bulbs around the rim (instanced)
  const bulbs = new THREE.InstancedMesh(sph(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), 32);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    m4.makeTranslation(Math.cos(a) * 4.9, -0.95, Math.sin(a) * 4.9);
    bulbs.setMatrixAt(i, m4);
    bulbs.setColorAt(i, col.set(neon[i % neon.length]));
  }
  can.add(bulbs);
  // horses on poles
  const horses = [];
  const horseCols = [0xefe6d8, 0x2a2a2e, 0xd8a0b0, 0x9ab0d8];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const p = pivot(spin, Math.cos(a) * 3.2, 0, Math.sin(a) * 3.2);
    p.rotation.y = -a;
    mesh(cyl(0.04, 0.04, 4.3, 8), gold, 0, 2.7, 0, p);
    const h = pivot(p, 0, 1.4, 0);
    const hm = std(`horse${i % 4}`, horseCols[i % 4], { roughness: 0.4 });
    mesh(cap(0.22, 0.7), hm, 0, 0, 0, h).rotation.x = Math.PI / 2; // body (along z)
    const neck = mesh(cap(0.12, 0.35), hm, 0, 0.32, -0.45, h);
    neck.rotation.x = -0.6;
    mesh(box(0.16, 0.18, 0.36), hm, 0, 0.55, -0.68, h); // head
    mesh(box(0.05, 0.2, 0.22), std("mane", [0xd8a83a, 0xc81a1a, 0x3a6ae0][i % 3]), 0, 0.5, -0.4, h);
    for (const [x, z] of [[-0.12, -0.3], [0.12, -0.3], [-0.12, 0.3], [0.12, 0.3]]) {
      const leg = mesh(cap(0.05, 0.4), hm, x, -0.38, z, h);
      leg.rotation.x = z < 0 ? -0.5 : 0.4;
    }
    mesh(box(0.3, 0.06, 0.36), std("saddle", 0x8a1a2a), 0, 0.22, 0.05, h);
    horses.push({ h, ph: i * 0.8 });
  }
  // decorative railing ring
  const rail = mesh(torus(5.5, 0.05, 6, 48), gold, 0, 1.0, 0, root);
  rail.rotation.x = Math.PI / 2;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    mesh(cyl(0.04, 0.04, 1.0, 6), gold, Math.cos(a) * 5.5, 0.5, Math.sin(a) * 5.5, root);
  }
  return {
    root,
    disposables: [bulbs.material],
    update(t, on, dt) {
      if (on) spin.rotation.y += dt * 0.35;
      for (const hh of horses) hh.h.position.y = 1.4 + Math.sin(t * 2 + hh.ph) * 0.25 * (on ? 1 : 0.2);
    },
  };
}

/** Ferris wheel: A-frame supports, rim + spokes, hanging gondolas, bulbs */
export function makeFerris(neon) {
  const root = new THREE.Group();
  const R = 9;
  const hubY = R + 1.2;
  const steel = std("steel", 0xb0b4c0, { metalness: 0.6, roughness: 0.35 });
  const wheel = new THREE.Group();
  wheel.position.y = hubY;
  root.add(wheel);
  for (const zOff of [-0.7, 0.7]) {
    const rim = mesh(torus(R, 0.09, 6, 64), steel, 0, 0, zOff, wheel);
    void rim;
    mesh(torus(R * 0.55, 0.06, 6, 48), steel, 0, 0, zOff, wheel);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const sp = mesh(cyl(0.04, 0.04, R, 6), steel, (Math.cos(a) * R) / 2, (Math.sin(a) * R) / 2, zOff, wheel);
      sp.rotation.z = a - Math.PI / 2;
    }
  }
  mesh(cyl(0.45, 0.45, 1.8, 16), std("hub", 0xd8a83a, { metalness: 0.6, roughness: 0.3 }), 0, 0, 0, wheel).rotation.x = Math.PI / 2;
  // supports (A-frame on both sides)
  for (const zOff of [-1.6, 1.6]) {
    for (const s of [-1, 1]) {
      const len = Math.hypot(4.2, hubY);
      const leg = mesh(cyl(0.16, 0.22, len, 8), std("frame", 0x7a1a2a, { metalness: 0.3, roughness: 0.5 }), s * 2.1, hubY / 2, zOff, root);
      leg.rotation.z = s * Math.atan2(4.2, hubY);
    }
  }
  mesh(box(6, 0.6, 4.4), std("ferrisBase", 0x2a1a24), 0, 0.3, 0, root);
  // gondolas
  const gondolas = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const arm = pivot(wheel, Math.cos(a) * R, Math.sin(a) * R, 0);
    const gon = pivot(arm, 0, 0, 0);
    const col = neon[i % neon.length];
    mesh(cyl(0.03, 0.03, 0.9, 6), steel, 0, -0.45, 0, gon);
    mesh(cyl(0.7, 0.55, 0.8, 10), std(`gon${col}`, col, { roughness: 0.45 }), 0, -1.3, 0, gon);
    mesh(cone(0.85, 0.5, 10), std("gonRoof", 0xefe6d8), 0, -0.65, 0, gon);
    gondolas.push(gon);
  }
  // rim bulbs
  const N = 96;
  const bulbs = new THREE.InstancedMesh(sph(0.11, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ring = i % 2 ? R : R * 0.55;
    m4.makeTranslation(Math.cos(a) * ring, Math.sin(a) * ring, i % 4 < 2 ? 0.75 : -0.75);
    bulbs.setMatrixAt(i, m4);
    bulbs.setColorAt(i, col.set(neon[Math.floor(i / 4) % neon.length]));
  }
  wheel.add(bulbs);
  const bulbMat = bulbs.material;
  return {
    root,
    disposables: [bulbMat],
    update(t, on, dt) {
      if (on) wheel.rotation.z += dt * 0.12;
      else wheel.rotation.z = Math.sin(t * 0.3) * 0.02; // creaking
      for (const g of gondolas) g.rotation.z = -wheel.rotation.z - g.parent.rotation.z + Math.sin(t * 1.3 + g.id) * 0.05;
      bulbMat.color.setScalar(on ? 1 : 0.35 + (Math.sin(t * 7) > 0.6 ? 0.4 : 0));
    },
  };
}

/** entrance arch: two striped towers and a bulb-lit arc */
export function makeArch(span, height, neon) {
  const g = new THREE.Group();
  const gold = std("gold", 0xd8a83a, { roughness: 0.35, metalness: 0.6 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) mesh(cyl(0.35, 0.35, height / 6, 12), std(i % 2 ? "archW" : "archR", i % 2 ? 0xefe6d8 : 0xb81c2a), s * span * 0.5, (i + 0.5) * (height / 6), 0, g);
    mesh(cone(0.5, 1.0, 12), gold, s * span * 0.5, height + 0.5, 0, g);
    mesh(sph(0.15), basic("archTop", 0xffd23a), s * span * 0.5, height + 1.1, 0, g);
  }
  const arc = mesh(G(`arc${span}`, () => new THREE.TorusGeometry(span / 2, 0.18, 8, 24, Math.PI)), std("archArc", 0x6a1a8a), 0, height, 0, g);
  void arc;
  const N = 18;
  const bulbs = new THREE.InstancedMesh(sph(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), N);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = (i / (N - 1)) * Math.PI;
    m4.makeTranslation(Math.cos(a) * (span / 2), height + Math.sin(a) * (span / 2), -0.22);
    bulbs.setMatrixAt(i, m4);
    bulbs.setColorAt(i, col.set(neon[i % neon.length]));
  }
  g.add(bulbs);
  g.userData.disposables = [bulbs.material];
  return g;
}

/** jack-in-the-box head for the popup scare */
export function makePopup() {
  const g = new THREE.Group();
  mesh(box(0.7, 0.7, 0.7), std("jackBox", 0x3a6ae0), 0, 0.35, 0, g);
  const spring = mesh(cyl(0.12, 0.12, 1, 8), std("spring", 0xb0b4c0, { metalness: 0.6 }), 0, 0.9, 0, g);
  const head = pivot(g, 0, 1.5, 0);
  mesh(sph(0.32), std("white", 0xefe6d8, { roughness: 0.6 }), 0, 0, 0, head);
  mesh(sph(0.1), std("red", 0xc81a1a, { roughness: 0.4 }), 0, -0.02, -0.32, head);
  mesh(box(0.36, 0.08, 0.04), std("dark", 0x141016, { roughness: 0.9 }), 0, -0.16, -0.28, head);
  for (const s of [-1, 1]) {
    mesh(sph(0.05), basic("eyeClown", 0xfff060), s * 0.12, 0.1, -0.28, head);
    mesh(sph(0.16, 8, 6), std("hairOrange", 0xe8601a, { roughness: 1 }), s * 0.3, 0.12, 0, head);
  }
  return { root: g, head, spring };
}

export function disposeModels() {
  for (const g of geo.values()) g.dispose();
  geo.clear();
  for (const m of sharedMats.values()) m.dispose();
  sharedMats.clear();
}
