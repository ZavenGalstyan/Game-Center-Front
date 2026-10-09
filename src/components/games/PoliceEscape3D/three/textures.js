/**
 * Police Escape 3D — procedural canvas textures (no image assets). Cached by
 * key; disposeTextures() releases them when the game unmounts.
 */
import * as THREE from "three";
import { mulberry32 } from "../engine/util.js";

const cache = new Map();

function make(key, w, h, draw, { repeat = false, srgb = true, aniso = 4 } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = aniso;
  cache.set(key, t);
  return t;
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

function speckle(g, w, h, n, colors, seed, size = 2, alpha = 0.3) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.globalAlpha = alpha * (0.3 + r() * 0.7);
    g.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
  g.globalAlpha = 1;
}

function asphaltBase(g, w, h, color, seed) {
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  speckle(g, w, h, (w * h) / 40, ["#000000", "#3a3a3a", "#6a6a6a"], seed, 1.5, 0.35);
  // patches + cracks
  const r = mulberry32(seed + 9);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.03)";
    g.fillRect(r() * w, r() * h, 20 + r() * 50, 14 + r() * 40);
  }
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = r() * w;
    let y = r() * h;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) {
      x += (r() - 0.5) * 30;
      y += r() * 20;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

/**
 * Road surface: u across the width (0 → 1), v along 20 m. kind: "road"
 * (2 lanes, dashed centre), "avenue" (4 lanes, double yellow), "alley",
 * "drive" (escape driveway chevrons).
 */
export function roadTex(pal, kind = "road") {
  return make(
    `road-${pal.asphalt}-${pal.line}-${kind}`,
    256,
    512,
    (g, w, h) => {
      asphaltBase(g, w, h, kind === "alley" ? shade(pal.asphalt, -0.15) : pal.asphalt, kind.length * 13);
      g.fillStyle = pal.line;
      if (kind === "road" || kind === "avenue") {
        // edge lines
        g.globalAlpha = 0.85;
        g.fillRect(w * 0.035, 0, 4, h);
        g.fillRect(w * 0.965 - 4, 0, 4, h);
        if (kind === "road") {
          for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 3, y + 16, 6, 64);
        } else {
          g.fillStyle = "#ffcc33";
          g.fillRect(w / 2 - 8, 0, 4, h);
          g.fillRect(w / 2 + 4, 0, 4, h);
          g.fillStyle = pal.line;
          for (let y = 0; y < h; y += 128) {
            g.fillRect(w * 0.27 - 2, y + 16, 4, 60);
            g.fillRect(w * 0.73 - 2, y + 16, 4, 60);
          }
        }
        g.globalAlpha = 1;
      } else if (kind === "drive") {
        g.fillStyle = "#3dff8a";
        for (let k = 0; k < 4; k++) {
          const y0 = k * 128 + 24;
          g.beginPath();
          g.moveTo(w * 0.15, y0 + 70);
          g.lineTo(w * 0.5, y0 + 10);
          g.lineTo(w * 0.85, y0 + 70);
          g.lineTo(w * 0.85, y0 + 96);
          g.lineTo(w * 0.5, y0 + 36);
          g.lineTo(w * 0.15, y0 + 96);
          g.closePath();
          g.fill();
        }
      } else {
        // alley: a worn centre drain
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(w / 2 - 6, 0, 12, h);
      }
    },
    { repeat: true, aniso: 8 },
  );
}

/** Plain asphalt for intersections. */
export function asphaltTex(pal) {
  return make(`asph-${pal.asphalt}`, 256, 256, (g, w, h) => asphaltBase(g, w, h, pal.asphalt, 31), { repeat: true, aniso: 8 });
}

/** Zebra crossing strip (u across the road, v across the strip). */
export function crosswalkTex() {
  return make("crosswalk", 256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "rgba(240,244,250,0.9)";
    for (let x = 6; x < w; x += 24) g.fillRect(x, 4, 12, h - 8);
  });
}

