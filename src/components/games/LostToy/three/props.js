/**
 * Lost Toy — household object builders.
 *
 * Each builder turns one kit descriptor (data/kit.js) into geometry "parts"
 * in WORLD space. Static parts of the whole level are merged per material
 * (one draw call per material for all the furniture), so a richly dressed
 * room stays cheap. Things that move or react — pillows that squash, the
 * clock's hands, curtains, plants, movers, the crank — are returned as
 * separate dynamic objects with an update().
 *
 * All sizes are true household scale (1 unit = 10 cm).
 */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mat, worldUV, KINDS, labelTexture } from "./materials.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const V = new THREE.Vector3();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const Sv = new THREE.Vector3();
const Mx = new THREE.Matrix4();

function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/* ================================================================== geometry helpers */
export function rbox(w, h, d, r = 0.08, seg = 2) {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}
/** superellipsoid "pillow" blob: n≈2 sphere, n≈4 pillow, n≈10 soft box */
export function blob(w, h, d, nx = 4, ny = 2.6, ws = 28, hs = 18) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const f = (v, n) => Math.sign(v) * Math.pow(Math.abs(v), 2 / n);
    p.setXYZ(i, (f(x, nx) * w) / 2, (f(y, ny) * h) / 2, (f(z, nx) * d) / 2);
  }
  g.computeVertexNormals();
  return g;
}
function cyl(rt, rb, h, seg = 20, open = false) {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
}
function lathe(pts, seg = 24) {
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  g.computeVertexNormals();
  return g;
}

/* ================================================================== part collector */
/**
 * P.add(geo, kind, color, { p:[x,y,z], r:[x,y,z], s:[x,y,z], uv:"world"|"own" })
 * p/r are in the prop's LOCAL frame; the collector applies the prop transform.
 */
class Parts {
  constructor() {
    this.items = [];
    this.base = new THREE.Matrix4();
  }
  frame(x, y, z, rotY = 0) {
    this.base.compose(V.set(x, y, z), Q.setFromEuler(E.set(0, rotY, 0)), Sv.set(1, 1, 1));
    return this;
  }
  add(geo, kind, color, o = {}) {
    const m = new THREE.Matrix4().compose(V.set(...(o.p || [0, 0, 0])), Q.setFromEuler(E.set(...(o.r || [0, 0, 0]), o.order || "XYZ")), Sv.set(...(o.s || [1, 1, 1])));
    m.premultiply(this.base);
    geo.applyMatrix4(m);
    if ((o.uv || "world") === "world") worldUV(geo, (KINDS[kind] || KINDS.matte).density, o.uvOff || 0);
    this.items.push({ geo, key: o.matKey || `${kind}|${color}`, kind, color, material: o.material || null, cast: o.cast !== false, receive: o.receive !== false });
  }
}

/**
 * Merge all static parts into a few meshes: one per material KIND (wood,
 * paper, fabric …), with each part's colour baked into a vertex-colour
 * attribute — so a room full of differently coloured books, blocks and
 * cushions costs about as many draw calls as there are kinds.
 * Parts with their own material (labels, transparent glass) merge per material.
 */
export function mergeParts(parts, { shadows = true } = {}) {
  const groups = new Map();
  const col = new THREE.Color();
  for (const it of parts.items) {
    let g = it.geo;
    if (g.index) g = g.toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const own = !!it.material || it.kind === "glow" || !!(KINDS[it.kind] && KINDS[it.kind].transparent);
    if (own && !it.material) it.material = mat(it.kind, it.color);
    if (!own) {
      col.set(it.color);
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        c[i * 3] = col.r;
        c[i * 3 + 1] = col.g;
        c[i * 3 + 2] = col.b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    }
    const key = (own ? it.material.uuid : `kind:${it.kind}`) + (it.cast ? "" : "|nocast");
    if (!groups.has(key)) groups.set(key, { list: [], it, own });
    groups.get(key).list.push(g);
    if (g !== it.geo) it.geo.dispose();
  }
  const meshes = [];
  for (const { list, it, own } of groups.values()) {
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const material = own ? it.material : mat(it.kind, "#ffffff", { vertexColors: true });
    const m = new THREE.Mesh(merged, material);
    m.castShadow = shadows && it.cast && !material.transparent;
    m.receiveShadow = shadows && it.receive;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    meshes.push(m);
  }
  return meshes;
}

/* ================================================================== label textures */
function blockFace(color, letter) {
  return labelTexture(`block:${color}:${letter}`, 128, 128, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    const c = new THREE.Color(color);
    const light = `rgb(${Math.min(255, c.r * 255 + 70)},${Math.min(255, c.g * 255 + 70)},${Math.min(255, c.b * 255 + 70)})`;
    g.strokeStyle = light;
    g.lineWidth = 10;
    g.strokeRect(12, 12, w - 24, h - 24);
    g.fillStyle = "#fff8ec";
    g.font = "900 78px 'Trebuchet MS', 'Arial Rounded MT Bold', sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(letter, w / 2, h / 2 + 4);
    g.fillStyle = "rgba(0,0,0,0.07)";
    for (let i = 0; i < 40; i++) g.fillRect((i * 37) % w, (i * 53) % h, 2, 2);
  });
}
function artTexture(art) {
  return labelTexture(`art:${art}`, 256, 256, (g, w, h) => {
    g.fillStyle = "#fbf6ea";
    g.fillRect(0, 0, w, h);
    g.lineCap = "round";
    if (art === "sun") {
      g.fillStyle = "#8fc9e8";
      g.fillRect(0, 0, w, h * 0.68);
      g.fillStyle = "#7cbf6a";
      g.fillRect(0, h * 0.68, w, h);
      g.fillStyle = "#ffd23a";
      g.beginPath();
      g.arc(70, 70, 34, 0, TAU);
      g.fill();
      g.strokeStyle = "#ffb52e";
      g.lineWidth = 7;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        g.beginPath();
        g.moveTo(70 + Math.cos(a) * 44, 70 + Math.sin(a) * 44);
        g.lineTo(70 + Math.cos(a) * 60, 70 + Math.sin(a) * 60);
        g.stroke();
      }
      // a little house + a toy figure drawn by a child
      g.fillStyle = "#e85d4a";
      g.fillRect(140, 130, 70, 50);
      g.beginPath();
      g.moveTo(132, 132);
      g.lineTo(175, 95);
      g.lineTo(218, 132);
      g.fill();
      g.fillStyle = "#6b4a35";
      g.fillRect(168, 152, 16, 28);
      g.fillStyle = "#f1dfc3";
      g.beginPath();
      g.arc(95, 175, 14, 0, TAU);
      g.fill();
      g.fillStyle = "#d9473b";
      g.fillRect(84, 186, 22, 6);
      g.fillStyle = "#4b72b0";
      g.fillRect(86, 192, 18, 20);
    } else if (art === "boat") {
      g.fillStyle = "#b9e0f2";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#4f8fc9";
      g.fillRect(0, h * 0.62, w, h);
      g.fillStyle = "#d9473b";
      g.beginPath();
      g.moveTo(60, 160);
      g.lineTo(200, 160);
      g.lineTo(180, 190);
      g.lineTo(80, 190);
      g.fill();
      g.fillStyle = "#fff";
      g.beginPath();
      g.moveTo(128, 60);
      g.lineTo(128, 155);
      g.lineTo(190, 150);
      g.fill();
      g.strokeStyle = "#6b4a35";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(125, 55);
      g.lineTo(125, 162);
      g.stroke();
    } else if (art === "stars") {
      g.fillStyle = "#28356a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffe27a";
      for (let i = 0; i < 18; i++) {
        g.beginPath();
        g.arc((i * 83) % w, (i * 47 + 20) % h, 4 + (i % 3) * 2, 0, TAU);
        g.fill();
      }
      g.beginPath();
      g.arc(180, 70, 30, 0, TAU);
      g.fill();
      g.fillStyle = "#28356a";
      g.beginPath();
      g.arc(192, 62, 28, 0, TAU);
      g.fill();
    } else if (art === "flower") {
      g.fillStyle = "#fde7e1";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "#5f9b52";
      g.lineWidth = 8;
      g.beginPath();
      g.moveTo(128, 240);
      g.lineTo(128, 120);
      g.stroke();
      g.fillStyle = "#f28da0";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        g.beginPath();
        g.arc(128 + Math.cos(a) * 32, 100 + Math.sin(a) * 32, 24, 0, TAU);
        g.fill();
      }
      g.fillStyle = "#ffd23a";
      g.beginPath();
      g.arc(128, 100, 22, 0, TAU);
      g.fill();
    } else {
      g.fillStyle = "#e9d8bd";
      g.fillRect(0, 0, w, h);
    }
  });
}
function quiltTexture(a, b) {
  return labelTexture(`quilt:${a}:${b}`, 256, 256, (g, w, h) => {
    const n = 4;
    const t = w / n;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? a : b;
        g.fillRect(x * t, y * t, t, t);
        if ((x + y) % 2 === 0) {
          g.fillStyle = "rgba(255,255,255,0.18)";
          g.beginPath();
          g.arc(x * t + t / 2, y * t + t / 2, t * 0.22, 0, TAU);
          g.fill();
        }
      }
    g.strokeStyle = "rgba(60,40,30,0.35)";
    g.setLineDash([5, 5]);
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo(i * t, 0);
      g.lineTo(i * t, h);
      g.stroke();
      g.beginPath();
      g.moveTo(0, i * t);
      g.lineTo(w, i * t);
      g.stroke();
    }
  });
}
function cardboardLabel(text) {
  return labelTexture(`cb:${text}`, 256, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(160,40,30,0.85)";
    g.lineWidth = 6;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = "rgba(160,40,30,0.9)";
    g.font = "900 46px 'Arial Black', Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 2);
  });
}
function stripeBallTexture(a, b) {
  return labelTexture(`ball:${a}:${b}`, 256, 128, (g, w, h) => {
    const cols = [a, "#ffffff", b, "#ffffff", a, "#ffffff", b, "#ffffff"];
    for (let i = 0; i < 8; i++) {
      g.fillStyle = cols[i];
      g.fillRect((i * w) / 8, 0, w / 8 + 1, h);
    }
  });
}
function labelMat(tex, rough = 0.6, extra = {}) {
  const key = `label:${tex.uuid}`;
  return { key, material: getLabelMat(key, tex, rough, extra) };
}
const labelMats = new Map();
function getLabelMat(key, tex, rough, extra) {
  if (!labelMats.has(key)) labelMats.set(key, new THREE.MeshStandardMaterial({ map: tex, roughness: rough, ...extra }));
  return labelMats.get(key);
}
export function disposeLabelMats() {
  for (const m of labelMats.values()) m.dispose();
  labelMats.clear();
}

/* ================================================================== builders */
const B = {};

B.rug = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(rbox(d.w, d.h, d.d, 0.03, 1), "rug", "#ffffff", { p: [0, d.h / 2, 0], uv: "own" });
  // fringe tassels on the short ends
  const n = Math.floor(d.w / 0.45);
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const x = -d.w / 2 + 0.25 + (i * (d.w - 0.5)) / Math.max(1, n - 1);
      P.add(new THREE.BoxGeometry(0.09, 0.03, 0.55), "fabric", "#f3e2c4", { p: [x, 0.02, s * (d.d / 2 + 0.25)], r: [0, (i % 3) * 0.1 - 0.1, 0], cast: false });
    }
  }
};

B.flatmat = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(rbox(d.w, d.h, d.d, 0.025, 1), d.kind || "fabric", d.color, { p: [0, d.h / 2, 0], cast: false });
};

B.book = (P, d) => {
  P.frame(d.x, d.y, d.z);
  const { w, h, d: dd } = d;
  const ct = Math.min(0.07, h * 0.14);
  const inset = 0.09;
  const sp = d.spine; // 0 +z, 1 +x, 2 -z, 3 -x
  const alongX = sp === 1 || sp === 3; // spine on an x face
  const sgn = sp === 1 || sp === 0 ? 1 : -1;
  // covers
  P.add(rbox(w, ct, dd, 0.025, 1), "paper", d.color, { p: [0, ct / 2, 0] });
  P.add(rbox(w, ct, dd, 0.025, 1), "paper", d.color, { p: [0, h - ct / 2, 0] });
  // page block (inset on the three open sides)
  const pw = alongX ? w - inset : w - inset * 2;
  const pd = alongX ? dd - inset * 2 : dd - inset;
  const px = alongX ? -sgn * (inset / 2) * 0 - sgn * 0 : 0;
  P.add(new THREE.BoxGeometry(pw, h - ct * 2 + 0.002, pd), "pages", "#ffffff", { p: [alongX ? -sgn * inset * 0.5 + px : 0, h / 2, alongX ? 0 : -sgn * inset * 0.5] });
  // rounded spine
  const spineGeo = cyl(h / 2, h / 2, alongX ? dd : w, 14);
  if (alongX) P.add(spineGeo, "paper", d.color, { p: [sgn * (w / 2 - h * 0.25), h / 2, 0], r: [Math.PI / 2, 0, 0], s: [0.55, 1, 1] });
  else P.add(spineGeo, "paper", d.color, { p: [0, h / 2, sgn * (dd / 2 - h * 0.25)], r: [0, 0, Math.PI / 2], s: [1, 1, 0.55] });
  // two title bands on the spine + a band across the top cover
  for (const k of [-0.32, 0.32]) {
    if (alongX) P.add(new THREE.BoxGeometry(0.03, h * 0.82, 0.12), "matte", d.band, { p: [sgn * (w / 2 + 0.002), h / 2, k * dd], cast: false });
    else P.add(new THREE.BoxGeometry(0.12, h * 0.82, 0.03), "matte", d.band, { p: [k * w, h / 2, sgn * (dd / 2 + 0.002)], cast: false });
  }
  if (alongX) P.add(new THREE.BoxGeometry(w * 0.08, 0.01, dd * 0.7), "matte", d.band, { p: [sgn * (w / 2 - w * 0.12), h + 0.004, 0], cast: false });
  else P.add(new THREE.BoxGeometry(w * 0.7, 0.01, dd * 0.08), "matte", d.band, { p: [0, h + 0.004, sgn * (dd / 2 - dd * 0.12)], cast: false });
};

