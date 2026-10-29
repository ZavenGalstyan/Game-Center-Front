/**
 * Level meshes built from data/levels.js props: ground, sky, bounds
 * dressing, buildings, trees, bamboo (instanced), river/bridges, arena.
 * Everything is cheap toon/lambert geometry — no shadows, no textures beyond
 * a few small canvas ones.
 */
import * as THREE from "three";
import { toonGradient } from "./characters.js";

const mats = new Map();
const toon = (c) => {
  if (!mats.has(c)) mats.set(c, new THREE.MeshToonMaterial({ color: c, gradientMap: toonGradient() }));
  return mats.get(c);
};
const lamb = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
function skyTex(top, mid, bottom) {
  return canvasTex(4, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, top);
    gr.addColorStop(0.55, mid);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}
function noiseGround(base, dots, size = 256, tile = 8) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = dots[i % dots.length];
      g.globalAlpha = 0.35;
      g.beginPath();
      g.arc(r() * w, r() * h, 1 + r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }, tile);
}
function tileGround() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#c9b48e";
    g.fillRect(0, 0, w, h);
    const n = 4;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const v = 190 + ((i * 7 + j * 13) % 5) * 8;
        g.fillStyle = `rgb(${v},${v - 18},${v - 50})`;
        g.fillRect(i * (w / n) + 2, j * (h / n) + 2, w / n - 4, h / n - 4);
      }
  }, 7);
}

const add = (parent, geo, mat, p = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0]) => {
  const m = new THREE.Mesh(geo, typeof mat === "string" ? toon(mat) : mat);
  m.position.set(...p);
  m.scale.set(...s);
  m.rotation.set(...r);
  parent.add(m);
  return m;
};
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
  cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  cone: new THREE.ConeGeometry(1, 1, 10),
  sph: new THREE.SphereGeometry(1, 12, 9),
  ico: new THREE.IcosahedronGeometry(1, 0),
};

