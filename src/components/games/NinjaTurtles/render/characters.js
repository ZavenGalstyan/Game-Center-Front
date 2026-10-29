/**
 * Original, procedural low-poly models for every character, built from
 * spheres / capsules / boxes with toon materials, plus one pose function that
 * animates them (idle, run, jump, shell-roll, light combos per weapon style,
 * heavies, specials, hit, KO, enemy wind-ups and the Shredder's moves).
 * Local forward is +Z; feet rest on y = 0 (models are auto-grounded from the
 * body's bounding box, measured before weapons are attached).
 *
 * Rig: root (position/facing) → spin (rolls/whirls, pivots at the body's
 * centre) → inner → { torso → head, armL, armR } + legL, legR.
 * Each arm ends in a hand group (handL/handR) that carries the weapon, so
 * weapons follow every pose. armL/legL are on +X (the character's left).
 * A weapon's long axis is the hand's local +Z; the hand's rotation.x is the
 * "wrist" angle (0 = blade points forward when the arm hangs down,
 * +π/2 = blade continues the arm, −π/2 = blade points up).
 */
import * as THREE from "three";

/* ---------------------------------------------------------------- shared */
let gradTex = null;
export function toonGradient() {
  if (!gradTex) {
    gradTex = new THREE.DataTexture(new Uint8Array([120, 120, 120, 255, 195, 195, 195, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
    gradTex.generateMipmaps = false;
    gradTex.needsUpdate = true;
  }
  return gradTex;
}
const GEO = {};
const geo = (key, make) => {
  if (!GEO[key]) {
    GEO[key] = make();
    GEO[key].userData.shared = true;
  }
  return GEO[key];
};
const SPH = () => geo("sph", () => new THREE.SphereGeometry(1, 16, 12));
const SPH_LO = () => geo("sphlo", () => new THREE.SphereGeometry(1, 10, 8));
const BOX = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
const CYL = () => geo("cyl", () => new THREE.CylinderGeometry(1, 1, 1, 12));
const CYL6 = () => geo("cyl6", () => new THREE.CylinderGeometry(1, 1, 1, 6));
const CONE = () => geo("cone", () => new THREE.ConeGeometry(1, 1, 10));
const CONE4 = () => geo("cone4", () => new THREE.ConeGeometry(1, 1, 4));
const TORUS = () => geo("torus", () => new THREE.TorusGeometry(1, 0.2, 8, 24));
const CAP = (r, len) => geo(`cap${r.toFixed(3)}_${len.toFixed(3)}`, () => new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 12));

const HALF_PI = Math.PI / 2;

function kit() {
  const mats = new Map();
  const m = (c, emissive) => {
    const key = emissive ? `${c}|${emissive}` : c;
    if (!mats.has(key)) {
      const mt = new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() });
      if (emissive) mt.userData.glow = new THREE.Color(emissive);
      mats.set(key, mt);
    }
    return mats.get(key);
  };
  const add = (parent, g, c, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], emissive) => {
    const mesh = new THREE.Mesh(g, m(c, emissive));
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
  /** A dangling chain (mask ribbons, tails). Returns the segment groups. */
  const chain = (parent, n, segLen, w, colorAt, bend, flat = false) => {
    const segs = [];
    let p = parent;
    for (let i = 0; i < n; i++) {
      const g = grp(p, i === 0 ? [0, 0, 0] : [0, 0, -segLen]);
      g.rotation.x = i === 0 ? bend[0] : bend[1];
      if (flat) add(g, BOX(), colorAt(i), [0, 0, -segLen / 2], [w, w * 0.25, segLen * 1.04]);
      else add(g, CAP(w, segLen), colorAt(i), [0, 0, -segLen / 2], 1, [HALF_PI, 0, 0]);
      segs.push(g);
      p = g;
    }
    return segs;
  };
  return { m, add, grp, limb, chain, mats };
}

function rigBase(kind) {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  const inner = new THREE.Group();
  root.add(spin);
  spin.add(inner);
  return { kind, root, spin, inner, parts: {}, tail: [], extra: {} };
}

/**
 * Scale the body to `height`, then ground it: feet at y=0, spin pivot at the
 * body's centre. Weapons are attached after this so they never skew it.
 */
function finish(R, height) {
  R.inner.scale.setScalar(1);
  R.root.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(R.inner);
  const raw = box.max.y - box.min.y;
  const sc = height ? height / raw : 1;
  R.inner.scale.setScalar(sc);
  R.root.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(R.inner);
  const H = box.max.y - box.min.y;
  R.H = H;
  R.cH = H * 0.5;
  R.spin.position.y = R.cH;
  R.inner.position.y = -box.min.y - R.cH;
  R.state = {};
  return R;
}
/** Collect every material once the weapons are on (flash + fade use them). */
function seal(R, K) {
  R.mats = [...K.mats.values()];
  for (const mt of R.mats) {
    mt.emissive = new THREE.Color(0, 0, 0);
    if (mt.userData.glow) mt.emissive.copy(mt.userData.glow);
  }
  return R;
}

/* ================================================================= weapons */
const STEEL = "#d9dee8", STEEL2 = "#9aa3b2";
function katana(K, hand, scale = 1) {
  const { add, grp } = K;
  const w = grp(hand);
  w.scale.setScalar(scale);
  add(w, CYL(), "#2a2233", [0, 0, -0.04], [0.026, 0.22, 0.026], [HALF_PI, 0, 0]); // wrapped grip
  for (let i = 0; i < 3; i++) add(w, BOX(), "#e8d9b0", [0, 0, -0.12 + i * 0.07], [0.055, 0.012, 0.012], [0, 0, i % 2 ? 0.6 : -0.6]);
  add(w, CYL(), "#c9a44a", [0, 0, 0.075], [0.065, 0.014, 0.065], [HALF_PI, 0, 0]); // tsuba
  add(w, BOX(), STEEL, [0, 0, 0.46], [0.016, 0.055, 0.74]); // blade
  add(w, BOX(), "#ffffff", [0, 0.026, 0.46], [0.018, 0.008, 0.72]); // edge glint
  add(w, CONE4(), STEEL, [0, 0, 0.86], [0.03, 0.08, 0.012], [HALF_PI, HALF_PI / 2, 0]); // tip
  return w;
}
function sai(K, hand) {
  const { add, grp } = K;
  const w = grp(hand);
  add(w, CYL(), "#7a2620", [0, 0, -0.05], [0.024, 0.16, 0.024], [HALF_PI, 0, 0]); // wrapped grip
  add(w, SPH_LO(), STEEL2, [0, 0, -0.14], 0.03); // pommel
  add(w, SPH_LO(), STEEL2, [0, 0, 0.04], 0.034); // guard knot
  add(w, CYL6(), STEEL, [0, 0, 0.28], [0.016, 0.46, 0.016], [HALF_PI, 0, 0]); // central prong
  add(w, CONE(), STEEL, [0, 0, 0.53], [0.016, 0.05, 0.016], [HALF_PI, 0, 0]);
  for (const s of [1, -1]) {
    add(w, BOX(), STEEL, [s * 0.045, 0, 0.045], [0.08, 0.018, 0.018]); // side prong (out…)
    add(w, BOX(), STEEL, [s * 0.085, 0, 0.11], [0.018, 0.018, 0.13], [0, -s * 0.15, 0]); // (…and forward)
  }
  return w;
}
function bo(K, hand) {
  const { add, grp } = K;
  const w = grp(hand);
  // held at 35 % of its length: −0.7 … +1.3
  add(w, CYL(), "#8c5a2c", [0, 0, 0.3], [0.032, 2.0, 0.032], [HALF_PI, 0, 0]);
  for (const z of [-0.62, 1.22]) add(w, CYL(), "#4a3020", [0, 0, z], [0.036, 0.14, 0.036], [HALF_PI, 0, 0]); // end caps
  add(w, CYL(), "#d8c8a0", [0, 0, 0.02], [0.036, 0.2, 0.036], [HALF_PI, 0, 0]); // grip wrap
  add(w, CYL(), "#d8c8a0", [0, 0, 0.62], [0.036, 0.16, 0.036], [HALF_PI, 0, 0]);
  return w;
}
function nunchaku(K, hand) {
  const { add, grp } = K;
  const w = grp(hand);
  add(w, CYL(), "#9a4e1e", [0, 0, 0.1], [0.032, 0.32, 0.032], [HALF_PI, 0, 0]);
  add(w, CYL(), "#3a2010", [0, 0, -0.04], [0.035, 0.05, 0.035], [HALF_PI, 0, 0]);
  add(w, CYL(), STEEL2, [0, 0, 0.3], [0.008, 0.1, 0.008], [HALF_PI, 0, 0]); // chain
  const piv = grp(w, [0, 0, 0.35]);
  add(piv, CYL(), "#9a4e1e", [0, 0, 0.16], [0.032, 0.32, 0.032], [HALF_PI, 0, 0]);
  add(piv, CYL(), "#3a2010", [0, 0, 0.31], [0.035, 0.05, 0.035], [HALF_PI, 0, 0]);
  return piv;
}
function naginata(K, hand) {
  const { add, grp } = K;
  const w = grp(hand);
  add(w, CYL(), "#3a2a22", [0, 0, 0.35], [0.03, 1.9, 0.03], [HALF_PI, 0, 0]);
  add(w, CYL(), "#8a1a22", [0, 0, 1.28], [0.04, 0.06, 0.04], [HALF_PI, 0, 0]);
  add(w, BOX(), STEEL, [0, 0.02, 1.52], [0.016, 0.08, 0.46], [0.08, 0, 0]);
  add(w, CONE4(), STEEL, [0, 0.04, 1.78], [0.035, 0.1, 0.01], [HALF_PI, HALF_PI / 2, 0]);
  return w;
}

