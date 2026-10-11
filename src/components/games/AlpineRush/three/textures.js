/**
 * Alpine Rush — procedural canvas textures (cached, disposed on unmount).
 *
 *   piste    groomed corduroy snow: fine lines along the slope, faint ski
 *            tracks, sparkle; U spans the width, V runs down the slope
 *   grain    tiling snow noise multiplied over the terrain vertex colours
 *   net      orange safety netting (alpha)
 *   wood     planks for the start house, bridges, cabins
 *   banner   text banners; checker (finish); arrow boards; ski graphics
 */
import * as THREE from "three";
import { mulberry32 } from "../engine/rng.js";

const cache = new Map();
// anisotropic filtering is the single most expensive part of shading the snow
// (8× sampled the slope texture 8 times per pixel); scaled with Graphics Quality
let aniso = 2;
export function setTextureQuality(q) {
  const a = q === "high" ? 8 : q === "low" ? 1 : 2;
  if (a === aniso) return;
  aniso = a;
  for (const t of cache.values()) {
    if (t.isTexture && t.anisotropy !== a) {
      t.anisotropy = a;
      t.needsUpdate = true;
    }
  }
}
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
  t.anisotropy = aniso;
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
    g.fillStyle = v > 0.5 ? `rgba(255,255,255,${amt * (v - 0.5)})` : `rgba(40,60,90,${amt * (0.5 - v)})`;
    g.fillRect(rand() * w, rand() * h, size, size);
  }
}

/** Groomed piste. colors: { base, line, edge }. */
export function pisteTex(colors) {
  return make(`piste:${colors.base}:${colors.line}`, () => {
    const W = 256;
    const H = 512;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    grain(g, W, H, colors.base, 0.12, 11, 2);
    const rand = mulberry32(23);
    // corduroy: fine grooves running down the slope
    for (let x = 0; x < W; x += 4) {
      g.fillStyle = x % 8 === 0 ? "rgba(120,150,190,0.10)" : "rgba(255,255,255,0.12)";
      g.fillRect(x, 0, 2, H);
    }
    // groomer passes (wide faint bands)
    g.fillStyle = colors.line;
    g.globalAlpha = 0.35;
    for (const x of [0.25, 0.5, 0.75]) g.fillRect(x * W - 1, 0, 2, H);
    g.globalAlpha = 1;
    // faint ski tracks (S-curves)
    g.strokeStyle = "rgba(110,140,180,0.16)";
    g.lineWidth = 1.5;
    for (let k = 0; k < 6; k++) {
      const x0 = 30 + rand() * (W - 60);
      const amp = 15 + rand() * 30;
      const f = 0.01 + rand() * 0.012;
      for (const off of [0, 5]) {
        g.beginPath();
        for (let y = 0; y <= H; y += 6) {
          const x = x0 + off + Math.sin(y * f + k) * amp;
          if (y === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    // sparkle
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(255,255,255,${0.5 + rand() * 0.5})`;
      g.fillRect(rand() * W, rand() * H, 1, 1);
    }
    // soft edge into powder
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, colors.edge);
    gr.addColorStop(0.06, colors.edge + "00");
    gr.addColorStop(0.94, colors.edge + "00");
    gr.addColorStop(1, colors.edge);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    return tex(c);
  });
}

export function grainTex() {
  return make("grain", () => {
    const c = canvas(256);
    const g = c.getContext("2d");
    grain(g, 256, 256, "#e8e8e8", 0.35, 7, 3);
    const rand = mulberry32(8);
    // wind-blown drift ripples
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(80,110,150,${0.03 + rand() * 0.05})`;
      g.beginPath();
      g.ellipse(rand() * 256, rand() * 256, 10 + rand() * 30, 2 + rand() * 5, 0.3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.3})`;
      g.fillRect(rand() * 256, rand() * 256, 1, 1);
    }
    return tex(c);
  });
}

/** Ice sheen (alpha-ish streaks on blue). */
export function iceTex() {
  return make("ice", () => {
    const c = canvas(128, 256);
    const g = c.getContext("2d");
    g.fillStyle = "#bfe6fb";
    g.fillRect(0, 0, 128, 256);
    const rand = mulberry32(44);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.2 + rand() * 0.5})`;
      g.lineWidth = 1 + rand() * 2;
      const x = rand() * 128;
      const y = rand() * 256;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 30, y + 20 + rand() * 50);
      g.stroke();
    }
    return tex(c);
  });
}

export function netTex() {
  return make("net", () => {
    const c = canvas(64, 64);
    const g = c.getContext("2d");
    g.clearRect(0, 0, 64, 64);
    g.strokeStyle = "rgba(255,110,20,0.95)";
    g.lineWidth = 3;
    for (let i = -64; i < 128; i += 16) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 64, 64);
      g.stroke();
      g.beginPath();
      g.moveTo(i + 64, 0);
      g.lineTo(i, 64);
      g.stroke();
    }
    g.fillStyle = "rgba(255,90,10,1)";
    g.fillRect(0, 0, 64, 5);
    return tex(c);
  });
}

