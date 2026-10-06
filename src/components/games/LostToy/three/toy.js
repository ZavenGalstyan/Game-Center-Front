/**
 * Lost Toy — "Pip", the player's toy: model + procedural animation.
 *
 * An ORIGINAL small plush explorer: round stitched head with button eyes,
 * felt cheeks and a stitched smile, a yarn tuft, floppy ears, a knit scarf
 * whose tails swing with the motion, denim overalls with a knee patch, a felt
 * backpack with a sewn-on badge, mitten hands and round felt shoes.
 *
 *  root (feet position, yaw)          local frame: +Z forward, +X = LEFT, +Y up
 *   └ body (bob / lean / squash-and-stretch)
 *       ├ hipL / hipR → leg → shoe
 *       └ torso → shoulderL / shoulderR → arm → mitten
 *                → neck → head (eyes blink, ears flop, tuft)
 *                → scarf (+ two tails on springs)
 *
 * Every pose is computed from the CURRENT ENGINE STATE (never a guess):
 * locomotion legs are driven by the engine's distance-based stride phase
 * (player.js strideLength), so step rate always matches ground speed.
 * Visual states: IDLE WALK RUN SPRINT JUMP_START JUMP_ASCEND FALL LAND_SOFT
 * LAND_HARD BALANCE CLIMB_LEDGE PULL_UP PUSH_OBJECT RIDE_OBJECT BOUNCE SLIDE
 * HURT_STUMBLE RESPAWN COLLECT FINISH CELEBRATE (+ idle look-around, scarf
 * adjust, look up, sit, dust-off, pet reaction, cloth CLIMB).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { STATES as S } from "../engine/config.js";
import { mat, worldUV, KINDS, blobTexture } from "./materials.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

import { cosmeticById } from "../data/cosmetics.js";

const PLUSH = "#f1dfc3"; // body fabric
const PLUSH_DARK = "#e2c9a4";
const STITCH = "#5b3a2a";

/* ------------------------------------------------------------------ geometry helpers */
function ell(rx, ry, rz, w = 22, h = 16) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}
function cap(r, len, seg = 14) {
  // capsule hanging along -Y from the origin (joint at top)
  const g = new THREE.CapsuleGeometry(r, len, 5, seg);
  g.translate(0, -len / 2 - r * 0.2, 0);
  return g;
}
function lathe(pts, seg = 22, sx = 1, sz = 1) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------------ model */
export function buildToy(cosmeticId = "classic", { shadows = true } = {}) {
  const O = cosmeticById(cosmeticId);
  const geos = [];
  const G = (g, kind) => {
    if (kind && KINDS[kind] && KINDS[kind].density) worldUV(g, KINDS[kind].density * 6);
    geos.push(g);
    return g;
  };
  const M = {
    plush: mat("fabric", PLUSH),
    plushDark: mat("felt", PLUSH_DARK),
    overalls: mat("fabric", O.overalls),
    scarf: mat("knit", O.scarf),
    scarf2: mat("knit", O.scarf2),
    patch: mat("felt", O.patch),
    pack: mat("felt", O.pack),
    flap: mat("felt", O.packFlap),
    badge: mat("felt", O.badge),
    cheek: mat("felt", "#f29a8e"),
    nose: mat("felt", "#8a5a44"),
    stitch: mat("matte", STITCH),
    eye: mat("glossy", "#1d2230"),
    eyeRim: mat("glossy", "#3a4458"),
    shine: mat("glow", "#ffffff"),
    brass: mat("metal", "#e0b04a"),
    sole: mat("rubber", "#6b4a35"),
    shoe: mat("felt", "#a8573f"),
    ear: mat("felt", "#f5c7b8"),
    tuft: mat("knit", "#c98a4b"),
  };
  const own = new Map();
  const myMat = (m) => {
    if (!own.has(m)) own.set(m, m.clone());
    return own.get(m);
  };
  const mesh = (g, m0, parent, pos, rot, scl, kind) => {
    const m = myMat(m0);
    const o = new THREE.Mesh(G(g, kind), m);
    o.castShadow = shadows;
    o.receiveShadow = false;
    if (pos) o.position.set(...pos);
    if (rot) o.rotation.set(...rot);
    if (scl) o.scale.set(...scl);
    parent.add(o);
    return o;
  };

  const root = new THREE.Group();
  root.name = "toy";
  const body = new THREE.Group();
  root.add(body);

  /* ---------------- legs */
  const hips = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.085, 0.3, 0);
    body.add(hip);
    mesh(cap(0.072, 0.15), M.overalls, hip, [0, 0, 0], null, null, "fabric");
    // turned-up cuff
    mesh(new THREE.CylinderGeometry(0.083, 0.08, 0.05, 16), M.overalls, hip, [0, -0.2, 0]);
    // round felt shoe with a sole
    const shoe = new THREE.Group();
    shoe.position.set(0, -0.255, 0.02);
    hip.add(shoe);
    mesh(ell(0.085, 0.06, 0.12), M.shoe, shoe, [0, 0.0, 0.025], null, null, "felt");
    mesh(ell(0.088, 0.022, 0.125, 18, 8), M.sole, shoe, [0, -0.04, 0.025]);
    // a single lace stitch
    mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 12, Math.PI), M.stitch, shoe, [0, 0.05, 0.06], [-0.5, 0, 0]);
    hips.push(hip);
  }
  // knee patch (left leg)
  mesh(new THREE.CircleGeometry(0.045, 14), M.patch, hips[0], [0, -0.1, 0.071], [-0.08, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    mesh(new THREE.BoxGeometry(0.012, 0.004, 0.004), M.stitch, hips[0], [Math.cos(a) * 0.045, -0.1 + Math.sin(a) * 0.045, 0.073], [0, 0, a + Math.PI / 2]);
  }

  /* ---------------- torso (overalls over a plush body) */
  const torso = new THREE.Group();
  torso.position.set(0, 0.3, 0);
  body.add(torso);
  const torsoGeo = lathe(
    [
      [0.0, -0.05],
      [0.13, -0.05],
      [0.165, 0.0],
      [0.178, 0.08],
      [0.172, 0.17],
      [0.15, 0.25],
      [0.11, 0.3],
      [0.0, 0.31],
    ],
    24,
    1.0,
    0.86,
  );
  mesh(torsoGeo, M.plush, torso, [0, 0, 0], null, null, "fabric");
  // overalls: lower body + bib
  mesh(
    lathe(
      [
        [0.0, -0.06],
        [0.135, -0.06],
        [0.172, 0.0],
        [0.184, 0.08],
        [0.181, 0.13],
        [0.0, 0.13],
      ],
      24,
      1.0,
      0.88,
    ),
    M.overalls,
    torso,
    [0, 0, 0],
    null,
    null,
    "fabric",
  );
  mesh(new THREE.BoxGeometry(0.2, 0.13, 0.04), M.overalls, torso, [0, 0.18, 0.12], [-0.12, 0, 0], null, "fabric");
  // straps over the shoulders
  for (const s of [1, -1]) {
    mesh(new THREE.BoxGeometry(0.04, 0.2, 0.3), M.overalls, torso, [s * 0.085, 0.215, -0.005], [0, 0, 0], null, "fabric");
    mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 14), M.brass, torso, [s * 0.085, 0.23, 0.147], [Math.PI / 2 - 0.12, 0, 0]);
  }
  // bib pocket with stitches
  mesh(new THREE.BoxGeometry(0.11, 0.06, 0.012), M.patch, torso, [0, 0.165, 0.143], [-0.12, 0, 0]);
  for (let i = 0; i < 5; i++) mesh(new THREE.BoxGeometry(0.012, 0.003, 0.003), M.stitch, torso, [-0.044 + i * 0.022, 0.196, 0.147], [-0.12, 0, 0]);
  // belly seam stitches (down the plush front under the bib)
  for (let i = 0; i < 3; i++) mesh(new THREE.BoxGeometry(0.004, 0.016, 0.004), M.stitch, torso, [0, 0.03 + i * 0.03, 0.168], [-0.2, 0, 0]);

  /* ---------------- backpack */
  const pack = new THREE.Group();
  pack.position.set(0, 0.15, -0.15);
  torso.add(pack);
  mesh(new RoundedBox(0.22, 0.2, 0.1, 0.035), M.pack, pack, [0, 0, -0.03], null, null, "felt");
  mesh(new RoundedBox(0.225, 0.085, 0.11, 0.03), M.flap, pack, [0, 0.07, -0.032], [0.08, 0, 0]);
  // sewn star badge on the flap
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.018 : 0.042;
    const a = (i / 10) * TAU + Math.PI / 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  mesh(new THREE.ShapeGeometry(star), M.badge, pack, [0, 0.0, -0.087], [0, Math.PI, 0]);
  for (const s of [1, -1]) mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI), M.flap, pack, [s * 0.075, 0.03, 0.03], [0, Math.PI / 2, Math.PI / 2]);

  /* ---------------- arms */
  const shoulders = [];
  for (const s of [1, -1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.17, 0.235, 0);
    torso.add(sh);
    mesh(cap(0.058, 0.14), M.plush, sh, [0, 0, 0], null, null, "fabric");
    // little mitten
    mesh(ell(0.062, 0.07, 0.058), M.plush, sh, [0, -0.215, 0.006], null, null, "fabric");
    mesh(ell(0.026, 0.034, 0.026, 10, 8), M.plush, sh, [-s * 0.045, -0.195, 0.03], [0, 0, s * 0.5], null, "fabric");
    shoulders.push(sh);
  }

  /* ---------------- scarf */
  const scarf = new THREE.Group();
  scarf.position.set(0, 0.31, 0.0);
  torso.add(scarf);
  const ring = new THREE.TorusGeometry(0.115, 0.04, 10, 28);
  ring.rotateX(Math.PI / 2);
  ring.scale(1, 1.2, 0.92);
  mesh(ring, M.scarf, scarf, [0, 0, 0], [0.12, 0, 0], null, "knit");
  // knot at the front-left
  mesh(ell(0.05, 0.045, 0.045), M.scarf, scarf, [0.06, -0.015, 0.1], null, null, "knit");
  const tails = [];
  for (const s of [1, -1]) {
    const t = new THREE.Group();
    t.position.set(0.06 + s * 0.015, -0.02, 0.11);
    scarf.add(t);
    const seg1 = new THREE.Group();
    t.add(seg1);
    mesh(new THREE.BoxGeometry(0.07, 0.11, 0.022), M.scarf, seg1, [0, -0.055, 0], null, null, "knit");
    const seg2 = new THREE.Group();
    seg2.position.set(0, -0.11, 0);
    seg1.add(seg2);
    mesh(new THREE.BoxGeometry(0.068, 0.09, 0.02), M.scarf, seg2, [0, -0.045, 0], null, null, "knit");
    // contrast stripe + fringe
    mesh(new THREE.BoxGeometry(0.071, 0.018, 0.023), M.scarf2, seg2, [0, -0.06, 0], null, null, "knit");
    for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(0.005, 0.004, 0.035, 5), M.scarf2, seg2, [-0.026 + i * 0.017, -0.105, 0]);
    tails.push({ g: t, seg1, seg2, side: s, a: 0, v: 0, b: 0, bv: 0 });
  }

  /* ---------------- head */
  const neck = new THREE.Group();
  neck.position.set(0, 0.33, 0.0);
  torso.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0.2, 0.0);
  neck.add(head);
  mesh(ell(0.245, 0.225, 0.225, 32, 24), M.plush, head, [0, 0, 0], null, null, "fabric");
  // muzzle / lower face
  mesh(ell(0.12, 0.08, 0.07), M.plush, head, [0, -0.07, 0.165], null, null, "fabric");
  // stitched seam over the crown (front → back)
  for (let i = 0; i <= 10; i++) {
    const a = -0.35 + (i / 10) * 2.3;
    const y = Math.cos(a) * 0.228;
    const z = Math.sin(a) * 0.228;
    mesh(new THREE.BoxGeometry(0.03, 0.006, 0.006), M.stitch, head, [0, y, z], [a, 0, 0]);
  }
  // button eyes: rimmed dark buttons with 4 holes and a highlight
  const eyes = [];
  for (const s of [1, -1]) {
    const e = new THREE.Group();
    e.position.set(s * 0.085, 0.03, 0.205);
    e.rotation.set(-0.05, s * 0.36, 0);
    head.add(e);
    mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20), M.eyeRim, e, [0, 0, 0], [Math.PI / 2, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.024, 20), M.eye, e, [0, 0, 0.001], [Math.PI / 2, 0, 0]);
    for (const [hx, hy] of [
      [-0.011, 0.011],
      [0.011, 0.011],
      [-0.011, -0.011],
      [0.011, -0.011],
    ])
      mesh(new THREE.CylinderGeometry(0.0055, 0.0055, 0.006, 8), M.eyeRim, e, [hx, hy, 0.012], [Math.PI / 2, 0, 0]);
    mesh(ell(0.009, 0.009, 0.004, 8, 6), M.shine, e, [0.014 * s, 0.018, 0.014]);
    eyes.push(e);
  }
  // felt cheeks
  for (const s of [1, -1]) mesh(new THREE.CircleGeometry(0.038, 16), M.cheek, head, [s * 0.145, -0.055, 0.158], [0, s * 0.72, 0]);
  // little round nose + stitched smile
  mesh(ell(0.03, 0.024, 0.022), M.nose, head, [0, -0.035, 0.232]);
  const smile = new THREE.Group();
  smile.position.set(0, -0.085, 0.228);
  head.add(smile);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 0.2 + (i / 6) * Math.PI * 0.6;
    mesh(new THREE.BoxGeometry(0.016, 0.005, 0.006), M.stitch, smile, [Math.cos(a) * 0.06, -Math.sin(a) * 0.03 + 0.02, -Math.abs(Math.cos(a)) * 0.02], [0, 0, -Math.cos(a) * 0.7]);
  }
  // floppy ears (hinged so they can flop)
  const ears = [];
  for (const s of [1, -1]) {
    const ear = new THREE.Group();
    ear.position.set(s * 0.17, 0.14, -0.02);
    ear.rotation.set(0, 0, s * -0.7);
    head.add(ear);
    mesh(ell(0.07, 0.11, 0.035), M.plush, ear, [0, 0.07, 0], null, null, "fabric");
    mesh(ell(0.045, 0.075, 0.01), M.ear, ear, [0, 0.07, 0.03]);
    ears.push(ear);
  }
  // yarn tuft on top
  const tuft = new THREE.Group();
  tuft.position.set(0, 0.215, 0.02);
  head.add(tuft);
  for (let i = 0; i < 3; i++) {
    const lp = new THREE.TorusGeometry(0.035, 0.012, 6, 14, Math.PI * 1.5);
    mesh(lp, M.tuft, tuft, [-0.03 + i * 0.03, 0.02, -0.01 * i], [0.2 * i, Math.PI / 2 + (i - 1) * 0.5, 0.5]);
  }

  /* ---------------- outfit accessories */
  if (O.hat === "apron") {
    mesh(new THREE.BoxGeometry(0.24, 0.24, 0.012), mat("fabric", "#ffffff"), torso, [0, 0.07, 0.19], [-0.1, 0, 0], null, "fabric");
    mesh(new THREE.BoxGeometry(0.1, 0.05, 0.014), mat("felt", "#ff7a7a"), torso, [0, 0.02, 0.2], [-0.1, 0, 0]);
  } else if (O.hat === "cap") {
    const capG = new THREE.SphereGeometry(0.2, 22, 12, 0, TAU, 0, Math.PI / 2);
    mesh(capG, mat("felt", "#ffd23a"), head, [0, 0.07, 0.0], [-0.12, 0, 0], [1.15, 0.9, 1.12]);
    mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.015, 20, 1, false, -Math.PI / 2, Math.PI), mat("felt", "#e0b020"), head, [0, 0.085, 0.13], [0.15, 0, 0]);
  } else if (O.hat === "leaf") {
    const lf = new THREE.Shape();
    lf.moveTo(0, 0);
    lf.quadraticCurveTo(0.08, 0.06, 0, 0.16);
    lf.quadraticCurveTo(-0.08, 0.06, 0, 0);
    mesh(new THREE.ShapeGeometry(lf), mat("felt", "#5cae4e", { side: THREE.DoubleSide }), tuft, [0.02, 0.03, 0], [0, 0.4, -0.35]);
  } else if (O.hat === "star") {
    const sg = new THREE.ExtrudeGeometry(star, { depth: 0.01, bevelEnabled: false });
    sg.scale(1.3, 1.3, 1);
    mesh(sg, mat("glow", "#ffe27a"), head, [0.12, 0.17, 0.08], [0, 0.5, -0.3]);
  } else if (O.hat === "crown") {
    const cr = new THREE.CylinderGeometry(0.09, 0.1, 0.07, 10, 1, true);
    mesh(cr, mat("metal", "#e7b53c", { side: THREE.DoubleSide }), head, [0, 0.235, 0], [-0.1, 0, 0]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      mesh(new THREE.ConeGeometry(0.018, 0.05, 6), mat("metal", "#e7b53c"), head, [Math.sin(a) * 0.09, 0.29, Math.cos(a) * 0.09 - 0.01]);
    }
  }

  // blob shadow (always; the readable drop-shadow under the toy for platforming)
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.renderOrder = 2;
  geos.push(blob.geometry);

  // fewer draw calls: merge the rigid leaf meshes of every joint, per material
  mergeRigid(root, geos, shadows);

  const R = {
    root,
    body,
    torso,
    hips,
    shoulders,
    neck,
    head,
    eyes,
    ears,
    tuft,
    scarf,
    tails,
    blob,
    pose: newPose(),
    cur: newPose(),
    t: 0,
    blinkT: 2,
    blink: 0,
    squash: 0,
    squashV: 0,
    collectT: 0,
    landT: 0,
    landHard: false,
    jumpT: 0,
    spawnT: 1,
    hurtT: 0,
    idleBeat: 0,
    dustT: 0,
    celebrateT: 0,
    lastYaw: 0,
    turnRate: 0,
    petLook: null,
    prevVX: 0,
    prevVZ: 0,
    accX: 0,
    accZ: 0,
    fade: 1,
    setFade(a) {
      if (Math.abs(a - this.fade) < 0.01) return;
      this.fade = a;
      // hashed alpha: dithered see-through that keeps correct depth (no inside-out look)
      for (const m of own.values()) {
        const t = a < 0.99;
        if (m.alphaHash !== t) {
          m.alphaHash = t;
          m.needsUpdate = true;
        }
        m.opacity = t ? a : 1;
      }
    },
    dispose() {
      for (const g of geos) g.dispose();
      for (const m of own.values()) m.dispose();
      blob.material.dispose();
    },
  };
  return R;
}

