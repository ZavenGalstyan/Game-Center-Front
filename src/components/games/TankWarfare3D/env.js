/**
 * Tank Warfare 3D — battlefield environment builder (Three.js).
 *
 * buildEnv(map, ctx) turns a map.js layout into renderables:
 *   terrain   — height-mapped mesh with a painted splat texture (roads,
 *               dunes, grass, asphalt, markings) + tiled detail noise
 *   sky       — gradient dome with sun glow; per-world fog and light rig
 *   statics   — every non-destructible obstacle merged per material
 *   instanced — rocks, trees, bushes and all destructible props (intact and
 *               broken variants as separate InstancedMeshes; setAlive(i)
 *               swaps them in place)
 *   water / bridges (forest), smoke stacks (city), minimap background canvas
 * Everything created here is listed in env.disposables.
 */
import * as THREE from "three";
import { Parts, boxGeo, cylGeo, design } from "./models.js";
import { fbm, vnoise, toWorld, rng } from "./map.js";

export const PALETTE = {
  desert: { skyTop: 0x4f86c9, skyHor: 0xead8b4, fog: 0xdcc6a0, fogNear: 110, fogFar: 560, sun: 0xfff0d2, sunI: 2.7, sunDir: [0.55, 0.62, 0.42], hemiSky: 0xd4e2ff, hemiGround: 0xa3865c, hemiI: 1.05, exposure: 1.02 },
  forest: { skyTop: 0x5f83a6, skyHor: 0xc8d2cd, fog: 0xa7b5ae, fogNear: 55, fogFar: 340, sun: 0xfff2dc, sunI: 2.1, sunDir: [-0.45, 0.58, 0.5], hemiSky: 0xcfe0e6, hemiGround: 0x4a5a38, hemiI: 1.15, exposure: 1.0 },
  city: { skyTop: 0x5d6976, skyHor: 0xd2b796, fog: 0xa69a8a, fogNear: 70, fogFar: 400, sun: 0xffd2a0, sunI: 2.3, sunDir: [0.62, 0.38, -0.5], hemiSky: 0xb9c3cf, hemiGround: 0x5a544b, hemiI: 1.0, exposure: 1.0 },
};

/* ------------------------------------------------------------------ textures */
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const hex = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

/** Shared environment textures (built once). */
export function makeEnvTextures() {
  const R = rng(99);
  const detail = canvas(256, 256);
  {
    const g = detail.getContext("2d");
    const img = g.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const n = fbm(x / 16, y / 16, 5, 4) * 0.7 + vnoise(x / 3, y / 3, 8) * 0.3;
      const v = 150 + (n - 0.5) * 150;
      const i = (y * 256 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const facade = canvas(512, 512);
  {
    // 8×8 windows over 32 m × 32 m (u,v in metres / 32)
    const g = facade.getContext("2d");
    g.fillStyle = "#b9b1a4";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 900; i++) {
      const v = 150 + R() * 70;
      g.fillStyle = `rgba(${v},${v - 6},${v - 12},0.25)`;
      g.fillRect(R() * 512, R() * 512, 2 + R() * 10, 2 + R() * 10);
    }
    for (let fy = 0; fy < 8; fy++) {
      g.fillStyle = "rgba(90,84,76,0.55)";
      g.fillRect(0, fy * 64 + 58, 512, 6);
      for (let fx = 0; fx < 8; fx++) {
        const x = fx * 64 + 14;
        const y = fy * 64 + 14;
        const r = R();
        g.fillStyle = "#4d4a45";
        g.fillRect(x - 3, y - 3, 42, 40);
        if (r < 0.12) {
          // blown-out window
          g.fillStyle = "#171513";
          g.fillRect(x, y, 36, 34);
          g.fillStyle = "rgba(20,18,16,0.6)";
          g.fillRect(x - 6, y - 14, 48, 16);
        } else {
          const lit = r > 0.9;
          const grd = g.createLinearGradient(x, y, x + 36, y + 34);
          grd.addColorStop(0, lit ? "#d8b878" : "#4d5d68");
          grd.addColorStop(1, lit ? "#9c7a44" : "#26303a");
          g.fillStyle = grd;
          g.fillRect(x, y, 36, 34);
          g.fillStyle = "#3c3935";
          g.fillRect(x + 17, y, 2, 34);
          g.fillRect(x, y + 16, 36, 2);
          if (r < 0.3) {
            g.strokeStyle = "rgba(220,230,235,0.5)";
            g.beginPath();
            g.moveTo(x + 4, y + 3);
            g.lineTo(x + 14, y + 20);
            g.lineTo(x + 8, y + 31);
            g.stroke();
          }
        }
      }
    }
    // soot streaks
    for (let i = 0; i < 18; i++) {
      const x = R() * 512;
      const gr = g.createLinearGradient(0, 0, 0, 512);
      gr.addColorStop(0, "rgba(25,22,20,0.4)");
      gr.addColorStop(1, "rgba(25,22,20,0)");
      g.fillStyle = gr;
      g.fillRect(x, 0, 10 + R() * 30, 200 + R() * 300);
    }
  }
  const hesco = canvas(128, 128);
  {
    const g = hesco.getContext("2d");
    g.fillStyle = "#b8a37a";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 300; i++) {
      const v = 150 + R() * 60;
      g.fillStyle = `rgba(${v},${v - 18},${v - 50},0.4)`;
      g.fillRect(R() * 128, R() * 128, 3, 3);
    }
    g.strokeStyle = "rgba(70,64,52,0.75)";
    g.lineWidth = 2;
    for (let k = 0; k <= 128; k += 16) {
      g.beginPath();
      g.moveTo(k, 0);
      g.lineTo(k, 128);
      g.moveTo(0, k);
      g.lineTo(128, k);
      g.stroke();
    }
    g.fillStyle = "rgba(60,55,45,0.8)";
    g.fillRect(0, 0, 4, 128);
  }
  const wood = canvas(128, 128);
  {
    const g = wood.getContext("2d");
    g.fillStyle = "#8a6a45";
    g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 16) {
      g.fillStyle = `rgba(${90 + R() * 40},${62 + R() * 20},${38},0.6)`;
      g.fillRect(0, y, 128, 15);
      g.fillStyle = "rgba(40,28,18,0.7)";
      g.fillRect(0, y + 15, 128, 1);
      for (let i = 0; i < 6; i++) {
        g.strokeStyle = "rgba(60,40,25,0.25)";
        g.beginPath();
        const yy = y + R() * 14;
        g.moveTo(0, yy);
        g.bezierCurveTo(40, yy + R() * 4, 80, yy - R() * 4, 128, yy);
        g.stroke();
      }
    }
  }
  const crate = canvas(128, 128);
  {
    const g = crate.getContext("2d");
    g.drawImage(wood, 0, 0);
    g.strokeStyle = "#5b4128";
    g.lineWidth = 14;
    g.strokeRect(7, 7, 114, 114);
    g.beginPath();
    g.moveTo(10, 10);
    g.lineTo(118, 118);
    g.stroke();
    g.fillStyle = "rgba(30,30,30,0.6)";
    g.font = "bold 16px sans-serif";
    g.fillText("AMMO", 40, 70);
  }
  const concrete = canvas(128, 128);
  {
    const g = concrete.getContext("2d");
    g.fillStyle = "#a5a19a";
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 600; i++) {
      const v = 120 + R() * 90;
      g.fillStyle = `rgba(${v},${v},${v - 4},0.25)`;
      g.fillRect(R() * 128, R() * 128, 1 + R() * 3, 1 + R() * 3);
    }
    g.strokeStyle = "rgba(60,58,55,0.35)";
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      const x = R() * 128;
      g.moveTo(x, 0);
      g.lineTo(x + (R() - 0.5) * 30, 128);
      g.stroke();
    }
  }
  const logs = canvas(128, 64);
  {
    const g = logs.getContext("2d");
    for (let x = 0; x < 128; x += 16) {
      const gr = g.createLinearGradient(x, 0, x + 16, 0);
      gr.addColorStop(0, "#3f2d1c");
      gr.addColorStop(0.5, "#7a5a3a");
      gr.addColorStop(1, "#3f2d1c");
      g.fillStyle = gr;
      g.fillRect(x, 0, 16, 64);
    }
  }
  const corrugated = canvas(64, 64);
  {
    const g = corrugated.getContext("2d");
    for (let x = 0; x < 64; x += 8) {
      const gr = g.createLinearGradient(x, 0, x + 8, 0);
      gr.addColorStop(0, "#9a9a9a");
      gr.addColorStop(0.5, "#e8e8e8");
      gr.addColorStop(1, "#9a9a9a");
      g.fillStyle = gr;
      g.fillRect(x, 0, 8, 64);
    }
  }
  const waterN = canvas(128, 128);
  {
    const g = waterN.getContext("2d");
    const img = g.createImageData(128, 128);
    const h = (x, y) => Math.sin(x * 0.29 + Math.sin(y * 0.11) * 2) * 0.5 + Math.sin(y * 0.23 + x * 0.07) * 0.5 + Math.sin((x + y) * 0.61) * 0.25;
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const dx = h(x + 1, y) - h(x - 1, y);
      const dy = h(x, y + 1) - h(x, y - 1);
      const i = (y * 128 + x) * 4;
      img.data[i] = 128 + dx * 60;
      img.data[i + 1] = 128 + dy * 60;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const T = {
    detail: tex(detail, true, false),
    facade: tex(facade),
    hesco: tex(hesco),
    wood: tex(wood),
    crate: tex(crate),
    concrete: tex(concrete),
    logs: tex(logs),
    corrugated: tex(corrugated),
    waterN: tex(waterN, true, false),
  };
  T.facade.repeat.set(1 / 32, 1 / 32);
  T.hesco.repeat.set(1 / 1.4, 1 / 1.4);
  T.wood.repeat.set(1 / 2, 1 / 2);
  T.concrete.repeat.set(1 / 4, 1 / 4);
  T.logs.repeat.set(1 / 2.4, 1 / 2);
  T.corrugated.repeat.set(1 / 1.2, 1);
  return T;
}

