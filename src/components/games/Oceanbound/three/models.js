/**
 * Oceanbound — original procedural models.
 *
 * Every model is built from primitives with vertex colours and merged per
 * material, so a tree / station / tool is 1-3 draw calls. Geometries are
 * cached by key (variants for trees, one per raft part) and shared by all
 * instances; materials live in MATS and are created once per world.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "../sim/util.js";
import { CELL, WALL_H } from "../sim/raft.js";
import { CAVE_ROCKS } from "../sim/islands.js";
import { woodTex, rockTex, groundTex, thatchTex, clothTex, netTex, leafTex, tuftTex, paperTex } from "./textures.js";
import { patchWet } from "./water.js";

/* ------------------------------------------------------------------ materials */
export const MATS = {};
export function createMaterials(quality) {
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: true, ...o });
  MATS.wood = patchWet(std({ map: woodTex(), roughness: 0.82 }));
  MATS.plain = patchWet(std({}));
  MATS.leaf = patchWet(std({ map: leafTex(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 }));
  MATS.tuft = patchWet(std({ map: tuftTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 }));
  MATS.rock = patchWet(std({ map: rockTex(), roughness: 0.92 }));
  MATS.terrain = patchWet(std({ map: groundTex(), roughness: 0.96 }), { shore: true });
  MATS.thatch = patchWet(std({ map: thatchTex(), roughness: 0.95 }));
  MATS.cloth = patchWet(std({ map: clothTex(), side: THREE.DoubleSide, roughness: 0.9 }));
  MATS.net = patchWet(std({ map: netTex(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.9 }));
  MATS.metal = patchWet(std({ roughness: 0.42, metalness: 0.65 }));
  MATS.plastic = patchWet(std({ roughness: 0.4 }));
  MATS.paper = std({ map: paperTex(), side: THREE.DoubleSide, roughness: 0.9, vertexColors: false });
  MATS.skin = std({ roughness: 0.7 });
  MATS.glow = new THREE.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  MATS.fire = new THREE.MeshBasicMaterial({ color: "#ff8a2a", transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  MATS.waterIn = new THREE.MeshStandardMaterial({ color: "#3aa6c8", transparent: true, opacity: 0.75, roughness: 0.1 });
  MATS.ghostOk = new THREE.MeshBasicMaterial({ color: "#5cf0a8", transparent: true, opacity: 0.38, depthWrite: false });
  MATS.ghostBad = new THREE.MeshBasicMaterial({ color: "#ff5a52", transparent: true, opacity: 0.38, depthWrite: false });
  void quality;
  return MATS;
}
export function disposeMaterials() {
  for (const k in MATS) MATS[k].dispose();
  for (const g of GEO.values()) {
    const lists = Array.isArray(g) ? [g] : Object.values(g);
    for (const list of lists) for (const p of list) p[0].dispose();
  }
  GEO.clear();
}

/* ------------------------------------------------------------------ builder */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const col = new THREE.Color();

function prep(g, color, pos, rot, scl) {
  g = g.index ? g : g;
  if (!g.attributes.uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.index) {
    const idx = [];
    for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
    g.setIndex(idx);
  }
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv", "color"].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    if (typeof color === "function") {
      const p = g.attributes.position;
      const nn = g.attributes.normal;
      for (let i = 0; i < n; i++) {
        color(col, p.getX(i), p.getY(i), p.getZ(i), nn.getX(i), nn.getY(i), nn.getZ(i), i);
        c[i * 3] = col.r;
        c[i * 3 + 1] = col.g;
        c[i * 3 + 2] = col.b;
      }
    } else {
      col.set(color);
      for (let i = 0; i < n; i++) {
        c[i * 3] = col.r;
        c[i * 3 + 1] = col.g;
        c[i * 3 + 2] = col.b;
      }
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  }
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
  _q.setFromEuler(_e);
  _v.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  if (typeof scl === "number") _s.set(scl, scl, scl);
  else _s.set(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1);
  _m.compose(_v, _q, _s);
  g.applyMatrix4(_m);
  return g;
}
/** collects parts per material; .done() → [[geometry, matKey], ...] */
function kit() {
  const by = {};
  const api = {
    add(mat, g, color, pos, rot, scl) {
      (by[mat] ||= []).push(prep(g, color, pos, rot, scl));
      return api;
    },
    done() {
      return Object.entries(by).map(([k, list]) => {
        const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
        g.computeBoundingSphere();
        return [g, k];
      });
    },
  };
  return api;
}
const GEO = new Map();
function cached(key, fn) {
  if (!GEO.has(key)) GEO.set(key, fn());
  return GEO.get(key);
}
/** a Group with one mesh per material */
export function meshes(parts, { shadow = true, receive = true } = {}) {
  const grp = new THREE.Group();
  for (const [g, k] of parts) {
    const m = new THREE.Mesh(g, MATS[k]);
    m.castShadow = shadow && k !== "glow" && k !== "fire";
    m.receiveShadow = receive;
    m.userData.mat = k;
    grp.add(m);
  }
  return grp;
}
export function getModel(key, opts) {
  const fn = BUILDERS[key];
  if (!fn) return null;
  return meshes(cached(key, fn), opts);
}

/* ------------------------------------------------------------------ helpers */
function noisyRock(r, seed, detail = 2, squash = 0.7) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  const R = rng(seed);
  const ph = [R() * 9, R() * 9, R() * 9];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + 0.18 * Math.sin(x * 3.1 + ph[0]) * Math.cos(z * 2.7 + ph[1]) + 0.1 * Math.sin(y * 5.3 + ph[2]);
    p.setXYZ(i, x * n, y * n * squash, z * n);
  }
  g.computeVertexNormals();
  return g;
}
function taperTube(curve, segs, rad, r0, r1, ring) {
  const g = new THREE.TubeGeometry(curve, segs, 1, rad, false);
  const p = g.attributes.position;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = curve.getPointAt(t);
    const rr = r0 + (r1 - r0) * t;
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      p.setXYZ(k, c.x + (p.getX(k) - c.x) * rr, c.y + (p.getY(k) - c.y) * rr, c.z + (p.getZ(k) - c.z) * rr);
    }
  }
  g.computeVertexNormals();
  // ring index for banding
  if (ring) {
    const n = p.count;
    const cc = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const i = Math.floor(k / (rad + 1));
      ring(col, i, segs);
      cc[k * 3] = col.r;
      cc[k * 3 + 1] = col.g;
      cc[k * 3 + 2] = col.b;
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(cc, 3));
  }
  return g;
}
/** palm frond strip: spine from origin along dir, drooping */
function frond(len, width, droop, seed, curl = 0.35) {
  const segs = 9;
  const pos = [];
  const uv = [];
  const idx = [];
  const R = rng(seed);
  const tw = (R() - 0.5) * 0.3;
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const x = t * len;
    const y = -droop * t * t * len;
    const w = Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04)) * width * (1 - t * 0.3);
    const dy = -w * curl;
    pos.push(x, y + dy, -w + tw * t, x, y + 0.02, 0, x, y + dy, w + tw * t);
    uv.push(0, t, 0.5, t, 1, t);
  }
  for (let s = 0; s < segs; s++) {
    const a = s * 3;
    const b = a + 3;
    idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
const greenVar = (seed, base = [0.36, 0.55, 0.22]) => {
  const R = rng(seed);
  return (c, x, y) => c.setRGB(base[0] * (0.85 + R() * 0.3), base[1] * (0.85 + R() * 0.25) + y * 0.01, base[2] * (0.8 + R() * 0.3));
};

/* ------------------------------------------------------------------ vegetation */
function palm(seed) {
  const R = rng(seed);
  const h = R.range(5.4, 7.8);
  const lean = R.range(0.12, 0.42);
  const k = kit();
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(lean * h * 0.15, h * 0.55, 0), new THREE.Vector3(lean * h, h, 0));
  k.add(
    "wood",
    taperTube(curve, 14, 8, 0.27, 0.15, (c, i) => (i % 2 ? c.setRGB(0.55, 0.43, 0.3) : c.setRGB(0.68, 0.55, 0.38))),
    0xffffff,
  );
  const top = curve.getPointAt(1);
  // fronds
  const n = 9 + Math.floor(R() * 3);
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + R() * 0.3;
    const L = R.range(2.6, 3.4);
    const g = frond(L, 0.62, R.range(0.32, 0.5), seed + f);
    k.add("leaf", g, greenVar(seed + f * 7, [0.42, 0.62, 0.24]), [top.x, top.y + 0.05, top.z], [0, -a, R.range(0.05, 0.35)]);
  }
  // a couple of dead hanging fronds
  for (let f = 0; f < 2; f++) {
    const a = R() * Math.PI * 2;
    k.add("leaf", frond(2.1, 0.45, 1.6, seed + 40 + f), (c) => c.setRGB(0.6, 0.5, 0.28), [top.x, top.y - 0.1, top.z], [0, a, -0.3]);
  }
  // coconut cluster
  for (let c = 0; c < 4; c++) {
    const a = c * 1.6 + R();
    k.add("plain", new THREE.SphereGeometry(0.15, 10, 8), c % 2 ? "#5b4a2a" : "#6d7a32", [top.x + Math.cos(a) * 0.22, top.y - 0.25, top.z + Math.sin(a) * 0.22]);
  }
  return k.done();
}
export const PALM_VARIANTS = 5;