/** merge each node's leaf-mesh children by material (keeps joints animatable) */
function mergeRigid(node, geos, shadows) {
  for (const c of node.children.slice()) if (c.children.length) mergeRigid(c, geos, shadows);
  const leaves = node.children.filter((c) => c.isMesh && c.children.length === 0);
  const byMat = new Map();
  for (const m of leaves) {
    if (!byMat.has(m.material)) byMat.set(m.material, []);
    byMat.get(m.material).push(m);
  }
  for (const [material, list] of byMat) {
    if (list.length < 2) continue;
    const parts = list.map((m) => {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(m.matrix);
      return g;
    });
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    if (!merged) continue;
    for (const m of list) node.remove(m);
    const mm = new THREE.Mesh(merged, material);
    mm.castShadow = shadows;
    node.add(mm);
    geos.push(merged);
  }
}

/* RoundedBoxGeometry without the import cost for one tiny use: a box with
   bevelled edges built from an ExtrudeGeometry of a rounded rectangle. */
class RoundedBox extends THREE.ExtrudeGeometry {
  constructor(w, h, d, r) {
    const s = new THREE.Shape();
    const x = -w / 2;
    const y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    super(s, { depth: d - r, bevelEnabled: true, bevelThickness: r / 2, bevelSize: r / 2, bevelSegments: 3, curveSegments: 6 });
    this.translate(0, 0, -(d - r) / 2);
  }
}