export function makeEnvMaterials(T, vt) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  return {
    hesco: std({ map: T.hesco, roughness: 0.95 }),
    concrete: std({ map: T.concrete, roughness: 0.92, color: 0xd6d2ca }),
    concreteDark: std({ map: T.concrete, roughness: 0.95, color: 0x8b877f }),
    wood: std({ map: T.wood, roughness: 0.9 }),
    logs: std({ map: T.logs, roughness: 0.95 }),
    canvas: std({ map: vt.grime, color: 0x8a7f5c, roughness: 0.95 }),
    canvasGreen: std({ map: vt.grime, color: 0x5d6545, roughness: 0.95 }),
    metal: std({ map: vt.metal, color: 0x6c6f70, roughness: 0.55, metalness: 0.6 }),
    rust: std({ map: vt.grime, color: 0x7a4a2c, roughness: 0.85, metalness: 0.3 }),
    burnt: std({ map: vt.grime, color: 0x2a2523, roughness: 0.95, metalness: 0.2 }),
    brick: std({ map: T.concrete, color: 0x8c4a34, roughness: 0.9 }),
    containerRed: std({ map: T.corrugated, color: 0x9c3a26, roughness: 0.6, metalness: 0.4 }),
    containerBlue: std({ map: T.corrugated, color: 0x2f5a80, roughness: 0.6, metalness: 0.4 }),
    facade: std({ map: T.facade, roughness: 0.88, vertexColors: true }),
    roof: std({ map: T.concrete, roughness: 0.95, vertexColors: true }),
    rock: std({ roughness: 0.92, flatShading: true }),
    bark: std({ color: 0x4a3626, roughness: 0.95 }),
    leaves: std({ roughness: 0.85, flatShading: true }),
    crate: std({ map: T.crate, roughness: 0.85 }),
    barrel: std({ map: vt.grime, roughness: 0.5, metalness: 0.4 }),
    sandbag: std({ map: vt.grime, color: 0xb9a57a, roughness: 1 }),
    tin: std({ map: T.corrugated, color: 0x7d7a72, roughness: 0.6, metalness: 0.5 }),
    stone: std({ map: T.concrete, color: 0xb7b0a2, roughness: 0.9 }),
  };
}

