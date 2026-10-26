/**
 * Metro Rush — the city around the track.
 *
 * Scenery is a ring of SEG-long slots that recycle as the runner moves.
 * Each city has a few pre-merged "variants" (one vertex-coloured solid mesh
 * + one unlit glow mesh for lit windows / neon / lamps), so a slot costs two
 * draw calls and recycling only swaps geometry references. Variants are
 * built lazily, one per frame, so switching city never stalls a run.
 *
 * Also here: sky dome, ground + track (rails, sleepers, gravel), far
 * backdrop, sea (Coastal) and weather particles.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { LW } from "../engine/config.js";
import { noiseTexture, track } from "./materials.js";

export const SEG = 40;
const VARIANTS = 5;

/* ------------------------------------------------------------------ geometry kit */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const tmpC = new THREE.Color();
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const v3 = new THREE.Vector3();
const s3 = new THREE.Vector3();

class Kit {
  constructor() {
    this.solid = [];
    this.glow = [];
  }
  add(list, g, color, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const c = g.index ? g.toNonIndexed() : g.clone();
    if (g.index) g.dispose();
    m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s3.set(sx, sy, sz));
    c.applyMatrix4(m4);
    if (c.attributes.uv) c.deleteAttribute("uv");
    const n = c.attributes.position.count;
    const col = new Float32Array(n * 3);
    tmpC.set(color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = tmpC.r;
      col[i * 3 + 1] = tmpC.g;
      col[i * 3 + 2] = tmpC.b;
    }
    c.setAttribute("color", new THREE.BufferAttribute(col, 3));
    list.push(c);
  }
  box(color, w, h, d, x, y, z, ry = 0, glow = false) {
    this.add(glow ? this.glow : this.solid, new THREE.BoxGeometry(w, h, d), color, x, y, z, 0, ry);
  }
  cyl(color, rt, rb, h, x, y, z, seg = 8, glow = false, rx = 0, rz = 0) {
    this.add(glow ? this.glow : this.solid, new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, 0, rz);
  }
  cone(color, r, h, x, y, z, seg = 8) {
    this.add(this.solid, new THREE.ConeGeometry(r, h, seg), color, x, y, z);
  }
  ball(color, r, x, y, z, sx = 1, sy = 1, sz = 1, detail = 1, glow = false) {
    this.add(glow ? this.glow : this.solid, new THREE.IcosahedronGeometry(r, detail), color, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  quad(color, w, h, x, y, z, ry, glow) {
    this.add(glow ? this.glow : this.solid, new THREE.PlaneGeometry(w, h), color, x, y, z, 0, ry);
  }
  prism(color, w, h, d, x, y, z, ry = 0) {
    // gable roof: triangle (w × h) extruded d along z
    const s = new THREE.Shape();
    s.moveTo(-w / 2, 0);
    s.lineTo(w / 2, 0);
    s.lineTo(0, h);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    this.add(this.solid, g, color, x, y, z, 0, ry);
  }
  finish() {
    const solid = this.solid.length ? mergeGeometries(this.solid) : null;
    const glow = this.glow.length ? mergeGeometries(this.glow) : null;
    for (const g of [...this.solid, ...this.glow]) g.dispose();
    return { solid, glow };
  }
}

/* ------------------------------------------------------------------ city styles */
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

/** window grid on the face of a building that looks at the track */
function windows(K, th, r, side, xFace, zc, w, h, y0 = 1.5, opts = {}) {
  const colW = opts.colW || 2.3;
  const rowH = opts.rowH || 3.1;
  const cols = Math.max(1, Math.floor((w - 1) / colW));
  const rows = Math.max(1, Math.floor((h - y0 - 1) / rowH));
  const ry = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const lit = opts.lit ?? th.litRatio;
  const litCols = opts.litColors || [th.windowsLit];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const z = zc - w / 2 + (i + 0.5) * (w / cols);
      const y = y0 + (j + 0.5) * rowH;
      const on = r() < lit;
      K.quad(on ? pick(r, litCols) : th.windows, opts.ww || 1.3, opts.wh || 1.7, xFace + side * -0.03, y, z, ry, on);
    }
  }
}

function lamp(K, th, side, z, warm) {
  const x = side * 5.5;
  K.cyl("#3a3f48", 0.08, 0.11, 5.6, x, 2.8, z, 6);
  K.box("#3a3f48", 1.2, 0.1, 0.12, x - side * 0.55, 5.55, z);
  K.box(warm || th.windowsLit, 0.5, 0.12, 0.3, x - side * 1.05, 5.46, z, 0, true);
}

