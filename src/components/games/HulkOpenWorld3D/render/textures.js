/**
 * Hulk: Open World 3D — procedural canvas textures (no image files).
 *
 *  facade(skin)   window-grid facade tile per building skin (world-UV'd:
 *                 FACADE[skin].w × .h metres per tile) + lit-window emissive map
 *  roofTex()      gravel / membrane roof   gableTex()  roof shingles
 *  detailTex()    neutral grain multiplied over the ground (breaks up flat colour)
 *  groundMap(C)   the whole city plan painted once: asphalt, sidewalks, lawns,
 *                 plazas, yards, parade grounds, river banks, dirt fields
 *  containerTex() corrugated steel · billboardTex(i) fictional ads
 */
import * as THREE from "three";
import { PITCH, N, ROAD_HW, LOT, RIVER, BRIDGES, SIZE, blockDistrict } from "../engine/city.js";

const cache = new Map();
function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color("#ffffff"), k);
  else c.lerp(new THREE.Color("#000000"), -k);
  return `#${c.getHexString()}`;
}

/* metres per facade tile */
export const FACADE = {
  glass: { w: 12, h: 12, wall: "#86a9c4", frame: "#dfe6ec", win: ["#3a6386", "#5b8bb0", "#2c5374"], cols: 4, floors: 3, curtain: true },
  glassB: { w: 12, h: 12, wall: "#4f7c78", frame: "#1d2b2f", win: ["#2a5550", "#3b6e68", "#1d4440"], cols: 4, floors: 3, curtain: true },
  dark: { w: 12, h: 12, wall: "#2c303d", frame: "#474c5e", win: ["#1a2232", "#28334c", "#141a26"], cols: 4, floors: 3, curtain: true },
  concrete: { w: 12, h: 12, wall: "#c9c2b5", frame: "#a59e92", win: ["#3b4a58", "#52687a", "#2d3944"], cols: 4, floors: 3, band: "#b3ab9e" },
  brick: { w: 12, h: 12, wall: "#9b5a42", frame: "#e6dccb", win: ["#2f3a46", "#45576a", "#26303a"], cols: 4, floors: 3, brick: true },
  stucco: { w: 9, h: 6, wall: "#efe2c8", frame: "#ffffff", win: ["#4c7c94", "#6a9ab2", "#3a6074"], cols: 3, floors: 2, shutters: true },
  wood: { w: 9, h: 6, wall: "#b8a184", frame: "#f4efe6", win: ["#3e5a6c", "#557386", "#2f4655"], cols: 3, floors: 2, siding: true },
  civic: { w: 12, h: 16, wall: "#e4dccb", frame: "#f6f1e6", win: ["#3b4a58", "#52687a", "#2d3944"], cols: 4, floors: 3, columns: true },
  warehouse: { w: 16, h: 12, wall: "#b8b2a2", frame: "#8d8676", win: ["#5c6a72", "#6e7c84", "#4c5860"], cols: 2, floors: 1, ribs: true, sparse: true },
  metal: { w: 16, h: 12, wall: "#8a949e", frame: "#5e666e", win: ["#38444f", "#4f6070", "#2a333c"], cols: 4, floors: 2, ribs: true, sparse: true },
  military: { w: 14, h: 12, wall: "#6b7253", frame: "#4b5039", win: ["#2a3020", "#353d29", "#222819"], cols: 3, floors: 2, sparse: true, ribs: true },
  bunker: { w: 8, h: 4, wall: "#8d8c80", frame: "#6c6b62", win: ["#1e1e1e", "#262626", "#161616"], cols: 2, floors: 1, slit: true },
  barracks: { w: 8, h: 4.5, wall: "#7a7f5c", frame: "#5d6146", win: ["#33402e", "#3c4a35", "#2a3626"], cols: 2, floors: 1 },
  barn: { w: 10, h: 7, wall: "#8f2f24", frame: "#efe6d6", win: ["#2b2018", "#35281e", "#221912"], cols: 2, floors: 1, siding: true },
};
export const SKINS = Object.keys(FACADE);