/* ------------------------------------------------------------------ helpers */
/** Box faces split into wall (facade) and top (roof) arrays with vertex colours. */
class FaceBuilder {
  constructor() {
    this.walls = { p: [], n: [], u: [], c: [] };
    this.tops = { p: [], n: [], u: [], c: [] };
  }
  quad(dst, a, b, c, d, n, uvs, col) {
    for (const v of [a, b, c, a, c, d]) dst.p.push(...v);
    for (let i = 0; i < 6; i++) dst.n.push(...n);
    const [u0, v0, u1, v1] = uvs;
    dst.u.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    for (let i = 0; i < 6; i++) dst.c.push(...col);
  }
  /** Box: centre (x,z), base y0, height h, half sizes, rotation a. vBase = facade v origin. */
  box(x, z, y0, h, hx, hz, a, col, { top = true, vBase = 0, uOff = 0 } = {}) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const y1 = y0 + h;
    const corners = [W(-hx, -hz), W(hx, -hz), W(hx, hz), W(-hx, hz)];
    const v0 = y0 - vBase;
    const v1 = y1 - vBase;
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      const L = Math.hypot(bx - ax, bz - az);
      const nx = (bz - az) / L;
      const nz = -(bx - ax) / L;
      // outward normal for this corner order is (dz, −dx)/L
      this.quad(this.walls, [bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz], [nx, 0, nz], [uOff, v0, uOff + L, v1], col);
    }
    if (top) {
      const [p0, p1, p2, p3] = corners;
      this.quad(this.tops, [p0[0], y1, p0[1]], [p3[0], y1, p3[1]], [p2[0], y1, p2[1]], [p1[0], y1, p1[1]], [0, 1, 0], [0, 0, hx * 2, hz * 2], col);
    }
  }
  geo(dst) {
    if (!dst.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(dst.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(dst.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(dst.u, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(dst.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = 0.72 + vnoise(x * 2.1 + seed, z * 2.1 + y * 1.7, seed) * 0.5;
    p.setXYZ(i, x * n, Math.max(-0.35, y) * n * 0.9, z * n);
  }
  g.computeVertexNormals();
  return g;
}

function pineCanopy() {
  const P = new Parts();
  P.add("c", new THREE.ConeGeometry(2.4, 4.2, 8), 0, 4.2, 0);
  P.add("c", new THREE.ConeGeometry(1.9, 3.6, 8), 0, 6.4, 0, 0, 0.4, 0);
  P.add("c", new THREE.ConeGeometry(1.3, 3.0, 8), 0, 8.4, 0, 0, 0.8, 0);
  return P.build().c;
}
function broadCanopy() {
  const P = new Parts();
  P.add("c", new THREE.IcosahedronGeometry(2.6, 0), 0, 5.6, 0);
  P.add("c", new THREE.IcosahedronGeometry(2.0, 0), 1.2, 6.8, 0.4, 0.3, 0.5, 0);
  P.add("c", new THREE.IcosahedronGeometry(1.8, 0), -1.1, 6.4, -0.6, 0.6, 0.2, 0);
  return P.build().c;
}
function towerGeo(broken) {
  const P = new Parts();
  if (!broken) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box("wood", sx * 1.25, 3.2, sz * 1.25, 0.22, 6.4, 0.22, sz * 0.05, 0, -sx * 0.05);
    for (const y of [1.5, 3.5]) {
      P.box("wood", 0, y, 1.25, 2.6, 0.12, 0.12, 0, 0, 0.6);
      P.box("wood", 0, y, -1.25, 2.6, 0.12, 0.12, 0, 0, -0.6);
    }
    P.box("wood", 0, 6.4, 0, 3.4, 0.2, 3.4);
    for (const [x, z, w, d] of [[0, 1.65, 3.4, 0.1], [0, -1.65, 3.4, 0.1], [1.65, 0, 0.1, 3.4], [-1.65, 0, 0.1, 3.4]]) P.box("wood", x, 7.0, z, w, 1.0, d);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box("wood", sx * 1.6, 7.7, sz * 1.6, 0.12, 1.6, 0.12);
    P.box("tin", 0, 8.55, 0, 3.9, 0.12, 3.9, 0.1, 0, 0);
    P.box("sandbag", 0, 6.75, 1.4, 2.8, 0.5, 0.45);
  } else {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.box("wood", sx * 1.25, 0.8, sz * 1.25, 0.22, 1.6, 0.22, 0.2 * sx, 0, 0.2 * sz);
    P.box("wood", 0.6, 0.6, 0.8, 3.4, 0.2, 3.4, 0.35, 0.4, 0.2);
    P.box("tin", -1.2, 0.4, -1.4, 3.9, 0.12, 3.9, -0.2, 1.1, 0.15);
    P.box("wood", 2.2, 0.3, -0.6, 0.2, 0.2, 5.5, 0, 0.7, 1.4);
  }
  return P.build();
}
function fenceGeo() {
  // unit length along z, posts at both ends
  const P = new Parts();
  for (const z of [-0.5, 0.5]) P.box("w", 0, 0.75, z, 0.12, 1.5, 0.12);
  P.box("w", 0, 0.45, 0, 0.06, 0.12, 1, 0, 0, 0);
  P.box("w", 0, 1.15, 0, 0.06, 0.12, 1, 0, 0, 0);
  for (let i = 0; i < 4; i++) P.box("w", 0.04, 0.8, -0.36 + i * 0.24, 0.03, 1.2, 0.12);
  return P.build().w;
}
function sandbagGeo(broken) {
  // unit: 1 m long along z, ~1.2 high
  const P = new Parts();
  const rows = broken ? 1 : 3;
  for (let r = 0; r < rows; r++) for (let i = 0; i < 2; i++) {
    const z = -0.25 + i * 0.5 + (r % 2 ? 0.12 : 0);
    const g = new THREE.SphereGeometry(0.5, 8, 5);
    P.add("s", g, broken ? (i - 0.5) * 0.7 : 0, 0.22 + r * 0.38, broken ? z * 1.6 : z, 0, broken ? i : 0, 0, 0.62, 0.38, 0.55);
  }
  return P.build().s;
}

/* ------------------------------------------------------------------ terrain */
function paintSplat(map, worldId, size) {
  const c = canvas(size, size);
  const g = c.getContext("2d");
  const img = g.createImageData(size, size);
  const half = map.terHalf;
  const N = map.terN;
  const H = map.H;
  const res = map.terRes;
  const gridH = (x, z) => {
    const gx = Math.max(0, Math.min(N - 1, Math.round((x + half) / res)));
    const gz = Math.max(0, Math.min(N - 1, Math.round((z + half) / res)));
    return H[gz * N + gx];
  };
  const pal = {
    desert: [[0xd8bb88, 0xc9a26a], 0xa4825a, 0xe2c99a],
    forest: [[0x5f7a39, 0x4b6630], 0x6d6248, 0x8d7d5a],
    city: [[0x6f6b63, 0x5f5b54], 0x55524c, 0x7a776f],
  }[worldId];
  const [a, b] = pal[0].map(hex);
  const rock = hex(pal[1]);
  const light = hex(pal[2]);
  for (let py = 0; py < size; py++) {
    const z = half - (py / size) * half * 2; // canvas top = +z (north)
    for (let px = 0; px < size; px++) {
      const x = -half + (px / size) * half * 2;
      const h = gridH(x, z);
      const sl = Math.abs(gridH(x + 2, z) - gridH(x - 2, z)) + Math.abs(gridH(x, z + 2) - gridH(x, z - 2));
      const n = fbm(x * 0.03, z * 0.03, 3, 3);
      const n2 = vnoise(x * 0.35, z * 0.35, 4);
      let t = Math.min(1, Math.max(0, n * 1.4 - 0.2));
      let r = a[0] + (b[0] - a[0]) * t;
      let gg = a[1] + (b[1] - a[1]) * t;
      let bb = a[2] + (b[2] - a[2]) * t;
      if (worldId === "desert") {
        // dune ripples + darker rocky slopes, sun-bleached crests
        const rip = Math.sin(x * 0.9 + Math.sin(z * 0.11) * 3 + z * 0.25) * 0.5 + 0.5;
        const k = rip * 0.06;
        r *= 1 - k;
        gg *= 1 - k;
        bb *= 1 - k;
        const rk = Math.min(1, Math.max(0, (sl - 1.1) * 0.9));
        r += (rock[0] - r) * rk;
        gg += (rock[1] - gg) * rk;
        bb += (rock[2] - bb) * rk;
        if (h > 5) {
          const lk = Math.min(0.4, (h - 5) * 0.05);
          r += (light[0] - r) * lk;
          gg += (light[1] - gg) * lk;
          bb += (light[2] - bb) * lk;
        }
      } else if (worldId === "forest") {
        const rz = map.riverZ ? Math.abs(z - map.riverZ(x)) : 99;
        if (rz < 26) {
          const k = Math.max(0, Math.min(1, (26 - rz) / 9));
          r += (light[0] - r) * k;
          gg += (light[1] - gg) * k;
          bb += (light[2] - bb) * k;
        }
        if (h < -0.6) {
          r = 60;
          gg = 70;
          bb = 58;
        }
        const rk = Math.min(1, Math.max(0, (sl - 1.4) * 0.8));
        r += (rock[0] - r) * rk;
        gg += (rock[1] - gg) * rk;
        bb += (rock[2] - bb) * rk;
        if (n2 > 0.72) {
          r *= 1.12;
          gg *= 1.08;
        }
      } else {
        // city lots: patchy concrete / dirt
        if (n2 > 0.6) {
          r *= 0.9;
          gg *= 0.88;
          bb *= 0.85;
        }
      }
      const v = 0.9 + n2 * 0.2;
      const i = (py * size + px) * 4;
      img.data[i] = Math.min(255, r * v);
      img.data[i + 1] = Math.min(255, gg * v);
      img.data[i + 2] = Math.min(255, bb * v);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const W = (x) => ((x + half) / (half * 2)) * size;
  const Z = (z) => ((half - z) / (half * 2)) * size;
  const ppm = size / (half * 2);
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const road of map.roads) {
    const stroke = (w, col, dash = null) => {
      g.strokeStyle = col;
      g.lineWidth = w * ppm;
      g.setLineDash(dash ? dash.map((d) => d * ppm) : []);
      g.beginPath();
      road.pts.forEach(([x, z], k) => (k ? g.lineTo(W(x), Z(z)) : g.moveTo(W(x), Z(z))));
      g.stroke();
    };
    if (road.kind === "asphalt") {
      stroke(road.w + 4, "#8d8a83");
      stroke(road.w, "#3c3e41");
      stroke(road.w * 0.6, "rgba(70,72,76,0.5)");
      stroke(0.35, "rgba(230,226,210,0.8)", [3, 4]);
      for (const off of [-1, 1]) {
        g.save();
        const [x0, z0] = road.pts[0];
        const [x1, z1] = road.pts[1];
        const L = Math.hypot(x1 - x0, z1 - z0);
        const nx = (-(z1 - z0) / L) * off * (road.w / 2 - 1.2);
        const nz = ((x1 - x0) / L) * off * (road.w / 2 - 1.2);
        g.strokeStyle = "rgba(220,214,190,0.55)";
        g.lineWidth = 0.25 * ppm;
        g.setLineDash([]);
        g.beginPath();
        g.moveTo(W(x0 + nx), Z(z0 + nz));
        g.lineTo(W(x1 + nx), Z(z1 + nz));
        g.stroke();
        g.restore();
      }
    } else {
      const col = worldId === "desert" ? ["rgba(150,120,82,0.55)", "rgba(168,138,94,0.9)", "rgba(120,96,66,0.5)"] : ["rgba(90,74,52,0.6)", "rgba(116,96,68,0.95)", "rgba(80,64,44,0.6)"];
      stroke(road.w + 3, col[0]);
      stroke(road.w, col[1]);
      // wheel ruts
      for (const off of [-1.4, 1.4]) {
        g.save();
        g.strokeStyle = col[2];
        g.lineWidth = 0.7 * ppm;
        g.beginPath();
        road.pts.forEach(([x, z], k) => {
          const nx = road.pts[Math.min(k + 1, road.pts.length - 1)];
          const pv = road.pts[Math.max(0, k - 1)];
          const dx = nx[0] - pv[0];
          const dz = nx[1] - pv[1];
          const l = Math.hypot(dx, dz) || 1;
          const ox = (-dz / l) * off;
          const oz = (dx / l) * off;
          if (k) g.lineTo(W(x + ox), Z(z + oz));
          else g.moveTo(W(x + ox), Z(z + oz));
        });
        g.stroke();
        g.restore();
      }
    }
  }
  g.setLineDash([]);
  if (worldId === "city") {
    // crosswalks at intersections + craters
    const ave = [-150, -75, 0, 75, 150];
    g.fillStyle = "rgba(225,220,205,0.6)";
    for (const ax of ave) for (const az of ave) {
      for (let k = -4; k <= 4; k++) {
        g.fillRect(W(ax + k * 1.6 - 0.5), Z(az + 13), 1 * ppm, 3 * ppm);
        g.fillRect(W(ax + k * 1.6 - 0.5), Z(az - 10), 1 * ppm, 3 * ppm);
      }
    }
  }
  // scorch marks / craters
  const R = rng(map.seed * 3 + 1);
  for (let k = 0; k < (worldId === "city" ? 70 : 34); k++) {
    const x = (R() - 0.5) * 380;
    const z = (R() - 0.5) * 380;
    const r = (1.5 + R() * 3.5) * ppm;
    const gr = g.createRadialGradient(W(x), Z(z), 0, W(x), Z(z), r);
    gr.addColorStop(0, "rgba(30,26,22,0.55)");
    gr.addColorStop(0.6, "rgba(40,34,28,0.3)");
    gr.addColorStop(1, "rgba(40,34,28,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(W(x), Z(z), r, 0, Math.PI * 2);
    g.fill();
  }
  // darker ground under trees / around obstacles
  for (const o of map.obstacles) {
    if (o.kind !== "tree") continue;
    const r = 3.4 * ppm * (o.scale || 1);
    const gr = g.createRadialGradient(W(o.x), Z(o.z), 0, W(o.x), Z(o.z), r);
    gr.addColorStop(0, "rgba(30,42,20,0.55)");
    gr.addColorStop(1, "rgba(30,42,20,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(W(o.x), Z(o.z), r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function buildTerrain(map, worldId, T, quality) {
  const size = quality === "low" ? 1024 : 1536;
  const splatC = paintSplat(map, worldId, size);
  const splat = tex(splatC, false);
  splat.anisotropy = 8;
  splat.flipY = false; // canvas row 0 = north (+z) = uv v 0 on the rotated plane
  const half = map.terHalf;
  const segs = quality === "low" ? 170 : 240;
  const geo = new THREE.PlaneGeometry(half * 2, half * 2, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, map.heightAt(p.getX(i), p.getZ(i)));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ map: splat, roughness: 0.97, metalness: 0 });
  const detailScale = worldId === "city" ? 110 : 150;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailMap = { value: T.detail };
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D detailMap;")
      .replace("#include <map_fragment>", `#include <map_fragment>\n  float dTex = texture2D(detailMap, vMapUv * ${detailScale.toFixed(1)}).r;\n  float dTex2 = texture2D(detailMap, vMapUv * ${(detailScale * 0.17).toFixed(2)}).r;\n  diffuseColor.rgb *= 0.62 + dTex * 0.55 + (dTex2 - 0.5) * 0.25;`);
  };
  mat.customProgramCacheKey = () => `tw-terrain-${worldId}`;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return { mesh, splat, splatC };
}

/* ------------------------------------------------------------------ sky */
function buildSky(P) {
  const geo = new THREE.SphereGeometry(1200, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(P.skyTop) },
      hor: { value: new THREE.Color(P.skyHor) },
      sunDir: { value: new THREE.Vector3(...P.sunDir).normalize() },
      sunCol: { value: new THREE.Color(P.sun) },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
      void main(){ float h = clamp(vDir.y, -0.2, 1.0); vec3 c = mix(hor, top, pow(max(h,0.0), 0.55));
        c = mix(c, hor * 0.92, smoothstep(0.0, -0.2, vDir.y));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.28 + pow(s, 3.0) * 0.08);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}

/* ------------------------------------------------------------------ props */
function buildStatics(map, worldId, M, vt) {
  const P = new Parts();
  const F = new FaceBuilder();
  const R = rng(map.seed * 7 + 3);
  const extra = [];
  const wreckOrder = [];
  for (const o of map.obstacles) {
    if (o.destruct) continue;
    const b = o.base;
    switch (o.kind) {
      case "hesco":
        P.add("hesco", boxGeo(o.hx * 2, o.h, o.hz * 2), o.x, b + o.h / 2 - 0.05, o.z, 0, o.a, 0);
        break;
      case "concrete":
        P.add("concrete", boxGeo(o.hx * 2, o.h, o.hz * 2), o.x, b + o.h / 2 - 0.05, o.z, 0, o.a, 0);
        P.add("metal", boxGeo(o.hx * 2 + 0.1, 0.12, o.hz * 2), o.x, b + o.h + 0.02, o.z, 0, o.a, 0);
        break;
      case "logwall": {
        P.add("logs", boxGeo(o.hx * 2, o.h, o.hz * 2), o.x, b + o.h / 2 - 0.1, o.z, 0, o.a, 0);
        const n = Math.floor((o.hz * 2) / 0.9);
        for (let k = 0; k < n; k++) {
          const [wx, wz] = toWorld(o, 0, -o.hz + 0.45 + k * 0.9);
          P.add("logs", new THREE.ConeGeometry(0.42, 0.6, 6), wx, b + o.h + 0.2, wz);
        }
        break;
      }
      case "bunker": {
        P.add("concrete", boxGeo(o.hx * 2, o.h, o.hz * 2), o.x, b + o.h / 2 - 0.1, o.z, 0, o.a, 0);
        P.add("concreteDark", boxGeo(o.hx * 2 + 0.4, 0.35, o.hz * 2 + 0.4), o.x, b + o.h + 0.1, o.z, 0, o.a, 0);
        const [sx, sz] = toWorld(o, 0, o.hz + 0.02);
        P.add("burnt", boxGeo(o.hx * 1.2, 0.35, 0.1), sx, b + o.h * 0.62, sz, 0, o.a, 0);
        for (let k = -2; k <= 2; k++) {
          const [wx, wz] = toWorld(o, k * 1.3, o.hz + 0.9);
          P.add("sandbag", new THREE.SphereGeometry(0.6, 8, 5), wx, b + 0.35, wz, 0, o.a, 0, 1, 0.45, 0.7);
        }
        break;
      }
      case "tent": {
        const s = new THREE.Shape([new THREE.Vector2(-o.hx, 0), new THREE.Vector2(o.hx, 0), new THREE.Vector2(0, o.h)]);
        const g = new THREE.ExtrudeGeometry(s, { depth: o.hz * 2, bevelEnabled: false });
        g.translate(0, 0, -o.hz);
        P.add(worldId === "desert" ? "canvas" : "canvasGreen", g, o.x, b - 0.05, o.z, 0, o.a, 0);
        break;
      }
      case "hut": {
        P.add("wood", boxGeo(o.hx * 2, o.h * 0.7, o.hz * 2), o.x, b + o.h * 0.35, o.z, 0, o.a, 0);
        const s = new THREE.Shape([new THREE.Vector2(-o.hx - 0.3, 0), new THREE.Vector2(o.hx + 0.3, 0), new THREE.Vector2(0, o.h * 0.45)]);
        const g = new THREE.ExtrudeGeometry(s, { depth: o.hz * 2 + 0.4, bevelEnabled: false });
        g.translate(0, 0, -o.hz - 0.2);
        P.add("tin", g, o.x, b + o.h * 0.7, o.z, 0, o.a, 0);
        break;
      }
      case "rail":
        P.add("wood", boxGeo(0.25, 0.9, o.hz * 2), o.x, o.base + 0.55, o.z, 0, o.a, 0);
        for (let k = -o.hz; k <= o.hz; k += 3) {
          const [wx, wz] = toWorld(o, 0, k);
          P.add("wood", boxGeo(0.3, 1.1, 0.3), wx, o.base + 0.5, wz, 0, o.a, 0);
        }
        break;
      case "logs":
        for (let k = 0; k < 6; k++) {
          const row = k < 3 ? 0 : 1;
          const lx = (k % 3) * 0.95 - 0.95 + row * 0.47;
          const [wx, wz] = toWorld(o, lx * 0.95, 0);
          P.add("bark", cylGeo(0.45, 0.45, o.hz * 2, 8), wx, b + 0.45 + row * 0.8, wz, Math.PI / 2, o.a, 0);
        }
        break;
      case "barrier": {
        const s = new THREE.Shape([new THREE.Vector2(-0.42, 0), new THREE.Vector2(0.42, 0), new THREE.Vector2(0.14, 0.3), new THREE.Vector2(0.1, 1.05), new THREE.Vector2(-0.1, 1.05), new THREE.Vector2(-0.14, 0.3)]);
        const g = new THREE.ExtrudeGeometry(s, { depth: o.hz * 2, bevelEnabled: false });
        g.translate(0, 0, -o.hz);
        P.add("stone", g, o.x, b - 0.03, o.z, 0, o.a, 0);
        break;
      }
      case "car":
      case "bus": {
        const bus = o.kind === "bus";
        P.add("burnt", boxGeo(o.hx * 2, bus ? 2.2 : 0.8, o.hz * 2), o.x, b + (bus ? 1.5 : 0.75), o.z, 0, o.a, 0.03);
        if (!bus) {
          const [cx, cz] = toWorld(o, 0, -0.2);
          P.add("burnt", boxGeo(o.hx * 1.8, 0.62, o.hz * 1.1), cx, b + 1.45, cz, 0, o.a, -0.04);
        } else P.add("rust", boxGeo(o.hx * 2.02, 0.5, o.hz * 2.02), o.x, b + 2.3, o.z, 0, o.a, 0.03);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const [wx, wz] = toWorld(o, sx * (o.hx - 0.1), sz * (o.hz - 0.7));
          P.add("rust", cylGeo(0.35, 0.35, 0.25, 8), wx, b + 0.32, wz, 0, o.a, Math.PI / 2);
        }
        break;
      }
      case "container":
        P.add(R() < 0.5 ? "containerRed" : "containerBlue", boxGeo(o.hx * 2, o.h, o.hz * 2), o.x, b + o.h / 2 - 0.05, o.z, 0, o.a, 0);
        break;
      case "silo":
        P.add("metal", cylGeo(o.r, o.r, o.h, 18), o.x, b + o.h / 2, o.z);
        P.add("rust", new THREE.ConeGeometry(o.r * 1.02, 2.2, 18), o.x, b + o.h + 1.1, o.z);
        for (let k = 1; k < 4; k++) P.add("rust", cylGeo(o.r + 0.05, o.r + 0.05, 0.25, 18), o.x, b + (o.h * k) / 4, o.z);
        break;
      case "chimney":
        P.add("brick", cylGeo(o.r * 0.75, o.r, o.h, 12), o.x, b + o.h / 2, o.z);
        P.add("burnt", cylGeo(o.r * 0.8, o.r * 0.8, 1.6, 12), o.x, b + o.h - 0.6, o.z);
        extra.push({ type: "stack", x: o.x, y: b + o.h + 0.5, z: o.z, s: 1.6 });
        break;
      case "factory": {
        const tint = [0.78, 0.74, 0.68];
        F.box(o.x, o.z, b - 0.1, o.h, o.hx, o.hz, o.a, tint, { top: false });
        // saw-tooth roof
        const teeth = 6;
        for (let k = 0; k < teeth; k++) {
          const lx = -o.hx + ((k + 0.5) * o.hx * 2) / teeth;
          const s = new THREE.Shape([new THREE.Vector2(-o.hz, 0), new THREE.Vector2(o.hz, 0), new THREE.Vector2(o.hz, 2.6)]);
          const g = new THREE.ExtrudeGeometry(s, { depth: (o.hx * 2) / teeth, bevelEnabled: false });
          g.rotateY(Math.PI / 2);
          g.translate(-(o.hx * 2) / teeth / 2, 0, 0);
          const [wx, wz] = toWorld(o, lx, 0);
          P.add("tin", g, wx, b + o.h - 0.1, wz, 0, o.a, 0);
        }
        break;
      }
      case "fountain":
        P.add("stone", cylGeo(o.r, o.r + 0.2, o.h, 18), o.x, b + o.h / 2, o.z);
        P.add("stone", cylGeo(0.5, 0.6, 2.4, 10), o.x, b + 1.2, o.z);
        break;
      case "ruinwall": {
        F.box(o.x, o.z, b - 0.1, o.h, o.hx, o.hz, o.a, [0.62, 0.58, 0.52], { top: true });
        for (let k = 0; k < 4; k++) {
          const lx = (R() - 0.5) * o.hx * 1.6;
          const lz = (R() - 0.5) * o.hz * 1.6;
          const [wx, wz] = toWorld(o, lx, lz);
          F.box(wx, wz, b + o.h - 0.2, 0.6 + R() * 2, o.hx * 0.3 + 0.3, o.hz * 0.3 + 0.3, o.a, [0.55, 0.52, 0.47], { top: true });
        }
        break;
      }
      case "building":
        buildBuilding(F, P, o, R);
        break;
      case "wreckTank":
      case "wreckTruck":
        wreckOrder.push(o);
        break;
      default:
    }
  }
  const meshes = [];
  const geos = P.build();
  for (const [k, g] of Object.entries(geos)) {
    const m = new THREE.Mesh(g, M[k] || M.concrete);
    m.castShadow = true;
    m.receiveShadow = true;
    meshes.push(m);
  }
  const fw = F.geo(F.walls);
  const ft = F.geo(F.tops);
  if (fw) {
    const m = new THREE.Mesh(fw, M.facade);
    m.castShadow = m.receiveShadow = true;
    meshes.push(m);
  }
  if (ft) {
    const m = new THREE.Mesh(ft, M.roof);
    m.castShadow = m.receiveShadow = true;
    meshes.push(m);
  }
  // wrecked vehicles reuse the real vehicle geometry with burnt materials
  const WP = new Parts();
  for (const o of wreckOrder) {
    const d = design(o.kind === "wreckTruck" ? "convoy" : R() < 0.5 ? "raider" : "scout");
    const add = (geos2, x, y, z, rx, ry, rz) => {
      for (const g of Object.values(geos2)) WP.add("burnt", g, x, y, z, rx, ry, rz);
    };
    add(d.hull, o.x, o.base - 0.05, o.z, 0.03, o.a, 0.04);
    if (d.turret) {
      const [tx, tz] = toWorld(o, 0, d.turretPos[2]);
      add(d.turret, tx, o.base + d.turretPos[1] - 0.1, tz, 0.1, o.a + 0.6 + R(), 0.12);
    }
  }
  const wg = WP.build();
  if (wg.burnt) {
    const m = new THREE.Mesh(wg.burnt, M.burnt);
    m.castShadow = m.receiveShadow = true;
    meshes.push(m);
  }
  return { meshes, extra };
}

function buildBuilding(F, P, o, R) {
  const base = o.base - 0.2;
  const shade = 0.72 + R() * 0.28;
  const hue = [[1, 0.95, 0.88], [0.92, 0.9, 0.86], [1, 0.9, 0.8], [0.85, 0.88, 0.9]][o.style || 0];
  const col = hue.map((v) => v * shade * (o.damaged ? 0.78 : 1));
  const uOff = R() * 32;
  if (!o.damaged) {
    F.box(o.x, o.z, base, o.h + 0.2, o.hx, o.hz, o.a, col, { vBase: base, uOff });
    // parapet + roof clutter
    const top = base + o.h + 0.2;
    for (const [lx, lz, hx2, hz2] of [[0, o.hz - 0.2, o.hx, 0.2], [0, -o.hz + 0.2, o.hx, 0.2], [o.hx - 0.2, 0, 0.2, o.hz], [-o.hx + 0.2, 0, 0.2, o.hz]]) {
      const [wx, wz] = toWorld(o, lx, lz);
      F.box(wx, wz, top, 0.8, hx2, hz2, o.a, col.map((v) => v * 0.8), { top: true, vBase: top });
    }
    for (let k = 0; k < 3; k++) {
      const [wx, wz] = toWorld(o, (R() - 0.5) * o.hx, (R() - 0.5) * o.hz);
      F.box(wx, wz, top, 1 + R() * 1.5, 0.8 + R(), 0.8 + R(), o.a, [0.55, 0.55, 0.55], { top: true });
    }
    if (R() < 0.35) {
      const [wx, wz] = toWorld(o, (R() - 0.5) * o.hx, (R() - 0.5) * o.hz);
      P.add("rust", cylGeo(1.2, 1.2, 2.2, 10), wx, top + 2.4, wz);
      for (const sx of [-0.8, 0.8]) P.add("rust", boxGeo(0.12, 1.4, 0.12), wx + sx, top + 0.7, wz);
    }
  } else {
    // shattered upper storeys: a lower intact block plus broken stubs and slabs
    const low = o.h * (0.45 + R() * 0.2);
    F.box(o.x, o.z, base, low, o.hx, o.hz, o.a, col, { vBase: base, uOff });
    const n = 3 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const hx2 = o.hx * (0.25 + R() * 0.35);
      const hz2 = o.hz * (0.25 + R() * 0.35);
      const lx = (R() < 0.5 ? -1 : 1) * (o.hx - hx2);
      const lz = (R() - 0.5) * (o.hz - hz2) * 2;
      const [wx, wz] = toWorld(o, lx, lz);
      F.box(wx, wz, base + low, (o.h - low) * (0.3 + R() * 0.7), hx2, hz2, o.a, col.map((v) => v * 0.92), { vBase: base, uOff: uOff + lx });
    }
    // exposed floor slabs sticking out
    for (let k = 0; k < 2; k++) {
      const [wx, wz] = toWorld(o, (R() - 0.5) * o.hx, o.hz * (R() < 0.5 ? 1 : -1));
      P.add("concreteDark", boxGeo(o.hx * 0.8, 0.3, 2.6), wx, base + low + 0.15 + k * 3.2, wz, R() * 0.3, o.a, R() * 0.2);
    }
    for (let k = 0; k < 4; k++) {
      const [wx, wz] = toWorld(o, (R() - 0.5) * o.hx * 1.6, (R() - 0.5) * o.hz * 1.6);
      P.add("rust", boxGeo(0.06, 1.8, 0.06), wx, base + low + 0.9, wz, R() - 0.5, 0, R() - 0.5);
    }
  }
}

function buildInstanced(map, worldId, M, vt) {
  const R = rng(map.seed * 11 + 5);
  const out = { meshes: [], destruct: new Map() };
  const mk = (geo, mat, list, shadow = true) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    list.forEach((it, i) => {
      e.set(it.rx || 0, it.ry || 0, it.rz || 0, "YXZ");
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.sx, it.sy, it.sz));
      im.setMatrixAt(i, m);
      if (it.c) im.setColorAt(i, new THREE.Color(...it.c));
    });
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    out.meshes.push(im);
    return im;
  };
  // rocks
  const rocks = [[], []];
  const rockCol = worldId === "desert" ? [0.62, 0.48, 0.34] : worldId === "forest" ? [0.45, 0.45, 0.42] : [0.5, 0.48, 0.45];
  const rubble = [];
  for (const o of map.obstacles) {
    if (o.kind === "rock") {
      const v = 0.85 + R() * 0.3;
      rocks[R() < 0.5 ? 0 : 1].push({ x: o.x, y: o.base + o.h * 0.25, z: o.z, ry: o.rot || 0, sx: o.r * 1.05, sy: o.h * 0.75, sz: o.r * (0.85 + R() * 0.3), c: rockCol.map((c) => c * v) });
    } else if (o.kind === "rubble") {
      const v = 0.8 + R() * 0.3;
      rubble.push({ x: o.x, y: o.base - 0.2, z: o.z, ry: o.rot || 0, sx: o.r * 1.1, sy: o.h, sz: o.r, c: [0.55 * v, 0.52 * v, 0.47 * v] });
    }
  }
  const rg = [rockGeo(3), rockGeo(9)];
  out.disposables = [...rg];
  mk(rg[0], M.rock, rocks[0]);
  mk(rg[1], M.rock, rocks[1]);
  mk(rg[0], M.rock, rubble);
  // trees (+ decorative ones beyond the boundary, + bushes)
  const trunks = [];
  const pines = [];
  const broads = [];
  const bushes = [];
  const leafCol = worldId === "city" ? [0.32, 0.4, 0.22] : [0.24, 0.36, 0.18];
  const addTree = (x, z, s, variant, rot) => {
    const y = map.heightAt(x, z) - 0.2;
    trunks.push({ x, y: y + 2.5 * s, z, sx: s, sy: s, sz: s, ry: rot });
    const v = 0.8 + R() * 0.4;
    const c = variant ? [leafCol[0] * 1.25 * v, leafCol[1] * 1.15 * v, leafCol[2] * v] : leafCol.map((k) => k * v);
    (variant ? broads : pines).push({ x, y, z, sx: s, sy: s * (0.9 + R() * 0.2), sz: s, ry: rot, c });
  };
  for (const o of map.obstacles) if (o.kind === "tree") addTree(o.x, o.z, o.scale || 1, o.variant || 0, o.rot || 0);
  if (worldId === "forest") {
    for (let k = 0; k < 900; k++) {
      const a = R() * Math.PI * 2;
      const d = 200 + R() * 120;
      const x = Math.cos(a) * d * (1 + 0.25 * Math.abs(Math.sin(a * 2)));
      const z = Math.sin(a) * d * (1 + 0.25 * Math.abs(Math.sin(a * 2)));
      if (Math.abs(x) < 196 && Math.abs(z) < 196) continue;
      if (Math.abs(x) > 325 || Math.abs(z) > 325) continue;
      addTree(x, z, 0.9 + R() * 0.6, R() < 0.25 ? 1 : 0, R() * 6);
    }
    for (let k = 0; k < 420; k++) {
      const x = (R() - 0.5) * 380;
      const z = (R() - 0.5) * 380;
      if (map.roadDist(x, z) < 5 || Math.abs(z - map.riverZ(x)) < 15) continue;
      if (fbm(x * 0.012 + 40, z * 0.012, 41) < 0.42) continue;
      const s = 0.4 + R() * 0.6;
      bushes.push({ x, y: map.heightAt(x, z) + 0.2, z, sx: s * 1.3, sy: s * 0.8, sz: s * 1.2, ry: R() * 6, c: leafCol.map((c) => c * (0.9 + R() * 0.4)) });
    }
  } else if (worldId === "desert") {
    for (let k = 0; k < 260; k++) {
      const x = (R() - 0.5) * 390;
      const z = (R() - 0.5) * 390;
      if (map.roadDist(x, z) < 4) continue;
      const s = 0.25 + R() * 0.45;
      bushes.push({ x, y: map.heightAt(x, z) + 0.05, z, sx: s * 1.4, sy: s * 0.7, sz: s * 1.3, ry: R() * 6, c: [0.48, 0.44, 0.27].map((c) => c * (0.8 + R() * 0.4)) });
    }
  }
  const trunkGeo = cylGeo(0.22, 0.38, 5, 7);
  const pineGeo = pineCanopy();
  const broadGeo = broadCanopy();
  const bushGeo = new THREE.IcosahedronGeometry(1, 0);
  out.disposables.push(trunkGeo, pineGeo, broadGeo, bushGeo);
  mk(trunkGeo, M.bark, trunks);
  mk(pineGeo, M.leaves, pines);
  mk(broadGeo, M.leaves, broads);
  mk(bushGeo, M.leaves, bushes, false);
  // destructibles: intact + broken instanced meshes
  const kinds = {
    crate: { geo: boxGeo(1.5, 1.4, 1.5), mat: M.crate, broken: boxGeo(1.6, 0.35, 1.7), bmat: M.wood },
    barrel: { geo: cylGeo(0.45, 0.45, 1.25, 12), mat: M.barrel, broken: null },
    fence: { geo: fenceGeo(), mat: M.wood, broken: null },
    barricade: { geo: sandbagGeo(false), mat: M.sandbag, broken: sandbagGeo(true), bmat: M.sandbag },
  };
  const tw = towerGeo(false);
  const tb = towerGeo(true);
  out.disposables.push(...Object.values(kinds).flatMap((k) => [k.geo, k.broken].filter(Boolean)), ...Object.values(tw), ...Object.values(tb));
  const lists = { crate: [], barrel: [], fence: [], barricade: [], tower: [] };
  for (const o of map.obstacles) if (o.destruct) lists[o.destruct].push(o);
  const place = (o) => {
    switch (o.destruct) {
      case "crate":
        return { x: o.x, y: o.base + 0.68, z: o.z, ry: o.a, sx: 1, sy: 1, sz: 1 };
      case "barrel":
        return { x: o.x, y: o.base + 0.62, z: o.z, sx: 1, sy: 1, sz: 1, c: R() < 0.7 ? [0.72, 0.24, 0.16] : [0.3, 0.4, 0.28] };
      case "fence":
        return { x: o.x, y: o.base - 0.05, z: o.z, ry: o.a, sx: 1, sy: 1, sz: o.hz * 2, c: worldId === "city" ? [0.62, 0.64, 0.66] : [1, 1, 1] };
      case "barricade":
        return { x: o.x, y: o.base - 0.05, z: o.z, ry: o.a, sx: 1, sy: 1, sz: o.hz * 2 };
      default:
        return { x: o.x, y: o.base - 0.05, z: o.z, ry: o.a, sx: 1, sy: 1, sz: 1 };
    }
  };
  const reg = (kind, ims, bims) => {
    lists[kind].forEach((o, i) => out.destruct.set(o.i, { ims, bims, i, place: place(o) }));
  };
  for (const kind of ["crate", "barrel", "fence", "barricade"]) {
    const K = kinds[kind];
    const items = lists[kind].map(place);
    const im = mk(K.geo, K.mat, items);
    let bim = null;
    if (K.broken && items.length) {
      bim = mk(K.broken, K.bmat, items.map((p) => ({ ...p, sx: 0, sy: 0, sz: 0 })), false);
      if (bim) bim.frustumCulled = false; // bounds were computed while every instance was hidden
    }
    if (im) reg(kind, [im], bim ? [bim] : []);
  }
  {
    const items = lists.tower.map(place);
    const ims = [];
    const bims = [];
    for (const k of Object.keys(tw)) ims.push(mk(tw[k], M[k], items));
    for (const k of Object.keys(tb)) {
      const b = mk(tb[k], M[k], items.map((p) => ({ ...p, sx: 0, sy: 0, sz: 0 })), false);
      if (b) b.frustumCulled = false;
      bims.push(b);
    }
    if (items.length) reg("tower", ims.filter(Boolean), bims.filter(Boolean));
  }
  return out;
}