function jungleTree(seed) {
  const R = rng(seed);
  const h = R.range(7, 9.5);
  const k = kit();
  const bend = R.range(-0.6, 0.6);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(bend * 0.3, h * 0.35, 0.2), new THREE.Vector3(bend, h * 0.7, -0.2), new THREE.Vector3(bend * 0.8, h, 0)]);
  k.add("wood", taperTube(curve, 12, 9, 0.48, 0.22, (c, i) => c.setRGB(0.42 + (i % 3) * 0.02, 0.34, 0.24)), 0xffffff);
  // buttress roots
  for (let r = 0; r < 5; r++) {
    const a = (r / 5) * Math.PI * 2 + R();
    k.add("wood", new THREE.ConeGeometry(0.35, 1.6, 4), "#5a4632", [Math.cos(a) * 0.45, 0.4, Math.sin(a) * 0.45], [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5], [0.5, 1, 1.4]);
  }
  // canopy blobs
  const top = curve.getPointAt(1);
  const blobs = 6 + Math.floor(R() * 3);
  for (let b = 0; b < blobs; b++) {
    const a = R() * Math.PI * 2;
    const d = R.range(0.4, 2.2);
    const r = R.range(1.3, 2.3);
    k.add("plain", noisyRock(r, seed + b, 1, 0.72), greenVar(seed + b * 3, [0.17, 0.42, 0.16]), [top.x + Math.cos(a) * d, top.y + R.range(-0.5, 0.9), top.z + Math.sin(a) * d]);
  }
  // hanging vines
  for (let v = 0; v < 6; v++) {
    const a = R() * Math.PI * 2;
    const d = R.range(1, 2.4);
    const L = R.range(2, 4.5);
    const x = top.x + Math.cos(a) * d;
    const z = top.z + Math.sin(a) * d;
    k.add("plain", new THREE.CylinderGeometry(0.025, 0.035, L, 4), "#3d5a22", [x, top.y - 0.6 - L / 2, z], [R() * 0.1, 0, R() * 0.1]);
  }
  return k.done();
}
function mangoTree(seed, fruit) {
  const R = rng(seed);
  const k = kit();
  const h = R.range(3.2, 4.2);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.2, h * 0.5, 0.1), new THREE.Vector3(0.1, h, 0));
  if (!fruit) {
    k.add("wood", taperTube(curve, 8, 7, 0.24, 0.14), "#6b5236");
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI * 2;
      const bc = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.1, h * 0.75, 0), new THREE.Vector3(Math.cos(a) * 0.6, h * 0.9, Math.sin(a) * 0.6), new THREE.Vector3(Math.cos(a) * 1.1, h + 0.4, Math.sin(a) * 1.1));
      k.add("wood", taperTube(bc, 5, 5, 0.1, 0.05), "#6b5236");
    }
    for (let b = 0; b < 7; b++) {
      const a = R() * Math.PI * 2;
      const d = R.range(0.2, 1.4);
      k.add("plain", noisyRock(R.range(0.9, 1.4), seed + b, 1, 0.8), greenVar(seed + b, [0.26, 0.5, 0.18]), [Math.cos(a) * d, h + R.range(0, 0.9), Math.sin(a) * d]);
    }
  } else {
    for (let f = 0; f < 9; f++) {
      const a = R() * Math.PI * 2;
      const d = R.range(0.9, 1.6);
      k.add("plain", new THREE.SphereGeometry(0.13, 8, 6), f % 3 ? "#f2a530" : "#e46a2a", [Math.cos(a) * d, h + R.range(-0.5, 0.2), Math.sin(a) * d], null, [0.85, 1.15, 0.85]);
    }
  }
  return k.done();
}
function bamboo(seed) {
  const R = rng(seed);
  const k = kit();
  const n = 7 + Math.floor(R() * 4);
  for (let s = 0; s < n; s++) {
    const a = R() * Math.PI * 2;
    const d = R.range(0, 0.55);
    const h = R.range(3.4, 5.6);
    const r = R.range(0.05, 0.085);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const tilt = [R.range(-0.1, 0.1), 0, R.range(-0.1, 0.1)];
    const g = new THREE.CylinderGeometry(r, r * 1.1, h, 7, 8);
    k.add("plain", g, (c, px, py) => {
      const seg = (py + h / 2) / (h / 8);
      const node = Math.abs(seg - Math.round(seg)) < 0.06;
      c.setRGB(node ? 0.42 : 0.55, node ? 0.5 : 0.66, node ? 0.2 : 0.28);
    }, [x, h / 2, z], tilt);
    for (let l = 0; l < 3; l++) {
      const la = R() * Math.PI * 2;
      k.add("leaf", frond(0.9, 0.18, 0.4, seed + s * 9 + l), greenVar(seed + l, [0.4, 0.62, 0.22]), [x + tilt[2] * -h * 0.9, h * (0.75 + l * 0.08), z + tilt[0] * h * 0.9], [0, la, -0.25]);
    }
  }
  return k.done();
}
function bush(seed) {
  const R = rng(seed);
  const k = kit();
  const n = 8;
  for (let f = 0; f < n; f++) {
    const a = (f / n) * Math.PI * 2 + R() * 0.4;
    k.add("leaf", frond(R.range(1, 1.5), 0.36, 0.5, seed + f, 0.3), greenVar(seed + f, [0.38, 0.6, 0.22]), [0, 0.1, 0], [0, a, R.range(0.5, 0.9)]);
  }
  return k.done();
}
function vineNode(seed) {
  const R = rng(seed);
  const k = kit();
  // gnarled snag draped with vines
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.3, 1.4, 0.1), new THREE.Vector3(-0.2, 2.6, 0), new THREE.Vector3(0.5, 3.4, 0.2)]);
  k.add("wood", taperTube(curve, 10, 6, 0.24, 0.1), "#5b4a36");
  const arm = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.1, 2.5, 0), new THREE.Vector3(0.8, 3.1, 0), new THREE.Vector3(1.4, 3.0, 0.1));
  k.add("wood", taperTube(arm, 6, 5, 0.09, 0.05), "#5b4a36");
  for (let v = 0; v < 12; v++) {
    const t = R();
    const p = (v % 2 ? arm : curve).getPointAt(0.5 + t * 0.5);
    const L = R.range(1.6, 3);
    k.add("plain", new THREE.CylinderGeometry(0.03, 0.04, L, 4), v % 3 ? "#3f6a24" : "#2f5a1c", [p.x + R.range(-0.15, 0.15), p.y - L / 2, p.z + R.range(-0.15, 0.15)]);
    k.add("plain", new THREE.IcosahedronGeometry(0.1, 0), "#4f8a2a", [p.x, p.y - L * R.range(0.3, 0.9), p.z], null, [1.4, 0.6, 1]);
  }
  return k.done();
}
function tuft(seed) {
  const k = kit();
  for (let a = 0; a < 3; a++) {
    const g = new THREE.PlaneGeometry(0.9, 0.7);
    g.translate(0, 0.35, 0);
    k.add("tuft", g, "#ffffff", [0, 0, 0], [0, (a / 3) * Math.PI, 0]);
  }
  void seed;
  return k.done();
}
function fern(seed) {
  const R = rng(seed);
  const k = kit();
  for (let f = 0; f < 7; f++) {
    const a = (f / 7) * Math.PI * 2 + R() * 0.3;
    k.add("leaf", frond(0.8, 0.22, 0.3, seed + f), greenVar(seed + f, [0.24, 0.5, 0.18]), [0, 0.05, 0], [0, a, 0.7]);
  }
  return k.done();
}

