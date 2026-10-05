/**
 * Train Commander — scenery prop geometry, per region palette.
 *
 * Every prop is one merged, vertex-coloured geometry (cached per region) so
 * the environment can draw any number of them through InstancedMesh. Small
 * "corridor" props (grass, flowers, pebbles, bushes) may sit where enemies
 * ride; tall props are only ever placed well away from the track.
 */
import * as THREE from "three";
import { T, paint, merge, box, cyl, cone, sph, ico, dodec, dome, torus, prism, cylX, cylZ, cached, rng } from "./geo.js";

/* ------------------------------------------------------------- nature */
function broadleaf(R, seed) {
  const r = rng(seed);
  const P = [paint(T(cyl(0.18, 0.28, 2.2, 7), 0, 1.1, 0), R.trunk, 0.1)];
  const n = 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const s = 1.2 + r() * 0.5;
    P.push(paint(T(ico(s, 1), Math.cos(a) * 0.6, 2.6 + r() * 0.8, Math.sin(a) * 0.6, r(), r(), r(), 1, 0.85, 1), R.foliage[i % R.foliage.length], 0.16, seed + i));
  }
  P.push(paint(T(ico(1.3, 1), 0, 3.4, 0), R.foliage[1], 0.14, seed + 9));
  return merge(P);
}

function pine(R, seed, snow = false) {
  const r = rng(seed);
  const P = [paint(T(cyl(0.14, 0.22, 1.2, 6), 0, 0.6, 0), R.trunk, 0.1)];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const s = 1.5 - i * 0.3;
    const y = 1.1 + i * 0.9;
    P.push(paint(T(cone(s, 1.5, 7), 0, y + 0.6, 0, 0, r() * 2, 0), R.foliage[i % R.foliage.length], 0.14, seed + i));
    if (snow) P.push(paint(T(cone(s * 0.82, 0.55, 7), 0, y + 1.1, 0, 0, r() * 2, 0), "#f4f8fb", 0.05, seed + i + 20));
  }
  return merge(P);
}

function deadTree(R, seed) {
  const r = rng(seed);
  const P = [paint(T(cyl(0.12, 0.26, 3.2, 6), 0, 1.6, 0, 0, 0, (r() - 0.5) * 0.2), R.trunk, 0.12)];
  for (let i = 0; i < 4; i++) {
    const a = r() * Math.PI * 2;
    const y = 1.6 + r() * 1.4;
    P.push(paint(T(cyl(0.04, 0.09, 1.4, 5), Math.cos(a) * 0.45, y + 0.4, Math.sin(a) * 0.45, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9), R.trunk, 0.12));
  }
  return merge(P);
}

function rock(R, seed, big = false) {
  const r = rng(seed);
  const P = [];
  const n = big ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const s = (big ? 1.4 : 0.45) * (0.6 + r() * 0.6);
    P.push(paint(T(dodec(s), (r() - 0.5) * s * 1.4, s * 0.5, (r() - 0.5) * s, r() * 3, r() * 3, r() * 3, 1, 0.7, 1), R.rock, 0.18, seed + i));
  }
  return merge(P);
}

function bush(R, seed) {
  const r = rng(seed);
  const P = [];
  for (let i = 0; i < 3; i++) P.push(paint(T(ico(0.45 + r() * 0.25, 0), (r() - 0.5) * 0.7, 0.35, (r() - 0.5) * 0.7, r(), r(), 0, 1, 0.75, 1), R.foliage[(i + 2) % R.foliage.length], 0.16, seed + i));
  return merge(P);
}

function tuft(R) {
  const P = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P.push(paint(T(cone(0.06, 0.45, 3), Math.cos(a) * 0.08, 0.2, Math.sin(a) * 0.08, Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35), R.foliage[i % 2 ? 0 : 3], 0.2, i));
  }
  return merge(P);
}

