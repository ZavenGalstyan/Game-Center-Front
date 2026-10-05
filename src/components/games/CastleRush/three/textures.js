/**
 * Castle Rush — procedural canvas textures (built once, cached).
 * Greyscale detail maps are multiplied with vertex colours so one texture
 * serves every kingdom palette.
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

/** cut-stone blocks with mortar lines (greyscale, tiles) */
export const stoneTexture = () =>
  once("stone", () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const r = rng(7);
    g.fillStyle = "#8a8a8a";
    g.fillRect(0, 0, S, S);
    const rows = 6;
    const rh = S / rows;
    for (let y = 0; y < rows; y++) {
      const off = y % 2 ? 0.5 : 0;
      const cols = 3;
      for (let x = -1; x <= cols; x++) {
        const bx = ((x + off) * S) / cols;
        const bw = S / cols;
        const l = 200 + Math.floor(r() * 40);
        g.fillStyle = `rgb(${l},${l},${l - 4})`;
        g.fillRect(bx + 3, y * rh + 3, bw - 6, rh - 6);
        // speckle + soft bevel
        for (let k = 0; k < 40; k++) {
          const v = 170 + Math.floor(r() * 70);
          g.fillStyle = `rgba(${v},${v},${v},0.35)`;
          g.fillRect(bx + 4 + r() * (bw - 10), y * rh + 4 + r() * (rh - 10), 2 + r() * 4, 2 + r() * 3);
        }
        g.fillStyle = "rgba(255,255,255,0.18)";
        g.fillRect(bx + 3, y * rh + 3, bw - 6, 3);
        g.fillStyle = "rgba(0,0,0,0.16)";
        g.fillRect(bx + 3, y * rh + rh - 6, bw - 6, 3);
      }
    }
    const t = tex(c);
    return t;
  });

/** soft noisy grass/sand/snow detail (greyscale) */
export const groundTexture = () =>
  once("ground", () => {
    const S = 256;
    const [c, g] = canvas(S, S);
    const r = rng(11);
    g.fillStyle = "#d8d8d8";
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) {
      const v = 170 + Math.floor(r() * 85);
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      const x = r() * S;
      const y = r() * S;
      g.fillRect(x, y, 1 + r() * 2, 2 + r() * 4);
    }
    for (let i = 0; i < 26; i++) {
      const v = 190 + Math.floor(r() * 60);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 30);
      grd.addColorStop(0, `rgba(${v},${v},${v},0.35)`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.save();
      g.translate(r() * S, r() * S);
      g.fillStyle = grd;
      g.fillRect(-30, -30, 60, 60);
      g.restore();
    }
    return tex(c);
  });

/**
 * The battle road: packed dirt with wheel ruts, pebbles and soft alpha
 * edges. Tiles along U (the lane); V spans the road width.
 */
export const roadTexture = () =>
  once("road", () => {
    const W = 512;
    const H = 128;
    const [c, g] = canvas(W, H);
    const r = rng(23);
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const v = y / (H - 1);
      const edge = Math.min(v, 1 - v);
      const a = Math.min(1, Math.max(0, (edge - 0.02) / 0.16));
      for (let x = 0; x < W; x++) {
        const n = (Math.sin(x * 0.07 + y * 0.03) + Math.sin(x * 0.013 - y * 0.11)) * 6;
        let l = 205 + n + (r() - 0.5) * 26;
        // wheel ruts
        const rut = Math.min(Math.abs(v - 0.34), Math.abs(v - 0.66));
        if (rut < 0.035) l -= 26 * (1 - rut / 0.035);
        const i = (y * W + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, l));
        img.data[i + 3] = Math.round(a * (0.85 + 0.15 * r()) * 255);
      }
    }
    g.putImageData(img, 0, 0);
    // pebbles
    for (let i = 0; i < 160; i++) {
      const x = r() * W;
      const y = H * (0.12 + r() * 0.76);
      const s = 1.5 + r() * 3;
      const l = 150 + Math.floor(r() * 80);
      g.fillStyle = `rgba(${l},${l},${l},0.9)`;
      g.beginPath();
      g.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    const t = tex(c);
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });

/** radial blob (shadows, dust, glow) — white with alpha falloff */
export const blobTexture = () =>
  once("blob", () => {
    const S = 64;
    const [c, g] = canvas(S, S);
    const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.5, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return tex(c, false, false);
  });

/** puffy smoke/dust sprite with a few lobes */
export const puffTexture = () =>
  once("puff", () => {
    const S = 128;
    const [c, g] = canvas(S, S);
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const x = S / 2 + (r() - 0.5) * S * 0.36;
      const y = S / 2 + (r() - 0.5) * S * 0.36;
      const rad = S * (0.16 + r() * 0.16);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, "rgba(255,255,255,0.55)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    }
    return tex(c, false, false);
  });

/** vertical sky gradient for the backdrop dome */
export function skyTexture(top, bottom, key) {
  return once(`sky${key}`, () => {
    const [c, g] = canvas(4, 256);
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, top);
    grd.addColorStop(0.62, bottom);
    grd.addColorStop(1, bottom);
    g.fillStyle = grd;
    g.fillRect(0, 0, 4, 256);
    const t = tex(c, false, true);
    return t;
  });
}

/** team banner emblem: crest on cloth (colour multiplies) */
export function emblemTexture(kind) {
  return once(`emblem${kind}`, () => {
    const W = 64;
    const H = 128;
    const [c, g] = canvas(W, H);
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, W, H);
    // swallow-tail bottom handled by geometry; trim stripes
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(0, 0, W, 8);
    g.fillStyle = kind === "player" ? "#ffd75a" : "#1b1b1f";
    if (kind === "player") {
      // a gold lion-ish shield crest: circle + star
      g.beginPath();
      g.arc(W / 2, 54, 18, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? 6 : 13;
        g.lineTo(W / 2 + Math.cos(a) * rr, 54 + Math.sin(a) * rr);
      }
      g.fill();
    } else {
      // a dark tower-and-fang crest
      g.beginPath();
      g.moveTo(W / 2, 30);
      g.lineTo(W / 2 + 18, 46);
      g.lineTo(W / 2 + 14, 78);
      g.lineTo(W / 2, 88);
      g.lineTo(W / 2 - 14, 78);
      g.lineTo(W / 2 - 18, 46);
      g.closePath();
      g.fill();
      g.fillStyle = "#e8c35a";
      g.beginPath();
      g.moveTo(W / 2 - 8, 50);
      g.lineTo(W / 2, 70);
      g.lineTo(W / 2 + 8, 50);
      g.closePath();
      g.fill();
    }
    g.fillStyle = kind === "player" ? "rgba(255,215,90,0.9)" : "rgba(232,195,90,0.85)";
    g.fillRect(6, 100, W - 12, 4);
    return tex(c, false, true);
  });
}