/* ------------------------------------------------------------------ rocks & pickups */
function rock(seed) {
  return kit().add("rock", noisyRock(1, seed, 2, 0.75), (c, x, y) => c.setRGB(0.55 + y * 0.06, 0.53 + y * 0.05, 0.5 + y * 0.04)).done();
}
function boulder(seed) {
  const R = rng(seed);
  const k = kit();
  k.add("rock", noisyRock(1, seed, 2, 0.8), (c, x, y, z) => {
    const streak = Math.sin(x * 4 + z * 3 + y * 2) > 0.55;
    c.setRGB(streak ? 0.62 : 0.5, streak ? 0.35 : 0.48, streak ? 0.22 : 0.46);
  });
  for (let n = 0; n < 5; n++) {
    const a = R() * Math.PI * 2;
    const e = R.range(-0.2, 0.5);
    k.add("metal", new THREE.OctahedronGeometry(0.16, 0), "#b06a3a", [Math.cos(a) * 0.9, e, Math.sin(a) * 0.9], [R(), R(), R()]);
  }
  return k.done();
}
function stone() {
  return kit().add("rock", noisyRock(0.2, 7, 1, 0.6), "#9a968c", [0, 0.07, 0]).done();
}
function coconutPickup() {
  return kit().add("plain", new THREE.SphereGeometry(0.15, 10, 8), "#6b4e2c", [0, 0.13, 0], null, [1, 0.92, 1]).done();
}
function clay() {
  const k = kit();
  const R = rng(17);
  for (let i = 0; i < 4; i++) k.add("rock", noisyRock(0.22, 30 + i, 1, 0.45), "#8c8a86", [R.range(-0.3, 0.3), 0.05, R.range(-0.3, 0.3)]);
  return k.done();
}
function driftwood() {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.8, 0.08, 0), new THREE.Vector3(0, 0.12, 0.15), new THREE.Vector3(0.8, 0.08, -0.05)]);
  return kit().add("wood", taperTube(curve, 6, 6, 0.1, 0.07), "#b9ad98").add("wood", new THREE.CylinderGeometry(0.03, 0.05, 0.5, 4), "#a89c88", [0.2, 0.14, 0.2], [0, 0, 1.2]).done();
}
function scrapPile() {
  const k = kit();
  k.add("metal", new THREE.BoxGeometry(0.5, 0.03, 0.3), "#8a5a3a", [0, 0.06, 0], [0.2, 0.4, 0.1]);
  k.add("metal", new THREE.BoxGeometry(0.35, 0.03, 0.25), "#7a6a5a", [0.1, 0.1, 0.12], [-0.3, 1.1, 0.2]);
  k.add("metal", new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), "#6e4a32", [-0.15, 0.06, -0.1], [0, 0.4, Math.PI / 2]);
  return k.done();
}
function crate() {
  const k = kit();
  k.add("wood", new THREE.BoxGeometry(0.8, 0.62, 0.62), "#b08a5a", [0, 0.31, 0]);
  for (const s of [-1, 1]) {
    k.add("wood", new THREE.BoxGeometry(0.84, 0.08, 0.66), "#8a6a42", [0, 0.31 + s * 0.22, 0]);
    k.add("metal", new THREE.BoxGeometry(0.06, 0.66, 0.66), "#5a5550", [s * 0.36, 0.31, 0]);
  }
  k.add("wood", new THREE.BoxGeometry(0.06, 0.6, 0.82), "#8a6a42", [0, 0.31, 0], [0.75, 0, 0]);
  return k.done();
}
function barrel() {
  const k = kit();
  k.add("plastic", new THREE.CylinderGeometry(0.3, 0.3, 0.86, 16), (c, x, y) => (Math.abs(Math.abs(y) - 0.28) < 0.04 ? c.setRGB(0.75, 0.75, 0.78) : c.setRGB(1, 1, 1)), [0, 0, 0], [0, 0, Math.PI / 2]);
  return k.done();
}
function page() {
  const k = kit();
  k.add("rock", noisyRock(0.12, 4, 1, 0.6), "#8a867e", [0.08, 0.06, 0.05]);
  const g = new THREE.PlaneGeometry(0.34, 0.42);
  return [...k.done(), [prep(g, "#ffffff", [0, 0.025, 0], [-Math.PI / 2, 0, 0.3]), "paper"]];
}
function arch(seed) {
  const R = rng(seed);
  const k = kit();
  for (const s of [-1.5, 1.5]) {
    let y = 0;
    for (let b = 0; b < 5; b++) {
      const h = R.range(0.55, 0.75);
      k.add("rock", noisyRock(0.55, seed + b * 3 + s * 10, 1, 0.6), "#a9a294", [R.range(-0.08, 0.08), y + h / 2, s + R.range(-0.08, 0.08)], [0, R() * 3, 0], [1, h * 1.4, 1]);
      y += h;
    }
  }
  k.add("rock", new THREE.BoxGeometry(0.8, 0.55, 4.2), "#9d978a", [0, 3.4, 0], [0, 0, 0.04]);
  k.add("rock", noisyRock(0.5, seed + 99, 1, 0.6), "#a9a294", [0, 3.85, -0.6]);
  return k.done();
}
function cave(seed) {
  const k = kit();
  CAVE_ROCKS.forEach(([lx, lz, r], i) => {
    k.add("rock", noisyRock(r, seed + i, 2, 1.25), (c, x, y) => c.setRGB(0.48 + y * 0.03, 0.47 + y * 0.03, 0.46 + y * 0.03), [lx, r * 0.8, lz]);
  });
  // roof slab
  k.add("rock", noisyRock(3.2, seed + 50, 2, 0.32), "#5d5a56", [-0.2, 3.7, 0], null, [1.1, 1, 1.15]);
  // moss & a lantern-like glow stone inside
  k.add("plain", new THREE.IcosahedronGeometry(0.16, 1), "#ffd27a", [-0.9, 0.15, 0.4]);
  return k.done();
}
function shrine(seed) {
  const R = rng(seed);
  const k = kit();
  k.add("rock", new THREE.BoxGeometry(4.0, 0.42, 4.0), (c, x, y) => c.setRGB(0.5, 0.52 + (y > 0.1 ? 0.05 : 0), 0.44), [0, 0.21, 0]);
  k.add("rock", new THREE.BoxGeometry(2.4, 0.2, 2.4), "#6f7562", [0, 0.5, 0]);
  [
    [-1.6, -1.6],
    [1.6, -1.6],
    [-1.6, 1.6],
    [1.6, 1.6],
  ].forEach(([x, z], i) => {
    const h = i === 3 ? 1.4 : R.range(2.6, 3.1);
    k.add("rock", new THREE.CylinderGeometry(0.26, 0.32, h, 8), (c, px, py) => c.setRGB(0.55, 0.57 + Math.sin(py * 3) * 0.04, 0.48), [x, 0.4 + h / 2, z]);
    k.add("rock", new THREE.BoxGeometry(0.75, 0.22, 0.75), "#61685a", [x, 0.42 + h, z]);
    k.add("plain", new THREE.IcosahedronGeometry(0.28, 1), "#3e6e2a", [x + 0.15, 0.42 + h * 0.6, z + 0.2], null, [1, 1.6, 0.6]);
  });
  k.add("rock", new THREE.BoxGeometry(4.0, 0.35, 0.6), "#5f6658", [0, 3.4, -1.6], [0, 0, 0.05]);
  // idol
  k.add("rock", new THREE.BoxGeometry(0.5, 0.9, 0.4), "#7d8270", [0, 1.05, -0.9]);
  k.add("rock", new THREE.SphereGeometry(0.32, 10, 8), "#7d8270", [0, 1.75, -0.9], null, [1, 1.15, 0.9]);
  k.add("plain", new THREE.BoxGeometry(0.08, 0.05, 0.02), "#ffcf6a", [-0.1, 1.82, -0.62]);
  k.add("plain", new THREE.BoxGeometry(0.08, 0.05, 0.02), "#ffcf6a", [0.1, 1.82, -0.62]);
  return k.done();
}
function wreck() {
  const k = kit();
  // half a hull from planks (lathe half-shell), tilted into the sand
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.15 + Math.sin(t * Math.PI) * 1.25, t * 6 - 3));
  }
  const hull = new THREE.LatheGeometry(pts, 14, Math.PI * 0.5, Math.PI);
  k.add("wood", hull, (c, x, y) => {
    const band = Math.floor((y + 3) * 2.2) % 2;
    c.setRGB(band ? 0.55 : 0.48, band ? 0.42 : 0.36, band ? 0.3 : 0.26);
  }, [0, 0.35, 0], [Math.PI / 2, 0, 0.35], [1, 1, 0.8]);
  k.add("wood", new THREE.CylinderGeometry(0.1, 0.13, 4, 7), "#5a4632", [0.4, 1.6, 0.5], [0.3, 0, 0.9]);
  for (let r = 0; r < 5; r++) k.add("wood", new THREE.BoxGeometry(0.12, 0.1, 2.2), "#6a5038", [r * 1.1 - 2.2, 0.75, 0], [0, 0, 0.4]);
  return k.done();
}
function coral(seed) {
  const R = rng(seed);
  const k = kit();
  const palette = ["#ff7a8a", "#ff9f43", "#c56cf0", "#ffd166", "#4ecdc4", "#f78fb3"];
  const kind = Math.floor(R() * 3);
  const c0 = palette[Math.floor(R() * palette.length)];
  if (kind === 0) {
    // branching
    for (let b = 0; b < 9; b++) {
      const a = R() * Math.PI * 2;
      const h = R.range(0.5, 1.2);
      k.add("plain", new THREE.CylinderGeometry(0.04, 0.08, h, 5), c0, [Math.cos(a) * 0.2, h / 2, Math.sin(a) * 0.2], [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5]);
      k.add("plain", new THREE.SphereGeometry(0.07, 6, 5), "#fff1e6", [Math.cos(a) * (0.2 + h * 0.45), h * 0.95, Math.sin(a) * (0.2 + h * 0.45)]);
    }
  } else if (kind === 1) {
    k.add("rock", noisyRock(0.6, seed, 2, 0.7), (c, x, y, z) => c.set(c0).multiplyScalar(0.75 + 0.25 * Math.sin(x * 14 + z * 9)), [0, 0.3, 0]);
  } else {
    for (let f = 0; f < 3; f++) {
      const g = new THREE.CircleGeometry(0.7, 10, 0, Math.PI);
      k.add("plain", g, palette[(f + 2) % palette.length], [f * 0.25 - 0.25, 0.05, 0], [0, R() * 3, 0], [1, 1.2, 1]);
    }
  }
  // sea grass
  for (let g = 0; g < 4; g++) k.add("plain", new THREE.CylinderGeometry(0.01, 0.03, 0.9, 3), "#2f7a4a", [R.range(-0.6, 0.6), 0.45, R.range(-0.6, 0.6)], [R.range(-0.3, 0.3), 0, R.range(-0.3, 0.3)]);
  return k.done();
}