/* ---------------------------------------------------------------- props */
function roof(parent, x, y, z, w, d, h, color, trim) {
  // a hipped roof: flattened 4-sided pyramid, rotated so edges align, with eaves
  const r = add(parent, G.cone4, color, [x, y + h / 2, z], [w * 0.74, h, d * 0.74], [0, Math.PI / 4, 0]);
  add(parent, G.box, trim, [x, y + 0.04, z], [w + 0.5, 0.12, d + 0.5]);
  return r;
}
function building(g, p) {
  const { x, z, w, d, h } = p;
  if (p.style === "hall") {
    add(g, G.box, "#8a3a24", [x, 0.3, z], [w + 0.6, 0.6, d + 0.6]); // platform
    add(g, G.box, "#e8d6a8", [x, 0.6 + (h - 2.2) / 2, z + 0.1], [w - 0.6, h - 2.2, d - 0.6]);
    for (let i = 0; i <= 6; i++) add(g, G.cyl, "#b3261e", [x - w / 2 + 0.4 + (i * (w - 0.8)) / 6, 0.6 + (h - 2.2) / 2, z - d / 2 + 0.25], [0.2, h - 2.2, 0.2]);
    add(g, G.box, "#6a1c12", [x, 0.6 + (h - 2.2) * 0.42, z - d / 2 + 0.2], [3, (h - 2.2) * 0.84, 0.1]); // doors
    add(g, G.box, "#e7b53c", [x, h - 1.45, z - d / 2 + 0.1], [w - 0.4, 0.3, 0.2]);
    roof(g, x, h - 1.6, z, w + 1.2, d + 1.6, 2.2, "#2f8a6a", "#e7b53c");
    add(g, G.box, "#e7b53c", [x, h - 1.6 + 2.1, z], [w * 0.5, 0.14, 0.14]);
    return;
  }
  const wallC = p.style === "shop" ? "#f0e2c0" : "#efe4cc";
  const roofC = p.style === "shop" ? "#3a7a5a" : ["#a0442a", "#7a4a2a", "#3a6a7a"][Math.abs(Math.round(x + z)) % 3];
  const wallH = h - 1.4;
  add(g, G.box, wallC, [x, wallH / 2, z], [w, wallH, d]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, G.box, "#5a3a22", [x + (sx * w) / 2, wallH / 2, z + (sz * d) / 2], [0.22, wallH, 0.22]);
  add(g, G.box, "#5a3a22", [x, wallH, z], [w + 0.1, 0.18, d + 0.1]);
  // door + windows on the long sides
  for (const sz of [-1, 1]) {
    add(g, G.box, "#6a3a1e", [x, 0.85, z + sz * (d / 2 + 0.01)], [1, 1.7, 0.06]);
    for (const sx of [-1, 1]) add(g, G.box, "#3a2a1a", [x + sx * w * 0.3, 1.5, z + sz * (d / 2 + 0.01)], [0.7, 0.6, 0.05]);
  }
  roof(g, x, wallH, z, w + 0.9, d + 0.9, 1.5, roofC, "#4a2a18");
  if (p.style === "shop") {
    add(g, G.box, "#b3261e", [x, wallH + 0.4, z + d / 2 + 0.5], [3.2, 0.7, 0.08]); // sign
    add(g, G.box, "#e7b53c", [x, wallH + 0.4, z + d / 2 + 0.55], [2.6, 0.2, 0.05]);
  }
  add(g, G.sph, lamb("#ff5a3a", { emissive: "#ff3a1a", emissiveIntensity: 0.6 }), [x + w / 2 - 0.6, wallH - 0.3, z - d / 2 - 0.35], [0.18, 0.24, 0.18]);
}
function tree(g, p) {
  const s = p.s;
  add(g, G.cyl6, "#6a4528", [p.x, 1.1 * s, p.z], [0.22 * s, 2.2 * s, 0.22 * s]);
  add(g, G.cyl6, "#6a4528", [p.x + 0.4 * s, 2.0 * s, p.z], [0.1 * s, 1.0 * s, 0.1 * s], [0, 0, -0.7]);
  const leaf = p.kind === "peach" ? ["#f4a6c0", "#ec8fae", "#f8c4d4"] : ["#5aa848", "#4a9440", "#6abb54"];
  const blobs = [[0, 2.9, 0, 1.25], [0.8, 2.6, 0.3, 0.9], [-0.7, 2.6, -0.2, 0.95], [0.1, 3.5, -0.3, 0.8]];
  blobs.forEach(([bx, by, bz, br], i) => add(g, G.ico, leaf[i % 3], [p.x + bx * s, by * s, p.z + bz * s], [br * s, br * s * 0.85, br * s]));
}
function pillar(g, p) {
  if (p.style === "arena") {
    add(g, G.cyl6, "#8a8a90", [p.x, p.h / 2, p.z], [p.r, p.h, p.r]);
    add(g, G.box, "#6a6a72", [p.x, p.h + 0.15, p.z], [p.r * 2.4, 0.3, p.r * 2.4]);
    add(g, G.box, "#5a2a6a", [p.x, p.h * 0.62, p.z], [p.r * 2.05, 1.6, 0.06], [0, Math.atan2(p.x, p.z), 0]); // banner
    return;
  }
  add(g, G.cyl, "#b3261e", [p.x, p.h / 2, p.z], [p.r * 0.75, p.h, p.r * 0.75]);
  add(g, G.box, "#4a3a2a", [p.x, 0.15, p.z], [p.r * 2.2, 0.3, p.r * 2.2]);
  add(g, G.box, "#e7b53c", [p.x, p.h, p.z], [p.r * 2, 0.25, p.r * 2]);
  add(g, G.sph, lamb("#ff6a3a", { emissive: "#ff4a1a", emissiveIntensity: 0.7 }), [p.x, p.h + 0.45, p.z], [0.3, 0.38, 0.3]);
}
function lantern(g, p) {
  add(g, G.cyl6, "#3a2a1a", [p.x, 1.1, p.z], [0.07, 2.2, 0.07]);
  add(g, G.box, "#3a2a1a", [p.x, 2.15, p.z], [0.5, 0.06, 0.06]);
  add(g, G.sph, lamb("#ff5030", { emissive: "#ff4020", emissiveIntensity: 0.8 }), [p.x, 1.95, p.z], [0.22, 0.28, 0.22]);
  add(g, G.box, "#e7b53c", [p.x, 1.95, p.z], [0.46, 0.04, 0.46]);
}
function rack(g, p) {
  add(g, G.box, "#6a4020", [p.x, p.h / 2, p.z], [0.18, p.h, p.d]);
  add(g, G.box, "#6a4020", [p.x, p.h * 0.85, p.z], [0.5, 0.1, p.d]);
  for (let i = 0; i < 5; i++) {
    const zz = p.z - p.d / 2 + 0.5 + (i * (p.d - 1)) / 4;
    add(g, G.cyl6, "#a07a4a", [p.x + 0.12, p.h * 0.55, zz], [0.035, p.h * 1.05, 0.035], [0, 0, 0.12]);
    add(g, G.cone, "#c0c4cc", [p.x + 0.18, p.h * 1.1, zz], [0.06, 0.25, 0.03]);
  }
}
function gong(g, p) {
  for (const s of [-1, 1]) add(g, G.cyl6, "#5a3a22", [p.x + s * 0.8, 1.2, p.z], [0.08, 2.4, 0.08]);
  add(g, G.box, "#5a3a22", [p.x, 2.35, p.z], [1.9, 0.12, 0.12]);
  add(g, G.cyl, "#d8a838", [p.x, 1.3, p.z], [0.7, 0.08, 0.7], [Math.PI / 2, 0, 0]);
  add(g, G.cyl, "#b8882a", [p.x, 1.3, p.z + 0.03], [0.25, 0.06, 0.25], [Math.PI / 2, 0, 0]);
}
function rock(g, p) {
  add(g, G.ico, "#8a8a84", [p.x, p.r * 0.45, p.z], [p.r, p.r * 0.75, p.r * 0.9], [0.3, p.x, 0.2]);
}
function shrine(g, p) {
  add(g, G.box, "#7a6a5a", [p.x, 0.2, p.z], [3, 0.4, 2.4]);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, G.cyl6, "#b3261e", [p.x + sx * 1.1, 1.3, p.z + sz * 0.8], [0.12, 1.9, 0.12]);
  add(g, G.box, "#d8b070", [p.x, 0.8, p.z + 0.2], [1.2, 0.8, 0.8]); // altar
  roof(g, p.x, 2.25, p.z, 3.2, 2.6, 1.2, "#2f6a4a", "#e7b53c");
}