/* ------------------------------------------------------------------ poses */
function newPose() {
  return {
    bodyY: 0,
    pitch: 0, // + leans forward
    roll: 0,
    yawOff: 0,
    hipL: 0, // + swings the leg forward
    hipR: 0,
    hipLz: 0, // + splays outward
    hipRz: 0,
    shL: 0, // + raises the arm forward/up
    shR: 0,
    shLz: 0, // + raises the arm out sideways
    shRz: 0,
    headP: 0, // + looks down
    headY: 0,
    headR: 0,
    earFlop: 0,
    sit: 0,
  };
}
const KEYS = Object.keys(newPose());

/** pose for the CURRENT engine state; ctx: { menu, t } */
function targetPose(R, P, W, out, ctx) {
  for (const k of KEYS) out[k] = 0;
  const t = R.t;
  const sp = Math.hypot(P.vx, P.vz);
  const phase = P.stride * TAU;
  if (ctx.menu) return menuPose(R, out, t);

  switch (P.state) {
    case S.GROUND:
    case S.PUSH:
    case S.FINISHED: {
      if (P.state === S.FINISHED) return celebratePose(R, out, t, R.celebrateT);
      if (P.state === S.PUSH) {
        // leaning into the block, both hands on it, small heavy steps
        const k = Math.min(1, P.stateT / 0.2);
        const st = Math.sin(phase);
        out.pitch = 0.42 * k;
        out.bodyY = -0.03 * k;
        out.hipL = st * 0.45 - 0.25 * k;
        out.hipR = -st * 0.45 - 0.25 * k;
        out.shL = out.shR = 1.35 * k;
        out.shLz = out.shRz = 0.12;
        out.headP = -0.25 * k;
        out.headY = Math.sin(t * 2) * 0.05;
        return out;
      }
      locoPose(R, P, out, sp, phase, t);
      if (P.balance) {
        // arms out, wobble — gameplay stays fully in control
        out.shLz = out.shRz = 1.25;
        out.shL = out.shR = 0.1;
        out.roll = Math.sin(t * 2.3) * 0.13 + Math.sin(t * 5.1) * 0.04;
        out.shLz += Math.sin(t * 2.3) * 0.3;
        out.shRz -= Math.sin(t * 2.3) * 0.3;
        out.headR = -out.roll * 0.6;
      }
      if (P.riding && sp < 0.4) {
        // surfing the toy car: knees bent, arms out, swaying with its acceleration
        out.bodyY = -0.035;
        out.hipL = 0.35;
        out.hipR = -0.25;
        out.hipLz = out.hipRz = 0.12;
        out.shLz = out.shRz = 0.85;
        out.pitch = clamp(R.accLocalZ * 0.06, -0.25, 0.25);
        out.roll = clamp(-R.accLocalX * 0.06, -0.25, 0.25);
        out.headP = -0.1;
      }
      // landing squash + recovery
      if (R.landT > 0) {
        const k = R.landT / (R.landHard ? 0.4 : 0.18);
        out.bodyY -= (R.landHard ? 0.09 : 0.04) * k;
        out.pitch += (R.landHard ? 0.4 : 0.15) * k;
        out.shL += (R.landHard ? 0.9 : 0.3) * k;
        out.shR += (R.landHard ? 0.9 : 0.3) * k;
        out.shLz += 0.5 * k;
        out.shRz += 0.5 * k;
      }
      if (P.inShallow && sp > 0.3) out.shLz = out.shRz = 0.6; // wading
      if (sp < 0.15 && !P.riding && !P.balance) idleLayer(R, P, W, out, t);
      return out;
    }
    case S.AIR: {
      const vy = P.vy;
      if (P.leftBy === "bounce" && vy > 1) {
        // star-jump off soft things
        out.shLz = out.shRz = 2.2;
        out.hipLz = out.hipRz = 0.45;
        out.headP = -0.3;
        out.pitch = -0.1;
        out.earFlop = 1;
        return out;
      }
      if (vy > 0.5) {
        // ascend: one knee up, arms reaching
        out.hipL = 1.0;
        out.hipR = -0.35;
        out.shL = 2.2;
        out.shR = 1.1;
        out.shLz = 0.3;
        out.shRz = 0.6;
        out.headP = -0.2;
        out.pitch = 0.05;
        out.earFlop = -0.6;
        return out;
      }
      // fall: arms up and out, legs dangle and paddle
      const k = clamp(-vy / 8, 0, 1);
      out.shL = 2.4 + Math.sin(t * 14) * 0.15 * k;
      out.shR = 2.4 - Math.sin(t * 14) * 0.15 * k;
      out.shLz = out.shRz = 0.6 + 0.4 * k;
      out.hipL = 0.35 + Math.sin(t * 12) * 0.25 * k;
      out.hipR = 0.1 - Math.sin(t * 12) * 0.25 * k;
      out.headP = 0.15 * k;
      out.pitch = -0.05;
      out.earFlop = 0.8 * k + 0.3;
      return out;
    }
    case S.LEDGE: {
      const L = P.ledge;
      if (!L) return out;
      if (L.phase === "hang") {
        // CLIMB_LEDGE: hands on the lip, legs scrabbling
        out.shL = out.shR = 2.9;
        out.shLz = out.shRz = 0.25;
        out.hipL = Math.sin(t * 16) * 0.4 + 0.1;
        out.hipR = -Math.sin(t * 16) * 0.4 + 0.1;
        out.headP = -0.35;
        out.pitch = -0.08;
        return out;
      }
      // PULL_UP: arms push down as the body rises, knee comes up onto the top
      const u = clamp(L.t / (L.mantle ? 0.22 : 0.42), 0, 1);
      out.shL = out.shR = lerp(2.9, 0.4, u);
      out.shLz = out.shRz = lerp(0.25, 0.5, u);
      out.hipL = Math.sin(u * Math.PI) * 1.5;
      out.hipR = Math.sin(u * Math.PI) * 0.6;
      out.pitch = Math.sin(u * Math.PI) * 0.55;
      out.headP = lerp(-0.35, 0.1, u);
      return out;
    }
    case S.CLIMB: {
      // hand-over-hand up the cloth
      const ph = phase * 1.0;
      out.shL = 2.6 + Math.sin(ph) * 0.5;
      out.shR = 2.6 - Math.sin(ph) * 0.5;
      out.shLz = out.shRz = 0.2;
      out.hipL = 0.6 + Math.sin(ph) * 0.4;
      out.hipR = 0.6 - Math.sin(ph) * 0.4;
      out.pitch = -0.05;
      out.headP = -0.3;
      return out;
    }
    case S.STUMBLE:
    case S.HURT: {
      // HURT_STUMBLE: knocked back, arms windmilling, wince
      out.pitch = -0.45;
      out.roll = Math.sin(t * 9) * 0.15;
      out.shL = 2.2 + Math.sin(t * 18) * 0.5;
      out.shR = 2.2 - Math.sin(t * 18) * 0.5;
      out.shLz = out.shRz = 1.0;
      out.hipL = 0.6;
      out.hipR = -0.3;
      out.headP = -0.3;
      out.earFlop = 1;
      return out;
    }
    case S.FALLING_OUT: {
      out.shL = out.shR = 2.6;
      out.shLz = out.shRz = 1.2;
      out.hipL = 0.5;
      out.hipR = -0.4;
      out.earFlop = 1;
      return out;
    }
    case S.RESPAWN:
    default:
      return idleLayer(R, P, W, out, t);
  }
}

