/**
 * Vice Streets 3D — procedural canvas textures (no image files).
 *
 *   facade(kind)   window grids for towers / hotels / shops / houses / warehouses,
 *                  with a matching emissive "lit windows" map for night
 *   signs          a text atlas of every shop / landmark sign (neon at night)
 *   awning         striped canvas for shop awnings
 *   noise          subtle grain for asphalt, sand and grass
 * Wall colour comes from vertex colours; the textures are mostly white/grey so
 * they tint correctly.
 */
import * as THREE from "three";
import { rng } from "../engine/util.js";

const CACHE = new Map();
const canvas = (w, h) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
function tex(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** one tile = one window bay (4 m wide × 3.6 m tall floor) */
export function facade(kind) {
  const key = `facade:${kind}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const R = rng(kind.length * 97 + 13);
  const S = 128;
  const c = canvas(S, S);
  const e = canvas(S, S);
  const g = c.getContext("2d");
  const ge = e.getContext("2d");
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, S, S);
  ge.fillStyle = "#000";
  ge.fillRect(0, 0, S, S);
  // one window per tile; the emissive map is drawn in 4 × 4 tiles with random lit windows
  const win = (x, y, w, h, glass, frame) => {
    g.fillStyle = frame;
    g.fillRect(x - 3, y - 3, w + 6, h + 6);
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, glass[0]);
    gr.addColorStop(1, glass[1]);
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    g.fillStyle = "rgba(255,255,255,0.25)";
    g.fillRect(x + 3, y + 3, w * 0.25, h - 6);
  };
  if (kind === "tower") {
    g.fillStyle = "#d9dde2";
    g.fillRect(0, 0, S, S);
    win(10, 14, 108, 92, ["#4c6d8f", "#a6c4de"], "#8a9099");
  } else if (kind === "hotel") {
    win(22, 18, 84, 70, ["#3f6a8c", "#9fc2db"], "#ffffff");
    // balcony rail
    g.fillStyle = "#f4f4f4";
    g.fillRect(14, 92, 100, 10);
    g.fillStyle = "rgba(0,0,0,0.25)";
    for (let x = 18; x < 112; x += 8) g.fillRect(x, 102, 2, 14);
    g.fillStyle = "#e9e9e9";
    g.fillRect(14, 114, 100, 4);
  } else if (kind === "shop") {
    win(8, 22, 112, 84, ["#2f4f66", "#7fa7c2"], "#3a3a3a");
  } else if (kind === "house") {
    win(36, 26, 56, 60, ["#4b6c87", "#a9c7dc"], "#ffffff");
    g.fillStyle = "#6a8caf";
    g.fillRect(22, 24, 12, 64);
    g.fillRect(94, 24, 12, 64);
  } else if (kind === "warehouse") {
    for (let x = 0; x < S; x += 8) {
      g.fillStyle = x % 16 ? "#e8e8e8" : "#cfcfcf";
      g.fillRect(x, 0, 8, S);
    }
    g.fillStyle = "#3a4650";
    g.fillRect(20, 10, 88, 16);
  } else if (kind === "glass") {
    g.fillStyle = "#9ab7cf";
    g.fillRect(0, 0, S, S);
    g.fillStyle = "#6f8aa0";
    g.fillRect(0, 0, S, 4);
    g.fillRect(0, 0, 4, S);
  }
  // emissive: same layout, lit or dark at random per tile (so 4×4 variety)
  const E = canvas(S * 4, S * 4);
  const gE = E.getContext("2d");
  gE.fillStyle = "#000";
  gE.fillRect(0, 0, S * 4, S * 4);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      if (R() < (kind === "warehouse" ? 0.15 : 0.45)) {
        const warm = R() < 0.7;
        gE.fillStyle = warm ? "#ffcf7a" : "#b8d8ff";
        const [x, y, w, h] = kind === "tower" ? [10, 14, 108, 92] : kind === "hotel" ? [22, 18, 84, 70] : kind === "shop" ? [8, 22, 112, 84] : kind === "house" ? [36, 26, 56, 60] : [20, 10, 88, 16];
        gE.globalAlpha = 0.55 + R() * 0.45;
        gE.fillRect(i * S + x, j * S + y, w, h);
        gE.globalAlpha = 1;
      }
    }
  }
  // the colour map tiled 4×4 too, so UVs match
  const C4 = canvas(S * 4, S * 4);
  const g4 = C4.getContext("2d");
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) g4.drawImage(c, i * S, j * S);
  void e;
  void ge;
  const out = { map: tex(C4), emissive: tex(E), tile: 4 };
  CACHE.set(key, out);
  return out;
}

/** sign atlas: one row per label */
export const SIGN_LABELS = [
  "FLAMINGO GRAND", "ROSA'S CAFÉ", "TIDE & THREAD", "CORAL PALMS", "SUNNY POST", "MARINA GRILL",
  "SUNRISE MOTORS", "METRO CAB", "POLICE", "ST. MARISOL", "GARAGE", "BODEGA LUZ",
  "HARDWARE", "MANGO BAKERY", "PHARMACY", "VANE TOWER", "PIER 9", "CUSTOMS", "HARBOR FREIGHT",
  "HOTEL", "SURF SHOP", "PIZZA", "TACOS", "GELATO", "BAR", "MOTEL", "CLUB NEON", "JUICE",
];
export function signAtlas() {
  if (CACHE.has("signs")) return CACHE.get("signs");
  const W = 512;
  const RH = 48;
  const c = canvas(W, RH * SIGN_LABELS.length);
  const g = c.getContext("2d");
  g.fillStyle = "#101014";
  g.fillRect(0, 0, c.width, c.height);
  const colors = ["#ff4fa0", "#3fffd8", "#ffd23f", "#7dd3ff", "#ff7a3d", "#b18cff"];
  SIGN_LABELS.forEach((label, i) => {
    g.fillStyle = "#16161c";
    g.fillRect(2, i * RH + 2, W - 4, RH - 4);
    g.font = "bold 30px Arial";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = colors[i % colors.length];
    g.shadowBlur = 10;
    g.fillStyle = colors[i % colors.length];
    g.fillText(label, W / 2, i * RH + RH / 2 + 1);
    g.shadowBlur = 0;
  });
  const t = tex(c, { repeat: false });
  const out = { map: t, rows: SIGN_LABELS.length, index: (label) => Math.max(0, SIGN_LABELS.indexOf(label)) };
  CACHE.set("signs", out);
  return out;
}

export function awning() {
  if (CACHE.has("awning")) return CACHE.get("awning");
  const c = canvas(64, 16);
  const g = c.getContext("2d");
  for (let x = 0; x < 64; x += 16) {
    g.fillStyle = "#ffffff";
    g.fillRect(x, 0, 8, 16);
    g.fillStyle = "#bdbdbd";
    g.fillRect(x + 8, 0, 8, 16);
  }
  const t = tex(c);
  CACHE.set("awning", t);
  return t;
}

export function noise(base = "#808080", amount = 18, size = 128, seed = 1) {
  const key = `noise:${base}:${amount}:${seed}`;
  if (CACHE.has(key)) return CACHE.get(key);
  const R = rng(seed);
  const c = canvas(size, size);
  const g = c.getContext("2d");
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const d = (R() - 0.5) * amount;
    img.data[i] += d;
    img.data[i + 1] += d;
    img.data[i + 2] += d;
  }
  g.putImageData(img, 0, 0);
  const t = tex(c);
  CACHE.set(key, t);
  return t;
}

/** chain-link fence */
export function chainLink() {
  if (CACHE.has("chain")) return CACHE.get("chain");
  const c = canvas(64, 64);
  const g = c.getContext("2d");
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = "rgba(200,205,210,0.95)";
  g.lineWidth = 2;
  for (let k = -64; k < 128; k += 12) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 64, 64);
    g.stroke();
    g.beginPath();
    g.moveTo(k + 64, 0);
    g.lineTo(k, 64);
    g.stroke();
  }
  const t = tex(c);
  CACHE.set("chain", t);
  return t;
}

export function disposeTextures() {
  for (const v of CACHE.values()) {
    if (v.isTexture) v.dispose();
    else {
      v.map?.dispose?.();
      v.emissive?.dispose?.();
    }
  }
  CACHE.clear();
}