const BOOK_PALETTE = ["#c0504d", "#2f6f8f", "#6a8f3f", "#e0a33a", "#8a5aa8", "#3f7fd6", "#a83f3f", "#d9b98f", "#4fb3a8", "#e07a5f", "#5b4a7a", "#f2c14e"];
B.bookRow = (P, d) => {
  const r = rng(d.seed || 1);
  const pal = d.palette || BOOK_PALETTE;
  const len = d.axis === "x" ? d.x1 - d.x0 : d.z1 - d.z0;
  let u = 0;
  while (u < len - 0.2) {
    const t = Math.min(len - u, 0.35 + r() * 0.5);
    const hh = d.h * (0.94 + r() * 0.06);
    const col = pal[Math.floor(r() * pal.length)];
    const c = u + t / 2;
    if (d.axis === "x") {
      P.frame(d.x0 + c, d.y, d.z);
      P.add(rbox(t - 0.03, hh, d.d * (0.9 + r() * 0.1), 0.03, 1), "paper", col, { p: [0, hh / 2, 0] });
      P.add(new THREE.BoxGeometry(t - 0.02, 0.1, 0.02), "matte", "#f6e6c4", { p: [0, hh * 0.8, d.d / 2], cast: false });
    } else {
      P.frame(d.x, d.y, d.z0 + c);
      P.add(rbox(d.d * (0.9 + r() * 0.1), hh, t - 0.03, 0.03, 1), "paper", col, { p: [0, hh / 2, 0] });
      P.add(new THREE.BoxGeometry(0.02, 0.1, t - 0.02), "matte", "#f6e6c4", { p: [d.d / 2, hh * 0.8, 0], cast: false });
    }
    u += t;
  }
};

B.notebook = (P, d) => {
  P.frame(d.x, d.y, d.z, d.rot || 0);
  if (d.open) {
    P.add(rbox(d.w, 0.05, d.d, 0.02, 1), "paper", d.color, { p: [0, 0.025, 0] });
    P.add(new THREE.BoxGeometry(d.w / 2 - 0.1, 0.07, d.d - 0.16), "notebook", "#ffffff", { p: [-d.w / 4, 0.08, 0], r: [0, 0, 0.02], uv: "world" });
    P.add(new THREE.BoxGeometry(d.w / 2 - 0.1, 0.07, d.d - 0.16), "notebook", "#ffffff", { p: [d.w / 4, 0.08, 0], r: [0, 0, -0.02] });
    for (let i = 0; i < 9; i++) P.add(new THREE.TorusGeometry(0.09, 0.018, 6, 12), "metal", "#c9ccd2", { p: [0, 0.12, -d.d / 2 + 0.25 + (i * (d.d - 0.5)) / 8], r: [0, Math.PI / 2, 0], cast: false });
  } else {
    P.add(rbox(d.w, d.h, d.d, 0.03, 1), "paper", d.color, { p: [0, d.h / 2, 0] });
    P.add(new THREE.BoxGeometry(d.w - 0.1, d.h * 0.7, d.d - 0.02), "pages", "#ffffff", { p: [0.05, d.h / 2, 0] });
  }
};

B.paper = (P, d) => {
  P.frame(d.x, d.y, d.z, d.rot || 0);
  P.add(new THREE.BoxGeometry(d.w, 0.012, d.d), "notebook", d.color || "#ffffff", { p: [0, 0.006, 0], cast: false });
};

B.block = (P, d) => {
  // letter blocks get their own textured material (classic painted wooden block)
  if (d.pushIndex != null) return; // pushables are dynamic (see dynamicBlock)
  P.frame(d.x, d.y, d.z);
  const tex = blockFace(d.color, d.letter);
  const lm = labelMat(tex, 0.55);
  P.add(rbox(d.w, d.h, d.d, 0.09, 2), "label", "#fff", { p: [0, d.h / 2, 0], uv: "own", matKey: lm.key, material: lm.material });
};

B.ball = (P, d) => {
  P.frame(d.x, d.y, d.z);
  const tex = stripeBallTexture(d.color, d.color2);
  const lm = labelMat(tex, 0.35);
  P.add(new THREE.SphereGeometry(d.r, 32, 20), "label", "#fff", { p: [0, d.r, 0], r: [0.3, 0.6, 0.2], uv: "own", matKey: lm.key, material: lm.material });
};

B.toyCar = (P, d) => {
  P.frame(d.x, d.y, d.z, (d.rot || 0) * (Math.PI / 2));
  carParts(P, d.color);
};
function carParts(P, color, s = 1) {
  // local: length along x (2.6), width z (1.5), height 1.2
  P.add(rbox(2.6 * s, 0.62 * s, 1.5 * s, 0.22 * s, 3), "plastic", color, { p: [0, 0.48 * s, 0] });
  P.add(rbox(1.35 * s, 0.5 * s, 1.3 * s, 0.2 * s, 3), "plastic", color, { p: [-0.15 * s, 0.98 * s, 0] });
  // windows
  P.add(new THREE.BoxGeometry(1.2 * s, 0.32 * s, 1.32 * s), "glossy", "#a9d6f0", { p: [-0.15 * s, 1.0 * s, 0], cast: false });
  P.add(new THREE.BoxGeometry(1.38 * s, 0.32 * s, 1.1 * s), "glossy", "#a9d6f0", { p: [-0.15 * s, 1.0 * s, 0], cast: false });
  for (const [wx, wz] of [
    [0.82, 0.68],
    [-0.82, 0.68],
    [0.82, -0.68],
    [-0.82, -0.68],
  ]) {
    P.add(cyl(0.3 * s, 0.3 * s, 0.22 * s, 18), "rubber", "#2a2a2e", { p: [wx * s, 0.3 * s, wz * s], r: [Math.PI / 2, 0, 0] });
    P.add(cyl(0.14 * s, 0.14 * s, 0.24 * s, 12), "metal", "#d9dde3", { p: [wx * s, 0.3 * s, wz * s], r: [Math.PI / 2, 0, 0], cast: false });
  }
  for (const z of [0.42, -0.42]) P.add(new THREE.SphereGeometry(0.1 * s, 10, 8), "glow", "#fff4c2", { p: [1.29 * s, 0.55 * s, z * s], cast: false });
}

B.cardboard = (P, d) => {
  P.frame(d.x, d.y, d.z);
  const t = 0.14;
  const { w, h, d: dd } = d;
  const open = d.open;
  const k = "cardboard";
  const c = "#ffffff";
  if (!open) {
    P.add(rbox(w, h, dd, 0.05, 1), k, c, { p: [0, h / 2, 0] });
    if (d.tape) P.add(new THREE.BoxGeometry(0.6, 0.02, dd + 0.02), "plastic", "#d8c79a", { p: [0, h + 0.005, 0], cast: false });
  } else {
    const wall = (ww, hh, ddd, px, py, pz) => P.add(new THREE.BoxGeometry(ww, hh, ddd), k, c, { p: [px, py, pz] });
    wall(w, t, dd, 0, t / 2, 0);
    if (open !== "top") wall(w, t, dd, 0, h - t / 2, 0);
    if (open !== "-x") wall(t, h, dd, -w / 2 + t / 2, h / 2, 0);
    if (open !== "+x") wall(t, h, dd, w / 2 - t / 2, h / 2, 0);
    if (open !== "-z") wall(w, h, t, 0, h / 2, -dd / 2 + t / 2);
    if (open !== "+z") wall(w, h, t, 0, h / 2, dd / 2 - t / 2);
    // flaps flopping open on the open side
    const flap = (ww, hh, px, py, pz, rx, ry, rz) => P.add(new THREE.BoxGeometry(ww, hh, 0.1), k, "#f4e6d2", { p: [px, py, pz], r: [rx, ry, rz], order: "YXZ" });
    if (open === "+x") {
      flap(dd * 0.5, h * 0.95, w / 2 + dd * 0.22, h / 2, -dd / 2 - 0.05, 0, Math.PI / 2 + 0.95, 0);
      flap(dd * 0.5, h * 0.95, w / 2 + dd * 0.22, h / 2, dd / 2 + 0.05, 0, -Math.PI / 2 - 0.95, 0);
      P.add(new THREE.BoxGeometry(1.9, 0.08, dd * 0.98), k, "#f4e6d2", { p: [w / 2 + 0.75, h + 0.15, 0], r: [0, 0, 0.35] });
    }
    if (open === "top") {
      for (const s of [-1, 1]) P.add(new THREE.BoxGeometry(w, 0.08, dd * 0.48), k, "#f4e6d2", { p: [0, h + dd * 0.18, s * (dd / 2 + dd * 0.1)], r: [s * 1.1, 0, 0] });
    }
    // tape strip over the top edge
    if (d.tape) P.add(new THREE.BoxGeometry(0.7, 0.02, dd + 0.04), "plastic", "#d8c79a", { p: [0, h + 0.005, 0], cast: false });
  }
  if (d.label) {
    const tex = cardboardLabel(d.label);
    const lm = labelMat(tex, 0.9, { transparent: true });
    const side = open === "+z" ? -1 : 1;
    P.add(new THREE.PlaneGeometry(2.4, 1.2), "label", "#fff", { p: [0, h * 0.55, side * (dd / 2 + 0.01)], r: [0, side < 0 ? Math.PI : 0, 0], uv: "own", matKey: lm.key, material: lm.material, cast: false });
  }
};

B.shoebox = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(rbox(d.w, d.h * 0.85, d.d, 0.05, 1), "cardboard", d.color, { p: [0, d.h * 0.425, 0] });
  P.add(rbox(d.w + 0.12, d.h * 0.25, d.d + 0.12, 0.05, 1), "cardboard", d.lid, { p: [0, d.h - d.h * 0.125, 0] });
};

B.chest = (P, d) => {
  P.frame(d.x, d.y, d.z);
  const { w, h, d: dd } = d;
  P.add(rbox(w - 0.1, h - 0.5, dd - 0.1, 0.12, 2), "woodPaint", d.color, { p: [0, (h - 0.5) / 2, 0] });
  P.add(rbox(w + 0.15, 0.55, dd + 0.15, 0.16, 2), "woodPaint", d.color, { p: [0, h - 0.275, 0] });
  // trims + painted stars on the front
  P.add(rbox(w + 0.02, 0.18, dd + 0.02, 0.06, 1), "woodPaint", d.trim, { p: [0, 0.35, 0] });
  P.add(rbox(w + 0.2, 0.12, dd + 0.2, 0.05, 1), "woodPaint", d.trim, { p: [0, h - 0.6, 0] });
  const fz = d.front === "-z" ? -1 : 1;
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.22 : 0.5;
    const a = (i / 10) * TAU + Math.PI / 2;
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const cols = ["#f2c14e", "#f28da0", "#ffffff"];
  for (let i = 0; i < 3; i++) P.add(new THREE.ShapeGeometry(star), "matte", cols[i], { p: [(-0.3 + i * 0.3) * w, h * 0.5, fz * (dd / 2 + 0.01)], r: [0, fz < 0 ? Math.PI : 0, 0.2 * i], cast: false });
  // latch
  P.add(rbox(0.5, 0.6, 0.12, 0.05, 1), "metal", "#e0b04a", { p: [0, h - 0.6, fz * (dd / 2 + 0.08)] });
};

B.pillow = (P, d, dyn) => {
  const g = new THREE.Group();
  g.position.set(d.x, d.y, d.z);
  const inner = new THREE.Group();
  g.add(inner);
  const m = new THREE.Mesh(worldUV(blob(d.w, d.h, d.d, 5, 2.4), KINDS.fabric.density), mat("fabric", d.color));
  m.position.y = d.h / 2;
  m.castShadow = m.receiveShadow = true;
  inner.add(m);
  // corner tufts + a stitched seam around the middle
  const seam = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 4, 64), mat("matte", "#c9b89a"));
  seam.rotation.x = Math.PI / 2;
  seam.scale.set(d.w / 2 - 0.05, d.d / 2 - 0.05, 1);
  seam.position.y = d.h / 2;
  inner.add(seam);
  dyn.push(squashable(g, inner, d));
};
B.cushion = (P, d, dyn) => {
  const g = new THREE.Group();
  g.position.set(d.x, d.y, d.z);
  const inner = new THREE.Group();
  g.add(inner);
  const m = new THREE.Mesh(worldUV(blob(d.w, d.h, d.d, 7, 2.6), KINDS.fabric.density), mat("fabric", d.color));
  m.position.y = d.h / 2;
  m.castShadow = m.receiveShadow = true;
  inner.add(m);
  // button tuft in the middle
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 14), mat("felt", "#f4e3b2"));
  b.position.y = d.h + 0.0;
  inner.add(b);
  dyn.push(squashable(g, inner, d));
};
B.laundry = (P, d, dyn) => {
  const g = new THREE.Group();
  g.position.set(d.x, d.y, d.z);
  const inner = new THREE.Group();
  g.add(inner);
  const r = rng(d.seed || 3);
  const cols = ["#f4f0e6", "#9fd0ff", "#f28da0", "#f2c14e", "#7fb5c9", "#e07a5f"];
  for (let i = 0; i < 9; i++) {
    const w = d.w * (0.35 + r() * 0.35);
    const dd = d.d * (0.35 + r() * 0.35);
    const hh = d.h * (0.35 + r() * 0.3);
    const m = new THREE.Mesh(worldUV(blob(w, hh, dd, 3 + r() * 3, 2.2), KINDS.fabric.density), mat(r() > 0.5 ? "fabric" : "knit", cols[i % cols.length]));
    const top = i > 5;
    m.position.set((r() - 0.5) * (d.w - w) * 0.9, top ? d.h - hh / 2 - 0.1 : hh / 2 + r() * (d.h - hh) * 0.5, (r() - 0.5) * (d.d - dd) * 0.9);
    m.rotation.set((r() - 0.5) * 0.4, r() * TAU, (r() - 0.5) * 0.4);
    m.castShadow = m.receiveShadow = true;
    inner.add(m);
  }
  dyn.push(squashable(g, inner, d));
};
function squashable(g, inner, d) {
  return {
    obj: g,
    box: d.box,
    t: 1,
    amp: 0,
    bounce(strength = 1) {
      this.t = 0;
      this.amp = clamp(strength / 10, 0.25, 0.8);
    },
    update(dt) {
      if (this.t >= 1) {
        inner.scale.set(1, 1, 1);
        return;
      }
      this.t = Math.min(1, this.t + dt / 0.55);
      const k = Math.exp(-this.t * 5) * Math.cos(this.t * 18) * this.amp * 0.32;
      inner.scale.set(1 + k * 0.4, 1 - k, 1 + k * 0.4);
    },
  };
}

B.chair = (P, d) => {
  P.frame(d.x, 0, d.z);
  const s = d.s;
  const hx = s / 2;
  const lg = 0.4;
  const col = d.color;
  for (const [lx, lz] of [
    [-hx + lg / 2, -hx + lg / 2],
    [hx - lg / 2, -hx + lg / 2],
    [-hx + lg / 2, hx - lg / 2],
    [hx - lg / 2, hx - lg / 2],
  ])
    P.add(cyl(0.19, 0.17, d.sh - 0.3, 14), "wood", col, { p: [lx, (d.sh - 0.3) / 2, lz] });
  P.add(rbox(s + 0.1, 0.34, s + 0.1, 0.12, 2), "wood", col, { p: [0, d.sh - 0.17, 0] });
  // stretchers (sides + front/back)
  P.add(rbox(0.24, 0.24, s - 0.16, 0.08, 1), "wood", col, { p: [-hx + 0.2, d.sy - 0.12, 0] });
  P.add(rbox(0.24, 0.24, s - 0.16, 0.08, 1), "wood", col, { p: [hx - 0.2, d.sy - 0.12, 0] });
  // backrest: two posts + a rounded panel with a cut-heart decal
  const back = d.back;
  const ax = back === "+x" || back === "-x";
  const sg = back === "+z" || back === "+x" ? 1 : -1;
  const ph = d.bh - d.sh;
  for (const k of [-1, 1]) {
    const px = ax ? sg * (hx - 0.2) : k * (hx - 0.2);
    const pz = ax ? k * (hx - 0.2) : sg * (hx - 0.2);
    P.add(cyl(0.18, 0.19, ph, 12), "wood", col, { p: [px, d.sh + ph / 2, pz] });
  }
  const pw = s - 0.3;
  const panel = rbox(ax ? 0.3 : pw, ph * 0.55, ax ? pw : 0.3, 0.12, 2);
  P.add(panel, "wood", col, { p: [ax ? sg * (hx - 0.2) : 0, d.sh + ph * 0.66, ax ? 0 : sg * (hx - 0.2)] });
  P.add(rbox(ax ? 0.26 : pw * 0.92, 0.3, ax ? pw * 0.92 : 0.26, 0.1, 1), "wood", col, { p: [ax ? sg * (hx - 0.2) : 0, d.sh + ph * 0.18, ax ? 0 : sg * (hx - 0.2)] });
};