/* ------------------------------------------------------------------ floating debris */
function debrisPlank() {
  return kit().add("wood", new THREE.BoxGeometry(1.2, 0.08, 0.26), "#c9a77a").done();
}
function debrisPlastic() {
  const pts = [new THREE.Vector2(0.001, -0.17), new THREE.Vector2(0.09, -0.16), new THREE.Vector2(0.1, 0.05), new THREE.Vector2(0.05, 0.13), new THREE.Vector2(0.03, 0.2), new THREE.Vector2(0.001, 0.21)];
  const k = kit();
  k.add("plastic", new THREE.LatheGeometry(pts, 10), "#9fd6e8", [0, 0.03, 0], [0, 0, Math.PI / 2]);
  k.add("plastic", new THREE.BoxGeometry(0.34, 0.02, 0.26), "#e8e2d4", [0.12, 0.0, 0.18], [0.1, 0.5, 0.2]);
  return k.done();
}
function debrisLeaf() {
  return kit().add("leaf", frond(1.1, 0.3, 0.02, 3, 0.1), "#7b8e3e", [-0.5, 0.03, 0], [0, 0, 0]).done();
}
function debrisScrap() {
  return kit().add("metal", new THREE.BoxGeometry(0.5, 0.04, 0.34), "#8b6248", [0, 0.02, 0], [0.15, 0.3, 0.12]).add("metal", new THREE.CylinderGeometry(0.06, 0.06, 0.32, 6), "#5f5c58", [0.05, 0.06, 0.06], [0, 0, Math.PI / 2]).done();
}
function debrisBarrel() {
  return kit().add("plastic", new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), (c, x, y) => (Math.abs(Math.abs(y) - 0.3) < 0.04 ? c.set("#d8d4cc") : c.set("#2f77c4")), [0, 0.05, 0], [0, 0, Math.PI / 2]).done();
}
function debrisCargo() {
  return kit().add("wood", new THREE.BoxGeometry(0.75, 0.55, 0.6), "#a7814f", [0, 0.1, 0]).add("wood", new THREE.BoxGeometry(0.79, 0.07, 0.64), "#7a5c38", [0, 0.3, 0]).add("metal", new THREE.BoxGeometry(0.06, 0.59, 0.64), "#5a5550", [0.3, 0.1, 0]).done();
}

