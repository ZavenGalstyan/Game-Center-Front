/**
 * Tower Defense Mini — procedural low-poly models.
 *
 * Every geometry and material is created ONCE and cached (`G()` / `M()`);
 * towers and enemies are cheap Groups of meshes that share them. Nothing here
 * runs per frame. Builders return the Group plus named parts the scene
 * animates (archer / turret head, cannon barrel, floating orb, legs…).
 *
 * Orientation: a model faces +Z; rotation.y = atan2(dx, dz) aims it.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* ------------------------------------------------------------ caches */
const geos = new Map();
const mats = new Map();

export function G(key, make) {
  let g = geos.get(key);
  if (!g) {
    g = make();
    geos.set(key, g);
  }
  return g;
}

export function M(color, opt = {}) {
  const key = `${color}|${JSON.stringify(opt)}`;
  let m = mats.get(key);
  if (!m) {
    const { basic, ...rest } = opt;
    m = basic
      ? new THREE.MeshBasicMaterial({ color, ...rest })
      : new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, flatShading: true, ...rest });
    mats.set(key, m);
  }
  return m;
}

/** Merge geometries of mixed index/attribute layouts. */
export function merge(list) {
  const prepared = list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (k !== "position" && k !== "normal") n.deleteAttribute(k);
    return n;
  });
  const out = mergeGeometries(prepared, false);
  out.computeVertexNormals();
  prepared.forEach((g) => g.dispose());
  return out;
}

const T = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  return g;
};

function mesh(geo, mat, x = 0, y = 0, z = 0, opts = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (opts.rx) m.rotation.x = opts.rx;
  if (opts.ry) m.rotation.y = opts.ry;
  if (opts.rz) m.rotation.z = opts.rz;
  if (opts.s) m.scale.setScalar(opts.s);
  if (opts.sv) m.scale.set(...opts.sv);
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = !!opts.receive;
  return m;
}

/* ------------------------------------------------------------ palette */
export const C = {
  stone: "#b3ada3",
  stoneLight: "#cfc9bd",
  stoneDark: "#8d877d",
  wood: "#9a6638",
  woodDark: "#6e4524",
  roofGreen: "#3f9a46",
  roofRed: "#c8473a",
  gold: "#f2c14e",
  iron: "#4a4f58",
  ironDark: "#2f333a",
  frostStone: "#9fb4c6",
  crystal: "#7fe6ff",
  mageStone: "#8f88a8",
  magePurple: "#7c4ad6",
  orb: "#c79bff",
  skin: "#e8b88f",
  dark: "#2a2622",
};

const goldM = () => M(C.gold, { metalness: 0.55, roughness: 0.38 });
const ironM = () => M(C.iron, { metalness: 0.45, roughness: 0.5 });
const crystalM = () => M(C.crystal, { emissive: "#38b8e8", emissiveIntensity: 0.75, roughness: 0.2, transparent: true, opacity: 0.92 });
const orbM = () => M(C.orb, { emissive: "#8a4dff", emissiveIntensity: 1.4, roughness: 0.25 });

/* ------------------------------------------------------------ pads */
export function buildPad() {
  const g = new THREE.Group();
  const base = mesh(G("pad-base", () => new THREE.CylinderGeometry(0.8, 0.88, 0.2, 14)), M(C.stone), 0, 0.08, 0, { receive: true });
  const top = mesh(G("pad-top", () => new THREE.CylinderGeometry(0.7, 0.7, 0.04, 14)), M("#a68a62"), 0, 0.19, 0, { receive: true, shadow: false });
  // little stones around the rim
  const rim = mesh(
    G("pad-rim", () => {
      const parts = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        parts.push(T(new THREE.DodecahedronGeometry(0.09, 0), Math.cos(a) * 0.8, 0.19, Math.sin(a) * 0.8, a, a * 2, 0, 1, 0.6, 1));
      }
      return merge(parts);
    }),
    M(C.stoneDark),
    0,
    0,
    0,
    { shadow: false }
  );
  g.add(base, top, rim);
  return g;
}