B.desk = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  P.frame(cx, 0, cz);
  const w = x1 - x0;
  const dd = z1 - z0;
  P.add(rbox(w, 0.4, dd, 0.12, 2), "wood", d.color, { p: [0, h - 0.2, 0] });
  // apron under the top
  P.add(new THREE.BoxGeometry(w - 1.2, 0.9, 0.2), "wood", d.color, { p: [0, h - 0.85, dd / 2 - 0.4] });
  const lg = 0.6;
  const legs = [];
  if (d.drawers !== "left") legs.push([-w / 2 + lg / 2, -dd / 2 + lg / 2], [-w / 2 + lg / 2, dd / 2 - lg / 2]);
  if (d.drawers !== "right") legs.push([w / 2 - lg / 2, -dd / 2 + lg / 2], [w / 2 - lg / 2, dd / 2 - lg / 2]);
  for (const [lx, lz] of legs) P.add(rbox(lg, h - 0.4, lg, 0.1, 1), "wood", d.color, { p: [lx, (h - 0.4) / 2, lz] });
  if (d.drawers) {
    const sx = d.drawers === "right" ? 1 : -1;
    const dx = sx * (w / 2 - d.dw / 2);
    P.add(rbox(d.dw, h - 0.4, dd, 0.1, 1), "wood", d.color, { p: [dx, (h - 0.4) / 2, 0] });
    const n = 3;
    const dh = (h - 0.9) / n;
    for (let i = 0; i < n; i++) {
      const y = 0.35 + dh * i + dh / 2;
      P.add(rbox(d.dw - 0.4, dh - 0.22, 0.14, 0.06, 1), "woodPaint", "#f4e7cf", { p: [dx, y, dd / 2 + 0.04] });
      P.add(new THREE.SphereGeometry(0.17, 12, 10), "wood", d.knob, { p: [dx, y, dd / 2 + 0.18] });
    }
  }
};

B.bed = (P, d, dyn) => {
  const { x0, x1, z0, z1, top, frameY, railTop } = d;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const dd = z1 - z0;
  P.frame(cx, 0, cz);
  const lg = 0.8;
  for (const [lx, lz] of [
    [-w / 2 + lg / 2, -dd / 2 + lg / 2],
    [w / 2 - lg / 2, -dd / 2 + lg / 2],
    [-w / 2 + lg / 2, dd / 2 - lg / 2],
    [w / 2 - lg / 2, dd / 2 - lg / 2],
  ])
    P.add(rbox(lg, railTop + 0.3, lg, 0.15, 2), "wood", d.color, { p: [lx, (railTop + 0.3) / 2, lz] });
  P.add(rbox(w, railTop - frameY, dd, 0.14, 2), "wood", d.color, { p: [0, (frameY + railTop) / 2, 0] });
  // headboard with a rounded top
  const hbz = d.hb === "-z" ? -dd / 2 - 0.3 : dd / 2 + 0.3;
  P.add(rbox(w, d.hbH - 1.2, 0.6, 0.25, 3), "wood", d.color, { p: [0, (d.hbH - 1.2) / 2, hbz] });
  P.add(cyl(0.6, 0.6, w, 24), "wood", d.color, { p: [0, d.hbH - 1.2, hbz], r: [0, 0, Math.PI / 2], s: [1, 1, 0.5] });
  // a painted moon + stars on the headboard
  const sg = d.hb === "-z" ? 1 : -1;
  P.add(new THREE.CircleGeometry(1.2, 24), "matte", "#f2d16b", { p: [w * 0.22, d.hbH - 3.4, hbz + sg * 0.31], r: [0, sg > 0 ? 0 : Math.PI, 0], cast: false });
  P.add(new THREE.CircleGeometry(1.05, 24), "matte", d.color, { p: [w * 0.22 + 0.5, d.hbH - 3.2, hbz + sg * 0.315], r: [0, sg > 0 ? 0 : Math.PI, 0], cast: false });
  // mattress + sheet (dynamic so it can give a little when bounced on)
  const g = new THREE.Group();
  g.position.set(cx, railTop, cz);
  const inner = new THREE.Group();
  g.add(inner);
  const mw = w - 0.6;
  const md = dd - 0.6;
  const mh = top - railTop;
  const mattress = new THREE.Mesh(worldUV(rbox(mw, mh * 0.7, md, 0.35, 3), KINDS.fabric.density), mat("fabric", d.sheet));
  mattress.position.y = mh * 0.35;
  mattress.castShadow = mattress.receiveShadow = true;
  inner.add(mattress);
  // quilt over the top 2/3 of the bed, draped over the hanging side
  const qt = quiltTexture(d.blanket, d.blanket2);
  const qm = getLabelMat(`label:${qt.uuid}`, qt, 0.95, {});
  qt.wrapS = qt.wrapT = THREE.RepeatWrapping;
  const qLen = md * 0.72;
  const quilt = new THREE.Mesh(rbox(mw + 0.2, mh * 0.35, qLen, 0.16, 2), qm);
  setBoxUV(quilt.geometry, 0.25);
  quilt.position.set(0, mh * 0.7 + mh * 0.13, md / 2 - qLen / 2 + 0.1);
  quilt.castShadow = quilt.receiveShadow = true;
  inner.add(quilt);
  if (d.cloth != null) {
    const hs = d.hang === "+x" ? 1 : -1;
    const drapeH = top - 0.6;
    const dLen = (d.hz1 ?? z1 - 1.2) - (d.hz0 ?? z0 + 2);
    const drape = new THREE.Mesh(clothGeo(dLen, drapeH, 0.12, Math.max(4, Math.round(dLen))), qm);
    setBoxUV(drape.geometry, 0.25);
    drape.rotation.y = hs > 0 ? Math.PI / 2 : -Math.PI / 2;
    drape.position.set(hs * (w / 2 + 0.02), top - railTop - drapeH / 2 + 0.05, ((d.hz0 ?? z0 + 2) + (d.hz1 ?? z1 - 1.2)) / 2 - cz);
    drape.castShadow = drape.receiveShadow = true;
    g.add(drape);
  }
  dyn.push(squashable(g, inner, { box: d.box }));
};
/** a hanging cloth panel with soft vertical folds */
function clothGeo(w, h, t, folds) {
  const g = new THREE.BoxGeometry(w, h, t, folds * 4, 4, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const k = Math.sin((x / w) * folds * Math.PI) * 0.09 * (0.4 + (0.5 - y / h) * 0.8);
    p.setZ(i, p.getZ(i) + k);
  }
  g.computeVertexNormals();
  return g;
}
function setBoxUV(geo, density) {
  worldUV(geo, density);
}

B.shelf = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  const t = 0.4;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  P.frame(cx, 0, cz);
  const w = x1 - x0;
  const dd = z1 - z0;
  const alongX = d.open === "+z" || d.open === "-z";
  if (alongX) {
    P.add(rbox(t, h, dd, 0.08, 1), "woodPaint", d.color, { p: [-w / 2 + t / 2, h / 2, 0] });
    P.add(rbox(t, h, dd, 0.08, 1), "woodPaint", d.color, { p: [w / 2 - t / 2, h / 2, 0] });
    P.add(new THREE.BoxGeometry(w - 0.1, h - 0.1, 0.25), "woodPaint", d.inner, { p: [0, h / 2, d.open === "+z" ? -dd / 2 + 0.125 : dd / 2 - 0.125] });
  } else {
    P.add(rbox(w, h, t, 0.08, 1), "woodPaint", d.color, { p: [0, h / 2, -dd / 2 + t / 2] });
    P.add(rbox(w, h, t, 0.08, 1), "woodPaint", d.color, { p: [0, h / 2, dd / 2 - t / 2] });
    P.add(new THREE.BoxGeometry(0.25, h - 0.1, dd - 0.1), "woodPaint", d.inner, { p: [d.open === "+x" ? -w / 2 + 0.125 : w / 2 - 0.125, h / 2, 0] });
  }
  for (const top of d.boards) {
    const y0 = top === d.boards[0] ? 0 : top - t;
    P.add(rbox(w + (alongX ? 0 : 0.1), top - y0, dd + (alongX ? 0.1 : 0), 0.07, 1), "woodPaint", d.color, { p: [0, (top + y0) / 2, 0] });
  }
};

B.nightstand = (P, d) => {
  P.frame(d.x, 0, d.z);
  P.add(rbox(d.w, d.h - 0.4, d.d, 0.12, 2), "wood", d.color, { p: [0, (d.h - 0.4) / 2, 0] });
  P.add(rbox(d.w + 0.2, 0.4, d.d + 0.2, 0.12, 2), "wood", d.color, { p: [0, d.h - 0.2, 0] });
  const fz = d.front === "-z" ? -1 : 1;
  for (const y of [d.h * 0.3, d.h * 0.66]) {
    P.add(rbox(d.w - 0.5, d.h * 0.28, 0.12, 0.05, 1), "woodPaint", "#f4e7cf", { p: [0, y, fz * (d.d / 2 + 0.03)] });
    P.add(new THREE.SphereGeometry(0.17, 12, 10), "wood", "#8a5a3a", { p: [0, y, fz * (d.d / 2 + 0.17)] });
  }
};

B.alarmClock = (P, d) => {
  P.frame(d.x, d.y, d.z, (d.rot || 0) * (Math.PI / 2));
  P.add(cyl(0.8, 0.8, 0.7, 24), "plastic", d.color, { p: [0, 1.0, 0], r: [Math.PI / 2, 0, 0] });
  P.add(new THREE.CircleGeometry(0.66, 24), "plastic", "#fffaf0", { p: [0, 1.0, 0.36], cast: false });
  for (const s of [-1, 1]) {
    P.add(new THREE.SphereGeometry(0.32, 14, 10, 0, TAU, 0, Math.PI / 2), "metal", "#e0b04a", { p: [s * 0.5, 1.68, 0], r: [0, 0, s * 0.5] });
    P.add(cyl(0.06, 0.06, 0.4, 8), "metal", "#c9ccd2", { p: [s * 0.45, 0.2, 0], r: [0, 0, s * 0.4] });
  }
  P.add(new THREE.BoxGeometry(0.06, 0.45, 0.02), "matte", "#2a2a2e", { p: [0.1, 1.14, 0.38], r: [0, 0, -0.5], cast: false });
  P.add(new THREE.BoxGeometry(0.06, 0.32, 0.02), "matte", "#2a2a2e", { p: [-0.05, 1.08, 0.38], r: [0, 0, 1.2], cast: false });
};

B.wardrobe = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  P.frame((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const w = x1 - x0;
  const dd = z1 - z0;
  P.add(rbox(w, h - 0.8, dd, 0.15, 2), "woodPaint", d.color, { p: [0, (h - 0.8) / 2 + 0.6, 0] });
  P.add(rbox(w + 0.5, 0.6, dd + 0.5, 0.15, 2), "woodPaint", d.color, { p: [0, h - 0.1, 0] });
  P.add(rbox(w - 0.3, 0.6, dd - 0.3, 0.1, 1), "wood", "#b8875a", { p: [0, 0.3, 0] });
  const fx = d.front === "-x" ? -1 : d.front === "+x" ? 1 : 0;
  const fz = d.front === "-z" ? -1 : d.front === "+z" ? 1 : 0;
  const along = fx !== 0 ? dd : w;
  for (const k of [-1, 1]) {
    const c = (k * along) / 4;
    const panel = rbox(fx !== 0 ? 0.15 : along / 2 - 0.5, h - 3, fx !== 0 ? along / 2 - 0.5 : 0.15, 0.08, 1);
    P.add(panel, "woodPaint", "#f6ecda", { p: [fx * (w / 2 + 0.05), h / 2 + 0.3, fz !== 0 ? fz * (dd / 2 + 0.05) : c].map((v, i) => (i === 0 && fx === 0 ? c : v)) });
    const hx = fx !== 0 ? fx * (w / 2 + 0.25) : k * 0.5;
    const hz = fz !== 0 ? fz * (dd / 2 + 0.25) : k * 0.5;
    P.add(cyl(0.12, 0.12, 2.4, 10), "metal", "#e0b04a", { p: [hx, h * 0.52, hz] });
  }
};

B.teddy = (P, d, dyn) => {
  const s = d.s;
  const g = new THREE.Group();
  g.position.set(d.x, 0, d.z);
  g.rotation.y = d.rot || 0;
  const inner = new THREE.Group();
  g.add(inner);
  const fur = mat("felt", d.color);
  const furLight = mat("felt", "#ead2b0");
  const add = (geo, m, p, r) => {
    const o = new THREE.Mesh(worldUV(geo, KINDS.felt.density), m);
    o.position.set(p[0] * s, p[1] * s, p[2] * s);
    if (r) o.rotation.set(...r);
    o.castShadow = o.receiveShadow = true;
    inner.add(o);
    return o;
  };
  add(blob(6.6 * s, 6.2 * s, 5.6 * s, 2.3, 2.2), fur, [0, 3.0, 0]);
  add(blob(4 * s, 3.6 * s, 0.6 * s, 2.2, 2.2), furLight, [0, 2.9, 2.6]);
  // legs sticking forward
  for (const k of [-1, 1]) {
    add(blob(2.2 * s, 2.0 * s, 3.4 * s, 2.2, 2.2), fur, [k * 2.0, 1.0, 2.2]);
    add(blob(1.7 * s, 1.7 * s, 0.4 * s, 2, 2), furLight, [k * 2.0, 1.05, 3.9]);
    // arms
    add(blob(1.6 * s, 3.6 * s, 1.7 * s, 2.2, 2.2), fur, [k * 3.4, 3.4, 0.6], [0.4, 0, k * 0.5]);
  }
  // head
  add(blob(5 * s, 4.6 * s, 4.6 * s, 2.2, 2.2), fur, [0, 7.4, 0.2]);
  add(blob(2.2 * s, 1.6 * s, 1.6 * s, 2.2, 2.2), furLight, [0, 6.9, 2.3]);
  for (const k of [-1, 1]) {
    add(blob(1.6 * s, 1.6 * s, 0.7 * s, 2, 2), fur, [k * 2.0, 9.3, 0]);
    add(blob(0.9 * s, 0.9 * s, 0.3 * s, 2, 2), furLight, [k * 2.0, 9.3, 0.3]);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32 * s, 14, 10), mat("glossy", "#1d2230"));
    eye.position.set(k * 0.95 * s, 7.85 * s, 2.25 * s);
    inner.add(eye);
  }
  const nose = new THREE.Mesh(blob(0.7 * s, 0.45 * s, 0.4 * s, 2, 2), mat("glossy", "#3a2a24"));
  nose.position.set(0, 7.25 * s, 3.1 * s);
  inner.add(nose);
  // bow tie
  for (const k of [-1, 1]) {
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.6 * s, 1.0 * s, 4), mat("fabric", "#d9473b"));
    bow.rotation.set(0, 0, (k * Math.PI) / 2);
    bow.position.set(k * 0.55 * s, 5.4 * s, 2.35 * s);
    inner.add(bow);
  }
  dyn.push(squashable(g, inner, { box: d.box }));
};