export function woodTex(tint = "#a8743f") {
  return make(`wood:${tint}`, () => {
    const c = canvas(256);
    const g = c.getContext("2d");
    grain(g, 256, 256, tint, 0.25, 31, 2);
    const rand = mulberry32(32);
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = "rgba(40,22,8,0.55)";
      g.fillRect(0, y, 256, 3);
      g.fillStyle = "rgba(255,230,190,0.12)";
      g.fillRect(0, y + 3, 256, 2);
      for (let k = 0; k < 5; k++) {
        g.strokeStyle = `rgba(60,34,12,${0.12 + rand() * 0.15})`;
        g.beginPath();
        const yy = y + 6 + rand() * 22;
        g.moveTo(0, yy);
        for (let x = 0; x <= 256; x += 16) g.lineTo(x, yy + Math.sin(x * 0.05 + k) * 2);
        g.stroke();
      }
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

export function shadowTex() {
  return make("shadow", () => {
    const c = canvas(64);
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(20,40,80,0.55)");
    gr.addColorStop(0.6, "rgba(20,40,80,0.25)");
    gr.addColorStop(1, "rgba(20,40,80,0)");
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

/** A banner with text (start, finish, sponsors, signs). */
export function bannerTex(text, bg = "#1f6fff", fg = "#ffffff") {
  return make(`banner:${text}:${bg}:${fg}`, () => {
    const c = canvas(512, 96);
    const g = c.getContext("2d");
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(0, 0, 512, 8);
    g.fillRect(0, 88, 512, 8);
    g.fillStyle = fg;
    g.font = "900 52px 'Arial Black', Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, 50, 490);
    return tex(c, { repeat: false });
  });
}

/** Gate panel: a coloured flag with the gate number. */
export function gatePanelTex(color, n) {
  return make(`gate:${color}:${n}`, () => {
    const c = canvas(128, 96);
    const g = c.getContext("2d");
    g.fillStyle = color === "red" ? "#e8283a" : "#1f5fff";
    g.fillRect(0, 0, 128, 96);
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.fillRect(0, 0, 128, 10);
    g.fillRect(0, 86, 128, 10);
    g.fillStyle = "#ffffff";
    g.font = "900 54px 'Arial Black', Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(n), 64, 51);
    return tex(c, { repeat: false });
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
    const t = tex(c, { repeat: true });
    t.magFilter = THREE.NearestFilter;
    return t;
  });
}

/** Chevron board warning of a bend. */
export function arrowTex(left, bg = "#1d2a4a", fg = "#ffd21f") {
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

/** Ski top graphic: colours + design (stripe / chevron / flame / dots / plain). */
export function skiTex(colors, design) {
  return make(`ski:${colors.base}:${colors.accent}:${colors.tip}:${design}`, () => {
    const c = canvas(32, 256);
    const g = c.getContext("2d");
    g.fillStyle = colors.base;
    g.fillRect(0, 0, 32, 256);
    g.fillStyle = colors.accent;
    if (design === "stripe") {
      g.fillRect(12, 20, 8, 216);
      g.fillRect(4, 120, 24, 6);
    } else if (design === "chevron") {
      for (let y = 30; y < 230; y += 26) {
        g.beginPath();
        g.moveTo(2, y + 12);
        g.lineTo(16, y);
        g.lineTo(30, y + 12);
        g.lineTo(30, y + 20);
        g.lineTo(16, y + 8);
        g.lineTo(2, y + 20);
        g.closePath();
        g.fill();
      }
    } else if (design === "flame") {
      for (let k = 0; k < 5; k++) {
        g.beginPath();
        const x = 3 + k * 6.5;
        g.moveTo(x - 3, 230);
        g.quadraticCurveTo(x + 4, 170 - (k % 2) * 40, x, 90 + k * 12);
        g.quadraticCurveTo(x + 6, 160, x + 4, 230);
        g.closePath();
        g.fill();
      }
    } else if (design === "dots") {
      for (let y = 24; y < 236; y += 14) for (let x = 6 + ((y / 14) % 2) * 6; x < 30; x += 12) g.fillRect(x - 2, y - 2, 5, 5);
    }
    // tip + tail
    g.fillStyle = colors.tip;
    g.fillRect(0, 0, 32, 16);
    g.fillRect(0, 244, 32, 12);
    return tex(c, { repeat: false });
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose?.();
  cache.clear();
}