/* ---------------------------------------------------------------- bamboo */
function bambooInstances(g, clumps) {
  const stalks = [];
  for (const c of clumps) {
    let s = c.seed || 1;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const n = c.n || 5;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = r() * c.r * 0.8;
      stalks.push({ x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, h: 5 + r() * 4, lean: (r() - 0.5) * 0.12, rot: r() * 6 });
    }
  }
  const stalkGeo = new THREE.CylinderGeometry(0.075, 0.09, 1, 6);
  stalkGeo.translate(0, 0.5, 0);
  const stalkM = new THREE.InstancedMesh(stalkGeo, toon("#7ab04a"), stalks.length);
  const nodeM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 6), toon("#4f7a2a"), stalks.length * 4);
  const leafM = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1.6, 5), toon("#4f9a38"), stalks.length * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  stalks.forEach((s, i) => {
    e.set(s.lean, s.rot, s.lean * 0.5);
    q.setFromEuler(e);
    m4.compose(v.set(s.x, 0, s.z), q, sc.set(1, s.h, 1));
    stalkM.setMatrixAt(i, m4);
    for (let k = 0; k < 4; k++) {
      m4.compose(v.set(s.x + s.lean * 0.5 * (k + 1), s.h * (0.2 + k * 0.2), s.z), q, sc.set(1, 1, 1));
      nodeM.setMatrixAt(i * 4 + k, m4);
    }
    for (let k = 0; k < 2; k++) {
      e.set(Math.PI + 0.6, s.rot + k * 2.2, 0);
      q.setFromEuler(e);
      m4.compose(v.set(s.x + Math.cos(s.rot + k * 2.2) * 0.4, s.h * (0.72 + k * 0.18), s.z + Math.sin(s.rot + k * 2.2) * 0.4), q, sc.set(1, 1, 0.35));
      leafM.setMatrixAt(i * 2 + k, m4);
    }
  });
  for (const M of [stalkM, nodeM, leafM]) {
    M.instanceMatrix.needsUpdate = true;
    M.computeBoundingSphere();
    g.add(M);
  }
}

/* ---------------------------------------------------------------- backdrop */
function mountains(g, R, n, col, snow, hMin, hMax, seed = 3) {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.2;
    const d = R + r() * 18;
    const h = hMin + r() * (hMax - hMin);
    const w = h * (0.6 + r() * 0.4);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    add(g, G.cone, col, [x, h / 2 - 1, z], [w, h, w], [0, r() * 3, 0]);
    if (snow) add(g, G.cone, snow, [x, h - 1 - h * 0.14, z], [w * 0.29, h * 0.29, w * 0.29]);
  }
}