/* ------------------------------------------------------------------ raft parts */
const PL = 5;
function raftPlank() {
  return kit().add("wood", new THREE.BoxGeometry(CELL * 0.99, 0.08, (CELL / PL) * 0.9), "#ffffff", [0, -0.04, 0]).done();
}
function raftBeam() {
  return kit().add("wood", new THREE.BoxGeometry(0.14, 0.14, CELL * 0.98), "#8a7458", [0, -0.15, 0]).done();
}
function raftFloat() {
  return kit()
    .add("plastic", new THREE.CylinderGeometry(0.27, 0.27, CELL * 0.72, 14), (c, x, y) => (Math.abs(Math.abs(y) - 0.18) < 0.035 ? c.setRGB(0.8, 0.8, 0.82) : c.setRGB(1, 1, 1)), [0, -0.4, 0], [0, 0, Math.PI / 2])
    .done();
}
function raftRope() {
  return kit().add("plain", new THREE.TorusGeometry(0.09, 0.025, 5, 10), "#cdb98a", [0, -0.06, 0], [Math.PI / 2, 0, 0], [1, 1, 1.6]).done();
}
/** wall-like pieces are built along +x, centred on the edge, from y = 0 up */
function wallPlanks(k, h, x0 = -CELL / 2, x1 = CELL / 2, y0 = 0, n = 5) {
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const R = rng(i * 13 + Math.round(x0 * 10));
    k.add("wood", new THREE.BoxGeometry(w * 0.94, h * R.range(0.97, 1), 0.07), R() < 0.3 ? "#d7c09c" : "#f2e2c8", [x0 + w * (i + 0.5), y0 + h / 2, 0]);
  }
}
function wall() {
  const k = kit();
  wallPlanks(k, WALL_H - 0.04);
  k.add("wood", new THREE.BoxGeometry(CELL, 0.12, 0.1), "#9a8060", [0, 0.6, -0.07]);
  k.add("wood", new THREE.BoxGeometry(CELL, 0.12, 0.1), "#9a8060", [0, 1.85, -0.07]);
  k.add("wood", new THREE.BoxGeometry(0.12, WALL_H, 0.12), "#8a7050", [-CELL / 2 + 0.05, WALL_H / 2, 0]);
  return k.done();
}
function windowWall() {
  const k = kit();
  wallPlanks(k, 1.0);
  wallPlanks(k, 0.55, -CELL / 2, CELL / 2, WALL_H - 0.59);
  k.add("wood", new THREE.BoxGeometry(0.16, WALL_H, 0.12), "#8a7050", [-CELL / 2 + 0.08, WALL_H / 2, 0]);
  k.add("wood", new THREE.BoxGeometry(0.16, WALL_H, 0.12), "#8a7050", [CELL / 2 - 0.08, WALL_H / 2, 0]);
  k.add("wood", new THREE.BoxGeometry(CELL, 0.1, 0.18), "#9a8060", [0, 1.02, 0]);
  k.add("wood", new THREE.BoxGeometry(CELL, 0.1, 0.18), "#9a8060", [0, WALL_H - 0.6, 0]);
  k.add("wood", new THREE.BoxGeometry(0.06, 0.86, 0.06), "#8a7050", [0, 1.45, 0]);
  return k.done();
}
function doorFrame() {
  const k = kit();
  const side = (CELL - 0.96) / 2;
  wallPlanks(k, WALL_H - 0.04, -CELL / 2, -CELL / 2 + side, 0, 1);
  wallPlanks(k, WALL_H - 0.04, CELL / 2 - side, CELL / 2, 0, 1);
  wallPlanks(k, WALL_H - 2.14, -0.48, 0.48, 2.12, 3);
  k.add("wood", new THREE.BoxGeometry(0.1, 2.12, 0.14), "#7a6042", [-0.5, 1.06, 0]);
  k.add("wood", new THREE.BoxGeometry(0.1, 2.12, 0.14), "#7a6042", [0.5, 1.06, 0]);
  k.add("wood", new THREE.BoxGeometry(1.1, 0.12, 0.16), "#7a6042", [0, 2.12, 0]);
  return k.done();
}
function doorLeaf() {
  const k = kit();
  // hinge at local x = 0, leaf extends +x
  for (let i = 0; i < 4; i++) k.add("wood", new THREE.BoxGeometry(0.22, 2.04, 0.06), i % 2 ? "#d9c39f" : "#eedcc0", [0.13 + i * 0.235, 1.03, 0]);
  k.add("wood", new THREE.BoxGeometry(0.92, 0.1, 0.08), "#8a6a48", [0.48, 0.5, 0.04]);
  k.add("wood", new THREE.BoxGeometry(0.92, 0.1, 0.08), "#8a6a48", [0.48, 1.6, 0.04]);
  k.add("wood", new THREE.BoxGeometry(0.1, 1.2, 0.08), "#8a6a48", [0.48, 1.05, 0.04], [0, 0, 0.95]);
  k.add("metal", new THREE.SphereGeometry(0.04, 8, 6), "#4a4540", [0.82, 1.05, 0.08]);
  return k.done();
}
function railing() {
  const k = kit();
  for (const x of [-CELL / 2 + 0.06, 0, CELL / 2 - 0.06]) k.add("wood", new THREE.BoxGeometry(0.09, 1.0, 0.09), "#9a8060", [x, 0.5, 0]);
  k.add("wood", new THREE.BoxGeometry(CELL, 0.08, 0.1), "#d9c39f", [0, 0.95, 0]);
  k.add("wood", new THREE.BoxGeometry(CELL, 0.06, 0.08), "#d9c39f", [0, 0.5, 0]);
  for (const x of [-CELL / 2 + 0.06, CELL / 2 - 0.06]) k.add("plain", new THREE.TorusGeometry(0.07, 0.02, 4, 8), "#cdb98a", [x, 0.95, 0], [Math.PI / 2, 0, 0]);
  return k.done();
}
/** stairs rising toward +z over one cell */
function stairs() {
  const k = kit();
  const n = 7;
  for (let s = 0; s < n; s++) {
    const y = ((s + 1) / n) * WALL_H;
    const z = -CELL / 2 + ((s + 0.5) / n) * CELL;
    k.add("wood", new THREE.BoxGeometry(CELL * 0.86, 0.07, CELL / n + 0.04), "#e8d4b0", [0, y - 0.04, z]);
  }
  const L = Math.hypot(CELL, WALL_H);
  const ang = Math.atan2(WALL_H, CELL);
  for (const x of [-CELL * 0.45, CELL * 0.45]) k.add("wood", new THREE.BoxGeometry(0.08, 0.22, L), "#8a7050", [x, WALL_H / 2 - 0.08, 0], [-ang, 0, 0]);
  k.add("wood", new THREE.BoxGeometry(0.1, WALL_H, 0.1), "#8a7050", [CELL * 0.45, WALL_H / 2, CELL / 2 - 0.06]);
  k.add("wood", new THREE.BoxGeometry(0.1, WALL_H, 0.1), "#8a7050", [-CELL * 0.45, WALL_H / 2, CELL / 2 - 0.06]);
  return k.done();
}
function roof() {
  const k = kit();
  k.add("wood", new THREE.BoxGeometry(CELL * 0.99, 0.08, CELL * 0.99), "#e2cfa8", [0, WALL_H - 0.04, 0]);
  k.add("thatch", new THREE.BoxGeometry(CELL * 1.04, 0.07, CELL * 1.04), "#ffffff", [0, WALL_H - 0.12, 0]);
  for (const x of [-CELL / 2 + 0.07, CELL / 2 - 0.07]) k.add("wood", new THREE.BoxGeometry(0.12, 0.12, CELL), "#8a7050", [x, WALL_H - 0.17, 0]);
  return k.done();
}

