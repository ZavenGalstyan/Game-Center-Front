/**
 * Procedural canvas textures (no image files): fabric weave normal map, stone
 * tiles, concrete, brick, painted wood, city windows, emblem, soft sprites.
 * Each generator is memoised — arenas / rigs share the same GPU textures.
 */
import * as THREE from "three";

const cache = new Map();
function memo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}
function canvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
/** Deterministic value noise in [0,1). */
function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function smoothNoise(x, y, s) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s = 1, oct = 4) {
  let v = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += smoothNoise(x * f, y * f, s + i * 17) * amp;
    f *= 2;
    amp *= 0.5;
  }
  return v;
}
function tex(c, { repeat = 1, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
/** Height field (Float32 W×H) → tangent-space normal map canvas. */
function normalFromHeight(hf, W, H, strength = 2) {
  const c = canvas(W, H);
  const g = c.getContext("2d");
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const l = hf[y * W + ((x - 1 + W) % W)];
      const r = hf[y * W + ((x + 1) % W)];
      const u = hf[((y - 1 + H) % H) * W + x];
      const d = hf[((y + 1) % H) * W + x];
      let nx = (l - r) * strength;
      let ny = (u - d) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * W + x) * 4;
      img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

/* ---------------------------------------------------------------- fabric */
export const fabricNormal = () =>
  memo("fabricN", () => {
    const W = 128;
    const hf = new Float32Array(W * W);
    for (let y = 0; y < W; y++)
      for (let x = 0; x < W; x++) {
        // plain weave: alternating over/under threads + fibre noise
        const tx = Math.sin((x / W) * Math.PI * 32);
        const ty = Math.sin((y / W) * Math.PI * 32);
        const over = (Math.floor((x / W) * 16) + Math.floor((y / W) * 16)) % 2 ? tx : ty;
        hf[y * W + x] = over * 0.5 + fbm(x / 6, y / 6, 3, 2) * 0.6;
      }
    return tex(normalFromHeight(hf, W, W, 1.6), { repeat: 1, srgb: false });
  });

/* ---------------------------------------------------------------- stone tiles */
export function stoneTiles(key = "stone", { base = [150, 138, 120], tiles = 4, size = 512, mortar = [70, 62, 54] } = {}) {
  return memo(key, () => {
    const S = size;
    const c = canvas(S);
    const g = c.getContext("2d");
    const rc = canvas(S);
    const rg = rc.getContext("2d");
    const HW = S / 4;
    const hf = new Float32Array(HW * HW);
    const img = g.createImageData(S, S);
    const rimg = rg.createImageData(S, S);
    const ts = S / tiles;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const row = Math.floor(y / ts);
        const off = row % 2 ? ts / 2 : 0;
        const tx = Math.floor((x + off) / ts);
        const lx = (x + off) % ts;
        const ly = y % ts;
        const edge = Math.min(lx, ts - lx, ly, ts - ly);
        const tint = hash(tx, row, 5) * 0.22 - 0.11;
        const n = fbm(x / 40, y / 40, 9, 5);
        const fine = fbm(x / 6, y / 6, 2, 2);
        const groove = edge < 5 ? 1 : edge < 9 ? (9 - edge) / 4 : 0;
        const stain = Math.max(0, fbm(x / 160, y / 160, 13, 3) - 0.55) * 1.6;
        const k = (1 + tint) * (0.78 + n * 0.32 + fine * 0.08) * (1 - stain * 0.35);
        const i = (y * S + x) * 4;
        const col = groove > 0 ? mortar.map((m, j) => m * (0.85 + fine * 0.3) * (1 - groove * 0.2) + base[j] * k * (1 - groove) * 0.0) : base.map((b) => b * k);
        img.data[i] = Math.min(255, col[0]);
        img.data[i + 1] = Math.min(255, col[1]);
        img.data[i + 2] = Math.min(255, col[2]);
        img.data[i + 3] = 255;
        const rough = groove > 0 ? 250 : 170 + n * 60 - stain * 40;
        rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough;
        rimg.data[i + 3] = 255;
        if (x % 4 === 0 && y % 4 === 0) hf[(y / 4) * HW + x / 4] = (groove > 0 ? -groove * 1.2 : 0) + n * 0.8 + fine * 0.3;
      }
    g.putImageData(img, 0, 0);
    rg.putImageData(rimg, 0, 0);
    return { map: tex(c), roughnessMap: tex(rc, { srgb: false }), normalMap: tex(normalFromHeight(hf, HW, HW, 3), { srgb: false }) };
  });
}

/* ---------------------------------------------------------------- concrete */
export function concrete(key = "concrete", { base = [118, 120, 124], size = 512, cracks = true, paint = null } = {}) {
  return memo(key, () => {
    const S = size;
    const c = canvas(S);
    const g = c.getContext("2d");
    const rc = canvas(S);
    const rg = rc.getContext("2d");
    const img = g.createImageData(S, S);
    const rimg = rg.createImageData(S, S);
    const HW = S / 4;
    const hf = new Float32Array(HW * HW);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const n = fbm(x / 90, y / 90, 21, 5);
        const fine = fbm(x / 3, y / 3, 4, 2);
        const blot = fbm(x / 220, y / 220, 31, 3);
        const k = 0.72 + n * 0.38 + fine * 0.12 - Math.max(0, blot - 0.5) * 0.5;
        const i = (y * S + x) * 4;
        img.data[i] = base[0] * k;
        img.data[i + 1] = base[1] * k;
        img.data[i + 2] = base[2] * k;
        img.data[i + 3] = 255;
        // wet patches are glossier
        const wet = Math.max(0, blot - 0.52) * 3;
        const r = 205 - n * 40 - wet * 120;
        rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.max(30, r);
        rimg.data[i + 3] = 255;
        if (x % 4 === 0 && y % 4 === 0) hf[(y / 4) * HW + x / 4] = n * 0.7 + fine * 0.4;
      }
    g.putImageData(img, 0, 0);
    rg.putImageData(rimg, 0, 0);
    if (cracks) {
      g.strokeStyle = "rgba(20,20,22,0.55)";
      g.lineWidth = 1.4;
      for (let k = 0; k < 14; k++) {
        let x = hash(k, 1, 77) * S;
        let y = hash(k, 2, 77) * S;
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 14; j++) {
          x += (hash(k, j, 78) - 0.5) * 60;
          y += (hash(k, j, 79) - 0.5) * 60;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    paint?.(g, S);
    return { map: tex(c), roughnessMap: tex(rc, { srgb: false }), normalMap: tex(normalFromHeight(hf, HW, HW, 2), { srgb: false }) };
  });
}

/* ---------------------------------------------------------------- brick */
export const brick = () =>
  memo("brick", () => {
    const S = 512;
    const c = canvas(S);
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    const bw = 64;
    const bh = 28;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const row = Math.floor(y / bh);
        const off = row % 2 ? bw / 2 : 0;
        const bx = Math.floor((x + off) / bw);
        const lx = (x + off) % bw;
        const ly = y % bh;
        const mortar = lx < 3 || ly < 3;
        const t = hash(bx, row, 3);
        const n = fbm(x / 10, y / 10, 6, 3);
        const i = (y * S + x) * 4;
        if (mortar) {
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 52 + n * 30;
        } else {
          img.data[i] = (96 + t * 50) * (0.7 + n * 0.5);
          img.data[i + 1] = (42 + t * 20) * (0.7 + n * 0.5);
          img.data[i + 2] = (34 + t * 14) * (0.7 + n * 0.5);
        }
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return tex(c);
  });

/* ---------------------------------------------------------------- wood */
export const darkWood = () =>
  memo("wood", () => {
    const S = 512;
    const c = canvas(S);
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const plank = Math.floor(x / 64);
        const grain = Math.sin((y / S) * 40 + fbm(x / 20, y / 120, plank, 3) * 8) * 0.5 + 0.5;
        const k = 0.6 + grain * 0.25 + hash(plank, 0, 8) * 0.2;
        const seam = x % 64 < 2 ? 0.4 : 1;
        const i = (y * S + x) * 4;
        img.data[i] = 120 * k * seam;
        img.data[i + 1] = 66 * k * seam;
        img.data[i + 2] = 36 * k * seam;
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return tex(c);
  });

/* ---------------------------------------------------------------- city windows */
export const windows = () =>
  memo("windows", () => {
    const S = 256;
    const c = canvas(S);
    const g = c.getContext("2d");
    g.fillStyle = "#07090f";
    g.fillRect(0, 0, S, S);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 16; x++) {
        const r = hash(x, y, 41);
        if (r < 0.42) continue;
        const warm = hash(x, y, 42) < 0.7;
        const a = 0.35 + hash(x, y, 43) * 0.65;
        g.fillStyle = warm ? `rgba(255,${190 + r * 40},${110 + r * 60},${a})` : `rgba(150,200,255,${a})`;
        g.fillRect(x * 16 + 3, y * 8 + 2, 10, 5);
      }
    return tex(c);
  });

/* ---------------------------------------------------------------- sprites */
export const softDot = () =>
  memo("softDot", () => {
    const S = 128;
    const c = canvas(S);
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(255,255,255,0.8)");
    gr.addColorStop(0.6, "rgba(255,255,255,0.18)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, S, S);
    return tex(c, { srgb: false });
  });

export const starBurst = () =>
  memo("starBurst", () => {
    const S = 256;
    const c = canvas(S);
    const g = c.getContext("2d");
    g.translate(S / 2, S / 2);
    for (let k = 0; k < 12; k++) {
      g.rotate((Math.PI * 2) / 12 + hash(k, 0, 5) * 0.2);
      const len = S * (0.28 + hash(k, 1, 5) * 0.2);
      const gr = g.createLinearGradient(0, 0, len, 0);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(len, 0);
      g.lineTo(0, 6);
      g.fill();
    }
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, S * 0.22);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(-S / 2, -S / 2, S, S);
    return tex(c, { srgb: false });
  });

export const smoke = () =>
  memo("smoke", () => {
    const S = 128;
    const c = canvas(S);
    const g = c.getContext("2d");
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
        const n = fbm(x / 14, y / 14, 12, 4);
        const a = Math.max(0, 1 - d) ** 1.5 * (0.4 + n * 0.9);
        const i = (y * S + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.min(255, a * 255);
      }
    g.putImageData(img, 0, 0);
    return tex(c, { srgb: false });
  });

/** A text / emblem decal (signs, logos) on a transparent canvas. */
export function emblem(key, draw, w = 512, h = 512) {
  return memo(key, () => {
    const c = canvas(w, h);
    draw(c.getContext("2d"), w, h);
    return tex(c);
  });
}

/** Vertical gradient for sky domes / backdrops (array of [stop, css colour]). */
export function gradient(key, stops, h = 256) {
  return memo(key, () => {
    const c = canvas(4, h);
    const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, h);
    for (const [s, col] of stops) gr.addColorStop(s, col);
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, h);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function disposeTextures() {
  for (const v of cache.values()) {
    if (v?.isTexture) v.dispose();
    else if (v && typeof v === "object") for (const t of Object.values(v)) t?.isTexture && t.dispose();
  }
  cache.clear();
}