B.mug = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(lathe([[0, 0], [d.r * 0.92, 0], [d.r, 0.08], [d.r, d.h], [d.r * 0.86, d.h], [d.r * 0.86, 0.12], [0, 0.12]], 28), "ceramic", d.color, {});
  P.add(new THREE.TorusGeometry(d.r * 0.42, 0.09, 8, 16, Math.PI * 1.2), "ceramic", d.color, { p: [d.r + 0.12, d.h * 0.52, 0], r: [0, 0, -Math.PI * 0.6] });
  P.add(cyl(d.r * 1.002, d.r * 1.002, d.h * 0.18, 28, true), "ceramic", d.accent, { p: [0, d.h * 0.62, 0], cast: false });
  P.add(cyl(d.r * 0.85, d.r * 0.85, 0.02, 24), "glossy", "#6b3f25", { p: [0, d.h * 0.72, 0], cast: false });
};

B.pencilCup = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(cyl(d.r, d.r * 0.92, d.h, 24, false), "metal", d.color, { p: [0, d.h / 2, 0] });
  const cols = ["#f2c14e", "#e85d4a", "#3f7fd6", "#6a8f3f", "#f2c14e"];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    const tilt = 0.18;
    P.add(cyl(0.12, 0.12, d.h + 1.4, 6), "wood", cols[i], { p: [Math.cos(a) * d.r * 0.45, d.h / 2 + 0.7, Math.sin(a) * d.r * 0.45], r: [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt] });
  }
};

B.pencil = (P, d) => {
  P.frame(d.x, d.y, d.z, d.axis === "z" ? Math.PI / 2 : 0);
  const L = d.len;
  const r = 0.17;
  const f = d.flip ? -1 : 1;
  // hexagonal painted body (along local x)
  P.add(cyl(r, r, L - 0.9, 6), "woodPaint", d.color, { p: [f * -0.2, r, 0], r: [0, 0, Math.PI / 2] });
  // sharpened wood cone + graphite tip
  P.add(new THREE.ConeGeometry(r, 0.55, 6), "wood", "#e9c9a0", { p: [f * (L / 2 - 0.42), r, 0], r: [0, 0, -f * Math.PI / 2] });
  P.add(new THREE.ConeGeometry(0.06, 0.2, 6), "matte", "#3a3a3e", { p: [f * (L / 2 - 0.1), r, 0], r: [0, 0, -f * Math.PI / 2], cast: false });
  // ferrule + eraser
  P.add(cyl(r * 1.04, r * 1.04, 0.22, 10), "metal", "#d4d7dc", { p: [f * -(L / 2 - 0.35), r, 0], r: [0, 0, Math.PI / 2] });
  P.add(cyl(r, r, 0.22, 10), "rubber", "#f28da0", { p: [f * -(L / 2 - 0.12), r, 0], r: [0, 0, Math.PI / 2] });
};

B.ruler = (P, d) => {
  P.frame(d.x, d.y, d.z, d.axis === "z" ? Math.PI / 2 : 0);
  P.add(new THREE.BoxGeometry(d.len, 0.06, 0.42), "plastic", d.color, { p: [0, 0.03, 0] });
  const n = Math.floor(d.len / 0.1);
  for (let i = 0; i <= n; i += 1) {
    const big = i % 10 === 0;
    P.add(new THREE.BoxGeometry(0.012, 0.005, big ? 0.16 : i % 5 === 0 ? 0.11 : 0.07), "matte", "#5b4a3a", { p: [-d.len / 2 + i * 0.1, 0.062, -0.21 + (big ? 0.08 : 0.04)], cast: false });
  }
};

B.eraser = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(rbox(1.0, 0.35, 0.6, 0.08, 2), "rubber", d.color, { p: [0, 0.175, 0] });
  P.add(new THREE.BoxGeometry(0.5, 0.37, 0.62), "paper", "#3f7fd6", { p: [0.18, 0.175, 0] });
};

B.crayons = (P, d) => {
  const r = rng(d.seed || 1);
  const cols = ["#e85d4a", "#3f7fd6", "#f2c14e", "#6a8f3f", "#8a5aa8", "#f28da0"];
  for (let i = 0; i < 5; i++) {
    P.frame(d.x + (r() - 0.5) * 2.2, d.y, d.z + (r() - 0.5) * 2.2, r() * TAU);
    P.add(cyl(0.11, 0.11, 0.95, 8), "plastic", cols[i % cols.length], { p: [0, 0.11, 0], r: [0, 0, Math.PI / 2], cast: false });
    P.add(new THREE.ConeGeometry(0.11, 0.2, 8), "plastic", cols[i % cols.length], { p: [0.57, 0.11, 0], r: [0, 0, -Math.PI / 2], cast: false });
  }
};

B.sock = (P, d) => {
  P.frame(d.x, d.y, d.z, d.rot || 0);
  P.add(blob(2.4, 0.22, 0.8, 3, 2), "knit", d.color, { p: [0, 0.11, 0], cast: false });
  P.add(blob(0.9, 0.22, 1.3, 3, 2), "knit", d.color, { p: [1.0, 0.11, 0.35], r: [0, 0.4, 0], cast: false });
  for (const k of [-0.6, -0.2]) P.add(blob(0.16, 0.24, 0.84, 2, 2), "knit", d.stripe, { p: [k, 0.11, 0], cast: false });
};

B.plant = (P, d, dyn) => {
  P.frame(d.x, d.y, d.z);
  const r = d.r;
  const h = d.h;
  P.add(lathe([[0, 0], [r * 0.72, 0], [r * 0.85, h * 0.8], [r, h * 0.82], [r, h], [r * 0.88, h], [r * 0.82, h * 0.86], [0, h * 0.86]], 26), "ceramic", d.color, {});
  P.add(cyl(r * 0.82, r * 0.82, 0.05, 20), "soil", "#6b4a35", { p: [0, h * 0.86, 0], cast: false });
  // leaves: a dynamic group so they sway softly
  const g = new THREE.Group();
  g.position.set(d.x, d.y + h * 0.86, d.z);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.quadraticCurveTo(0.45, 0.5, 0, 1.6);
  leafShape.quadraticCurveTo(-0.45, 0.5, 0, 0);
  const lg = new THREE.ShapeGeometry(leafShape, 6);
  const lm = mat("matte", d.leaf, { side: THREE.DoubleSide });
  const lm2 = mat("matte", shade(d.leaf, 1.18), { side: THREE.DoubleSide });
  const rr = rng(Math.floor(d.x * 13 + d.z * 7));
  const leaves = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const piv = new THREE.Group();
    const a = (i / n) * TAU + rr() * 0.5;
    piv.rotation.set(0, a, 0);
    const leaf = new THREE.Mesh(lg, i % 2 ? lm : lm2);
    const sc = d.size * (0.7 + rr() * 0.5);
    leaf.scale.set(sc, sc * (1 + rr() * 0.4), sc);
    leaf.rotation.set(-(0.35 + rr() * 0.6), 0, 0);
    leaf.castShadow = true;
    piv.add(leaf);
    g.add(piv);
    leaves.push({ leaf, base: leaf.rotation.x, ph: rr() * TAU });
  }
  dyn.push({
    obj: g,
    geos: [lg],
    t: 0,
    update(dt, ctx) {
      this.t += dt;
      const k = ctx.motion ? 1 : 0.2;
      for (const L of leaves) L.leaf.rotation.x = L.base + Math.sin(this.t * 0.9 + L.ph) * 0.05 * k;
    },
  });
};
function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
}

B.lamp = (P, d, dyn) => {
  P.frame(d.x, d.y, d.z);
  P.add(cyl(1.0, 1.1, 0.35, 28), "metal", d.color, { p: [0, 0.175, 0] });
  const h = d.h;
  P.add(cyl(0.12, 0.12, h - 1.2, 12), "metal", "#d9dde3", { p: [0, (h - 1.2) / 2 + 0.3, 0] });
  // arm reaching out from the top of the pole to the shade
  const dx = Math.sin(d.dir) * d.reach;
  const dz = Math.cos(d.dir) * d.reach;
  const a0 = new THREE.Vector3(0, h - 0.9, 0);
  const a1 = new THREE.Vector3(dx, h - 0.35, dz);
  const dir = a1.clone().sub(a0);
  const armLen = dir.length();
  const qa = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  const ea = new THREE.Euler().setFromQuaternion(qa);
  P.add(cyl(0.1, 0.1, armLen, 10), "metal", "#d9dde3", { p: [(a0.x + a1.x) / 2, (a0.y + a1.y) / 2, (a0.z + a1.z) / 2], r: [ea.x, ea.y, ea.z] });
  P.add(new THREE.SphereGeometry(0.22, 12, 10), "metal", d.color, { p: [0, h - 0.9, 0] });
  const shadeG = lathe([[0.35, 0.6], [0.5, 0.5], [1.3, -0.5], [1.2, -0.55], [0.42, 0.42], [0.3, 0.5]], 28);
  P.add(shadeG, "metal", d.color, { p: [dx, h - 0.4, dz] });
  if (d.on) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), mat("glow", "#fff1c9"));
    bulb.position.set(d.x + dx, d.y + h - 0.85, d.z + dz);
    dyn.push({ obj: bulb, update() {} });
  }
};

B.globe = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(cyl(0.9, 0.9, 0.4, 20), "wood", "#8a5a3a", { p: [0, 0.2, 0] });
  P.add(cyl(0.08, 0.08, d.r * 2.2, 8), "metal", "#e0b04a", { p: [0, d.r + 0.5, 0], r: [0, 0, 0.4] });
  P.add(new THREE.SphereGeometry(d.r, 24, 16), "glossy", "#4f8fc9", { p: [0, d.r + 0.6, 0] });
};

B.curtains = (P, d, dyn) => {
  // two fabric panels gathered at the window sides + the rod; they sway softly
  const g = new THREE.Group();
  const { wall, c, y, w, h } = d;
  const panels = [];
  const m = mat("fabric", d.color, { side: THREE.DoubleSide });
  const pw = 3.6;
  const geo = clothGeo(pw, h, 0.05, 6);
  worldUV(geo, KINDS.fabric.density);
  for (const s of [-1, 1]) {
    const piv = new THREE.Group();
    const cloth = new THREE.Mesh(geo, m);
    cloth.position.y = -h / 2;
    cloth.castShadow = true;
    piv.add(cloth);
    piv.position.set(localAlong(wall, c) + s * (w / 2 + 2.5), y + h - 0.3, 0);
    g.add(piv);
    panels.push({ piv, s });
  }
  const rod = new THREE.Mesh(cyl(0.12, 0.12, w + 10, 10), mat("metal", "#c9a24a"));
  rod.rotation.z = Math.PI / 2;
  rod.position.set(localAlong(wall, c), y + h - 0.2, 0);
  g.add(rod);
  placeOnWall(g, wall, d.room, 0.6);
  dyn.push({
    obj: g,
    geos: [geo],
    t: 0,
    update(dt, ctx) {
      this.t += dt;
      const k = ctx.motion ? 1 : 0.15;
      for (const p of panels) {
        p.piv.rotation.x = (Math.sin(this.t * 0.7 + p.s) * 0.025 + Math.sin(this.t * 1.9 + p.s * 2) * 0.008) * k;
        p.piv.rotation.z = Math.sin(this.t * 0.5 + p.s * 1.3) * 0.01 * k;
      }
    },
  });
};

/** place a group authored in wall-local coords (x along the wall, z out of it) */
function placeOnWall(g, wall, room, off = 0.05) {
  if (!room) return;
  if (wall === "back") {
    g.position.z = room.z0 + off;
  } else if (wall === "front") {
    g.rotation.y = Math.PI;
    g.position.z = room.z1 - off;
  } else if (wall === "left") {
    g.rotation.y = Math.PI / 2;
    g.position.x = room.x0 + off;
  } else if (wall === "right") {
    g.rotation.y = -Math.PI / 2;
    g.position.x = room.x1 - off;
  }
}
/** wall-local frame for static parts: c = WORLD coordinate along the wall (x for back/front, z for left/right) */
function wallFrame(P, wall, room, c, y, out = 0.05) {
  if (wall === "back") P.frame(c, y, room.z0 + out, 0);
  else if (wall === "front") P.frame(c, y, room.z1 - out, Math.PI);
  else if (wall === "left") P.frame(room.x0 + out, y, c, Math.PI / 2);
  else if (wall === "right") P.frame(room.x1 - out, y, c, -Math.PI / 2);
}
/** along-wall world coordinate → local x inside a group placed with placeOnWall */
function localAlong(wall, c) {
  return wall === "front" || wall === "left" ? -c : c;
}

B.frame = (P, d) => {
  wallFrame(P, d.wall, d.room, d.c, d.y, 0.05);
  P.add(rbox(d.w + 0.6, d.h + 0.6, 0.3, 0.1, 1), "wood", d.color, { p: [0, 0, 0.15] });
  const tex = artTexture(d.art);
  const lm = labelMat(tex, 0.85);
  P.add(new THREE.PlaneGeometry(d.w, d.h), "label", "#fff", { p: [0, 0, 0.32], uv: "own", matKey: lm.key, material: lm.material, cast: false });
};