function locoPose(R, P, out, sp, phase, t) {
  // stance share shrinks at speed (a little flight phase when sprinting)
  const k = clamp(sp / 4.75, 0, 1);
  const stepLen = (0.5 + Math.min(sp, 5) * 0.11) / 2;
  const stance = lerp(1, 0.62, k);
  const amp = sp > 0.08 ? Math.asin(clamp((stepLen * stance) / (2 * 0.3), 0, 0.92)) : 0;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  out.hipL = s * amp;
  out.hipR = -s * amp;
  // feet lift on the forward swing
  out.hipLz = 0.03;
  out.hipRz = 0.03;
  out.bodyY = sp > 0.08 ? -Math.abs(c) * (0.012 + 0.025 * k) + 0.012 : 0;
  out.pitch = sp > 0.08 ? 0.06 + k * 0.26 : 0;
  // arms counter-swing (bigger and pumpier when sprinting)
  out.shL = -s * amp * (0.9 + k * 0.6) + k * 0.35;
  out.shR = s * amp * (0.9 + k * 0.6) + k * 0.35;
  out.shLz = out.shRz = 0.12 + k * 0.08;
  out.roll = s * 0.04 * (0.4 + k);
  out.headP = -out.pitch * 0.55;
  out.headY = -s * 0.05;
  out.earFlop = Math.abs(c) * 0.5 * k;
  return out;
}