function tree(K, th, r, x, z, scale = 1) {
  K.cyl("#6b4a32", 0.12 * scale, 0.16 * scale, 2.2 * scale, x, 1.1 * scale, z, 6);
  const f = th.foliage;
  K.ball(pick(r, f), 1.2 * scale, x, 2.9 * scale, z, 1, 0.9, 1, 1);
  K.ball(pick(r, f), 0.85 * scale, x + 0.5 * scale, 3.5 * scale, z - 0.3 * scale, 1, 1, 1, 1);
}

function palm(K, th, r, x, z) {
  const h = 6 + r() * 3;
  const lean = (r() - 0.5) * 0.25;
  const segs = 5;
  for (let i = 0; i < segs; i++) K.cyl(i % 2 ? "#8a6a48" : "#9c7a54", 0.17 - i * 0.015, 0.2 - i * 0.015, h / segs + 0.05, x + lean * i, (h / segs) * (i + 0.5), z, 7, false, 0, -lean * 0.6);
  const tx = x + lean * segs;
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    K.add(K.solid, new THREE.BoxGeometry(0.5, 0.06, 2.6), pick(r, th.foliage), tx + Math.cos(a) * 1.1, h - 0.25, z + Math.sin(a) * 1.1, -0.45, -a + Math.PI / 2, 0);
  }
  K.ball("#6b4a2a", 0.28, tx, h - 0.1, z);
}

function pine(K, th, r, x, z, scale = 1) {
  K.cyl("#5a3e2a", 0.14 * scale, 0.18 * scale, 1.4 * scale, x, 0.7 * scale, z, 6);
  const g = pick(r, th.foliage);
  for (let i = 0; i < 3; i++) {
    const y = (1.4 + i * 1.25) * scale;
    const rad = (1.6 - i * 0.42) * scale;
    K.cone(g, rad, 1.9 * scale, x, y + 0.9 * scale, z, 8);
    if (th.snow) K.cone(th.snow, rad * 0.62, 0.7 * scale, x, y + 1.55 * scale, z, 8);
  }
}

function cactus(K, r, x, z) {
  const g = "#4f8a3a";
  const h = 2.4 + r() * 1.8;
  K.cyl(g, 0.28, 0.32, h, x, h / 2, z, 8);
  K.ball(g, 0.29, x, h, z, 1, 0.8, 1);
  for (const s of [-1, 1]) {
    if (r() < 0.25) continue;
    const ay = h * (0.4 + r() * 0.25);
    K.cyl(g, 0.17, 0.17, 0.7, x + s * 0.45, ay, z, 7, false, 0, Math.PI / 2);
    K.cyl(g, 0.17, 0.17, 1.1, x + s * 0.8, ay + 0.5, z, 7);
    K.ball(g, 0.17, x + s * 0.8, ay + 1.05, z);
  }
}

function catenary(K, z) {
  // high enough to clear the chase camera while riding train roofs
  for (const s of [-1, 1]) K.cyl("#59606b", 0.1, 0.13, 8.6, s * 5.0, 4.3, z, 6);
  K.box("#59606b", 10.2, 0.16, 0.16, 0, 8.4, z);
  for (let l = 0; l < 3; l++) K.box("#2a2e35", 0.03, 0.03, SEG, (l - 1) * LW, 8.0, z);
}

function buildingRow(K, th, r, side, make) {
  let z = -r() * 4;
  while (z > -SEG) {
    const w = 8 + r() * 7;
    const zc = z - w / 2;
    if (zc - w / 2 < -SEG - 4) break;
    make(zc, w);
    z -= w + 1 + r() * 2.5;
  }
}

function styleMetro(K, th, r) {
  for (const side of [-1, 1]) {
    K.box(th.sideStripe, 4.2, 0.16, SEG, side * 7.0, 0.08, -SEG / 2);
    buildingRow(K, th, r, side, (zc, w) => {
      const d = 10 + r() * 8;
      const tall = r() < 0.3;
      const h = tall ? 30 + r() * 26 : 11 + r() * 18;
      const x = side * (9.5 + d / 2);
      const col = pick(r, th.buildings);
      K.box(col, d, h, w, x, h / 2, zc);
      K.box(th.trim, d + 0.4, 0.5, w + 0.4, x, h + 0.25, zc);
      K.box("#3a3f48", d * 0.98, 1.2, w * 0.98, x, 0.6, zc);
      windows(K, th, r, side, side * 9.5, zc, w, h, 2.2);
      if (tall && r() < 0.6) K.cyl("#c9d0d8", 0.06, 0.06, 5, x, h + 2.5, zc, 4);
      if (r() < 0.5) K.box("#9aa3ad", 2.4, 1.2, 2.2, x + (r() - 0.5) * d * 0.5, h + 0.6, zc + (r() - 0.5) * w * 0.4);
      // street-level shop awning
      if (r() < 0.6) K.box(pick(r, ["#ff7a1a", "#2fb0ff", "#2fa84f", "#e8323a"]), 1.4, 0.2, w * 0.7, side * 9.0, 3.0, zc);
    });
    for (let z = -6 - r() * 4; z > -SEG; z -= 12 + r() * 6) tree(K, th, r, side * 7.6, z, 0.9 + r() * 0.3);
    lamp(K, th, side, -20 + side * 10);
  }
  catenary(K, -SEG / 2);
}

