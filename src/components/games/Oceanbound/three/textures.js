/**
 * Oceanbound — procedural textures (canvas → THREE.CanvasTexture). No image
 * files: wood grain, sand, rock, thatch, sail cloth, net mesh, palm leaflet
 * alpha, grass tufts, the tiling water normal map, foam and soft sprites.
 * All textures are cached and disposed together.
 */
import * as THREE from "three";
import { rng } from "../sim/util.js";

const cache = new Map();
let anisotropy = 4;
export function setAnisotropy(a) {
  anisotropy = a;
}

function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function tex(key, c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}
const get = (key, make) => cache.get(key) || make();

/* tileable value noise on a canvas grid */
function noiseGrid(n, seed) {
  const r = rng(seed);
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = r();
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const s = (t) => t * t * (3 - 2 * t);
    const at = (a, b) => g[(((b % n) + n) % n) * n + (((a % n) + n) % n)];
    const u = s(fx);
    const v = s(fy);
    return (at(xi, yi) * (1 - u) + at(xi + 1, yi) * u) * (1 - v) + (at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u) * v;
  };
}
function fbmT(nz, x, y, oct, base) {
  let s = 0;
  let a = 0.5;
  let f = base;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    s += nz(x * f, y * f) * a;
    norm += a;
    f *= 2;
    a *= 0.5;
  }
  return s / norm;
}

/** weathered plank wood (grain along u) */
export function woodTex() {
  return get("wood", () => {
    const W = 256;
    const H = 256;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const img = g.createImageData(W, H);
    const nz = noiseGrid(32, 11);
    const nz2 = noiseGrid(16, 12);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / H;
        const grain = fbmT(nz, u * 2, v * 0.25 + fbmT(nz2, u, v, 2, 4) * 0.3, 4, 8);
        const rings = Math.sin((v * 40 + grain * 12) * Math.PI) * 0.5 + 0.5;
        const k = 0.72 + grain * 0.35 + rings * 0.12;
        const weather = fbmT(nz2, u * 3, v * 3, 3, 2);
        const i = (y * W + x) * 4;
        img.data[i] = Math.min(255, 196 * k * (0.92 + weather * 0.16));
        img.data[i + 1] = Math.min(255, 168 * k * (0.92 + weather * 0.14));
        img.data[i + 2] = Math.min(255, 132 * k * (0.95 + weather * 0.1));
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // knots + nail heads
    const r = rng(5);
    for (let k = 0; k < 6; k++) {
      const x = r() * W;
      const y = r() * H;
      const gr = g.createRadialGradient(x, y, 0, x, y, 6 + r() * 6);
      gr.addColorStop(0, "rgba(60,38,20,0.8)");
      gr.addColorStop(1, "rgba(60,38,20,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, 10, 5, 0, 0, Math.PI * 2);
      g.fill();
    }
    return tex("wood", c);
  });
}

/** sand / ground detail (greyscale-ish, multiplied with vertex colours) */
export function groundTex() {
  return get("ground", () => {
    const W = 256;
    const c = canvas(W);
    const g = c.getContext("2d");
    const img = g.createImageData(W, W);
    const nz = noiseGrid(64, 21);
    const r = rng(22);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const n = fbmT(nz, x / W, y / W, 4, 16);
        const grain = r() * 0.12;
        const v = 0.8 + n * 0.3 + grain;
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 230);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex("ground", c);
  });
}

export function rockTex() {
  return get("rock", () => {
    const W = 256;
    const c = canvas(W);
    const g = c.getContext("2d");
    const img = g.createImageData(W, W);
    const nz = noiseGrid(32, 31);
    const nz2 = noiseGrid(64, 32);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const n = fbmT(nz, x / W, y / W, 5, 4);
        const cr = 1 - 0.18 * Math.max(0, 1 - Math.abs(fbmT(nz2, x / W, y / W, 3, 8) - 0.5) / 0.04);
        const v = (0.5 + n * 0.38) * cr;
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 235);
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return tex("rock", c);
  });
}