/* ================================================================= turtles */
const BUILD = {
  leo: { w: 1, leg: 0.66, arm: 0.6, armR: 0.095, pad: "#8a5a32" },
  raph: { w: 1.08, leg: 0.64, arm: 0.6, armR: 0.108, pad: "#6e4428" },
  don: { w: 0.94, leg: 0.72, arm: 0.64, armR: 0.09, pad: "#9a6a3a" },
  mikey: { w: 0.98, leg: 0.6, arm: 0.57, armR: 0.092, pad: "#a8743e" },
};
export const TURTLE_LOOK = {
  leo: { mask: "#1f6fe0", skin: "#5fa83e", height: 1.7 },
  raph: { mask: "#d8262a", skin: "#4e8f36", height: 1.7 },
  don: { mask: "#7b3fc4", skin: "#6aa64a", height: 1.78 },
  mikey: { mask: "#f07d14", skin: "#78bc48", height: 1.62 },
};

function buildTurtle(id) {
  const R = rigBase("turtle");
  const K = kit();
  const { add, grp, limb, chain } = K;
  const B = BUILD[id];
  const L = TURTLE_LOOK[id];
  const SK = L.skin, PL = "#e3c86c", PLD = "#b89a48", SH = "#5a6a2c", SHD = "#3e4a1e", RIM = "#a99350", BELT = "#6e4626", MASK = L.mask;
  const W = B.w;
  // legs
  const hipY = B.leg + 0.03;
  const legL = grp(R.inner, [0.18 * W, hipY, 0]);
  const legR = grp(R.inner, [-0.18 * W, hipY, 0]);
  for (const Lg of [legL, legR]) {
    limb(Lg, 0.13 * W, B.leg, SK);
    add(Lg, SPH(), SK, [0, -0.17, 0.01], [0.15 * W, 0.18, 0.15 * W]); // thigh
    add(Lg, SPH(), B.pad, [0, -B.leg * 0.5, 0.1], [0.1, 0.09, 0.06]); // knee pad
    add(Lg, CYL(), B.pad, [0, -B.leg * 0.5, 0.0], [0.135 * W, 0.04, 0.135 * W]); // knee strap
    add(Lg, CYL(), "#d6c49a", [0, -B.leg + 0.1, 0], [0.115 * W, 0.06, 0.115 * W]); // ankle wrap
    add(Lg, SPH(), SK, [0, -B.leg + 0.02, 0.07], [0.13 * W, 0.07, 0.19]); // foot
  }
  // torso: plastron in front, big shell behind, belt
  const torso = grp(R.inner, [0, hipY - 0.04, 0]);
  add(torso, SPH(), SK, [0, 0.36, -0.02], [0.33 * W, 0.44, 0.26]); // body core
  add(torso, SPH(), PL, [0, 0.36, 0.08], [0.29 * W, 0.42, 0.22]); // plastron
  for (let i = 0; i < 4; i++) add(torso, BOX(), PLD, [0, 0.16 + i * 0.13, 0.285 - Math.abs(i - 1.5) * 0.012], [0.4 * W - Math.abs(i - 1.5) * 0.06, 0.014, 0.02]);
  add(torso, BOX(), PLD, [0, 0.36, 0.3], [0.014, 0.5, 0.02]);
  add(torso, SPH(), SH, [0, 0.38, -0.13], [0.39 * W, 0.5, 0.3]); // carapace
  add(torso, TORUS(), RIM, [0, 0.38, -0.05], [0.39 * W, 0.5, 0.42], [0, 0, 0]); // shell rim
  const scutes = [[0, 0.56, -0.41], [0, 0.34, -0.43], [0, 0.13, -0.38], [0.2, 0.46, -0.37], [-0.2, 0.46, -0.37], [0.2, 0.24, -0.37], [-0.2, 0.24, -0.37]];
  for (const [x, y, z] of scutes) add(torso, CYL6(), SHD, [x * W, y, z], [0.1, 0.03, 0.09], [HALF_PI, 0, 0]);
  add(torso, TORUS(), BELT, [0, 0.08, 0.01], [0.34 * W, 0.28, 0.32], [HALF_PI, 0, 0]); // belt
  add(torso, CYL(), "#c9a24a", [0, 0.08, 0.31], [0.07, 0.025, 0.07], [HALF_PI, 0, 0]); // buckle
  add(torso, CYL(), MASK, [0, 0.08, 0.325], [0.035, 0.01, 0.035], [HALF_PI, 0, 0]);
  add(torso, BOX(), BELT, [0.02, 0.4, 0.29], [0.07, 0.62, 0.025], [0, 0, -0.62]); // chest strap
  for (const s of [1, -1]) add(torso, SPH(), SK, [s * 0.34 * W, 0.62, -0.01], [0.15, 0.13, 0.15]); // shoulders
  add(torso, CYL(), SK, [0, 0.78, 0.03], [0.11, 0.16, 0.11]); // neck
  // head: dome + muzzle + mask band with eye holes + trailing ribbons
  const head = grp(torso, [0, 0.84, 0.05]);
  head.scale.setScalar(1.16);
  add(head, SPH(), SK, [0, 0.16, 0], [0.205, 0.2, 0.22]);
  add(head, SPH(), SK, [0, 0.06, 0.1], [0.18, 0.12, 0.16]); // muzzle / beak
  add(head, BOX(), "#2a3a1a", [0, 0.04, 0.262], [0.12, 0.012, 0.01]); // mouth line
  add(head, SPH(), SK, [0, 0.245, 0.07], [0.19, 0.06, 0.16]); // brow ridge
  add(head, CYL(), MASK, [0, 0.175, 0.005], [0.215, 0.09, 0.232]); // mask band
  for (const s of [1, -1]) {
    add(head, SPH(), "#ffffff", [s * 0.075, 0.178, 0.226], [0.046, 0.032, 0.02]); // eye
    add(head, SPH(), "#1a1a1a", [s * 0.07, 0.176, 0.243], [0.017, 0.02, 0.008]);
  }
  add(head, SPH(), MASK, [0, 0.175, -0.225], [0.05, 0.05, 0.035]); // knot
  const tie = grp(head, [0, 0.17, -0.235]);
  R.tail = [];
  for (const s of [1, -1]) {
    const t = grp(tie, [s * 0.025, 0, 0]);
    t.rotation.y = s * 0.28;
    R.tail.push(...chain(t, 3, 0.13, 0.065, () => MASK, [-0.95, -0.25], true));
  }
  // arms with hand groups for the weapons
  const armL = grp(torso, [0.4 * W, 0.62, 0]);
  const armR = grp(torso, [-0.4 * W, 0.62, 0]);
  const hands = [];
  for (const A of [armL, armR]) {
    limb(A, B.armR, B.arm, SK);
    add(A, SPH(), SK, [0, -0.15, 0], [B.armR * 1.25, 0.16, B.armR * 1.25]); // bicep
    add(A, SPH(), B.pad, [0, -B.arm * 0.48, -0.07], [0.075, 0.075, 0.05]); // elbow pad
    add(A, CYL(), "#d6c49a", [0, -B.arm + 0.1, 0], [B.armR * 1.08, 0.08, B.armR * 1.08]); // wrist wrap
    const hand = grp(A, [0, -B.arm + 0.01, 0]);
    add(hand, SPH(), SK, [0, 0, 0.01], [0.085, 0.08, 0.085]); // fist
    add(hand, SPH(), SK, [0.045 * (A === armL ? -1 : 1), 0.015, 0.05], [0.03, 0.03, 0.035]); // thumb
    hands.push(hand);
  }
  const [handL, handR] = hands;
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR, handL, handR });
  finish(R, L.height);
  // weapons (after grounding)
  R.weapon = { leo: "katana", raph: "sai", don: "bo", mikey: "nunchaku" }[id];
  if (id === "leo") {
    katana(K, handL);
    katana(K, handR);
    R.pose = { armOut: 0.32, armFwd: -0.35, lean: 0.06, wrist: -0.55, wristL: -0.55 };
  } else if (id === "raph") {
    sai(K, handL);
    sai(K, handR);
    R.pose = { armOut: 0.3, armFwd: -0.45, lean: 0.1, wrist: -0.4, wristL: -0.4 };
  } else if (id === "don") {
    bo(K, handR);
    R.pose = { armOut: 0.22, armFwd: -0.25, lean: 0.03, wrist: -HALF_PI + 0.25, wristL: 0, staff: true };
  } else {
    R.extra.chucks = [nunchaku(K, handL), nunchaku(K, handR)];
    R.pose = { armOut: 0.3, armFwd: -0.3, lean: 0.05, wrist: 0.1, wristL: 0.1 };
  }
  return seal(R, K);
}

