/**
 * Original, procedural low-poly models for every character, built from
 * spheres / capsules / cones with toon materials, plus one pose function that
 * animates them (idle, walk, run, jump, dodge, punch, kick, specials, hit,
 * KO, enemy wind-ups). Local forward is +Z; feet rest on y = 0 (every model is
 * auto-grounded from its bounding box after it's built).
 *
 * Rig: root (position/facing) → spin (rolls, whirls, falls; pivots at the
 * body's centre) → inner → { torso → head, armL, armR } + legL, legR, tail.
 * armL/legL are on +X (the character's left when facing +Z).
 */
import * as THREE from "three";

/* ---------------------------------------------------------------- shared */
let gradTex = null;
export function toonGradient() {
  if (!gradTex) {
    gradTex = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
    gradTex.generateMipmaps = false;
    gradTex.needsUpdate = true;
  }
  return gradTex;
}
const GEO = {};
const geo = (key, make) => GEO[key] || (GEO[key] = make());
const SPH = () => geo("sph", () => new THREE.SphereGeometry(1, 16, 12));
const SPH_LO = () => geo("sphlo", () => new THREE.SphereGeometry(1, 10, 8));
const BOX = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
const CYL = () => geo("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 12));
const CONE = () => geo("cone", () => new THREE.ConeGeometry(1, 1, 12));
const TORUS = () => geo("torus", () => new THREE.TorusGeometry(1, 0.22, 8, 20));
const CAP = (r, len) => geo(`cap${r.toFixed(3)}_${len.toFixed(3)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 12));

function kit() {
  const mats = new Map();
  const m = (c) => {
    if (!mats.has(c)) mats.set(c, new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() }));
    return mats.get(c);
  };
  const add = (parent, g, c, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(g, m(c));
    mesh.position.set(p[0], p[1], p[2]);
    if (typeof s === "number") mesh.scale.setScalar(s);
    else mesh.scale.set(s[0], s[1], s[2]);
    mesh.rotation.set(r[0], r[1], r[2]);
    parent.add(mesh);
    return mesh;
  };
  const grp = (parent, p = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.set(p[0], p[1], p[2]);
    parent.add(g);
    return g;
  };
  /** A limb hanging down from its pivot: capsule of total length len. */
  const limb = (parent, r, len, c, s = [1, 1, 1]) => add(parent, CAP(r, len - 2 * r), c, [0, -len / 2 + r * 0.5, 0], s);
  /** Cartoon eye looking along +Z. */
  const eye = (parent, x, y, z, r, iris = "#3a2a1a", sclera = "#ffffff") => {
    const g = grp(parent, [x, y, z]);
    add(g, SPH(), sclera, [0, 0, 0], [r, r * 1.08, r * 0.7]);
    add(g, SPH(), iris, [0, 0, r * 0.5], [r * 0.62, r * 0.66, r * 0.3]);
    add(g, SPH(), "#111111", [0, 0, r * 0.66], [r * 0.34, r * 0.38, r * 0.2]);
    add(g, SPH(), "#ffffff", [r * 0.18, r * 0.22, r * 0.78], [r * 0.12, r * 0.12, r * 0.08]);
    return g;
  };
  /** A curling chain (tails). Returns the segment groups. */
  const chain = (parent, n, segLen, r0, r1, colorAt, bend, bendY = 0) => {
    const segs = [];
    let p = parent;
    for (let i = 0; i < n; i++) {
      const g = grp(p, i === 0 ? [0, 0, 0] : [0, 0, -segLen]);
      g.rotation.x = i === 0 ? bend[0] : bend[1];
      g.rotation.y = bendY;
      const r = r0 + (r1 - r0) * (i / Math.max(1, n - 1));
      add(g, CAP(r, segLen), colorAt(i), [0, 0, -segLen / 2], 1, [Math.PI / 2, 0, 0]);
      segs.push(g);
      p = g;
    }
    return segs;
  };
  return { m, add, grp, limb, eye, chain, mats };
}

function rigBase(kind) {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  const inner = new THREE.Group();
  root.add(spin);
  spin.add(inner);
  return { kind, root, spin, inner, parts: {}, tail: [], extra: {} };
}

/** Auto-ground: feet at y=0, spin pivot at the body's centre. */
function finish(R, K, scale = 1) {
  R.inner.scale.setScalar(scale);
  R.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(R.inner);
  const H = box.max.y - box.min.y;
  R.H = H;
  R.cH = H * 0.5;
  R.spin.position.y = R.cH;
  R.inner.position.y = -box.min.y - R.cH;
  R.restInnerY = R.inner.position.y;
  R.mats = [...K.mats.values()];
  for (const mt of R.mats) mt.emissive = new THREE.Color(0, 0, 0);
  R.root.traverse((o) => {
    if (o.isMesh) o.frustumCulled = true;
  });
  R.state = {};
  return R;
}

/* ================================================================= heroes */
function buildPo() {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb, eye } = K;
  const W = "#f4f3ee", B = "#232323", SH = "#c08a4a", SH2 = "#6b3f1e";
  const legL = grp(R.inner, [0.25, 0.55, 0]);
  const legR = grp(R.inner, [-0.25, 0.55, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.19, 0.5, B);
    add(L, SPH(), B, [0, -0.5, 0.06], [0.2, 0.1, 0.26]);
  }
  // shorts
  add(R.inner, CYL(), SH, [0, 0.62, 0], [0.52, 0.3, 0.46]);
  add(R.inner, CYL(), SH2, [0, 0.79, 0], [0.54, 0.07, 0.48]);
  const torso = grp(R.inner, [0, 0.8, 0]);
  add(torso, SPH(), W, [0, 0.32, 0.03], [0.6, 0.55, 0.55]); // big belly
  add(torso, SPH(), B, [0, 0.68, -0.04], [0.55, 0.24, 0.42]); // black shoulders
  add(torso, SPH(), SH2, [0, 0.2, 0.52], [0.035, 0.035, 0.02]); // belly button
  const head = grp(torso, [0, 0.82, 0.02]);
  add(head, SPH(), W, [0, 0.3, 0], [0.42, 0.39, 0.4]);
  for (const s of [1, -1]) {
    add(head, SPH(), B, [s * 0.29, 0.6, -0.04], [0.13, 0.13, 0.08]); // ears
    add(head, SPH(), B, [s * 0.15, 0.33, 0.31], [0.12, 0.14, 0.07], [0, 0, s * 0.45]); // eye patches
    eye(head, s * 0.15, 0.35, 0.36, 0.065, "#4e7a3a");
  }
  add(head, SPH(), W, [0, 0.19, 0.35], [0.18, 0.12, 0.1]); // muzzle
  add(head, SPH(), B, [0, 0.25, 0.44], [0.075, 0.05, 0.05]); // nose
  add(head, BOX(), "#6a2a2a", [0, 0.135, 0.43], [0.11, 0.025, 0.02]); // smile
  const armL = grp(torso, [0.55, 0.62, 0]);
  const armR = grp(torso, [-0.55, 0.62, 0]);
  for (const A of [armL, armR]) {
    limb(A, 0.15, 0.56, B);
    add(A, SPH(), B, [0, -0.54, 0.02], 0.15);
  }
  const tailG = grp(R.inner, [0, 0.72, -0.44]);
  add(tailG, SPH(), W, [0, 0, 0], 0.09);
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR });
  R.pose = { armOut: 0.38, armFwd: -0.15, lean: 0 };
  return finish(R, K, 0.86);
}

function buildTigress() {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb, eye, chain } = K;
  const O = "#e8862a", WH = "#f6efe0", BK = "#1d1d1d", RED = "#b3261e", GOLD = "#e7b53c", PANT = "#26232a";
  const legL = grp(R.inner, [0.15, 0.86, 0]);
  const legR = grp(R.inner, [-0.15, 0.86, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.12, 0.82, PANT);
    add(L, SPH(), O, [0, -0.82, 0.07], [0.1, 0.07, 0.16]);
  }
  add(R.inner, SPH(), PANT, [0, 0.9, 0], [0.27, 0.15, 0.2]);
  const torso = grp(R.inner, [0, 0.93, 0]);
  add(torso, CAP(0.21, 0.32), RED, [0, 0.3, 0], [1.08, 1, 0.82]); // vest
  add(torso, TORUS(), GOLD, [0, 0.06, 0], [0.22, 0.17, 0.3], [Math.PI / 2, 0, 0]); // gold sash
  add(torso, BOX(), GOLD, [0, 0.36, 0.17], [0.04, 0.3, 0.02]); // gold placket
  for (const s of [1, -1]) add(torso, SPH(), GOLD, [s * 0.08, 0.42, 0.165], [0.035, 0.035, 0.02]);
  add(torso, CYL(), O, [0, 0.6, 0], [0.07, 0.1, 0.07]); // neck
  const head = grp(torso, [0, 0.62, 0.01]);
  add(head, SPH(), O, [0, 0.17, 0], [0.2, 0.2, 0.19]);
  add(head, SPH(), WH, [0, 0.09, 0.14], [0.12, 0.09, 0.09]); // muzzle
  for (const s of [1, -1]) {
    add(head, SPH(), WH, [s * 0.13, 0.08, 0.08], [0.07, 0.07, 0.06]); // cheek ruff
    add(head, CONE(), O, [s * 0.13, 0.36, -0.01], [0.065, 0.11, 0.04], [0, 0, -s * 0.25]); // ears
    add(head, CONE(), BK, [s * 0.145, 0.405, -0.01], [0.03, 0.05, 0.02], [0, 0, -s * 0.25]);
    eye(head, s * 0.075, 0.2, 0.155, 0.045, "#d24a1a");
    add(head, BOX(), BK, [s * 0.11, 0.3, 0.13], [0.07, 0.016, 0.02], [0, 0, s * 0.3]); // brow stripes
    add(head, BOX(), BK, [s * 0.18, 0.18, 0.08], [0.06, 0.014, 0.02], [0, s * 0.9, s * 0.2]); // cheek stripes
  }
  add(head, BOX(), BK, [0, 0.33, 0.15], [0.025, 0.07, 0.02]); // forehead stripes
  add(head, SPH(), "#3a2020", [0, 0.135, 0.225], [0.03, 0.022, 0.02]); // nose
  const armL = grp(torso, [0.28, 0.48, 0]);
  const armR = grp(torso, [-0.28, 0.48, 0]);
  for (const A of [armL, armR]) {
    limb(A, 0.075, 0.62, O);
    for (let i = 0; i < 3; i++) add(A, BOX(), BK, [0, -0.18 - i * 0.12, 0.06], [0.1, 0.018, 0.05]);
    add(A, SPH(), O, [0, -0.6, 0.02], 0.075);
  }
  const tb = grp(R.inner, [0, 0.9, -0.15]);
  R.tail = chain(tb, 6, 0.17, 0.05, 0.035, (i) => (i % 2 ? BK : O), [-0.9, 0.22]);
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR });
  R.pose = { armOut: 0.22, armFwd: -0.55, lean: 0.05 };
  return finish(R, K, 1);
}

function buildMonkey() {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb, eye, chain } = K;
  const BR = "#7a4a26", TAN = "#e2bd85", PANT = "#3d3a33", SASH = "#8a7a4a";
  const legL = grp(R.inner, [0.14, 0.5, 0]);
  const legR = grp(R.inner, [-0.14, 0.5, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.1, 0.46, PANT);
    add(L, SPH(), TAN, [0, -0.47, 0.08], [0.1, 0.06, 0.17]);
  }
  add(R.inner, SPH(), PANT, [0, 0.54, 0], [0.24, 0.14, 0.19]);
  add(R.inner, CYL(), SASH, [0, 0.62, 0], [0.22, 0.05, 0.18]);
  const torso = grp(R.inner, [0, 0.58, 0]);
  add(torso, SPH(), BR, [0, 0.27, 0], [0.24, 0.3, 0.2]);
  add(torso, SPH(), TAN, [0, 0.25, 0.1], [0.15, 0.2, 0.11]); // chest
  const head = grp(torso, [0, 0.52, 0.05]);
  add(head, SPH(), BR, [0, 0.16, 0], [0.2, 0.19, 0.19]);
  // heart-shaped face
  for (const s of [1, -1]) {
    add(head, SPH(), TAN, [s * 0.07, 0.2, 0.12], [0.1, 0.09, 0.08]);
    add(head, SPH(), TAN, [s * 0.21, 0.17, 0], [0.04, 0.075, 0.065]); // ears
    eye(head, s * 0.068, 0.21, 0.185, 0.042, "#5a3010");
  }
  add(head, SPH(), TAN, [0, 0.1, 0.14], [0.11, 0.08, 0.09]); // muzzle
  add(head, SPH(), "#3a2010", [0, 0.13, 0.225], [0.035, 0.02, 0.02]);
  add(head, BOX(), "#4a2010", [0, 0.065, 0.225], [0.08, 0.015, 0.015]);
  add(head, SPH(), BR, [0, 0.33, 0.02], [0.09, 0.05, 0.08]); // tuft
  const armL = grp(torso, [0.24, 0.42, 0]);
  const armR = grp(torso, [-0.24, 0.42, 0]);
  for (const A of [armL, armR]) {
    limb(A, 0.06, 0.66, BR);
    add(A, SPH(), TAN, [0, -0.66, 0.03], [0.075, 0.08, 0.075]);
  }
  const tb = grp(R.inner, [0, 0.56, -0.17]);
  R.tail = chain(tb, 8, 0.14, 0.035, 0.03, () => BR, [-0.6, 0.32]);
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR });
  R.pose = { armOut: 0.3, armFwd: -0.35, lean: 0.28 };
  return finish(R, K, 1);
}

function buildCrane() {
  const R = rigBase("biped");
  R.wings = true;
  const K = kit();
  const { add, grp, eye } = K;
  const W = "#f6f6f2", BK = "#1f1f22", LEG = "#3a3a40", BEAK = "#d9b45a", HAT = "#d8b46a", HAT2 = "#9a7238", RED = "#c8302a";
  const legL = grp(R.inner, [0.1, 0.92, 0]);
  const legR = grp(R.inner, [-0.1, 0.92, 0]);
  for (const L of [legL, legR]) {
    add(L, CYL(), LEG, [0, -0.45, 0], [0.035, 0.9, 0.035]);
    for (const a of [-0.5, 0, 0.5]) add(L, BOX(), LEG, [Math.sin(a) * 0.08, -0.9, Math.cos(a) * 0.08], [0.03, 0.02, 0.17], [0, a, 0]);
  }
  add(R.inner, CYL(), "#2f4a6a", [0, 0.95, 0], [0.2, 0.12, 0.2]); // short dark pants
  const torso = grp(R.inner, [0, 0.95, 0]);
  add(torso, SPH(), W, [0, 0.2, 0], [0.28, 0.3, 0.36], [0.15, 0, 0]);
  add(torso, BOX(), BK, [0, 0.12, -0.38], [0.22, 0.05, 0.22], [-0.4, 0, 0]); // tail feathers
  add(torso, CYL(), W, [0, 0.5, 0.18], [0.06, 0.38, 0.06], [0.35, 0, 0]); // neck
  add(torso, CYL(), BK, [0, 0.4, 0.15], [0.065, 0.17, 0.065], [0.35, 0, 0]); // black neck band
  const head = grp(torso, [0, 0.68, 0.26]);
  add(head, SPH(), W, [0, 0.05, 0], [0.12, 0.12, 0.13]);
  add(head, SPH(), RED, [0, 0.12, 0.03], [0.05, 0.03, 0.05]); // red crown
  add(head, CONE(), BEAK, [0, 0.03, 0.24], [0.04, 0.26, 0.035], [Math.PI / 2, 0, 0]);
  for (const s of [1, -1]) eye(head, s * 0.07, 0.07, 0.085, 0.035, "#2a5ab0");
  // the iconic wide straw hat
  add(head, CONE(), HAT, [0, 0.2, -0.01], [0.42, 0.15, 0.42]);
  add(head, CYL(), HAT2, [0, 0.135, -0.01], [0.16, 0.025, 0.16]);
  // wings (arms): hang along the body, spread with rotation.z
  const armL = grp(torso, [0.24, 0.36, 0]);
  const armR = grp(torso, [-0.24, 0.36, 0]);
  for (const [A, s] of [[armL, 1], [armR, -1]]) {
    add(A, SPH(), W, [s * 0.02, -0.3, -0.04], [0.045, 0.34, 0.2], [0.15, 0, 0]);
    add(A, SPH(), BK, [s * 0.02, -0.58, -0.1], [0.04, 0.12, 0.13], [0.3, 0, 0]);
  }
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR });
  R.pose = { armOut: 0.12, armFwd: 0, lean: 0.1 };
  return finish(R, K, 1);
}

function buildMantis() {
  const R = rigBase("biped");
  R.insect = true;
  const K = kit();
  const { add, grp, eye } = K;
  const G1 = "#6cc04a", G2 = "#4b9a32", G3 = "#a6dc6a";
  // two pairs of thin legs: legL/legR (front pair) + back pair in extra
  const legs = [];
  for (const [x, z] of [[0.09, 0.02], [-0.09, 0.02], [0.09, -0.16], [-0.09, -0.16]]) {
    const L = grp(R.inner, [x, 0.3, z]);
    add(L, CYL(), G2, [Math.sign(x) * 0.08, -0.08, 0], [0.018, 0.2, 0.018], [0, 0, Math.sign(x) * 0.9]);
    add(L, CYL(), G2, [Math.sign(x) * 0.15, -0.21, 0], [0.016, 0.2, 0.016], [0, 0, -Math.sign(x) * 0.25]);
    legs.push(L);
  }
  // abdomen
  add(R.inner, SPH(), G1, [0, 0.33, -0.25], [0.11, 0.1, 0.24], [-0.25, 0, 0]);
  for (let i = 0; i < 3; i++) add(R.inner, TORUS(), G2, [0, 0.34 + i * 0.02, -0.18 - i * 0.09], [0.1 - i * 0.012, 0.1 - i * 0.012, 0.06], [-0.25, 0, 0]);
  const torso = grp(R.inner, [0, 0.32, 0]);
  add(torso, CAP(0.06, 0.26), G1, [0, 0.17, 0.02], 1, [0.2, 0, 0]); // thorax
  const head = grp(torso, [0, 0.38, 0.06]);
  add(head, SPH(), G1, [0, 0.03, 0], [0.12, 0.09, 0.08]);
  add(head, CONE(), G3, [0, -0.05, 0.04], [0.06, 0.09, 0.05], [Math.PI, 0, 0]); // pointed chin
  for (const s of [1, -1]) {
    eye(head, s * 0.1, 0.05, 0.03, 0.055, "#3a6a1a", "#e8ffb0");
    add(head, CYL(), G2, [s * 0.05, 0.18, -0.04], [0.008, 0.26, 0.008], [-0.5, 0, -s * 0.3]); // antennae
  }
  // raptorial forearms: upper segment + folded blade
  const armL = grp(torso, [0.07, 0.26, 0.05]);
  const armR = grp(torso, [-0.07, 0.26, 0.05]);
  for (const A of [armL, armR]) {
    add(A, CYL(), G1, [0, -0.1, 0], [0.025, 0.2, 0.025]);
    const fore = grp(A, [0, -0.2, 0]);
    fore.rotation.x = -2.4;
    add(fore, CYL(), G3, [0, -0.09, 0], [0.022, 0.18, 0.022]);
    add(fore, CONE(), G3, [0, -0.19, 0.01], [0.02, 0.06, 0.02], [Math.PI, 0, 0]);
  }
  Object.assign(R.parts, { torso, head, armL, armR, legL: legs[0], legR: legs[1] });
  R.extra.backLegs = [legs[2], legs[3]];
  R.pose = { armOut: 0.15, armFwd: -1.0, lean: 0 };
  return finish(R, K, 1.15);
}

function buildViper() {
  const R = rigBase("snake");
  const K = kit();
  const { add, grp, eye } = K;
  const G1 = "#5fae3c", G2 = "#4a8f2c", BELLY = "#d8e070", PINK = "#ef7aa8", YEL = "#ffe070";
  const N = 16;
  const segs = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const r = i < 3 ? 0.12 + i * 0.015 : 0.165 * (1 - t * 0.78) + 0.03;
    const g = grp(R.inner, [0, 0, 0]);
    add(g, SPH_LO(), i % 3 === 1 ? G2 : G1, [0, 0, 0], [r, r * 0.92, r * 1.25]);
    if (i % 3 === 1 && i < N - 2) add(g, SPH_LO(), BELLY, [0, -r * 0.35, 0], [r * 0.7, r * 0.55, r * 1.1]);
    g.userData.r = r;
    segs.push(g);
  }
  const head = grp(R.inner, [0, 0.9, 0.1]);
  add(head, SPH(), G1, [0, 0, 0.04], [0.15, 0.12, 0.2]);
  add(head, SPH(), BELLY, [0, -0.05, 0.08], [0.12, 0.06, 0.15]);
  for (const s of [1, -1]) {
    eye(head, s * 0.085, 0.06, 0.13, 0.052, "#2f78d8");
    add(head, SPH(), "#1d3a12", [s * 0.03, 0.02, 0.235], [0.012, 0.01, 0.01]); // nostrils
    // lotus flowers on top of the head
    const f = grp(head, [s * 0.08, 0.13, -0.02]);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      add(f, SPH_LO(), PINK, [Math.cos(a) * 0.035, 0.01, Math.sin(a) * 0.035], [0.03, 0.015, 0.02], [0, -a, 0]);
    }
    add(f, SPH_LO(), YEL, [0, 0.02, 0], 0.017);
  }
  add(head, BOX(), "#2a4a1a", [0, -0.02, 0.22], [0.09, 0.008, 0.01]); // smile
  Object.assign(R.parts, { head });
  R.segs = segs;
  R.pose = {};
  R.snake = { N, phase: 0 };
  layoutSnake(R, 0, 0, 0, 0, 1);
  return finish(R, K, 1);
}

/** Viper's body: raised S-curve at the front, winding along the ground behind. */
function layoutSnake(R, phase, amp, lunge, coilSpin, rise) {
  const { segs } = R;
  const N = segs.length;
  const headY = 0.95 * rise;
  for (let i = 0; i < N; i++) {
    const g = segs[i];
    const r = g.userData.r;
    let x, y, z;
    if (i < 5) {
      const t = i / 5;
      y = r + (headY - 0.12 - r) * (1 - t) ** 1.6;
      z = 0.12 + lunge * (1 - t) - i * 0.1;
      x = Math.sin(phase * 0.5) * 0.03 * (1 - t);
    } else {
      const k = i - 5;
      y = r;
      z = -0.38 - k * 0.17;
      x = Math.sin(phase - k * 0.75) * (0.1 + amp) * Math.min(1, k / 3);
    }
    if (coilSpin) {
      // tail sweeps around for whips
      const a = coilSpin * Math.min(1, i / (N - 1)) * 1.6;
      const cx = x, cz = z;
      x = cx * Math.cos(a) + cz * Math.sin(a);
      z = -cx * Math.sin(a) + cz * Math.cos(a);
    }
    g.position.set(x, y, z);
  }
  R.parts.head.position.set(segs[0].position.x, headY + 0.03, segs[0].position.z + 0.08);
}

/* ================================================================= villains */
function buildTaiLung() {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb, eye, chain } = K;
  const F = "#c9c5be", WH = "#eeece6", SP = "#3c3836", PUR = "#4b2c6e", PUR2 = "#2c1a40";
  const spots = (parent, list, s = 0.035) => list.forEach(([x, y, z]) => add(parent, SPH_LO(), SP, [x, y, z], [s, s, s * 0.6]));
  const legL = grp(R.inner, [0.2, 0.95, 0]);
  const legR = grp(R.inner, [-0.2, 0.95, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.16, 0.92, PUR, [1.05, 1, 1.05]);
    add(L, SPH(), F, [0, -0.93, 0.08], [0.13, 0.08, 0.2]);
  }
  add(R.inner, SPH(), PUR, [0, 0.98, 0], [0.36, 0.18, 0.26]);
  add(R.inner, CYL(), PUR2, [0, 1.07, 0], [0.33, 0.07, 0.25]); // sash
  const torso = grp(R.inner, [0, 1.06, 0]);
  add(torso, SPH(), F, [0, 0.45, -0.02], [0.4, 0.42, 0.29]); // back/chest mass
  add(torso, SPH(), WH, [0, 0.4, 0.14], [0.3, 0.36, 0.18]); // pale chest
  add(torso, SPH(), WH, [0, 0.12, 0.08], [0.24, 0.18, 0.16]); // abs
  for (const s of [1, -1]) add(torso, SPH(), F, [s * 0.4, 0.66, 0], [0.2, 0.18, 0.2]); // shoulders
  spots(torso, [[0.25, 0.6, -0.25], [-0.2, 0.5, -0.27], [0.05, 0.75, -0.25], [-0.32, 0.72, -0.12], [0.34, 0.4, -0.15]], 0.045);
  add(torso, CYL(), F, [0, 0.86, 0.02], [0.12, 0.12, 0.12]);
  const head = grp(torso, [0, 0.9, 0.04]);
  add(head, SPH(), F, [0, 0.18, 0], [0.22, 0.21, 0.22]);
  add(head, SPH(), WH, [0, 0.1, 0.15], [0.13, 0.1, 0.11]); // muzzle
  add(head, SPH(), "#9a7070", [0, 0.15, 0.255], [0.045, 0.03, 0.025]); // nose
  add(head, BOX(), "#2a1a1a", [0, 0.06, 0.245], [0.09, 0.012, 0.012]); // stern mouth
  for (const s of [1, -1]) {
    add(head, SPH(), F, [s * 0.15, 0.36, -0.03], [0.065, 0.065, 0.04]); // round ears
    add(head, SPH(), SP, [s * 0.15, 0.36, -0.055], [0.04, 0.04, 0.02]);
    eye(head, s * 0.085, 0.21, 0.17, 0.045, "#f0a820");
    add(head, BOX(), SP, [s * 0.09, 0.275, 0.18], [0.1, 0.022, 0.03], [0, 0, -s * 0.35]); // angry brows
  }
  spots(head, [[0.1, 0.36, 0.12], [-0.12, 0.33, 0.13], [0, 0.39, 0.1], [0.18, 0.22, 0.08], [-0.19, 0.2, 0.08]], 0.025);
  const armL = grp(torso, [0.48, 0.64, 0]);
  const armR = grp(torso, [-0.48, 0.64, 0]);
  for (const A of [armL, armR]) {
    limb(A, 0.12, 0.78, F);
    spots(A, [[0.06, -0.2, 0.09], [-0.07, -0.33, 0.08], [0.02, -0.47, 0.11], [-0.04, -0.25, -0.1]], 0.03);
    add(A, SPH(), WH, [0, -0.77, 0.03], [0.12, 0.12, 0.12]);
    for (const k of [-1, 0, 1]) add(A, CONE(), "#f4f0e0", [k * 0.05, -0.86, 0.08], [0.015, 0.06, 0.015], [Math.PI * 0.85, 0, 0]);
  }
  const tb = grp(R.inner, [0, 1.0, -0.22]);
  R.tail = chain(tb, 7, 0.22, 0.09, 0.07, (i) => (i % 2 ? SP : F), [-1.0, 0.2]);
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR });
  R.pose = { armOut: 0.35, armFwd: -0.4, lean: 0.1 };
  return finish(R, K, 1);
}

function buildWolf(variant = 0) {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb, eye, chain } = K;
  const FUR = ["#7d7f86", "#8a7a6a", "#6a6e78"][variant % 3];
  const PALE = "#c9cbd0", LEATH = "#6b4a2a", PANT = "#3a3430", BAND = "#a82a22";
  const legL = grp(R.inner, [0.16, 0.85, 0]);
  const legR = grp(R.inner, [-0.16, 0.85, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.12, 0.8, PANT);
    add(L, SPH(), FUR, [0, -0.81, 0.08], [0.11, 0.07, 0.18]);
  }
  add(R.inner, SPH(), PANT, [0, 0.88, 0], [0.28, 0.15, 0.21]);
  const torso = grp(R.inner, [0, 0.9, 0]);
  add(torso, SPH(), FUR, [0, 0.36, 0], [0.3, 0.37, 0.22]);
  add(torso, SPH(), LEATH, [0, 0.3, 0.06], [0.31, 0.3, 0.2]); // leather vest
  add(torso, BOX(), "#3a2814", [0, 0.1, 0.19], [0.4, 0.06, 0.04]); // belt
  add(torso, SPH(), "#55585e", [-0.3, 0.6, 0], [0.16, 0.1, 0.16]); // shoulder pad
  add(torso, TORUS(), BAND, [0, 0.68, 0.02], [0.14, 0.14, 0.2], [Math.PI / 2, 0, 0]); // bandana
  const head = grp(torso, [0, 0.74, 0.03]);
  add(head, SPH(), FUR, [0, 0.13, 0], [0.19, 0.18, 0.19]);
  add(head, BOX(), FUR, [0, 0.07, 0.2], [0.13, 0.11, 0.2]); // snout
  add(head, BOX(), PALE, [0, 0.02, 0.21], [0.12, 0.05, 0.19]); // jaw
  add(head, SPH(), "#151515", [0, 0.11, 0.31], [0.035, 0.03, 0.025]); // nose
  for (const s of [1, -1]) {
    add(head, CONE(), FUR, [s * 0.11, 0.33, -0.03], [0.06, 0.13, 0.04], [0, 0, -s * 0.2]);
    eye(head, s * 0.075, 0.19, 0.15, 0.035, "#e8c020");
    add(head, BOX(), "#2a2a2a", [s * 0.075, 0.24, 0.16], [0.08, 0.02, 0.02], [0, 0, -s * 0.35]);
  }
  const armL = grp(torso, [0.32, 0.56, 0]);
  const armR = grp(torso, [-0.32, 0.56, 0]);
  for (const A of [armL, armR]) {
    limb(A, 0.085, 0.66, FUR);
    add(A, SPH(), PALE, [0, -0.65, 0.02], 0.085);
  }
  const tb = grp(R.inner, [0, 0.88, -0.18]);
  R.tail = chain(tb, 3, 0.18, 0.08, 0.1, (i) => (i === 2 ? PALE : FUR), [-1.1, 0.25]);
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR });
  R.pose = { armOut: 0.3, armFwd: -0.35, lean: 0.12 };
  return finish(R, K, 1);
}

function buildShifu() {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb, eye, chain } = K;
  const FUR = "#b5532a", WH = "#f4eee4", DK = "#3a2620", ROBE = "#a88a5a", ROBE2 = "#6a5230";
  const legL = grp(R.inner, [0.08, 0.3, 0]);
  const legR = grp(R.inner, [-0.08, 0.3, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.06, 0.28, DK);
    add(L, SPH(), DK, [0, -0.29, 0.04], [0.06, 0.04, 0.09]);
  }
  add(R.inner, CONE(), ROBE, [0, 0.42, 0], [0.22, 0.42, 0.2]); // robe skirt
  const torso = grp(R.inner, [0, 0.45, 0]);
  add(torso, SPH(), ROBE, [0, 0.15, 0], [0.16, 0.19, 0.14]);
  add(torso, BOX(), ROBE2, [0, 0.05, 0.12], [0.2, 0.04, 0.04]);
  const head = grp(torso, [0, 0.3, 0.02]);
  add(head, SPH(), FUR, [0, 0.13, 0], [0.17, 0.15, 0.15]);
  add(head, SPH(), WH, [0, 0.08, 0.11], [0.11, 0.07, 0.08]); // white muzzle
  add(head, SPH(), "#1a1a1a", [0, 0.11, 0.19], [0.03, 0.022, 0.02]);
  for (const s of [1, -1]) {
    add(head, CONE(), FUR, [s * 0.15, 0.27, -0.02], [0.09, 0.14, 0.04], [0, 0, -s * 0.5]); // big ears
    add(head, CONE(), WH, [s * 0.15, 0.27, 0.0], [0.05, 0.1, 0.02], [0, 0, -s * 0.5]);
    eye(head, s * 0.06, 0.16, 0.125, 0.032, "#4a6aa0");
    add(head, SPH(), WH, [s * 0.08, 0.21, 0.13], [0.05, 0.02, 0.02], [0, 0, -s * 0.3]); // eyebrows
    add(head, CYL(), WH, [s * 0.17, 0.06, 0.12], [0.006, 0.2, 0.006], [0, 0, s * 1.2]); // whiskers
  }
  const armL = grp(torso, [0.15, 0.22, 0]);
  const armR = grp(torso, [-0.15, 0.22, 0]);
  for (const A of [armL, armR]) {
    limb(A, 0.05, 0.3, ROBE);
    add(A, SPH(), DK, [0, -0.3, 0.02], 0.045);
  }
  // gnarled staff in the right hand
  add(armR, CYL(), "#6a4a24", [0, -0.3, 0.06], [0.022, 0.95, 0.022], [Math.PI / 2 - 0.25, 0, 0]);
  const tb = grp(R.inner, [0, 0.3, -0.15]);
  R.tail = chain(tb, 5, 0.1, 0.06, 0.05, (i) => (i % 2 ? DK : FUR), [-1.3, 0.3]);
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR });
  R.pose = { armOut: 0.15, armFwd: -0.5, lean: 0 };
  return finish(R, K, 0.8);
}

export function buildDummy() {
  const K = kit();
  const { add, grp } = K;
  const root = new THREE.Group();
  const post = grp(root);
  add(post, CYL(), "#8a5a2a", [0, 0.75, 0], [0.13, 1.5, 0.13]);
  add(post, CYL(), "#c89a5a", [0, 1.1, 0], [0.28, 0.55, 0.26]); // straw body
  add(post, SPH(), "#d8b070", [0, 1.62, 0], 0.2); // head sack
  add(post, BOX(), "#6a4020", [0, 1.62, 0.17], [0.12, 0.03, 0.04]); // painted band
  add(post, CYL(), "#8a5a2a", [0, 1.25, 0], [0.04, 1.0, 0.04], [0, 0, Math.PI / 2]); // arms peg
  add(root, CYL(), "#5a3a1a", [0, 0.06, 0], [0.38, 0.12, 0.38]);
  return { root, post, mats: [...K.mats.values()] };
}

const BUILDERS = { po: buildPo, tigress: buildTigress, monkey: buildMonkey, crane: buildCrane, mantis: buildMantis, viper: buildViper, tailung: buildTaiLung, wolf: buildWolf, shifu: buildShifu };

export function buildCharacter(id, variant = 0) {
  const b = BUILDERS[id];
  if (!b) throw new Error(`no model for ${id}`);
  const R = b(variant);
  R.id = id;
  R.root.name = `char-${id}`;
  return R;
}

/* ================================================================= posing */
const lerpK = (dt, rate) => 1 - Math.exp(-rate * dt);
const damp = (o, k, v, kk) => {
  o[k] += (v - o[k]) * kk;
};

/**
 * Animate a rig for one frame.
 * s: { anim, p (0..1 progress for one-shot moves), t (seconds), speed, maxSpeed,
 *      grounded, special (id), combo, flash }
 */
export function poseCharacter(R, s, dt) {
  const kk = lerpK(dt, 16);
  const P = R.parts;
  const t = s.t;
  const flash = s.flash > 0;
  if (flash !== R.state.flash) {
    R.state.flash = flash;
    for (const m of R.mats) m.emissive.setRGB(flash ? 0.38 : 0, flash ? 0.06 : 0, flash ? 0.03 : 0);
  }
  if (R.kind === "snake") return poseSnake(R, s, dt, kk);
  const base = R.pose;
  const run = s.maxSpeed ? Math.min(1.2, s.speed / s.maxSpeed) : 0;
  // gait phase advances with distance travelled
  R.state.ph = (R.state.ph || 0) + dt * (s.speed || 0) * (R.insect ? 5 : 2.6);
  const ph = R.state.ph;
  // targets
  const T = {
    torso: { x: base.lean, y: 0, z: 0, py: 0 },
    head: { x: 0, y: 0 },
    aL: { x: base.armFwd, z: base.armOut, y: 0 },
    aR: { x: base.armFwd, z: -base.armOut, y: 0 },
    lL: { x: 0, z: 0 },
    lR: { x: 0, z: 0 },
    spin: { x: 0, y: 0, z: 0, py: R.cH, sy: 1 },
  };
  const breathe = Math.sin(t * 2.2) * 0.02;
  T.torso.py = breathe * 0.5;
  T.aL.x += breathe;
  T.aR.x += breathe;
  let rollSet = null, spinYSet = null;

  const moveAnim = () => {
    if (run > 0.08) {
      const a = 0.35 + run * 0.55;
      T.lL.x = Math.sin(ph) * a;
      T.lR.x = -Math.sin(ph) * a;
      T.aL.x = base.armFwd * (R.wings ? 0 : 0.6) - Math.sin(ph) * a * (R.wings ? 0.2 : 0.8);
      T.aR.x = base.armFwd * (R.wings ? 0 : 0.6) + Math.sin(ph) * a * (R.wings ? 0.2 : 0.8);
      T.torso.x = base.lean + run * 0.18;
      T.torso.py = Math.abs(Math.sin(ph)) * 0.05 * run;
      T.torso.y = Math.sin(ph) * 0.12 * run;
      if (R.insect) {
        T.aL.x = base.armFwd;
        T.aR.x = base.armFwd;
      }
    }
  };

  switch (s.anim) {
    case "idle":
    case "move":
    case "chase":
    case "recover":
    case "talk":
      moveAnim();
      if (R.wings && !s.grounded) {
        T.aL.z = 1.25 + Math.sin(t * 9) * 0.35;
        T.aR.z = -T.aL.z;
      }
      break;
    case "air": {
      moveAnim();
      T.lL.x = -0.75;
      T.lR.x = -0.2;
      T.aL.z = R.wings ? 1.25 + Math.sin(t * 9) * 0.35 : 0.9;
      T.aR.z = -T.aL.z;
      T.aL.x = T.aR.x = R.wings ? 0 : -0.4;
      break;
    }
    case "dodge": {
      const p = s.p;
      rollSet = p * Math.PI * 2;
      T.lL.x = T.lR.x = -1.3;
      T.aL.x = T.aR.x = -1.2;
      T.spin.py = R.cH * 0.82;
      T.spin.sy = 0.9;
      break;
    }
    case "punch": {
      const p = s.p;
      const e = p < 0.33 ? p / 0.33 : Math.max(0, 1 - (p - 0.33) / 0.67);
      const left = s.combo === 2;
      const fin = s.combo === 3;
      const A = left ? T.aL : T.aR;
      A.x = -0.3 - (fin ? 1.9 : 1.3) * e;
      A.z = (left ? 1 : -1) * 0.08;
      T.torso.y = (left ? -0.55 : 0.55) * e;
      T.torso.x = base.lean + 0.15 * e;
      if (R.insect) A.x = -0.3 - 1.4 * e;
      if (R.wings) {
        A.z = (left ? 1 : -1) * (0.3 + 1.0 * e);
        A.x = -1.2 * e;
      }
      T.lL.x = left ? -0.15 : 0.25 * e;
      T.lR.x = left ? 0.25 * e : -0.15;
      break;
    }
    case "kick": {
      const p = s.p;
      const e = p < 0.38 ? p / 0.38 : Math.max(0, 1 - (p - 0.38) / 0.62);
      T.lR.x = -1.55 * e;
      T.lL.x = 0.15 * e;
      T.torso.x = base.lean - 0.3 * e;
      T.aL.z = base.armOut + 0.8 * e;
      T.aR.z = -(base.armOut + 0.8 * e);
      if (R.insect) {
        T.lR.x = -1.2 * e;
        T.lL.x = -1.2 * e;
        T.spin.x = -0.25 * e;
      }
      break;
    }
    case "special":
      poseSpecial(R, s, T, base);
      if (s.special === "whirl") spinYSet = s.p * Math.PI * 4;
      break;
    case "hit":
    case "hurt":
    case "stagger": {
      const w = Math.sin(Math.min(1, s.p) * Math.PI);
      T.torso.x = base.lean - 0.45 * w;
      T.head.x = -0.35 * w;
      T.aL.z = base.armOut + 0.7 * w;
      T.aR.z = -(base.armOut + 0.7 * w);
      T.aL.x = T.aR.x = 0.2 * w;
      break;
    }
    case "ko": {
      const p = Math.min(1, s.p * 1.6);
      T.spin.x = -1.5 * p;
      T.spin.py = R.cH + (R.cH * 0.18 - R.cH) * p + Math.max(0, Math.sin(p * Math.PI)) * 0.25;
      T.aL.z = 1.2;
      T.aR.z = -1.2;
      T.lL.z = 0.25;
      T.lR.z = -0.25;
      T.head.x = 0.2;
      break;
    }
    case "windup": {
      const e = Math.min(1, s.p * 1.4);
      T.aR.x = 0.9 * e;
      T.aR.z = -(base.armOut + 0.7 * e);
      T.aL.x = -0.8 * e;
      T.torso.y = -0.45 * e;
      T.torso.x = base.lean - 0.12 * e;
      T.head.x = 0.1;
      break;
    }
    case "strike": {
      const e = Math.sin(Math.min(1, s.p) * Math.PI);
      const second = s.combo === 2;
      const A = second ? T.aL : T.aR;
      A.x = -1.6 * e;
      A.z = (second ? 1 : -1) * 0.15;
      T.torso.y = (second ? -0.6 : 0.6) * e;
      T.torso.x = base.lean + 0.25 * e;
      break;
    }
    case "crouch": {
      T.spin.py = R.cH * 0.8;
      T.torso.x = 0.55;
      T.aL.x = T.aR.x = -0.4;
      T.aL.z = 0.5;
      T.aR.z = -0.5;
      T.lL.x = T.lR.x = -0.6;
      T.head.x = -0.3;
      break;
    }
    case "leap": {
      T.torso.x = 0.6;
      T.aL.x = T.aR.x = -2.2;
      T.aL.z = 0.3;
      T.aR.z = -0.3;
      T.lL.x = 0.6;
      T.lR.x = 0.9;
      break;
    }
    case "land": {
      const e = Math.max(0, 1 - s.p * 1.5);
      T.spin.py = R.cH * (1 - 0.18 * e);
      T.torso.x = 0.5 * e + base.lean;
      T.aL.x = T.aR.x = -0.3;
      T.aL.z = 0.9 * e + base.armOut;
      T.aR.z = -T.aL.z;
      break;
    }
    case "roar": {
      const e = Math.min(1, s.p * 3);
      T.torso.x = -0.25 * e;
      T.head.x = -0.45 * e;
      T.aL.z = 1.3 * e;
      T.aR.z = -1.3 * e;
      T.aL.x = T.aR.x = -0.3;
      break;
    }
    case "wave": {
      T.aR.x = -2.6;
      T.aR.z = -0.3 - Math.sin(t * 6) * 0.3;
      break;
    }
    default:
      moveAnim();
  }

  // apply (damped)
  damp(P.torso.rotation, "x", T.torso.x, kk);
  damp(P.torso.rotation, "y", T.torso.y, kk);
  damp(P.head.rotation, "x", T.head.x, kk);
  damp(P.head.rotation, "y", T.head.y, kk);
  const arms = [[P.armL, T.aL], [P.armR, T.aR]];
  for (const [A, a] of arms) {
    damp(A.rotation, "x", a.x, kk);
    damp(A.rotation, "z", a.z, kk);
  }
  damp(P.legL.rotation, "x", T.lL.x, kk);
  damp(P.legL.rotation, "z", T.lL.z, kk);
  damp(P.legR.rotation, "x", T.lR.x, kk);
  damp(P.legR.rotation, "z", T.lR.z, kk);
  if (R.extra.backLegs) {
    damp(R.extra.backLegs[0].rotation, "x", -T.lR.x * 0.8, kk);
    damp(R.extra.backLegs[1].rotation, "x", -T.lL.x * 0.8, kk);
  }
  // torso bob is a position offset on the torso pivot
  if (R.state.torsoY0 == null) R.state.torsoY0 = P.torso.position.y;
  P.torso.position.y = R.state.torsoY0 + T.torso.py;
  // spin group: rolls/whirls are set directly, everything else damped
  if (rollSet != null) R.spin.rotation.x = rollSet;
  else {
    if (Math.abs(R.spin.rotation.x) > Math.PI) R.spin.rotation.x = 0;
    damp(R.spin.rotation, "x", T.spin.x, s.anim === "ko" ? lerpK(dt, 8) : kk);
  }
  if (spinYSet != null) R.spin.rotation.y = spinYSet;
  else {
    // unwind whirls the short way round
    let y = R.spin.rotation.y % (Math.PI * 2);
    if (y > Math.PI) y -= Math.PI * 2;
    if (y < -Math.PI) y += Math.PI * 2;
    R.spin.rotation.y = y * (1 - kk);
  }
  damp(R.spin.position, "y", T.spin.py, s.anim === "ko" ? lerpK(dt, 8) : kk);
  damp(R.spin.scale, "y", T.spin.sy, kk);
  // tails sway; when knocked out they lie flat along the body (not into the ground)
  const ko = s.anim === "ko";
  R.tail.forEach((g, i) => {
    if (g.userData.rx0 == null) g.userData.rx0 = g.rotation.x;
    damp(g.rotation, "x", ko ? (i === 0 ? -1.5 : 0) : g.userData.rx0, kk);
    g.rotation.y = ko ? 0 : Math.sin(t * 2.2 - i * 0.55) * (0.12 + (s.speed || 0) * 0.02);
  });
}

function poseSpecial(R, s, T, base) {
  const p = s.p;
  switch (s.special) {
    case "belly": {
      // arms up on the way up, splat on landing
      const up = p < 0.65;
      T.aL.x = T.aR.x = up ? -2.7 : -0.5;
      T.aL.z = up ? 0.3 : 1.3;
      T.aR.z = -T.aL.z;
      T.lL.x = T.lR.x = up ? -0.9 : 0;
      T.lL.z = up ? 0 : 0.5;
      T.lR.z = up ? 0 : -0.5;
      if (!up) T.spin.sy = 0.86;
      break;
    }
    case "dash":
      T.torso.x = 0.7;
      T.aL.x = T.aR.x = -1.6;
      T.aL.z = 0.25;
      T.aR.z = -0.25;
      T.lL.x = Math.sin(p * 30) * 1.0;
      T.lR.x = -Math.sin(p * 30) * 1.0;
      break;
    case "whirl":
      T.aL.z = 1.45;
      T.aR.z = -1.45;
      T.aL.x = T.aR.x = 0;
      T.lL.z = 0.35;
      T.lR.z = -0.35;
      break;
    case "gust": {
      const e = p < 0.4 ? p / 0.4 : 1;
      T.aL.z = 1.5;
      T.aR.z = -1.5;
      T.aL.x = T.aR.x = p < 0.4 ? 0.9 * e : -1.3;
      T.torso.x = p < 0.4 ? -0.2 : 0.35;
      break;
    }
    case "pressure":
      T.aL.x = -0.4 - 1.2 * (0.5 + 0.5 * Math.sin(p * 46));
      T.aR.x = -0.4 - 1.2 * (0.5 - 0.5 * Math.sin(p * 46));
      T.torso.x = 0.25;
      break;
    default:
      break;
  }
}

function poseSnake(R, s, dt, kk) {
  const st = R.state;
  st.ph = (st.ph || 0) + dt * (2 + (s.speed || 0) * 2.4);
  const moving = (s.speed || 0) > 0.4;
  let amp = moving ? 0.16 : 0.05;
  let lunge = 0, coil = 0, rise = 1, spinY = null, roll = null;
  switch (s.anim) {
    case "punch": {
      const e = s.p < 0.33 ? s.p / 0.33 : Math.max(0, 1 - (s.p - 0.33) / 0.67);
      lunge = 0.75 * e;
      rise = 1 - 0.3 * e;
      break;
    }
    case "kick":
      coil = Math.sin(Math.min(1, s.p) * Math.PI) * 1.6;
      break;
    case "special":
      spinY = s.p * Math.PI * 4;
      amp = 0.3;
      rise = 0.75;
      break;
    case "air":
      rise = 0.8;
      amp = 0.02;
      break;
    case "dodge":
      roll = null;
      spinY = s.p * Math.PI * 2;
      rise = 0.45;
      break;
    case "hit":
      rise = 0.85;
      lunge = -0.25 * Math.sin(Math.min(1, s.p) * Math.PI);
      break;
    case "ko":
      rise = Math.max(0.12, 1 - s.p * 2);
      amp = 0.25;
      break;
    default:
      break;
  }
  st.amp = (st.amp ?? amp) + (amp - (st.amp ?? amp)) * kk;
  st.lunge = (st.lunge ?? 0) + (lunge - (st.lunge ?? 0)) * Math.min(1, kk * 1.5);
  st.coil = (st.coil ?? 0) + (coil - (st.coil ?? 0)) * kk;
  st.rise = (st.rise ?? 1) + (rise - (st.rise ?? 1)) * kk;
  layoutSnake(R, st.ph, st.amp, st.lunge, st.coil, st.rise);
  R.inner.position.y = R.restInnerY;
  if (spinY != null) R.spin.rotation.y = spinY;
  else R.spin.rotation.y = 0;
  if (roll != null) R.spin.rotation.x = roll;
  R.parts.head.rotation.x = s.anim === "ko" ? 0.5 : 0;
}