/* stations (centred on the cell, facing +z) */
function chest() {
  const k = kit();
  k.add("wood", new THREE.BoxGeometry(1.0, 0.5, 0.6), "#a9824f", [0, 0.25, 0]);
  k.add("wood", new THREE.BoxGeometry(1.04, 0.18, 0.64), "#8f6a3c", [0, 0.6, 0]);
  for (const x of [-0.42, 0.42]) k.add("metal", new THREE.BoxGeometry(0.06, 0.72, 0.66), "#4e4a45", [x, 0.36, 0]);
  k.add("metal", new THREE.BoxGeometry(0.12, 0.14, 0.04), "#c9a24a", [0, 0.48, 0.33]);
  return k.done();
}
function purifier() {
  const k = kit();
  // fire pit
  for (let s = 0; s < 7; s++) {
    const a = (s / 7) * Math.PI * 2;
    k.add("rock", noisyRock(0.12, s, 1, 0.7), "#7d7a72", [Math.cos(a) * 0.32, 0.06, Math.sin(a) * 0.32]);
  }
  k.add("wood", new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5), "#4a3422", [0, 0.07, 0], [0, 0, Math.PI / 2 - 0.3]);
  k.add("wood", new THREE.CylinderGeometry(0.035, 0.035, 0.5, 5), "#4a3422", [0, 0.07, 0], [0.3, 0, Math.PI / 2]);
  // legs + pot + plastic dome
  for (let l = 0; l < 3; l++) {
    const a = (l / 3) * Math.PI * 2;
    k.add("wood", new THREE.CylinderGeometry(0.03, 0.03, 0.62, 5), "#7a6042", [Math.cos(a) * 0.32, 0.3, Math.sin(a) * 0.32]);
  }
  k.add("plastic", new THREE.CylinderGeometry(0.3, 0.25, 0.26, 14, 1, true), "#d9e6ea", [0, 0.68, 0]);
  k.add("plastic", new THREE.ConeGeometry(0.36, 0.3, 14, 1, true), "#bfe6f2", [0, 0.96, 0]);
  k.add("plastic", new THREE.CylinderGeometry(0.08, 0.07, 0.14, 10), "#f4f4f0", [0.42, 0.07, 0]);
  return k.done();
}
function purifier2() {
  const k = kit();
  k.add("metal", new THREE.CylinderGeometry(0.34, 0.36, 0.5, 16), "#9aa3a8", [0, 0.55, 0]);
  k.add("metal", new THREE.SphereGeometry(0.34, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), "#aab3b8", [0, 0.8, 0]);
  k.add("rock", new THREE.CylinderGeometry(0.42, 0.46, 0.3, 12), "#8a8580", [0, 0.15, 0]);
  k.add("plain", new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6), "#b0b85a", [0.32, 1.1, 0], [0, 0, -1.1]);
  k.add("plain", new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), "#b0b85a", [0.62, 0.92, 0]);
  k.add("plastic", new THREE.CylinderGeometry(0.13, 0.12, 0.3, 12), "#cfe9f3", [0.62, 0.45, 0]);
  return k.done();
}
function grill() {
  const k = kit();
  for (let s = 0; s < 9; s++) {
    const a = (s / 9) * Math.PI * 2;
    k.add("rock", noisyRock(0.16, s + 3, 1, 0.75), "#827e76", [Math.cos(a) * 0.42, 0.1, Math.sin(a) * 0.32]);
  }
  for (let l = 0; l < 4; l++) k.add("metal", new THREE.CylinderGeometry(0.02, 0.02, 0.58, 4), "#4f4b47", [(l % 2 ? 1 : -1) * 0.42, 0.3, (l < 2 ? 1 : -1) * 0.3]);
  for (let b = 0; b < 6; b++) k.add("metal", new THREE.CylinderGeometry(0.012, 0.012, 0.86, 4), "#3e3a36", [0, 0.58, -0.25 + b * 0.1], [0, 0, Math.PI / 2]);
  k.add("metal", new THREE.BoxGeometry(0.92, 0.03, 0.62), "#6b4a34", [0, 0.56, 0]);
  return k.done();
}
function grill2() {
  const k = kit();
  k.add("rock", new THREE.BoxGeometry(1.15, 0.45, 0.85), "#8b857c", [0, 0.22, 0]);
  k.add("metal", new THREE.BoxGeometry(1.05, 0.22, 0.75), "#4a4643", [0, 0.56, 0]);
  for (let b = 0; b < 8; b++) k.add("metal", new THREE.CylinderGeometry(0.012, 0.012, 1.0, 4), "#2f2c2a", [0, 0.68, -0.32 + b * 0.09], [0, 0, Math.PI / 2]);
  k.add("metal", new THREE.CylinderGeometry(0.08, 0.1, 0.9, 10), "#3e3a36", [0.45, 1.05, -0.3]);
  return k.done();
}
function smelter() {
  const k = kit();
  k.add("rock", new THREE.SphereGeometry(0.58, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), (c, x, y) => c.setRGB(0.62 - y * 0.05, 0.5 - y * 0.05, 0.42), [0, 0.34, 0], null, [1, 1.25, 1]);
  k.add("rock", new THREE.CylinderGeometry(0.62, 0.66, 0.36, 16), "#7a6656", [0, 0.18, 0]);
  k.add("rock", new THREE.CylinderGeometry(0.11, 0.15, 0.6, 10), "#6e5a4c", [0, 1.15, 0]);
  k.add("plain", new THREE.CircleGeometry(0.2, 12), "#1a0e08", [0, 0.42, 0.56], [0, 0, 0]);
  return k.done();
}
function sailMast() {
  const k = kit();
  k.add("wood", new THREE.CylinderGeometry(0.08, 0.11, 5.2, 9), "#8a6a46", [0, 2.6, 0]);
  k.add("wood", new THREE.CylinderGeometry(0.05, 0.05, 2.6, 7), "#8a6a46", [0, 4.7, 0.12], [0, 0, Math.PI / 2]);
  k.add("wood", new THREE.CylinderGeometry(0.045, 0.045, 2.4, 7), "#8a6a46", [0, 1.35, 0.12], [0, 0, Math.PI / 2]);
  k.add("wood", new THREE.BoxGeometry(0.5, 0.2, 0.5), "#6a5038", [0, 0.1, 0]);
  for (const s of [-1, 1]) k.add("plain", new THREE.CylinderGeometry(0.012, 0.012, 3.4, 3), "#d9c9a0", [s * 0.7, 2.8, -0.55], [0.38, 0, s * 0.25]);
  return k.done();
}
/** sail cloth: subdivided plane, billowed in the vertex positions by the view */
export function sailClothGeo() {
  return cached("sailCloth", () => {
    const g = new THREE.PlaneGeometry(2.4, 3.2, 8, 10);
    g.translate(0, 3.02, 0.14);
    return [[prep(g, "#ffffff"), "cloth"]];
  });
}
function anchor() {
  const k = kit();
  k.add("wood", new THREE.BoxGeometry(0.15, 0.9, 0.15), "#7a6042", [-0.38, 0.45, 0]);
  k.add("wood", new THREE.BoxGeometry(0.15, 0.9, 0.15), "#7a6042", [0.38, 0.45, 0]);
  k.add("wood", new THREE.CylinderGeometry(0.17, 0.17, 0.62, 12), "#9a7a52", [0, 0.68, 0], [0, 0, Math.PI / 2]);
  k.add("plain", new THREE.TorusGeometry(0.17, 0.04, 6, 14), "#d6c08c", [0, 0.68, 0], [0, Math.PI / 2, 0]);
  k.add("metal", new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), "#4a4540", [0.42, 0.68, 0], [0, 0, Math.PI / 2]);
  return k.done();
}
export function anchorStoneGeo() {
  return cached("anchorStone", () =>
    kit()
      .add("rock", noisyRock(0.28, 9, 1, 0.8), "#7d7972", [0, 0, 0])
      .add("plain", new THREE.CylinderGeometry(0.018, 0.018, 1, 4), "#d6c08c", [0, 0.5, 0])
      .done(),
  );
}
/** collection net: local +z points away from the raft */
function net() {
  const k = kit();
  for (const x of [-CELL / 2 + 0.08, CELL / 2 - 0.08]) {
    k.add("wood", new THREE.BoxGeometry(0.1, 1.3, 0.1), "#7a6042", [x, -0.25, 0.08]);
    k.add("wood", new THREE.BoxGeometry(0.08, 0.08, 1.0), "#7a6042", [x, 0.25, 0.55]);
  }
  k.add("wood", new THREE.BoxGeometry(CELL, 0.08, 0.08), "#7a6042", [0, 0.25, 1.05]);
  const g = new THREE.PlaneGeometry(CELL - 0.15, 1.2, 4, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -0.18 * Math.cos((p.getX(i) / CELL) * Math.PI));
  g.computeVertexNormals();
  k.add("net", g, "#ffffff", [0, -0.3, 0.6], [-1.15, 0, 0]);
  return k.done();
}
function trap() {
  const k = kit();
  k.add("wood", new THREE.BoxGeometry(0.1, 0.9, 0.1), "#7a6042", [0, -0.1, 0.1]);
  for (const y of [-0.5, 0.1]) k.add("wood", new THREE.BoxGeometry(1.1, 0.06, 0.06), "#7a6042", [0, y, 0.55]);
  for (const x of [-0.53, 0.53]) k.add("wood", new THREE.BoxGeometry(0.06, 0.66, 0.06), "#7a6042", [x, -0.2, 0.55]);
  for (const [w, h, pos, rot] of [
    [1.06, 0.6, [0, -0.2, 0.84], [0, 0, 0]],
    [1.06, 0.6, [0, -0.2, 0.26], [0, 0, 0]],
    [0.58, 0.6, [0.53, -0.2, 0.55], [0, Math.PI / 2, 0]],
    [0.58, 0.6, [-0.53, -0.2, 0.55], [0, Math.PI / 2, 0]],
  ])
    k.add("net", new THREE.PlaneGeometry(w, h), "#ffffff", pos, rot);
  k.add("plain", new THREE.TorusGeometry(0.06, 0.02, 4, 8), "#cdb98a", [0, 0.25, 0.1], [Math.PI / 2, 0, 0]);
  return k.done();
}