/* ================================================================= Foot Clan */
function buildFoot(variant = 0) {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb } = K;
  const SUIT = ["#2c2c35", "#33313a", "#282c34"][variant % 3];
  const DK = "#1c1c22", WRAP = "#5c5c66", RED = "#c8202a";
  const legL = grp(R.inner, [0.15, 0.88, 0]);
  const legR = grp(R.inner, [-0.15, 0.88, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.105, 0.86, SUIT);
    add(L, CYL(), WRAP, [0, -0.62, 0], [0.11, 0.18, 0.11]); // shin wraps
    add(L, SPH(), DK, [0, -0.86, 0.07], [0.1, 0.06, 0.17]);
  }
  add(R.inner, SPH(), SUIT, [0, 0.9, 0], [0.26, 0.14, 0.19]);
  const torso = grp(R.inner, [0, 0.92, 0]);
  add(torso, SPH(), SUIT, [0, 0.33, 0], [0.29, 0.38, 0.2]);
  add(torso, BOX(), DK, [0, 0.33, 0.12], [0.36, 0.42, 0.1]); // chest panel
  add(torso, CYL(), RED, [0, 0.4, 0.18], [0.085, 0.02, 0.085], [HALF_PI, 0, 0]); // Foot emblem
  for (const [x, y] of [[-0.04, 0.47], [0, 0.48], [0.04, 0.47]]) add(torso, BOX(), DK, [x, y, 0.19], [0.022, 0.05, 0.012]);
  add(torso, BOX(), DK, [0, 0.36, 0.19], [0.06, 0.03, 0.012]);
  add(torso, TORUS(), "#5a1a22", [0, 0.06, 0], [0.27, 0.19, 0.5], [HALF_PI, 0, 0]); // sash
  for (const s of [1, -1]) add(torso, SPH(), SUIT, [s * 0.28, 0.57, 0], [0.12, 0.1, 0.12]);
  add(torso, CYL(), SUIT, [0, 0.68, 0.02], [0.08, 0.12, 0.08]);
  const head = grp(torso, [0, 0.72, 0.03]);
  add(head, SPH(), DK, [0, 0.14, 0], [0.17, 0.18, 0.18]); // hood
  add(head, BOX(), "#e8e2d8", [0, 0.16, 0.15], [0.2, 0.05, 0.06]); // eye slit
  for (const s of [1, -1]) add(head, SPH(), "#111111", [s * 0.055, 0.16, 0.18], [0.025, 0.018, 0.01]);
  add(head, BOX(), DK, [0, 0.3, -0.02], [0.03, 0.06, 0.2]); // hood seam
  const armL = grp(torso, [0.31, 0.54, 0]);
  const armR = grp(torso, [-0.31, 0.54, 0]);
  const hands = [];
  for (const A of [armL, armR]) {
    limb(A, 0.075, 0.64, SUIT);
    add(A, CYL(), WRAP, [0, -0.5, 0], [0.08, 0.16, 0.08]);
    const hand = grp(A, [0, -0.63, 0]);
    add(hand, SPH(), DK, [0, 0, 0.01], 0.07);
    hands.push(hand);
  }
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR, handL: hands[0], handR: hands[1] });
  finish(R, 1.8);
  katana(K, hands[1], 0.85);
  R.weapon = "katana";
  R.pose = { armOut: 0.25, armFwd: -0.3, lean: 0.08, wrist: -0.5, wristL: 0 };
  return seal(R, K);
}

