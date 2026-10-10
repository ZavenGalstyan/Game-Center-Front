/**
 * Web Hero — procedural canvas textures (no image files).
 *
 *  facade(skin)     a 16 m × 14 m facade tile (4 bays × 4 floors) per building
 *                   skin + a matching emissive "lit windows" map for dusk / night
 *  roof()           gravel / membrane roof
 *  ground(C, D)     the whole street plan for one district: asphalt, lane
 *                   markings, crosswalks, sidewalks, parks, plazas, docks
 *  billboard(i)     fictional ads · neon(i, hue) fictional neon signs
 *  container()      corrugated steel
 */
import * as THREE from "three";

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
  t.generateMipmaps = true;
  return t;
}
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* metres per facade tile (the city builder's UVs use these) */
export const TILE_W = 16;
export const TILE_H = 14;

const SKINS = {
  glass: { wall: "#7ea4c4", frame: "#d8e2ea", win: ["#3d6688", "#5d8db2", "#2f5677"], bays: 4, floors: 4, curtain: true },
  glassB: { wall: "#4d7a74", frame: "#1d2b2f", win: ["#2a5550", "#3b6e68", "#1d4440"], bays: 4, floors: 4, curtain: true },
  concrete: { wall: "#c9c3b8", frame: "#a59e92", win: ["#3b4a58", "#52687a", "#2d3944"], bays: 4, floors: 4, band: "#b3ab9e" },
  brick: { wall: "#9c5a43", frame: "#e6dccb", win: ["#2f3a46", "#45576a", "#26303a"], bays: 4, floors: 4, brick: true },
  metal: { wall: "#8a949e", frame: "#5e666e", win: ["#38444f", "#4f6070", "#2a333c"], bays: 4, floors: 4, ribs: true },
  stucco: { wall: "#efe1c7", frame: "#ffffff", win: ["#4c7c94", "#6a9ab2", "#3a6074"], bays: 4, floors: 4, shutters: true },
  dark: { wall: "#2a2d3a", frame: "#3e4254", win: ["#1a2232", "#253049", "#141a26"], bays: 4, floors: 4, curtain: true },
  darkB: { wall: "#33283f", frame: "#4b3d5c", win: ["#1d1a30", "#2a2645", "#151324"], bays: 4, floors: 4 },
  armor: { wall: "#4a505e", frame: "#2a2e38", win: ["#2a1616", "#3a1d1d", "#1d1010"], bays: 4, floors: 4, armor: true },
  warehouse: { wall: "#b8b2a2", frame: "#8d8676", win: ["#5c6a72", "#6e7c84", "#4c5860"], bays: 2, floors: 2, ribs: true, sparse: true },
};
export const SKIN_IDS = Object.keys(SKINS);

/** returns { map, emissive } for a building skin */
export function facade(skin) {
  const key = `facade:${skin}`;
  if (cache.has(key)) return cache.get(key);
  const S = SKINS[skin] || SKINS.concrete;
  const W = 512;
  const Hh = 448;
  const [c, g] = canvas(W, Hh);
  const [ce, ge] = canvas(W, Hh);
  const R = rng(skin.length * 131 + skin.charCodeAt(0));
  g.fillStyle = S.wall;
  g.fillRect(0, 0, W, Hh);
  ge.fillStyle = "#000";
  ge.fillRect(0, 0, W, Hh);
  // wall texture
  if (S.brick) {
    for (let y = 0; y < Hh; y += 8) {
      for (let x = (y / 8) % 2 ? -10 : 0; x < W; x += 20) {
        g.fillStyle = `rgba(${60 + R() * 40},${20 + R() * 20},${10 + R() * 10},${0.25 + R() * 0.2})`;
        g.fillRect(x, y, 19, 7);
      }
    }
  } else if (S.ribs) {
    for (let x = 0; x < W; x += 8) {
      g.fillStyle = "rgba(0,0,0,0.12)";
      g.fillRect(x, 0, 3, Hh);
    }
  } else if (S.armor) {
    for (let y = 0; y < Hh; y += 56) {
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(0, y, W, 4);
      for (let x = 0; x < W; x += 64) {
        g.fillStyle = "rgba(255,255,255,0.06)";
        g.fillRect(x + 4, y + 8, 56, 40);
        g.fillStyle = "rgba(0,0,0,0.35)";
        for (const [bx, by] of [[8, 12], [54, 12], [8, 44], [54, 44]]) g.fillRect(x + bx, y + by, 3, 3);
      }
    }
  } else {
    for (let k = 0; k < 900; k++) {
      g.fillStyle = `rgba(0,0,0,${R() * 0.05})`;
      g.fillRect(R() * W, R() * Hh, 2 + R() * 6, 2 + R() * 6);
    }
  }
  const bw = W / S.bays;
  const fh = Hh / S.floors;
  for (let f = 0; f < S.floors; f++) {
    // floor slab / band
    g.fillStyle = S.band || S.frame;
    g.globalAlpha = S.curtain ? 0.9 : 0.6;
    g.fillRect(0, f * fh, W, S.curtain ? 6 : 8);
    g.globalAlpha = 1;
    for (let b = 0; b < S.bays; b++) {
      const x0 = b * bw;
      const y0 = f * fh;
      if (S.curtain) {
        // floor-to-ceiling glazing with mullions
        const wc = S.win[Math.floor(R() * S.win.length)];
        const gr = g.createLinearGradient(x0, y0, x0 + bw, y0 + fh);
        gr.addColorStop(0, wc);
        gr.addColorStop(0.55, lighten(wc, 0.25));
        gr.addColorStop(1, wc);
        g.fillStyle = gr;
        g.fillRect(x0 + 3, y0 + 8, bw - 6, fh - 12);
        g.fillStyle = S.frame;
        g.fillRect(x0 + bw / 2 - 1.5, y0 + 8, 3, fh - 12);
        g.fillRect(x0, y0 + 8, 3, fh - 12);
        litWindow(ge, R, x0 + 3, y0 + 8, bw - 6, fh - 12);
      } else {
        const n = S.sparse ? 1 : 2;
        for (let k = 0; k < n; k++) {
          const ww = S.sparse ? bw * 0.5 : bw * 0.32;
          const wx = S.sparse ? x0 + bw * 0.25 : x0 + bw * (0.12 + k * 0.46);
          const wy = y0 + fh * (S.sparse ? 0.45 : 0.25);
          const wh = fh * (S.sparse ? 0.25 : 0.55);
          g.fillStyle = S.frame;
          g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
          const wc = S.win[Math.floor(R() * S.win.length)];
          const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
          gr.addColorStop(0, wc);
          gr.addColorStop(0.5, lighten(wc, 0.3));
          gr.addColorStop(1, wc);
          g.fillStyle = gr;
          g.fillRect(wx, wy, ww, wh);
          g.fillStyle = S.frame;
          g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
          if (S.shutters) {
            g.fillStyle = "#3f7a6e";
            g.fillRect(wx - 10, wy - 2, 7, wh + 4);
            g.fillRect(wx + ww + 3, wy - 2, 7, wh + 4);
          }
          // sill shadow
          g.fillStyle = "rgba(0,0,0,0.25)";
          g.fillRect(wx - 3, wy + wh + 3, ww + 6, 3);
          litWindow(ge, R, wx, wy, ww, wh);
        }
      }
    }
  }
  // grime streaks
  for (let k = 0; k < 30; k++) {
    const x = R() * W;
    const gr = g.createLinearGradient(x, 0, x, Hh);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(1, `rgba(0,0,0,${0.04 + R() * 0.05})`);
    g.fillStyle = gr;
    g.fillRect(x, 0, 2 + R() * 5, Hh);
  }
  const out = { map: tex(c), emissive: tex(ce) };
  cache.set(key, out);
  return out;
}
function litWindow(g, R, x, y, w, h) {
  if (R() < 0.42) return;
  const warm = R() < 0.75;
  const hue = warm ? 38 + R() * 14 : 190 + R() * 30;
  g.fillStyle = `hsl(${hue}, ${warm ? 85 : 60}%, ${55 + R() * 20}%)`;
  g.globalAlpha = 0.55 + R() * 0.45;
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  // blinds / silhouettes
  g.fillStyle = "#000";
  g.globalAlpha = 0.25;
  if (R() < 0.4) g.fillRect(x + 1, y + 1, w - 2, (h - 2) * R() * 0.6);
  g.globalAlpha = 1;
}
function lighten(hex, k) {
  const c = new THREE.Color(hex);
  c.lerp(new THREE.Color("#ffffff"), k);
  return `#${c.getHexString()}`;
}

export function roof() {
  if (cache.has("roof")) return cache.get("roof");
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#8e8c86";
  g.fillRect(0, 0, 256, 256);
  const R = rng(7);
  for (let k = 0; k < 5000; k++) {
    const v = 110 + R() * 70;
    g.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
    g.fillRect(R() * 256, R() * 256, 2, 2);
  }
  g.strokeStyle = "rgba(0,0,0,0.18)";
  g.lineWidth = 2;
  for (let x = 0; x <= 256; x += 64) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, 256);
    g.stroke();
  }
  const t = tex(c);
  cache.set("roof", t);
  return t;
}