function styleNeon(K, th, r) {
  const neon = th.neon;
  for (const side of [-1, 1]) {
    K.box("#14121d", 4.2, 0.16, SEG, side * 7.0, 0.08, -SEG / 2);
    K.box(pick(r, neon), 0.08, 0.06, SEG, side * 4.95, 0.2, -SEG / 2, 0, true);
    buildingRow(K, th, r, side, (zc, w) => {
      const d = 10 + r() * 8;
      const h = 16 + r() * 40;
      const x = side * (9.5 + d / 2);
      K.box(pick(r, th.buildings), d, h, w, x, h / 2, zc);
      windows(K, th, r, side, side * 9.5, zc, w, h, 4, { lit: th.litRatio, litColors: [th.windowsLit, ...neon.slice(0, 3)], ww: 1.6, wh: 1.0, rowH: 2.2 });
      const nc = pick(r, neon);
      // vertical neon strip on the corner + roof outline
      K.box(nc, 0.25, h * 0.8, 0.25, side * 9.45, h * 0.45, zc + w / 2 - 0.3, 0, true);
      K.box(nc, 0.2, 0.2, w, side * 9.45, h, zc, 0, true);
      // sign board
      if (r() < 0.75) {
        const sw = 3 + r() * 3;
        const sy = 4 + r() * Math.min(10, h - 6);
        const sc = pick(r, neon);
        K.box("#0b0a12", 0.3, 1.6, sw, side * 9.2, sy, zc, 0);
        K.box(sc, 0.08, 1.2, sw - 0.4, side * 9.02, sy, zc, 0, true);
        K.box(pick(r, neon), 0.1, 0.12, sw + 0.2, side * 9.0, sy + 0.9, zc, 0, true);
      }
      // shop fronts
      K.box(pick(r, neon), 0.1, 2.2, w * 0.8, side * 9.4, 1.4, zc, 0, true);
    });
    lamp(K, th, side, -20 + side * 10, pick(r, neon));
  }
  catenary(K, -SEG / 2);
  // overhead neon arch now and then
  if (r() < 0.45) {
    const c = pick(r, neon);
    for (const s of [-1, 1]) K.box("#1a1826", 0.4, 9.8, 0.4, s * 5.6, 4.9, -SEG * 0.7);
    K.box(c, 11.6, 0.3, 0.3, 0, 9.9, -SEG * 0.7, 0, true);
    K.box("#0b0a12", 6, 1.6, 0.3, 0, 9.1, -SEG * 0.7);
    K.box(pick(r, neon), 5.4, 1.1, 0.1, 0, 9.1, -SEG * 0.7 + 0.2, 0, true);
  }
}