function flowers(R, seed) {
  const r = rng(seed);
  const cols = ["#ffffff", "#ffd84a", "#ff7aa8", "#b38cff", "#ff8a3d"];
  const P = [];
  for (let i = 0; i < 6; i++) {
    const x = (r() - 0.5) * 1.2;
    const z = (r() - 0.5) * 1.2;
    P.push(paint(T(cyl(0.012, 0.012, 0.3, 3), x, 0.15, z), R.foliage[0]));
    P.push(paint(T(sph(0.07, 5, 3), x, 0.32, z), cols[Math.floor(r() * cols.length)], 0.05));
  }
  return merge(P);
}

function cactus(R, seed) {
  const r = rng(seed);
  const g = "#5f8a45";
  const P = [paint(T(capsule(0.28, 2.2), 0, 1.4, 0), g, 0.1)];
  for (const s of [-1, 1]) {
    if (r() < 0.75) {
      const y = 1.0 + r() * 0.8;
      P.push(paint(T(cylX(0.18, 0.5, 8), s * 0.42, y, 0), g, 0.1));
      P.push(paint(T(capsule(0.18, 0.7), s * 0.62, y + 0.45, 0), g, 0.1));
    }
  }
  return merge(P);
}
const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 3, 8);

function iceSpike(R, seed) {
  const r = rng(seed);
  const P = [];
  for (let i = 0; i < 4; i++) P.push(paint(T(cone(0.25 + r() * 0.3, 1 + r() * 2, 5), (r() - 0.5) * 1.2, 0.6, (r() - 0.5) * 1.2, (r() - 0.5) * 0.4, 0, (r() - 0.5) * 0.4), i % 2 ? "#bfe6f7" : "#e8f7ff", 0.08, seed + i));
  return merge(P);
}

function crystal(R, seed) {
  const r = rng(seed);
  const P = [];
  for (let i = 0; i < 5; i++) {
    const h = 0.8 + r() * 1.8;
    P.push(paint(T(cone(0.22 + r() * 0.2, h, 5), (r() - 0.5) * 0.9, h / 2, (r() - 0.5) * 0.9, (r() - 0.5) * 0.7, r(), (r() - 0.5) * 0.7), i % 2 ? "#6cf2ff" : "#b58cff", 0.1, seed + i));
  }
  P.push(paint(T(dodec(0.5), 0, 0.15, 0, 0, 0, 0, 1.6, 0.5, 1.6), R.rock, 0.15));
  return merge(P);
}

/* ------------------------------------------------------------- buildings */
function house(R, seed, opts = {}) {
  const r = rng(seed);
  const w = 3.2 + r() * 1.4;
  const d = 2.8 + r() * 0.8;
  const h = 2.2 + r() * 0.6;
  const wall = opts.wall || ["#efe2c4", "#e6d3b0", "#d9c9a8"][Math.floor(r() * 3)];
  const roof = opts.roof || ["#b4553c", "#8c4a36", "#6a7b8a"][Math.floor(r() * 3)];
  const P = [];
  P.push(paint(T(box(w, h, d), 0, h / 2, 0), wall, 0.05));
  P.push(paint(T(box(w + 0.1, 0.25, d + 0.1), 0, 0.12, 0), "#8d8173"));
  const roofG = prism([[-d / 2 - 0.35, 0], [d / 2 + 0.35, 0], [0, h * 0.62]], w + 0.5);
  roofG.rotateY(Math.PI / 2);
  P.push(paint(T(roofG, 0, h, 0), roof, 0.08));
  P.push(paint(T(box(0.5, 1.0, 0.5), w * 0.25, h + 0.9, 0), "#8d7d6e")); // chimney
  for (const s of [-1, 1]) {
    for (const x of [-w * 0.25, w * 0.25]) P.push(paint(T(box(0.5, 0.55, 0.05), x, h * 0.6, s * (d / 2 + 0.01)), "#3b4a5a"));
  }
  P.push(paint(T(box(0.06, 1.2, 0.7), w / 2 + 0.01, 0.6, 0), "#6b4a2e"));
  return merge(P);
}