function buildElite() {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb } = K;
  const SUIT = "#3a1f36", ARM = "#7a7f8a", ARM2 = "#4e525c", DK = "#1a1418", RED = "#d02a2a";
  const legL = grp(R.inner, [0.18, 0.92, 0]);
  const legR = grp(R.inner, [-0.18, 0.92, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.125, 0.9, SUIT);
    add(L, BOX(), ARM, [0, -0.5, 0.08], [0.18, 0.26, 0.08]); // shin guard
    add(L, SPH(), DK, [0, -0.9, 0.07], [0.12, 0.07, 0.19]);
  }
  add(R.inner, BOX(), ARM2, [0, 0.82, 0.02], [0.5, 0.32, 0.36]); // armored skirt
  const torso = grp(R.inner, [0, 0.96, 0]);
  add(torso, SPH(), SUIT, [0, 0.36, 0], [0.35, 0.42, 0.25]);
  add(torso, BOX(), ARM, [0, 0.4, 0.13], [0.52, 0.5, 0.14]); // chest plate
  add(torso, CYL(), RED, [0, 0.46, 0.21], [0.1, 0.02, 0.1], [HALF_PI, 0, 0]);
  for (const s of [1, -1]) {
    add(torso, BOX(), ARM, [s * 0.42, 0.66, 0], [0.26, 0.1, 0.3], [0, 0, s * -0.35]); // pauldrons
    add(torso, BOX(), ARM2, [s * 0.45, 0.58, 0], [0.24, 0.08, 0.28], [0, 0, s * -0.45]);
  }
  add(torso, CYL(), SUIT, [0, 0.76, 0.02], [0.1, 0.12, 0.1]);
  const head = grp(torso, [0, 0.8, 0.03]);
  add(head, SPH(), ARM, [0, 0.16, 0], [0.19, 0.2, 0.2]); // helmet
  add(head, BOX(), DK, [0, 0.12, 0.13], [0.26, 0.14, 0.12]); // face guard
  add(head, BOX(), RED, [0, 0.16, 0.19], [0.18, 0.03, 0.02], [0, 0, 0], "#ff2a1a"); // glowing visor
  add(head, CONE(), ARM2, [0, 0.42, -0.02], [0.04, 0.2, 0.08]); // crest
  for (const s of [1, -1]) add(head, CONE(), ARM2, [s * 0.18, 0.27, 0], [0.03, 0.16, 0.03], [0, 0, -s * 0.6]); // horns
  const armL = grp(torso, [0.42, 0.58, 0]);
  const armR = grp(torso, [-0.42, 0.58, 0]);
  const hands = [];
  for (const A of [armL, armR]) {
    limb(A, 0.09, 0.7, SUIT);
    add(A, CYL(), ARM, [0, -0.52, 0], [0.105, 0.24, 0.105]); // bracer
    const hand = grp(A, [0, -0.69, 0]);
    add(hand, SPH(), DK, [0, 0, 0.01], 0.085);
    hands.push(hand);
  }
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR, handL: hands[0], handR: hands[1] });
  finish(R, 2.05);
  naginata(K, hands[1]);
  R.weapon = "naginata";
  R.pose = { armOut: 0.3, armFwd: -0.4, lean: 0.06, wrist: -HALF_PI + 0.35, wristL: 0 };
  return seal(R, K);
}

function buildShredder() {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb } = K;
  const GI = "#3a1630", GI2 = "#24101e", MET = "#b8bfcc", MET2 = "#7c8494", DK = "#141016", CAPE = "#5a1e5e", RED = "#ff2a20";
  const legL = grp(R.inner, [0.2, 0.98, 0]);
  const legR = grp(R.inner, [-0.2, 0.98, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.13, 0.96, GI);
    add(L, BOX(), MET, [0, -0.47, 0.08], [0.2, 0.18, 0.1]); // knee guard
    add(L, CONE(), MET, [0, -0.44, 0.15], [0.035, 0.13, 0.035], [HALF_PI, 0, 0]); // knee spike
    add(L, BOX(), MET2, [0, -0.78, 0.04], [0.2, 0.3, 0.22]); // greave
    add(L, SPH(), DK, [0, -0.96, 0.08], [0.13, 0.08, 0.21]);
  }
  add(R.inner, BOX(), GI2, [0, 0.86, 0.02], [0.52, 0.34, 0.38]);
  for (const s of [1, -1]) add(R.inner, BOX(), MET2, [s * 0.2, 0.8, 0.15], [0.2, 0.3, 0.06], [0, 0, s * 0.1]); // tassets
  const torso = grp(R.inner, [0, 1.02, 0]);
  add(torso, SPH(), GI, [0, 0.38, 0], [0.38, 0.44, 0.27]);
  add(torso, BOX(), MET, [0, 0.44, 0.14], [0.56, 0.5, 0.16]); // breastplate
  for (let i = 0; i < 3; i++) add(torso, BOX(), MET2, [0, 0.26 + i * 0.13, 0.225], [0.5 - i * 0.04, 0.02, 0.02]);
  add(torso, CYL(), "#c8202a", [0, 0.56, 0.23], [0.07, 0.012, 0.07], [HALF_PI, 0, 0]);
  add(torso, BOX(), DK, [0, 0.08, 0.05], [0.6, 0.1, 0.42]); // belt
  for (const s of [1, -1]) {
    const pad = grp(torso, [s * 0.46, 0.72, 0]);
    pad.rotation.z = -s * 0.3;
    add(pad, SPH(), MET, [0, 0, 0], [0.22, 0.12, 0.24]);
    for (let i = 0; i < 3; i++) add(pad, CONE(), MET, [s * (0.02 + i * 0.03), 0.1, -0.12 + i * 0.12], [0.04, 0.24, 0.04], [0, 0, -s * 0.25]); // spikes
  }
  add(torso, CYL(), GI2, [0, 0.82, 0.02], [0.12, 0.14, 0.12]);
  // cape hangs from the shoulders
  const cape = grp(torso, [0, 0.78, -0.24]);
  add(cape, BOX(), CAPE, [0, -0.6, -0.04], [0.82, 1.25, 0.03]);
  add(cape, BOX(), "#3a0e3e", [0, -0.6, -0.025], [0.7, 1.15, 0.02]);
  R.extra.cape = cape;
  // helmet: dome, central fin, face mask with glowing eye slit
  const head = grp(torso, [0, 0.86, 0.04]);
  add(head, SPH(), MET, [0, 0.17, -0.01], [0.21, 0.22, 0.22]);
  add(head, BOX(), MET, [0, 0.38, -0.04], [0.04, 0.2, 0.36], [0.25, 0, 0]); // crest fin
  add(head, BOX(), MET2, [0, 0.3, 0.16], [0.03, 0.12, 0.1], [0.3, 0, 0]);
  add(head, BOX(), DK, [0, 0.1, 0.15], [0.3, 0.22, 0.1]); // face mask
  add(head, BOX(), RED, [0, 0.16, 0.205], [0.2, 0.03, 0.02], [0, 0, 0], "#ff2010"); // eyes
  for (const s of [1, -1]) {
    add(head, BOX(), MET, [s * 0.2, 0.12, 0.02], [0.05, 0.24, 0.22]); // cheek guards
    add(head, CONE(), MET, [s * 0.22, 0.32, -0.02], [0.03, 0.16, 0.03], [0, 0, -s * 0.5]); // side horns
  }
  for (let i = 0; i < 4; i++) add(head, BOX(), MET2, [-0.09 + i * 0.06, 0.035, 0.205], [0.02, 0.08, 0.015]); // mouth grill
  const armL = grp(torso, [0.48, 0.64, 0]);
  const armR = grp(torso, [-0.48, 0.64, 0]);
  const hands = [];
  for (const A of [armL, armR]) {
    limb(A, 0.1, 0.76, GI);
    add(A, CYL(), MET, [0, -0.55, 0], [0.12, 0.3, 0.12]); // gauntlet
    add(A, BOX(), MET2, [0, -0.55, 0.11], [0.08, 0.26, 0.04]);
    const hand = grp(A, [0, -0.75, 0]);
    add(hand, SPH(), DK, [0, 0, 0.01], 0.095);
    hands.push(hand);
  }
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR, handL: hands[0], handR: hands[1] });
  finish(R, 2.3);
  // three blades out of each gauntlet (follow the hand's +Z like any weapon)
  for (const hand of hands) {
    const w = grp(hand);
    for (const k of [-1, 0, 1]) add(w, CONE4(), STEEL, [k * 0.05, 0, 0.3], [0.025, 0.5, 0.012], [HALF_PI, 0, k * 0.08]);
    R.extra.claws = R.extra.claws || [];
    R.extra.claws.push(w);
  }
  R.weapon = "claws";
  R.pose = { armOut: 0.32, armFwd: -0.35, lean: 0.05, wrist: 0.9, wristL: 0.9 };
  return seal(R, K);
}