function styleCoastal(K, th, r) {
  // left: pastel hotels; right: beach promenade (sea is a separate plane)
  K.box(th.sideStripe, 4.2, 0.16, SEG, -7.0, 0.08, -SEG / 2);
  buildingRow(K, th, r, -1, (zc, w) => {
    const d = 9 + r() * 6;
    const h = 7 + r() * 14;
    const x = -(9.5 + d / 2);
    const col = pick(r, th.buildings);
    K.box(col, d, h, w, x, h / 2, zc);
    K.box("#ffffff", d + 0.5, 0.4, w + 0.5, x, h + 0.2, zc);
    windows(K, th, r, -1, -9.5, zc, w, h, 1.8, { colW: 2.6, rowH: 3 });
    for (let y = 3; y < h - 1; y += 3) K.box("#ffffff", 1.1, 0.15, w * 0.9, -9.0, y, zc);
    if (r() < 0.7) K.box(pick(r, ["#18b6c9", "#ff8f6b", "#ffd23a", "#ff5fa8"]), 1.6, 0.18, w * 0.8, -8.7, 2.8, zc);
  });
  for (let z = -4 - r() * 5; z > -SEG; z -= 9 + r() * 6) palm(K, th, r, -7.4, z);
  lamp(K, th, -1, -10);
  // promenade + railing
  K.box("#f2e6cc", 4.4, 0.14, SEG, 7.0, 0.07, -SEG / 2);
  K.box("#ffffff", 0.08, 0.08, SEG, 9.0, 1.0, -SEG / 2);
  for (let z = 0; z > -SEG; z -= 2.5) K.box("#ffffff", 0.08, 1.0, 0.08, 9.0, 0.5, z);
  K.box(th.side, 14, 0.1, SEG, 16, -0.02, -SEG / 2);
  for (let z = -3 - r() * 6; z > -SEG; z -= 8 + r() * 8) {
    if (r() < 0.5) palm(K, th, r, 11 + r() * 5, z);
    else {
      const c = pick(r, ["#ff5a5a", "#18b6c9", "#ffd23a", "#7a3cff"]);
      const x = 11 + r() * 8;
      K.cyl("#ffffff", 0.04, 0.04, 2.3, x, 1.15, z, 5);
      K.add(K.solid, new THREE.ConeGeometry(1.4, 0.6, 10), c, x, 2.4, z);
    }
  }
  if (r() < 0.3) {
    const z = -SEG * r();
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.8, 0.8]) K.cyl("#ffffff", 0.07, 0.07, 2.6, 13 + dx, 1.3, z + dz, 5);
    K.box("#ff5a5a", 2.2, 1.5, 2.2, 13, 3.3, z);
    K.prism("#ffffff", 2.6, 0.8, 2.6, 13, 4.05, z);
  }
  lamp(K, th, 1, -30);
}

function styleWinter(K, th, r) {
  for (const side of [-1, 1]) {
    K.box("#dfe8f1", 4.2, 0.2, SEG, side * 7.0, 0.1, -SEG / 2);
    let z = -2 - r() * 6;
    while (z > -SEG + 4) {
      if (r() < 0.55) {
        // cabin
        const w = 6 + r() * 3;
        const d = 5 + r() * 2.5;
        const h = 3.2 + r() * 1.6;
        const x = side * (10 + d / 2 + r() * 3);
        const col = pick(r, th.buildings);
        K.box(col, d, h, w, x, h / 2, z - w / 2);
        K.prism("#4a2f24", d + 0.8, 2.2, w + 0.6, x, h, z - w / 2);
        K.prism(th.snow, d + 0.9, 0.5, w + 0.7, x, h + 1.75, z - w / 2);
        K.box("#7a5a40", 0.6, 1.8, 0.6, x + side * -1, h + 1.6, z - w * 0.3);
        K.box(th.snow, 0.75, 0.25, 0.75, x + side * -1, h + 2.6, z - w * 0.3);
        windows(K, th, r, side, x - side * (d / 2), z - w / 2, w, h, 0.4, { colW: 2.4, rowH: 2.6, ww: 1.1, wh: 1.2 });
        K.box("#5a3e2a", 0.1, 2, 1.1, x - side * (d / 2 + 0.02), 1.0, z - w / 2 - w * 0.25);
        z -= w + 2 + r() * 4;
      } else {
        for (let i = 0; i < 3; i++) pine(K, th, r, side * (8 + r() * 10), z - r() * 6, 0.8 + r() * 0.7);
        z -= 7 + r() * 5;
      }
    }
    for (let i = 0; i < 3; i++) K.ball(th.snow, 1.2 + r(), side * (6.2 + r() * 2), 0, -r() * SEG, 1.6, 0.45, 1.2);
    for (let z2 = 0; z2 > -SEG; z2 -= 3) K.box("#7a5a40", 0.12, 1.0, 0.12, side * 5.3, 0.5, z2);
    K.box("#7a5a40", 0.08, 0.08, SEG, side * 5.3, 0.85, -SEG / 2);
    lamp(K, th, side, -20 + side * 10, "#ffcf70");
  }
}