/** thatch (palm-leaf roof) */
export function thatchTex() {
  return get("thatch", () => {
    const W = 256;
    const c = canvas(W);
    const g = c.getContext("2d");
    g.fillStyle = "#8a7a3e";
    g.fillRect(0, 0, W, W);
    const r = rng(41);
    for (let row = 0; row < 9; row++) {
      for (let k = 0; k < 140; k++) {
        const x = r() * W;
        const y = row * 30 + r() * 8 - 4;
        const len = 26 + r() * 18;
        const hue = 40 + r() * 22;
        g.strokeStyle = `hsl(${hue}, ${38 + r() * 20}%, ${30 + r() * 22}%)`;
        g.lineWidth = 1.2 + r() * 1.6;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + (r() - 0.5) * 6, y + len * 0.5, x + (r() - 0.5) * 8, y + len);
        g.stroke();
      }
      g.fillStyle = "rgba(40,30,10,0.35)";
      g.fillRect(0, row * 30 + 26, W, 3);
    }
    return tex("thatch", c);
  });
}

/** sail cloth: patched canvas */
export function clothTex() {
  return get("cloth", () => {
    const W = 256;
    const c = canvas(W);
    const g = c.getContext("2d");
    g.fillStyle = "#e9dcc0";
    g.fillRect(0, 0, W, W);
    const r = rng(51);
    const patches = ["#d8c49e", "#c9b48d", "#e4d4b2", "#b9c4c8", "#d6b08a"];
    for (let k = 0; k < 7; k++) {
      g.fillStyle = patches[k % patches.length];
      const x = r() * W * 0.8;
      const y = r() * W * 0.8;
      const w = 40 + r() * 70;
      const h = 40 + r() * 70;
      g.fillRect(x, y, w, h);
      g.strokeStyle = "rgba(90,70,40,0.6)";
      g.setLineDash([4, 4]);
      g.lineWidth = 1.5;
      g.strokeRect(x + 3, y + 3, w - 6, h - 6);
    }
    g.setLineDash([]);
    const img = g.getImageData(0, 0, W, W);
    for (let i = 0; i < img.data.length; i += 4) {
      const x = (i / 4) % W;
      const y = Math.floor(i / 4 / W);
      const weave = ((x % 3 === 0) ^ (y % 3 === 0) ? 0.95 : 1) * (0.94 + r() * 0.06);
      img.data[i] *= weave;
      img.data[i + 1] *= weave;
      img.data[i + 2] *= weave;
    }
    g.putImageData(img, 0, 0);
    return tex("cloth", c);
  });
}

/** knotted net (alpha) */
export function netTex() {
  return get("net", () => {
    const W = 128;
    const c = canvas(W);
    const g = c.getContext("2d");
    g.clearRect(0, 0, W, W);
    g.strokeStyle = "rgba(225,215,180,1)";
    g.lineWidth = 2.2;
    const n = 6;
    for (let k = -n; k <= n * 2; k++) {
      g.beginPath();
      g.moveTo((k * W) / n, 0);
      g.lineTo((k * W) / n + W, W);
      g.stroke();
      g.beginPath();
      g.moveTo((k * W) / n, 0);
      g.lineTo((k * W) / n - W, W);
      g.stroke();
    }
    return tex("net", c);
  });
}

/** palm leaflet alpha strip used by fronds (u across, v along) */
export function leafTex() {
  return get("leaf", () => {
    const W = 128;
    const H = 256;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    g.clearRect(0, 0, W, H);
    const r = rng(61);
    for (let k = 0; k < 26; k++) {
      const y = 8 + (k / 26) * (H - 16);
      const len = W * 0.48 * Math.sin((k / 26) * Math.PI * 0.9 + 0.15);
      for (const s of [-1, 1]) {
        const grad = g.createLinearGradient(W / 2, y, W / 2 + s * len, y + 18);
        grad.addColorStop(0, "#3f7f2c");
        grad.addColorStop(1, `hsl(${92 + r() * 18}, 55%, ${36 + r() * 12}%)`);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(W / 2, y - 2);
        g.quadraticCurveTo(W / 2 + s * len * 0.6, y + 2, W / 2 + s * len, y + 16);
        g.quadraticCurveTo(W / 2 + s * len * 0.5, y + 8, W / 2, y + 5);
        g.fill();
      }
    }
    g.fillStyle = "#5d7a2c";
    g.fillRect(W / 2 - 2, 0, 4, H);
    return tex("leaf", c, { repeat: false });
  });
}