B.wallClock = (P, d, dyn) => {
  wallFrame(P, d.wall, d.room, d.c, d.y, 0.05);
  P.add(cyl(d.r + 0.25, d.r + 0.25, 0.4, 36), "woodPaint", "#f2c14e", { p: [0, 0, 0.2], r: [Math.PI / 2, 0, 0] });
  P.add(new THREE.CircleGeometry(d.r, 36), "plastic", "#fffaf0", { p: [0, 0, 0.41], cast: false });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    P.add(new THREE.BoxGeometry(0.1, i % 3 ? 0.22 : 0.42, 0.02), "matte", "#5b4a3a", { p: [Math.sin(a) * (d.r - 0.35), Math.cos(a) * (d.r - 0.35), 0.42], r: [0, 0, -a], cast: false });
  }
  // hands (dynamic: real time)
  const g = new THREE.Group();
  const hour = new THREE.Mesh(new THREE.BoxGeometry(0.14, d.r * 0.55, 0.03), mat("matte", "#3a2a24"));
  hour.geometry.translate(0, d.r * 0.25, 0);
  const min = new THREE.Mesh(new THREE.BoxGeometry(0.1, d.r * 0.8, 0.03), mat("matte", "#3a2a24"));
  min.geometry.translate(0, d.r * 0.38, 0);
  const sec = new THREE.Mesh(new THREE.BoxGeometry(0.04, d.r * 0.85, 0.02), mat("matte", "#d9473b"));
  sec.geometry.translate(0, d.r * 0.35, 0);
  hour.position.z = 0.44;
  min.position.z = 0.46;
  sec.position.z = 0.48;
  g.add(hour, min, sec);
  const g2 = new THREE.Group();
  g2.add(g);
  g.position.set(localAlong(d.wall, d.c), d.y, 0);
  placeOnWall(g2, d.wall, d.room, 0.05);
  dyn.push({
    obj: g2,
    geos: [hour.geometry, min.geometry, sec.geometry],
    update() {
      const now = new Date();
      const s = now.getSeconds() + now.getMilliseconds() / 1000;
      const m = now.getMinutes() + s / 60;
      const h = (now.getHours() % 12) + m / 60;
      sec.rotation.z = -(Math.floor(s) / 60) * TAU;
      min.rotation.z = -(m / 60) * TAU;
      hour.rotation.z = -(h / 12) * TAU;
    },
  });
};

B.wallShelf = (P, d) => {
  wallFrame(P, d.wall, d.room, d.c, d.y, 0);
  P.add(rbox(d.w, 0.35, 2.2, 0.08, 1), "woodPaint", d.color, { p: [0, 0, 1.1] });
  for (const k of [-0.35, 0.35]) P.add(new THREE.BoxGeometry(0.3, 1.4, 1.6), "woodPaint", d.color, { p: [k * d.w, -0.8, 0.8] });
  // a few toys sitting up there (unreachable — pure scale cues)
  const r = rng(7);
  const cols = ["#e85d4a", "#4fb3a8", "#f2c14e", "#8a5aa8"];
  let u = -d.w / 2 + 1;
  while (u < d.w / 2 - 1) {
    const kind = Math.floor(r() * 3);
    const col = cols[Math.floor(r() * cols.length)];
    if (kind === 0) P.add(rbox(1.1, 1.1, 1.1, 0.08, 1), "woodPaint", col, { p: [u, 0.73, 1.0], r: [0, r(), 0] });
    else if (kind === 1) P.add(new THREE.SphereGeometry(0.7, 18, 12), "plastic", col, { p: [u, 0.88, 1.0] });
    else {
      P.add(blob(1.2, 1.4, 1.0, 2.2, 2.2), "felt", "#c98d5a", { p: [u, 0.88, 1.0] });
      P.add(blob(0.9, 0.9, 0.9, 2.2, 2.2), "felt", "#c98d5a", { p: [u, 1.9, 1.0] });
    }
    u += 1.6 + r() * 1.4;
  }
};

B.ceilingLamp = (P, d) => {
  const top = d.room ? d.room.h : 26;
  P.frame(d.x, top, d.z);
  P.add(cyl(0.08, 0.08, 4, 6), "metal", "#d9dde3", { p: [0, -2, 0], cast: false });
  P.add(cyl(2.6, 3.2, 2.6, 32, true), "fabric", d.color, { p: [0, -5.2, 0], cast: false, material: mat("fabric", d.color, { side: THREE.DoubleSide }) });
};

B.door = (P, d) => {
  wallFrame(P, d.wall, d.room, d.c, 0, 0.05);
  P.add(rbox(d.w + 1.2, d.h + 0.6, 0.3, 0.08, 1), "woodPaint", "#fff8ee", { p: [0, (d.h + 0.6) / 2, 0.1] });
  P.add(rbox(d.w, d.h, 0.3, 0.08, 1), "woodPaint", d.color, { p: [0, d.h / 2, 0.2] });
  for (const y of [d.h * 0.28, d.h * 0.72]) P.add(rbox(d.w * 0.7, d.h * 0.32, 0.1, 0.06, 1), "woodPaint", shade(d.color, 0.95), { p: [0, y, 0.38], cast: false });
  P.add(new THREE.SphereGeometry(0.45, 14, 10), "metal", "#e0b04a", { p: [d.w * 0.38, d.h * 0.48, 0.6] });
};

B.nightLight = (P, d, dyn) => {
  P.frame(d.x, d.y, d.z);
  P.add(rbox(0.9, 0.5, 0.4, 0.1, 1), "plastic", "#f4f0e6", { p: [0, 0.25, 0] });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12, 0, TAU, 0, Math.PI / 2), mat("glow", d.color));
  glow.position.set(d.x, d.y + 0.5, d.z);
  dyn.push({ obj: glow, update() {} });
};

B.stool = (P, d) => {
  P.frame(d.x, 0, d.z);
  P.add(cyl(d.r, d.r, 0.4, 28), "wood", d.color, { p: [0, d.h - 0.2, 0] });
  P.add(cyl(0.3, 0.45, d.h - 0.3, 14), "wood", d.color, { p: [0, (d.h - 0.3) / 2, 0] });
  P.add(cyl(1.2, 1.3, 0.25, 20), "wood", d.color, { p: [0, 0.125, 0] });
};

B.spring = (P, d, dyn) => {
  const g = new THREE.Group();
  g.position.set(d.x, d.y, d.z);
  const inner = new THREE.Group();
  g.add(inner);
  const coil = new THREE.Mesh(new THREE.TorusKnotGeometry(0.55, 0.07, 120, 8, 1, 6), mat("metal", "#d4d7dc"));
  coil.scale.set(1, 1, 0.9);
  coil.rotation.x = Math.PI / 2;
  coil.position.y = 0.45;
  inner.add(coil);
  const topPad = new THREE.Mesh(cyl(0.8, 0.8, 0.2, 24), mat("plastic", d.color));
  topPad.position.y = d.h - 0.1;
  inner.add(topPad);
  const base = new THREE.Mesh(cyl(0.8, 0.85, 0.15, 24), mat("plastic", d.color));
  base.position.y = 0.075;
  g.add(base);
  for (const o of [coil, topPad, base]) o.castShadow = true;
  dyn.push(squashable(g, inner, d));
};

