/**
 * Lost Toy — shared procedural materials (no texture downloads).
 *
 * A handful of small tileable canvas textures (wood grain, floor planks,
 * fabric weave, knit, cardboard, paper, wallpaper, rug, tiles, grass, stone,
 * brushed metal) are drawn once, mostly in light neutral tones, and TINTED by
 * each material's colour — so one texture serves every book cover, chair or
 * cushion. Geometry gets world-scale UVs (see worldUV), so a texture repeats
 * at the same real size on a toy block and on a desk top.
 *
 * Materials are cached by key ("wood|#b07a4a"); everything is disposed when
 * the game unmounts (disposeMaterialCache).
 */
import * as THREE from "three";

const texCache = new Map();
const matCache = new Map();

export function disposeMaterialCache() {
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
}

/* ------------------------------------------------------------------ noise helpers */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function canvasTex(key, size, draw, { repeat = true, color = true, aniso = 4 } = {}) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d");
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}

/** sprinkle tiny value noise over the whole canvas (keeps the tint readable) */
function speckle(g, s, amount, alpha, seed = 7, dark = true) {
  const r = rng(seed);
  for (let i = 0; i < amount; i++) {
    const v = dark ? Math.floor(r() * 60) : 200 + Math.floor(r() * 55);
    g.fillStyle = `rgba(${v},${v},${v},${alpha * r()})`;
    g.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2);
  }
}