export function facade(skin) {
  const key = `facade:${skin}`;
  if (cache.has(key)) return cache.get(key);
  const S = FACADE[skin] || FACADE.concrete;
  const W = 512;
  const H = Math.round((512 * S.h) / S.w);
  const [c, g] = canvas(W, H);
  const [ce, ge] = canvas(W, H);
  const R = rng(skin.length * 131 + skin.charCodeAt(0) * 7);
  g.fillStyle = S.wall;
  g.fillRect(0, 0, W, H);
  ge.fillStyle = "#000";
  ge.fillRect(0, 0, W, H);
  if (S.brick) {
    for (let y = 0; y < H; y += 8) {
      for (let x = (y / 8) % 2 ? -10 : 0; x < W; x += 20) {
        g.fillStyle = `rgba(${60 + R() * 40},${20 + R() * 20},${10 + R() * 10},${0.22 + R() * 0.2})`;
        g.fillRect(x, y, 19, 7);
      }
    }
  } else if (S.siding) {
    for (let y = 0; y < H; y += 10) {
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(0, y, W, 2);
      g.fillStyle = "rgba(255,255,255,0.06)";
      g.fillRect(0, y + 2, W, 2);
    }
  } else if (S.ribs) {
    for (let x = 0; x < W; x += 10) {
      g.fillStyle = "rgba(0,0,0,0.14)";
      g.fillRect(x, 0, 3, H);
      g.fillStyle = "rgba(255,255,255,0.06)";
      g.fillRect(x + 4, 0, 2, H);
    }
  } else {
    for (let k = 0; k < 1100; k++) {
      g.fillStyle = `rgba(0,0,0,${R() * 0.05})`;
      g.fillRect(R() * W, R() * H, 2 + R() * 7, 2 + R() * 7);
    }
  }
  const bw = W / S.cols;
  const fh = H / S.floors;
  for (let f = 0; f < S.floors; f++) {
    const y0 = f * fh;
    g.fillStyle = S.band || shade(S.wall, -0.15);
    g.globalAlpha = S.curtain ? 0.95 : 0.55;
    g.fillRect(0, y0, W, S.curtain ? 7 : 6);
    g.globalAlpha = 1;
    for (let b = 0; b < S.cols; b++) {
      const x0 = b * bw;
      if (S.columns && b % 2 === 1) {
        g.fillStyle = shade(S.wall, 0.12);
        g.fillRect(x0 + bw * 0.35, y0, bw * 0.3, fh);
        continue;
      }
      if (S.curtain) {
        const wc = S.win[Math.floor(R() * S.win.length)];
        const gr = g.createLinearGradient(x0, y0, x0 + bw, y0 + fh);
        gr.addColorStop(0, wc);
        gr.addColorStop(0.5, shade(wc, 0.28));
        gr.addColorStop(1, wc);
        g.fillStyle = gr;
        g.fillRect(x0 + 3, y0 + 9, bw - 6, fh - 13);
        g.fillStyle = S.frame;
        g.fillRect(x0 + bw / 2 - 1.5, y0 + 9, 3, fh - 13);
        g.fillRect(x0, y0 + 9, 3, fh - 13);
        if (R() < 0.3) {
          ge.fillStyle = `rgba(255,${200 + R() * 40},${130 + R() * 60},${0.5 + R() * 0.4})`;
          ge.fillRect(x0 + 3, y0 + 9, bw - 6, fh - 13);
        }
        continue;
      }
      if (S.slit) {
        g.fillStyle = "#151515";
        g.fillRect(x0 + bw * 0.15, y0 + fh * 0.45, bw * 0.7, fh * 0.12);
        continue;
      }
      const n = S.sparse ? 1 : 2;
      for (let k = 0; k < n; k++) {
        const ww = S.sparse ? bw * 0.5 : bw * 0.3;
        const wx = S.sparse ? x0 + bw * 0.25 : x0 + bw * (0.12 + k * 0.46);
        const wy = y0 + fh * (S.sparse ? 0.4 : 0.25);
        const wh = fh * (S.sparse ? 0.22 : 0.52);
        g.fillStyle = S.frame;
        g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        const wc = S.win[Math.floor(R() * S.win.length)];
        const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
        gr.addColorStop(0, wc);
        gr.addColorStop(0.5, shade(wc, 0.3));
        gr.addColorStop(1, wc);
        g.fillStyle = gr;
        g.fillRect(wx, wy, ww, wh);
        g.fillStyle = S.frame;
        g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        if (S.shutters) {
          g.fillStyle = shade(S.frame === "#ffffff" ? "#4e6b7d" : S.frame, -0.1);
          g.fillRect(wx - 10, wy, 6, wh);
          g.fillRect(wx + ww + 4, wy, 6, wh);
        }
        if (R() < 0.25) {
          ge.fillStyle = `rgba(255,${200 + R() * 40},${130 + R() * 60},${0.5 + R() * 0.4})`;
          ge.fillRect(wx, wy, ww, wh);
        }
      }
    }
  }
  // ground-floor shopfronts on downtown skins
  if (S.curtain || skin === "concrete" || skin === "brick") {
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(0, H - fh * 0.08, W, fh * 0.08);
  }
  const out = { map: tex(c), emissive: tex(ce) };
  cache.set(key, out);
  return out;
}