function styleDesert(K, th, r) {
  for (const side of [-1, 1]) {
    let z = -r() * 8;
    while (z > -SEG + 4) {
      if (r() < 0.45) {
        const w = 6 + r() * 5;
        const d = 6 + r() * 5;
        const h = 3.5 + r() * 4;
        const x = side * (10 + d / 2 + r() * 4);
        const col = pick(r, th.buildings);
        K.box(col, d, h, w, x, h / 2, z - w / 2);
        if (r() < 0.5) K.box(col, d * 0.6, h * 0.6, w * 0.55, x + side * 0.5, h + h * 0.3, z - w * 0.4);
        for (let i = 0; i < Math.floor(w / 1.4); i++) K.cyl("#6a4a32", 0.1, 0.1, 0.9, x - side * (d / 2 + 0.3), h - 0.5, z - 0.7 - i * 1.4, 5, false, 0, Math.PI / 2);
        windows(K, th, r, side, x - side * (d / 2), z - w / 2, w, h, 0.6, { colW: 2.6, rowH: 2.6, ww: 0.9, wh: 1.1 });
        z -= w + 3 + r() * 5;
      } else {
        cactus(K, r, side * (7 + r() * 9), z - r() * 4);
        if (r() < 0.7) K.add(K.solid, new THREE.DodecahedronGeometry(0.6 + r() * 1.4, 0), pick(r, th.rock), side * (7 + r() * 12), 0.3, z - r() * 6, r(), r(), r(), 1, 0.7, 1);
        if (r() < 0.6) K.ball("#8a8a4a", 0.5 + r() * 0.4, side * (6 + r() * 8), 0.25, z - r() * 6, 1.3, 0.7, 1.3);
        z -= 6 + r() * 5;
      }
    }
    // telegraph poles
    K.cyl("#6a4a32", 0.1, 0.13, 6.4, side * 5.6, 3.2, -10 - (side > 0 ? 20 : 0), 6);
    K.box("#6a4a32", 1.6, 0.12, 0.12, side * 5.6, 6.0, -10 - (side > 0 ? 20 : 0));
  }
  if (r() < 0.25) {
    const z = -SEG * (0.2 + r() * 0.6);
    const x = (r() < 0.5 ? -1 : 1) * 14;
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) K.cyl("#6a4a32", 0.12, 0.12, 7, x + dx, 3.5, z + dz, 5);
    K.cyl("#8a8f96", 1.8, 1.8, 3, x, 8.5, z, 14);
    K.add(K.solid, new THREE.ConeGeometry(1.9, 1, 14), "#6a6f76", x, 10.5, z);
  }
}

const STYLES = { metro: styleMetro, neon: styleNeon, coastal: styleCoastal, winter: styleWinter, desert: styleDesert };

export function buildVariant(theme, seed) {
  const K = new Kit();
  STYLES[theme.style](K, theme, rng(seed * 7919 + theme.id.length * 104729));
  return K.finish();
}

/* ------------------------------------------------------------------ backdrops (far, unfogged) */
function hazy(color, fog, k) {
  return new THREE.Color(color).lerp(new THREE.Color(fog), k);
}
export function buildBackdrop(theme) {
  const g = new THREE.Group();
  const r = rng(theme.id.length * 977 + 13);
  const add = (geom, color, x, y, z, k = 0.55, ry = 0) => {
    const m = new THREE.Mesh(geom, track(new THREE.MeshBasicMaterial({ color: hazy(color, theme.fog.color, k), fog: false })));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    g.add(m);
    return m;
  };
  const st = theme.style;
  if (st === "metro" || st === "neon") {
    for (let i = 0; i < 46; i++) {
      const side = i % 2 ? 1 : -1;
      const h = 30 + r() * (st === "neon" ? 110 : 80);
      const w = 14 + r() * 22;
      const x = side * (70 + r() * 170);
      const z = -120 - r() * 260;
      add(track(new THREE.BoxGeometry(w, h, w)), st === "neon" ? "#1b1438" : pick(r, ["#9fb6cc", "#b7c9da", "#8aa4bd"]), x, h / 2 - 2, z, st === "neon" ? 0.25 : 0.55);
      if (st === "neon" && r() < 0.6) {
        const tip = new THREE.Mesh(track(new THREE.BoxGeometry(w * 0.9, 1.2, w * 0.9)), track(new THREE.MeshBasicMaterial({ color: pick(r, theme.neon), fog: false, toneMapped: false })));
        tip.position.set(x, h - 1, z);
        g.add(tip);
      }
    }
  } else if (st === "coastal") {
    for (let i = 0; i < 6; i++) {
      const m = add(track(new THREE.SphereGeometry(30 + r() * 40, 16, 8)), "#6a9a8a", 120 + r() * 200, -8, -200 - r() * 200, 0.5);
      m.scale.y = 0.3;
    }
    for (let i = 0; i < 10; i++) {
      const m = add(track(new THREE.SphereGeometry(40 + r() * 40, 16, 8)), "#7aa06a", -90 - r() * 180, -10, -150 - r() * 250, 0.5);
      m.scale.y = 0.45;
    }
  } else if (st === "winter") {
    for (let i = 0; i < 22; i++) {
      const side = i % 2 ? 1 : -1;
      const h = 60 + r() * 90;
      const rad = 50 + r() * 60;
      const x = side * (80 + r() * 200);
      const z = -150 - r() * 230;
      add(track(new THREE.ConeGeometry(rad, h, 7)), "#7d93ab", x, h / 2 - 4, z, 0.45, r() * 3);
      add(track(new THREE.ConeGeometry(rad * 0.42, h * 0.42, 7)), "#ffffff", x, h - h * 0.21 - 4 + 0.5, z, 0.2, r() * 3);
    }
  } else if (st === "desert") {
    for (let i = 0; i < 20; i++) {
      const side = i % 2 ? 1 : -1;
      const h = 25 + r() * 45;
      const rad = 30 + r() * 50;
      const x = side * (80 + r() * 220);
      const z = -140 - r() * 250;
      add(track(new THREE.CylinderGeometry(rad * 0.75, rad, h, 9)), pick(r, theme.rock), x, h / 2 - 3, z, 0.4, r() * 3);
      add(track(new THREE.CylinderGeometry(rad * 0.78, rad * 0.75, 3, 9)), "#e08a5a", x, h - 1.5 - 3 + 1.5, z, 0.4);
    }
  }
  return g;
}