export function containerTex() {
  if (cache.has("container")) return cache.get("container");
  const [c, g] = canvas(128, 64);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 6) {
    g.fillStyle = "rgba(0,0,0,0.22)";
    g.fillRect(x, 0, 2, 64);
  }
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(0, 0, 128, 4);
  g.fillRect(0, 60, 128, 4);
  const t = tex(c, { repeat: false });
  cache.set("container", t);
  return t;
}

const ADS = [
  { bg: ["#ff5a3c", "#ffb03a"], title: "ZIPPY COLA", sub: "Swing into flavour", fg: "#fff" },
  { bg: ["#1f6fff", "#5ce1ff"], title: "SKYLINE AIR", sub: "Fly further for less", fg: "#fff" },
  { bg: ["#16a34a", "#a3e635"], title: "GREEN LEAF", sub: "Fresh market · open 24/7", fg: "#0b2a14" },
  { bg: ["#7c3aed", "#f472b6"], title: "NOVA PHONE 9", sub: "The future fits in your hand", fg: "#fff" },
  { bg: ["#111827", "#374151"], title: "THE DAILY WEB", sub: "Hero sighted downtown?!", fg: "#fde047" },
  { bg: ["#f59e0b", "#fde68a"], title: "BIG BITE BURGERS", sub: "Hero-sized meals", fg: "#3b1d00" },
];
export function billboard(i) {
  const key = `bb:${i % ADS.length}`;
  if (cache.has(key)) return cache.get(key);
  const A = ADS[i % ADS.length];
  const [c, g] = canvas(512, 256);
  const gr = g.createLinearGradient(0, 0, 512, 256);
  gr.addColorStop(0, A.bg[0]);
  gr.addColorStop(1, A.bg[1]);
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "rgba(255,255,255,0.15)";
  g.beginPath();
  g.arc(420, 60, 120, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = A.fg;
  g.font = "900 64px system-ui, Arial";
  g.textBaseline = "middle";
  g.fillText(A.title, 28, 110);
  g.font = "600 28px system-ui, Arial";
  g.fillText(A.sub, 30, 178);
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.lineWidth = 10;
  g.strokeRect(0, 0, 512, 256);
  const t = tex(c, { repeat: false });
  cache.set(key, t);
  return t;
}

const NEON_WORDS = ["NOODLES", "HOTEL", "24H", "ARCADE", "KARAOKE", "BAR", "SUSHI", "CLUB", "RAMEN", "OPEN", "CYBER", "DINER", "TAXI", "JAZZ"];
export function neon(i, hue) {
  const key = `neon:${i}:${Math.round(hue * 12)}`;
  if (cache.has(key)) return cache.get(key);
  const word = NEON_WORDS[i % NEON_WORDS.length];
  const vertical = i % 3 !== 0;
  const [c, g] = vertical ? canvas(128, 512) : canvas(512, 160);
  g.fillStyle = "#07060c";
  g.fillRect(0, 0, c.width, c.height);
  const col = `hsl(${Math.round(hue * 360)}, 100%, 62%)`;
  g.shadowColor = col;
  g.shadowBlur = 24;
  g.strokeStyle = col;
  g.lineWidth = 6;
  g.strokeRect(10, 10, c.width - 20, c.height - 20);
  g.fillStyle = "#fff";
  g.font = `900 ${vertical ? 76 : 96}px system-ui, Arial`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (vertical) {
    const letters = word.slice(0, 5).split("");
    letters.forEach((ch, k) => {
      g.fillStyle = col;
      g.fillText(ch, 64, 64 + k * ((512 - 96) / Math.max(1, letters.length - 1)) * 0.95);
      g.fillStyle = "rgba(255,255,255,0.75)";
      g.fillText(ch, 64, 64 + k * ((512 - 96) / Math.max(1, letters.length - 1)) * 0.95);
    });
  } else {
    g.fillStyle = col;
    g.fillText(word, 256, 84);
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.fillText(word, 256, 84);
  }
  const t = tex(c, { repeat: false });
  cache.set(key, t);
  return t;
}

/** the street plan: one big texture over the district's ground */
export function ground(C, D) {
  const key = `ground:${C.key}`;
  if (cache.has(key)) return cache.get(key);
  const ext = C.half + 60;
  const size = 2048;
  const k = size / (ext * 2);
  const [c, g] = canvas(size, size);
  const X = (x) => (x + ext) * k;
  const Z = (z) => (z + ext) * k;
  const R = rng(C.key.length * 17);
  const night = D.time === "night" || D.time === "storm";
  // asphalt base
  g.fillStyle = night ? "#2a2c33" : "#4a4c52";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 26000; i++) {
    const v = (night ? 34 : 64) + R() * 26;
    g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
    g.fillRect(R() * size, R() * size, 2, 2);
  }
  const pitch = 50;
  const N = C.N;
  // lane markings (dashed centre + edge lines) along every street centre line
  g.strokeStyle = night ? "#c9b64a" : "#f2d24a";
  g.lineWidth = 0.22 * k;
  g.setLineDash([3 * k, 3 * k]);
  for (let i = 0; i <= N; i++) {
    const s = -C.half + i * pitch;
    g.beginPath();
    g.moveTo(X(s), Z(-C.half - 30));
    g.lineTo(X(s), Z(C.half + 30));
    g.stroke();
    g.beginPath();
    g.moveTo(X(-C.half - 30), Z(s));
    g.lineTo(X(C.half + 30), Z(s));
    g.stroke();
  }
  g.setLineDash([]);
  // blocks: sidewalk ring + block fill
  for (const b of C.blocks) {
    const sw = 3;
    if (b.t === "S" || b.t === "I") continue;
    g.fillStyle = night ? "#5a5c66" : "#b9b6ae";
    g.fillRect(X(b.x0 - sw), Z(b.z0 - sw), (b.x1 - b.x0 + sw * 2) * k, (b.z1 - b.z0 + sw * 2) * k);
    // curb line
    g.strokeStyle = night ? "#3a3c44" : "#8f8b82";
    g.lineWidth = 0.3 * k;
    g.strokeRect(X(b.x0 - sw), Z(b.z0 - sw), (b.x1 - b.x0 + sw * 2) * k, (b.z1 - b.z0 + sw * 2) * k);
    // paving joints
    g.strokeStyle = night ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.08)";
    g.lineWidth = 1;
    for (let x = b.x0 - sw; x < b.x1 + sw; x += 1.5) {
      g.beginPath();
      g.moveTo(X(x), Z(b.z0 - sw));
      g.lineTo(X(x), Z(b.z0));
      g.moveTo(X(x), Z(b.z1));
      g.lineTo(X(x), Z(b.z1 + sw));
      g.stroke();
    }
    let fill = night ? "#4c4e58" : "#a9a69d";
    if (b.t === "P") fill = night ? "#1f3a24" : "#5fa04a";
    if (b.t === "Q") fill = night ? "#6b6370" : "#d8cdb8";
    if (b.t === "W" || b.t === "C") fill = night ? "#3e3f45" : "#7c7a74";
    if (b.t === "D") fill = "#7a5a3a";
    if (b.t === "H" || b.t === "F") fill = night ? "#30333c" : "#5d6270";
    g.fillStyle = fill;
    g.fillRect(X(b.x0), Z(b.z0), (b.x1 - b.x0) * k, (b.z1 - b.z0) * k);
    if (b.t === "P") {
      // paths + grass variation
      for (let i = 0; i < 500; i++) {
        g.fillStyle = `rgba(${night ? 20 : 60},${night ? 60 : 130 + R() * 40},${night ? 25 : 40},0.35)`;
        g.fillRect(X(b.x0) + R() * (b.x1 - b.x0) * k, Z(b.z0) + R() * (b.z1 - b.z0) * k, 4, 4);
      }
      g.strokeStyle = night ? "#6b675c" : "#d8cfb4";
      g.lineWidth = 2.4 * k;
      g.beginPath();
      g.moveTo(X(b.x0), Z(b.z0));
      g.lineTo(X(b.x1), Z(b.z1));
      g.moveTo(X(b.x1), Z(b.z0));
      g.lineTo(X(b.x0), Z(b.z1));
      g.stroke();
      g.beginPath();
      g.arc(X((b.x0 + b.x1) / 2), Z((b.z0 + b.z1) / 2), 7 * k, 0, Math.PI * 2);
      g.stroke();
    }
    if (b.t === "Q") {
      g.strokeStyle = "rgba(0,0,0,0.12)";
      g.lineWidth = 1;
      for (let x = b.x0; x < b.x1; x += 2) {
        g.beginPath();
        g.moveTo(X(x), Z(b.z0));
        g.lineTo(X(x), Z(b.z1));
        g.stroke();
      }
      for (let z = b.z0; z < b.z1; z += 2) {
        g.beginPath();
        g.moveTo(X(b.x0), Z(z));
        g.lineTo(X(b.x1), Z(z));
        g.stroke();
      }
      g.fillStyle = night ? "#8a7f6a" : "#efe3c8";
      g.beginPath();
      g.arc(X((b.x0 + b.x1) / 2), Z((b.z0 + b.z1) / 2), 9 * k, 0, Math.PI * 2);
      g.fill();
    }
    if (b.t === "D") {
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.lineWidth = 1;
      for (let x = b.x0; x < b.x1 + 7; x += 0.8) {
        g.beginPath();
        g.moveTo(X(x), Z(b.z0));
        g.lineTo(X(x), Z(b.z1));
        g.stroke();
      }
    }
  }
  // crosswalks at intersections
  g.fillStyle = night ? "rgba(220,220,220,0.55)" : "rgba(245,245,245,0.85)";
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const ix = -C.half + i * pitch;
      const iz = -C.half + j * pitch;
      if (C.water && ix > C.water.x0) continue;
      for (const sgn of [-1, 1]) {
        for (let s = -5; s <= 5; s += 1.2) {
          g.fillRect(X(ix + s - 0.3), Z(iz + sgn * 8.5 - 1.2), 0.6 * k, 2.4 * k);
          g.fillRect(X(ix + sgn * 8.5 - 1.2), Z(iz + s - 0.3), 2.4 * k, 0.6 * k);
        }
      }
    }
  }
  // puddles / wet sheen for night districts
  if (night) {
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(120,140,200,${0.05 + R() * 0.07})`;
      g.beginPath();
      g.ellipse(R() * size, R() * size, 8 + R() * 30, 4 + R() * 14, R() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = tex(c, { repeat: false, aniso: 16 });
  const out = { map: t, ext };
  cache.set(key, out);
  return out;
}

export function waterNormal() {
  if (cache.has("water")) return cache.get("water");
  const [c, g] = canvas(256, 256);
  const img = g.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const a = Math.sin((x / 256) * Math.PI * 8 + Math.sin((y / 256) * Math.PI * 4) * 1.5);
      const b = Math.cos((y / 256) * Math.PI * 6 + Math.sin((x / 256) * Math.PI * 2) * 2);
      const i = (y * 256 + x) * 4;
      img.data[i] = 128 + a * 50;
      img.data[i + 1] = 128 + b * 50;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = tex(c, { srgb: false });
  cache.set("water", t);
  return t;
}

/** radial soft dot for particles / glows */
export function dot() {
  if (cache.has("dot")) return cache.get("dot");
  const [c, g] = canvas(64, 64);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)");
  gr.addColorStop(0.35, "rgba(255,255,255,0.6)");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = tex(c, { repeat: false, srgb: false });
  cache.set("dot", t);
  return t;
}

/** dispose every cached texture (when the game unmounts) */
export function disposeTextures() {
  for (const v of cache.values()) {
    if (v && v.isTexture) v.dispose();
    else if (v) for (const t of Object.values(v)) if (t && t.isTexture) t.dispose();
  }
  cache.clear();
}
