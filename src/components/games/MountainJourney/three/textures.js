/**
 * Mountain Journey — procedural canvas textures (no image assets). Built
 * lazily, cached, and disposed when the game unmounts.
 */
import * as THREE from "three";
import { mulberry32 } from "../engine/rng.js";

const cache = new Map();

function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Tileable value noise (periodic lattice) in [0, 1]. */
function tileNoise(size, cells, seed, octaves = 4) {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const rand = mulberry32(seed * 131 + o * 977);
    const lat = new Float32Array(n * n);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * n;
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const uy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * n;
        const ix = Math.floor(fx);
        const tx = fx - ix;
        const ux = tx * tx * (3 - 2 * tx);
        const a = lat[(iy % n) * n + (ix % n)];
        const b = lat[(iy % n) * n + ((ix + 1) % n)];
        const c = lat[((iy + 1) % n) * n + (ix % n)];
        const d = lat[((iy + 1) % n) * n + ((ix + 1) % n)];
        out[y * size + x] += (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function toTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function make(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/** Ground detail: soft grey noise around 1.0 (multiplies vertex colours). */
export function groundDetail() {
  return make("groundDetail", () => {
    const S = 256;
    const n = tileNoise(S, 8, 3, 5);
    const n2 = tileNoise(S, 32, 9, 3);
    const c = canvas(S);
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      const v = 0.72 + n[i] * 0.36 + (n2[i] - 0.5) * 0.22;
      const b = Math.max(0, Math.min(255, v * 205));
      img.data[i * 4] = b;
      img.data[i * 4 + 1] = b;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

/** Rock: grey strata + cracks, a touch of warmth. */
export function rockTex() {
  return make("rock", () => {
    const S = 256;
    const n = tileNoise(S, 6, 21, 5);
    const n2 = tileNoise(S, 24, 22, 3);
    const c = canvas(S);
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const strata = Math.sin((y / S) * Math.PI * 14 + n[i] * 6) * 0.5 + 0.5;
        let v = 0.55 + n[i] * 0.35 + strata * 0.12 + (n2[i] - 0.5) * 0.18;
        if (Math.abs(n2[i] - 0.5) < 0.012) v *= 0.6; // cracks
        img.data[i * 4] = Math.min(255, v * 228);
        img.data[i * 4 + 1] = Math.min(255, v * 224);
        img.data[i * 4 + 2] = Math.min(255, v * 214);
        img.data[i * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

/** Bark: vertical fibres. */
export function barkTex() {
  return make("bark", () => {
    const S = 128;
    const n = tileNoise(S, 4, 31, 4);
    const c = canvas(S);
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const fib = Math.sin((x / S) * Math.PI * 22 + n[i] * 9) * 0.5 + 0.5;
        const v = 0.55 + fib * 0.3 + n[i] * 0.25;
        img.data[i * 4] = Math.min(255, v * 210);
        img.data[i * 4 + 1] = Math.min(255, v * 200);
        img.data[i * 4 + 2] = Math.min(255, v * 190);
        img.data[i * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

/** Wooden planks along U. */
export function plankTex() {
  return make("plank", () => {
    const S = 256;
    const n = tileNoise(S, 4, 41, 4);
    const c = canvas(S);
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const plank = Math.floor((y / S) * 6);
        const seam = (y / S) * 6 - plank < 0.06 ? 0.55 : 1;
        const grain = Math.sin((x / S) * Math.PI * 4 + n[i] * 12 + plank * 3) * 0.5 + 0.5;
        const v = (0.62 + grain * 0.22 + ((plank * 37) % 7) * 0.025 + n[i] * 0.15) * seam;
        img.data[i * 4] = Math.min(255, v * 225);
        img.data[i * 4 + 1] = Math.min(255, v * 205);
        img.data[i * 4 + 2] = Math.min(255, v * 185);
        img.data[i * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

/** Soft round sprite (particles, mist, glows). */
export function softDot() {
  return make("softDot", () => {
    const S = 64;
    const c = canvas(S);
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.4, "rgba(255,255,255,0.55)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    return toTexture(c, { repeat: false });
  });
}

/** Puffy cloud sprite. */
export function cloudTex() {
  return make("cloud", () => {
    const S = 256;
    const n = tileNoise(S, 4, 51, 5);
    const c = canvas(S);
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const dx = (x - S / 2) / (S / 2);
        const dy = (y - S * 0.58) / (S * 0.42);
        const r = Math.sqrt(dx * dx * 0.9 + dy * dy * 1.6);
        const a = Math.max(0, 1 - r) * (0.55 + n[i] * 0.9);
        const shade = 0.82 + (1 - (y / S)) * 0.18;
        img.data[i * 4] = 255 * shade;
        img.data[i * 4 + 1] = 255 * shade;
        img.data[i * 4 + 2] = 255 * Math.min(1, shade + 0.03);
        img.data[i * 4 + 3] = Math.max(0, Math.min(255, (a - 0.18) * 330));
      }
    }
    g.putImageData(img, 0, 0);
    return toTexture(c, { repeat: false });
  });
}

/** Grass blade cluster (alpha cutout), drawn as several tapering blades. */
export function bladeTex() {
  return make("blade", () => {
    const W = 128;
    const H = 128;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const rand = mulberry32(77);
    for (let i = 0; i < 16; i++) {
      const x = 10 + rand() * (W - 20);
      const h = H * (0.5 + rand() * 0.48);
      const lean = (rand() - 0.5) * 34;
      const w = 3 + rand() * 4;
      const grd = g.createLinearGradient(0, H, 0, H - h);
      const tone = 0.75 + rand() * 0.25;
      grd.addColorStop(0, `rgba(${(60 * tone) | 0},${(95 * tone) | 0},${(40 * tone) | 0},1)`);
      grd.addColorStop(1, `rgba(${(200 * tone) | 0},${(225 * tone) | 0},${(140 * tone) | 0},1)`);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(x - w, H);
      g.quadraticCurveTo(x + lean * 0.3, H - h * 0.6, x + lean, H - h);
      g.quadraticCurveTo(x + lean * 0.3 + w * 0.3, H - h * 0.6, x + w, H);
      g.closePath();
      g.fill();
    }
    return toTexture(c, { repeat: false });
  });
}

/** Water normal map (tileable ripples). */
export function waterNormal() {
  return make("waterNormal", () => {
    const S = 256;
    const n = tileNoise(S, 8, 61, 4);
    const c = canvas(S);
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const hx = n[y * S + ((x + 1) % S)] - n[y * S + ((x - 1 + S) % S)];
        const hy = n[((y + 1) % S) * S + x] - n[((y - 1 + S) % S) * S + x];
        img.data[i * 4] = 128 + hx * 700;
        img.data[i * 4 + 1] = 128 + hy * 700;
        img.data[i * 4 + 2] = 255;
        img.data[i * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return toTexture(c, { srgb: false });
  });
}

/** Falling-water streaks for waterfalls (scrolls along V). */
export function fallTex() {
  return make("fall", () => {
    const W = 128;
    const H = 256;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    const rand = mulberry32(88);
    g.fillStyle = "rgba(205,232,245,0.55)";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++) {
      const x = rand() * W;
      const w = 1 + rand() * 4;
      const y = rand() * H;
      const h = 40 + rand() * 160;
      const a = 0.25 + rand() * 0.6;
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.fillRect(x, y, w, h);
      g.fillRect(x, y - H, w, h);
    }
    return toTexture(c);
  });
}

/** The Mountain Badge emblem: a bronze medallion with a peak. */
export function badgeTex() {
  return make("badge", () => {
    const S = 128;
    const c = canvas(S);
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(S * 0.4, S * 0.35, 4, S / 2, S / 2, S / 2);
    gr.addColorStop(0, "#fff2b8");
    gr.addColorStop(0.55, "#e6b04a");
    gr.addColorStop(1, "#9a6420");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(90,50,10,0.7)";
    g.lineWidth = 5;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 10, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#5e3a12";
    g.beginPath();
    g.moveTo(S * 0.2, S * 0.7);
    g.lineTo(S * 0.42, S * 0.32);
    g.lineTo(S * 0.52, S * 0.48);
    g.lineTo(S * 0.62, S * 0.36);
    g.lineTo(S * 0.82, S * 0.7);
    g.closePath();
    g.fill();
    g.fillStyle = "#fffaf0";
    g.beginPath();
    g.moveTo(S * 0.36, S * 0.43);
    g.lineTo(S * 0.42, S * 0.32);
    g.lineTo(S * 0.48, S * 0.42);
    g.closePath();
    g.fill();
    return toTexture(c, { repeat: false });
  });
}

/** Trail-flag cloth with a mountain glyph. */
export function flagTex(color = "#d9452b") {
  return make(`flag${color}`, () => {
    const W = 128;
    const H = 80;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    g.fillStyle = color;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,0.15)";
    for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
    g.fillStyle = "#fff6e6";
    g.beginPath();
    g.moveTo(W * 0.22, H * 0.78);
    g.lineTo(W * 0.48, H * 0.22);
    g.lineTo(W * 0.6, H * 0.46);
    g.lineTo(W * 0.68, H * 0.34);
    g.lineTo(W * 0.86, H * 0.78);
    g.closePath();
    g.fill();
    return toTexture(c, { repeat: false });
  });
}

/** Painted trail-sign board with text. */
export function signTex(text, sub = "") {
  return make(`sign:${text}:${sub}`, () => {
    const W = 256;
    const H = 96;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    g.fillStyle = "#6b4426";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < H; y += 24) g.fillRect(0, y, W, 2);
    g.strokeStyle = "#3a2210";
    g.lineWidth = 6;
    g.strokeRect(3, 3, W - 6, H - 6);
    g.fillStyle = "#f3e2c0";
    g.font = "bold 30px Georgia, serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text.toUpperCase().slice(0, 18), W / 2, sub ? H * 0.4 : H / 2);
    if (sub) {
      g.font = "20px Georgia, serif";
      g.fillText(sub, W / 2, H * 0.74);
    }
    return toTexture(c, { repeat: false });
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose?.();
  cache.clear();
}