function barn(R) {
  const P = [];
  P.push(paint(T(box(5, 3.2, 3.6), 0, 1.6, 0), "#a8382c", 0.05));
  const roofG = prism([[-2.1, 0], [2.1, 0], [1.2, 1.2], [0, 1.6], [-1.2, 1.2]], 5.4);
  roofG.rotateY(Math.PI / 2);
  P.push(paint(T(roofG, 0, 3.2, 0), "#4a4a4f", 0.06));
  P.push(paint(T(box(0.06, 2.0, 1.8), 2.51, 1.0, 0), "#f2ead8"));
  P.push(paint(T(box(0.07, 0.12, 1.9), 2.52, 1.0, 0, 0.7, 0, 0), "#f2ead8"));
  P.push(paint(T(cyl(0.9, 0.9, 4.2, 12), -3.6, 2.1, 0.6), "#c8c2b4", 0.04)); // silo
  P.push(paint(T(dome(0.92, 12, 5), -3.6, 4.2, 0.6), "#8a8f96"));
  return merge(P);
}

function windmillBase() {
  const P = [];
  P.push(paint(T(cyl(0.9, 1.5, 6, 8), 0, 3, 0), "#e9e0cc", 0.05));
  P.push(paint(T(cone(1.2, 1.4, 8), 0, 6.7, 0), "#7a4a36", 0.06));
  P.push(paint(T(box(0.08, 1.2, 0.6), 1.3, 0.6, 0), "#6b4a2e"));
  return merge(P);
}
export function windmillBlades() {
  return cached("windmill-blades", () => {
    const P = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      P.push(paint(T(box(0.06, 3.0, 0.7), Math.cos(a) * 1.6, Math.sin(a) * 1.6, 0, 0, 0, a - Math.PI / 2), "#f0e8d6", 0.05));
      P.push(paint(T(box(0.05, 3.2, 0.06), Math.cos(a) * 1.6, Math.sin(a) * 1.6, 0, 0, 0, a - Math.PI / 2), "#6b4a2e"));
    }
    P.push(paint(cylZ(0.2, 0.4, 10), "#6b4a2e"));
    return merge(P);
  });
}

function hay() {
  return merge([paint(T(cylZ(0.6, 1.0, 12), 0, 0.6, 0), "#e2c26a", 0.1)]);
}

function fence(R) {
  const P = [];
  for (let i = 0; i < 4; i++) P.push(paint(T(box(0.12, 0.9, 0.12), -1.8 + i * 1.2, 0.45, 0), "#8a6a48", 0.1, i));
  P.push(paint(T(box(3.8, 0.1, 0.06), 0, 0.7, 0), "#9a7a56"));
  P.push(paint(T(box(3.8, 0.1, 0.06), 0, 0.38, 0), "#9a7a56"));
  return merge(P);
}

function cropField(R, color) {
  const P = [paint(T(box(10, 0.06, 7), 0, 0.03, 0), "#7b5b3a", 0.05)];
  for (let i = 0; i < 8; i++) P.push(paint(T(box(9.6, 0.32, 0.45), 0, 0.18, -3.1 + i * 0.88), color, 0.12, i));
  return merge(P);
}

function adobe(R, seed) {
  const r = rng(seed);
  const w = 3 + r() * 1.5;
  const h = 2 + r() * 1.2;
  const P = [paint(T(box(w, h, 3), 0, h / 2, 0), "#d8a874", 0.06)];
  P.push(paint(T(box(w + 0.2, 0.2, 3.2), 0, h + 0.1, 0), "#c08a58"));
  for (let i = 0; i < 4; i++) P.push(paint(T(cylX(0.06, 0.5, 5), w / 2 + 0.1, h - 0.3, -1.1 + i * 0.7), "#6b4a2e"));
  P.push(paint(T(box(0.06, 1.1, 0.7), w / 2 + 0.01, 0.55, 0.6), "#5a3d28"));
  P.push(paint(T(box(0.06, 0.5, 0.5), w / 2 + 0.01, h * 0.62, -0.7), "#3b2a20"));
  return merge(P);
}