/* ================================================================= allies */
function buildSplinter() {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb, chain } = K;
  const FUR = "#7a5a3c", FUR2 = "#5a3e28", PINK = "#d89a9a", ROBE = "#7a2232", ROBE2 = "#4a121e", WH = "#e8e0d0";
  const legL = grp(R.inner, [0.1, 0.42, 0]);
  const legR = grp(R.inner, [-0.1, 0.42, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.07, 0.4, FUR2);
    add(L, SPH(), PINK, [0, -0.41, 0.07], [0.07, 0.04, 0.13]);
  }
  add(R.inner, CONE(), ROBE, [0, 0.5, 0], [0.3, 0.6, 0.27]); // robe skirt
  const torso = grp(R.inner, [0, 0.62, 0]);
  add(torso, SPH(), ROBE, [0, 0.22, -0.02], [0.24, 0.3, 0.2]);
  add(torso, BOX(), ROBE2, [0, 0.03, 0.02], [0.4, 0.06, 0.36]); // sash
  add(torso, BOX(), ROBE2, [0.03, 0.24, 0.17], [0.05, 0.42, 0.04], [0, 0, -0.35]); // collar
  const head = grp(torso, [0, 0.44, 0.08]);
  head.rotation.x = 0.2;
  add(head, SPH(), FUR, [0, 0.12, 0], [0.16, 0.15, 0.17]);
  add(head, CONE(), FUR, [0, 0.07, 0.2], [0.09, 0.22, 0.08], [HALF_PI, 0, 0]); // snout
  add(head, SPH(), "#2a1a1a", [0, 0.07, 0.32], [0.035, 0.03, 0.03]); // nose
  add(head, SPH(), WH, [0, -0.02, 0.12], [0.1, 0.08, 0.1]); // beard
  add(head, CONE(), WH, [0, -0.12, 0.13], [0.06, 0.18, 0.05], [Math.PI, 0, 0]);
  for (const s of [1, -1]) {
    add(head, SPH(), FUR, [s * 0.13, 0.25, -0.03], [0.09, 0.1, 0.03]); // ears
    add(head, SPH(), PINK, [s * 0.13, 0.25, -0.01], [0.06, 0.07, 0.02]);
    add(head, SPH(), "#111111", [s * 0.065, 0.15, 0.13], [0.025, 0.028, 0.02]);
    add(head, CYL(), WH, [s * 0.1, 0.06, 0.25], [0.004, 0.22, 0.004], [0, 0, s * 1.3]); // whiskers
  }
  const armL = grp(torso, [0.24, 0.36, 0]);
  const armR = grp(torso, [-0.24, 0.36, 0]);
  const hands = [];
  for (const A of [armL, armR]) {
    limb(A, 0.07, 0.42, ROBE);
    const hand = grp(A, [0, -0.42, 0]);
    add(hand, SPH(), PINK, [0, 0, 0.01], 0.055);
    hands.push(hand);
  }
  const tb = grp(R.inner, [0, 0.36, -0.22]);
  R.tail = chain(tb, 6, 0.14, 0.03, () => PINK, [-1.2, 0.18]);
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR, handL: hands[0], handR: hands[1] });
  finish(R, 1.25);
  // gnarled walking stick in the right hand, planted on the ground
  const stick = grp(hands[1]);
  add(stick, CYL(), "#6a4a24", [0, 0, 0.12], [0.024, 1.1, 0.024], [HALF_PI, 0, 0]);
  add(stick, SPH_LO(), "#5a3a1a", [0, 0, 0.68], 0.045);
  R.pose = { armOut: 0.15, armFwd: -0.35, lean: 0.12, wrist: -HALF_PI + 0.1, wristL: 0 };
  return seal(R, K);
}

function buildCivilian() {
  const R = rigBase("biped");
  const K = kit();
  const { add, grp, limb } = K;
  const SKIN = "#e8b48a", JEANS = "#3a5a8a", JACKET = "#f2c230", HAIR = "#a8441e", SHOE = "#f4f4f4";
  const legL = grp(R.inner, [0.12, 0.84, 0]);
  const legR = grp(R.inner, [-0.12, 0.84, 0]);
  for (const L of [legL, legR]) {
    limb(L, 0.09, 0.82, JEANS);
    add(L, SPH(), SHOE, [0, -0.83, 0.06], [0.09, 0.06, 0.15]);
  }
  add(R.inner, SPH(), JEANS, [0, 0.86, 0], [0.22, 0.13, 0.17]);
  const torso = grp(R.inner, [0, 0.88, 0]);
  add(torso, SPH(), JACKET, [0, 0.3, 0], [0.24, 0.33, 0.17]);
  add(torso, BOX(), "#ffffff", [0, 0.36, 0.14], [0.1, 0.32, 0.04]); // shirt
  add(torso, BOX(), "#e0a820", [0, 0.06, 0.02], [0.44, 0.06, 0.32]); // jacket hem
  add(torso, CYL(), SKIN, [0, 0.62, 0.01], [0.06, 0.1, 0.06]);
  const head = grp(torso, [0, 0.66, 0.02]);
  add(head, SPH(), SKIN, [0, 0.13, 0.01], [0.13, 0.15, 0.14]);
  add(head, SPH(), HAIR, [0, 0.19, -0.03], [0.15, 0.13, 0.15]); // hair
  add(head, BOX(), HAIR, [0, 0.02, -0.1], [0.24, 0.26, 0.1]); // hair back
  for (const s of [1, -1]) add(head, SPH(), "#2a2a2a", [s * 0.045, 0.14, 0.13], [0.018, 0.022, 0.01]);
  add(head, BOX(), "#a04040", [0, 0.07, 0.14], [0.05, 0.012, 0.01]);
  const armL = grp(torso, [0.26, 0.52, 0]);
  const armR = grp(torso, [-0.26, 0.52, 0]);
  const hands = [];
  for (const A of [armL, armR]) {
    limb(A, 0.065, 0.6, JACKET);
    const hand = grp(A, [0, -0.6, 0]);
    add(hand, SPH(), SKIN, [0, 0, 0.01], 0.055);
    hands.push(hand);
  }
  Object.assign(R.parts, { torso, head, armL, armR, legL, legR, handL: hands[0], handR: hands[1] });
  finish(R, 1.7);
  // rope ring (only visible while tied)
  const rope = add(torso, TORUS(), "#c8a870", [0, 0.25, -0.02], [0.27, 0.27, 0.35], [HALF_PI, 0, 0]);
  R.extra.rope = rope;
  R.pose = { armOut: 0.12, armFwd: -0.1, lean: 0, wrist: 0, wristL: 0 };
  return seal(R, K);
}

export function buildDummy() {
  const K = kit();
  const { add, grp } = K;
  const root = new THREE.Group();
  const post = grp(root);
  add(post, CYL(), "#7a5530", [0, 0.75, 0], [0.12, 1.5, 0.12]);
  add(post, CYL(), "#b88c52", [0, 1.1, 0], [0.27, 0.6, 0.25]); // padded body
  add(post, CYL(), "#7a2a20", [0, 1.1, 0], [0.275, 0.08, 0.255]);
  add(post, SPH(), "#c8a068", [0, 1.62, 0], 0.19);
  add(post, CYL(), "#2a2a30", [0, 1.64, 0], [0.195, 0.07, 0.195]); // painted "Foot" band
  add(post, CYL(), "#7a5530", [0, 1.25, 0], [0.04, 1.0, 0.04], [0, 0, HALF_PI]);
  add(root, CYL(), "#3e3a34", [0, 0.06, 0], [0.38, 0.12, 0.38]);
  return { root, post, mats: [...K.mats.values()] };
}

