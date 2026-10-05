/**
 * Train Commander — procedural canvas textures (built once, cached).
 * Greyscale detail maps multiply with vertex colours so one texture serves
 * every region palette. Nothing is loaded from disk.
 */
import * as THREE from "three";
import { rng } from "./geo.js";

const cache = new Map();
const once = (key, make) => {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
};

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** soft grass / sand / snow detail: streaks, blotches (greyscale, tiles) */
export const groundTexture = () =>
  once("ground", () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const r = rng(11);
    g.fillStyle = "#dedede";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 30; i++) {
      const v = 185 + Math.floor(r() * 70);
      const x = r() * S;
      const y = r() * S;
      const rad = 18 + r() * 40;
      for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grd.addColorStop(0, `rgba(${v},${v},${v},0.45)`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 3200; i++) {
      const v = 160 + Math.floor(r() * 95);
      g.fillStyle = `rgba(${v},${v},${v},0.55)`;
      g.fillRect(r() * S, r() * S, 1 + r() * 1.5, 2 + r() * 4);
    }
    return tex(c);
  });

/** railway ballast: packed stones (greyscale) */
export const ballastTexture = () =>
  once("ballast", () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    const r = rng(3);
    g.fillStyle = "#9a9a9a";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 900; i++) {
      const l = 110 + Math.floor(r() * 130);
      g.fillStyle = `rgb(${l},${l},${l})`;
      const x = r() * S;
      const y = r() * S;
      const s = 1.5 + r() * 3.2;
      g.beginPath();
      g.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    return tex(c);
  });

/** radial blob (contact shadows, glows) — white with alpha falloff */
export const blobTexture = () =>
  once("blob", () => {
    const S = 64;
    const [c, g] = canvas(S, S);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.6)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return tex(c, false, false);
  });

/** puffy smoke/dust sprite */
export const puffTexture = () =>
  once("puff", () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    const r = rng(5);
    for (let i = 0; i < 10; i++) {
      const x = S / 2 + (r() - 0.5) * S * 0.36;
      const y = S / 2 + (r() - 0.5) * S * 0.36;
      const rad = S * (0.15 + r() * 0.17);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, "rgba(255,255,255,0.55)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    }
    return tex(c, false, false);
  });

/** hot flash: bright core, soft spikes */
export const flashTexture = () =>
  once("flash", () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.2, "rgba(255,240,200,0.9)");
    grd.addColorStop(0.5, "rgba(255,180,90,0.35)");
    grd.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = "rgba(255,230,180,0.5)";
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath();
      g.moveTo(S / 2, S / 2);
      g.lineTo(S / 2 + Math.cos(a) * S * 0.48, S / 2 + Math.sin(a) * S * 0.48);
      g.stroke();
    }
    return tex(c, false, false);
  });

/** ring for warning / impact / selection markers */
export const ringTexture = () =>
  once("ring", () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    g.strokeStyle = "rgba(255,255,255,1)";
    g.lineWidth = 9;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
    g.stroke();
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2 - 8);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.7, "rgba(255,255,255,0.08)");
    grd.addColorStop(1, "rgba(255,255,255,0.4)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
    g.fill();
    return tex(c, false, false);
  });

/** chevron arrow (warning direction on the ground) */
export const chevronTexture = () =>
  once("chev", () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    g.fillStyle = "#ffffff";
    for (let k = 0; k < 2; k++) {
      const y = 20 + k * 46;
      g.beginPath();
      g.moveTo(S / 2, y);
      g.lineTo(S - 14, y + 40);
      g.lineTo(S - 34, y + 40);
      g.lineTo(S / 2, y + 18);
      g.lineTo(34, y + 40);
      g.lineTo(14, y + 40);
      g.closePath();
      g.fill();
    }
    return tex(c, false, false);
  });

/** vertical sky gradient with a soft horizon glow */
export function skyTexture(top, mid, horizon, key) {
  return once(`sky${key}`, () => {
    const [c, g] = canvas(4, 512);
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, top);
    grd.addColorStop(0.42, mid);
    grd.addColorStop(0.5, horizon);
    grd.addColorStop(1, horizon);
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 512);
    return tex(c, false, true);
  });
}

/** team emblem (gear + wing chevron) for wagon/loco sides; colour = paint */
export function emblemTexture(accent = "#f5c84c", key = "a") {
  return once(`emblem${key}`, () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    g.translate(S / 2, S / 2);
    g.fillStyle = accent;
    // gear ring
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = i % 2 ? 46 : 54;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.globalCompositeOperation = "destination-out";
    g.beginPath();
    g.arc(0, 0, 36, 0, Math.PI * 2);
    g.fill();
    g.globalCompositeOperation = "source-over";
    // wing chevron + star
    g.beginPath();
    g.moveTo(-30, 6);
    g.lineTo(0, -20);
    g.lineTo(30, 6);
    g.lineTo(30, 18);
    g.lineTo(0, -6);
    g.lineTo(-30, 18);
    g.closePath();
    g.fill();
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? 4 : 10;
      g.lineTo(Math.cos(a) * rr, 20 + Math.sin(a) * rr);
    }
    g.fill();
    return tex(c, false, true);
  });
}

/** small text sign (station names) */
export function signTexture(text, bg = "#1d2b3a", fg = "#f6e7b0") {
  return once(`sign:${text}:${bg}`, () => {
    const W = 512;
    const H = 96;
    const [c, g] = canvas(W, H);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(8, 8, W - 16, H - 16);
    g.fillStyle = fg;
    g.font = "bold 44px Georgia, 'Times New Roman', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text.toUpperCase(), W / 2, H / 2 + 2, W - 40);
    return tex(c, false, true);
  });
}