/** Sidewalk paving. */
export function sidewalkTex(pal) {
  return make(
    `side-${pal.side}`,
    128,
    128,
    (g, w, h) => {
      g.fillStyle = pal.side;
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 900, ["#000", "#fff"], 4, 1.5, 0.12);
      g.strokeStyle = "rgba(0,0,0,0.28)";
      g.lineWidth = 2;
      for (let x = 0; x <= w; x += 32) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y <= h; y += 32) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
    },
    { repeat: true },
  );
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color("#ffffff"), k);
  return `#${c.getHexString()}`;
}

/**
 * Building facade. style: office | apartment | industrial | coastal | metro.
 * One texture tile = 8 m wide × 12 m tall (3 floors); windows lit at night.
 */
export function facadeTex(style, wall, windows, seed = 1) {
  return make(
    `facade-${style}-${wall}-${seed}`,
    256,
    384,
    (g, w, h) => {
      const r = mulberry32(seed * 131 + style.length);
      g.fillStyle = wall;
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 1200, ["#000", "#fff"], seed, 2, 0.06);
      if (style === "industrial") {
        // corrugated panels + a few high windows
        for (let x = 0; x < w; x += 8) {
          g.fillStyle = x % 16 ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.05)";
          g.fillRect(x, 0, 4, h);
        }
        for (let y = 40; y < h; y += 128)
          for (let x = 16; x < w; x += 64) {
            const on = r() < 0.35;
            g.fillStyle = on ? windows[Math.floor(r() * windows.length)] : "rgba(10,10,14,0.85)";
            g.globalAlpha = on ? 0.8 : 1;
            g.fillRect(x, y, 34, 16);
          }
        g.globalAlpha = 1;
        return;
      }
      const floors = 3;
      const fh = h / floors;
      const cols = style === "office" || style === "metro" ? 6 : 4;
      const cw = w / cols;
      for (let f = 0; f < floors; f++) {
        // floor slab line
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(0, f * fh + fh - 6, w, 6);
        for (let c = 0; c < cols; c++) {
          const on = r() < (style === "office" ? 0.36 : 0.32);
          const col = windows[Math.floor(r() * windows.length)];
          const x = c * cw + (style === "office" ? 7 : 10);
          const y = f * fh + (style === "office" ? 18 : 26);
          const ww = cw - (style === "office" ? 14 : 20);
          const wh = fh - (style === "office" ? 40 : 54);
          g.fillStyle = on ? col : style === "coastal" ? "#2a3a50" : "#0e1118";
          g.globalAlpha = on ? 0.45 + r() * 0.45 : 1;
          g.fillRect(x, y, ww, wh);
          if (on && style === "apartment" && r() < 0.5) {
            g.fillStyle = "rgba(0,0,0,0.3)";
            g.fillRect(x, y, ww * 0.3, wh); // curtain
          }
          g.globalAlpha = 1;
          if (style === "coastal") {
            g.fillStyle = "rgba(255,255,255,0.5)";
            g.fillRect(x - 3, y + wh, ww + 6, 4); // sill
          }
        }
      }
      if (style === "metro") {
        // vertical light strips
        g.fillStyle = windows[0];
        g.globalAlpha = 0.9;
        g.fillRect(0, 0, 3, h);
        g.fillRect(w - 3, 0, 3, h);
        g.globalAlpha = 1;
      }
    },
    { repeat: true, aniso: 4 },
  );
}

/** Lit shopfront band (ground floor): 8 m × 4 m tile. */
export function shopTex(pal, seed = 1) {
  return make(
    `shop-${pal.windows.join("")}-${seed}`,
    256,
    128,
    (g, w, h) => {
      const r = mulberry32(seed * 17);
      g.fillStyle = "#16181e";
      g.fillRect(0, 0, w, h);
      const n = 2;
      for (let i = 0; i < n; i++) {
        const x = (i * w) / n + 8;
        const ww = w / n - 16;
        const c = pal.neon[Math.floor(r() * pal.neon.length)];
        g.fillStyle = c;
        g.globalAlpha = 0.9;
        g.fillRect(x, 8, ww, 14); // awning sign
        g.globalAlpha = 1;
        g.fillStyle = pal.windows[Math.floor(r() * pal.windows.length)];
        g.globalAlpha = 0.65;
        g.fillRect(x + 4, 32, ww - 8, h - 44);
        g.globalAlpha = 1;
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.fillRect(x + ww / 2 - 10, 44, 20, h - 56); // door
      }
    },
    { repeat: true },
  );
}