/* ------------------------------------------------------------------ sky */
export function buildSky() {
  const mat = track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color("#3f8fe0") },
        mid: { value: new THREE.Color("#8cc8f4") },
        bottom: { value: new THREE.Color("#d9eefa") },
        sunDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
        sunCol: { value: new THREE.Color("#fff6dd") },
        night: { value: 0 },
        time: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol;
        uniform float night; uniform float time;
        varying vec3 vDir;
        float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
        void main() {
          float h = vDir.y;
          vec3 col = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.75, h)) : mix(bottom, mid, smoothstep(-0.05, 0.12, h));
          float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunCol * (pow(d, 900.0) * 3.0 + pow(d, 12.0) * 0.35) * (1.0 - night * 0.6);
          if (night > 0.5 && h > 0.15) {
            vec3 p = floor(vDir * 260.0);
            float s = step(0.9975, hash(p));
            col += vec3(s) * (0.6 + 0.4 * sin(time * 2.0 + hash(p + 1.0) * 6.28)) * smoothstep(0.15, 0.5, h);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  const m = new THREE.Mesh(track(new THREE.SphereGeometry(420, 32, 16)), mat);
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

/* ------------------------------------------------------------------ ground + track */
export function buildTrack() {
  const g = new THREE.Group();
  // sleeper tops sit at y = 0, where the runner's feet are
  g.position.y = -0.13;
  const LEN = 560;
  const bedTex = noiseTexture("#8a847c", 60, 256, 5200, 3);
  bedTex.repeat.set(2, LEN / 8);
  const bed = new THREE.Mesh(track(new THREE.PlaneGeometry(9.6, LEN)), track(new THREE.MeshStandardMaterial({ map: bedTex, roughness: 0.95, color: "#ffffff" })));
  bed.rotation.x = -Math.PI / 2;
  bed.position.set(0, 0.0, -LEN / 2 + 80);
  bed.receiveShadow = true;
  g.add(bed);
  const sideTex = noiseTexture("#808080", 40, 256, 3000, 7);
  sideTex.repeat.set(30, LEN / 10);
  const sideMat = track(new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.95, color: "#6b8a5a" }));
  const sides = [];
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(track(new THREE.PlaneGeometry(300, LEN)), sideMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(s * (4.8 + 150), -0.04, -LEN / 2 + 80);
    p.receiveShadow = true;
    g.add(p);
    sides.push(p);
  }
  // rails: static, they look identical everywhere along z
  const railMat = track(new THREE.MeshStandardMaterial({ color: "#d9dde2", roughness: 0.3, metalness: 0.85 }));
  const railGeo = track(new THREE.BoxGeometry(0.09, 0.14, LEN));
  for (let l = 0; l < 3; l++) {
    for (const s of [-1, 1]) {
      const r = new THREE.Mesh(railGeo, railMat);
      r.position.set((l - 1) * LW + s * 0.72, 0.2, -LEN / 2 + 80);
      r.receiveShadow = true;
      g.add(r);
    }
  }
  // sleepers: one instanced mesh, slid by (dist mod spacing) every frame
  const SP = 0.8;
  const n = Math.floor(LEN / SP);
  const sleeperMat = track(new THREE.MeshStandardMaterial({ color: "#5c4a3c", roughness: 0.85 }));
  const sleepers = new THREE.InstancedMesh(track(new THREE.BoxGeometry(2.0, 0.12, 0.28)), sleeperMat, n * 3);
  const mm = new THREE.Matrix4();
  let k = 0;
  for (let l = 0; l < 3; l++) for (let i = 0; i < n; i++) sleepers.setMatrixAt(k++, mm.makeTranslation((l - 1) * LW, 0.07, 80 - i * SP));
  sleepers.receiveShadow = true;
  sleepers.frustumCulled = false;
  g.add(sleepers);
  return {
    group: g,
    bedTex,
    sideTex,
    bedMat: bed.material,
    sideMat,
    railMat,
    sleeperMat,
    scroll(dist) {
      sleepers.position.z = dist % SP;
      bedTex.offset.y = (dist / 8) % 1;
      sideTex.offset.y = (dist / 10) % 1;
    },
  };
}

