/**
 * Dinosaur Island 3D — the Three.js renderer. Mirrors a Sim (sim.js) every
 * frame: terrain, water, sky & day/night, chunked instanced vegetation,
 * landmarks, the survivor + dinosaur rigs, campfires, particles and the
 * third-person camera (with terrain / wall collision).
 *
 *   const world = createWorld(canvas, { quality, preserve })
 *   world.setSim(sim)                // (re)bind to a sim — menus use a preview sim
 *   world.frame(dt, { mode, cam })   // mode "menu" | "play"
 *   world.onEvent(e)                 // sim events → particles / camera shake
 *   world.resize(w, h) · world.dispose()
 */
import * as THREE from "three";
import { height, freshWaterAt, slope, inland, fbm, rng, WORLD, LAKE, RIVER, RIVER_W, riverLevel, riverInfo, SITES } from "./terrain.js";
import { LAYOUT, inCave, inLab, segmentHit, daylight } from "./sim.js";
import * as M from "./models.js";

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ shaders */
const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FS = /* glsl */ `
uniform vec3 top;
uniform vec3 horizon;
uniform vec3 ground;
uniform vec3 sunDir;
uniform vec3 sunCol;
uniform vec3 moonDir;
uniform float stars;
uniform float time;
varying vec3 vDir;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, ground, clamp(-h * 4.0, 0.0, 1.0));
  float sd = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(sd, 1200.0) * 8.0 + pow(sd, 14.0) * 0.32 + pow(sd, 3.0) * 0.1);
  float md = max(dot(d, moonDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.99935, 0.9996, md) * 1.4 + pow(md, 60.0) * 0.06);
  if (stars > 0.0) {
    vec3 q = floor(d * 240.0);
    float r = hash(q);
    float s = step(0.9965, r);
    col += vec3(s) * stars * clamp(h * 4.0, 0.0, 1.0) * (0.55 + 0.45 * sin(time * 2.0 + r * 60.0));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Vegetation wind sway (instanced, height-weighted). */
function addSway(mat, uniforms, amount = 0.06) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime;").replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ip = vec3(0.0);
#endif
  float sw = max(0.0, position.y - 0.4) * ${amount.toFixed(3)};
  transformed.x += sin(uTime * 1.3 + ip.x * 0.15 + ip.z * 0.1) * sw;
  transformed.z += cos(uTime * 1.1 + ip.z * 0.13) * sw * 0.7;`
    );
  };
  mat.customProgramCacheKey = () => "sway" + amount;
  return mat;
}

/* ------------------------------------------------------------------ textures */
function waterNormalTex() {
  const N = 128;
  const data = new Uint8Array(N * N * 4);
  const waves = [
    [1, 2, 0.6],
    [3, -1, 0.35],
    [-2, 3, 0.3],
    [5, 4, 0.12],
    [-6, 1, 0.1],
  ];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      let dx = 0;
      let dy = 0;
      for (const [a, b, amp] of waves) {
        const ph = (TAU * (a * x + b * y)) / N;
        dx += amp * a * Math.cos(ph);
        dy += amp * b * Math.cos(ph);
      }
      const n = new THREE.Vector3(-dx * 0.12, -dy * 0.12, 1).normalize();
      const i = (y * N + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
function chainTex() {
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const a = (x + y) % 16;
      const b = (x - y + 64) % 16;
      const on = a < 2 || b < 2;
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 150;
      data[i + 3] = on ? 255 : 0;
    }
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}
function signTex(lines, w = 512, h = 160, bg = "#e9e2c8", fg = "#2a2a22") {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 10;
  g.strokeRect(8, 8, w - 16, h - 16);
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  lines.forEach(([txt, size], i) => {
    g.font = `800 ${size}px Inter, Arial, sans-serif`;
    g.fillText(txt, w / 2, (h / (lines.length + 1)) * (i + 1));
  });
  // weathering
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(90,70,40,${Math.random() * 0.18})`;
    g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 14, 2 + Math.random() * 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function softDot() {
  const N = 32;
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2);
      const a = Math.max(0, 1 - d) ** 1.6;
      const i = (y * N + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = a * 255;
    }
  const t = new THREE.DataTexture(data, N, N);
  t.needsUpdate = true;
  return t;
}

/* ------------------------------------------------------------------ chunked instancing */
const CHUNK = 120;
class Scatter {
  constructor(scene, geo, mat, items, { shadow = true, receive = true, maxDist = 340, own } = {}) {
    this.items = items;
    this.ref = new Array(items.length);
    this.meshes = [];
    this.maxDist = maxDist;
    const byChunk = new Map();
    items.forEach((it, i) => {
      const k = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`;
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push(i);
    });
    const m4 = new THREE.Matrix4();
    for (const idx of byChunk.values()) {
      const mesh = new THREE.InstancedMesh(geo, mat, idx.length);
      mesh.castShadow = shadow;
      mesh.receiveShadow = receive;
      idx.forEach((i, j) => {
        this.ref[i] = [mesh, j];
        this.compose(m4, items[i], items[i].hidden ? 0 : 1);
        mesh.setMatrixAt(j, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      let cx = 0;
      let cz = 0;
      for (const i of idx) {
        cx += items[i].x;
        cz += items[i].z;
      }
      mesh.userData.c = new THREE.Vector2(cx / idx.length, cz / idx.length);
      scene.add(mesh);
      this.meshes.push(mesh);
    }
    own && own(geo);
  }
  compose(m4, it, vis, tilt = 0, tiltA = 0) {
    const s = (it.s || 1) * vis;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(it.lean ? it.lean + Math.cos(tiltA) * tilt : Math.cos(tiltA) * tilt, it.rot || 0, Math.sin(tiltA) * tilt));
    m4.compose(new THREE.Vector3(it.x, it.y + (it.dy || 0), it.z), q, new THREE.Vector3(s * (it.sx || 1), s * (it.sy || 1), s * (it.sx || 1)));
    return m4;
  }
  set(i, vis, tilt = 0, tiltA = 0) {
    const [mesh, j] = this.ref[i];
    mesh.setMatrixAt(j, this.compose(new THREE.Matrix4(), this.items[i], vis, tilt, tiltA));
    mesh.instanceMatrix.needsUpdate = true;
  }
  cull(cx, cz) {
    for (const m of this.meshes) m.visible = Math.hypot(m.userData.c.x - cx, m.userData.c.y - cz) < this.maxDist + CHUNK * 0.75;
  }
  dispose(scene) {
    for (const m of this.meshes) {
      scene.remove(m);
      m.dispose();
    }
  }
}