B.drum = (P, d, dyn) => {
  P.frame(d.x, d.y, d.z);
  P.add(cyl(d.r, d.r, d.h - 0.1, 28), "plastic", d.color, { p: [0, (d.h - 0.1) / 2, 0] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    P.add(new THREE.BoxGeometry(0.06, d.h * 0.8, 0.06), "metal", "#f2c14e", { p: [Math.cos(a) * (d.r + 0.02), d.h / 2, Math.sin(a) * (d.r + 0.02)], r: [0, -a, (i % 2 ? 1 : -1) * 0.5] });
  }
  const g = new THREE.Group();
  g.position.set(d.x, d.y + d.h - 0.1, d.z);
  const inner = new THREE.Group();
  g.add(inner);
  const skin = new THREE.Mesh(cyl(d.r * 1.02, d.r * 1.02, 0.12, 28), mat("plastic", "#f7efe0"));
  skin.position.y = 0.05;
  inner.add(skin);
  dyn.push(squashable(g, inner, d));
};

B.track = (P, d) => {
  // wooden toy train track (visual, flush with the floor)
  const len = Math.hypot(d.x1 - d.x0, d.z1 - d.z0);
  const a = Math.atan2(d.x1 - d.x0, d.z1 - d.z0);
  P.frame((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2, a);
  P.add(new THREE.BoxGeometry(1.4, 0.06, len), "wood", "#e2c08f", { p: [0, 0.03, 0], cast: false });
  for (const s of [-0.38, 0.38]) P.add(new THREE.BoxGeometry(0.14, 0.03, len), "wood", "#b8875a", { p: [s, 0.07, 0], cast: false });
};


B.slipper = (P, d) => {
  P.frame(d.x, 0, d.z, [Math.PI, Math.PI / 2, 0, -Math.PI / 2][d.rot]);
  // local: toe toward -z
  const { L, W, H } = d;
  P.add(rbox(W + 0.1, 0.12, L + 0.1, 0.05, 2), "rubber", "#e9d8c8", { p: [0, 0.06, 0] });
  P.add(rbox(W - 0.2, 0.05, L - 0.3, 0.02, 1), "felt", d.color2, { p: [0, 0.14, 0] });
  // fuzzy toe cap
  const cap = blob(W + 0.16, H * 1.6, L * 0.62, 2.6, 2.4);
  cap.translate(0, 0, 0);
  P.add(cap, "felt", d.color, { p: [0, 0.2, -L * 0.2], s: [1, 0.62, 1] });
  // pompom
  P.add(new THREE.SphereGeometry(0.42, 16, 12), "felt", d.color2, { p: [0, H * 0.95, -L * 0.38] });
};
B.garland = (P, d) => {
  // fabric bunting: a ribbon with little triangle flags, hanging in a zig-zag
  const vertical = true;
  const cx = (d.x0 + d.x1) / 2;
  const cz = (d.z0 + d.z1) / 2;
  const wide = d.x1 - d.x0 > d.z1 - d.z0;
  P.frame(cx, 0, cz, wide ? 0 : Math.PI / 2);
  const len = wide ? d.x1 - d.x0 : d.z1 - d.z0;
  const H = d.y1 - d.y0;
  const n = Math.max(2, Math.floor(H / 0.9));
  P.add(new THREE.BoxGeometry(0.12, H, 0.06), "fabric", "#f4efe6", { p: [-len * 0.3, d.y0 + H / 2, 0] });
  P.add(new THREE.BoxGeometry(0.12, H, 0.06), "fabric", "#f4efe6", { p: [len * 0.3, d.y0 + H / 2, 0] });
  for (let i = 0; i < n; i++) {
    const y = d.y0 + 0.4 + i * ((H - 0.6) / n);
    const tri = new THREE.Shape();
    tri.moveTo(-len * 0.36, 0);
    tri.lineTo(len * 0.36, 0);
    tri.lineTo(0, -0.7);
    P.add(new THREE.ShapeGeometry(tri), "fabric", d.colors[i % d.colors.length], { p: [0, y + 0.35, 0.04], material: mat("fabric", d.colors[i % d.colors.length], { side: THREE.DoubleSide }) });
    P.add(new THREE.BoxGeometry(len * 0.75, 0.06, 0.08), "fabric", "#f4efe6", { p: [0, y + 0.36, 0.02] });
  }
  void vertical;
};
B.plush = (P, d, dyn) => {
  const s = d.s;
  const g = new THREE.Group();
  g.position.set(d.x, d.y, d.z);
  g.rotation.y = d.rot || 0;
  const inner = new THREE.Group();
  g.add(inner);
  const fur = mat("felt", d.color);
  const add = (geo, m, p) => {
    const o = new THREE.Mesh(worldUV(geo, KINDS.felt.density), m);
    o.position.set(p[0] * s, p[1] * s, p[2] * s);
    o.castShadow = o.receiveShadow = true;
    inner.add(o);
    return o;
  };
  if (d.kind === "whale") {
    add(blob(2.6 * s, 1.6 * s, 2.2 * s, 2.2, 2.3), fur, [0, 0.8, 0]);
    add(blob(0.9 * s, 0.3 * s, 0.6 * s, 2, 2), fur, [-1.3, 1.0, 0]);
    for (const k of [-1, 1]) add(new THREE.SphereGeometry(0.1 * s, 10, 8), mat("glossy", "#1d2230"), [0.9, 1.0, k * 0.75]);
  } else {
    add(blob(2.2 * s, 1.5 * s, 2.0 * s, 2.2, 2.2), fur, [0, 0.75, 0]);
    add(blob(1.4 * s, 1.2 * s, 1.3 * s, 2.2, 2.2), fur, [0, 1.6, 0.5]);
    for (const k of [-1, 1]) {
      const ear = add(blob(0.35 * s, d.kind === "bunny" ? 1.1 * s : 0.5 * s, 0.25 * s, 2, 2), fur, [k * 0.35, d.kind === "bunny" ? 2.5 : 2.1, 0.4]);
      ear.rotation.z = k * 0.2;
      add(new THREE.SphereGeometry(0.09 * s, 10, 8), mat("glossy", "#1d2230"), [k * 0.28, 1.72, 1.12]);
    }
    add(new THREE.SphereGeometry(0.1 * s, 10, 8), mat("felt", "#f28da0"), [0, 1.55, 1.16]);
  }
  dyn.push(squashable(g, inner, d));
};
B.dustBunny = (P, d) => {
  P.frame(d.x, 0, d.z);
  P.add(blob(0.8 * d.s, 0.45 * d.s, 0.7 * d.s, 1.6, 1.6), "felt", "#c9c3ba", { p: [0, 0.2 * d.s, 0], cast: false });
  P.add(blob(0.5 * d.s, 0.3 * d.s, 0.45 * d.s, 1.6, 1.6), "felt", "#d6d0c6", { p: [0.35 * d.s, 0.15 * d.s, 0.2 * d.s], cast: false });
};
B.dresser = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  P.frame((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const w = x1 - x0;
  const dd = z1 - z0;
  P.add(rbox(w, h - 0.4, dd, 0.12, 2), "woodPaint", d.color, { p: [0, (h - 0.4) / 2, 0] });
  P.add(rbox(w + 0.3, 0.4, dd + 0.3, 0.12, 2), "woodPaint", d.color, { p: [0, h - 0.2, 0] });
  const fx = d.front === "-x" ? -1 : d.front === "+x" ? 1 : 0;
  const fz = d.front === "-z" ? -1 : d.front === "+z" ? 1 : 0;
  const along = fx ? dd : w;
  const rh = (h - 1.2) / d.rows;
  for (let r = 0; r < d.rows; r++) {
    const y = 0.6 + rh * r + rh / 2;
    for (const k of along > 9 ? [-0.25, 0.25] : [0]) {
      const dw = along > 9 ? along / 2 - 0.4 : along - 0.6;
      P.add(rbox(fx ? 0.16 : dw, rh - 0.25, fx ? dw : 0.16, 0.06, 1), "woodPaint", "#fff8ee", { p: [fx * (w / 2 + 0.03) + (fx ? 0 : k * along), y, fz * (dd / 2 + 0.03) + (fz ? 0 : k * along)] });
      P.add(new THREE.SphereGeometry(0.2, 12, 10), "metal", "#e0b04a", { p: [fx * (w / 2 + 0.25) + (fx ? 0 : k * along), y, fz * (dd / 2 + 0.25) + (fz ? 0 : k * along)] });
    }
  }
};
B.clothes = (P, d) => {
  // a row of hanging clothes: soft panels side by side with sleeves
  const wide = d.x1 - d.x0 >= d.z1 - d.z0;
  const len = wide ? d.x1 - d.x0 : d.z1 - d.z0;
  const H = d.y1 - d.y0;
  P.frame((d.x0 + d.x1) / 2, d.y0, (d.z0 + d.z1) / 2, wide ? 0 : Math.PI / 2);
  const cols = [d.color, "#f2c14e", "#e07a5f", "#7fb5c9", "#f4efe6"];
  const n = Math.max(2, Math.round(len / 2.2));
  const pw = len / n;
  for (let i = 0; i < n; i++) {
    const c = cols[i % cols.length];
    const x = -len / 2 + pw * (i + 0.5);
    P.add(rbox(pw * 0.96, H, 0.5, 0.2, 2), "fabric", c, { p: [x, H / 2, 0] });
    P.add(cyl(0.05, 0.05, 1.2, 6), "metal", "#c9ccd2", { p: [x, H + 0.6, 0], cast: false });
  }
  P.add(cyl(0.15, 0.15, len + 1, 10), "metal", "#c9ccd2", { p: [0, H + 1.2, 0], r: [0, 0, Math.PI / 2] });
};


B.wallBoard = (P, d) => {
  const w = d.x1 - d.x0;
  const dd = d.z1 - d.z0;
  P.frame((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2);
  P.add(rbox(w, 0.4, dd, 0.08, 1), "woodPaint", d.color, { p: [0, -0.2, 0] });
  for (const k of [-0.32, 0.32]) {
    const tri = new THREE.Shape();
    tri.moveTo(0, 0);
    tri.lineTo(dd * 0.8, 0);
    tri.lineTo(0, -dd * 0.8);
    const g = new THREE.ExtrudeGeometry(tri, { depth: 0.22, bevelEnabled: false });
    P.add(g, "metal", "#c9a24a", { p: [k * w - 0.11, -0.4, -dd / 2], r: [0, -Math.PI / 2, 0] });
  }
};


B.spill = (P, d) => {
  P.frame(d.x, d.y, d.z);
  // an irregular splash: a few overlapping flat blobs
  const r = rng(Math.floor(d.x * 31 + d.z * 17));
  P.add(blob(d.w, 0.04, d.d, 2.2, 2), "glossy", d.color, { p: [0, 0.02, 0], cast: false });
  for (let i = 0; i < 6; i++) P.add(blob(d.w * (0.2 + r() * 0.25), 0.05, d.d * (0.2 + r() * 0.25), 2, 2), "glossy", d.color, { p: [(r() - 0.5) * d.w * 0.9, 0.025, (r() - 0.5) * d.d * 0.9], cast: false });
};
B.laptop = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(rbox(d.w, 0.3, d.d, 0.1, 2), "metal", d.color, { p: [0, 0.15, 0] });
  // keys
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 10; c++) P.add(new THREE.BoxGeometry(d.w * 0.075, 0.05, d.d * 0.1), "plastic", "#3a3d44", { p: [-d.w * 0.4 + c * d.w * 0.089, 0.31, -d.d * 0.35 + r * d.d * 0.13], cast: false });
  P.add(new THREE.BoxGeometry(d.w * 0.3, 0.02, d.d * 0.22), "plastic", "#b7bbc2", { p: [0, 0.31, d.d * 0.3], cast: false });
  // screen
  P.add(rbox(d.w, 3.8, 0.28, 0.1, 2), "metal", d.color, { p: [0, 0.3 + 1.9, -d.d / 2 - 0.1] });
  P.add(new THREE.PlaneGeometry(d.w * 0.9, 3.3), "glow", "#9fd0ff", { p: [0, 0.3 + 1.9, -d.d / 2 + 0.045], cast: false });
};
B.gate = (P, d) => {
  const w = d.x1 - d.x0;
  P.frame((d.x0 + d.x1) / 2, 0, d.z);
  P.add(rbox(w, 0.5, 0.4, 0.1, 1), "woodPaint", d.color, { p: [0, d.h - 0.25, 0] });
  P.add(rbox(w, 0.5, 0.4, 0.1, 1), "woodPaint", d.color, { p: [0, 0.6, 0] });
  const n = Math.floor(w / 0.55);
  for (let i = 0; i <= n; i++) P.add(cyl(0.12, 0.12, d.h - 0.4, 8), "woodPaint", d.color, { p: [-w / 2 + (i * w) / n, d.h / 2, 0] });
  // a fine mesh panel between the bars so the gate reads as solid
  P.add(new THREE.BoxGeometry(w, d.h - 1.2, 0.06), "fabric", "#e9e2d6", { p: [0, d.h / 2, 0], cast: false });
};
B.hatbox = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(cyl(d.r, d.r, d.h * 0.86, 32), "cardboard", d.color, { p: [0, d.h * 0.43, 0] });
  P.add(cyl(d.r + 0.08, d.r + 0.08, d.h * 0.18, 32), "cardboard", d.color, { p: [0, d.h * 0.91, 0] });
  P.add(cyl(d.r + 0.09, d.r + 0.09, d.h * 0.12, 32, true), "fabric", d.band, { p: [0, d.h * 0.91, 0], cast: false });
};


B.plank = (P, d) => {
  P.frame((d.x0 + d.x1) / 2, d.y, d.z);
  P.add(rbox(d.x1 - d.x0 + 0.4, 0.2, d.w, 0.05, 1), "wood", "#e2c08f", { p: [0, -0.1, 0] });
  for (const s of [-0.3, 0.3]) P.add(new THREE.BoxGeometry(d.x1 - d.x0 + 0.4, 0.05, 0.1), "wood", "#b8875a", { p: [0, 0.02, s * d.w], cast: false });
};
B.fort = (P, d, dyn) => {
  // the blanket: a quilted roof sagging a little between the chair backs, sides hanging down
  const qt = quiltTexture(d.color, d.color2);
  qt.wrapS = qt.wrapT = THREE.RepeatWrapping;
  const qm = getLabelMat(`label:${qt.uuid}`, qt, 0.95, { side: THREE.DoubleSide });
  const w = d.x1 - d.x0;
  const dd = d.z1 - d.z0;
  const g = new THREE.Group();
  g.position.set((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2);
  const roofG = new THREE.PlaneGeometry(w, dd, 24, 8);
  const pa = roofG.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i);
    const yv = pa.getY(i);
    pa.setZ(i, -Math.cos((x / w) * Math.PI) * 0.12 - Math.abs(yv / dd) * 0.05);
  }
  roofG.computeVertexNormals();
  worldUV(roofG, 0.25);
  const roof = new THREE.Mesh(roofG, qm);
  roof.rotation.x = -Math.PI / 2;
  roof.castShadow = roof.receiveShadow = true;
  g.add(roof);
  for (const s of [-1, 1]) {
    const hgt = d.y - 0.9;
    const side = s < 0 ? null : d.door;
    const segs = side ? [[d.x0, side[0]], [side[1], d.x1]] : [[d.x0, d.x1]];
    for (const [a0, a1] of segs) {
      const L = a1 - a0;
      const cg = clothGeo(L, hgt, 0.08, Math.max(3, Math.round(L / 1.6)));
      worldUV(cg, 0.25);
      const m = new THREE.Mesh(cg, qm);
      m.position.set((a0 + a1) / 2 - (d.x0 + d.x1) / 2, -hgt / 2, s * dd / 2);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    if (side) {
      // the door flap: rolled up and tied
      const roll = new THREE.Mesh(cyl(0.35, 0.35, side[1] - side[0], 14), qm);
      roll.rotation.z = Math.PI / 2;
      roll.position.set((side[0] + side[1]) / 2 - (d.x0 + d.x1) / 2, -(d.y - 3.6) + 0.1 - 0.0, s * dd / 2 + 0.2);
      g.add(roll);
      const flap = new THREE.Mesh(clothGeo(side[1] - side[0], d.y - 3.6, 0.08, 3), qm);
      flap.position.set((side[0] + side[1]) / 2 - (d.x0 + d.x1) / 2, -(d.y - 3.6) / 2, s * dd / 2);
      g.add(flap);
    }
  }
  dyn.push({ obj: g, update() {} });
};
B.drape = (P, d) => {
  const L = d.z1 - d.z0;
  const H = d.y1 - d.y0;
  P.frame(d.x, d.y0 + H / 2, (d.z0 + d.z1) / 2, Math.PI / 2);
  P.add(clothGeo(L, H, 0.14, 5), "fabric", d.color, { p: [0, 0, 0] });
};
B.pelmet = (P, d) => {
  P.frame((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2);
  P.add(rbox(d.x1 - d.x0, 0.6, d.z1 - d.z0, 0.08, 1), "woodPaint", d.color, { p: [0, -0.3, 0] });
};
B.wallBoardX = (P, d) => {
  P.frame((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2);
  P.add(rbox(d.x1 - d.x0, 0.4, d.z1 - d.z0, 0.08, 1), "wood", d.color, { p: [0, -0.2, 0] });
  for (const k of [-0.3, 0.3]) P.add(cyl(0.1, 0.1, 0.9, 8), "metal", "#e0b04a", { p: [0, -0.2, k * (d.z1 - d.z0)], r: [0, 0, Math.PI / 2] });
};
B.drawerOut = (P, d) => {
  const w = d.x1 - d.x0;
  const out = d.z1 - d.z0;
  const h = d.y1 - d.y0;
  P.frame((d.x0 + d.x1) / 2, d.y0, d.z1);
  // an open drawer: sides, bottom and a front with a knob (collision is a solid box)
  P.add(rbox(w, h, 0.25, 0.06, 1), "woodPaint", d.color, { p: [0, h / 2, -0.12] });
  P.add(new THREE.BoxGeometry(w - 0.3, h - 0.05, out - 0.1), "wood", "#e8cfa6", { p: [0, h / 2, -out / 2 - 0.05] });
  P.add(new THREE.SphereGeometry(0.2, 12, 10), "metal", d.knob, { p: [0, h / 2, 0.15] });
};


/* ------------------------------------------------------------------ kitchen */
function cerealLabel(label, color) {
  return labelTexture(`cereal:${label}:${color}`, 256, 384, (g, w, h) => {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.ellipse(w / 2, h * 0.62, w * 0.36, h * 0.2, 0, 0, TAU);
    g.fill();
    for (let i = 0; i < 9; i++) {
      g.fillStyle = ["#f2c14e", "#e85d4a", "#d9a873"][i % 3];
      g.beginPath();
      g.arc(w / 2 + Math.cos(i * 1.7) * w * 0.22, h * 0.62 + Math.sin(i * 2.3) * h * 0.1, 14, 0, TAU);
      g.fill();
      g.fillStyle = color;
      g.beginPath();
      g.arc(w / 2 + Math.cos(i * 1.7) * w * 0.22, h * 0.62 + Math.sin(i * 2.3) * h * 0.1, 5, 0, TAU);
      g.fill();
    }
    g.fillStyle = "#ffffff";
    g.strokeStyle = "rgba(0,0,0,0.35)";
    g.lineWidth = 6;
    g.font = "900 52px 'Arial Black', Arial, sans-serif";
    g.textAlign = "center";
    const words = label.split(" ");
    words.forEach((wd, i) => {
      g.strokeText(wd, w / 2, 80 + i * 56);
      g.fillText(wd, w / 2, 80 + i * 56);
    });
  });
}
B.counter = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  const w = x1 - x0;
  const dd = z1 - z0;
  P.frame((x0 + x1) / 2, 0, (z0 + z1) / 2);
  P.add(rbox(w - 0.4, h - 0.5 - 0.6, dd - 0.4, 0.06, 1), "woodPaint", d.color, { p: [0, (h - 0.5 + 0.6) / 2, 0] });
  P.add(new THREE.BoxGeometry(w - 0.8, 0.6, dd - 0.8), "woodPaint", "#3a3d44", { p: [0, 0.3, 0] });
  // doors + handles on the front
  const fx = d.front === "-x" ? -1 : d.front === "+x" ? 1 : 0;
  const fz = d.front === "-z" ? -1 : d.front === "+z" ? 1 : 0;
  const along = fx ? dd : w;
  const n = Math.max(1, Math.round(along / 6));
  for (let i = 0; i < n; i++) {
    const c = -along / 2 + (along / n) * (i + 0.5);
    const dw = along / n - 0.4;
    const px = fx ? fx * (w / 2 - 0.15) : c;
    const pz = fz ? fz * (dd / 2 - 0.15) : c;
    P.add(rbox(fx ? 0.16 : dw, h - 1.6, fx ? dw : 0.16, 0.05, 1), "woodPaint", shade(d.color, 1.08), { p: [px, (h - 0.5) / 2 + 0.35, pz] });
    P.add(rbox(fx ? 0.16 : 0.24, 1.4, fx ? 0.24 : 0.16, 0.06, 1), "metal", "#c9ccd2", { p: [px + fx * 0.15, h - 2.2, pz + fz * 0.15 + (fz ? 0 : 0)] });
  }
  // worktop (with a basin cut if there's a sink)
  const sk = d.sink;
  const top = d.top;
  if (!sk) P.add(rbox(w, 0.5, dd, 0.08, 1), "stone", top, { p: [0, h - 0.25, 0] });
  else {
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const seg = (a0, a1, b0, b1) => {
      if (a1 - a0 < 0.01 || b1 - b0 < 0.01) return;
      P.add(new THREE.BoxGeometry(a1 - a0, 0.5, b1 - b0), "stone", top, { p: [(a0 + a1) / 2 - cx, h - 0.25, (b0 + b1) / 2 - cz] });
    };
    seg(x0, sk.x0, z0, z1);
    seg(sk.x1, x1, z0, z1);
    seg(sk.x0, sk.x1, z0, sk.z0);
    seg(sk.x0, sk.x1, sk.z1, z1);
    const bw = sk.x1 - sk.x0;
    const bd = sk.z1 - sk.z0;
    const bx = (sk.x0 + sk.x1) / 2 - cx;
    const bz = (sk.z0 + sk.z1) / 2 - cz;
    P.add(new THREE.BoxGeometry(bw, 0.3, bd), "metal", "#d4d7dc", { p: [bx, h - sk.depth - 0.15, bz] });
    for (const s of [-1, 1]) {
      P.add(new THREE.BoxGeometry(0.12, sk.depth, bd), "metal", "#d4d7dc", { p: [bx + s * (bw / 2 - 0.06), h - sk.depth / 2, bz] });
      P.add(new THREE.BoxGeometry(bw, sk.depth, 0.12), "metal", "#d4d7dc", { p: [bx, h - sk.depth / 2, bz + s * (bd / 2 - 0.06)] });
    }
    // the tap
    P.add(cyl(0.35, 0.4, 0.4, 16), "metal", "#d4d7dc", { p: [bx, h + 0.2, bz - bd / 2 - 1.0] });
    P.add(cyl(0.2, 0.2, 3.2, 12), "metal", "#d4d7dc", { p: [bx, h + 1.9, bz - bd / 2 - 1.0] });
    P.add(new THREE.TorusGeometry(1.0, 0.2, 10, 20, Math.PI), "metal", "#d4d7dc", { p: [bx, h + 3.5, bz - bd / 2], r: [0, Math.PI / 2, 0] });
    P.add(cyl(0.22, 0.18, 0.6, 12), "metal", "#d4d7dc", { p: [bx, h + 3.2, bz - bd / 2 + 1.0] });
  }
};
B.upperCabinet = (P, d) => {
  wallFrame(P, d.wall, d.room, d.c, d.y, 0);
  P.add(rbox(d.w, d.h, 3.4, 0.08, 1), "woodPaint", d.color || "#4fb3a8", { p: [0, d.h / 2, 1.7] });
  const n = Math.max(1, Math.round(d.w / 5));
  for (let i = 0; i < n; i++) {
    const c = -d.w / 2 + (d.w / n) * (i + 0.5);
    P.add(rbox(d.w / n - 0.4, d.h - 0.5, 0.16, 0.05, 1), "woodPaint", shade(d.color || "#4fb3a8", 1.08), { p: [c, d.h / 2, 3.45] });
    P.add(rbox(0.24, 1.2, 0.16, 0.06, 1), "metal", "#c9ccd2", { p: [c + (d.w / n) * 0.32, 0.9, 3.6] });
  }
};
B.fridge = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  P.frame((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const w = x1 - x0;
  const dd = z1 - z0;
  P.add(rbox(w, h, dd, 0.5, 3), "glossy", d.color, { p: [0, h / 2, 0] });
  const fx = d.front === "-x" ? -1 : d.front === "+x" ? 1 : 0;
  const fz = d.front === "-z" ? -1 : d.front === "+z" ? 1 : 0;
  // door split + long handles
  P.add(new THREE.BoxGeometry(fx ? 0.1 : w - 0.4, 0.14, fx ? dd - 0.4 : 0.1), "matte", "#c9ccd2", { p: [fx * (w / 2 + 0.01), h * 0.66, fz * (dd / 2 + 0.01)], cast: false });
  for (const [y, len] of [[h * 0.83, h * 0.2], [h * 0.42, h * 0.35]]) P.add(cyl(0.18, 0.18, len, 10), "metal", "#d4d7dc", { p: [fx * (w / 2 + 0.35) + (fx ? 0 : w * 0.38), y, fz * (dd / 2 + 0.35) + (fz ? 0 : dd * 0.38)] });
};
const MAGNET_COLS = ["#e85d4a", "#f2c14e", "#4fb3a8", "#6f9bd1", "#8a5aa8", "#6a8f3f"];
B.magnet = (P, d) => {
  P.frame(0, 0, 0);
  const ax = d.face === "+x" || d.face === "-x";
  const s = d.face === "+z" || d.face === "+x" ? 1 : -1;
  const cx = ax ? d.x + (s * d.d) / 2 : d.x;
  const cz = ax ? d.z : d.z + (s * d.d) / 2;
  P.add(rbox(ax ? d.d : d.w, d.h, ax ? d.w : d.d, 0.12, 2), "plastic", d.color, { p: [cx, d.y - d.h / 2, cz] });
};
B.table = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  P.frame((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const w = x1 - x0;
  const dd = z1 - z0;
  P.add(rbox(w, 0.5, dd, 0.15, 2), "wood", d.color, { p: [0, h - 0.25, 0] });
  P.add(new THREE.BoxGeometry(w - 1.6, 0.8, dd - 1.6), "wood", d.color, { p: [0, h - 0.9, 0] });
  const lg = 0.8;
  for (const [lx, lz] of [
    [-w / 2 + 0.6 + lg / 2, -dd / 2 + 0.6 + lg / 2],
    [w / 2 - 0.6 - lg / 2, -dd / 2 + 0.6 + lg / 2],
    [-w / 2 + 0.6 + lg / 2, dd / 2 - 0.6 - lg / 2],
    [w / 2 - 0.6 - lg / 2, dd / 2 - 0.6 - lg / 2],
  ])
    P.add(cyl(0.42, 0.36, h - 0.5, 14), "wood", d.color, { p: [lx, (h - 0.5) / 2, lz] });
  if (d.cloth) {
    P.add(new THREE.BoxGeometry(w * 0.7, 0.03, dd + 0.1), "fabric", d.cloth, { p: [0, h + 0.015, 0], cast: false });
  }
};
B.plate = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(lathe([[0, 0], [d.r * 0.6, 0], [d.r * 0.68, 0.08], [d.r, d.h], [d.r * 0.96, d.h], [d.r * 0.62, 0.1], [0, 0.1]], 32), "ceramic", d.color, {});
  P.add(new THREE.TorusGeometry(d.r * 0.88, 0.04, 6, 36), "ceramic", d.rim, { p: [0, d.h * 0.8, 0], r: [Math.PI / 2, 0, 0], cast: false });
};
B.plates = (P, d) => {
  for (let i = 0; i < d.n; i++) B.plate(P, { ...d, y: d.y + i * 0.16, h: 0.16 });
};
B.bowl = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(lathe([[0, 0], [d.r * 0.55, 0], [d.r * 0.95, d.h * 0.7], [d.r, d.h], [d.r * 0.9, d.h], [d.r * 0.5, 0.15], [0, 0.15]], 32), "ceramic", d.color, {});
  if (d.fill) P.add(cyl(d.r * 0.92, d.r * 0.92, 0.05, 28), "matte", d.fill, { p: [0, d.h * 0.92, 0], cast: false });
};
B.spoon = (P, d) => {
  P.frame(d.x, d.y, d.z, d.axis === "z" ? Math.PI / 2 : 0);
  const f = d.flip ? -1 : 1;
  const L = d.len;
  P.add(rbox(L * 0.72, 0.1, 0.32, 0.04, 1), "metal", d.color, { p: [f * -L * 0.13, 0.06, 0] });
  P.add(blob(L * 0.3, 0.2, 0.6, 2, 2), "metal", d.color, { p: [f * L * 0.35, 0.08, 0] });
};
B.cereal = (P, d) => {
  P.frame(d.x, d.y, d.z, (d.rot || 0) * (Math.PI / 2));
  const tex = cerealLabel(d.label, d.color);
  const lm = labelMat(tex, 0.7);
  const g = rbox(d.w, d.h, d.d, 0.05, 1);
  P.add(g, "label", "#fff", { p: [0, d.h / 2, 0], uv: "own", matKey: lm.key, material: lm.material });
};
B.jar = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(cyl(d.r * 0.95, d.r * 0.95, d.h * 0.8, 24), "matte", d.fill, { p: [0, d.h * 0.42, 0] });
  P.add(cyl(d.r, d.r, d.h * 0.86, 24, true), "glass", "#e8f4ff", { p: [0, d.h * 0.43, 0], cast: false });
  P.add(cyl(d.r * 0.92, d.r, d.h * 0.16, 24), "plastic", d.lid, { p: [0, d.h * 0.92, 0] });
};
B.cutboard = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(rbox(d.w, 0.3, d.d, 0.1, 2), "wood", d.color, { p: [0, 0.15, 0] });
  P.add(cyl(0.18, 0.18, 0.32, 12, true), "wood", shade(d.color, 0.8), { p: [d.w / 2 - 0.5, 0.15, 0], cast: false });
};
B.toaster = (P, d, dyn) => {
  const g = new THREE.Group();
  g.position.set(d.x, d.y, d.z);
  const body = new THREE.Mesh(worldUV(rbox(2.6, 1.0, 1.6, 0.3, 3), KINDS.glossy.density), mat("glossy", d.color));
  body.position.y = 0.5;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  for (const s of [-0.35, 0.35]) {
    const slot = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.05, 0.22), mat("matte", "#2a2a2e"));
    slot.position.set(0, 1.01, s);
    g.add(slot);
  }
  const lever = new THREE.Mesh(rbox(0.3, 0.2, 0.4, 0.06, 1), mat("matte", "#2a2a2e"));
  lever.position.set(1.4, 0.6, 0);
  g.add(lever);
  // toast that pops up on a bounce
  const inner = new THREE.Group();
  g.add(inner);
  for (const s of [-0.35, 0.35]) {
    const toast = new THREE.Mesh(rbox(1.5, 1.0, 0.16, 0.2, 2), mat("felt", "#d9a873"));
    toast.position.set(0, 0.6, s);
    inner.add(toast);
  }
  const sq = squashable(g, body, d);
  const pop = { t: 1 };
  dyn.push({
    ...sq,
    obj: g,
    bounce(st) {
      sq.bounce.call(sq, st);
      pop.t = 0;
    },
    update(dt) {
      sq.update.call(sq, dt);
      pop.t = Math.min(1, pop.t + dt / 0.7);
      inner.position.y = Math.sin(pop.t * Math.PI) * 0.9;
    },
  });
};
B.kettle = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(lathe([[0, 0], [0.85, 0], [0.9, 0.3], [0.85, 1.4], [0.5, 1.8], [0, 1.85]], 28), "glossy", d.color, {});
  P.add(new THREE.TorusGeometry(0.5, 0.09, 8, 16, Math.PI), "matte", "#2a2a2e", { p: [0, 1.75, 0], r: [0, 0, 0] });
  P.add(cyl(0.12, 0.2, 0.8, 10), "glossy", d.color, { p: [0.95, 1.1, 0], r: [0, 0, -0.9] });
};
B.stove = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(rbox(d.w, 0.12, d.d, 0.05, 1), "glossy", "#2a2d34", { p: [0, 0.06, 0], cast: false });
  for (const [dx, dz] of d.rings || []) {
    const rr = Math.min(d.w, d.d) * 0.19;
    for (const k of [1, 0.66, 0.33]) P.add(new THREE.TorusGeometry(rr * k, 0.05, 6, 28), "metal", "#55585f", { p: [dx, 0.13, dz], r: [Math.PI / 2, 0, 0], cast: false });
  }
};
B.towel = (P, d) => {
  const wide = d.x1 - d.x0 >= d.z1 - d.z0;
  const L = wide ? d.x1 - d.x0 : d.z1 - d.z0;
  const H = d.y1 - d.y0;
  P.frame((d.x0 + d.x1) / 2, d.y0 + H / 2, (d.z0 + d.z1) / 2, wide ? 0 : Math.PI / 2);
  P.add(clothGeo(L, H, 0.12, 3), "fabric", d.color2, { p: [0, 0, 0] });
  for (const k of [-0.3, 0.3]) P.add(new THREE.BoxGeometry(L * 0.98, 0.25, 0.14), "fabric", d.color, { p: [0, k * H, 0.0], cast: false });
  P.add(cyl(0.12, 0.12, L + 0.6, 10), "metal", "#d4d7dc", { p: [0, H / 2 + 0.1, 0], r: [0, 0, Math.PI / 2] });
};
B.stepStool = (P, d) => {
  P.frame(d.x, 0, d.z, d.rot % 2 ? -Math.PI / 2 : 0);
  P.add(rbox(d.w, 1.4, 2, 0.15, 2), "plastic", d.color, { p: [0, 0.7, 1] });
  P.add(rbox(d.w, 2.8, 2, 0.15, 2), "plastic", d.color, { p: [0, 1.4, -1] });
  for (const z of [1, -1]) P.add(new THREE.BoxGeometry(d.w - 0.4, 0.04, 1.6), "rubber", "#3a3d44", { p: [0, z > 0 ? 1.42 : 2.82, z], cast: false });
};
B.wetFloor = (P, d) => {
  P.frame(d.x, 0, d.z);
  P.add(blob(d.w, 0.02, d.d, 2.6, 2), "glass", "#cfeaff", { p: [0, 0.03, 0], cast: false });
};
B.wetSign = (P, d) => {
  P.frame(d.x, 0, d.z, 0.4);
  const sg = new THREE.Shape();
  sg.moveTo(-1.2, 0);
  sg.lineTo(1.2, 0);
  sg.lineTo(0.5, 4.2);
  sg.lineTo(-0.5, 4.2);
  const ge = new THREE.ExtrudeGeometry(sg, { depth: 0.1, bevelEnabled: false });
  P.add(ge, "plastic", "#f2c14e", { p: [0, 0, 0.4], r: [-0.18, 0, 0] });
  P.add(ge.clone(), "plastic", "#f2c14e", { p: [0, 0, -0.4], r: [0.18, Math.PI, 0] });
};
B.dishRack = (P, d) => {
  const { x0, x1, z0, z1, y } = d;
  P.frame((x0 + x1) / 2, y, (z0 + z1) / 2);
  const w = x1 - x0;
  const dd = z1 - z0;
  P.add(rbox(w, 0.3, dd, 0.08, 1), "metal", "#d4d7dc", { p: [0, 0.15, 0] });
  for (let i = 0; i <= 10; i++) P.add(cyl(0.05, 0.05, dd, 6), "metal", "#d4d7dc", { p: [-w / 2 + (i * w) / 10, 0.9, 0], r: [Math.PI / 2, 0, 0], cast: false });
  const gap = (w - 1) / d.n;
  for (let i = 0; i < d.n; i++) {
    const px = -w / 2 + 0.5 + gap * (i + 0.5);
    P.add(cyl(dd / 2 - 0.3, dd / 2 - 0.3, 0.2, 32), "ceramic", i % 2 ? "#fbfbf7" : "#f6e7c9", { p: [px, 0.3 + d.plateH / 2, 0], r: [0, 0, Math.PI / 2], s: [1, 1, d.plateH / (dd - 0.6)] });
  }
};
B.highChair = (P, d) => {
  const { x, z, s, sh } = d;
  const f = d.f || 1;
  P.frame(x, 0, z);
  for (const [lx, lz] of [
    [-s / 2 + 0.17, -s / 2 + 0.17],
    [s / 2 - 0.17, -s / 2 + 0.17],
    [-s / 2 + 0.17, s / 2 - 0.17],
    [s / 2 - 0.17, s / 2 - 0.17],
  ])
    P.add(cyl(0.18, 0.2, sh - 0.3, 10), "woodPaint", d.color, { p: [lx, (sh - 0.3) / 2, lz] });
  P.add(rbox(s + 0.4, 0.25, s, 0.08, 1), "woodPaint", d.color, { p: [0, 2.52, 0] });
  P.add(rbox(s, 0.3, s, 0.1, 1), "woodPaint", d.color, { p: [0, sh - 0.15, 0] });
  P.add(rbox(s, 3.4, 0.35, 0.12, 2), "woodPaint", d.color, { p: [0, sh + 1.7, -f * (s / 2 - 0.175)] });
  P.add(rbox(s + 0.6, 0.3, 1.8, 0.12, 2), "plastic", d.tray, { p: [0, (d.ty || sh + 1.0) + 0.15, f * (s / 2 + 0.7)] });
  for (const k of [-1, 1]) P.add(cyl(0.12, 0.12, (d.ty || sh + 1) - sh, 8), "woodPaint", d.color, { p: [k * (s / 2 - 0.1), sh + ((d.ty || sh + 1) - sh) / 2, f * (s / 2 - 0.1)] });
};