/** Neon sign: glowing text on a dark board. */
export function neonTex(text, color) {
  return make(`neon-${text}-${color}`, 512, 160, (g, w, h) => {
    g.fillStyle = "#07080c";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = "#ffffff";
    g.font = `900 ${Math.min(96, Math.floor((w * 1.5) / Math.max(4, text.length)))}px "Arial Black", "Segoe UI", Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowBlur = 26;
    g.fillText(text, w / 2, h / 2 + 4);
    g.fillStyle = color;
    g.shadowBlur = 0;
    g.globalAlpha = 0.35;
    g.fillText(text, w / 2, h / 2 + 4);
    g.globalAlpha = 1;
  });
}

/** Text panel (gates, banners). */
export function labelTex(text, { bg = "#10131c", fg = "#ffffff", accent = "#3dff8a", w = 512, h = 128, font = 64 } = {}) {
  return make(`label-${text}-${bg}-${fg}-${accent}-${w}x${h}`, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    g.fillStyle = fg;
    let size = font;
    g.font = `900 ${size}px "Arial Black", "Segoe UI", Arial, sans-serif`;
    while (g.measureText(text).width > w * 0.9 && size > 18) {
      size -= 4;
      g.font = `900 ${size}px "Arial Black", "Segoe UI", Arial, sans-serif`;
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + 3);
  });
}

/** Black / yellow hazard stripes. */
export function hazardTex(a = "#ffcc1a", b = "#151515") {
  return make(
    `hazard-${a}-${b}`,
    128,
    128,
    (g, w, h) => {
      g.fillStyle = b;
      g.fillRect(0, 0, w, h);
      g.fillStyle = a;
      for (let k = -2; k < 4; k++) {
        g.beginPath();
        g.moveTo(k * 64, 0);
        g.lineTo(k * 64 + 32, 0);
        g.lineTo(k * 64 + 32 + h, h);
        g.lineTo(k * 64 + h, h);
        g.closePath();
        g.fill();
      }
    },
    { repeat: true },
  );
}

/** Corrugated shipping container side. */
export function containerTex(color) {
  return make(
    `container-${color}`,
    128,
    64,
    (g, w, h) => {
      g.fillStyle = color;
      g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 6) {
        g.fillStyle = x % 12 ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.08)";
        g.fillRect(x, 0, 3, h);
      }
      speckle(g, w, h, 300, ["#3a2010", "#000"], 3, 2, 0.3);
    },
    { repeat: true },
  );
}

/** Park grass. */
export function grassTex() {
  return make(
    "grass",
    128,
    128,
    (g, w, h) => {
      g.fillStyle = "#1f3a22";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 2400, ["#2c5230", "#16301a", "#3a6a3c"], 8, 2, 0.6);
    },
    { repeat: true },
  );
}

/** Night water with glints. */
export function waterTex() {
  return make(
    "water",
    256,
    256,
    (g, w, h) => {
      g.fillStyle = "#0a2238";
      g.fillRect(0, 0, w, h);
      const r = mulberry32(5);
      for (let i = 0; i < 700; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(140,200,255,0.25)" : "rgba(0,10,30,0.4)";
        g.fillRect(r() * w, r() * h, 6 + r() * 16, 1.5);
      }
    },
    { repeat: true },
  );
}

/** Soft round dot (particles, glows, light pools). */
export function softDot() {
  return make("softdot", 64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.6)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
}

/** Dark blob shadow under cars. */
export function shadowTex() {
  return make("shadow", 64, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h / 2);
    grd.addColorStop(0, "rgba(0,0,0,0.75)");
    grd.addColorStop(0.55, "rgba(0,0,0,0.45)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

/** Vertical beam gradient (escape zone / checkpoint beacons). */
export function beamTex() {
  return make("beam", 32, 256, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.7, "rgba(255,255,255,0.45)");
    grd.addColorStop(1, "rgba(255,255,255,0.9)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}