export function buildSea() {
  const tex = noiseTexture("#ffffff", 70, 256, 4000, 11);
  tex.repeat.set(40, 60);
  const m = new THREE.Mesh(
    track(new THREE.PlaneGeometry(500, 700)),
    track(new THREE.MeshStandardMaterial({ color: "#2a8fb8", roughness: 0.18, metalness: 0.35, map: tex })),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(23 + 250, 0.0, -250);
  m.userData.tex = tex;
  return m;
}

/* ------------------------------------------------------------------ weather */
export function buildWeather() {
  const N = 900;
  const pos = new Float32Array(N * 3);
  const seed = rng(5);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (seed() - 0.5) * 60;
    pos[i * 3 + 1] = seed() * 22;
    pos[i * 3 + 2] = -seed() * 110 + 12;
  }
  const geom = track(new THREE.BufferGeometry());
  geom.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = track(new THREE.PointsMaterial({ size: 0.12, color: "#ffffff", transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true }));
  const pts = new THREE.Points(geom, mat);
  pts.frustumCulled = false;
  // rain streaks
  const RN = 500;
  const rpos = new Float32Array(RN * 6);
  for (let i = 0; i < RN; i++) {
    const x = (seed() - 0.5) * 50;
    const y = seed() * 22;
    const z = -seed() * 90 + 10;
    rpos.set([x, y, z, x, y - 0.9, z + 0.3], i * 6);
  }
  const rgeom = track(new THREE.BufferGeometry());
  rgeom.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
  const rain = new THREE.LineSegments(rgeom, track(new THREE.LineBasicMaterial({ color: "#a9c8ff", transparent: true, opacity: 0.35, depthWrite: false })));
  rain.frustumCulled = false;
  let kind = null;
  const W = {
    points: pts,
    rain,
    setKind(k, th) {
      kind = k;
      pts.visible = k === "snow" || k === "dust" || k === "sparkle" || k === "leaves";
      rain.visible = k === "rain";
      if (k === "snow") Object.assign(mat, { size: 0.16, opacity: 0.9 }), mat.color.set("#ffffff");
      else if (k === "dust") Object.assign(mat, { size: 0.09, opacity: 0.5 }), mat.color.set("#f6d6a0");
      else if (k === "sparkle") Object.assign(mat, { size: 0.1, opacity: 0.7 }), mat.color.set("#fff2c8");
      else if (k === "leaves") Object.assign(mat, { size: 0.12, opacity: 0.75 }), mat.color.set(th?.foliage?.[1] || "#62ad48");
      mat.needsUpdate = true;
    },
    update(dt, speed, t, quality) {
      if (!kind) return;
      const sp = speed * dt;
      if (rain.visible) {
        const a = rgeom.attributes.position.array;
        const fall = 26 * dt;
        for (let i = 0; i < RN; i++) {
          const o = i * 6;
          a[o + 1] -= fall;
          a[o + 4] -= fall;
          a[o + 2] += sp;
          a[o + 5] += sp;
          if (a[o + 1] < 0 || a[o + 2] > 14) {
            const x = (Math.random() - 0.5) * 50;
            const y = 14 + Math.random() * 8;
            const z = a[o + 2] > 14 ? -80 - Math.random() * 10 : a[o + 2];
            a[o] = x;
            a[o + 1] = y;
            a[o + 2] = z;
            a[o + 3] = x;
            a[o + 4] = y - 0.9;
            a[o + 5] = z + 0.3;
          }
        }
        rgeom.attributes.position.needsUpdate = true;
      }
      if (pts.visible) {
        const a = geom.attributes.position.array;
        const n = quality === "low" ? N / 2 : N;
        geom.setDrawRange(0, n);
        const fall = (kind === "snow" ? 1.6 : kind === "leaves" ? 1.1 : 0.15) * dt;
        for (let i = 0; i < n; i++) {
          const o = i * 3;
          a[o] += Math.sin(t * 1.3 + i) * dt * (kind === "dust" ? 1.6 : 0.6);
          a[o + 1] -= fall + (kind === "sparkle" ? Math.sin(t + i) * dt * 0.3 : 0);
          a[o + 2] += sp * (kind === "dust" ? 1.1 : 1);
          if (a[o + 1] < 0) a[o + 1] += 22;
          if (a[o + 2] > 12) {
            a[o + 2] -= 110;
            a[o] = (Math.random() - 0.5) * 60;
          }
        }
        geom.attributes.position.needsUpdate = true;
      }
    },
  };
  return W;
}