/* ------------------------------------------------------------------ creatures */
export function sharkParts() {
  return cached("shark", () => {
    const k = kit();
    // body along +z (nose at +z), lathe profile bottom (tail) → top (nose)
    const prof = [
      [0.0, 0.03],
      [0.25, 0.1],
      [0.7, 0.24],
      [1.3, 0.38],
      [1.9, 0.43],
      [2.4, 0.38],
      [2.75, 0.28],
      [3.0, 0.15],
      [3.12, 0.04],
    ].map(([y, r]) => new THREE.Vector2(r, y - 1.6));
    const body = new THREE.LatheGeometry(prof, 18);
    k.add(
      "plain",
      body,
      (c, x, y, z, nx, ny, nz) => {
        // after rotation +y lathe axis → +z; colour by the side facing down
        const down = -nz;
        void down;
        c.setRGB(0, 0, 0);
      },
      [0, 0, 0],
      [Math.PI / 2, 0, 0],
      [0.82, 1, 1],
    );
    // recolour by final normal (belly white, back slate blue)
    const parts = k.done();
    const g = parts[0][0];
    const n = g.attributes.normal;
    const cc = g.attributes.color;
    for (let i = 0; i < n.count; i++) {
      const ny = n.getY(i);
      const t = THREE.MathUtils.smoothstep(ny, -0.35, 0.1);
      cc.setXYZ(i, 0.92 + (0.36 - 0.92) * t, 0.93 + (0.45 - 0.93) * t, 0.92 + (0.55 - 0.92) * t);
    }
    const f = kit();
    const tri = (pts, depth = 0.05) => {
      const s = new THREE.Shape();
      s.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
      s.closePath();
      const e = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
      e.translate(0, 0, -depth / 2);
      return e;
    };
    // dorsal fin (in the y-z plane)
    f.add("plain", tri([[0, 0], [0.75, 0], [-0.15, 0.78], [0.05, 0.4]]), "#5a6f84", [0, 0.32, 0.25], [0, -Math.PI / 2, 0]);
    // tail: vertical crescent at the tail end
    f.add("plain", tri([[0, 0], [-0.25, 0.9], [-0.05, 0.85], [0.1, 0.1], [0.05, -0.1], [-0.15, -0.55], [0.1, -0.5]]), "#5a6f84", [0, 0, -1.55], [0, -Math.PI / 2, 0]);
    // pectoral fins
    for (const s of [-1, 1]) f.add("plain", tri([[0, 0], [0.6, -0.1], [0.05, 0.38]], 0.03), "#5a6f84", [s * 0.3, -0.18, 0.55], [Math.PI / 2, 0, s * -0.5 + (s > 0 ? Math.PI : 0)]);
    // small second dorsal + anal fins
    f.add("plain", tri([[0, 0], [0.22, 0], [-0.05, 0.2]]), "#5a6f84", [0, 0.16, -0.95], [0, -Math.PI / 2, 0]);
    // eyes + gills
    for (const s of [-1, 1]) {
      f.add("plain", new THREE.SphereGeometry(0.045, 8, 6), "#0b0d10", [s * 0.2, 0.08, 1.15]);
      for (let gi = 0; gi < 4; gi++) f.add("plain", new THREE.BoxGeometry(0.01, 0.18, 0.015), "#3d4a58", [s * 0.33, 0.0, 0.85 - gi * 0.07], [0, 0, s * 0.2]);
    }
    return [...parts, ...f.done().map(([g2]) => [g2, "plain"])];
  });
}
export function fishGeo() {
  return cached("fish", () => {
    const prof = [
      [0.0, 0.01],
      [0.08, 0.05],
      [0.2, 0.075],
      [0.3, 0.05],
      [0.36, 0.01],
    ].map(([y, r]) => new THREE.Vector2(r, y - 0.18));
    const k = kit();
    k.add("plain", new THREE.LatheGeometry(prof, 8), (c, x, y) => c.setRGB(0.8 + y, 0.85 + y, 0.95), [0, 0, 0], [Math.PI / 2, 0, 0], [0.55, 1, 1]);
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(-0.1, 0.08);
    s.lineTo(-0.1, -0.08);
    s.closePath();
    k.add("plain", new THREE.ShapeGeometry(s), "#c9d6e6", [0, 0, -0.17], [0, Math.PI / 2, 0]);
    return k.done();
  });
}
export function gullParts() {
  return cached("gull", () => {
    const body = kit()
      .add("plain", new THREE.SphereGeometry(0.16, 10, 8), "#f4f4f2", [0, 0, 0], null, [0.8, 0.75, 1.9])
      .add("plain", new THREE.SphereGeometry(0.1, 8, 6), "#ffffff", [0, 0.07, 0.3])
      .add("plain", new THREE.ConeGeometry(0.03, 0.12, 5), "#f2b23c", [0, 0.06, 0.43], [Math.PI / 2, 0, 0])
      .add("plain", new THREE.BoxGeometry(0.16, 0.03, 0.18), "#3d4248", [0, 0.02, -0.32])
      .done();
    const wing = kit()
      .add("plain", new THREE.BoxGeometry(0.62, 0.025, 0.24), (c, x) => (x > 0.22 ? c.set("#2f343a") : c.set("#d9dde2")), [0.31, 0, 0])
      .done();
    return { body, wing };
  });
}
export function crabParts() {
  return cached("crab", () => {
    const k = kit();
    k.add("plain", new THREE.SphereGeometry(0.16, 10, 6), "#d9532c", [0, 0.1, 0], null, [1.2, 0.5, 0.9]);
    for (const s of [-1, 1]) {
      for (let l = 0; l < 3; l++) k.add("plain", new THREE.BoxGeometry(0.2, 0.025, 0.025), "#c2461f", [s * 0.2, 0.06, -0.08 + l * 0.08], [0, 0, s * -0.5]);
      k.add("plain", new THREE.SphereGeometry(0.06, 8, 6), "#e2643a", [s * 0.16, 0.1, 0.18], null, [1, 0.7, 1.3]);
      k.add("plain", new THREE.SphereGeometry(0.02, 6, 4), "#111111", [s * 0.05, 0.17, 0.12]);
    }
    return k.done();
  });
}