/** grass / fern tuft alpha */
export function tuftTex() {
  return get("tuft", () => {
    const W = 128;
    const c = canvas(W);
    const g = c.getContext("2d");
    const r = rng(71);
    for (let k = 0; k < 34; k++) {
      const x = W / 2 + (r() - 0.5) * W * 0.7;
      const h = W * (0.45 + r() * 0.5);
      g.strokeStyle = `hsl(${78 + r() * 30}, ${45 + r() * 25}%, ${30 + r() * 25}%)`;
      g.lineWidth = 2 + r() * 2.5;
      g.beginPath();
      g.moveTo(x, W);
      g.quadraticCurveTo(x + (r() - 0.5) * 22, W - h * 0.6, x + (r() - 0.5) * 40, W - h);
      g.stroke();
    }
    return tex("tuft", c, { repeat: false });
  });
}

/** tiling water normal map (from a periodic height field) */
export function waterNormalTex() {
  return get("waterN", () => {
    const W = 256;
    const c = canvas(W);
    const g = c.getContext("2d");
    const img = g.createImageData(W, W);
    const nz = noiseGrid(16, 81);
    const nz2 = noiseGrid(32, 82);
    const hgt = new Float32Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / W;
        hgt[y * W + x] = fbmT(nz, u, v, 4, 16) * 0.7 + fbmT(nz2, u, v, 3, 32) * 0.3;
      }
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        const hx = hgt[y * W + ((x + 1) % W)] - hgt[y * W + ((x - 1 + W) % W)];
        const hy = hgt[((y + 1) % W) * W + x] - hgt[((y - 1 + W) % W) * W + x];
        const nx = -hx * 6;
        const ny = -hy * 6;
        const L = Math.hypot(nx, ny, 1);
        const i = (y * W + x) * 4;
        img.data[i] = ((nx / L) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / L) * 0.5 + 0.5) * 255;
        img.data[i + 2] = (1 / L) * 0.5 * 255 + 127;
        img.data[i + 3] = Math.min(255, hgt[y * W + x] * 255);
      }
    g.putImageData(img, 0, 0);
    return tex("waterN", c, { srgb: false });
  });
}

/** soft round sprite (particles) */
export function dotTex() {
  return get("dot", () => {
    const W = 64;
    const c = canvas(W);
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.75)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, W, W);
    return tex("dot", c, { repeat: false });
  });
}
/** expanding foam ring */
export function ringTex() {
  return get("ring", () => {
    const W = 128;
    const c = canvas(W);
    const g = c.getContext("2d");
    const r = rng(91);
    for (let k = 0; k < 220; k++) {
      const a = r() * Math.PI * 2;
      const d = W * (0.36 + r() * 0.12);
      g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.5})`;
      g.beginPath();
      g.arc(W / 2 + Math.cos(a) * d, W / 2 + Math.sin(a) * d, 1 + r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return tex("ring", c, { repeat: false });
  });
}
/** parchment for logbook page props */
export function paperTex() {
  return get("paper", () => {
    const W = 128;
    const c = canvas(W);
    const g = c.getContext("2d");
    g.fillStyle = "#e8d9b0";
    g.fillRect(0, 0, W, W);
    g.strokeStyle = "rgba(60,40,20,0.55)";
    for (let k = 0; k < 11; k++) {
      g.lineWidth = 1.2;
      g.beginPath();
      g.moveTo(12, 16 + k * 10);
      g.lineTo(100 + Math.sin(k) * 14, 16 + k * 10);
      g.stroke();
    }
    g.fillStyle = "rgba(120,80,40,0.25)";
    g.beginPath();
    g.arc(96, 98, 18, 0, Math.PI * 2);
    g.fill();
    return tex("paper", c, { repeat: false });
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