/**
 * Idle personality (only when the toy is standing still): breathing, blinks,
 * and a rotating beat — look around, look up at the giant room, adjust the
 * scarf, dust off after a hard landing, react to a nearby pet, and finally
 * sit down for a rest after a long wait.
 */
function idleLayer(R, P, W, out, t) {
  const idle = P.idleT || 0;
  out.bodyY += Math.sin(t * 2.2) * 0.006;
  out.shLz = out.shRz = 0.1 + Math.sin(t * 2.2) * 0.02;
  out.shL = out.shR = 0.05;
  if (R.dustT > 0) {
    // DUST OFF: pat the overalls a couple of times
    const p = Math.sin(R.dustT * 22);
    out.shL = 0.9 + p * 0.25;
    out.shR = 0.9 - p * 0.25;
    out.shLz = out.shRz = -0.25;
    out.headP = 0.35;
    out.pitch = 0.12;
    return out;
  }
  if (R.petLook) {
    // PET_REACTION: turn the head toward the big animal, lean back a touch
    out.headY = clamp(wrap(R.petLook.yaw - P.yaw), -1.1, 1.1);
    out.headP = -0.35;
    out.pitch = -0.08;
    out.shL = 0.5;
    out.shLz = 0.5;
    return out;
  }
  if (idle > 14) {
    // sit down for a rest
    const k = clamp((idle - 14) / 0.6, 0, 1);
    out.sit = k;
    out.bodyY = -0.2 * k;
    out.hipL = out.hipR = 1.45 * k;
    out.hipLz = out.hipRz = 0.18 * k;
    out.shL = out.shR = 0.3 * k;
    out.shLz = out.shRz = 0.35 * k;
    out.pitch = -0.12 * k;
    out.headY = Math.sin(t * 0.4) * 0.35 * k;
    out.headP = (-0.15 + Math.sin(t * 0.3) * 0.1) * k;
    // swinging feet
    out.hipL += Math.sin(t * 2.2) * 0.12 * k;
    out.hipR -= Math.sin(t * 2.2) * 0.12 * k;
    return out;
  }
  if (idle > 2.2) {
    const beat = Math.floor((idle - 2.2) / 3.2) % 3;
    const u = ((idle - 2.2) % 3.2) / 3.2;
    const env = Math.sin(clamp(u, 0, 1) * Math.PI);
    if (beat === 0) {
      // LOOK_UP at the towering furniture
      out.headP = -0.75 * env;
      out.pitch = -0.1 * env;
      out.shL = 0.25 * env;
      out.headY = Math.sin(u * TAU) * 0.2 * env;
    } else if (beat === 1) {
      // look around
      out.headY = Math.sin(u * TAU) * 0.9 * env;
      out.headP = -0.1 * env;
    } else {
      // adjust the scarf
      out.shR = 2.0 * env;
      out.shRz = -0.6 * env;
      out.headP = 0.25 * env;
      out.headR = 0.15 * env;
      out.shR += Math.sin(t * 14) * 0.08 * env;
    }
  }
  return out;
}