function waterTower() {
  const P = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(paint(T(box(0.18, 5, 0.18), x, 2.5, z), "#6b4a2e", 0.1));
  P.push(paint(T(cyl(1.5, 1.5, 2.2, 12), 0, 6.1, 0), "#8a6a48", 0.08));
  P.push(paint(T(cone(1.7, 1.0, 12), 0, 7.7, 0), "#5a4a3a"));
  for (let i = 0; i < 3; i++) P.push(paint(T(torus(1.52, 0.04, 4, 20), 0, 5.3 + i * 0.7, 0, Math.PI / 2), "#3d3a38"));
  return merge(P);
}

function mesa(R, seed) {
  const r = rng(seed);
  const P = [];
  const w = 14 + r() * 10;
  const h = 10 + r() * 10;
  P.push(paint(T(cyl(w * 0.42, w * 0.55, h, 8), 0, h / 2, 0, 0, r(), 0, 1, 1, 0.7), R.rock, 0.1, seed));
  P.push(paint(T(cyl(w * 0.4, w * 0.42, 1.2, 8), 0, h + 0.4, 0, 0, r(), 0, 1, 1, 0.68), R.dirt, 0.1));
  for (let i = 0; i < 3; i++) P.push(paint(T(box(w * 0.9, 0.5, w * 0.55), 0, h * (0.3 + i * 0.22), 0, 0, r(), 0), "#a65a32", 0.1));
  return merge(P);
}

function arch(R) {
  const P = [];
  const s = new THREE.Shape();
  s.moveTo(-7, 0);
  s.lineTo(-4.5, 0);
  s.absarc(0, 0, 4.5, Math.PI, 0, true);
  s.lineTo(7, 0);
  s.lineTo(6, 6);
  s.lineTo(-6, 6.5);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 3, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -1.5);
  P.push(paint(T(g, 0, 0, 0, 0, Math.PI / 2, 0), R.rock, 0.12));
  return merge(P);
}

function dune(R, seed) {
  const r = rng(seed);
  return merge([paint(T(sph(4, 12, 6), 0, -1.6, 0, 0, r() * 3, 0, 1.8 + r(), 0.7, 1.2), R.ground2, 0.04)]);
}

function cabin(R, seed) {
  const r = rng(seed);
  const w = 3 + r();
  const P = [];
  for (let i = 0; i < 6; i++) {
    P.push(paint(T(cylX(0.2, w, 7), 0, 0.2 + i * 0.36, 1.3), "#6b4a32", 0.12, i));
    P.push(paint(T(cylX(0.2, w, 7), 0, 0.2 + i * 0.36, -1.3), "#6b4a32", 0.12, i + 9));
    P.push(paint(T(cylZ(0.2, 2.8, 7), w / 2 - 0.2, 0.38 + i * 0.36, 0), "#5e4029", 0.12, i + 19));
    P.push(paint(T(cylZ(0.2, 2.8, 7), -w / 2 + 0.2, 0.38 + i * 0.36, 0), "#5e4029", 0.12, i + 29));
  }
  const roofG = prism([[-1.8, 0], [1.8, 0], [0, 1.4]], w + 0.6);
  roofG.rotateY(Math.PI / 2);
  P.push(paint(T(roofG, 0, 2.2, 0), "#f2f6fa", 0.04));
  P.push(paint(T(box(0.5, 1.4, 0.5), -w * 0.25, 3.0, 0.4), "#7d7a76"));
  P.push(paint(T(box(0.06, 0.5, 0.5), w / 2 + 0.01, 1.2, 0.5), "#ffd58a"));
  return merge(P);
}