/* ------------------------------------------------------------------ static builders */
function buildTerrain() {
  const SEG = 250;
  const size = WORLD * 2;
  const n = SEG + 1;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const idx = new Uint32Array(SEG * SEG * 6);
  const C = (h) => new THREE.Color(h);
  const sand = C(0xe0cc96);
  const wet = C(0xb39a64);
  const grass = C(0x5d8d37);
  const jungle = C(0x3b6a27);
  const moss = C(0x4a7a2e);
  const dirt = C(0x6e5a3a);
  const rock = C(0x7c776d);
  const rockHi = C(0x9e998f);
  const seabed = C(0xc9b484);
  const deep = C(0x4c7a78);
  const pad = C(0x857c68);
  const trail = [
    [4, 176],
    [-2, 140],
    [-18, 100],
    [-36, 70],
    [-44, 58],
    [-28, 40],
    [-8, 22],
    [20, 6],
    [44, -14],
    [66, -30],
    [74, -30],
  ];
  const trailD = (x, z) => {
    let best = 1e9;
    for (let i = 0; i < trail.length - 1; i++) {
      const [ax, az] = trail[i];
      const [bx, bz] = trail[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  const c = new THREE.Color();
  for (let iz = 0; iz < n; iz++)
    for (let ix = 0; ix < n; ix++) {
      const x = -WORLD + (ix / SEG) * size;
      const z = -WORLD + (iz / SEG) * size;
      const h = height(x, z);
      const i = iz * n + ix;
      pos[i * 3] = x;
      pos[i * 3 + 1] = h;
      pos[i * 3 + 2] = z;
      const sl = slope(x, z);
      const inl = inland(x, z);
      const nz = fbm(x * 0.04, z * 0.04, 3);
      if (h < -0.4) c.copy(seabed).lerp(deep, smooth(-0.4, -9, h));
      else if (inl < 0.1 && h < 2.6) c.copy(wet).lerp(sand, smooth(-0.2, 0.9, h)).lerp(grass, smooth(0.07, 0.11, inl) * smooth(1.6, 2.6, h));
      else {
        c.copy(grass).lerp(jungle, clamp(0.5 + nz * 1.2 + smooth(0.15, 0.4, inl) * 0.5, 0, 1));
        c.lerp(moss, clamp(fbm(x * 0.11, z * 0.11, 2) + 0.2, 0, 0.5));
        if (nz > 0.25) c.lerp(dirt, (nz - 0.25) * 1.2);
        c.lerp(rock, smooth(0.5, 0.95, sl) * 0.9);
        c.lerp(rockHi, smooth(32, 52, h));
      }
      // river & lake banks: wet mud
      const fw = Math.min(Math.hypot(x - LAKE.x, z - LAKE.z) - LAKE.r, riverInfo(x, z).d - RIVER_W);
      if (fw < 5 && h > -0.4) c.lerp(dirt, smooth(5, 0, fw) * 0.6);
      // trail & landmark pads
      const td = trailD(x, z);
      if (td < 2.6 && h > 1) c.lerp(dirt, smooth(2.6, 0.8, td) * 0.75);
      const sd = Math.hypot(x - SITES.station.x, z - SITES.station.z);
      if (Math.abs(x - SITES.station.x) < 29 && Math.abs(z - SITES.station.z) < 29) c.lerp(pad, 0.55 + nz * 0.3);
      else if (sd < 40) c.lerp(pad, smooth(40, 30, sd) * 0.3);
      const cd = Math.hypot(x - LAYOUT.cave.x, z - LAYOUT.cave.z);
      if (cd < 11) c.lerp(rock, smooth(11, 6, cd) * 0.9).multiplyScalar(lerp(1, 0.45, smooth(9, 3, cd)));
      // gentle per-vertex noise
      const k = 1 + fbm(x * 0.6, z * 0.6, 1) * 0.12;
      col[i * 3] = c.r * k;
      col[i * 3 + 1] = c.g * k;
      col[i * 3 + 2] = c.b * k;
    }
  let k = 0;
  for (let iz = 0; iz < SEG; iz++)
    for (let ix = 0; ix < SEG; ix++) {
      const a = iz * n + ix;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      idx[k++] = a;
      idx[k++] = d;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = d;
      idx[k++] = e;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
function worldUV(g, k = 0.05) {
  const p = g.attributes.position;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) * k;
    uv[i * 2 + 1] = p.getZ(i) * k;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}
function riverGeo() {
  // ribbon along the river polyline, sampled densely so it follows the level
  const pts = [];
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i];
    const [bx, bz] = RIVER[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 3);
    for (let j = 0; j < n; j++) pts.push([ax + ((bx - ax) * j) / n, az + ((bz - az) * j) / n]);
  }
  pts.push(RIVER[RIVER.length - 1]);
  const pos = [];
  const idx = [];
  const w = RIVER_W + 1.6;
  pts.forEach(([x, z], i) => {
    const [px, pz] = pts[Math.max(0, i - 1)];
    const [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
    let dx = nx - px;
    let dz = nz - pz;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    const lvl = Math.max(-0.05, riverLevel(riverInfo(x, z).s));
    pos.push(x - dz * w, lvl, z + dx * w, x + dz * w, lvl, z - dx * w);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return worldUV(g, 0.08);
}

/** Collects painted parts in world space, then merges into one mesh. */
class Kit {
  constructor() {
    this.parts = [];
  }
  add(geo, color, tf = {}, bottom = null) {
    this.parts.push(M.paint(M.T(geo, tf), color, bottom));
    return this;
  }
  addGeo(g) {
    this.parts.push(g);
    return this;
  }
  mesh(mat, { shadow = true } = {}) {
    if (!this.parts.length) return null;
    const m = new THREE.Mesh(M.merge(this.parts), mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    this.parts = [];
    return m;
  }
}
const g = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cyl: (a, b, h, n = 8) => new THREE.CylinderGeometry(a, b, h, n),
  sph: (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h),
  cone: (r, h, n = 6) => new THREE.ConeGeometry(r, h, n),
};
const at = (x, z, dy = 0) => [x, height(x, z) + dy, z];

function buildStation(mats, tex) {
  const S = SITES.station;
  const L = LAYOUT.lab;
  const out = new THREE.Group();
  const K = new Kit();
  const G = new Kit(); // glow
  const gy = (x, z) => height(x, z);
  const concrete = 0xb7b1a2;
  const stain = 0x7d7768;
  const metal = 0x6b777c;
  const rust = 0x8a4e2c;
  const vine = 0x3c6e2a;
  /* lab building */
  const ly = gy(L.x, L.z);
  K.add(g.box(L.hx * 2 + 0.6, 0.3, L.hz * 2 + 0.6), 0x8f897c, { p: [L.x, ly + 0.05, L.z] });
  for (const w of LAYOUT.labWalls) K.add(g.box(w.hx * 2, L.h, w.hz * 2), concrete, { p: [w.x, ly + L.h / 2, w.z] }, stain);
  // window frames (dark glass) on the long walls
  for (const sx of [-3.6, 0, 3.6]) {
    K.add(g.box(1.6, 1.0, 0.08), 0x1d2a2e, { p: [L.x + sx, ly + 2.2, L.z - L.hz - 0.36] });
    K.add(g.box(1.6, 1.0, 0.08), 0x1d2a2e, { p: [L.x + sx, ly + 2.2, L.z + L.hz + 0.36] });
  }
  K.add(g.box(0.2, 2.6, 0.2), 0x5a5a52, { p: [L.x - L.hx - 0.1, ly + 1.3, L.z - L.door - 0.1] });
  K.add(g.box(0.2, 2.6, 0.2), 0x5a5a52, { p: [L.x - L.hx - 0.1, ly + 1.3, L.z + L.door + 0.1] });
  K.add(g.box(0.3, 0.3, L.door * 2 + 0.4), 0x5a5a52, { p: [L.x - L.hx - 0.1, ly + 2.65, L.z] });
  // broken door leaning on the wall
  K.add(g.box(0.1, 2.3, 1.3), 0x6b5a3a, { p: [L.x - L.hx - 0.7, ly + 1.1, L.z + 3.2], r: [0, 0.2, 0.25] });
  // interior: table, shelves, monitors, papers, fallen chair
  const T = LAYOUT.table;
  K.add(g.box(T.hx * 2, 0.08, T.hz * 2), 0x7a6a50, { p: [T.x, ly + 0.92, T.z] });
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    K.add(g.box(0.07, 0.9, 0.07), 0x3a3a36, { p: [T.x + dx * (T.hx - 0.08), ly + 0.45, T.z + dz * (T.hz - 0.08)] });
  K.add(g.box(0.45, 0.32, 0.06), 0x2a2a2a, { p: [T.x + 0.1, ly + 1.15, T.z - 0.9], r: [0, -1.3, 0] });
  K.add(g.box(0.3, 0.02, 0.4), 0xeae6da, { p: [T.x - 0.1, ly + 0.97, T.z - 0.3], r: [0, 0.4, 0] });
  for (let i = 0; i < 3; i++) {
    K.add(g.box(3.2, 0.06, 0.6), 0x6e6a60, { p: [L.x - 1, ly + 0.6 + i * 0.75, L.z - L.hz + 0.7] });
    for (let j = 0; j < 4; j++) K.add(g.box(0.3 + (j % 2) * 0.15, 0.35, 0.4), [0x9a8a6a, 0x5a6a7a, 0x8a3a2a, 0xd8d0b8][(i + j) % 4], { p: [L.x - 2.2 + j * 0.8, ly + 0.82 + i * 0.75, L.z - L.hz + 0.7] });
  }
  K.add(g.box(0.5, 0.06, 0.5), 0x4a4a46, { p: [L.x - 2, ly + 0.3, L.z + 2.2], r: [1.4, 0.5, 0] });
  K.add(g.box(1.1, 1.8, 0.6), 0x5d6b62, { p: [L.x + L.hx - 0.7, ly + 0.9, L.z + L.hz - 0.8] });
  // vines over the walls
  for (let i = 0; i < 9; i++) K.add(g.box(0.5 + (i % 3) * 0.3, 1.6 + (i % 4) * 0.5, 0.12), vine, { p: [L.x - L.hx + 1 + i * 1.3, ly + L.h - 0.9, L.z + L.hz + 0.42] });
  for (let i = 0; i < 5; i++) K.add(g.box(0.12, 1.4 + (i % 3) * 0.6, 0.6), vine, { p: [L.x + L.hx + 0.42, ly + L.h - 0.9, L.z - 3 + i * 1.5] });
  const labMesh = K.mesh(mats.flat);
  out.add(labMesh);
  // roof (hidden while you're inside so the camera can see)
  const R = new Kit();
  R.add(g.box(L.hx * 2 + 0.9, 0.25, L.hz * 2 + 0.9), metal, { p: [L.x, ly + L.h + 0.12, L.z] });
  R.add(g.box(2.5, 0.27, 1.6), rust, { p: [L.x + 2, ly + L.h + 0.14, L.z + 1] });
  for (let i = 0; i < 6; i++) R.add(g.box(0.6, 0.15, L.hz * 2 + 0.95), vine, { p: [L.x - L.hx + 1.2 + i * 2.1, ly + L.h + 0.3, L.z] });
  R.add(g.box(1.4, 0.8, 1.4), 0x8d9396, { p: [L.x - 3, ly + L.h + 0.6, L.z - 2] }); // AC unit
  const roof = R.mesh(mats.flat);
  out.add(roof);

  /* radio shelter */
  const sh = LAYOUT.shelter;
  const sy = gy(sh.x, sh.z);
  for (const [dx, dz] of [
    [-2, -1.6],
    [2, -1.6],
    [-2, 1.6],
    [2, 1.6],
  ])
    K.add(g.box(0.16, 3, 0.16), 0x5a4a36, { p: [sh.x + dx, sy + 1.5 - (dz > 0 ? 0.25 : 0), sh.z + dz] });
  K.add(g.box(4.6, 0.12, 3.9), rust, { p: [sh.x, sy + 2.85, sh.z], r: [0.12, 0, 0] });
  const D = LAYOUT.desk;
  K.add(g.box(D.hx * 2, 0.08, D.hz * 2), 0x6a5a40, { p: [D.x, sy + 0.86, D.z] });
  K.add(g.box(D.hx * 2 - 0.1, 0.8, 0.06), 0x5a4a36, { p: [D.x, sy + 0.45, D.z - D.hz + 0.05] });
  K.add(g.box(1.0, 0.48, 0.45), 0x4f5a3c, { p: [D.x, sy + 1.14, D.z - 0.05] });
  for (let i = 0; i < 4; i++) K.add(g.cyl(0.04, 0.04, 0.05, 8), 0x1a1a1a, { p: [D.x - 0.35 + i * 0.12, sy + 1.05, D.z + 0.19], r: [Math.PI / 2, 0, 0] });
  K.add(g.box(0.12, 0.6, 0.12), 0x333333, { p: [D.x + 0.45, sy + 1.6, D.z - 0.1] });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.18), new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false }));
  screen.position.set(D.x + 0.18, sy + 1.24, D.z + 0.18);
  out.add(screen);
  /* radio tower */
  const tw = LAYOUT.tower;
  const ty = gy(tw.x, tw.z);
  const H = 19;
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const a = new THREE.Vector3(tw.x + dx * 1.3, ty, tw.z + dz * 1.3);
    const b = new THREE.Vector3(tw.x + dx * 0.25, ty + H, tw.z + dz * 0.25);
    const geo = g.cyl(0.07, 0.09, a.distanceTo(b), 5);
    geo.translate(0, a.distanceTo(b) / 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
    geo.translate(a.x, a.y, a.z);
    K.addGeo(M.paint(geo, 0xa8a8a0));
  }
  for (let i = 1; i < 7; i++) {
    const y = ty + i * 2.7;
    const w = 1.3 - (i * 2.7 * 1.05) / H;
    for (const [dx, dz, rx] of [
      [0, -w, 0],
      [0, w, 0],
      [-w, 0, 1],
      [w, 0, 1],
    ])
      K.add(g.box(rx ? 0.06 : w * 2, 0.06, rx ? w * 2 : 0.06), 0x9a9a92, { p: [tw.x + dx, y, tw.z + dz] });
  }
  K.add(g.cyl(0.04, 0.04, 3, 5), 0xa8a8a0, { p: [tw.x, ty + H + 1.4, tw.z] });
  G.add(g.sph(0.22, 8, 6), 0xff2a1a, { p: [tw.x, ty + H + 3, tw.z] });
  const beaconLight = G.mesh(mats.glow, { shadow: false });
  out.add(beaconLight);
  /* helipad */
  const hp = LAYOUT.helipad;
  const hy = gy(hp.x, hp.z);
  K.add(g.cyl(hp.r, hp.r + 0.2, 0.3, 24), 0x4e5052, { p: [hp.x, hy + 0.05, hp.z] });
  K.add(g.cyl(hp.r - 0.4, hp.r - 0.4, 0.31, 24), 0x5c5e60, { p: [hp.x, hy + 0.06, hp.z] });
  K.add(g.box(0.5, 0.32, 3.4), 0xe8c23a, { p: [hp.x - 1.1, hy + 0.08, hp.z] });
  K.add(g.box(0.5, 0.32, 3.4), 0xe8c23a, { p: [hp.x + 1.1, hy + 0.08, hp.z] });
  K.add(g.box(1.8, 0.32, 0.5), 0xe8c23a, { p: [hp.x, hy + 0.08, hp.z] });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    G.add(g.sph(0.12, 6, 4), 0xffd060, { p: [hp.x + Math.cos(a) * (hp.r - 0.15), hy + 0.25, hp.z + Math.sin(a) * (hp.r - 0.15)] });
  }
  const padLights = G.mesh(mats.glow, { shadow: false });
  padLights.visible = false;
  out.add(padLights);
  // windsock
  K.add(g.cyl(0.05, 0.06, 4.2, 6), 0xdddddd, { p: [hp.x + 8, gy(hp.x + 8, hp.z - 4) + 2.1, hp.z - 4] });
  K.add(g.cone(0.3, 1.4, 8), 0xff7a1a, { p: [hp.x + 8.6, gy(hp.x + 8, hp.z - 4) + 4.0, hp.z - 4], r: [0, 0, -Math.PI / 2 + 0.3] });
  /* water barrel, generator, jeep, crates, barrels, lamps */
  const wb = LAYOUT.barrel;
  K.add(g.cyl(0.6, 0.6, 1.2, 12), 0x2f5f8a, { p: [wb.x, gy(wb.x, wb.z) + 0.6, wb.z] });
  K.add(g.cyl(0.62, 0.62, 0.06, 12), 0x24496a, { p: [wb.x, gy(wb.x, wb.z) + 1.22, wb.z] });
  K.add(g.box(1.3, 0.05, 1.3), 0x6a7a80, { p: [wb.x, gy(wb.x, wb.z) + 2.6, wb.z], r: [0.2, 0, 0] });
  K.add(g.box(0.06, 1.4, 0.06), 0x555555, { p: [wb.x + 0.6, gy(wb.x, wb.z) + 1.9, wb.z] });
  const gn = LAYOUT.generator;
  const gny = gy(gn.x, gn.z);
  K.add(g.box(2.4, 1.3, 1.6), 0x5d6b3e, { p: [gn.x, gny + 0.65, gn.z] }, 0x3d4a28);
  K.add(g.cyl(0.12, 0.12, 1.2, 6), 0x333333, { p: [gn.x + 0.8, gny + 1.6, gn.z] });
  K.add(g.box(0.5, 0.4, 0.05), 0xe8c23a, { p: [gn.x, gny + 0.9, gn.z + 0.81] });
  // jeep
  const jx = S.x - 18;
  const jz = S.z + 16;
  const jy = gy(jx, jz);
  K.add(g.box(2.0, 0.9, 4.0), 0x5b6340, { p: [jx, jy + 0.95, jz], r: [0, 0.6, 0.06] }, 0x3e4430);
  K.add(g.box(1.9, 0.5, 1.5), 0x4b5236, { p: [jx + Math.sin(0.6) * 1.0, jy + 1.6, jz + Math.cos(0.6) * 1.0], r: [0, 0.6, 0.06] });
  for (const [dx, dz] of [
    [-1, 1.3],
    [1, 1.3],
    [-1, -1.3],
    [1, -1.3],
  ]) {
    const c = Math.cos(0.6);
    const s = Math.sin(0.6);
    K.add(g.cyl(0.42, 0.42, 0.3, 10), 0x1e1e1e, { p: [jx + dx * c + dz * s, jy + 0.42, jz - dx * s + dz * c], r: [0, 0.6, Math.PI / 2] });
  }
  for (const [dx, dz, c] of [
    [-18, -4, rust],
    [-17, -2.6, 0x2f5f8a],
    [19, -2, rust],
  ]) {
    K.add(g.cyl(0.42, 0.42, 1.1, 10), c, { p: [S.x + dx, gy(S.x + dx, S.z + dz) + 0.55, S.z + dz] });
  }
  K.add(g.cyl(0.42, 0.42, 1.1, 10), rust, { p: [S.x - 16.5, gy(S.x - 16.5, S.z - 5) + 0.4, S.z - 5], r: [Math.PI / 2, 0.4, 0] });
  for (const [dx, dz] of [
    [16, 20],
    [-20, 18],
  ]) {
    const geo = M.crateGeo();
    geo.translate(S.x + dx, gy(S.x + dx, S.z + dz), S.z + dz);
    K.addGeo(geo);
  }
  for (const [dx, dz, tilt] of [
    [-22, -6, 0.3],
    [6, 6, 0],
    [22, -22, 0.6],
  ]) {
    const x = S.x + dx;
    const z = S.z + dz;
    K.add(g.cyl(0.07, 0.09, 5, 6), 0x50504a, { p: [x, gy(x, z) + 2.4, z], r: [0, 0, tilt] });
    K.add(g.box(0.6, 0.15, 0.3), 0x3a3a36, { p: [x - Math.sin(tilt) * 2.5, gy(x, z) + 4.9 * Math.cos(tilt), z] });
  }
  /* fence */
  const C = new Kit();
  const f = LAYOUT.fence;
  for (const s of LAYOUT.fenceSegs) {
    const len = Math.max(s.hx, s.hz) * 2;
    const alongX = s.hx > s.hz;
    const n = Math.max(1, Math.round(len / 3.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n - 0.5;
      const x = alongX ? s.x + t * len : s.x;
      const z = alongX ? s.z : s.z + t * len;
      K.add(g.cyl(0.07, 0.08, 2.9, 6), 0x7d7d76, { p: [x, gy(x, z) + 1.35, z] });
      if (i < n) {
        const x2 = alongX ? x + len / n / 2 : x;
        const z2 = alongX ? z : z + len / n / 2;
        const y0 = (gy(x, z) + gy(alongX ? x + len / n : x, alongX ? z : z + len / n)) / 2;
        const plane = new THREE.PlaneGeometry(len / n, 2.4);
        if (!alongX) plane.rotateY(Math.PI / 2);
        const uv = plane.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (len / n) * 2, uv.getY(k) * 2.4 * 2);
        plane.translate(x2, y0 + 1.35, z2);
        C.parts.push(plane);
        K.add(g.box(alongX ? len / n : 0.05, 0.05, alongX ? 0.05 : len / n), 0x8d8d86, { p: [x2, y0 + 2.6, z2] });
        // vines here and there
        if ((i * 7 + Math.round(s.x)) % 5 === 0) K.add(g.box(alongX ? 1.2 : 0.1, 1.6, alongX ? 0.1 : 1.2), vine, { p: [x2, y0 + 1.6, z2] });
      }
    }
  }
  // fallen fence panels at the broken gaps & open gate leaves
  K.add(g.box(5, 0.08, 2.2), 0x6d6d66, { p: [S.x + 12, gy(S.x + 12, S.z - f - 2) + 0.2, S.z - f - 2], r: [0.1, 0.2, 0] });
  K.add(g.box(2.2, 0.08, 6), 0x6d6d66, { p: [S.x + f + 2, gy(S.x + f + 2, S.z - 16) + 0.2, S.z - 16], r: [0, 0.3, 0.1] });
  K.add(g.box(0.08, 2.3, 4), 0x80807a, { p: [S.x - f - 1.6, gy(S.x - f, S.z - 6) + 1.2, S.z - 6.6], r: [0, 0.9, 0] });
  K.add(g.box(0.08, 2.3, 4), 0x80807a, { p: [S.x - f - 1.6, gy(S.x - f, S.z + 6) + 1.2, S.z + 6.6], r: [0, -0.9, 0] });
  const fenceMesh = C.parts.length ? new THREE.Mesh(M.merge(C.parts.map((p) => { for (const k of Object.keys(p.attributes)) if (k !== "position" && k !== "normal" && k !== "uv") p.deleteAttribute(k); return p; })), new THREE.MeshStandardMaterial({ map: tex.chain, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x9a9a92, roughness: 0.6, metalness: 0.4 })) : null;
  if (fenceMesh) {
    fenceMesh.castShadow = true;
    out.add(fenceMesh);
  }
  // signs
  const signGroup = new THREE.Group();
  const sx = S.x - f - 4;
  const sz = S.z - 7.5;
  const sgy = gy(sx, sz);
  K.add(g.box(0.15, 2.6, 0.15), 0x4a3a26, { p: [sx, sgy + 1.3, sz - 1.6] });
  K.add(g.box(0.15, 2.6, 0.15), 0x4a3a26, { p: [sx, sgy + 1.3, sz + 1.6] });
  if (tex.sign) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.1), new THREE.MeshStandardMaterial({ map: tex.sign, roughness: 0.9 }));
    sign.position.set(sx - 0.1, sgy + 2.1, sz);
    sign.rotation.set(0, -Math.PI / 2, 0.04);
    signGroup.add(sign);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.1), new THREE.MeshStandardMaterial({ color: 0x6a5a40 }));
    back.position.set(sx + 0.02, sgy + 2.1, sz);
    back.rotation.set(0, Math.PI / 2, -0.04);
    signGroup.add(back);
  }
  if (tex.warn) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.0), new THREE.MeshStandardMaterial({ map: tex.warn, roughness: 0.9 }));
    w.position.set(S.x - f - 0.25, gy(S.x - f, S.z + 10) + 1.7, S.z + 10);
    w.rotation.set(0, -Math.PI / 2, 0.1);
    signGroup.add(w);
  }
  out.add(signGroup);
  out.add(K.mesh(mats.flat));
  return { group: out, roof, screen, beaconLight, padLights };
}