function menuPose(R, out, t) {
  // sitting on the edge of a book, feet swinging, looking up and around the room
  out.sit = 1;
  out.bodyY = -0.2;
  out.hipL = 1.45 + Math.sin(t * 2.1) * 0.22;
  out.hipR = 1.45 - Math.sin(t * 2.1 + 0.4) * 0.22;
  out.hipLz = out.hipRz = 0.16;
  out.shL = 0.35;
  out.shR = 0.35;
  out.shLz = out.shRz = 0.45;
  out.pitch = -0.1;
  const look = Math.sin(t * 0.23);
  out.headY = look * 0.5;
  out.headP = -0.35 - Math.max(0, Math.sin(t * 0.17)) * 0.35;
  out.headR = Math.sin(t * 0.31) * 0.12;
  return out;
}

function celebratePose(R, out, t, ct) {
  // CELEBRATE: hop + wave both arms
  const hop = Math.abs(Math.sin(ct * 6));
  out.bodyY = hop * 0.12;
  out.shL = 2.7 + Math.sin(ct * 12) * 0.3;
  out.shR = 2.7 - Math.sin(ct * 12) * 0.3;
  out.shLz = out.shRz = 0.7;
  out.hipL = hop * 0.4;
  out.hipR = hop * 0.4;
  out.headP = -0.3;
  out.earFlop = hop;
  return out;
}