/* ------------------------------------------------------------------ first-person tools (local: grip at origin, tool points -z) */
function toolHook() {
  const k = kit();
  k.add("plastic", new THREE.CylinderGeometry(0.024, 0.027, 0.36, 10), "#2b7fd0", [0, 0, 0.02], [Math.PI / 2, 0, 0]);
  k.add("plain", new THREE.TorusGeometry(0.028, 0.011, 6, 12), "#d6c08c", [0, 0, 0.17], [0, 0, 0]);
  k.add("metal", new THREE.CylinderGeometry(0.011, 0.011, 0.14, 6), "#9aa0a6", [0, 0, -0.22], [Math.PI / 2, 0, 0]);
  // three grapple prongs curling back from the tip
  for (let p = 0; p < 3; p++) {
    const a = (p / 3) * Math.PI * 2;
    const prong = new THREE.TorusGeometry(0.045, 0.008, 4, 10, Math.PI * 0.75);
    prong.rotateZ(-Math.PI * 0.15);
    prong.rotateY(Math.PI / 2);
    prong.translate(0, 0.045, 0);
    prong.rotateZ(a);
    k.add("metal", prong, "#c4cad0", [0, 0, -0.3]);
  }
  return k.done();
}
function toolAxe() {
  const k = kit();
  k.add("wood", new THREE.CylinderGeometry(0.022, 0.028, 0.62, 8), "#8a6440", [0, 0, -0.12], [Math.PI / 2, 0, 0]);
  k.add("rock", noisyRock(0.11, 21, 1, 0.45), "#8b8780", [0, 0.08, -0.38], [0, 0, Math.PI / 2], [1.5, 1, 0.7]);
  k.add("plain", new THREE.TorusGeometry(0.035, 0.012, 4, 8), "#d6c08c", [0, 0.01, -0.36], [0, 0, 0]);
  k.add("plain", new THREE.TorusGeometry(0.035, 0.012, 4, 8), "#d6c08c", [0, 0.01, -0.32], [0, 0, 0]);
  return k.done();
}
function toolRod() {
  const k = kit();
  k.add("wood", new THREE.CylinderGeometry(0.008, 0.022, 1.5, 6), "#9a7a4e", [0, 0, -0.68], [Math.PI / 2, 0, 0]);
  k.add("plastic", new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), "#e0e3e6", [0.04, -0.03, -0.05], [0, 0, Math.PI / 2]);
  k.add("metal", new THREE.CylinderGeometry(0.008, 0.008, 0.06, 4), "#555", [0.07, -0.03, -0.05], [0, 0, Math.PI / 2]);
  return k.done();
}
function toolSpear() {
  const k = kit();
  k.add("wood", new THREE.CylinderGeometry(0.02, 0.024, 1.7, 7), "#a07c50", [0, 0, -0.45], [Math.PI / 2, 0, 0]);
  k.add("metal", new THREE.ConeGeometry(0.045, 0.24, 4), "#a9aeb2", [0, 0, -1.4], [-Math.PI / 2, 0, 0], [1, 1, 0.4]);
  k.add("plain", new THREE.CylinderGeometry(0.03, 0.03, 0.08, 6), "#d6c08c", [0, 0, -1.26], [Math.PI / 2, 0, 0]);
  return k.done();
}
function toolHammer() {
  const k = kit();
  k.add("wood", new THREE.CylinderGeometry(0.022, 0.026, 0.42, 8), "#8a6440", [0, 0, -0.06], [Math.PI / 2, 0, 0]);
  k.add("rock", new THREE.BoxGeometry(0.16, 0.08, 0.08), "#8b8780", [0, 0.02, -0.28]);
  k.add("plain", new THREE.TorusGeometry(0.03, 0.01, 4, 8), "#d6c08c", [0, 0, -0.24], [0, 0, 0]);
  return k.done();
}
function toolCup() {
  const pts = [new THREE.Vector2(0.001, -0.07), new THREE.Vector2(0.05, -0.07), new THREE.Vector2(0.062, 0.07), new THREE.Vector2(0.058, 0.072)];
  return kit().add("plastic", new THREE.LatheGeometry(pts, 14), "#e9eef0", [0, 0.02, -0.05]).done();
}
function foodModel(id) {
  const k = kit();
  if (id === "fish_raw" || id === "fish_cooked") {
    const c = id === "fish_raw" ? "#b9c7d6" : "#a0662e";
    k.add("plain", new THREE.SphereGeometry(0.06, 10, 8), c, [0, 0, -0.08], null, [0.6, 1, 2.6]);
    k.add("plain", new THREE.ConeGeometry(0.05, 0.08, 4), c, [0, 0, 0.1], [-Math.PI / 2, 0, 0], [1, 1, 0.3]);
  } else if (id === "coconut") k.add("plain", new THREE.SphereGeometry(0.09, 10, 8), "#6b4e2c", [0, 0.02, -0.06]);
  else if (id === "mango") k.add("plain", new THREE.SphereGeometry(0.07, 10, 8), "#f2a530", [0, 0.02, -0.06], null, [0.85, 1.2, 0.85]);
  else if (id === "bandage") k.add("plain", new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), "#9bb062", [0, 0, -0.05], [0, 0, Math.PI / 2]);
  else k.add("plain", new THREE.BoxGeometry(0.12, 0.05, 0.16), id === "shark_raw" ? "#c86a6a" : "#8a4e26", [0, 0, -0.06]);
  return k.done();
}
function arm() {
  // a fist wrapped around a handle that runs along the local z axis
  const k = kit();
  const skin = "#e7b48c";
  const skinD = "#d49a70";
  k.add("skin", new THREE.SphereGeometry(0.042, 14, 10), skin, [0.012, -0.004, 0.0], null, [0.95, 0.85, 1.25]);
  for (let f = 0; f < 4; f++) {
    // curled fingers in front of the grip
    const z = -0.03 + f * 0.022;
    const g = new THREE.TorusGeometry(0.022, 0.0115, 6, 10, Math.PI * 1.15);
    k.add("skin", g, f % 2 ? skin : skinD, [-0.006, 0.0, z], [0, Math.PI / 2, Math.PI * 0.95]);
  }
  k.add("skin", new THREE.CapsuleGeometry(0.012, 0.035, 4, 8), skin, [-0.028, 0.026, -0.012], [0.4, 0, -0.9]);
  // wrist + sleeve going back toward the camera's lower right
  k.add("skin", new THREE.CylinderGeometry(0.03, 0.034, 0.1, 12), skin, [0.02, -0.012, 0.075], [Math.PI / 2, 0, 0]);
  k.add("plain", new THREE.CylinderGeometry(0.044, 0.05, 0.36, 12), "#3d6f99", [0.02, -0.012, 0.3], [Math.PI / 2, 0, 0]);
  k.add("plain", new THREE.TorusGeometry(0.045, 0.012, 6, 14), "#2c5476", [0.02, -0.012, 0.125]);
  return k.done();
}

const BUILDERS = {
  rock: () => rock(3),
  rock2: () => rock(8),
  boulder: () => boulder(5),
  stone,
  coconut: coconutPickup,
  clay,
  driftwood,
  scrap: scrapPile,
  crate,
  page,
  barrel,
  bush: () => bush(4),
  vine: () => vineNode(6),
  tuft: () => tuft(1),
  fern: () => fern(9),
  bamboo: () => bamboo(12),
  bamboo2: () => bamboo(19),
  jtree0: () => jungleTree(31),
  jtree1: () => jungleTree(47),
  jtree2: () => jungleTree(53),
  mango: () => mangoTree(61, false),
  mangoFruit: () => mangoTree(61, true),
  arch: () => arch(71),
  cave: () => cave(81),
  shrine: () => shrine(91),
  wreck,
  coral0: () => coral(101),
  coral1: () => coral(111),
  coral2: () => coral(127),
  coral3: () => coral(131),
  d_plank: debrisPlank,
  d_plastic: debrisPlastic,
  d_leaf: debrisLeaf,
  d_scrap: debrisScrap,
  d_barrel: debrisBarrel,
  d_cargo: debrisCargo,
  r_plank: raftPlank,
  r_beam: raftBeam,
  r_float: raftFloat,
  r_rope: raftRope,
  wall,
  window: windowWall,
  doorFrame,
  doorLeaf,
  railing,
  stairs,
  roof,
  chest,
  purifier,
  purifier2,
  grill,
  grill2,
  smelter,
  sail: sailMast,
  anchor,
  net,
  trap,
  t_hook: toolHook,
  t_axe: toolAxe,
  t_rod: toolRod,
  t_spear: toolSpear,
  t_hammer: toolHammer,
  t_cup: toolCup,
  f_fish_raw: () => foodModel("fish_raw"),
  f_fish_cooked: () => foodModel("fish_cooked"),
  f_coconut: () => foodModel("coconut"),
  f_mango: () => foodModel("mango"),
  f_shark_raw: () => foodModel("shark_raw"),
  f_shark_cooked: () => foodModel("shark_cooked"),
  f_bandage: () => foodModel("bandage"),
  arm,
};
for (let v = 0; v < PALM_VARIANTS; v++) BUILDERS[`palm${v}`] = () => palm(200 + v * 17);
export const RAFT_PLANKS = PL;
export function geoParts(key) {
  return BUILDERS[key] ? cached(key, BUILDERS[key]) : null;
}