function buildCave(mats) {
  const cv = LAYOUT.cave;
  const y0 = height(cv.x, cv.z);
  const out = new THREE.Group();
  // rocky dome with an opening facing +z
  const r = cv.r + 1.2;
  const dome = new THREE.SphereGeometry(r, 26, 12, Math.PI / 2 + cv.open, TAU - cv.open * 2, 0, Math.PI / 2);
  const p = dome.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 1 + fbm(x * 0.35 + 10, z * 0.35 + y * 0.3, 3) * 0.35;
    p.setXYZ(i, x * n, y * 0.78 * n, z * n);
  }
  dome.computeVertexNormals();
  const domeMesh = new THREE.Mesh(M.merge([M.paint(dome, 0x8a8478, 0x5c574e)]), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, side: THREE.DoubleSide }));
  domeMesh.position.set(cv.x, y0 - 0.6, cv.z);
  domeMesh.castShadow = true;
  domeMesh.receiveShadow = true;
  out.add(domeMesh);
  const K = new Kit();
  // boulders framing the mouth and blending into the hill
  for (let i = 0; i < 14; i++) {
    const a = cv.open + 0.15 + (i / 13) * (TAU - cv.open * 2 - 0.3);
    const rr = r + 0.8 + (i % 3) * 0.9;
    const geo = M.rockGeo(30 + i, i % 3 === 0);
    const s = 1.6 + (i % 4) * 0.5;
    geo.scale(s, s * 1.1, s);
    geo.translate(cv.x + Math.sin(a) * rr, y0 + 0.4, cv.z + Math.cos(a) * rr);
    K.addGeo(geo);
  }
  for (const side of [-1, 1]) {
    const a = side * (cv.open + 0.05);
    const geo = M.rockGeo(50 + side, true);
    geo.scale(2.2, 3.4, 2.2);
    geo.translate(cv.x + Math.sin(a) * (r + 0.3), y0 + 1.2, cv.z + Math.cos(a) * (r + 0.3));
    K.addGeo(geo);
  }
  // bones & pedestal inside
  const bp = LAYOUT.parts.battery;
  const pg = M.rockGeo(77);
  pg.scale(0.9, 0.9, 0.9);
  pg.translate(bp.x, height(bp.x, bp.z) + 0.3, bp.z);
  K.addGeo(pg);
  K.add(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 5), 0xe8e0c8, { p: [cv.x - 3, y0 + 0.08, cv.z - 1], r: [Math.PI / 2, 0.6, 0] });
  K.add(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 5), 0xe8e0c8, { p: [cv.x - 2.6, y0 + 0.08, cv.z - 1.6], r: [Math.PI / 2, -0.4, 0] });
  K.add(new THREE.SphereGeometry(0.28, 8, 6), 0xe8e0c8, { p: [cv.x - 3.5, y0 + 0.2, cv.z - 0.5], s: [1, 0.8, 1.3] });
  K.add(new THREE.BoxGeometry(0.4, 0.5, 0.3), 0x6a5040, { p: [cv.x + 3.6, y0 + 0.25, cv.z - 2.5], r: [0, 0.4, 0] }); // old supply box
  out.add(K.mesh(mats.flat));
  // glowing crystals
  const G = new Kit();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + 0.3;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < cv.open + 0.2) continue;
    const rr = cv.r - 1.6 - (i % 3) * 0.5;
    const h = 0.6 + (i % 4) * 0.35;
    G.add(new THREE.ConeGeometry(0.16, h, 5), i % 2 ? 0x5ad8ff : 0x9a7aff, { p: [cv.x + Math.sin(a) * rr, y0 + h / 2 - 0.05, cv.z + Math.cos(a) * rr], r: [Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3] });
  }
  const crystals = G.mesh(mats.glow, { shadow: false });
  out.add(crystals);
  return { group: out };
}