/* ------------------------------------------------------------------ apply */
function applyPose(R, p) {
  R.body.position.y = p.bodyY;
  R.body.rotation.set(p.pitch, p.yawOff, p.roll, "YXZ");
  R.hips[0].rotation.set(-p.hipL, 0, p.hipLz);
  R.hips[1].rotation.set(-p.hipR, 0, -p.hipRz);
  R.shoulders[0].rotation.set(-p.shL, 0, p.shLz, "ZXY");
  R.shoulders[1].rotation.set(-p.shR, 0, -p.shRz, "ZXY");
  R.head.rotation.set(p.headP, p.headY, p.headR, "YXZ");
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? 1 : -1;
    R.ears[i].rotation.set(-p.earFlop * 0.3, 0, s * (-0.7 - p.earFlop * 0.5));
  }
}

/** event hooks from the renderer (jump, land, collect …) */
export function toyEvent(R, e) {
  switch (e.type) {
    case "jump":
      R.squashV = 3.2; // JUMP_START stretch
      R.jumpT = 0.12;
      break;
    case "bounce":
      R.squash = -0.28;
      R.squashV = 6;
      break;
    case "land":
      R.landHard = !!e.hard;
      R.landT = e.hard ? 0.4 : 0.18;
      R.squash = -clamp((e.impact || 0) / 40, 0.05, e.hard ? 0.3 : 0.16);
      R.squashV = 0;
      if (e.hard) R.dustT = 1.0; // dust yourself off afterwards
      break;
    case "button":
      R.collectT = 0.6;
      break;
    case "respawn":
    case "restart":
      R.spawnT = 0;
      R.dustT = 0;
      R.landT = 0;
      break;
    case "finish":
      R.celebrateT = 0;
      break;
    default:
  }
}

