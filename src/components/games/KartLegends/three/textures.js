/**
 * Kart Legends — procedural canvas textures (cached, disposed on unmount).
 * The road texture tiles along the track (V) and spans the width (U):
 * asphalt grain, white edge lines, a dashed centre line.
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
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
const make = (k, fn) => {
  if (!cache.has(k)) cache.set(k, fn());
  return cache.get(k);
};

function grain(g, w, h, base, amt, seed, size = 2) {
  const rand = mulberry32(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / (size * size * 3); i++) {
    const v = rand();
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${amt * (v - 0.5)})` : `rgba(0,0,0,${amt * (0.5 - v)})`;
    g.fillRect(rand() * w, rand() * h, size, size);
  }
}

/** Asphalt with markings. style: "day" | "neon" | "sky". */
export function roadTex(style = "day", color = "#5b5f66") {
  return make(`road:${style}:${color}`, () => {
    const W = 256;
    const H = 512;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    grain(g, W, H, color, 0.22, 3);
    const line = style === "neon" ? "#3de0ff" : style === "sky" ? "#ffe9a8" : "#f4f4ee";
    g.fillStyle = line;
    g.fillRect(W * 0.035, 0, W * 0.022, H);
    g.fillRect(W * 0.943, 0, W * 0.022, H);
    // dashed centre
    g.fillStyle = style === "neon" ? "#ff3ca0" : style === "sky" ? "#ffffff" : "#f6d24a";
    for (let y = 0; y < H; y += 128) g.fillRect(W * 0.492, y + 16, W * 0.016, 72);
    // subtle tyre wear lanes
    g.fillStyle = "rgba(0,0,0,0.06)";
    g.fillRect(W * 0.22, 0, W * 0.12, H);
    g.fillRect(W * 0.66, 0, W * 0.12, H);
    return tex(c);
  });
}

export function curbTex(a = "#e8343a", b = "#ffffff") {
  return make(`curb:${a}${b}`, () => {
    const c = canvas(32, 128);
    const g = c.getContext("2d");
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect(0, i * 32, 32, 32);
    }
    return tex(c);
  });
}

export function groundTex(color, seed = 7) {
  return make(`ground:${color}:${seed}`, () => {
    const c = canvas(256);
    const g = c.getContext("2d");
    grain(g, 256, 256, color, 0.18, seed, 3);
    const rand = mulberry32(seed + 1);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(0,0,0,${0.03 + rand() * 0.04})`;
      g.beginPath();
      g.ellipse(rand() * 256, rand() * 256, 6 + rand() * 20, 4 + rand() * 12, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return tex(c);
  });
}

export function checkerTex() {
  return make("checker", () => {
    const c = canvas(128, 32);
    const g = c.getContext("2d");
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 4; y++) {
        g.fillStyle = (x + y) % 2 ? "#111" : "#fafafa";
        g.fillRect(x * 8, y * 8, 8, 8);
      }
    const t = tex(c, { repeat: false });
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

/** Chevrons for boost pads (scrolls along V). */
export function padTex() {
  return make("pad", () => {
    const c = canvas(128, 128);
    const g = c.getContext("2d");
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, "#ff8a1a");
    gr.addColorStop(1, "#ffd21f");
    g.fillStyle = "#331a00";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = gr;
    for (const y of [8, 72]) {
      g.beginPath();
      g.moveTo(14, y + 44);
      g.lineTo(64, y);
      g.lineTo(114, y + 44);
      g.lineTo(114, y + 60);
      g.lineTo(64, y + 18);
      g.lineTo(14, y + 60);
      g.closePath();
      g.fill();
    }
    return tex(c);
  });
}

export function softDot() {
  return make("dot", () => {
    const c = canvas(64);
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.5)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return tex(c, { repeat: false });
  });
}

export function cloudTex() {
  return make("cloud", () => {
    const c = canvas(256, 128);
    const g = c.getContext("2d");
    const rand = mulberry32(5);
    for (let i = 0; i < 26; i++) {
      const x = 40 + rand() * 176;
      const y = 60 + (rand() - 0.5) * 30;
      const r = 18 + rand() * 30;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return tex(c, { repeat: false });
  });
}

/** A banner with text (start gantry, signs). */
export function bannerTex(text, bg = "#e8343a", fg = "#ffffff") {
  return make(`banner:${text}:${bg}:${fg}`, () => {
    const c = canvas(512, 96);
    const g = c.getContext("2d");
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(0, 0, 512, 10);
    g.fillRect(0, 86, 512, 10);
    g.fillStyle = fg;
    g.font = "900 56px 'Arial Black', Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, 50);
    return tex(c, { repeat: false });
  });
}

/** Arrow sign (direction chevrons on corner boards). */
export function arrowTex(left, bg = "#1d1d24", fg = "#ffd21f") {
  return make(`arrow:${left}:${bg}:${fg}`, () => {
    const c = canvas(256, 96);
    const g = c.getContext("2d");
    g.fillStyle = bg;
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = fg;
    for (let i = 0; i < 3; i++) {
      const x = 40 + i * 70;
      g.beginPath();
      if (left) {
        g.moveTo(x + 40, 12);
        g.lineTo(x, 48);
        g.lineTo(x + 40, 84);
        g.lineTo(x + 58, 84);
        g.lineTo(x + 18, 48);
        g.lineTo(x + 58, 12);
      } else {
        g.moveTo(x, 12);
        g.lineTo(x + 40, 48);
        g.lineTo(x, 84);
        g.lineTo(x + 18, 84);
        g.lineTo(x + 58, 48);
        g.lineTo(x + 18, 12);
      }
      g.closePath();
      g.fill();
    }
    return tex(c, { repeat: false });
  });
}

/** Lit windows for neon buildings. */
export function windowsTex() {
  return make("windows", () => {
    const c = canvas(128, 256);
    const g = c.getContext("2d");
    const rand = mulberry32(19);
    g.fillStyle = "#14122a";
    g.fillRect(0, 0, 128, 256);
    for (let y = 6; y < 256; y += 14) {
      for (let x = 6; x < 128; x += 14) {
        const on = rand() < 0.45;
        g.fillStyle = on ? ["#ffd27a", "#9fe8ff", "#ff9ad8"][Math.floor(rand() * 3)] : "#22203a";
        g.fillRect(x, y, 8, 9);
      }
    }
    return tex(c);
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose?.();
  cache.clear();
}