function buildBridges(map, M) {
  const P = new Parts();
  for (const d of map.decks) {
    P.add("wood", boxGeo(d.hx * 2, 0.4, d.hz * 2), d.x, d.y - 0.2, d.z, 0, d.a, 0);
    for (const sx of [-1, 1]) P.add("metal", boxGeo(0.35, 0.9, d.hz * 2), d.x + sx * (d.hx - 0.2), d.y - 0.7, d.z, 0, d.a, 0);
    for (let k = -d.hz + 4; k <= d.hz - 4; k += 8) {
      P.add("concrete", boxGeo(d.hx * 2 - 1, 7, 1.6), d.x, d.y - 4.2, d.z + k, 0, d.a, 0);
    }
  }
  const g = P.build();
  return Object.entries(g).map(([k, geo]) => {
    const m = new THREE.Mesh(geo, M[k]);
    m.castShadow = m.receiveShadow = true;
    return m;
  });
}

/* ------------------------------------------------------------------ minimap background */
function buildMinimap(map, worldId, splatC) {
  const S = 512;
  const c = canvas(S, S);
  const g = c.getContext("2d");
  // the splat covers ±terHalf; crop to the ±200 play square
  const half = map.terHalf;
  const src = splatC.width;
  const crop = (200 / half) * src;
  // mirrored horizontally: seen from above with north up, +x points WEST (left) in this right-handed frame
  g.save();
  g.translate(S, 0);
  g.scale(-1, 1);
  g.drawImage(splatC, (src - crop) / 2, (src - crop) / 2, crop, crop, 0, 0, S, S);
  g.restore();
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, 0, S, S);
  const W = (x) => ((200 - x) / 400) * S;
  const Z = (z) => ((200 - z) / 400) * S;
  if (map.water != null) {
    g.fillStyle = "rgba(60,110,130,0.85)";
    for (let x = -200; x <= 200; x += 2) {
      for (let z = -200; z <= 200; z += 2) if (map.groundAt(x, z) < map.water) g.fillRect(W(x), Z(z), 3, 3);
    }
  }
  for (const o of map.obstacles) {
    if (o.kind === "tree") {
      g.fillStyle = "rgba(30,52,24,0.75)";
      g.beginPath();
      g.arc(W(o.x), Z(o.z), 2.6, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    if (o.destruct === "crate" || o.destruct === "barrel" || o.destruct === "fence") continue;
    g.fillStyle = o.kind === "building" || o.kind === "factory" ? "rgba(26,26,28,0.92)" : o.kind === "rock" ? "rgba(80,66,50,0.85)" : "rgba(40,38,34,0.85)";
    g.save();
    g.translate(W(o.x), Z(o.z));
    g.rotate(-(o.a || 0));
    if (o.shape === "cyl") {
      g.beginPath();
      g.arc(0, 0, Math.max(1.5, (o.r / 400) * S), 0, Math.PI * 2);
      g.fill();
    } else g.fillRect((-o.hx / 400) * S, (-o.hz / 400) * S, Math.max(1.5, ((o.hx * 2) / 400) * S), Math.max(1.5, ((o.hz * 2) / 400) * S));
    g.restore();
  }
  g.strokeStyle = "rgba(255,255,255,0.12)";
  for (let k = -200; k <= 200; k += 50) {
    g.beginPath();
    g.moveTo(W(k), 0);
    g.lineTo(W(k), S);
    g.moveTo(0, Z(k));
    g.lineTo(S, Z(k));
    g.stroke();
  }
  return c;
}

/* ------------------------------------------------------------------ entry */
export function buildEnv(map, worldId, ctx) {
  const P = PALETTE[worldId];
  const group = new THREE.Group();
  const disposables = [];
  const terrain = buildTerrain(map, worldId, ctx.T, ctx.quality);
  group.add(terrain.mesh);
  disposables.push(terrain.mesh.geometry, terrain.mesh.material, terrain.splat);
  const sky = buildSky(P);
  group.add(sky);
  disposables.push(sky.geometry, sky.material);
  const st = buildStatics(map, worldId, ctx.M, ctx.vt);
  for (const m of st.meshes) {
    group.add(m);
    disposables.push(m.geometry);
  }
  const inst = buildInstanced(map, worldId, ctx.M, ctx.vt);
  for (const m of inst.meshes) {
    group.add(m);
  }
  disposables.push(...inst.disposables);
  let water = null;
  if (map.water != null) {
    const wg = new THREE.PlaneGeometry(700, 700);
    wg.rotateX(-Math.PI / 2);
    const wt = ctx.T.waterN.clone();
    wt.needsUpdate = true;
    wt.repeat.set(70, 70);
    const wm = new THREE.MeshStandardMaterial({ color: 0x3d5e57, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.86, normalMap: wt, normalScale: new THREE.Vector2(0.5, 0.5) });
    water = new THREE.Mesh(wg, wm);
    water.position.y = map.water;
    water.receiveShadow = true;
    group.add(water);
    disposables.push(wg, wm, wt);
    for (const m of buildBridges(map, ctx.M)) {
      group.add(m);
      disposables.push(m.geometry);
    }
  }
  const minimap = buildMinimap(map, worldId, terrain.splatC);
  /** Swap a destructible obstacle to its broken variant. */
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const setAlive = (obIndex, alive) => {
    const d = inst.destruct.get(obIndex);
    if (!d) return;
    for (const im of d.ims) {
      if (alive) {
        e.set(0, d.place.ry || 0, 0, "YXZ");
        q.setFromEuler(e);
        mtx.compose(new THREE.Vector3(d.place.x, d.place.y, d.place.z), q, new THREE.Vector3(d.place.sx, d.place.sy, d.place.sz));
        im.setMatrixAt(d.i, mtx);
      } else im.setMatrixAt(d.i, zero);
      im.instanceMatrix.needsUpdate = true;
    }
    for (const im of d.bims) {
      if (!alive) {
        e.set(0, (d.place.ry || 0) + 0.3, 0, "YXZ");
        q.setFromEuler(e);
        mtx.compose(new THREE.Vector3(d.place.x, map.groundAt(d.place.x, d.place.z) - 0.02, d.place.z), q, new THREE.Vector3(1, 1, Math.min(2.5, d.place.sz)));
        im.setMatrixAt(d.i, mtx);
      } else im.setMatrixAt(d.i, zero);
      im.instanceMatrix.needsUpdate = true;
    }
  };
  return { worldId, map, group, sky, palette: P, disposables, water, minimap, setAlive, extra: st.extra, destructCount: inst.destruct.size };
}