export function roofTex() {
  if (cache.has("roof")) return cache.get("roof");
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#77736c";
  g.fillRect(0, 0, 256, 256);
  const R = rng(5);
  for (let i = 0; i < 5000; i++) {
    const v = 90 + R() * 70;
    g.fillStyle = `rgba(${v},${v - 4},${v - 10},0.5)`;
    g.fillRect(R() * 256, R() * 256, 2, 2);
  }
  g.strokeStyle = "rgba(0,0,0,0.15)";
  for (let i = 0; i < 256; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.stroke();
  }
  const t = tex(c);
  cache.set("roof", t);
  return t;
}
export function gableTex() {
  if (cache.has("gable")) return cache.get("gable");
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#6a3b2c";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8) {
    for (let x = (y / 8) % 2 ? -8 : 0; x < 128; x += 16) {
      g.fillStyle = `rgba(0,0,0,${0.1 + ((x + y) % 5) * 0.03})`;
      g.fillRect(x, y, 15, 7);
    }
  }
  const t = tex(c);
  cache.set("gable", t);
  return t;
}
export function detailTex() {
  if (cache.has("detail")) return cache.get("detail");
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  const R = rng(9);
  for (let i = 0; i < 256 * 256; i++) {
    const v = 118 + (R() - 0.5) * 34;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // larger soft blotches
  for (let i = 0; i < 70; i++) {
    const x = R() * 256;
    const y = R() * 256;
    const r = 10 + R() * 30;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    const d = R() < 0.5;
    gr.addColorStop(0, d ? "rgba(0,0,0,0.09)" : "rgba(255,255,255,0.07)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = tex(c, { srgb: false });
  cache.set("detail", t);
  return t;
}
export function containerTex() {
  if (cache.has("container")) return cache.get("container");
  const [c, g] = canvas(128, 64);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 6) {
    g.fillStyle = "rgba(0,0,0,0.18)";
    g.fillRect(x, 0, 2, 64);
  }
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, 0, 128, 3);
  g.fillRect(0, 61, 128, 3);
  const t = tex(c);
  cache.set("container", t);
  return t;
}
export function billboardTex(i) {
  const key = `bb${i}`;
  if (cache.has(key)) return cache.get(key);
  const [c, g] = canvas(256, 128);
  const pal = [["#0f4c81", "#ffd23f", "GAMMA COLA"], ["#c0392b", "#ffffff", "METRO NEWS"], ["#1e8449", "#f4f6f7", "GREEN FIELDS"], ["#4a235a", "#f7dc6f", "NIGHT RADIO"]][i % 4];
  g.fillStyle = pal[0];
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = pal[1];
  g.font = "bold 34px sans-serif";
  g.textAlign = "center";
  g.fillText(pal[2], 128, 76);
  g.fillRect(20, 92, 216, 6);
  const t = tex(c, { repeat: false });
  cache.set(key, t);
  return t;
}
export function stripeTex() {
  if (cache.has("stripe")) return cache.get("stripe");
  const [c, g] = canvas(64, 16);
  for (let x = 0; x < 64; x += 16) {
    g.fillStyle = "#d8322a";
    g.fillRect(x, 0, 8, 16);
    g.fillStyle = "#f2f2f2";
    g.fillRect(x + 8, 0, 8, 16);
  }
  const t = tex(c);
  cache.set("stripe", t);
  return t;
}

/** the whole city plan painted onto one 2048² canvas (0.47 m / px) */
export function groundMap(C) {
  if (cache.has("ground")) return cache.get("ground");
  const S = 2048;
  const M0 = -64;
  const M1 = SIZE + 64;
  const k = S / (M1 - M0);
  const [c, g] = canvas(S, S);
  const X = (x) => (x - M0) * k;
  const R = rng(17);
  // base: grass everywhere
  g.fillStyle = "#5f7d3a";
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = R() < 0.5 ? "rgba(40,60,20,0.08)" : "rgba(140,150,70,0.07)";
    g.fillRect(R() * S, R() * S, 3 + R() * 9, 3 + R() * 9);
  }
  // blocks
  for (let bz = 0; bz < N; bz++) {
    for (let bx = 0; bx < N; bx++) {
      const d = blockDistrict(bx, bz);
      const x0 = bx * PITCH + ROAD_HW;
      const z0 = bz * PITCH + ROAD_HW;
      const w = PITCH - 2 * ROAD_HW;
      if (bz === 6) continue;
      // sidewalk ring
      g.fillStyle = "#b7b3aa";
      g.fillRect(X(x0), X(z0), w * k, w * k);
      const ix = x0 + 4;
      const iz = z0 + 4;
      const iw = w - 8;
      let fill = null;
      if (d === "downtown") fill = "#a9a59c";
      else if (d === "industrial") fill = "#7d7a72";
      else if (d === "military") fill = "#8f8a6c";
      else if (d === "residential") fill = "#6f8f43";
      else fill = null;
      const key = `${bx},${bz}`;
      if (key === "1,2") fill = "#5c8a3a";
      if (key === "4,3" || key === "3,5") fill = "#cfc6b4";
      if (key === "8,8") fill = "#a29b78";
      if (key === "1,8" || key === "3,7" || key === "4,8") fill = "#8c8458";
      if (fill) {
        g.fillStyle = fill;
        g.fillRect(X(ix), X(iz), iw * k, iw * k);
      }
      if (key === "4,3" || key === "3,5") {
        // plaza paving pattern
        g.strokeStyle = "rgba(0,0,0,0.08)";
        for (let t = 0; t < iw; t += 3) {
          g.beginPath();
          g.moveTo(X(ix + t), X(iz));
          g.lineTo(X(ix + t), X(iz + iw));
          g.moveTo(X(ix), X(iz + t));
          g.lineTo(X(ix + iw), X(iz + t));
          g.stroke();
        }
      }
      if (d === "outskirts" && !fill) {
        // fields and dirt tracks
        for (let i = 0; i < 6; i++) {
          g.fillStyle = R() < 0.5 ? "rgba(120,110,60,0.25)" : "rgba(70,100,40,0.25)";
          g.fillRect(X(ix + R() * iw * 0.6), X(iz + R() * iw * 0.6), (10 + R() * 30) * k, (10 + R() * 30) * k);
        }
      }
      if (key === "8,8") {
        // parade ground markings
        g.strokeStyle = "rgba(255,255,255,0.5)";
        g.lineWidth = 2;
        g.strokeRect(X(ix + 8), X(iz + 8), (iw - 16) * k, (iw - 34) * k);
        g.lineWidth = 1;
      }
    }
  }
  // river band
  {
    const z0 = RIVER.z0;
    const z1 = RIVER.z1;
    g.fillStyle = "#6a8a46";
    g.fillRect(X(-64), X(z0), (SIZE + 128) * k, (z1 - z0) * k);
    g.fillStyle = "#7c6f55";
    g.fillRect(X(-64), X(z0 + 6), (SIZE + 128) * k, (z1 - z0 - 12) * k);
    g.fillStyle = "#3d5560";
    g.fillRect(X(-64), X(z0 + 14), (SIZE + 128) * k, (z1 - z0 - 28) * k);
  }
  // roads
  g.fillStyle = "#3f4144";
  for (let i = 0; i <= N; i++) {
    const c0 = i * PITCH - ROAD_HW;
    // north-south: skip the river span except bridges
    const isBridge = BRIDGES.includes(i * PITCH);
    g.fillRect(X(c0), X(-ROAD_HW), 2 * ROAD_HW * k, (RIVER.z0 + ROAD_HW) * k);
    g.fillRect(X(c0), X(RIVER.z1 - ROAD_HW), 2 * ROAD_HW * k, (SIZE - RIVER.z1 + 2 * ROAD_HW) * k);
    if (isBridge) g.fillRect(X(c0), X(RIVER.z0), 2 * ROAD_HW * k, (RIVER.z1 - RIVER.z0) * k);
    // east-west
    g.fillRect(X(-ROAD_HW), X(c0), (SIZE + 2 * ROAD_HW) * k, 2 * ROAD_HW * k);
  }
  // asphalt grain
  for (let i = 0; i < 20000; i++) {
    const x = R() * SIZE;
    const z = R() * SIZE;
    if (!C.roadAt(x, z)) continue;
    g.fillStyle = R() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.05)";
    g.fillRect(X(x), X(z), 2 + R() * 4, 2 + R() * 4);
  }
  const t = tex(c, { repeat: false, aniso: 8 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const out = { tex: t, M0, M1 };
  cache.set("ground", out);
  return out;
}

export function disposeTextures() {
  for (const v of cache.values()) {
    if (v.isTexture) v.dispose();
    else if (v.tex) v.tex.dispose();
    else if (v.map) {
      v.map.dispose();
      v.emissive.dispose();
    }
  }
  cache.clear();
}
export { LOT };