function buildCrash(mats) {
  const c = LAYOUT.crash;
  const y = height(c.x, c.z);
  const grp = new THREE.Group();
  const K = new Kit();
  K.add(new THREE.CylinderGeometry(1.25, 1.35, 9, 12), 0xe6e1d4, { p: [0, 1.0, 0.5], r: [Math.PI / 2 - 0.06, 0, 0.08] });
  K.add(new THREE.CylinderGeometry(1.36, 1.36, 1.0, 12), 0xb0302a, { p: [0, 1.0, 1.8], r: [Math.PI / 2 - 0.06, 0, 0.08] });
  K.add(new THREE.ConeGeometry(1.25, 2.2, 12), 0xe6e1d4, { p: [0, 0.85, 6.1], r: [Math.PI / 2 - 0.06, 0, 0] });
  for (let i = 0; i < 4; i++) K.add(new THREE.BoxGeometry(0.06, 0.45, 0.55), 0x1c2a30, { p: [1.24, 1.5, -1.8 + i * 1.2], r: [0, 0, 0.1] });
  K.add(new THREE.BoxGeometry(1.6, 0.5, 0.06), 0x1c2a30, { p: [0, 1.75, 4.6], r: [-0.5, 0, 0] });
  // broken wing stub + detached wing
  K.add(new THREE.BoxGeometry(4.0, 0.18, 1.7), 0xd8d2c4, { p: [2.8, 0.6, 1.5], r: [0, 0, -0.15] });
  K.add(new THREE.BoxGeometry(7.0, 0.18, 1.8), 0xd8d2c4, { p: [-4.8, 0.25, 0.3], r: [0.05, 0.25, 0.18] });
  K.add(new THREE.BoxGeometry(1.2, 0.2, 1.85), 0xb0302a, { p: [-7.8, 0.4, 0.9], r: [0.05, 0.25, 0.18] });
  // tail section, snapped off
  K.add(new THREE.CylinderGeometry(0.5, 1.15, 4.2, 10), 0xe6e1d4, { p: [1.6, 0.9, -6.6], r: [Math.PI / 2, 0.5, 0.3] });
  K.add(new THREE.BoxGeometry(0.15, 2.0, 1.4), 0xb0302a, { p: [2.4, 2.1, -7.6], r: [0, 0.5, 0.3] });
  // propeller
  K.add(new THREE.BoxGeometry(0.18, 2.6, 0.08), 0x333333, { p: [0, 0.9, 7.25], r: [0, 0, 0.7] });
  // debris & scorch
  for (let i = 0; i < 8; i++) K.add(new THREE.BoxGeometry(0.3 + (i % 3) * 0.3, 0.08, 0.4 + (i % 2) * 0.4), i % 2 ? 0xe6e1d4 : 0x555555, { p: [Math.cos(i * 1.9) * (4 + i), 0.08, Math.sin(i * 1.9) * (4 + i * 0.6)], r: [0, i, 0.1] });
  K.add(new THREE.CylinderGeometry(5.5, 5.5, 0.05, 16), 0x2e2a24, { p: [0, 0.02, 0.5] });
  grp.add(K.mesh(mats.flat));
  grp.position.set(c.x, y - 0.35, c.z);
  grp.rotation.y = c.rot;
  return grp;
}

function buildWreck(mats) {
  const w = LAYOUT.wreck;
  const grp = new THREE.Group();
  const K = new Kit();
  // U-section hull (half cylinder along z) with a pointed, raised bow
  const hullGeo = (r, len, color, bottom) => {
    const h = new THREE.CylinderGeometry(r, r, len, 14, 10, true, Math.PI / 2, Math.PI);
    h.rotateX(-Math.PI / 2); // axis → z, the open side faces up
    const p = h.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i) / len + 0.5; // 0 stern .. 1 bow
      const bow = Math.max(0, z - 0.62) / 0.38;
      const k = 1 - bow * bow * 0.97;
      p.setX(i, p.getX(i) * k);
      p.setY(i, p.getY(i) * (0.75 + 0.25 * k) + bow * bow * 1.3);
    }
    h.computeVertexNormals();
    return M.paint(h, color, bottom);
  };
  K.addGeo(M.T(hullGeo(3, 17, 0x7a5434, 0x3a2616), { p: [0, 2.2, 0] }));
  K.addGeo(M.T(hullGeo(2.85, 16.6, 0x4a3220, 0x2a1c10), { p: [0, 2.25, 0], s: [-1, 1, 1] })); // inner planking (mirrored → faces inward)
  K.add(new THREE.BoxGeometry(6.1, 0.22, 0.25), 0xc9b58a, { p: [0, 2.2, -8.4] }); // stern rail
  for (let i = 0; i < 7; i++) K.add(new THREE.BoxGeometry(5.4 - Math.max(0, i - 4) * 1.6, 0.12, 0.6), 0x9a7a52, { p: [0, 1.2, -6.5 + i * 1.9] }); // thwarts

  K.add(new THREE.BoxGeometry(3, 1.6, 3.4), 0x7a6040, { p: [0, 1.9, -4.6] }, 0x5a4430);
  K.add(new THREE.BoxGeometry(3.2, 0.15, 3.6), 0x5a4026, { p: [0, 2.75, -4.6], r: [0.08, 0, 0] });
  K.add(new THREE.BoxGeometry(2.6, 0.5, 0.06), 0x1c2a30, { p: [0, 2.2, -2.88] });
  K.add(new THREE.CylinderGeometry(0.16, 0.2, 7.5, 7), 0x5a4026, { p: [0.8, 4.4, 1.2], r: [0.15, 0, -0.45] });
  K.add(new THREE.BoxGeometry(0.06, 2.6, 2.4), 0xd8d0b8, { p: [2.2, 5.2, 1.0], r: [0.1, 0.2, -0.5] });
  for (let i = 0; i < 6; i++) K.add(new THREE.BoxGeometry(0.25, 0.08, 1.6 + (i % 3) * 0.6), 0x8a6a46, { p: [-5 + i * 1.3, -0.4, 5 + (i % 2) * 2.2], r: [0, i * 0.7, 0] });
  K.add(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 10), 0x7a4a26, { p: [-4, -0.3, -3], r: [Math.PI / 2, 0.6, 0] });
  K.add(new THREE.TorusGeometry(0.5, 0.12, 6, 14), 0xe8e0d0, { p: [-3.2, -0.55, 1.4], r: [Math.PI / 2, 0, 0] });
  grp.add(K.mesh(mats.flat));
  grp.position.set(w.x, height(w.x, w.z) - 0.9, w.z);
  grp.rotation.set(0, w.rot, 0.28);
  return grp;
}

function buildHeli(mats) {
  const grp = new THREE.Group();
  const K = new Kit();
  K.add(new THREE.SphereGeometry(1.6, 14, 10), 0xf0f0ea, { p: [0, 1.9, 0.6], s: [1, 0.9, 1.5] }, 0xd8d8d0);
  K.add(new THREE.BoxGeometry(2.4, 0.5, 2.6), 0xe0581a, { p: [0, 1.25, 0.2] });
  K.add(new THREE.CylinderGeometry(0.25, 0.5, 5.4, 8), 0xe0581a, { p: [0, 2.2, -3.6], r: [Math.PI / 2 + 0.06, 0, 0] });
  K.add(new THREE.BoxGeometry(0.12, 1.5, 0.9), 0xe0581a, { p: [0, 2.9, -6.1] });
  K.add(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 6), 0x333333, { p: [0, 3.4, 0.4] });
  for (const s of [-1, 1]) {
    K.add(new THREE.BoxGeometry(0.12, 0.12, 3.6), 0x333333, { p: [s * 1.1, 0.06, 0.4] });
    K.add(new THREE.BoxGeometry(0.08, 0.9, 0.08), 0x333333, { p: [s * 1.0, 0.5, 1.2], r: [0, 0, s * 0.2] });
    K.add(new THREE.BoxGeometry(0.08, 0.9, 0.08), 0x333333, { p: [s * 1.0, 0.5, -0.4], r: [0, 0, s * 0.2] });
  }
  K.add(new THREE.SphereGeometry(1.3, 12, 8, 0, TAU, 0, 1.3), 0x2a4a5e, { p: [0, 2.0, 1.4], s: [1, 0.85, 1.2], r: [1.1, 0, 0] });
  grp.add(K.mesh(mats.flat));
  const rotor = new THREE.Mesh(M.merge([M.paint(new THREE.BoxGeometry(11, 0.06, 0.4), 0x2a2a2a), M.paint(new THREE.BoxGeometry(0.4, 0.06, 11), 0x2a2a2a)]), mats.flat);
  rotor.position.set(0, 3.82, 0.4);
  grp.add(rotor);
  const tail = new THREE.Mesh(M.merge([M.paint(new THREE.BoxGeometry(0.05, 1.8, 0.2), 0x2a2a2a)]), mats.flat);
  tail.position.set(0.18, 2.9, -6.3);
  grp.add(tail);
  grp.traverse((o) => o.isMesh && (o.castShadow = true));
  return { group: grp, rotor, tail };
}