/* ------------------------------------------------------------------ garage */
B.workbench = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  P.frame((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const w = x1 - x0;
  const dd = z1 - z0;
  P.add(rbox(w, 0.6, dd, 0.1, 1), "wood", d.color, { p: [0, h - 0.3, 0] });
  for (const [lx, lz] of [
    [-w / 2 + 0.8, -dd / 2 + 0.8],
    [w / 2 - 0.8, -dd / 2 + 0.8],
    [-w / 2 + 0.8, dd / 2 - 0.8],
    [w / 2 - 0.8, dd / 2 - 0.8],
  ])
    P.add(rbox(0.8, h - 0.6, 0.8, 0.08, 1), "wood", shade(d.color, 0.85), { p: [lx, (h - 0.6) / 2, lz] });
  if (d.shelf) P.add(rbox(w - 0.8, 0.4, dd - 0.8, 0.06, 1), "wood", shade(d.color, 0.92), { p: [0, 2.2, 0] });
  // a vise at one end
  P.add(rbox(1.6, 1.2, 1.4, 0.15, 2), "metal", "#5a8fd1", { p: [w / 2 - 1.8, h + 0.6, dd / 2 - 1.0] });
};
B.pegboard = (P, d) => {
  const w = d.x1 - d.x0;
  const H = d.y1 - d.y0;
  P.frame((d.x0 + d.x1) / 2, d.y0, d.z - 0.1);
  P.add(new THREE.BoxGeometry(w, H, 0.2), "wood", d.color, { p: [0, H / 2, 0] });
  // the holes
  const nx = Math.floor(w / 0.8);
  const ny = Math.floor(H / 0.8);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) P.add(new THREE.CircleGeometry(0.09, 6), "matte", "#6b4a35", { p: [-w / 2 + 0.4 + i * 0.8, 0.4 + j * 0.8, 0.105], cast: false });
  if (d.tools) {
    // hanging tools: a hammer, a wrench, pliers outlines (decor, flat to the board)
    const cols = ["#e85d4a", "#4fb3a8", "#f2c14e", "#6f9bd1"];
    for (let i = 0; i < Math.floor(w / 4); i++) {
      const x = -w / 2 + 2 + i * 4;
      const c = cols[i % cols.length];
      P.add(rbox(0.5, 3.0, 0.3, 0.1, 1), "plastic", c, { p: [x, H * 0.55, 0.3] });
      P.add(rbox(1.6, 0.7, 0.4, 0.1, 1), "metal", "#9aa0a8", { p: [x, H * 0.55 + 1.6, 0.3] });
    }
  }
};
B.toolbox = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  P.frame((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const w = x1 - x0;
  const dd = z1 - z0;
  P.add(rbox(w, h, dd, 0.15, 2), "glossy", d.color, { p: [0, h / 2, 0] });
  const fz = d.front === "-z" ? -1 : 1;
  const rh = (h - 0.6) / d.rows;
  for (let r = 0; r < d.rows; r++) {
    const y = 0.4 + rh * r + rh / 2;
    P.add(rbox(w - 0.4, rh - 0.2, 0.1, 0.04, 1), "glossy", shade(d.color, 1.1), { p: [0, y, fz * (dd / 2 + 0.03)] });
    P.add(rbox(w * 0.6, 0.12, 0.2, 0.05, 1), "metal", "#d4d7dc", { p: [0, y + rh * 0.25, fz * (dd / 2 + 0.12)] });
  }
  for (const k of [-1, 1]) P.add(cyl(0.3, 0.3, 0.3, 12), "rubber", "#2a2a2e", { p: [k * (w / 2 - 0.5), 0.15, fz * (dd / 2 - 0.5)], r: [0, 0, Math.PI / 2] });
};
B.metalShelf = (P, d) => {
  const { x0, x1, z0, z1, h } = d;
  P.frame((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const w = x1 - x0;
  const dd = z1 - z0;
  for (const [px, pz] of [
    [-w / 2 + 0.175, -dd / 2 + 0.175],
    [w / 2 - 0.175, -dd / 2 + 0.175],
    [-w / 2 + 0.175, dd / 2 - 0.175],
    [w / 2 - 0.175, dd / 2 - 0.175],
  ])
    P.add(new THREE.BoxGeometry(0.35, h, 0.35), "metal", d.color, { p: [px, h / 2, pz] });
  for (const y of d.boards) P.add(new THREE.BoxGeometry(w, 0.25, dd), "metal", d.color, { p: [0, y - 0.125, 0] });
};
function canLabel(color) {
  return labelTexture(`can:${color}`, 256, 128, (g, w, h) => {
    g.fillStyle = "#f4f4f2";
    g.fillRect(0, 0, w, h);
    g.fillStyle = color;
    g.fillRect(0, h * 0.25, w, h * 0.5);
    g.fillStyle = "#ffffff";
    g.font = "900 34px 'Arial Black', Arial, sans-serif";
    g.textAlign = "center";
    g.fillText("PAINT", w / 2, h * 0.62);
  });
}
B.paintCan = (P, d) => {
  P.frame(d.x, d.y, d.z);
  const lm = labelMat(canLabel(d.color), 0.45);
  const g = cyl(d.r, d.r, d.h - 0.1, 28, true);
  P.add(g, "label", "#fff", { p: [0, d.h / 2 - 0.05, 0], uv: "own", matKey: lm.key, material: lm.material });
  P.add(cyl(d.r * 0.98, d.r * 0.98, 0.1, 28), "metal", "#c9ccd2", { p: [0, d.h - 0.05, 0] });
  P.add(new THREE.TorusGeometry(d.r * 0.9, 0.05, 6, 28), "metal", "#9aa0a8", { p: [0, d.h, 0], r: [Math.PI / 2, 0, 0], cast: false });
  P.add(blob(0.5, 0.6, 0.15, 2, 2), "glossy", d.drip, { p: [d.r * 0.7, d.h - 0.4, d.r * 0.7], r: [0, Math.PI / 4, 0], cast: false });
};
B.tires = (P, d, dyn) => {
  const g = new THREE.Group();
  g.position.set(d.x, 0, d.z);
  const inner = new THREE.Group();
  g.add(inner);
  const rub = mat("rubber", "#2a2a2e");
  for (let i = 0; i < d.n; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(d.r * 0.68, d.th * 0.5, 14, 32), rub);
    t.rotation.x = Math.PI / 2;
    t.position.y = d.th * (i + 0.5);
    t.scale.set(1, 1, 1);
    t.castShadow = t.receiveShadow = true;
    inner.add(t);
    // tread
    const tread = new THREE.Mesh(new THREE.TorusGeometry(d.r * 0.68, d.th * 0.52, 4, 32), mat("rubber", "#3a3a40"));
    tread.rotation.x = Math.PI / 2;
    tread.position.y = d.th * (i + 0.5);
    inner.add(tread);
  }
  // a cap to stand on (a plank over the hole)
  const cap = new THREE.Mesh(rbox(d.r * 1.5, 0.2, d.r * 1.5, 0.06, 1), mat("wood", "#c8956a"));
  cap.position.y = d.th * d.n - 0.05;
  inner.add(cap);
  dyn.push(squashable(g, inner, d));
};
B.plankZ = (P, d) => {
  P.frame(d.x, d.y, (d.z0 + d.z1) / 2);
  P.add(rbox(d.w, 0.3, d.z1 - d.z0, 0.06, 1), "wood", "#d9b98f", { p: [0, -0.15, 0] });
};
B.sawhorse = (P, d) => {
  P.frame(d.x, 0, d.z, d.axis === "z" ? Math.PI / 2 : 0);
  P.add(rbox(d.len, 0.6, 0.9, 0.08, 1), "wood", "#d9b98f", { p: [0, d.h - 0.3, 0] });
  for (const k of [-1, 1])
    for (const s of [-1, 1]) P.add(rbox(0.4, d.h, 0.4, 0.05, 1), "wood", "#c8956a", { p: [k * (d.len / 2 - 0.8), d.h / 2 - 0.2, s * 0.9], r: [s * 0.22, 0, 0] });
};
B.conveyor = (P, d, dyn) => {
  const w = d.x1 - d.x0;
  const dd = d.z1 - d.z0;
  P.frame((d.x0 + d.x1) / 2, d.y, (d.z0 + d.z1) / 2);
  P.add(rbox(w + 0.3, 0.5, dd + 0.3, 0.1, 1), "plastic", d.frame, { p: [0, -0.35, 0] });
  for (const k of [-1, 1]) P.add(cyl(0.3, 0.3, w > dd ? dd + 0.4 : w + 0.4, 12), "metal", "#c9ccd2", { p: w > dd ? [k * (w / 2), -0.3, 0] : [0, -0.3, k * (dd / 2)], r: w > dd ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2] });
  // the moving belt: a striped texture that scrolls with the box's conveyor speed
  const tex = labelTexture(`belt:${d.color}`, 64, 64, (g, W2, H2) => {
    g.fillStyle = d.color;
    g.fillRect(0, 0, W2, H2);
    g.fillStyle = "rgba(255,255,255,0.12)";
    g.fillRect(0, 0, W2, 10);
    g.fillRect(0, 32, W2, 4);
  });
  const t = tex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  const along = w > dd;
  t.repeat.set(along ? 1 : dd / 1.2, along ? w / 1.2 : 1);
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(along ? w : dd, along ? dd : w), m);
  belt.rotation.x = -Math.PI / 2;
  if (!along) belt.rotation.z = Math.PI / 2;
  belt.position.set((d.x0 + d.x1) / 2, d.y + 0.01, (d.z0 + d.z1) / 2);
  belt.receiveShadow = true;
  dyn.push({
    obj: belt,
    geos: [belt.geometry],
    update(dt, ctx) {
      const b = ctx.W && ctx.W.C.all[d.box];
      if (!b || !b.conveyor) return;
      const v = along ? b.conveyor[0] : b.conveyor[1];
      if (along) t.offset.y -= (v * dt) / 1.2;
      else t.offset.y -= (v * dt) / 1.2;
    },
  });
};
B.bucket = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(lathe([[0, 0], [d.r * 0.82, 0], [d.r, d.h], [d.r * 0.93, d.h], [d.r * 0.76, 0.1], [0, 0.1]], 28), "plastic", d.color, {});
  P.add(new THREE.TorusGeometry(d.r * 0.95, 0.05, 6, 24, Math.PI), "metal", "#c9ccd2", { p: [0, d.h, 0], r: [0, 0, 0] });
};
B.oil = (P, d) => {
  P.frame(d.x, d.y, d.z);
  P.add(blob(d.w, 0.02, d.d, 2.4, 2), "glossy", "#2a2a34", { p: [0, 0.015, 0], cast: false });
};
B.bigCar = (P, d) => {
  const { x0, z0, len, wid } = d;
  P.frame(x0 + len / 2, 0, z0 + wid / 2);
  P.add(rbox(len, 6.0, wid - 3, 1.6, 3), "glossy", d.color, { p: [0, 7.4, 0] });
  P.add(rbox(len * 0.5, 4.2, wid - 4, 1.4, 3), "glossy", d.color, { p: [-len * 0.05, 11.6, 0] });
  P.add(rbox(len * 0.46, 3.2, wid - 3.9, 1.2, 3), "glass", "#9fc4d8", { p: [-len * 0.05, 11.8, 0], cast: false });
  for (const tx of [-len / 2 + 7, len / 2 - 8])
    for (const s of [-1, 1]) {
      P.add(new THREE.TorusGeometry(2.4, 1.0, 14, 32), "rubber", "#2a2a2e", { p: [tx, 3.3, s * (wid / 2 - 1)] });
      P.add(cyl(1.6, 1.6, 2.2, 24), "metal", "#c9ccd2", { p: [tx, 3.3, s * (wid / 2 - 1)], r: [Math.PI / 2, 0, 0] });
    }
  P.add(rbox(1.2, 1.4, wid - 4, 0.3, 2), "metal", "#d4d7dc", { p: [len / 2 + 0.2, 5.2, 0] });
  for (const s of [-1, 1]) P.add(new THREE.SphereGeometry(0.9, 14, 10), "glow", "#fff4c2", { p: [len / 2 - 0.1, 7.6, s * (wid / 2 - 3.5)], cast: false });
};
B.cord = (P, d) => {
  P.frame((d.x0 + d.x1) / 2, d.y, d.z);
  P.add(cyl(0.15, 0.15, d.x1 - d.x0, 8), "rubber", d.color, { p: [0, -0.12, 0], r: [0, 0, Math.PI / 2] });
};
B.wallBike = (P, d) => {
  P.frame(d.x, d.y, d.z);
  for (const k of [-1, 1]) {
    P.add(new THREE.TorusGeometry(3.2, 0.25, 10, 40), "rubber", "#2a2a2e", { p: [k * 5, 0, 0] });
    for (let i = 0; i < 8; i++) P.add(cyl(0.04, 0.04, 6.2, 4), "metal", "#c9ccd2", { p: [k * 5, 0, 0], r: [0, 0, (i / 8) * Math.PI], cast: false });
  }
  P.add(cyl(0.25, 0.25, 7, 10), "metal", d.color, { p: [0, 2.2, 0], r: [0, 0, Math.PI / 2] });
  P.add(cyl(0.25, 0.25, 6, 10), "metal", d.color, { p: [-1.6, 0.4, 0], r: [0, 0, 0.9] });
  P.add(cyl(0.25, 0.25, 6, 10), "metal", d.color, { p: [1.8, 0.6, 0], r: [0, 0, -0.75] });
};
B.lawnmower = (P, d) => {
  P.frame(d.x, 0, d.z);
  P.add(rbox(7, 2.6, 6, 0.8, 3), "glossy", d.color, { p: [0, 2.1, 0] });
  for (const [x, z] of [[-2.8, -3], [2.8, -3], [-2.8, 3], [2.8, 3]]) P.add(cyl(1.0, 1.0, 0.6, 18), "rubber", "#2a2a2e", { p: [x, 1.0, z], r: [Math.PI / 2, 0, 0] });
  P.add(cyl(0.18, 0.18, 9, 8), "metal", "#c9ccd2", { p: [-5.5, 6, 0], r: [0, 0, 0.7] });
};

/* ================================================================== level build */
/**
 * Build every prop of a level. Returns { meshes (merged static), dynamic, byBox }.
 * quality: "low" drops lowHide props (flat, non-colliding detail only — collision
 * is never touched by graphics settings).
 */
export function buildProps(level, quality, { shadows = true } = {}) {
  const P = new Parts();
  const dynamic = [];
  const room = level.room ? { ...level.room } : null;
  for (const d of level.props) {
    if (quality === "low" && d.lowHide) continue;
    const fn = B[d.type];
    if (!fn) continue;
    fn(P, { ...d, room }, dynamic);
  }
  const meshes = mergeParts(P, { shadows });
  const byBox = new Map();
  for (const dy of dynamic) if (dy.box != null) byBox.set(dy.box, dy);
  return { meshes, dynamic, byBox };
}

export { carParts, Parts, B as BUILDERS, blockFace, labelMat, placeOnWall, wallFrame, localAlong, clothGeo, rng, shade, cyl, lathe };