/* ------------------------------------------------------------------ slots */
export function createScenery(scene) {
  const root = new THREE.Group();
  scene.add(root);
  const solidMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 }));
  const glowMatV = track(new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  const variants = new Map(); // themeId → [{solid, glow}]
  const queue = [];
  const slots = [];
  const N = Math.ceil(400 / SEG) + 1;
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group();
    const solid = new THREE.Mesh(undefined, solidMat);
    solid.castShadow = false;
    solid.receiveShadow = true;
    const glow = new THREE.Mesh(undefined, glowMatV);
    solid.visible = glow.visible = false;
    g.add(solid, glow);
    root.add(g);
    slots.push({ g, solid, glow, index: null, theme: null });
  }

  const ready = (th) => (variants.get(th.id) || []).length;
  function prepare(th, all = false) {
    if (!variants.has(th.id)) variants.set(th.id, []);
    const have = variants.get(th.id).length + queue.filter((x) => x.id === th.id).length;
    for (let i = have; i < VARIANTS; i++) queue.push(th);
    if (all) while (ready(th) < VARIANTS) work();
  }
  function work() {
    const th = queue.shift();
    if (!th) return false;
    const list = variants.get(th.id);
    if (list.length < VARIANTS) {
      const v = buildVariant(th, list.length + 1);
      track(v.solid);
      if (v.glow) track(v.glow);
      list.push(v);
    }
    return true;
  }
  function assign(slot, index, th) {
    const list = variants.get(th.id);
    if (!list || !list.length) {
      slot.solid.visible = slot.glow.visible = false;
      slot.index = index;
      slot.theme = null;
      return;
    }
    // stable per segment index so the same street comes back the same
    const v = list[((index * 2654435761) >>> 0) % list.length];
    slot.solid.geometry = v.solid;
    slot.solid.visible = !!v.solid;
    if (v.glow) {
      slot.glow.geometry = v.glow;
      slot.glow.visible = true;
    } else slot.glow.visible = false;
    slot.index = index;
    slot.theme = th.id;
    slot.g.userData.mirror = index % 2 === 1;
    slot.g.scale.x = slot.g.userData.mirror && th.style !== "coastal" ? -1 : 1;
  }
  /**
   * place slots to cover [dist - back, dist + ahead]; segment k spans sim z
   * [k*SEG, (k+1)*SEG]. themeFor(k) picks the city for a segment.
   */
  function update(dist, back, ahead, themeFor) {
    work();
    const k0 = Math.floor((dist - back) / SEG);
    const k1 = Math.floor((dist + ahead) / SEG);
    const want = new Set();
    for (let k = k0; k <= k1 && want.size < slots.length; k++) want.add(k);
    const free = [];
    for (const s of slots) {
      if (s.index !== null && want.has(s.index)) {
        want.delete(s.index);
        const th = themeFor(s.index);
        if (s.theme !== th.id && ready(th) && s.index * SEG > dist + ahead * 0.55) assign(s, s.index, th);
        else if (!s.theme && ready(th)) assign(s, s.index, th);
      } else free.push(s);
    }
    for (const k of want) {
      const s = free.pop();
      if (!s) break;
      assign(s, k, themeFor(k));
    }
    for (const s of free) {
      s.solid.visible = s.glow.visible = false;
      s.index = null;
    }
    for (const s of slots) if (s.index !== null) s.g.position.z = -(s.index * SEG - dist);
  }
  return {
    root,
    prepare,
    update,
    pending: () => queue.length,
    reset() {
      for (const s of slots) {
        s.index = null;
        s.theme = null;
        s.solid.visible = s.glow.visible = false;
      }
    },
    setNight(n) {
      solidMat.roughness = n ? 0.6 : 0.8;
    },
  };
}
