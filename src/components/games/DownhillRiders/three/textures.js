/**
 * Downhill Riders — procedural canvas textures (cached, disposed on unmount).
 *
 *   trail    dirt / dust / snow / rock with tyre ruts and pebbles; U spans the
 *            width, V runs along the trail; the edges fade into the shoulder
 *   grain    tiling grey noise multiplied over the terrain vertex colours
 *   wood     planks for ramps, bridges and the start house
 *   banner   text banners (START, FINISH, signs); checker; arrow boards
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

/** The riding surface. colors: { base, dark, light }, edge: shoulder colour. */
export function trailTex(colors, edge, kind = "dirt") {
  return make(`trail:${colors.base}:${edge}:${kind}`, () => {
    const W = 256;
    const H = 512;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    grain(g, W, H, colors.base, kind === "snow" ? 0.12 : 0.3, 11, 2);
    const rand = mulberry32(23);
    // packed centre line + two tyre ruts
    g.fillStyle = colors.dark;
    g.globalAlpha = 0.35;
    for (const x of [0.36, 0.62]) {
      for (let y = 0; y < H; y += 2) {
        const wob = Math.sin(y * 0.031 + x * 9) * 5 + Math.sin(y * 0.083) * 2;
        g.fillRect(x * W + wob - 5, y, 10, 2);
      }
    }
    g.globalAlpha = 1;
    // pebbles / clods
    for (let i = 0; i < 420; i++) {
      const x = rand() * W;
      const y = rand() * H;
      const r = 0.8 + rand() * (kind === "rock" ? 4 : 2.4);
      g.fillStyle = rand() < 0.5 ? colors.light : colors.dark;
      g.globalAlpha = 0.35 + rand() * 0.4;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.6 + rand() * 0.4), rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    // soft edges into the shoulder colour
    const gr = g.createLinearGradient(0, 0, W, 0);
    gr.addColorStop(0, edge);
    gr.addColorStop(0.07, edge + "00");
    gr.addColorStop(0.93, edge + "00");
    gr.addColorStop(1, edge);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // ragged edge tufts
    for (let i = 0; i < 160; i++) {
      const side = rand() < 0.5;
      const x = side ? rand() * W * 0.1 : W - rand() * W * 0.1;
      g.fillStyle = edge;
      g.globalAlpha = 0.5 + rand() * 0.5;
      g.fillRect(x, rand() * H, 3 + rand() * 6, 2 + rand() * 5);
    }
    g.globalAlpha = 1;
    return tex(c);
  });
}

export function grainTex() {
  return make("grain", () => {
    const c = canvas(256);
    const g = c.getContext("2d");
    grain(g, 256, 256, "#d8d8d8", 0.5, 7, 3);
    const rand = mulberry32(8);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(0,0,0,${0.04 + rand() * 0.06})`;
      g.beginPath();
      g.ellipse(rand() * 256, rand() * 256, 6 + rand() * 22, 4 + rand() * 12, rand() * 3, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + rand() * 0.08})`;
      g.fillRect(rand() * 256, rand() * 256, 1, 3 + rand() * 4);
    }
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
      for (let k = 0; k < 6; k++) {
        g.strokeStyle = `rgba(60,34,12,${0.12 + rand() * 0.15})`;
        g.beginPath();
        const yy = y + 6 + rand() * 22;
        g.moveTo(0, yy);
        for (let x = 0; x <= 256; x += 16) g.lineTo(x, yy + Math.sin(x * 0.05 + k) * 2);
        g.stroke();
      }
      g.fillStyle = "rgba(30,20,10,0.7)";
      g.fillRect(20 + rand() * 30, y + 14, 4, 4);
      g.fillRect(200 + rand() * 30, y + 14, 4, 4);
    }
    return tex(c);
  });
}

export function barkTex() {
  return make("bark", () => {
    const c = canvas(64, 128);
    const g = c.getContext("2d");
    grain(g, 64, 128, "#6a4a30", 0.35, 41, 2);
    for (let x = 0; x < 64; x += 6) {
      g.fillStyle = "rgba(30,18,10,0.45)";
      g.fillRect(x + Math.random() * 2, 0, 2, 128);
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
    gr.addColorStop(0, "rgba(0,0,0,0.6)");
    gr.addColorStop(0.6, "rgba(0,0,0,0.3)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
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

/** Falling-water streaks (scrolls along V). */
export function waterfallTex(frozen = false) {
  return make(`falls:${frozen}`, () => {
    const c = canvas(128, 256);
    const g = c.getContext("2d");
    g.fillStyle = frozen ? "#cfeefa" : "#8fd3f0";
    g.fillRect(0, 0, 128, 256);
    const rand = mulberry32(frozen ? 77 : 78);
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.6})`;
      const x = rand() * 128;
      g.fillRect(x, rand() * 256, 1 + rand() * 3, 20 + rand() * 60);
    }
    if (frozen) {
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(120,180,210,${0.2 + rand() * 0.3})`;
        g.fillRect(rand() * 128, rand() * 256, 2, 30 + rand() * 50);
      }
    }
    return tex(c);
  });
}

export function waterTex(color) {
  return make(`water:${color}`, () => {
    const c = canvas(128);
    const g = c.getContext("2d");
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    const rand = mulberry32(91);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(255,255,255,${0.15 + rand() * 0.3})`;
      g.lineWidth = 1 + rand() * 1.5;
      const x = rand() * 128;
      const y = rand() * 128;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + 6, y - 3, x + 12 + rand() * 10, y);
      g.stroke();
    }
    return tex(c);
  });
}

/** A banner with text (start, finish, checkpoints, signs). */
export function bannerTex(text, bg = "#e8343a", fg = "#ffffff") {
  return make(`banner:${text}:${bg}:${fg}`, () => {
    const c = canvas(512, 96);
    const g = c.getContext("2d");
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fillRect(0, 0, 512, 8);
    g.fillRect(0, 88, 512, 8);
    g.fillStyle = fg;
    g.font = "900 54px 'Arial Black', Impact, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, 50);
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

export function disposeTextures() {
  for (const t of cache.values()) t.dispose?.();
  cache.clear();
}