/* ------------------------------------------------------------ towers */
const box = (w, h, d) => G(`box${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, s = 10) => G(`cyl${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
const cone = (r, h, s = 8) => G(`cone${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s));
const sph = (r, w = 10, hh = 8) => G(`sph${r},${w},${hh}`, () => new THREE.SphereGeometry(r, w, hh));
const oct = (r) => G(`oct${r}`, () => new THREE.OctahedronGeometry(r, 0));
const torus = (r, t, rs = 6, ts = 20, arc = Math.PI * 2) => G(`tor${r},${t},${rs},${ts},${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
const capsule = (r, l) => G(`cap${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 3, 8));

function flag(color, w = 0.42, h = 0.26) {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.02, 0.02, 0.7, 5), M(C.woodDark), 0, 0.35, 0));
  const cloth = mesh(G(`flag${w},${h}`, () => T(new THREE.PlaneGeometry(w, h, 4, 1), w / 2, 0, 0)), M(color, { side: THREE.DoubleSide }), 0.02, 0.56, 0, { shadow: false });
  g.add(cloth);
  g.userData.cloth = cloth;
  return g;
}

function archerFigure(lv) {
  const head = new THREE.Group();
  head.add(mesh(cyl(0.1, 0.14, 0.34, 8), M("#3e8a3a"), 0, 0.17, 0));
  head.add(mesh(sph(0.1, 8, 6), M(C.skin), 0, 0.42, 0));
  head.add(mesh(cone(0.12, 0.2, 8), M("#2f6e2c"), 0, 0.55, -0.02));
  const bow = mesh(torus(0.2, 0.018, 4, 10, Math.PI), lv === 3 ? goldM() : M(C.woodDark), 0, 0.3, 0.18, { rz: Math.PI / 2, ry: 0 });
  bow.rotation.set(0, Math.PI / 2, Math.PI / 2);
  head.add(bow);
  head.add(mesh(cyl(0.006, 0.006, 0.4, 3), M("#eee"), 0, 0.3, 0.16, { shadow: false }));
  return head;
}

function buildArcher(lv) {
  const g = new THREE.Group();
  const lift = (lv - 1) * 0.28;
  const parts = {};
  if (lv >= 2) {
    const h = lv === 2 ? 0.45 : 0.75;
    g.add(mesh(cyl(0.6, 0.68, h, 10), M(C.stone), 0, h / 2, 0, { receive: true }));
    if (lv === 3) g.add(mesh(torus(0.62, 0.04, 4, 16), goldM(), 0, h, 0, { rx: Math.PI / 2, shadow: false }));
  }
  const legH = 1.35 + lift - (lv >= 2 ? (lv === 2 ? 0.45 : 0.75) : 0);
  const legY = (lv >= 2 ? (lv === 2 ? 0.45 : 0.75) : 0) + legH / 2;
  for (const [x, z] of [[0.38, 0.38], [-0.38, 0.38], [0.38, -0.38], [-0.38, -0.38]]) g.add(mesh(box(0.11, legH, 0.11), M(C.wood), x, legY, z));
  // cross braces
  for (const s of [-1, 1]) {
    g.add(mesh(box(0.86, 0.06, 0.06), M(C.woodDark), 0, legY, 0.38 * s));
    g.add(mesh(box(0.06, 0.06, 0.86), M(C.woodDark), 0.38 * s, legY, 0));
  }
  const py = 1.35 + lift;
  g.add(mesh(box(1.08, 0.12, 1.08), M(C.woodDark), 0, py, 0, { receive: true }));
  // railing
  for (const [x, z] of [[0.48, 0.48], [-0.48, 0.48], [0.48, -0.48], [-0.48, -0.48]]) g.add(mesh(box(0.07, 0.62, 0.07), M(C.wood), x, py + 0.3, z));
  for (const s of [-1, 1]) {
    g.add(mesh(box(1.0, 0.05, 0.05), lv === 3 ? goldM() : M(C.wood), 0, py + 0.24, 0.48 * s, { shadow: false }));
    g.add(mesh(box(0.05, 0.05, 1.0), lv === 3 ? goldM() : M(C.wood), 0.48 * s, py + 0.24, 0, { shadow: false }));
  }
  const roofR = 0.78 + (lv - 1) * 0.08;
  const roof = mesh(cone(roofR, 0.55 + lv * 0.05, 4), M(lv === 3 ? "#2f8f4f" : C.roofGreen), 0, py + 0.88, 0, { ry: Math.PI / 4 });
  g.add(roof);
  if (lv >= 2) g.add(mesh(cone(roofR * 0.98, 0.08, 4), M(C.woodDark), 0, py + 0.6, 0, { ry: Math.PI / 4, shadow: false }));
  if (lv === 3) {
    g.add(mesh(sph(0.08, 8, 6), goldM(), 0, py + 1.25, 0));
    const f = flag("#ffd34a");
    f.position.set(0, py + 1.2, 0);
    g.add(f);
    parts.flag = f.userData.cloth;
  }
  if (lv === 2) {
    const banner = mesh(box(0.34, 0.5, 0.02), M("#3e8a3a"), 0, py - 0.32, 0.55, { shadow: false });
    g.add(banner);
    g.add(mesh(sph(0.06, 6, 4), goldM(), 0, py - 0.3, 0.57, { shadow: false }));
  }
  const head = archerFigure(lv);
  head.position.set(0, py + 0.06, 0);
  g.add(head);
  parts.head = head;
  return { group: g, parts };
}

function buildCannon(lv) {
  const g = new THREE.Group();
  const parts = {};
  const h = [0.72, 0.95, 1.2][lv - 1];
  const r = [0.6, 0.66, 0.72][lv - 1];
  g.add(mesh(cyl(r, r + 0.1, h, 12), M(lv === 3 ? C.stoneLight : C.stone), 0, h / 2, 0, { receive: true }));
  const n = 8 + (lv - 1) * 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.add(mesh(box(0.18, 0.18, 0.16), M(C.stoneDark), Math.sin(a) * (r - 0.04), h + 0.08, Math.cos(a) * (r - 0.04), { ry: a }));
  }
  if (lv >= 2) g.add(mesh(torus(r + 0.03, 0.035, 4, 18), lv === 3 ? goldM() : ironM(), 0, h * 0.45, 0, { rx: Math.PI / 2, shadow: false }));
  if (lv === 3) g.add(mesh(torus(r + 0.06, 0.035, 4, 18), goldM(), 0, h * 0.15, 0, { rx: Math.PI / 2, shadow: false }));
  const head = new THREE.Group();
  head.position.set(0, h + 0.02, 0);
  head.add(mesh(cyl(0.44, 0.46, 0.1, 12), M(C.woodDark), 0, 0.04, 0));
  for (const s of [-1, 1]) head.add(mesh(box(0.08, 0.26, 0.5), M(C.wood), 0.2 * s, 0.2, 0));
  const pitch = new THREE.Group();
  pitch.position.set(0, 0.24, 0);
  pitch.rotation.x = -0.22;
  head.add(pitch);
  const barrels = lv === 3 ? [-0.15, 0.15] : [0];
  const br = [0.13, 0.155, 0.14][lv - 1];
  const bl = [0.9, 1.02, 1.0][lv - 1];
  parts.barrels = [];
  for (const bx of barrels) {
    const b = new THREE.Group();
    b.position.x = bx;
    b.add(mesh(cyl(br, br * 1.25, bl, 10), ironM(), 0, 0, 0.22, { rx: Math.PI / 2 }));
    b.add(mesh(torus(br * 1.05, 0.035, 4, 12), lv === 3 ? goldM() : M(C.ironDark), 0, 0, 0.22 + bl / 2, { shadow: false }));
    b.add(mesh(sph(br * 1.3, 8, 6), ironM(), 0, 0, 0.22 - bl / 2));
    pitch.add(b);
    parts.barrels.push(b);
  }
  if (lv >= 2) {
    const f = flag(lv === 3 ? "#ffd34a" : "#d0573f", 0.32, 0.2);
    f.position.set(-r + 0.1, h + 0.1, -r + 0.1);
    g.add(f);
    parts.flag = f.userData.cloth;
  }
  g.add(head);
  parts.head = head;
  return { group: g, parts };
}

function buildFrost(lv) {
  const g = new THREE.Group();
  const parts = {};
  const h = [0.55, 0.78, 1.02][lv - 1];
  g.add(mesh(cyl(0.55, 0.7, h, 6), M(C.frostStone), 0, h / 2, 0, { receive: true }));
  g.add(mesh(cyl(0.6, 0.6, 0.08, 6), M("#d9e8f2"), 0, h + 0.04, 0));
  const shards = 3 + (lv - 1) * 2;
  for (let i = 0; i < shards; i++) {
    const a = (i / shards) * Math.PI * 2 + 0.3;
    const s = 0.12 + (i % 2) * 0.04 + lv * 0.02;
    g.add(mesh(oct(1), crystalM(), Math.sin(a) * 0.42, h + 0.18 + s, Math.cos(a) * 0.42, { sv: [s, s * 2.4, s], rz: Math.sin(a) * 0.3, rx: Math.cos(a) * 0.3 }));
  }
  if (lv === 3) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      g.add(mesh(oct(1), crystalM(), Math.sin(a) * 0.62, 0.55, Math.cos(a) * 0.62, { sv: [0.13, 0.55, 0.13], rz: Math.sin(a) * 0.2, rx: Math.cos(a) * 0.2 }));
    }
  }
  const head = new THREE.Group();
  const cy = [1.3, 1.6, 1.95][lv - 1];
  head.position.set(0, cy, 0);
  const cs = [0.22, 0.26, 0.32][lv - 1];
  const core = mesh(oct(1), crystalM(), 0, 0, 0, { sv: [cs, cs * 1.9, cs] });
  head.add(core);
  parts.core = core;
  parts.rings = [];
  for (let i = 0; i < lv - 1; i++) {
    const ring = mesh(torus(0.42 + i * 0.12, 0.025, 4, 24), M("#c9f2ff", { emissive: "#7fdcff", emissiveIntensity: 0.6 }), 0, 0, 0, { shadow: false });
    ring.rotation.x = Math.PI / 2 + (i ? 0.5 : -0.3);
    head.add(ring);
    parts.rings.push(ring);
  }
  g.add(head);
  parts.head = head;
  parts.bob = head;
  parts.bobY = cy;
  return { group: g, parts };
}

function buildMage(lv) {
  const g = new THREE.Group();
  const parts = {};
  const h = [1.3, 1.55, 1.8][lv - 1];
  g.add(mesh(cyl(0.42, 0.6, h, 8), M(C.mageStone), 0, h / 2, 0, { receive: true }));
  g.add(mesh(torus(0.5, 0.05, 4, 16), M(C.magePurple), 0, h * 0.35, 0, { rx: Math.PI / 2, shadow: false }));
  if (lv >= 2) {
    // glowing windows
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      g.add(mesh(box(0.12, 0.22, 0.05), M("#e2c8ff", { emissive: "#a070ff", emissiveIntensity: 1 }), Math.sin(a) * 0.47, h * 0.62, Math.cos(a) * 0.47, { ry: a, shadow: false }));
    }
  }
  g.add(mesh(cyl(0.52, 0.38, 0.24, 8), M(lv === 3 ? C.stoneLight : C.mageStone), 0, h + 0.1, 0));
  if (lv === 3) {
    g.add(mesh(torus(0.53, 0.04, 4, 16), goldM(), 0, h + 0.22, 0, { rx: Math.PI / 2, shadow: false }));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(mesh(cone(0.07, 0.4, 5), goldM(), Math.sin(a) * 0.46, h + 0.42, Math.cos(a) * 0.46));
    }
  }
  const head = new THREE.Group();
  const oy = [1.75, 2.0, 2.3][lv - 1];
  head.position.set(0, oy, 0);
  const or = [0.2, 0.23, 0.28][lv - 1];
  const orb = mesh(sph(or, 14, 10), orbM(), 0, 0, 0, { shadow: false });
  head.add(orb);
  head.add(mesh(sph(or * 1.5, 12, 8), M("#b07cff", { basic: true, transparent: true, opacity: 0.18, depthWrite: false }), 0, 0, 0, { shadow: false }));
  parts.orbit = new THREE.Group();
  const nS = lv + 1;
  for (let i = 0; i < nS; i++) {
    const a = (i / nS) * Math.PI * 2;
    parts.orbit.add(mesh(oct(0.07), M("#e0c8ff", { emissive: "#9a5cff", emissiveIntensity: 1 }), Math.sin(a) * (or + 0.22), 0, Math.cos(a) * (or + 0.22), { shadow: false }));
  }
  head.add(parts.orbit);
  g.add(head);
  parts.head = head;
  parts.bob = head;
  parts.bobY = oy;
  return { group: g, parts };
}

const TOWER_BUILDERS = { archer: buildArcher, cannon: buildCannon, frost: buildFrost, mage: buildMage };
export function buildTower(type, level) {
  const out = TOWER_BUILDERS[type](level);
  out.group.position.y = 0.2;
  const root = new THREE.Group();
  root.add(out.group);
  out.root = root;
  out.inner = out.group;
  return out;
}

/* ------------------------------------------------------------ enemies */
function legPair(w, h, d, x, y, mat) {
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * s, y, 0);
    pivot.add(mesh(G(`leg${w},${h},${d}`, () => T(new THREE.BoxGeometry(w, h, d), 0, -h / 2, 0)), mat, 0, 0, 0));
    legs.push(pivot);
  }
  return legs;
}

function buildRaider() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const legs = legPair(0.11, 0.32, 0.12, 0.08, 0.34, M("#4a3526"));
  g.add(...legs);
  const cloth = M("#c4473a");
  body.add(mesh(capsule(0.17, 0.2), cloth, 0, 0.56, 0));
  body.add(mesh(cyl(0.18, 0.18, 0.06, 10), M("#3a2a20"), 0, 0.46, 0));
  body.add(mesh(sph(0.14, 10, 8), M(C.skin), 0, 0.86, 0));
  body.add(mesh(box(0.22, 0.05, 0.05), M("#2a2020"), 0, 0.88, 0.11, { shadow: false }));
  body.add(mesh(cone(0.17, 0.24, 8), cloth, 0, 0.99, -0.03, { rx: -0.2 }));
  body.add(mesh(cyl(0.16, 0.16, 0.04, 10), M(C.wood), -0.22, 0.58, 0.04, { rz: Math.PI / 2 }));
  body.add(mesh(box(0.04, 0.3, 0.04), M("#c9ccd2", { metalness: 0.5 }), 0.22, 0.6, 0.1, { rx: 0.4 }));
  g.add(body);
  return { group: g, body, legs, flash: [body.children[0], body.children[2]], hb: 1.28, ice: [0.3, 0.6, 0.55] };
}

function buildScout() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const legs = legPair(0.08, 0.36, 0.09, 0.07, 0.38, M("#3d3a2c"));
  g.add(...legs);
  const cloak = M("#e5b734");
  body.add(mesh(capsule(0.13, 0.22), cloak, 0, 0.6, 0));
  body.add(mesh(sph(0.12, 10, 8), M(C.skin), 0, 0.9, 0.02));
  body.add(mesh(cone(0.14, 0.34, 8), M("#c9952a"), 0, 1.02, -0.07, { rx: -0.6 }));
  body.add(mesh(box(0.3, 0.07, 0.05), M("#4ab0a0"), 0, 0.76, 0.06, { shadow: false }));
  body.add(mesh(box(0.06, 0.24, 0.03), M("#4ab0a0"), 0.08, 0.66, -0.13, { rx: 0.5, shadow: false }));
  body.rotation.x = 0.28;
  g.add(body);
  return { group: g, body, legs, flash: [body.children[0], body.children[1]], hb: 1.26, ice: [0.26, 0.62, 0.5] };
}

function buildBrute() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const skin = M("#7f6d95");
  const legs = legPair(0.2, 0.34, 0.22, 0.2, 0.38, M("#4a3d58"));
  g.add(...legs);
  body.add(mesh(sph(0.44, 12, 10), skin, 0, 0.8, 0, { sv: [1.05, 0.92, 0.88] }));
  body.add(mesh(sph(0.3, 10, 8), M("#a596b6"), 0, 0.72, 0.18, { sv: [1, 0.9, 0.6] }));
  body.add(mesh(box(0.7, 0.12, 0.62), M("#5a3f2a"), 0, 0.5, 0));
  body.add(mesh(sph(0.18, 10, 8), skin, 0, 1.24, 0.14));
  for (const s of [-1, 1]) body.add(mesh(cone(0.035, 0.12, 5), M("#f4efe2"), 0.07 * s, 1.17, 0.29, { rx: -0.3 }));
  for (const s of [-1, 1]) body.add(mesh(capsule(0.11, 0.34), skin, 0.48 * s, 0.72, 0.04, { rz: 0.25 * s }));
  // club
  body.add(mesh(cyl(0.05, 0.06, 0.7, 6), M(C.woodDark), 0.55, 1.05, -0.05, { rz: -0.5, rx: -0.4 }));
  body.add(mesh(G("club-head", () => new THREE.DodecahedronGeometry(0.17, 0)), M(C.wood), 0.72, 1.38, -0.2));
  g.add(body);
  return { group: g, body, legs, flash: [body.children[0], body.children[3]], hb: 1.72, ice: [0.52, 0.85, 0.8] };
}

function buildArmored() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const steel = M("#b7c0cc", { metalness: 0.6, roughness: 0.35 });
  const legs = legPair(0.12, 0.34, 0.13, 0.09, 0.36, M("#6f7884", { metalness: 0.5, roughness: 0.45 }));
  g.add(...legs);
  body.add(mesh(capsule(0.2, 0.22), steel, 0, 0.6, 0));
  for (const s of [-1, 1]) body.add(mesh(sph(0.12, 8, 6), steel, 0.2 * s, 0.78, 0));
  body.add(mesh(cyl(0.15, 0.16, 0.24, 10), steel, 0, 0.98, 0));
  body.add(mesh(box(0.2, 0.04, 0.04), M("#1d2128"), 0, 0.99, 0.15, { shadow: false }));
  body.add(mesh(box(0.05, 0.16, 0.24), M("#d03c3c"), 0, 1.15, -0.02));
  // tower shield
  body.add(mesh(box(0.42, 0.56, 0.06), M("#3f5a8c", { metalness: 0.3 }), -0.08, 0.6, 0.26));
  body.add(mesh(box(0.08, 0.46, 0.07), M(C.gold, { metalness: 0.5 }), -0.08, 0.6, 0.29, { shadow: false }));
  body.add(mesh(cyl(0.025, 0.025, 1.2, 5), M(C.woodDark), 0.24, 0.8, 0.05));
  body.add(mesh(cone(0.06, 0.18, 5), steel, 0.24, 1.48, 0.05));
  g.add(body);
  return { group: g, body, legs, flash: [body.children[0], body.children[3]], hb: 1.45, ice: [0.36, 0.7, 0.6] };
}

function buildSwarmer() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.add(mesh(sph(0.2, 10, 8), M("#e8692a"), 0, 0.17, 0, { sv: [1, 0.62, 1.2] }));
  body.add(mesh(sph(0.1, 8, 6), M("#3a2220"), 0, 0.15, 0.22));
  for (const [x, z] of [[0.07, 0.04], [-0.08, -0.08], [0.02, -0.15]]) body.add(mesh(sph(0.045, 6, 4), M("#4a1e14"), x, 0.29, z, { shadow: false }));
  for (const s of [-1, 1]) body.add(mesh(cone(0.02, 0.14, 4), M("#3a2220"), 0.05 * s, 0.2, 0.33, { rx: 1.2 }));
  g.add(body);
  const legs = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.16 * s, 0.12, 0);
    for (const z of [-0.12, 0, 0.12]) pivot.add(mesh(box(0.14, 0.03, 0.03), M("#2a1a14"), 0.06 * s, -0.04, z, { rz: 0.5 * s, shadow: false }));
    g.add(pivot);
    legs.push(pivot);
  }
  return { group: g, body, legs, flash: [body.children[0]], hb: 0.62, ice: [0.24, 0.3, 0.32], scuttle: true };
}

function buildBoss(tint, warlord) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const hide = M(tint);
  const plate = M(warlord ? "#3a2a26" : "#4a4450", { metalness: 0.35, roughness: 0.5 });
  const legs = legPair(0.34, 0.75, 0.36, 0.34, 0.8, plate);
  g.add(...legs);
  body.add(mesh(G("boss-torso", () => new THREE.DodecahedronGeometry(0.78, 0)), hide, 0, 1.45, 0, { sv: [1.15, 1, 0.92] }));
  body.add(mesh(box(1.2, 0.5, 0.3), plate, 0, 1.3, 0.55, { rx: -0.1 }));
  body.add(mesh(box(1.25, 0.18, 1.0), M("#3a2a20"), 0, 0.92, 0));
  body.add(mesh(sph(0.34, 10, 8), hide, 0, 2.18, 0.32, { sv: [1, 0.85, 1] }));
  for (const s of [-1, 1]) {
    body.add(mesh(sph(0.055, 6, 4), M("#ffe066", { emissive: "#ffcc00", emissiveIntensity: 2.5 }), 0.13 * s, 2.24, 0.6, { shadow: false }));
    // curling horns: two cones per side
    body.add(mesh(cone(0.11, 0.42, 6), M("#efe6d2"), 0.32 * s, 2.45, 0.22, { rz: -0.9 * s }));
    body.add(mesh(cone(0.07, 0.34, 6), M("#efe6d2"), 0.55 * s, 2.72, 0.2, { rz: -0.15 * s, rx: -0.35 }));
    // spiked pauldrons
    body.add(mesh(sph(0.32, 8, 6), plate, 0.85 * s, 1.92, 0));
    body.add(mesh(cone(0.08, 0.3, 5), M("#d8d0c0"), 0.95 * s, 2.25, 0, { rz: -0.4 * s }));
    body.add(mesh(capsule(0.2, 0.6), hide, 0.95 * s, 1.35, 0.06, { rz: 0.12 * s }));
  }
  // hammer
  body.add(mesh(cyl(0.06, 0.06, 1.8, 6), M(C.woodDark), 1.08, 1.5, 0.35, { rx: 0.25 }));
  body.add(mesh(box(0.5, 0.42, 0.62), plate, 1.08, 2.38, 0.6, { rx: 0.25 }));
  if (warlord) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      body.add(mesh(cone(0.06, 0.26, 4), goldM(), Math.sin(a) * 0.26, 2.5, 0.32 + Math.cos(a) * 0.26));
    }
    const lava = M("#ff8a2a", { emissive: "#ff5a10", emissiveIntensity: 2.2 });
    body.add(mesh(box(0.06, 0.7, 0.04), lava, 0.25, 1.5, 0.82, { rz: 0.3, shadow: false }));
    body.add(mesh(box(0.05, 0.5, 0.04), lava, -0.3, 1.6, 0.82, { rz: -0.4, shadow: false }));
    body.add(mesh(box(1.3, 1.5, 0.05), M("#7a1e1a", { side: THREE.DoubleSide }), 0, 1.4, -0.72, { rx: 0.12 }));
  }
  g.add(body);
  const s = warlord ? 1.15 : 1;
  g.scale.setScalar(s);
  return { group: g, body, legs, flash: [body.children[0], body.children[3]], hb: 3.05 * s, ice: [0.95, 1.5, 1.2], boss: true };
}

export function buildEnemy(type, bossTint) {
  let out;
  if (type === "raider") out = buildRaider();
  else if (type === "scout") out = buildScout();
  else if (type === "brute") out = buildBrute();
  else if (type === "armored") out = buildArmored();
  else if (type === "swarmer") out = buildSwarmer();
  else out = buildBoss(type === "warlord" ? "#9a3a26" : bossTint || "#7a4f8c", type === "warlord");
  const root = new THREE.Group();
  root.add(out.group);
  // frost shell
  const [r, h, d] = out.ice;
  const ice = mesh(sph(1, 10, 8), M("#bff0ff", { transparent: true, opacity: 0.38, emissive: "#6fd8ff", emissiveIntensity: 0.4, depthWrite: false }), 0, h * 0.62, 0, { sv: [r * 1.15, h * 0.75, d], shadow: false });
  ice.visible = false;
  out.group.add(ice);
  out.iceShell = ice;
  out.root = root;
  out.mats = out.flash.map((m) => m.material);
  return out;
}

export const FLASH_MAT = new THREE.MeshBasicMaterial({ color: "#ffffff" });

/* ------------------------------------------------------------ base + gate */
export function buildBase(world) {
  const g = new THREE.Group();
  const wall = M(world.id === 5 ? "#6a5e58" : world.id === 4 ? "#8a8a80" : C.stoneLight);
  const roof = M(world.id === 3 ? "#3d78a8" : world.id === 2 ? "#c8742a" : world.id === 4 ? "#3f6a4a" : world.id === 5 ? "#8a2a1a" : "#3b6fd0");
  g.add(mesh(box(2.3, 0.25, 2.5), M(C.stoneDark), 0, 0.12, 0, { receive: true }));
  // keep
  g.add(mesh(box(1.3, 1.6, 1.3), wall, 0, 1.0, -0.25));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) g.add(mesh(box(0.2, 0.22, 0.2), wall, -0.5 + i * 0.33, 1.9, -0.25 + 0.55 * s));
  g.add(mesh(cone(0.85, 0.75, 4), roof, 0, 2.3, -0.25, { ry: Math.PI / 4 }));
  // gate facing +z
  g.add(mesh(box(0.6, 0.75, 0.08), M("#5a3a22"), 0, 0.58, 0.42));
  g.add(mesh(torus(0.3, 0.06, 4, 10, Math.PI), M(C.stoneDark), 0, 0.95, 0.43, { shadow: false }));
  // corner towers
  const towers = [];
  for (const [x, z] of [[-0.95, 0.85], [0.95, 0.85], [-0.95, -1.0], [0.95, -1.0]]) {
    g.add(mesh(cyl(0.34, 0.4, 1.35, 10), wall, x, 0.8, z));
    g.add(mesh(cone(0.44, 0.6, 10), roof, x, 1.78, z));
    towers.push([x, z]);
  }
  // front walls
  for (const s of [-1, 1]) g.add(mesh(box(0.6, 0.8, 0.22), wall, 0.6 * s, 0.55, 0.85));
  const flags = [];
  for (const [x, z] of [[-0.95, 0.85], [0.95, 0.85]]) {
    const f = flag("#ffd34a", 0.36, 0.22);
    f.position.set(x, 2.05, z);
    g.add(f);
    flags.push(f.userData.cloth);
  }
  const f = flag("#e84a3a", 0.5, 0.3);
  f.position.set(0, 2.6, -0.25);
  g.add(f);
  flags.push(f.userData.cloth);
  return { group: g, flags };
}

export function buildGate(world) {
  const g = new THREE.Group();
  const rock = M(world.id === 2 ? "#a8794a" : world.id === 3 ? "#7f8fa0" : world.id === 5 ? "#3a302c" : "#6d6a62");
  for (const s of [-1, 1]) {
    g.add(mesh(G("gate-pillar", () => new THREE.DodecahedronGeometry(0.7, 0)), rock, 1.15 * s, 0.85, 0, { sv: [0.75, 1.35, 0.8] }));
    g.add(mesh(cone(0.12, 0.5, 5), M("#d8d0c0"), 1.15 * s, 1.95, 0.1, { rz: -0.3 * s }));
  }
  g.add(mesh(box(2.9, 0.42, 0.7), rock, 0, 1.95, 0, { rz: 0.04 }));
  g.add(mesh(G("gate-skull", () => new THREE.DodecahedronGeometry(0.22, 0)), M("#e8e0cc"), 0, 2.0, 0.36));
  const portal = mesh(G("gate-portal", () => new THREE.CircleGeometry(0.85, 24)), M("#5a1a7a", { basic: true, transparent: true, opacity: 0.9 }), 0, 0.95, -0.05, { sv: [1.1, 1.05, 1], shadow: false });
  g.add(portal);
  const swirl = mesh(G("gate-swirl", () => new THREE.RingGeometry(0.25, 0.75, 20, 1, 0, Math.PI * 1.4)), M("#c46cff", { basic: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide }), 0, 0.95, 0.0, { shadow: false });
  g.add(swirl);
  return { group: g, swirl };
}

/* ------------------------------------------------------------ props (instanced) */
// Each prop kind = list of [geometry, colorKey] parts. colorKey resolves against the world.
const bushGeo = () => G("bush", () => merge([T(new THREE.IcosahedronGeometry(0.34, 0), 0, 0.26, 0), T(new THREE.IcosahedronGeometry(0.26, 0), 0.3, 0.2, 0.05), T(new THREE.IcosahedronGeometry(0.24, 0), -0.25, 0.18, -0.08)]));
const flowerColors = ["#ff5f7a", "#ffd34a", "#ffffff", "#b07cff", "#ff8a3a"];
export function propParts(kind, W) {
  switch (kind) {
    case "tree":
      return [
        [G("tree-trunk", () => T(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 6), 0, 0.45, 0)), W.trunk],
        [G("tree-leaf", () => merge([T(new THREE.IcosahedronGeometry(0.62, 0), 0, 1.25, 0), T(new THREE.IcosahedronGeometry(0.45, 0), 0.25, 1.7, 0.1), T(new THREE.IcosahedronGeometry(0.4, 0), -0.3, 1.5, -0.15)])), "leaf"],
      ];
    case "pine":
      return [
        [G("tree-trunk", () => T(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 6), 0, 0.45, 0)), W.trunk],
        [G("pine-leaf", () => merge([T(new THREE.ConeGeometry(0.7, 0.9, 7), 0, 0.95, 0), T(new THREE.ConeGeometry(0.55, 0.8, 7), 0, 1.4, 0), T(new THREE.ConeGeometry(0.38, 0.7, 7), 0, 1.85, 0)])), "leaf"],
      ];
    case "snowpine":
      return [
        [G("tree-trunk", () => T(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 6), 0, 0.45, 0)), W.trunk],
        [G("pine-leaf", () => merge([T(new THREE.ConeGeometry(0.7, 0.9, 7), 0, 0.95, 0), T(new THREE.ConeGeometry(0.55, 0.8, 7), 0, 1.4, 0), T(new THREE.ConeGeometry(0.38, 0.7, 7), 0, 1.85, 0)])), "leaf"],
        [G("pine-snow", () => merge([T(new THREE.ConeGeometry(0.42, 0.36, 7), 0, 1.33, 0), T(new THREE.ConeGeometry(0.3, 0.32, 7), 0, 1.75, 0), T(new THREE.ConeGeometry(0.22, 0.32, 7), 0, 2.1, 0)])), "#f4f9ff"],
      ];
    case "bush":
      return [[bushGeo(), "leaf"]];
    case "snowbush":
      return [[bushGeo(), "#eef6ff"]];
    case "rock":
      return [[G("rock", () => T(new THREE.DodecahedronGeometry(0.4, 0), 0, 0.18, 0, 0, 0, 0, 1, 0.6, 1)), W.rock]];
    case "flower":
      return [
        [G("flower-leaf", () => merge([0, 1, 2].map((i) => T(new THREE.ConeGeometry(0.05, 0.22, 3), Math.cos(i * 2.1) * 0.07, 0.1, Math.sin(i * 2.1) * 0.07)))), "#3f8f30"],
        [G("flower-head", () => merge([0, 1, 2, 3].map((i) => T(new THREE.IcosahedronGeometry(0.055, 0), Math.cos(i * 1.6) * 0.1, 0.22 + (i % 2) * 0.05, Math.sin(i * 1.6) * 0.1)))), "flower"],
      ];
    case "fence":
      return [[G("fence", () => merge([T(new THREE.BoxGeometry(0.08, 0.5, 0.08), -0.8, 0.25, 0), T(new THREE.BoxGeometry(0.08, 0.5, 0.08), 0, 0.25, 0), T(new THREE.BoxGeometry(0.08, 0.5, 0.08), 0.8, 0.25, 0), T(new THREE.BoxGeometry(1.7, 0.06, 0.04), 0, 0.36, 0), T(new THREE.BoxGeometry(1.7, 0.06, 0.04), 0, 0.18, 0)])), C.wood]];
    case "hay":
      return [[G("hay", () => T(new THREE.CylinderGeometry(0.32, 0.32, 0.5, 10), 0, 0.32, 0, 0, 0, Math.PI / 2)), "#e2c25a"]];
    case "cactus":
      return [[G("cactus", () => merge([T(new THREE.CylinderGeometry(0.14, 0.16, 1.2, 7), 0, 0.6, 0), T(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6), 0.22, 0.75, 0, 0, 0, Math.PI / 2), T(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 6), 0.36, 0.92, 0), T(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6), -0.2, 0.55, 0, 0, 0, Math.PI / 2), T(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 6), -0.32, 0.7, 0)])), "#4f9a4a"]];
    case "palm":
      return [
        [G("palm-trunk", () => merge([T(new THREE.CylinderGeometry(0.09, 0.12, 0.8, 6), 0, 0.4, 0, 0, 0, 0.1), T(new THREE.CylinderGeometry(0.08, 0.09, 0.8, 6), 0.08, 1.15, 0, 0, 0, 0.18)])), W.trunk],
        [G("palm-leaf", () => merge([0, 1, 2, 3, 4, 5].map((i) => T(new THREE.BoxGeometry(0.9, 0.03, 0.22), Math.cos(i * 1.05) * 0.4 + 0.15, 1.5, Math.sin(i * 1.05) * 0.4, 0, -i * 1.05, -0.35)))), "leaf"],
      ];
    case "mesa":
      return [[G("mesa", () => merge([T(new THREE.CylinderGeometry(1.4, 1.8, 1.4, 7), 0, 0.7, 0), T(new THREE.CylinderGeometry(1.0, 1.3, 1.0, 7), 0.2, 1.9, 0.1)])), "#c47a48"]];
    case "ruin":
      return [[G("ruin", () => merge([T(new THREE.CylinderGeometry(0.2, 0.22, 1.3, 8), 0, 0.65, 0), T(new THREE.CylinderGeometry(0.2, 0.22, 0.6, 8), 0.7, 0.3, 0.2), T(new THREE.BoxGeometry(0.6, 0.3, 0.5), 0.35, 0.15, -0.5), T(new THREE.BoxGeometry(0.5, 0.18, 0.5), 0, 1.38, 0)])), "#e0c79a"]];
    case "crystal":
      return [[G("icecrystal", () => merge([T(new THREE.OctahedronGeometry(0.22, 0), 0, 0.45, 0, 0, 0, 0, 1, 2.4, 1), T(new THREE.OctahedronGeometry(0.15, 0), 0.25, 0.3, 0.1, 0, 0, -0.4, 1, 2.2, 1), T(new THREE.OctahedronGeometry(0.12, 0), -0.2, 0.25, -0.1, 0, 0, 0.5, 1, 2.2, 1)])), "#9fe4ff"]];
    case "deadtree":
      return [[G("deadtree", () => merge([T(new THREE.CylinderGeometry(0.08, 0.17, 1.6, 6), 0, 0.8, 0, 0, 0, 0.08), T(new THREE.CylinderGeometry(0.04, 0.07, 0.8, 5), 0.3, 1.45, 0, 0, 0, -0.9), T(new THREE.CylinderGeometry(0.03, 0.06, 0.7, 5), -0.25, 1.3, 0.1, 0.3, 0, 0.8), T(new THREE.CylinderGeometry(0.03, 0.05, 0.5, 5), 0.1, 1.75, -0.2, -0.6, 0, -0.2)])), W.trunk]];
    case "mushroom":
      return [
        [G("mush-stem", () => T(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), 0, 0.15, 0)), "#e8e0cc"],
        [G("mush-cap", () => T(new THREE.SphereGeometry(0.18, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.28, 0)), "glowcap"],
      ];
    case "glow":
      return [[G("glowplant", () => merge([0, 1, 2, 3, 4].map((i) => T(new THREE.IcosahedronGeometry(0.06, 0), Math.cos(i * 1.3) * 0.15, 0.2 + (i % 3) * 0.08, Math.sin(i * 1.3) * 0.15)))), "glow"]];
    case "reed":
      return [[G("reed", () => merge([0, 1, 2, 3, 4].map((i) => T(new THREE.ConeGeometry(0.03, 0.7 + (i % 2) * 0.2, 3), Math.cos(i * 1.4) * 0.12, 0.35, Math.sin(i * 1.4) * 0.12, 0, 0, (i - 2) * 0.08)))), "#6a7a3a"]];
    case "spire":
      return [[G("spire", () => merge([T(new THREE.ConeGeometry(0.45, 2.0, 5), 0, 1.0, 0), T(new THREE.ConeGeometry(0.28, 1.2, 5), 0.4, 0.6, 0.2, 0, 0, -0.2)])), W.rock]];
    case "ember":
      return [[G("ember", () => merge([T(new THREE.DodecahedronGeometry(0.16, 0), 0, 0.1, 0), T(new THREE.DodecahedronGeometry(0.11, 0), 0.2, 0.07, 0.1), T(new THREE.DodecahedronGeometry(0.09, 0), -0.15, 0.06, -0.1)])), "ember"]];
    case "wall":
      return [[G("fortwall", () => merge([T(new THREE.BoxGeometry(2.6, 1.2, 0.6), 0, 0.6, 0), ...[0, 1, 2, 3, 4].map((i) => T(new THREE.BoxGeometry(0.3, 0.3, 0.6), -1.1 + i * 0.55, 1.35, 0))])), "#4a403c"]];
    default:
      return [];
  }
}

export const PROP_SIZE = { tree: 1.0, pine: 0.9, snowpine: 0.9, bush: 0.55, snowbush: 0.55, rock: 0.5, flower: 0.2, fence: 1.0, hay: 0.5, cactus: 0.5, palm: 0.9, mesa: 2.2, ruin: 0.9, crystal: 0.4, deadtree: 0.8, mushroom: 0.3, glow: 0.25, reed: 0.25, spire: 0.7, ember: 0.3, wall: 1.5 };
export const PROP_TALL = new Set(["tree", "pine", "snowpine", "palm", "mesa", "deadtree", "spire", "wall", "ruin"]);
export { flowerColors };