const BUILDERS = {
  leo: () => buildTurtle("leo"),
  raph: () => buildTurtle("raph"),
  don: () => buildTurtle("don"),
  mikey: () => buildTurtle("mikey"),
  foot: buildFoot,
  elite: buildElite,
  shredder: buildShredder,
  splinter: buildSplinter,
  civilian: buildCivilian,
};

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
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v) => {
  v = clamp01(v);
  return v * v * (3 - 2 * v);
};
/** Rise to 1 at `peak`, fall back to 0 by the end. */
const env = (p, peak = 0.38) => (p < peak ? clamp01(p / peak) : clamp01(1 - (p - peak) / (1 - peak)));
/** A sweep parameter: 0 before a, 1 after b, eased between. */
const sweep = (p, a, b) => ease((p - a) / (b - a));

/**
 * Animate a rig for one frame.
 * s: { anim, p (0..1 progress for one-shot moves), t (seconds), speed, maxSpeed,
 *      grounded, style (weapon move), special (id), combo, flash }
 */
export function poseCharacter(R, s, dt) {
  const kk = lerpK(dt, 18);
  const P = R.parts;
  const t = s.t;
  const flash = s.flash > 0;
  if (flash !== R.state.flash) {
    R.state.flash = flash;
    for (const m of R.mats) {
      if (flash) m.emissive.setRGB(0.45, 0.1, 0.05);
      else if (m.userData.glow) m.emissive.copy(m.userData.glow);
      else m.emissive.setRGB(0, 0, 0);
    }
  }
  const base = R.pose;
  const run = s.maxSpeed ? Math.min(1.2, s.speed / s.maxSpeed) : 0;
  R.state.ph = (R.state.ph || 0) + dt * (s.speed || 0) * 2.5;
  const ph = R.state.ph;
  const T = {
    torso: { x: base.lean, y: 0, z: 0, py: 0 },
    head: { x: 0, y: 0 },
    aL: { x: base.armFwd, y: 0, z: base.armOut },
    aR: { x: base.armFwd, y: 0, z: -base.armOut },
    wL: base.wristL ?? base.wrist,
    wR: base.wrist,
    lL: { x: 0, z: 0 },
    lR: { x: 0, z: 0 },
    spin: { x: 0, py: R.cH, sy: 1 },
  };
  const breathe = Math.sin(t * 2.2) * 0.02;
  T.torso.py = breathe * 0.5;
  T.aL.x += breathe;
  T.aR.x += breathe;
  let rollSet = null, spinYSet = null, chuckSpin = 0, cape = 0.12;

  const moveAnim = () => {
    if (run > 0.08) {
      const a = 0.35 + run * 0.55;
      T.lL.x = Math.sin(ph) * a;
      T.lR.x = -Math.sin(ph) * a;
      const armSwing = base.staff ? 0.35 : 0.75;
      T.aL.x = base.armFwd * 0.6 - Math.sin(ph) * a * armSwing;
      T.aR.x = base.armFwd * 0.6 + Math.sin(ph) * a * (base.staff ? 0.2 : armSwing);
      T.torso.x = base.lean + run * 0.2;
      T.torso.py = Math.abs(Math.sin(ph)) * 0.05 * run;
      T.torso.y = Math.sin(ph) * 0.12 * run;
      if (base.staff) T.wR = -HALF_PI + 0.5 + run * 0.3; // staff tilts forward while running
      cape = 0.25 + run * 0.5;
    }
  };
  // --------------------------------------------------- weapon move library
  const sideSlash = (right, p, wrist = 1.3) => {
    // horizontal sweep from behind the shoulder across the front
    const u = sweep(p, 0.08, 0.5);
    const back = clamp01((p - 0.6) / 0.4);
    const A = right ? T.aR : T.aL;
    const sg = right ? 1 : -1;
    A.z = -sg * 1.45 * (1 - back) + (right ? -base.armOut : base.armOut) * back;
    A.y = sg * (-0.7 + 3.0 * u) * (1 - back);
    A.x = base.armFwd * back;
    if (right) T.wR = wrist * (1 - back) + base.wrist * back;
    else T.wL = wrist * (1 - back) + (base.wristL ?? base.wrist) * back;
    T.torso.y = sg * (-0.45 + 0.95 * u) * (1 - back);
    T.lL.x = right ? -0.2 : 0.25;
    T.lR.x = right ? 0.25 : -0.2;
  };
  const overhead = (p, both, wrist = 0.7, lean = 0.25) => {
    // raise high behind the head, chop down in front
    const up = clamp01(p / 0.3);
    const down = sweep(p, 0.28, 0.48);
    const back = clamp01((p - 0.62) / 0.38);
    const ax = (-2.9 * up + 2.2 * down) * (1 - back) + base.armFwd * back;
    T.aR.x = ax;
    T.aR.z = -0.12;
    T.wR = (-0.2 + wrist * down) * (1 - back) + base.wrist * back;
    if (both) {
      T.aL.x = ax;
      T.aL.z = 0.12;
      T.wL = T.wR;
    }
    T.torso.x = base.lean + (-0.15 * up + lean * down) * (1 - back);
    T.lL.x = -0.35 * down;
    T.lR.x = 0.3 * down;
    T.spin.py = R.cH * (1 - 0.06 * down * (1 - back));
  };
  const stab = (right, p, both = false) => {
    const e = env(p, 0.38);
    const A = right ? T.aR : T.aL;
    A.x = 0.3 - 1.9 * e;
    A.z = (right ? -1 : 1) * 0.05;
    const w = (right ? base.wrist : base.wristL) * (1 - e) + 1.6 * e;
    if (right) T.wR = w;
    else T.wL = w;
    if (both) {
      T.aL.x = T.aR.x = 0.3 - 1.9 * e;
      T.aL.z = 0.1;
      T.aR.z = -0.1;
      T.wL = T.wR = base.wrist * (1 - e) + 1.6 * e;
    }
    T.torso.y = both ? 0 : (right ? 0.5 : -0.5) * e;
    T.torso.x = base.lean + 0.25 * e;
    T.lL.x = right ? -0.3 * e : 0.3 * e;
    T.lR.x = right ? 0.3 * e : -0.3 * e;
  };
  const chuck = (right, p) => {
    const e = env(p, 0.4);
    const A = right ? T.aR : T.aL;
    A.x = 0.5 - 2.6 * e;
    A.z = (right ? -1 : 1) * (0.25 + 0.4 * e);
    T.torso.y = (right ? 0.45 : -0.45) * e;
    chuckSpin = right ? 1 : -1;
  };

  switch (s.anim) {
    case "idle":
    case "move":
    case "patrol":
    case "chase":
    case "recover":
      moveAnim();
      break;
    case "air":
      moveAnim();
      T.lL.x = -0.8;
      T.lR.x = -0.2;
      T.aL.z = base.armOut + 0.5;
      T.aR.z = -(base.armOut + 0.5);
      T.aL.x = T.aR.x = -0.5;
      break;
    case "dodge": {
      // tuck into the shell and roll
      rollSet = ease(s.p) * Math.PI * 2;
      T.lL.x = T.lR.x = -1.4;
      T.aL.x = T.aR.x = -1.1;
      T.aL.z = 0.5;
      T.aR.z = -0.5;
      T.head.x = 0.5;
      T.spin.py = R.cH * 0.72;
      T.spin.sy = 0.88;
      chuckSpin = 0.5;
      break;
    }
    case "light":
    case "heavy": {
      const p = s.p;
      switch (s.style) {
        case "slashR":
          sideSlash(true, p);
          break;
        case "slashL":
          sideSlash(false, p);
          break;
        case "cross":
          overhead(p, true, 0.8, 0.35);
          T.aL.z = 0.35;
          T.aR.z = -0.35;
          break;
        case "cleave":
          overhead(p, true, 0.9, 0.5);
          break;
        case "stabR":
          stab(true, p);
          break;
        case "stabL":
          stab(false, p);
          break;
        case "upper": {
          const e = env(p, 0.4);
          T.aL.x = T.aR.x = 0.4 - 3.0 * e;
          T.aL.z = 0.2;
          T.aR.z = -0.2;
          T.wL = T.wR = base.wrist * (1 - e) + 1.5 * e;
          T.torso.x = base.lean - 0.3 * e;
          T.spin.py = R.cH + 0.15 * e;
          break;
        }
        case "doubleStab":
          stab(true, p, true);
          T.aL.x = T.aR.x = 0.3 - 2.05 * env(p, 0.38);
          T.torso.x = base.lean + 0.3 * env(p, 0.45);
          T.spin.py = R.cH * (1 - 0.1 * env(p, 0.45));
          break;
        case "thrust": {
          const e = env(p, 0.38);
          T.aR.x = 0.2 - 1.75 * e;
          T.aR.z = -0.05;
          T.wR = base.wrist * (1 - e) + 1.55 * e;
          T.aL.x = -0.4 - 1.0 * e;
          T.aL.z = -0.15 * e + base.armOut * (1 - e);
          T.torso.y = 0.3 * e;
          T.torso.x = base.lean + 0.2 * e;
          T.lL.x = -0.35 * e;
          T.lR.x = 0.3 * e;
          break;
        }
        case "sweepR":
          sideSlash(true, p, 1.45);
          break;
        case "smash":
          overhead(p, false, 0.55, 0.3);
          T.aL.x = T.aR.x * 0.8;
          T.aL.z = -0.1;
          break;
        case "spinSweep": {
          spinYSet = sweep(p, 0.12, 0.7) * Math.PI * 2;
          T.aR.z = -1.5;
          T.aR.y = HALF_PI;
          T.wR = 1.45;
          T.aL.z = 0.6;
          T.aL.x = -0.6;
          T.spin.py = R.cH * 0.94;
          break;
        }
        case "chuckR":
          chuck(true, p);
          break;
        case "chuckL":
          chuck(false, p);
          break;
        case "chuckBoth": {
          spinYSet = sweep(p, 0.1, 0.6) * Math.PI * 2;
          T.aL.z = 1.4;
          T.aR.z = -1.4;
          T.aL.x = T.aR.x = -0.3;
          chuckSpin = 1;
          break;
        }
        case "chuckSpin": {
          spinYSet = sweep(p, 0.1, 0.75) * Math.PI * 4;
          T.aL.z = 1.5;
          T.aR.z = -1.5;
          T.aL.x = T.aR.x = 0;
          T.lL.z = 0.3;
          T.lR.z = -0.3;
          chuckSpin = 1;
          break;
        }
        default: {
          // generic enemy-style slash
          const e = env(p);
          T.aR.x = -1.6 * e;
          T.wR = base.wrist * (1 - e) + 1.2 * e;
        }
      }
      break;
    }
    case "special": {
      const p = s.p;
      switch (s.special) {
        case "cyclone":
          spinYSet = sweep(p, 0.08, 0.85) * Math.PI * 6;
          T.aL.z = 1.5;
          T.aR.z = -1.5;
          T.aL.y = -0.6;
          T.aR.y = 0.6;
          T.wL = T.wR = 1.45;
          T.lL.z = 0.25;
          T.lR.z = -0.25;
          T.spin.py = R.cH * 0.96;
          break;
        case "quake": {
          const up = p < 0.62;
          T.aL.x = T.aR.x = up ? -2.8 : -0.9;
          T.aL.z = up ? 0.3 : 0.6;
          T.aR.z = -T.aL.z;
          T.wL = T.wR = up ? 0 : 2.4; // sai point down into the ground
          T.lL.x = T.lR.x = up ? -1.0 : -0.4;
          T.torso.x = up ? -0.1 : 0.6;
          if (!up) T.spin.py = R.cH * 0.8;
          break;
        }
        case "shockwave":
          overhead(p * 0.95, true, 0.45, 0.4);
          T.aL.z = -0.08;
          if (p > 0.45) T.spin.py = R.cH * 0.84;
          break;
        case "tornado":
          spinYSet = p * Math.PI * 5;
          T.aL.z = 1.45;
          T.aR.z = -1.45;
          T.torso.x = 0.35;
          chuckSpin = 1;
          break;
        default:
          break;
      }
      break;
    }
    case "hit":
    case "hurt": {
      const w = Math.sin(clamp01(s.p) * Math.PI);
      T.torso.x = base.lean - 0.45 * w;
      T.head.x = -0.35 * w;
      T.aL.z = base.armOut + 0.6 * w;
      T.aR.z = -(base.armOut + 0.6 * w);
      T.aL.x = T.aR.x = 0.2 * w;
      break;
    }
    case "stagger": {
      const w = Math.sin(clamp01(s.p) * Math.PI);
      T.torso.x = base.lean - 0.5 * w;
      T.head.x = -0.4 * w;
      T.aL.z = 1.0 * w + base.armOut;
      T.aR.z = -T.aL.z;
      T.spin.py = R.cH * (1 - 0.05 * w);
      break;
    }
    case "ko": {
      // fall backwards (turtles land on their shell)
      const p = clamp01(s.p * 1.6);
      T.spin.x = -1.5 * p;
      T.spin.py = R.cH + (R.cH * (R.kind === "turtle" ? 0.42 : 0.2) - R.cH) * p + Math.max(0, Math.sin(p * Math.PI)) * 0.25;
      T.aL.z = 1.1;
      T.aR.z = -1.1;
      T.lL.z = 0.25;
      T.lR.z = -0.25;
      T.lL.x = T.lR.x = -0.3;
      T.head.x = 0.2;
      break;
    }
    case "kneelKo": {
      // the Shredder: drop to a knee, then topple forward
      const k = clamp01(s.p / 0.45);
      const f = sweep(s.p, 0.55, 0.95);
      T.spin.py = R.cH * (1 - 0.3 * k) - R.cH * 0.4 * f;
      T.lL.x = -1.4 * k;
      T.lR.x = 1.2 * k * (1 - f);
      T.torso.x = 0.3 * k;
      T.aL.x = T.aR.x = -0.4 * k;
      T.aL.z = 0.35;
      T.aR.z = -0.35;
      T.head.x = 0.4 * k;
      T.spin.x = 1.35 * f;
      cape = 0.05;
      break;
    }
    case "windup": {
      const e = clamp01(s.p * 1.3);
      if (R.weapon === "naginata") {
        T.aR.x = -2.6 * e;
        T.wR = -0.6 * e + base.wrist * (1 - e);
        T.aL.x = -2.3 * e;
        T.torso.x = base.lean - 0.25 * e;
      } else if (R.weapon === "claws") {
        T.aR.z = -(base.armOut + 0.9 * e);
        T.aR.y = -0.8 * e;
        T.aR.x = -0.6 * e;
        T.aL.z = base.armOut + 0.9 * e;
        T.aL.y = 0.8 * e;
        T.aL.x = -0.6 * e;
        T.torso.x = base.lean - 0.2 * e;
        T.head.x = 0.1;
      } else {
        T.aR.x = -2.5 * e;
        T.aR.z = -0.3;
        T.wR = base.wrist * (1 - e) + 0.2 * e;
        T.torso.y = -0.4 * e;
        T.torso.x = base.lean - 0.12 * e;
      }
      break;
    }
    case "strike": {
      const p = clamp01(s.p);
      if (R.weapon === "claws") {
        const second = s.combo === 2;
        sideSlash(!second, p, 1.0);
        T.torso.x = base.lean + 0.2;
      } else if (R.weapon === "naginata") {
        overhead(0.3 + p * 0.7, true, 0.55, 0.3);
      } else overhead(0.28 + p * 0.72, false, 0.9, 0.3);
      break;
    }
    case "aim": {
      // the Shredder crouches, one gauntlet drawn back, eyes on the lane
      const e = clamp01(s.p * 2);
      T.spin.py = R.cH * (1 - 0.1 * e);
      T.torso.x = base.lean + 0.45 * e;
      T.aR.x = 0.9 * e;
      T.aR.z = -(base.armOut + 0.4 * e);
      T.aL.x = -1.2 * e;
      T.lL.x = -0.6 * e;
      T.lR.x = 0.5 * e;
      T.head.x = -0.35 * e;
      cape = 0.3;
      break;
    }
    case "rush":
      T.torso.x = 0.7;
      T.aR.x = -1.7;
      T.wR = 1.4;
      T.aL.x = 0.6;
      T.lL.x = Math.sin(t * 30) * 0.9;
      T.lR.x = -Math.sin(t * 30) * 0.9;
      T.head.x = -0.4;
      cape = 0.85;
      break;
    case "tired": {
      const b = Math.sin(t * 7) * 0.05;
      T.torso.x = 0.55 + b;
      T.spin.py = R.cH * 0.94;
      T.aL.x = T.aR.x = -0.2;
      T.aL.z = 0.2;
      T.aR.z = -0.2;
      T.head.x = 0.2;
      T.lL.x = -0.3;
      T.lR.x = 0.25;
      break;
    }
    case "taunt": {
      const e = clamp01(s.p * 3);
      T.torso.x = -0.2 * e;
      T.head.x = -0.3 * e;
      T.aL.z = 1.3 * e + base.armOut * (1 - e);
      T.aR.z = -T.aL.z;
      T.aL.x = T.aR.x = -0.4 * e;
      T.wL = T.wR = 1.2;
      cape = 0.6;
      break;
    }
    case "tied": {
      // kneeling, hands bound behind the back
      T.spin.py = R.cH * 0.66;
      T.lL.x = -1.5;
      T.lR.x = -1.5;
      T.aL.x = T.aR.x = 0.5;
      T.aL.z = -0.15;
      T.aR.z = 0.15;
      T.head.x = 0.15 + Math.sin(t * 1.4) * 0.12;
      T.head.y = Math.sin(t * 0.9) * 0.4;
      break;
    }
    case "cheer": {
      T.aL.x = T.aR.x = -2.8 + Math.sin(t * 8) * 0.2;
      T.aL.z = 0.35;
      T.aR.z = -0.35;
      T.spin.py = R.cH + Math.abs(Math.sin(t * 6)) * 0.12;
      break;
    }
    case "talk":
      T.aL.x = -1.1 + Math.sin(t * 5) * 0.2;
      T.aL.z = 0.4;
      T.head.x = Math.sin(t * 3) * 0.06;
      break;
    case "victory":
      T.aR.x = -2.9;
      T.aR.z = -0.15;
      T.wR = 0;
      T.aL.z = base.armOut + 0.5;
      T.torso.x = -0.05;
      T.head.x = -0.15;
      break;
    default:
      moveAnim();
  }

  // apply (damped)
  damp(P.torso.rotation, "x", T.torso.x, kk);
  damp(P.torso.rotation, "y", T.torso.y, kk);
  damp(P.head.rotation, "x", T.head.x, kk);
  damp(P.head.rotation, "y", T.head.y, kk);
  const fast = s.anim === "light" || s.anim === "heavy" || s.anim === "special" || s.anim === "strike";
  const ka = fast ? lerpK(dt, 34) : kk; // swings snap, everything else eases
  for (const [A, a] of [[P.armL, T.aL], [P.armR, T.aR]]) {
    damp(A.rotation, "x", a.x, ka);
    damp(A.rotation, "y", a.y, ka);
    damp(A.rotation, "z", a.z, ka);
  }
  damp(P.handL.rotation, "x", T.wL, ka);
  damp(P.handR.rotation, "x", T.wR, ka);
  damp(P.legL.rotation, "x", T.lL.x, kk);
  damp(P.legL.rotation, "z", T.lL.z, kk);
  damp(P.legR.rotation, "x", T.lR.x, kk);
  damp(P.legR.rotation, "z", T.lR.z, kk);
  if (R.state.torsoY0 == null) R.state.torsoY0 = P.torso.position.y;
  P.torso.position.y = R.state.torsoY0 + T.torso.py;
  // spin group: rolls/whirls are set directly, everything else damped
  const ko = s.anim === "ko" || s.anim === "kneelKo";
  if (rollSet != null) R.spin.rotation.x = rollSet;
  else {
    if (Math.abs(R.spin.rotation.x) > Math.PI) R.spin.rotation.x = 0;
    damp(R.spin.rotation, "x", T.spin.x, ko ? lerpK(dt, 8) : kk);
  }
  if (spinYSet != null) R.spin.rotation.y = spinYSet;
  else {
    let y = R.spin.rotation.y % (Math.PI * 2);
    if (y > Math.PI) y -= Math.PI * 2;
    if (y < -Math.PI) y += Math.PI * 2;
    R.spin.rotation.y = y * (1 - kk);
  }
  damp(R.spin.position, "y", T.spin.py, ko ? lerpK(dt, 8) : kk);
  damp(R.spin.scale, "y", T.spin.sy, kk);
  // mask ribbons / tails trail and sway
  R.tail.forEach((g, i) => {
    if (g.userData.rx0 == null) g.userData.rx0 = g.rotation.x;
    const trail = R.kind === "turtle" ? Math.min(0.75, (s.speed || 0) * 0.11) : 0; // ribbons fly back when running
    damp(g.rotation, "x", ko ? 0.2 : g.userData.rx0 + trail * (i % 3 === 0 ? 1 : 0.3), kk);
    g.rotation.y = Math.sin(t * 3 - i * 0.7) * (0.1 + (s.speed || 0) * 0.025);
  });
  // nunchaku: spin during swings, otherwise dangle toward the ground
  if (R.extra.chucks) {
    const hands = [P.handL, P.handR];
    const arms = [P.armL, P.armR];
    R.extra.chucks.forEach((piv, i) => {
      if (chuckSpin) piv.rotation.x += dt * 26 * (i === 0 ? -1 : 1) * Math.sign(chuckSpin || 1);
      else {
        const want = HALF_PI - (arms[i].rotation.x + hands[i].rotation.x + P.torso.rotation.x) + Math.sin(t * 3 + i) * 0.12;
        let cur = piv.rotation.x % (Math.PI * 2);
        let d = want - cur;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        piv.rotation.x = cur + d * lerpK(dt, 10);
      }
    });
  }
  if (R.extra.cape) damp(R.extra.cape.rotation, "x", ko ? 0 : cape + Math.sin(t * 2.6) * 0.04, lerpK(dt, 6));
  if (R.extra.rope) R.extra.rope.visible = s.anim === "tied";
}