function ruin(R, seed) {
  const r = rng(seed);
  const P = [];
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const h = 1.5 + r() * 4;
    P.push(paint(T(box(1.2 + r() * 2, h, 0.5), (i - n / 2) * 1.7, h / 2, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.3, (r() - 0.5) * 0.15), i % 2 ? "#5a5260" : "#4a4352", 0.12, i));
  }
  P.push(paint(T(cyl(0.6, 0.8, 7 + r() * 4, 8), n * 0.9, 4, -1.5), "#3f3946", 0.1));
  return merge(P);
}

function factory(R, seed) {
  const r = rng(seed);
  const P = [];
  const w = 8 + r() * 4;
  P.push(paint(T(box(w, 5, 6), 0, 2.5, 0), "#6b5e55", 0.06));
  for (let i = 0; i < 4; i++) {
    const g = prism([[0, 0], [w / 4, 0], [0, 1.6]], 6.1);
    P.push(paint(T(g, -w / 2 + (i * w) / 4, 5, 0), "#4a4440", 0.06));
  }
  for (let i = 0; i < 5; i++) P.push(paint(T(box(1.0, 1.2, 0.06), -w / 2 + 1 + i * (w - 2) / 4, 2.6, 3.01), "#ffb35a"));
  P.push(paint(T(cyl(0.6, 0.8, 9, 10), w / 2 - 1, 4.5, -1.5), "#5a4a40"));
  P.push(paint(T(torus(0.65, 0.08, 5, 12), w / 2 - 1, 7.5, -1.5, Math.PI / 2), "#c0502a"));
  return merge(P);
}

function fortWall(R) {
  const P = [];
  P.push(paint(T(box(18, 5, 2.4), 0, 2.5, 0), "#5c5864", 0.08));
  for (let i = 0; i < 9; i++) P.push(paint(T(box(1.2, 0.9, 2.5), -8 + i * 2, 5.45, 0), "#4e4a56"));
  for (const x of [-9, 9]) {
    P.push(paint(T(cyl(2, 2.3, 8, 8), x, 4, 0), "#4e4a56", 0.08));
    P.push(paint(T(cone(2.6, 2.4, 8), x, 9.2, 0), "#7a2a22", 0.08));
  }
  P.push(paint(T(box(18.2, 0.4, 0.1), 0, 3.5, 1.21), "#c0502a"));
  return merge(P);
}

function tank(R) {
  const P = [paint(T(cyl(2.4, 2.4, 3.6, 16), 0, 1.8, 0), "#8a8580", 0.04)];
  P.push(paint(T(dome(2.42, 16, 5), 0, 3.6, 0, 0, 0, 0, 1, 0.3, 1), "#a29c95"));
  P.push(paint(T(torus(2.42, 0.06, 4, 24), 0, 1.4, 0, Math.PI / 2), "#c0502a"));
  return merge(P);
}

function scrapPile(R, seed) {
  const r = rng(seed);
  const P = [];
  for (let i = 0; i < 8; i++) P.push(paint(T(box(0.4 + r() * 1.2, 0.2 + r() * 0.5, 0.4 + r()), (r() - 0.5) * 2.5, 0.2 + r() * 0.6, (r() - 0.5) * 2.2, r(), r(), r()), ["#6d5a4a", "#8c3b22", "#57534f", "#3d3a38"][i % 4], 0.12, i));
  P.push(paint(T(cylZ(0.5, 0.3, 10), 0.6, 0.6, 0.4, 0.4, 0, 0), "#2a2826"));
  return merge(P);
}

function pylon() {
  const P = [];
  for (const [x, z] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) P.push(paint(T(box(0.14, 9, 0.14), x * 0.6, 4.5, z * 0.6, z * 0.06, 0, -x * 0.06), "#6a6a70"));
  for (let i = 0; i < 4; i++) P.push(paint(T(box(1.2 - i * 0.18, 0.1, 0.1), 0, 2 + i * 2, 0), "#6a6a70"));
  P.push(paint(T(box(3.4, 0.14, 0.14), 0, 8.6, 0), "#6a6a70"));
  return merge(P);
}