/* ================================================================== the world */
export function createWorld(canvas, opts = {}) {
  let quality = opts.quality || "high";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.preserve });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = quality === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === "high" ? 1.75 : 1));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 1400);
  scene.fog = new THREE.Fog(0xa9c8d8, 40, 360);
  const disposables = [];
  const own = (x) => (disposables.push(x), x);
  const U = { uTime: { value: 0 } };
  const mats = M.makeMaterials();
  Object.values(mats).forEach(own);
  const foliage = own(addSway(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }), U, 0.05));
  const grassMat = own(addSway(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide }), U, 0.18));

  /* lights */
  const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x4a5a32, 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 320 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const amb = new THREE.AmbientLight(0xffffff, 0.12);
  scene.add(amb);
  const fireLight = new THREE.PointLight(0xff9a40, 0, 22, 1.6);
  scene.add(fireLight);
  const caveLight = new THREE.PointLight(0x6ac8ff, 6, 16, 1.5);
  caveLight.position.set(LAYOUT.cave.x, height(LAYOUT.cave.x, LAYOUT.cave.z) + 3, LAYOUT.cave.z - 1);
  scene.add(caveLight);
  const lantern = new THREE.PointLight(0xffc27a, 0, 15, 1.4);
  scene.add(lantern);

  /* sky */
  const skyU = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    ground: { value: new THREE.Color(0x2a3a3a) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunCol: { value: new THREE.Color(1, 0.9, 0.7) },
    moonDir: { value: new THREE.Vector3(0, -1, 0) },
    stars: { value: 0 },
    time: { value: 0 },
  };
  const sky = new THREE.Mesh(own(new THREE.SphereGeometry(1000, 32, 16)), own(new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false })));
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);

  /* terrain & water */
  const terrain = new THREE.Mesh(own(buildTerrain()), own(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })));
  terrain.receiveShadow = true;
  scene.add(terrain);
  const wn = own(waterNormalTex());
  const seaMat = own(new THREE.MeshStandardMaterial({ color: 0x1b6f86, roughness: 0.12, metalness: 0.1, normalMap: wn, normalScale: new THREE.Vector2(0.4, 0.4), transparent: true, opacity: 0.8 }));
  const sea = new THREE.Mesh(own(worldUV(new THREE.PlaneGeometry(2600, 2600).rotateX(-Math.PI / 2), 0.03)), seaMat);
  scene.add(sea);
  const freshMat = own(new THREE.MeshStandardMaterial({ color: 0x2a8a8c, roughness: 0.08, metalness: 0.05, normalMap: wn, normalScale: new THREE.Vector2(0.25, 0.25), transparent: true, opacity: 0.78 }));
  const lake = new THREE.Mesh(own(worldUV(new THREE.CircleGeometry(LAKE.r + 4, 48).rotateX(-Math.PI / 2).translate(LAKE.x, LAKE.level, LAKE.z), 0.08)), freshMat);
  lake.receiveShadow = true;
  scene.add(lake);
  const river = new THREE.Mesh(own(riverGeo()), freshMat);
  river.receiveShadow = true;
  scene.add(river);

  /* landmarks */
  const tex = { chain: own(chainTex()), sign: signTex([["KESTREL RESEARCH STATION", 40], ["ISLA SOMBRA · RESTRICTED", 26]]), warn: signTex([["DANGER", 54], ["LARGE PREDATORS", 26]], 256, 180, "#f1c232", "#1a1a1a") };
  if (tex.sign) own(tex.sign);
  if (tex.warn) own(tex.warn);
  const station = buildStation(mats, tex);
  scene.add(station.group);
  const cave = buildCave(mats);
  scene.add(cave.group);
  scene.add(buildCrash(mats));
  scene.add(buildWreck(mats));
  const heli = buildHeli(mats);
  heli.group.visible = false;
  scene.add(heli.group);
  // objective beacon
  const beaconMat = own(new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const beacon = new THREE.Mesh(own(new THREE.CylinderGeometry(0.5, 0.9, 90, 10, 1, true).translate(0, 45, 0)), beaconMat);
  beacon.frustumCulled = false;
  scene.add(beacon);

  /* shared geometries */
  const geos = {
    palm: [own(M.palmGeo(1)), own(M.palmGeo(2))],
    jungle: [own(M.jungleTreeGeo(1)), own(M.jungleTreeGeo(4))],
    big: own(M.jungleTreeGeo(3, true)),
    stump: own(M.stumpGeo()),
    bush: own(M.bushGeo(2)),
    berries: own(M.berriesGeo()),
    rocks: [own(M.rockGeo(1)), own(M.rockGeo(2, true)), own(M.rockGeo(3))],
    stick: own(M.stickGeo()),
    stones: own(M.stonesGeo()),
    fern: own(M.fernGeo(1)),
    grass: own(M.grassGeo()),
    flower: own(M.flowerGeo()),
    cloud: own(M.cloudGeo(1)),
    bird: own(M.birdGeo()),
    campfire: own(M.campfireGeo()),
    flame: own(M.flameGeo()),
    crate: own(M.crateGeo()),
    lid: own(M.crateLidGeo()),
    parts: { battery: own(M.partGeo("battery")), antenna: own(M.partGeo("antenna")), circuit: own(M.partGeo("circuit")) },
  };
  const flameMat = own(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const ringMat = own(new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const ringGeo = own(new THREE.RingGeometry(0.55, 0.75, 24).rotateX(-Math.PI / 2));

  /* decorative ground cover (visual only, seeded) */
  const deco = { fern: [], grass: [], flower: [] };
  {
    const R = rng(4242);
    for (let i = 0; i < 16000; i++) {
      const a = R() * TAU;
      const r = Math.sqrt(R()) * 225;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const inl = inland(x, z);
      const h = height(x, z);
      if (inl < 0.06 || h < 1.1 || h > 42 || freshWaterAt(x, z) !== null || slope(x, z) > 0.8) continue;
      if (Math.abs(x - SITES.station.x) < 30 && Math.abs(z - SITES.station.z) < 30) continue;
      if (Math.hypot(x - LAYOUT.cave.x, z - LAYOUT.cave.z) < 12) continue;
      const roll = R();
      const dens = fbm(x * 0.02, z * 0.02, 2);
      if (roll < 0.28 && inl > 0.12 && deco.fern.length < 2000) deco.fern.push({ x, z, y: h - 0.05, s: 0.7 + R() * 0.8, rot: R() * TAU });
      else if (roll < 0.86 && deco.grass.length < 3200 && dens > -0.25) deco.grass.push({ x, z, y: h - 0.05, s: 0.7 + R() * 0.7, rot: R() * TAU });
      else if (deco.flower.length < 700 && inl < 0.4) deco.flower.push({ x, z, y: h, s: 0.8 + R() * 0.6, rot: R() * TAU });
    }
  }

  /* per-sim state */
  let sim = null;
  let scatters = [];
  let treeScatter = null;
  let pickupScatter = null;
  let bushScatter = null;
  let berryScatter = null;
  const STUMP_MAX = 96;
  const _up = new THREE.Vector3(0, 1, 0);
  let stumpsDirty = true;
  let rockScatter = [];
  let dyn = new THREE.Group();
  scene.add(dyn);
  const dinoViews = new Map();
  const fireViews = new Map();
  const crateViews = [];
  const partViews = new Map();
  const falling = [];
  let player = null;
  let shake = 0;
  let lastVersion = -1;
  let hiddenTrees = new Set();
  const camState = { tx: 0, ty: 0, tz: 0, dist: 6, init: false };

  const stumps = new THREE.InstancedMesh(geos.stump, mats.flat, STUMP_MAX);
  stumps.count = 0;
  stumps.castShadow = true;
  stumps.receiveShadow = true;
  scene.add(stumps);

  const deco0 = [
    new Scatter(scene, geos.fern, grassMat, deco.fern, { shadow: false, maxDist: 140 }),
    new Scatter(scene, geos.grass, grassMat, deco.grass, { shadow: false, maxDist: 95 }),
    new Scatter(scene, geos.flower, grassMat, deco.flower, { shadow: false, maxDist: 100 }),
  ];

  /* clouds & birds */
  const clouds = new THREE.InstancedMesh(geos.cloud, own(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, transparent: true, opacity: 0.92, fog: false })), 18);
  const cloudData = [];
  {
    const R = rng(77);
    for (let i = 0; i < 18; i++) cloudData.push({ x: (R() - 0.5) * 900, z: (R() - 0.5) * 900, y: 150 + R() * 60, s: 0.8 + R() * 1.2, rot: R() * TAU });
  }
  scene.add(clouds);
  const birds = new THREE.InstancedMesh(geos.bird, mats.flat, 21);
  scene.add(birds);
  const birdData = [];
  for (let f = 0; f < 3; f++) for (let i = 0; i < 7; i++) birdData.push({ f, i, cx: [-60, 90, 10][f], cz: [80, -10, -120][f], r: [70, 55, 90][f], y: [42, 50, 70][f], sp: [0.12, -0.15, 0.09][f] });

  /* particles: one pool for bursts, one for ambience (motes / fireflies), one for embers */
  const dotTex = own(softDot());
  const mkPoints = (n, size, blending = THREE.NormalBlending) => {
    const geo = own(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const mat = own(new THREE.PointsMaterial({ size, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending, sizeAttenuation: true }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    return pts;
  };
  const burst = { pts: mkPoints(400, 0.22), parts: [] };
  const motes = { pts: mkPoints(160, 0.28, THREE.AdditiveBlending), data: [] };
  for (let i = 0; i < 160; i++) motes.data.push({ ox: (Math.random() - 0.5) * 70, oz: (Math.random() - 0.5) * 70, oy: Math.random() * 6 + 0.4, ph: Math.random() * TAU, sp: 0.4 + Math.random() * 0.8 });
  const embers = { pts: mkPoints(60, 0.16, THREE.AdditiveBlending), data: [] };
  for (let i = 0; i < 60; i++) embers.data.push({ t: Math.random() * 2, x: 0, z: 0, y: 0, vx: 0, vz: 0 });

  function spawnBurst(x, y, z, color, n = 12, speed = 3, life = 0.8, grav = 9) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (burst.parts.length >= 400) burst.parts.shift();
      const a = Math.random() * TAU;
      const u = Math.random();
      burst.parts.push({ x, y, z, vx: Math.cos(a) * speed * (0.4 + u), vy: speed * (0.5 + Math.random()), vz: Math.sin(a) * speed * (0.4 + u), life, t: 0, c, grav });
    }
  }

  /* ---------------------------------------------------------- bind a sim */
  function clearSimViews() {
    for (const s of scatters) s.dispose(scene);
    scatters = [];
    rockScatter = [];
    for (const v of dinoViews.values()) disposeRig(v);
    dinoViews.clear();
    for (const v of fireViews.values()) dyn.remove(v.group);
    fireViews.clear();
    crateViews.length = 0;
    partViews.clear();
    for (const f of falling) dyn.remove(f.mesh);
    falling.length = 0;
    scene.remove(dyn);
    dyn = new THREE.Group();
    scene.add(dyn);
    if (player) {
      disposeRig(player);
      player = null;
    }
  }
  function disposeRig(v) {
    const root = v.root || v.rig?.root;
    if (!root) return;
    root.parent && root.parent.remove(root);
    root.traverse((o) => o.isMesh && o.geometry && o.geometry.dispose());
  }
  function setSim(s) {
    clearSimViews();
    sim = s;
    lastVersion = -1;
    hiddenTrees = new Set();
    camState.init = false;
    // trees: one scatter per kind/variant, mapping tree id → scatter slot
    const groups = { palm0: [], palm1: [], jungle0: [], jungle1: [], big: [] };
    for (const t of s.trees) {
      const key = t.kind === "big" ? "big" : `${t.kind}${t.id % 2}`;
      groups[key].push(t);
    }
    treeScatter = new Map();
    for (const [key, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const geo = key === "big" ? geos.big : key.startsWith("palm") ? geos.palm[+key.slice(-1)] : geos.jungle[+key.slice(-1)];
      const items = list.map((t) => ({ x: t.x, y: t.y - 0.15, z: t.z, s: t.s, rot: t.rot, lean: t.lean, hidden: !t.alive }));
      const sc = new Scatter(scene, geo, foliage, items);
      scatters.push(sc);
      list.forEach((t, i) => treeScatter.set(t.id, [sc, i]));
    }
    stumps.count = 0;
    for (let v = 0; v < 3; v++) {
      const list = s.boulders.filter((b) => b.id % 3 === v);
      const sc = new Scatter(scene, geos.rocks[v], mats.flat, list.map((b) => ({ x: b.x, y: b.y - b.s * 0.2, z: b.z, s: b.s, rot: b.rot })));
      scatters.push(sc);
      rockScatter.push(sc);
    }
    bushScatter = new Scatter(scene, geos.bush, foliage, s.bushes.map((b) => ({ x: b.x, y: b.y - 0.1, z: b.z, s: b.s, rot: b.rot })), { maxDist: 220 });
    berryScatter = new Scatter(scene, geos.berries, mats.flat, s.bushes.map((b) => ({ x: b.x, y: b.y - 0.1, z: b.z, s: b.s * 1.04, rot: b.rot, hidden: !b.ripe })), { shadow: false, maxDist: 160 });
    scatters.push(bushScatter, berryScatter);
    const sticks = s.pickups.filter((p) => p.kind === "stick");
    const stones = s.pickups.filter((p) => p.kind === "stone");
    const stickSc = new Scatter(scene, geos.stick, mats.flat, sticks.map((p) => ({ x: p.x, y: p.y, z: p.z, s: 1, rot: p.rot, hidden: p.taken })), { shadow: false, maxDist: 120 });
    const stoneSc = new Scatter(scene, geos.stones, mats.flat, stones.map((p) => ({ x: p.x, y: p.y, z: p.z, s: 1, rot: p.rot, hidden: p.taken })), { shadow: false, maxDist: 120 });
    scatters.push(stickSc, stoneSc);
    pickupScatter = new Map();
    sticks.forEach((p, i) => pickupScatter.set(p.id, [stickSc, i]));
    stones.forEach((p, i) => pickupScatter.set(p.id, [stoneSc, i]));
    // crates
    for (const c of s.crates) {
      const grp = new THREE.Group();
      const body = new THREE.Mesh(geos.crate, mats.flat);
      body.castShadow = true;
      const lid = new THREE.Mesh(geos.lid, mats.flat);
      lid.position.set(0, 0.72, 0.42);
      lid.castShadow = true;
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.scale.setScalar(1.6);
      ring.position.y = 0.05;
      grp.add(body, lid, ring);
      grp.position.set(c.x, c.y - 0.05, c.z);
      grp.rotation.y = c.rot;
      dyn.add(grp);
      crateViews.push({ c, grp, lid, ring, open: c.opened ? 1 : 0 });
    }
    // radio parts
    for (const part of s.parts) {
      const grp = new THREE.Group();
      const mesh = new THREE.Mesh(geos.parts[part.id], mats.flat);
      mesh.castShadow = true;
      const ring = new THREE.Mesh(ringGeo, ringMat);
      grp.add(mesh, ring);
      grp.position.set(part.x, part.y, part.z);
      grp.visible = !part.taken;
      dyn.add(grp);
      partViews.set(part.id, { part, grp, mesh, ring });
    }
    // the survivor
    const rig = M.buildSurvivor(mats);
    player = { rig, root: rig.root };
    const lanternMesh = new THREE.Mesh(own(new THREE.BoxGeometry(0.1, 0.14, 0.1)), new THREE.MeshBasicMaterial({ color: 0xffc070, toneMapped: false }));
    own(lanternMesh.material);
    lanternMesh.position.set(-0.22, 0.02, -0.05);
    rig.bones.hips.add(lanternMesh);
    player.lanternMesh = lanternMesh;
    dyn.add(rig.root);
    station.screen.material.color.set(s.flags.radio ? 0x3aff6a : 0xff3a2a);
    heli.group.visible = false;
    syncChanges(true);
  }

  function syncChanges(all = false) {
    if (!sim) return;
    if (!all && sim.version === lastVersion) return;
    lastVersion = sim.version;
    const list = all ? null : sim.changed.splice(0);
    if (all) sim.changed.length = 0;
    const touch = (kind, id) => {
      if (kind === "tree") {
        const t = sim.trees[id];
        const [sc, i] = treeScatter.get(id);
        sc.set(i, t.alive && !hiddenTrees.has(id) ? 1 : 0);
        stumpsDirty = true;
      } else if (kind === "bush") berryScatter.set(id, sim.bushes[id].ripe ? 1 : 0);
      else if (kind === "pickup") {
        const [sc, i] = pickupScatter.get(id);
        sc.set(i, sim.pickups[id].taken ? 0 : 1);
      } else if (kind === "part") {
        const v = partViews.get(id);
        if (v) v.grp.visible = !v.part.taken;
      }
    };
    if (all) {
      sim.trees.forEach((t) => touch("tree", t.id));
      sim.bushes.forEach((b) => touch("bush", b.id));
      sim.pickups.forEach((p) => touch("pickup", p.id));
      sim.parts.forEach((p) => touch("part", p.id));
    } else for (const c of list) touch(c.kind, c.id);
    if (stumpsDirty) {
      // felled trees leave stumps: a small pool refilled when the set changes
      stumpsDirty = false;
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      let n = 0;
      for (const t of sim.trees) {
        if (t.alive || n >= STUMP_MAX) continue;
        const k = t.kind === "big" ? 1.7 : t.kind === "palm" ? 0.7 : 1;
        q.setFromAxisAngle(_up, t.rot);
        stumps.setMatrixAt(n++, m4.compose(new THREE.Vector3(t.x, t.y - 0.1, t.z), q, new THREE.Vector3(k, k, k)));
      }
      stumps.count = n;
      stumps.instanceMatrix.needsUpdate = true;
      stumps.computeBoundingSphere();
    }
    // campfires: add / remove views
    const ids = new Set(sim.campfires.map((f) => f.id));
    for (const [id, v] of fireViews)
      if (!ids.has(id)) {
        dyn.remove(v.group);
        fireViews.delete(id);
      }
    for (const f of sim.campfires) {
      if (fireViews.has(f.id)) continue;
      const grp = new THREE.Group();
      const logs = new THREE.Mesh(geos.campfire, mats.flat);
      logs.castShadow = true;
      logs.receiveShadow = true;
      const flame = new THREE.Mesh(geos.flame, flameMat);
      flame.position.y = 0.1;
      grp.add(logs, flame);
      grp.position.set(f.x, f.y, f.z);
      dyn.add(grp);
      fireViews.set(f.id, { f, group: grp, flame });
      spawnBurst(f.x, f.y + 0.5, f.z, 0xffa040, 18, 2.2, 0.9, 2);
    }
  }

  function dinoView(d) {
    let v = dinoViews.get(d.id);
    if (!v) {
      const rig = d.kind === "herb" ? M.buildStego(mats) : M.buildTheropod(d.kind, mats);
      v = { rig, root: rig.root };
      dyn.add(rig.root);
      dinoViews.set(d.id, v);
    }
    return v;
  }

  /* ---------------------------------------------------------- events */
  function onEvent(e) {
    if (!sim) return;
    const p = sim.player;
    switch (e.type) {
      case "chop":
        spawnBurst(e.x, e.y + 1.2, e.z, 0xc8a070, 10, 3, 0.7);
        spawnBurst(e.x, e.y + 4, e.z, 0x4a8a34, e.tool === "axe" ? 8 : 4, 1.5, 1.4, 2);
        break;
      case "mine":
        spawnBurst(e.x, e.y + 0.6, e.z, e.ok ? 0xb8b2a8 : 0x8a857c, e.ok ? 14 : 6, 3, 0.7);
        break;
      case "dinoHit":
        spawnBurst(e.x, e.y + (e.kind === "trex" ? 3 : 1.1), e.z, 0x9a1a1a, 12, 3.5, 0.6);
        break;
      case "treeFall": {
        const t = sim.trees[e.id];
        const geo = t.kind === "big" ? geos.big : t.kind === "palm" ? geos.palm[t.id % 2] : geos.jungle[t.id % 2];
        const mesh = new THREE.Mesh(geo, foliage);
        mesh.castShadow = true;
        mesh.position.set(t.x, t.y - 0.15, t.z);
        mesh.scale.setScalar(t.s);
        const a = Math.atan2(t.x - p.x, t.z - p.z);
        dyn.add(mesh);
        falling.push({ mesh, t: 0, a, rot: t.rot });
        break;
      }
      case "hurt":
        if (e.dmg > 0) shake = Math.max(shake, e.kind === "trex" ? 0.9 : 0.4);
        break;
      case "dinoCall":
        if (e.call === "roar" && Math.hypot(e.x - p.x, e.z - p.z) < 60) shake = Math.max(shake, 0.5);
        break;
      case "drink":
        spawnBurst(p.x + Math.sin(p.yaw) * 1.2, p.y + 0.1, p.z + Math.cos(p.yaw) * 1.2, 0x9ad8ff, 10, 2, 0.6);
        break;
      case "pickup":
        spawnBurst(p.x, p.y + 0.6, p.z, 0xffe08a, 6, 1.5, 0.5, 2);
        break;
      default:
    }
  }

  /* ---------------------------------------------------------- day / night */
  const C = (h) => new THREE.Color(h);
  const PAL = {
    dayTop: C(0x3f86d8),
    dayHor: C(0xb8dcf0),
    duskTop: C(0x3a4a7a),
    duskHor: C(0xf09a5a),
    nightTop: C(0x050a18),
    nightHor: C(0x142236),
    fogDay: C(0xa9c8d8),
    fogDusk: C(0xc89070),
    fogNight: C(0x0e1a26),
    sunDay: C(0xfff3dc),
    sunLow: C(0xff9a50),
    moon: C(0x8aa8e0),
  };
  const _c1 = new THREE.Color();
  const _c2 = new THREE.Color();
  function applyTime(clock, menu) {
    const a = (clock - 0.25) * TAU;
    // a = 0 at 06:00 (sun rising in the east, +x), π/2 at noon
    const sunDir = new THREE.Vector3(Math.cos(a) * 0.82, Math.sin(a), 0.38).normalize();
    const day = daylight(clock);
    const low = 1 - smooth(0.0, 0.45, Math.abs(sunDir.y)); // 1 near the horizon
    const dusk = low * smooth(-0.25, 0.05, sunDir.y);
    skyU.sunDir.value.copy(sunDir);
    skyU.moonDir.value.copy(sunDir).multiplyScalar(-1);
    skyU.stars.value = 1 - smooth(-0.25, 0.05, sunDir.y);
    _c1.copy(PAL.nightTop).lerp(PAL.dayTop, day).lerp(PAL.duskTop, dusk * 0.6);
    _c2.copy(PAL.nightHor).lerp(PAL.dayHor, day).lerp(PAL.duskHor, dusk * 0.8);
    skyU.top.value.copy(_c1);
    skyU.horizon.value.copy(_c2);
    skyU.sunCol.value.copy(PAL.sunDay).lerp(PAL.sunLow, low).multiplyScalar(smooth(-0.1, 0.05, sunDir.y));
    scene.fog.color.copy(PAL.fogNight).lerp(PAL.fogDay, day).lerp(PAL.fogDusk, dusk * 0.55);
    const night = 1 - day;
    scene.fog.near = menu ? 80 : lerp(40, 18, night);
    scene.fog.far = menu ? 620 : lerp(360, 190, night);
    // sun by day, moon by night (same light, swapped while it's dark)
    if (sunDir.y > -0.05) {
      sun.color.copy(PAL.sunDay).lerp(PAL.sunLow, low);
      sun.intensity = 2.7 * smooth(-0.05, 0.25, sunDir.y);
      sun.userData.dir = sunDir.clone();
    } else {
      sun.color.copy(PAL.moon);
      sun.intensity = 0.55 * smooth(-0.05, -0.3, sunDir.y);
      sun.userData.dir = sunDir.clone().multiplyScalar(-1);
    }
    hemi.intensity = 0.25 + 0.65 * day;
    hemi.color.copy(PAL.nightTop).lerp(C(0xcfe6ff), 0.35 + day * 0.65);
    hemi.groundColor.set(0x3a4a2a).multiplyScalar(0.4 + day * 0.6);
    amb.intensity = 0.1 + night * 0.12;
    amb.color.set(night > 0.5 ? 0x6a80b8 : 0xffffff);
    renderer.toneMappingExposure = lerp(1.15, 1.05, day);
    return { day, night };
  }

  /* ---------------------------------------------------------- camera */
  const _fwd = new THREE.Vector3();
  function updateCamera(dt, view) {
    const p = sim.player;
    const cs = view.cam;
    const crouchK = player ? player.rig.crouchK : 0;
    const tx = p.x;
    const ty = p.y + 1.62 - crouchK * 0.5;
    const tz = p.z;
    const k = camState.init ? 1 - Math.exp(-dt * 14) : 1;
    camState.tx += (tx - camState.tx) * k;
    camState.ty += (ty - camState.ty) * (camState.init ? 1 - Math.exp(-dt * 10) : 1);
    camState.tz += (tz - camState.tz) * k;
    _fwd.set(Math.sin(cs.yaw) * Math.cos(cs.pitch), -Math.sin(cs.pitch), Math.cos(cs.yaw) * Math.cos(cs.pitch));
    // over-the-shoulder offset (to the right of the survivor)
    const rx = -Math.cos(cs.yaw) * 0.55;
    const rz = Math.sin(cs.yaw) * 0.55;
    const ox = camState.tx + rx;
    const oz = camState.tz + rz;
    let dist = cs.dist;
    const inside = inCave(p.x, p.z);
    if (inside) dist = Math.min(dist, 3.4);
    if (inLab(p.x, p.z)) dist = Math.min(dist, 4);
    // walls, fences, the cave, big trees & boulders between target and camera
    const ex = ox - _fwd.x * dist;
    const ez = oz - _fwd.z * dist;
    for (const col of sim.collidersNear(ox, oz, dist + 3)) {
      const big = col.wall || (col.tree && col.tree.kind === "big") || (col.boulder && col.r > 1.2);
      if (!big) continue;
      if (col.cave && inside) continue;
      const t = segmentHit(ox, oz, ex, ez, col, 0.25);
      if (t < 1) {
        const hy = camState.ty - _fwd.y * dist * t;
        const top = col.h != null ? height(col.x, col.z) + col.h : col.boulder ? height(col.x, col.z) + col.r * 1.3 : 99;
        if (hy < top) dist = Math.max(0.8, Math.min(dist, dist * t - 0.2));
      }
    }
    // terrain
    for (let i = 1; i <= 10; i++) {
      const d = (dist * i) / 10;
      const x = ox - _fwd.x * d;
      const z = oz - _fwd.z * d;
      const y = camState.ty - _fwd.y * d;
      if (height(x, z) + 0.45 > y) {
        dist = Math.max(0.8, d - 0.35);
        break;
      }
    }
    if (dist < camState.dist || !camState.init) camState.dist = dist;
    else camState.dist += (dist - camState.dist) * (1 - Math.exp(-dt * 4));
    const d = camState.dist;
    let cx = ox - _fwd.x * d;
    let cy = camState.ty - _fwd.y * d;
    let cz = oz - _fwd.z * d;
    cy = Math.max(cy, height(cx, cz) + 0.4);
    if (inside) cy = Math.min(cy, height(LAYOUT.cave.x, LAYOUT.cave.z) + 4.6);
    if (shake > 0) {
      const s = shake * shake * 0.35;
      cx += (Math.random() - 0.5) * s;
      cy += (Math.random() - 0.5) * s;
      cz += (Math.random() - 0.5) * s;
      shake = Math.max(0, shake - dt * 1.8);
    }
    camera.position.set(cx, cy, cz);
    camera.lookAt(cx + _fwd.x, cy + _fwd.y, cz + _fwd.z);
    camState.init = true;
  }

  /* ---------------------------------------------------------- per-frame */
  let time = 0;
  let menuT = 0;
  function frame(dt, view) {
    if (!sim) return;
    time += dt;
    U.uTime.value = time;
    skyU.time.value = time;
    syncChanges();
    const menu = view.mode === "menu";
    const clock = menu ? 0.7 : sim.clock;
    const { night } = applyTime(clock, menu);
    const p = sim.player;

    // camera first (culling uses it)
    if (menu) {
      menuT += dt;
      const a = menuT * 0.035 + 0.6;
      const cx = Math.cos(a) * 175;
      const cz = Math.sin(a) * 175 + 20;
      camera.position.set(cx, 62, cz);
      camera.lookAt(0, 12, 10);
    } else updateCamera(dt, view);
    const cam = camera.position;
    sky.position.copy(cam);

    // shadows follow the survivor (or the menu focus)
    const fx = menu ? 0 : p.x;
    const fz = menu ? 0 : p.z;
    const fy = menu ? 10 : p.y;
    const sd = sun.userData.dir || new THREE.Vector3(0, 1, 0);
    sun.position.set(fx + sd.x * 150, fy + sd.y * 150, fz + sd.z * 150);
    sun.target.position.set(fx, fy, fz);
    sun.castShadow = quality === "high" && !menu;

    // culling of chunked scatters
    for (const s of scatters) s.cull(cam.x, cam.z);
    for (const s of deco0) s.cull(cam.x, cam.z);

    // water motion
    wn.offset.set(time * 0.012, time * 0.008);
    sea.position.y = Math.sin(time * 0.4) * 0.06 - 0.02;

    // survivor
    if (player) {
      const rig = player.rig;
      rig.root.position.set(p.x, p.y, p.z);
      rig.root.rotation.y = p.yaw;
      rig.root.visible = !menu;
      M.animateSurvivor(rig, {
        dt,
        speed: p.speed,
        sprint: p.sprinting,
        crouch: p.crouch,
        onGround: p.onGround,
        vy: p.vy,
        swing: p.swing > 0 ? 1 - p.swing / p.swingDur : 0,
        tool: sim.equipped,
        dead: p.dead,
        deadT: p.deadT || 0,
      });
      if (p.inWater) rig.root.position.y -= 0.25;
      lantern.intensity = !menu && night > 0.35 ? 9 * night : 0;
      lantern.position.set(p.x - Math.sin(p.yaw) * 0.3, p.y + 1.5, p.z - Math.cos(p.yaw) * 0.3);
      player.lanternMesh.visible = night > 0.35;
    }

    // dinosaurs
    const seen = new Set();
    for (const d of sim.dinos) {
      seen.add(d.id);
      const v = dinoView(d);
      const far = Math.hypot(d.x - cam.x, d.z - cam.z) > (menu ? 260 : 175);
      v.root.visible = !d.gone && !far;
      if (!v.root.visible) continue;
      v.root.position.set(d.x, d.y, d.z);
      v.root.rotation.y = d.yaw;
      M.animateDino(v.rig, d, dt, time);
    }
    for (const [id, v] of dinoViews)
      if (!seen.has(id)) {
        disposeRig(v);
        dinoViews.delete(id);
      }

    // trees between the camera and the survivor (or wrapped around the camera) step aside
    if (!menu) {
      const now = new Set();
      const ax = cam.x;
      const az = cam.z;
      const bx = p.x;
      const bz = p.z;
      const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1;
      for (const col of sim.collidersNear((ax + bx) / 2, (az + bz) / 2, Math.sqrt(L2) / 2 + 6)) {
        const t = col.tree;
        if (!t || !t.alive) continue;
        const u = clamp(((t.x - ax) * (bx - ax) + (t.z - az) * (bz - az)) / L2, 0, 1);
        const d = Math.hypot(t.x - (ax + (bx - ax) * u), t.z - (az + (bz - az) * u));
        const canopy = (t.kind === "big" ? 4.6 : t.kind === "palm" ? 1.6 : 2.4) * t.s;
        const trunkBlocks = d < col.r + 0.75 && u < 0.97;
        const inCanopy = Math.hypot(t.x - ax, t.z - az) < canopy && cam.y > t.y + (t.kind === "big" ? 7 : 3.5) * t.s;
        if (trunkBlocks || inCanopy) now.add(t.id);
      }
      for (const id of hiddenTrees)
        if (!now.has(id)) {
          const [sc, i] = treeScatter.get(id);
          if (sim.trees[id].alive) sc.set(i, 1);
        }
      for (const id of now)
        if (!hiddenTrees.has(id)) {
          const [sc, i] = treeScatter.get(id);
          sc.set(i, 0);
        }
      hiddenTrees = now;
    }

    // trees being chopped wobble; felled trees topple
    for (const t of sim.trees)
      if (t.shake > 0 && t.alive && !hiddenTrees.has(t.id)) {
        const [sc, i] = treeScatter.get(t.id);
        sc.set(i, 1, Math.sin(t.shake * 40) * t.shake * 0.12, Math.atan2(t.x - p.x, t.z - p.z));
      }
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.t += dt;
      const k = Math.min(1, (f.t / 1.4) ** 2);
      f.mesh.rotation.set(Math.cos(f.a) * k * 1.5, f.rot, -Math.sin(f.a) * k * 1.5, "YXZ");
      f.mesh.rotation.order = "YXZ";
      if (f.t > 1.4 && !f.dust) {
        f.dust = true;
        spawnBurst(f.mesh.position.x + Math.sin(f.a) * 4, f.mesh.position.y + 0.5, f.mesh.position.z + Math.cos(f.a) * 4, 0xb8a888, 20, 3, 1, 3);
      }
      if (f.t > 2.6) f.mesh.scale.multiplyScalar(0.9);
      if (f.t > 3.4) {
        dyn.remove(f.mesh);
        falling.splice(i, 1);
      }
    }

    // crates (lids swing open), parts bob
    for (const v of crateViews) {
      v.open += ((v.c.opened ? 1 : 0) - v.open) * Math.min(1, dt * 5);
      v.lid.rotation.x = -v.open * 1.9;
      v.ring.visible = !v.c.opened && !menu;
      v.ring.material.opacity = 0.35 + Math.sin(time * 3) * 0.15;
    }
    for (const v of partViews.values()) {
      if (!v.grp.visible) continue;
      v.mesh.position.y = Math.sin(time * 2) * 0.06;
      v.mesh.rotation.y = time * 0.8;
      v.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.12);
    }

    // campfires
    let nearFire = null;
    let nd = 1e9;
    for (const v of fireViews.values()) {
      const fl = 0.85 + Math.sin(time * 17 + v.f.id) * 0.08 + Math.sin(time * 29) * 0.06;
      v.flame.scale.set(1, fl * 1.1, 1);
      v.flame.rotation.y = time * 0.6;
      const dd = Math.hypot(v.f.x - p.x, v.f.z - p.z);
      if (dd < nd) {
        nd = dd;
        nearFire = v.f;
      }
    }
    if (nearFire && nd < 80) {
      fireLight.position.set(nearFire.x, nearFire.y + 1.2, nearFire.z);
      fireLight.intensity = (14 + Math.sin(time * 13) * 2.5 + Math.sin(time * 31) * 1.5) * (0.5 + night * 0.9);
    } else fireLight.intensity = 0;

    // embers rise from the nearest fire
    {
      const pos = embers.pts.geometry.attributes.position;
      const col = embers.pts.geometry.attributes.color;
      embers.data.forEach((e, i) => {
        e.t += dt;
        if (e.t > 1.8 && nearFire) {
          e.t = Math.random() * 0.3;
          e.x = nearFire.x + (Math.random() - 0.5) * 0.5;
          e.z = nearFire.z + (Math.random() - 0.5) * 0.5;
          e.y = nearFire.y + 0.3;
          e.vx = (Math.random() - 0.5) * 0.4;
          e.vz = (Math.random() - 0.5) * 0.4;
        }
        const live = nearFire && e.t < 1.8;
        pos.setXYZ(i, e.x + e.vx * e.t + Math.sin(e.t * 5 + i) * 0.1, live ? e.y + e.t * 1.5 : -100, e.z + e.vz * e.t);
        const f = live ? Math.max(0, 1 - e.t / 1.8) : 0;
        col.setXYZ(i, f, f * 0.55, f * 0.15);
      });
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    // ambient motes (pollen by day, fireflies by night)
    {
      const pos = motes.pts.geometry.attributes.position;
      const col = motes.pts.geometry.attributes.color;
      const cx = menu ? 0 : p.x;
      const cz = menu ? 0 : p.z;
      motes.data.forEach((m, i) => {
        // wrap around the player
        let x = m.ox + Math.sin(time * 0.3 * m.sp + m.ph) * 2;
        let z = m.oz + Math.cos(time * 0.25 * m.sp + m.ph) * 2;
        x = cx + (((x - cx + 35) % 70) + 70) % 70 - 35;
        z = cz + (((z - cz + 35) % 70) + 70) % 70 - 35;
        const y = height(x, z) + m.oy + Math.sin(time * m.sp + m.ph) * 0.4;
        const water = y < 0.5 || freshWaterAt(x, z) !== null;
        pos.setXYZ(i, x, water ? -100 : y, z);
        const blink = night > 0.4 ? Math.max(0, Math.sin(time * 2.2 * m.sp + m.ph * 3)) * night : 0.22 * (1 - night);
        if (night > 0.4) col.setXYZ(i, 0.75 * blink, 1.0 * blink, 0.35 * blink);
        else col.setXYZ(i, blink, blink, blink * 0.85);
      });
      pos.needsUpdate = true;
      col.needsUpdate = true;
      motes.pts.material.size = night > 0.4 ? 0.32 : 0.12;
    }

    // burst particles
    {
      const pos = burst.pts.geometry.attributes.position;
      const col = burst.pts.geometry.attributes.color;
      for (let i = burst.parts.length - 1; i >= 0; i--) {
        const q = burst.parts[i];
        q.t += dt;
        if (q.t > q.life) {
          burst.parts.splice(i, 1);
          continue;
        }
        q.vy -= q.grav * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.z += q.vz * dt;
      }
      for (let i = 0; i < 400; i++) {
        const q = burst.parts[i];
        if (q) {
          pos.setXYZ(i, q.x, q.y, q.z);
          const f = 1 - q.t / q.life;
          col.setXYZ(i, q.c.r * f + 0.05, q.c.g * f + 0.05, q.c.b * f + 0.05);
        } else pos.setXYZ(i, 0, -200, 0);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    // clouds & birds
    {
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      cloudData.forEach((c, i) => {
        c.x += dt * 2.2;
        if (c.x > 450) c.x -= 900;
        q.setFromEuler(new THREE.Euler(0, c.rot, 0));
        m4.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(c.s, c.s, c.s));
        clouds.setMatrixAt(i, m4);
      });
      clouds.instanceMatrix.needsUpdate = true;
      clouds.material.opacity = 0.35 + 0.6 * (1 - night);
      birdData.forEach((b, i) => {
        const a = time * b.sp + b.i * 0.18;
        const x = b.cx + Math.cos(a) * (b.r + (b.i % 3) * 3);
        const z = b.cz + Math.sin(a) * (b.r + (b.i % 3) * 3);
        q.setFromEuler(new THREE.Euler(0, -a - (b.sp > 0 ? 0 : Math.PI), Math.sin(time * 9 + b.i) * 0.5));
        const flap = 0.6 + Math.abs(Math.sin(time * 7 + b.i * 1.3)) * 0.6;
        m4.compose(new THREE.Vector3(x, b.y + Math.sin(time + b.i) * 2 + (b.i % 2) * 1.5, z), q, new THREE.Vector3(1.4, flap * 1.4, 1.4));
        birds.setMatrixAt(i, m4);
      });
      birds.instanceMatrix.needsUpdate = true;
      birds.visible = night < 0.6;
    }

    // station: roof hides while you're inside; radio screen & tower light
    station.roof.visible = menu || !(inLab(p.x, p.z) || inLab(cam.x, cam.z));
    station.screen.material.color.set(sim.flags.radio ? 0x3aff6a : Math.sin(time * 4) > 0 ? 0xff3a2a : 0x551010);
    station.beaconLight.visible = Math.sin(time * 3) > 0;
    station.padLights.visible = !!sim.flags.radio && Math.sin(time * 5) > -0.3;
    caveLight.intensity = 5 + Math.sin(time * 1.3) * 1;

    // helicopter
    {
      const H = sim.heli;
      const hp = LAYOUT.helipad;
      const hy = height(hp.x, hp.z) + 0.2;
      heli.group.visible = H.state !== "away" && (H.state !== "inbound" || sim.rescueT < 22);
      if (heli.group.visible) {
        let x = hp.x;
        let y = hy;
        let z = hp.z;
        let yaw = -0.6;
        if (H.state === "inbound") {
          const k = clamp(1 - sim.rescueT / 22, 0, 1); // 0 far → 1 landed
          const e = 1 - (1 - k) ** 2;
          x = lerp(hp.x + 240, hp.x, e);
          z = lerp(hp.z + 200, hp.z, e);
          y = lerp(hy + 70, hy, smooth(0.55, 1, k)) + (1 - k) * 10;
          yaw = Math.atan2(hp.x - (hp.x + 240), hp.z - (hp.z + 200));
        } else if (H.state === "leaving" || sim.won) {
          const k = Math.min(1, H.t / 9);
          y = hy + k * k * 60;
          x = hp.x - k * k * 120;
          z = hp.z - k * k * 160;
        }
        heli.group.position.set(x, y, z);
        heli.group.rotation.y = yaw;
        heli.rotor.rotation.y += dt * (H.state === "landed" ? 16 : 26);
        heli.tail.rotation.x += dt * 30;
      }
      // you ride along at the end
      if ((H.state === "leaving" || sim.won) && player) player.rig.root.visible = false;
    }

    // objective beacon
    const target = !menu && sim.currentTarget();
    if (target) {
      const dd = Math.hypot(target.x - p.x, target.z - p.z);
      beacon.visible = dd > 6;
      beacon.position.set(target.x, height(target.x, target.z), target.z);
      beaconMat.opacity = (0.16 + Math.sin(time * 2.5) * 0.05) * smooth(6, 25, dd);
      beacon.scale.set(1 + dd / 120, 1, 1 + dd / 120);
    } else beacon.visible = false;

    renderer.render(scene, camera);
  }

  /* ---------------------------------------------------------- misc */
  function resize(w, h) {
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function setQuality(q) {
    quality = q;
    renderer.shadowMap.enabled = q === "high";
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === "high" ? 1.75 : 1));
    for (const s of deco0) for (const m of s.meshes) m.material.needsUpdate = true;
    scene.traverse((o) => o.material && (o.material.needsUpdate = true));
  }
  /** Project a world point to normalised screen coords (for HUD markers). */
  function project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(camera);
    return { x: v.x, y: v.y, behind: v.z > 1 };
  }
  function dispose() {
    clearSimViews();
    for (const s of deco0) s.dispose(scene);
    scene.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isInstancedMesh) {
        o.geometry?.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          if (!m) continue;
          m.map?.dispose();
          m.dispose();
        }
      }
    });
    for (const d of disposables) d.dispose?.();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  return { renderer, scene, camera, setSim, frame, onEvent, resize, setQuality, project, dispose, get sim() { return sim; } };
}