/** Update the model from the engine player. ctx: { menu, snap, W } */
export function updateToy(R, P, dt, ctx = {}) {
  const W = ctx.W;
  R.t += dt;
  if (R.landT > 0) R.landT = Math.max(0, R.landT - dt);
  if (R.collectT > 0) R.collectT = Math.max(0, R.collectT - dt);
  if (R.dustT > 0 && !(P.state === S.GROUND && Math.hypot(P.vx, P.vz) < 0.15)) R.dustT = 0;
  if (R.dustT > 0 && R.landT <= 0) R.dustT = Math.max(0, R.dustT - dt);
  if (P.state === S.FINISHED) R.celebrateT += dt;
  R.spawnT = Math.min(1, R.spawnT + dt / 0.45);

  // acceleration (for riding sway) in the toy's local frame
  if (dt > 0) {
    const ax = (P.vx - R.prevVX) / dt;
    const az = (P.vz - R.prevVZ) / dt;
    R.accX = damp(R.accX, ax, 6, dt);
    R.accZ = damp(R.accZ, az, 6, dt);
    R.prevVX = P.vx;
    R.prevVZ = P.vz;
  }
  const sy = Math.sin(P.yaw);
  const cy = Math.cos(P.yaw);
  R.accLocalZ = R.accX * sy + R.accZ * cy;
  R.accLocalX = R.accX * cy - R.accZ * sy;

  // root
  R.root.position.set(P.x, P.y, P.z);
  R.root.rotation.y = P.yaw;
  if (P.state === S.FALLING_OUT) R.root.rotation.y += R.t * 6;

  // pet reaction target (nearest pet within range)
  R.petLook = null;
  if (W && W.pets) {
    for (const pet of W.pets) if (pet.dist < 7) R.petLook = { yaw: pet.lookYaw + Math.PI };
  }

  targetPose(R, P, W, R.pose, ctx);
  if (R.collectT > 0) {
    // COLLECT: a quick happy arm pump
    const k = Math.sin((R.collectT / 0.6) * Math.PI);
    R.pose.shR = Math.max(R.pose.shR, 2.8 * k);
    R.pose.shRz = Math.max(R.pose.shRz, 0.3 * k);
    R.pose.headP -= 0.25 * k;
  }

  // blend: snappy for locomotion, softer for big pose changes
  const loco = P.state === S.GROUND && Math.hypot(P.vx, P.vz) > 0.2 && !ctx.menu;
  const rate = ctx.snap ? 1000 : loco ? 26 : P.state === S.AIR ? 14 : 12;
  for (const k of KEYS) R.cur[k] = damp(R.cur[k], R.pose[k], rate, dt);
  applyPose(R, R.cur);

  // squash & stretch spring
  R.squashV += (-R.squash * 180 - R.squashV * 16) * dt;
  R.squash += R.squashV * dt;
  if (P.state === S.AIR && P.vy > 2) R.squash = Math.max(R.squash, Math.min(0.1, P.vy * 0.012));
  const sq = clamp(R.squash, -0.32, 0.2);
  const sxz = 1 / Math.sqrt(1 + sq);
  // RESPAWN: pop in with a little overshoot
  const u = R.spawnT;
  const pop = u < 1 ? (u < 0.6 ? lerp(0.25, 1.12, u / 0.6) : lerp(1.12, 1, (u - 0.6) / 0.4)) : 1;
  R.body.scale.set(sxz * pop, (1 + sq) * pop, sxz * pop);

  // blink
  R.blinkT -= dt;
  if (R.blinkT <= 0) {
    R.blink = 0.14;
    R.blinkT = 2.2 + Math.random() * 3.2;
  }
  if (R.blink > 0) R.blink -= dt;
  const wince = P.state === S.HURT || P.state === S.STUMBLE || (R.landT > 0 && R.landHard);
  const happy = P.state === S.FINISHED || R.collectT > 0;
  const eyeY = R.blink > 0 || wince ? 0.15 : happy ? 0.55 : 1;
  for (const e of R.eyes) e.scale.y = damp(e.scale.y, eyeY, 30, dt);

  // scarf tails: damped springs driven by body acceleration + gravity
  const fwdAcc = R.accLocalZ;
  const sp = Math.hypot(P.vx, P.vz);
  for (const tl of R.tails) {
    const target = clamp(0.25 + sp * 0.16 - fwdAcc * 0.02 + (P.state === S.AIR ? -P.vy * 0.05 : 0), -0.6, 1.5);
    tl.v += ((target - tl.a) * 60 - tl.v * 7) * dt;
    tl.a += tl.v * dt;
    const btarget = Math.sin(R.t * (3 + sp) + tl.side) * 0.12 * (0.3 + Math.min(1, sp / 3));
    tl.bv += ((btarget + tl.a * 0.5 - tl.b) * 50 - tl.bv * 6) * dt;
    tl.b += tl.bv * dt;
    // tails fall back over the shoulder behind the toy
    tl.g.rotation.set(-0.15 - tl.a, tl.side * 0.25, tl.side * 0.12);
    tl.seg2.rotation.x = -tl.b;
  }

  // drop shadow under the toy (on whatever is below)
  const gy = ctx.groundY;
  if (gy != null && P.state !== S.FALLING_OUT) {
    const h = Math.max(0, P.y - gy);
    const s = clamp(0.62 - h * 0.05, 0.25, 0.62);
    R.blob.visible = true;
    R.blob.position.set(P.x, gy + 0.012, P.z);
    R.blob.scale.set(s, s, s);
    R.blob.material.opacity = clamp(0.42 - h * 0.035, 0.12, 0.42);
  } else R.blob.visible = false;
}