/* ---------------------------------------------------------------- per theme */
export function buildScenery(level) {
  const g = new THREE.Group();
  g.name = "scenery";
  const B = level.bounds;
  const theme = level.theme;
  const env = { background: null, fog: null, hemi: ["#ffffff", "#6a7a4a", 1.25], sun: ["#fff2dc", 2.0, [12, 20, 8]] };

  // ground
  let groundMat;
  if (theme === "palace") groundMat = new THREE.MeshLambertMaterial({ map: tileGround() });
  else if (theme === "valley") groundMat = new THREE.MeshLambertMaterial({ map: noiseGround("#78b04e", ["#5f9a3e", "#8cc25e", "#6aa846"]) });
  else if (theme === "forest") groundMat = new THREE.MeshLambertMaterial({ map: noiseGround("#4f7f3a", ["#3e6a2e", "#62924a", "#7a8a3a"]) });
  else groundMat = new THREE.MeshLambertMaterial({ map: noiseGround("#9a9488", ["#86807a", "#aaa49a", "#7a746c"], 256, 6) });
  const big = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), theme === "arena" ? lamb("#e8eef4") : theme === "palace" ? lamb("#6aa04a") : groundMat);
  big.rotation.x = -Math.PI / 2;
  big.position.y = -0.02;
  g.add(big);

  if (theme === "palace") {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(B.x1 - B.x0 + 2, B.z1 - B.z0 + 2), groundMat);
    floor.rotation.x = -Math.PI / 2;
    g.add(floor);
    // red courtyard walls with green tile caps (south side has a gate gap)
    const wall = (x0, z0, x1, z1) => {
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0);
      add(g, G.box, "#a8321e", [cx, 1.2, cz], [0.6, 2.4, len], [0, rot, 0]);
      add(g, G.box, "#2f8a6a", [cx, 2.5, cz], [1.1, 0.25, len + 0.4], [0, rot, 0]);
    };
    wall(B.x0 - 0.3, B.z0 - 0.3, B.x0 - 0.3, B.z1 + 0.3);
    wall(B.x1 + 0.3, B.z0 - 0.3, B.x1 + 0.3, B.z1 + 0.3);
    wall(B.x0 - 0.3, B.z1 + 0.3, B.x1 + 0.3, B.z1 + 0.3);
    wall(B.x0 - 0.3, B.z0 - 0.3, -2.5, B.z0 - 0.3);
    wall(2.5, B.z0 - 0.3, B.x1 + 0.3, B.z0 - 0.3);
    for (const s of [-1, 1]) add(g, G.box, "#b3261e", [s * 2.6, 2, B.z0 - 0.3], [0.5, 4, 0.5]);
    add(g, G.box, "#2f8a6a", [0, 4.1, B.z0 - 0.3], [6.4, 0.4, 1]);
    // the long stairway down the mountain beyond the gate
    for (let i = 0; i < 10; i++) add(g, G.box, "#b8a888", [0, -0.3 - i * 0.45, B.z0 - 1.2 - i * 0.9], [4.6, 0.45, 0.9]);
    mountains(g, 70, 16, "#7a9ab8", "#f4f6fa", 25, 50);
    mountains(g, 45, 10, "#5f8a5a", null, 10, 20, 9);
    env.background = skyTex("#5aa8e8", "#a8d8f4", "#e8f2f4");
    env.fog = new THREE.Fog("#cfe6f2", 60, 150);
  } else if (theme === "valley") {
    // dirt road + river + banks
    const road = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 48), lamb("#c8a878"));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    g.add(road);
    const river = level.props.find((p) => p.t === "river");
    const water = new THREE.Mesh(new THREE.PlaneGeometry(river.x1 - river.x0 + 60, river.z1 - river.z0), lamb("#4a9ad8", { emissive: "#1a4a7a", emissiveIntensity: 0.25 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set((river.x0 + river.x1) / 2, 0.03, (river.z0 + river.z1) / 2);
    water.name = "water";
    g.add(water);
    for (const zz of [river.z0, river.z1]) add(g, G.box, "#8a7a5a", [0, 0.05, zz], [110, 0.14, 0.35]);
    for (const b of level.props.filter((p) => p.t === "bridge")) {
      add(g, G.box, "#9a6a3a", [b.x, 0.07, b.z], [b.w - 0.2, 0.12, b.d]);
      for (let i = 0; i < 9; i++) add(g, G.box, "#7a4a24", [b.x, 0.14, b.z - b.d / 2 + 0.3 + (i * (b.d - 0.6)) / 8], [b.w - 0.2, 0.03, 0.12]);
      for (const s of [-1, 1]) {
        add(g, G.box, "#b3261e", [b.x + s * (b.w / 2 - 0.1), 0.85, b.z], [0.1, 0.1, b.d]);
        for (const zz of [-1, 0, 1]) add(g, G.box, "#b3261e", [b.x + s * (b.w / 2 - 0.1), 0.45, b.z + (zz * b.d) / 2.2], [0.14, 0.9, 0.14]);
      }
    }
    // low fence around the village edge
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0);
      add(g, G.box, "#8a5a32", [(x0 + x1) / 2, 0.75, (z0 + z1) / 2], [0.08, 0.1, len], [0, rot, 0]);
      add(g, G.box, "#8a5a32", [(x0 + x1) / 2, 0.4, (z0 + z1) / 2], [0.08, 0.1, len], [0, rot, 0]);
      const n = Math.floor(len / 2);
      for (let i = 0; i <= n; i++) add(g, G.box, "#6a4024", [x0 + ((x1 - x0) * i) / n, 0.5, z0 + ((z1 - z0) * i) / n], [0.14, 1, 0.14]);
    };
    const e = 0.2;
    fence(B.x0 - e, B.z0 - e, B.x0 - e, 2);
    fence(B.x0 - e, 5.5, B.x0 - e, B.z1 + e);
    fence(B.x1 + e, B.z0 - e, B.x1 + e, 2);
    fence(B.x1 + e, 5.5, B.x1 + e, B.z1 + e);
    fence(B.x0 - e, B.z1 + e, B.x1 + e, B.z1 + e);
    fence(B.x0 - e, B.z0 - e, B.x1 + e, B.z0 - e);
    // fields and hills outside
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      add(g, G.sph, i % 2 ? "#6aa848" : "#5a9a40", [Math.cos(a) * 42, -4, Math.sin(a) * 42], [12, 9, 12]);
    }
    mountains(g, 80, 18, "#8aa2c0", "#f4f6fa", 30, 60, 5);
    env.background = skyTex("#4aa0e8", "#9fd2f2", "#e6f2f0");
    env.fog = new THREE.Fog("#cfe8f0", 55, 160);
  } else if (theme === "forest") {
    // path strips
    const path = level.path;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.1) continue;
      const m = add(g, new THREE.PlaneGeometry(2.6, len + 2.6), lamb("#a88a5a"), [(ax + bx) / 2, 0.01 + i * 0.0004, (az + bz) / 2], [1, 1, 1], [-Math.PI / 2, 0, 0]);
      m.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), Math.atan2(bx - ax, bz - az));
    }
    const pond = level.props.find((p) => p.t === "pond");
    if (pond) {
      add(g, new THREE.CircleGeometry(pond.r, 24), lamb("#3a8ac0", { emissive: "#123a5a", emissiveIntensity: 0.3 }), [pond.x, 0.03, pond.z], [1, 1, 1], [-Math.PI / 2, 0, 0]);
      add(g, new THREE.RingGeometry(pond.r, pond.r + 0.4, 24), lamb("#7a7a6a"), [pond.x, 0.035, pond.z], [1, 1, 1], [-Math.PI / 2, 0, 0]);
      for (let i = 0; i < 4; i++) add(g, new THREE.CircleGeometry(0.3, 8), lamb("#5aa848"), [pond.x + Math.cos(i * 1.7) * pond.r * 0.6, 0.05, pond.z + Math.sin(i * 1.7) * pond.r * 0.6], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    }
    // a thick wall of bamboo outside the bounds
    const wallClumps = [];
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let x = B.x0 - 6; x <= B.x1 + 6; x += 2.2)
      for (const zz of [B.z0 - 1.5, B.z0 - 4, B.z1 + 1.5, B.z1 + 4]) wallClumps.push({ x: x + r(), z: zz + r(), r: 1, n: 4, seed: Math.floor(r() * 1e6) });
    for (let z = B.z0; z <= B.z1; z += 2.2)
      for (const xx of [B.x0 - 1.5, B.x0 - 4, B.x1 + 1.5, B.x1 + 4]) wallClumps.push({ x: xx + r(), z: z + r(), r: 1, n: 4, seed: Math.floor(r() * 1e6) });
    bambooInstances(g, [...level.props.filter((p) => p.t === "bamboo"), ...wallClumps]);
    env.background = skyTex("#7ab8d0", "#bfe0d0", "#d8ecd8");
    env.fog = new THREE.Fog("#c8e2cc", 18, 70);
    env.hemi = ["#f4fff0", "#3a5a2a", 1.15];
  } else if (theme === "arena") {
    add(g, new THREE.CylinderGeometry(B.r + 0.6, B.r + 1.2, 1.2, 40), "#7a7880", [0, -0.6, 0]);
    const floor = add(g, new THREE.CircleGeometry(B.r + 0.6, 40), groundMat, [0, 0.005, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    floor.name = "arenaFloor";
    add(g, new THREE.RingGeometry(4, 4.4, 40), lamb("#b8a888"), [0, 0.012, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    add(g, new THREE.RingGeometry(9, 9.3, 40), lamb("#b8a888"), [0, 0.012, 0], [1, 1, 1], [-Math.PI / 2, 0, 0]);
    // rim wall in segments
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      if (Math.abs(Math.sin(a) + 1) < 0.02) continue;
      add(g, G.box, "#6a6870", [Math.cos(a) * (B.r + 0.4), 0.7, Math.sin(a) * (B.r + 0.4)], [0.6, 1.4, 3.5], [0, -a, 0]);
    }
    mountains(g, 62, 14, "#9aa6c0", "#ffffff", 14, 26, 11);
    mountains(g, 95, 16, "#7a86a8", "#ffffff", 26, 44, 21);
    env.background = skyTex("#2a2a5a", "#c86a5a", "#f4b878");
    env.fog = new THREE.Fog("#d89a8a", 50, 140);
    env.hemi = ["#ffe0d0", "#4a4a6a", 1.1];
    env.sun = ["#ffc8a0", 2.2, [-14, 18, 10]];
  }

  for (const p of level.props) {
    if (p.t === "building") building(g, p);
    else if (p.t === "tree") tree(g, p);
    else if (p.t === "pillar") pillar(g, p);
    else if (p.t === "lantern") lantern(g, p);
    else if (p.t === "rack") rack(g, p);
    else if (p.t === "gong") gong(g, p);
    else if (p.t === "rock") rock(g, p);
    else if (p.t === "shrine") shrine(g, p);
  }
  return { group: g, env };
}

/* ---------------------------------------------------------------- items */
export function buildItem(kind) {
  const g = new THREE.Group();
  if (kind === "scroll") {
    const s = new THREE.Group();
    add(s, G.cyl, "#f0dca0", [0, 0, 0], [0.12, 0.62, 0.12], [0, 0, Math.PI / 2]);
    for (const x of [-0.34, 0.34]) add(s, G.cyl, "#b3261e", [x, 0, 0], [0.15, 0.08, 0.15], [0, 0, Math.PI / 2]);
    add(s, G.box, "#e7b53c", [0, 0, 0], [0.08, 0.27, 0.27]);
    s.position.y = 1;
    g.add(s);
    g.userData.spin = s;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 7, 16, 1, true), new THREE.MeshBasicMaterial({ color: "#ffd860", transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 3.5;
    g.add(beam);
    g.userData.beam = beam;
  } else {
    add(g, new THREE.SphereGeometry(0.42, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), "#2f6a9a", [0, 0.48, 0]);
    add(g, G.cyl, "#e8e0d0", [0, 0.47, 0], [0.4, 0.04, 0.4]);
    for (let i = 0; i < 4; i++) add(g, G.sph, "#f8f2e4", [Math.cos(i * 1.6) * 0.18, 0.55, Math.sin(i * 1.6) * 0.18], [0.14, 0.1, 0.14]);
    add(g, G.cyl6, "#5a3a22", [0, 0.2, 0], [0.5, 0.4, 0.5]); // little stand
    const steam = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false }));
    steam.position.y = 0.95;
    g.add(steam);
    g.userData.steam = steam;
  }
  return g;
}