/* ------------------------------------------------------------------ textures */
const TEX = {
  wood: () =>
    canvasTex("wood", 512, (g, s) => {
      g.fillStyle = "#f2e6d6";
      g.fillRect(0, 0, s, s);
      const r = rng(11);
      // long grain streaks along u
      for (let i = 0; i < 160; i++) {
        const y = r() * s;
        const w = 0.6 + r() * 2.4;
        const a = 0.05 + r() * 0.14;
        g.strokeStyle = `rgba(120,80,45,${a})`;
        g.lineWidth = w;
        g.beginPath();
        const amp = 2 + r() * 6;
        const f = 0.004 + r() * 0.01;
        const ph = r() * 10;
        for (let x = -4; x <= s + 4; x += 8) {
          const yy = y + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph) * amp * 0.3;
          if (x === -4) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
        // wrap seam
        g.beginPath();
        for (let x = -4; x <= s + 4; x += 8) {
          const yy = y - s + Math.sin(x * f + ph) * amp;
          if (x === -4) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.stroke();
      }
      // a couple of soft knots
      for (let k = 0; k < 3; k++) {
        const cx = r() * s;
        const cy = r() * s;
        for (let j = 0; j < 6; j++) {
          g.strokeStyle = `rgba(110,70,40,${0.12 - j * 0.015})`;
          g.lineWidth = 1.5;
          g.beginPath();
          g.ellipse(cx, cy, 10 + j * 5, 4 + j * 2.4, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      speckle(g, s, 1800, 0.08, 3);
    }),
  planks: () =>
    canvasTex("planks", 1024, (g, s) => {
      // 4 boards across (v), staggered joints along u
      const r = rng(5);
      const boards = 4;
      const bh = s / boards;
      for (let b = 0; b < boards; b++) {
        const tone = 228 + Math.floor(r() * 24);
        g.fillStyle = `rgb(${tone},${tone - 18},${tone - 40})`;
        g.fillRect(0, b * bh, s, bh);
        for (let i = 0; i < 46; i++) {
          const y = b * bh + r() * bh;
          g.strokeStyle = `rgba(110,70,38,${0.05 + r() * 0.12})`;
          g.lineWidth = 0.6 + r() * 2;
          g.beginPath();
          const amp = 1 + r() * 3;
          const ph = r() * 10;
          for (let x = 0; x <= s; x += 8) {
            const yy = Math.min(b * bh + bh - 2, Math.max(b * bh + 2, y + Math.sin(x * 0.01 + ph) * amp));
            if (x === 0) g.moveTo(x, yy);
            else g.lineTo(x, yy);
          }
          g.stroke();
        }
        // gap line between boards
        g.fillStyle = "rgba(70,42,22,0.55)";
        g.fillRect(0, b * bh, s, 3);
        // board end joints
        const off = r() * s;
        for (const jx of [off, (off + s / 2) % s]) {
          g.fillStyle = "rgba(70,42,22,0.45)";
          g.fillRect(jx, b * bh, 3, bh);
        }
      }
      speckle(g, s, 4000, 0.07, 9);
    }),
  fabric: () =>
    canvasTex("fabric", 256, (g, s) => {
      g.fillStyle = "#ececec";
      g.fillRect(0, 0, s, s);
      // weave: alternating short dashes
      for (let y = 0; y < s; y += 4) {
        for (let x = 0; x < s; x += 4) {
          const on = ((x >> 2) + (y >> 2)) & 1;
          g.fillStyle = on ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.35)";
          g.fillRect(x, y, on ? 4 : 2, on ? 2 : 4);
        }
      }
      speckle(g, s, 900, 0.1, 21);
    }),
  felt: () =>
    canvasTex("felt", 256, (g, s) => {
      g.fillStyle = "#eeeeee";
      g.fillRect(0, 0, s, s);
      const r = rng(31);
      for (let i = 0; i < 2600; i++) {
        g.strokeStyle = `rgba(0,0,0,${0.03 + r() * 0.05})`;
        g.lineWidth = 0.5;
        const x = r() * s;
        const y = r() * s;
        const a = r() * Math.PI;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
        g.stroke();
      }
    }),
  knit: () =>
    canvasTex("knit", 256, (g, s) => {
      g.fillStyle = "#e9e9e9";
      g.fillRect(0, 0, s, s);
      const cw = 16;
      const ch = 20;
      for (let y = 0; y < s + ch; y += ch) {
        for (let x = 0; x < s; x += cw) {
          for (const side of [-1, 1]) {
            g.fillStyle = "rgba(255,255,255,0.45)";
            g.beginPath();
            g.ellipse(x + cw / 2 + side * 3.5, y + ch / 2, 3.6, 8.5, side * 0.45, 0, Math.PI * 2);
            g.fill();
            g.strokeStyle = "rgba(0,0,0,0.12)";
            g.lineWidth = 1;
            g.stroke();
          }
        }
      }
    }),
  cardboard: () =>
    canvasTex("cardboard", 512, (g, s) => {
      g.fillStyle = "#c79a64";
      g.fillRect(0, 0, s, s);
      const r = rng(41);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? "255,230,190" : "90,60,30"},${0.04 + r() * 0.05})`;
        g.fillRect(0, r() * s, s, 2 + r() * 10);
      }
      speckle(g, s, 1400, 0.08, 43);
      speckle(g, s, 600, 0.08, 44, false);
    }),
  paper: () =>
    canvasTex("paper", 256, (g, s) => {
      g.fillStyle = "#f7f3ea";
      g.fillRect(0, 0, s, s);
      speckle(g, s, 600, 0.05, 51);
    }),
  pages: () =>
    canvasTex("pages", 256, (g, s) => {
      // stacked page edges (thin lines along u)
      g.fillStyle = "#f4ecd8";
      g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 3) {
        g.fillStyle = `rgba(150,120,80,${0.08 + ((y * 7) % 5) * 0.02})`;
        g.fillRect(0, y, s, 1);
      }
    }),
  notebook: () =>
    canvasTex("notebook", 512, (g, s) => {
      g.fillStyle = "#fbf8f0";
      g.fillRect(0, 0, s, s);
      g.strokeStyle = "rgba(90,140,210,0.45)";
      g.lineWidth = 2;
      for (let y = 40; y < s; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(s, y);
        g.stroke();
      }
      g.strokeStyle = "rgba(220,90,90,0.5)";
      g.beginPath();
      g.moveTo(70, 0);
      g.lineTo(70, s);
      g.stroke();
      // a child's doodle: sun + house
      g.strokeStyle = "rgba(60,60,90,0.55)";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(380, 120, 34, 0, Math.PI * 2);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(380 + Math.cos(a) * 44, 120 + Math.sin(a) * 44);
        g.lineTo(380 + Math.cos(a) * 62, 120 + Math.sin(a) * 62);
      }
      g.stroke();
      g.beginPath();
      g.moveTo(150, 380);
      g.lineTo(220, 310);
      g.lineTo(290, 380);
      g.lineTo(290, 460);
      g.lineTo(150, 460);
      g.closePath();
      g.stroke();
    }),
  wallpaper: () =>
    canvasTex("wallpaper", 512, (g, s) => {
      g.fillStyle = "#f3e6d4";
      g.fillRect(0, 0, s, s);
      // soft vertical stripes
      for (let x = 0; x < s; x += 64) {
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(x, 0, 26, s);
        g.fillStyle = "rgba(200,160,120,0.12)";
        g.fillRect(x + 26, 0, 2, s);
      }
      // tiny sprigs
      const r = rng(61);
      for (let i = 0; i < 26; i++) {
        const x = 45 + Math.floor(r() * 8) * 64;
        const y = r() * s;
        g.fillStyle = "rgba(190,120,110,0.28)";
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "rgba(120,150,100,0.3)";
        g.fillRect(x - 1, y + 5, 2, 10);
      }
    }),
  paint: () =>
    canvasTex("paint", 256, (g, s) => {
      g.fillStyle = "#efefef";
      g.fillRect(0, 0, s, s);
      speckle(g, s, 1500, 0.05, 71);
      speckle(g, s, 800, 0.08, 72, false);
    }),
  rug: () =>
    canvasTex(
      "rug",
      512,
      (g, s) => {
        g.fillStyle = "#c9734f";
        g.fillRect(0, 0, s, s);
        const bands = [
          ["#e8c39a", 24],
          ["#7f9c8a", 18],
          ["#f3e2c4", 10],
          ["#b5543a", 30],
        ];
        let o = 18;
        for (const [c, w] of bands) {
          g.fillStyle = c;
          g.fillRect(o, o, s - o * 2, w);
          g.fillRect(o, s - o - w, s - o * 2, w);
          g.fillRect(o, o, w, s - o * 2);
          g.fillRect(s - o - w, o, w, s - o * 2);
          o += w + 8;
        }
        // centre medallion of diamonds
        g.save();
        g.translate(s / 2, s / 2);
        for (let i = 4; i >= 1; i--) {
          g.fillStyle = ["#f3e2c4", "#7f9c8a", "#e8c39a", "#b5543a"][i % 4];
          g.beginPath();
          g.moveTo(0, -i * 30);
          g.lineTo(i * 30, 0);
          g.lineTo(0, i * 30);
          g.lineTo(-i * 30, 0);
          g.closePath();
          g.fill();
        }
        g.restore();
        // weave texture
        for (let y = 0; y < s; y += 3) {
          g.fillStyle = `rgba(0,0,0,${y % 6 ? 0.05 : 0.09})`;
          g.fillRect(0, y, s, 1);
        }
        speckle(g, s, 3000, 0.1, 81);
      },
      { repeat: false },
    ),
  tiles: () =>
    canvasTex("tiles", 512, (g, s) => {
      const n = 4;
      const t = s / n;
      g.fillStyle = "#cfc8bd";
      g.fillRect(0, 0, s, s);
      const r = rng(91);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const v = 238 + Math.floor(r() * 14);
          g.fillStyle = `rgb(${v},${v},${v - 4})`;
          g.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
          const gr = g.createLinearGradient(x * t, y * t, x * t + t, y * t + t);
          gr.addColorStop(0, "rgba(255,255,255,0.25)");
          gr.addColorStop(1, "rgba(0,0,0,0.04)");
          g.fillStyle = gr;
          g.fillRect(x * t + 3, y * t + 3, t - 6, t - 6);
        }
      }
    }),
  grass: () =>
    canvasTex("grass", 512, (g, s) => {
      g.fillStyle = "#7fae4f";
      g.fillRect(0, 0, s, s);
      const r = rng(101);
      for (let i = 0; i < 5000; i++) {
        const x = r() * s;
        const y = r() * s;
        const l = 4 + r() * 10;
        g.strokeStyle = `rgba(${r() > 0.5 ? "40,90,30" : "190,220,120"},${0.15 + r() * 0.25})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 3, y - l);
        g.stroke();
      }
    }),
  soil: () =>
    canvasTex("soil", 256, (g, s) => {
      g.fillStyle = "#8a6a4a";
      g.fillRect(0, 0, s, s);
      speckle(g, s, 4000, 0.25, 111);
      speckle(g, s, 1500, 0.18, 112, false);
    }),
  stone: () =>
    canvasTex("stone", 256, (g, s) => {
      g.fillStyle = "#d8d5cf";
      g.fillRect(0, 0, s, s);
      const r = rng(121);
      for (let i = 0; i < 60; i++) {
        const v = r() > 0.5 ? 255 : 0;
        g.fillStyle = `rgba(${v},${v},${v},0.045)`;
        g.beginPath();
        g.arc(r() * s, r() * s, 6 + r() * 30, 0, Math.PI * 2);
        g.fill();
      }
      speckle(g, s, 3000, 0.16, 122);
    }),
  metal: () =>
    canvasTex("metal", 256, (g, s) => {
      g.fillStyle = "#e4e6ea";
      g.fillRect(0, 0, s, s);
      const r = rng(131);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${0.03 + r() * 0.05})`;
        g.fillRect(0, r() * s, s, 1);
      }
    }),
  plastic: () =>
    canvasTex("plastic", 128, (g, s) => {
      g.fillStyle = "#f4f4f4";
      g.fillRect(0, 0, s, s);
      speckle(g, s, 200, 0.03, 141);
    }),
};

export function texture(name) {
  return TEX[name] ? TEX[name]() : null;
}

/* ------------------------------------------------------------------ materials */
/**
 * kind → texture, roughness, metalness, UV density (repeats per unit).
 * "UV density" is consumed by worldUV() at geometry build time.
 */
export const KINDS = {
  wood: { tex: "wood", rough: 0.62, metal: 0, density: 1 / 6 },
  woodPaint: { tex: "paint", rough: 0.55, metal: 0, density: 1 / 8 },
  planks: { tex: "planks", rough: 0.58, metal: 0, density: 1 / 6 },
  fabric: { tex: "fabric", rough: 0.95, metal: 0, density: 1 / 1.6 },
  felt: { tex: "felt", rough: 1, metal: 0, density: 1 / 1.2 },
  knit: { tex: "knit", rough: 1, metal: 0, density: 1 / 0.6 },
  cardboard: { tex: "cardboard", rough: 0.92, metal: 0, density: 1 / 8 },
  paper: { tex: "paper", rough: 0.9, metal: 0, density: 1 / 4 },
  pages: { tex: "pages", rough: 0.92, metal: 0, density: 1 / 1.4 },
  notebook: { tex: "notebook", rough: 0.88, metal: 0, density: 1 / 4.2 },
  wall: { tex: "wallpaper", rough: 0.92, metal: 0, density: 1 / 10 },
  paint: { tex: "paint", rough: 0.85, metal: 0, density: 1 / 6 },
  rug: { tex: "rug", rough: 1, metal: 0, density: 0 }, // 0 = keep the geometry's own 0..1 UVs
  tiles: { tex: "tiles", rough: 0.3, metal: 0, density: 1 / 6 },
  grass: { tex: "grass", rough: 1, metal: 0, density: 1 / 5 },
  soil: { tex: "soil", rough: 1, metal: 0, density: 1 / 4 },
  stone: { tex: "stone", rough: 0.85, metal: 0, density: 1 / 4 },
  metal: { tex: "metal", rough: 0.35, metal: 0.75, density: 1 / 4 },
  plastic: { tex: "plastic", rough: 0.38, metal: 0, density: 1 / 3 },
  glossy: { tex: null, rough: 0.18, metal: 0, density: 1 },
  ceramic: { tex: null, rough: 0.22, metal: 0, density: 1 },
  rubber: { tex: null, rough: 0.9, metal: 0, density: 1 },
  glass: { tex: null, rough: 0.05, metal: 0, density: 1, transparent: 0.35 },
  water: { tex: null, rough: 0.06, metal: 0.1, density: 1, transparent: 0.62 },
  glow: { tex: null, rough: 1, metal: 0, density: 1, emissive: true },
  matte: { tex: null, rough: 0.85, metal: 0, density: 1 },
};

/** shared material for a kind + colour; key = "kind|#hex" */
export function mat(kind, color = "#ffffff", extra = null) {
  const key = `${kind}|${color}${extra ? "|" + JSON.stringify(extra) : ""}`;
  if (matCache.has(key)) return matCache.get(key);
  const K = KINDS[kind] || KINDS.matte;
  const params = { color, roughness: K.rough, metalness: K.metal };
  const t = K.tex ? texture(K.tex) : null;
  if (t) params.map = t;
  if (K.transparent) {
    params.transparent = true;
    params.opacity = K.transparent;
    params.depthWrite = false;
  }
  if (K.emissive) {
    params.emissive = new THREE.Color(color);
    params.emissiveIntensity = 1.4;
  }
  if (extra) Object.assign(params, extra);
  const m = new THREE.MeshStandardMaterial(params);
  m.userData.key = key;
  m.userData.kind = kind;
  matCache.set(key, m);
  return m;
}

export function matKey(kind, color) {
  return `${kind}|${color}`;
}

/**
 * World-scale UVs: project each vertex on the plane of its dominant normal
 * axis (x→(z,y), y→(x,z), z→(x,y)) in the geometry's own (already sized)
 * frame, times `density` repeats per unit. Works for boxes, rounded boxes,
 * cylinders and blobs alike; noise-like textures hide the seams.
 */
export function worldUV(geo, density, offset = 0) {
  if (!density) return geo;
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i));
    const ny = Math.abs(n.getY(i));
    const nz = Math.abs(n.getZ(i));
    let u;
    let v;
    if (ny >= nx && ny >= nz) {
      u = p.getX(i);
      v = p.getZ(i);
    } else if (nx >= nz) {
      u = p.getZ(i);
      v = p.getY(i);
    } else {
      u = p.getX(i);
      v = p.getY(i);
    }
    uv[i * 2] = u * density + offset;
    uv[i * 2 + 1] = v * density + offset * 0.37;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/* ------------------------------------------------------------------ sprites */
export function glowTexture() {
  return canvasTex(
    "glow",
    128,
    (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.25, "rgba(255,255,255,0.55)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    },
    { repeat: false },
  );
}

export function blobTexture() {
  return canvasTex(
    "blob",
    128,
    (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, "rgba(0,0,0,0.55)");
      gr.addColorStop(0.55, "rgba(0,0,0,0.3)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    },
    { repeat: false, color: false },
  );
}

/** soft vertical light-shaft gradient (sunbeams through the window) */
export function shaftTexture() {
  return canvasTex(
    "shaft",
    128,
    (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, "rgba(255,255,255,0.9)");
      gr.addColorStop(0.6, "rgba(255,255,255,0.35)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
      // soften the sides
      const sg = g.createLinearGradient(0, 0, s, 0);
      sg.addColorStop(0, "rgba(0,0,0,1)");
      sg.addColorStop(0.2, "rgba(0,0,0,0)");
      sg.addColorStop(0.8, "rgba(0,0,0,0)");
      sg.addColorStop(1, "rgba(0,0,0,1)");
      g.globalCompositeOperation = "destination-out";
      g.fillStyle = sg;
      g.fillRect(0, 0, s, s);
    },
    { repeat: false },
  );
}

/** sky gradient for the view through windows / the backyard dome */
export function skyTexture(top, mid, bottom, key) {
  return canvasTex(
    `sky:${key}`,
    256,
    (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s);
      gr.addColorStop(0, top);
      gr.addColorStop(0.55, mid);
      gr.addColorStop(1, bottom);
      g.fillStyle = gr;
      g.fillRect(0, 0, s, s);
    },
    { repeat: false },
  );
}

/** printed labels for cereal boxes, paint cans, book spines … */
export function labelTexture(key, w, h, draw) {
  return canvasTex(
    `label:${key}`,
    Math.max(w, h),
    (g, s) => {
      g.save();
      g.scale(s / w, s / h);
      draw(g, w, h);
      g.restore();
    },
    { repeat: false },
  );
}