function pond(color) {
  return merge([paint(T(cyl(5, 5.3, 0.1, 18), 0, 0.03, 0, 0, 0, 0, 1, 1, 0.6), color, 0.03), paint(T(cyl(5.6, 5.9, 0.06, 18), 0, 0.01, 0, 0, 0, 0, 1, 1, 0.62), "#8a7a5e", 0.05)]);
}

/* ------------------------------------------------------------- catalogue */
/**
 * Region prop table: key → { geo, shadow, size } (size = rough footprint
 * radius, used to keep set-pieces from overlapping).
 */
const tables = new Map();
export function regionProps(R) {
  let t = tables.get(R.key);
  if (!t) {
    t = buildTable(R);
    tables.set(R.key, t);
  }
  return t;
}

function buildTable(R) {
  const t = {};
  const add = (key, geo, shadow = true, size = 1) => {
    geo.userData.shared = true;
    t[key] = { geo, shadow, size };
  };
  add("tuft", tuft(R), false, 0.3);
  add("rock", rock(R, 4), true, 0.6);
  add("rockBig", rock(R, 8, true), true, 2.4);
  add("bush", bush(R, 3), true, 0.8);
  if (R.key === "valley") {
    add("treeA", broadleaf(R, 11), true, 2);
    add("treeB", broadleaf(R, 23), true, 2);
    add("pine", pine(R, 5), true, 1.6);
    add("flowers", flowers(R, 2), false, 0.6);
    add("house", house(R, 7), true, 3);
    add("house2", house(R, 19, { roof: "#6a7b8a" }), true, 3);
    add("barn", barn(R), true, 5);
    add("windmill", windmillBase(), true, 2);
    add("hay", hay(), true, 0.8);
    add("fence", fence(R), false, 2);
    add("pond", pond(R.water), false, 5);
    add("cropA", cropField(R, "#d9b84a"), false, 6);
    add("cropB", cropField(R, "#7fb84a"), false, 6);
  } else if (R.key === "desert") {
    add("cactus", cactus(R, 5), true, 0.8);
    add("cactus2", cactus(R, 13), true, 0.8);
    add("dry", bush(R, 9), true, 0.8);
    add("mesa", mesa(R, 3), true, 14);
    add("mesa2", mesa(R, 17), true, 14);
    add("arch", arch(R), true, 8);
    add("dune", dune(R, 4), false, 7);
    add("adobe", adobe(R, 6), true, 3);
    add("adobe2", adobe(R, 21), true, 3);
    add("tower", waterTower(), true, 2);
    add("fence", fence(R), false, 2);
  } else if (R.key === "frozen") {
    add("pine", pine(R, 5, true), true, 1.6);
    add("pine2", pine(R, 15, true), true, 1.6);
    add("pineBare", pine(R, 25, false), true, 1.6);
    add("ice", iceSpike(R, 3), true, 1.2);
    add("cabin", cabin(R, 4), true, 3);
    add("cabin2", cabin(R, 12), true, 3);
    add("drift", dune(R, 6), false, 6);
    add("pond", pond("#cfeaf6"), false, 5);
    add("fence", fence(R), false, 2);
  } else if (R.key === "shadow") {
    add("dead", deadTree(R, 3), true, 1.2);
    add("dead2", deadTree(R, 9), true, 1.2);
    add("crystal", crystal(R, 4), false, 1.2);
    add("crystal2", crystal(R, 14), false, 1.2);
    add("ruin", ruin(R, 2), true, 5);
    add("ruin2", ruin(R, 7), true, 5);
    add("ash", dune(R, 5), false, 6);
  } else {
    add("factory", factory(R, 3), true, 7);
    add("factory2", factory(R, 11), true, 7);
    add("fort", fortWall(R), true, 10);
    add("tank", tank(R), true, 3);
    add("scrap", scrapPile(R, 5), true, 1.6);
    add("scrap2", scrapPile(R, 15), true, 1.6);
    add("pylon", pylon(), true, 1.5);
    add("dead", deadTree(R, 3), true, 1.2);
  }
  return t;
}
