/**
 * Stunt Racer 3D — procedural canvas textures (no image assets). Every
 * texture is cached by key and released by disposeTextures() when the game
 * unmounts.
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

function speckle(g, w, h, n, colors, seed, size = 2, alpha = 0.35) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.globalAlpha = alpha * (0.3 + r() * 0.7);
    g.fillRect(r() * w, r() * h, size * (0.5 + r()), size * (0.5 + r()));
  }
  g.globalAlpha = 1;
}

/** Road deck: u across the width (0 = right edge, 1 = left), v along 16 m. */
export function roadTex(road, night = false) {
  return make(
    `road-${road.deck}-${road.edge}-${road.line}`,
    256,
    512,
    (g, w, h) => {
      g.fillStyle = road.deck;
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 2200, ["#000000", "#2a2a2a", "#6a6a6a"], 7, 1.5);
      // tyre-worn lanes
      g.globalAlpha = 0.08;
      g.fillStyle = "#000";
      g.fillRect(w * 0.22, 0, w * 0.12, h);
      g.fillRect(w * 0.66, 0, w * 0.12, h);
      g.globalAlpha = 1;
      // kerb stripes along both edges
      const kw = w * 0.055;
      for (let y = 0; y < h; y += 64) {
        g.fillStyle = road.edge;
        g.fillRect(0, y, kw, 32);
        g.fillRect(w - kw, y, kw, 32);
        g.fillStyle = road.edge2;
        g.fillRect(0, y + 32, kw, 32);
        g.fillRect(w - kw, y + 32, kw, 32);
      }
      // solid inner edge lines
      g.fillStyle = road.line;
      g.globalAlpha = night ? 1 : 0.9;
      g.fillRect(kw + 6, 0, 5, h);
      g.fillRect(w - kw - 11, 0, 5, h);
      // dashed centre line
      for (let y = 0; y < h; y += 128) g.fillRect(w / 2 - 3, y + 20, 6, 64);
      g.globalAlpha = 1;
    },
    { repeat: true, aniso: 8 },
  );
}

/** Ramp surface: bold chevrons pointing up the ramp. */
export function rampTex(road) {
  return make(
    `ramp-${road.ramp}-${road.deck}`,
    256,
    256,
    (g, w, h) => {
      g.fillStyle = road.deck;
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 700, ["#000", "#555"], 11, 1.5);
      g.fillStyle = road.ramp;
      for (let k = 0; k < 2; k++) {
        const y0 = k * 128 + 24;
        g.beginPath();
        g.moveTo(w * 0.1, y0 + 70);
        g.lineTo(w * 0.5, y0);
        g.lineTo(w * 0.9, y0 + 70);
        g.lineTo(w * 0.9, y0 + 100);
        g.lineTo(w * 0.5, y0 + 30);
        g.lineTo(w * 0.1, y0 + 100);
        g.closePath();
        g.fill();
      }
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 10, h);
      g.fillRect(w - 10, 0, 10, h);
    },
    { repeat: true, aniso: 8 },
  );
}

/** Start platform: grid squares. */
export function startTex(road) {
  return make(
    `start-${road.deck}-${road.accent}`,
    256,
    256,
    (g, w, h) => {
      g.fillStyle = road.deck;
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 600, ["#000", "#555"], 3, 1.5);
      g.strokeStyle = road.accent;
      g.globalAlpha = 0.55;
      g.lineWidth = 4;
      for (let x = 0; x <= w; x += 64) {
        g.beginPath();
        g.moveTo(x, 0);
        g.lineTo(x, h);
        g.stroke();
      }
      for (let y = 0; y <= h; y += 64) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(w, y);
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    { repeat: true },
  );
}

/** Checkered strip (start / finish line, finish banner). */
export function checkerTex(n = 8) {
  return make(
    `checker-${n}`,
    256,
    64,
    (g, w, h) => {
      const s = w / n / 2;
      for (let y = 0; y < h / s; y++)
        for (let x = 0; x < n * 2; x++) {
          g.fillStyle = (x + y) % 2 ? "#111" : "#fff";
          g.fillRect(x * s, y * s, s, s);
        }
    },
    { repeat: true },
  );
}

/** Deck side panels: colour + accent stripe + rivets. */
export function sideTex(road) {
  return make(
    `side-${road.side}-${road.accent}`,
    256,
    64,
    (g, w, h) => {
      g.fillStyle = road.side;
      g.fillRect(0, 0, w, h);
      g.fillStyle = road.accent;
      g.fillRect(0, h * 0.18, w, h * 0.16);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(0, h - 8, w, 8);
      for (let x = 16; x < w; x += 64) {
        g.fillStyle = "rgba(0,0,0,0.25)";
        g.fillRect(x, h * 0.45, 2, h * 0.4);
      }
    },
    { repeat: true },
  );
}

/** Boost pad arrows (scrolled in the shader via offset). */
export function boostTex() {
  return make(
    "boost",
    128,
    256,
    (g, w, h) => {
      g.fillStyle = "#0a2a6a";
      g.fillRect(0, 0, w, h);
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, "#38e8ff");
      grd.addColorStop(1, "#ff3ad0");
      g.fillStyle = grd;
      for (let k = 0; k < 2; k++) {
        const y0 = k * 128 + 20;
        g.beginPath();
        g.moveTo(w * 0.12, y0 + 70);
        g.lineTo(w * 0.5, y0 + 10);
        g.lineTo(w * 0.88, y0 + 70);
        g.lineTo(w * 0.88, y0 + 98);
        g.lineTo(w * 0.5, y0 + 40);
        g.lineTo(w * 0.12, y0 + 98);
        g.closePath();
        g.fill();
      }
    },
    { repeat: true },
  );
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

/** Soft round dot (particles, glows, sun). */
export function softDot() {
  return make("softdot", 64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.65)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
}

/** Dark blob shadow. */
export function shadowTex() {
  return make("shadow", 64, 128, (g, w, h) => {
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h / 2);
    grd.addColorStop(0, "rgba(0,0,0,0.7)");
    grd.addColorStop(0.55, "rgba(0,0,0,0.45)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.save();
    g.scale(1, 1);
    g.fillRect(0, 0, w, h);
    g.restore();
  });
}

/** Puffy cloud (billboards). */
export function cloudTex(seed = 1) {
  return make(`cloud-${seed}`, 256, 128, (g, w, h) => {
    const r = mulberry32(seed * 31 + 5);
    for (let i = 0; i < 26; i++) {
      const x = w * (0.15 + r() * 0.7);
      const y = h * (0.45 + r() * 0.25) - Math.sin((x / w) * Math.PI) * h * 0.12;
      const rad = h * (0.16 + r() * 0.22) * Math.sin((x / w) * Math.PI);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, "rgba(255,255,255,0.95)");
      grd.addColorStop(0.6, "rgba(255,255,255,0.55)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // soft shaded underside
    const sh = g.createLinearGradient(0, h * 0.4, 0, h);
    sh.addColorStop(0, "rgba(0,0,0,0)");
    sh.addColorStop(1, "rgba(60,80,110,0.25)");
    g.globalCompositeOperation = "source-atop";
    g.fillStyle = sh;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "source-over";
  });
}

/** Tileable cloud-sea layer (seen from above). */
export function cloudSeaTex(tint = "#ffffff") {
  return make(
    `cloudsea-${tint}`,
    512,
    512,
    (g, w, h) => {
      g.clearRect(0, 0, w, h);
      const r = mulberry32(77);
      for (let i = 0; i < 220; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 30 + r() * 70;
        for (const [dx, dy] of [
          [0, 0],
          [w, 0],
          [-w, 0],
          [0, h],
          [0, -h],
        ]) {
          const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, rad);
          grd.addColorStop(0, "rgba(255,255,255,0.55)");
          grd.addColorStop(1, "rgba(255,255,255,0)");
          g.fillStyle = grd;
          g.fillRect(x + dx - rad, y + dy - rad, rad * 2, rad * 2);
        }
      }
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = tint;
      g.globalAlpha = 0.35;
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
    },
    { repeat: true },
  );
}

/** Sand / rock ground. */
export function sandTex() {
  return make(
    "sand",
    256,
    256,
    (g, w, h) => {
      g.fillStyle = "#d9a26a";
      g.fillRect(0, 0, w, h);
      speckle(g, w, h, 5000, ["#b9824e", "#e8b884", "#c48f5a", "#f0c898"], 19, 3);
      g.strokeStyle = "rgba(150,90,50,0.18)";
      g.lineWidth = 3;
      for (let y = 10; y < h; y += 26) {
        g.beginPath();
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * 0.05 + y) * 5);
        g.stroke();
      }
    },
    { repeat: true },
  );
}

/** Layered sandstone (mesa walls). */
export function rockTex() {
  return make(
    "rock",
    128,
    256,
    (g, w, h) => {
      const bands = ["#b5643c", "#c8784a", "#a85434", "#d48a58", "#b86a40", "#9c4c30"];
      let y = 0;
      const r = mulberry32(41);
      while (y < h) {
        const bh = 8 + r() * 26;
        g.fillStyle = bands[Math.floor(r() * bands.length)];
        g.fillRect(0, y, w, bh);
        y += bh;
      }
      speckle(g, w, h, 1500, ["#7a3a20", "#e8a070"], 43, 2);
    },
    { repeat: true },
  );
}

/** Skyscraper windows (night: lit). */
export function windowsTex(night = true, seed = 1) {
  return make(
    `windows-${night}-${seed}`,
    128,
    256,
    (g, w, h) => {
      g.fillStyle = night ? "#0c0b18" : "#7a8aa0";
      g.fillRect(0, 0, w, h);
      const r = mulberry32(seed * 97);
      const lit = night ? ["#ffd98a", "#8af0ff", "#ff9ae8", "#fff2c8"] : ["#c8dcf0", "#e8f2ff"];
      for (let y = 6; y < h; y += 12)
        for (let x = 6; x < w; x += 12) {
          const on = r() < (night ? 0.42 : 0.9);
          g.fillStyle = on ? lit[Math.floor(r() * lit.length)] : night ? "#15132a" : "#5a6a80";
          g.globalAlpha = on ? 0.6 + r() * 0.4 : 1;
          g.fillRect(x, y, 7, 8);
        }
      g.globalAlpha = 1;
    },
    { repeat: true },
  );
}

/** Text panel for signs / gates. */
export function labelTex(text, { bg = "#10131c", fg = "#ffffff", accent = "#ff4a3a", w = 512, h = 128, font = 64 } = {}) {
  return make(`label-${text}-${bg}-${fg}-${accent}-${w}x${h}`, w, h, (g) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = accent;
    g.fillRect(0, 0, w, 10);
    g.fillRect(0, h - 10, w, 10);
    g.fillStyle = fg;
    g.font = `900 ${font}px "Arial Black", "Segoe UI", Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    let size = font;
    while (g.measureText(text).width > w * 0.9 && size > 18) {
      size -= 4;
      g.font = `900 ${size}px "Arial Black", "Segoe UI", Arial, sans-serif`;
    }
    g.fillText(text, w / 2, h / 2 + 3);
  });
}

/** Water: deep → shallow with sparkle (scrolled). */
export function waterTex() {
  return make(
    "water",
    256,
    256,
    (g, w, h) => {
      g.fillStyle = "#1aa6c8";
      g.fillRect(0, 0, w, h);
      const r = mulberry32(5);
      for (let i = 0; i < 900; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.35)" : "rgba(10,90,140,0.35)";
        const x = r() * w;
        const y = r() * h;
        g.fillRect(x, y, 6 + r() * 14, 1.5);
      }
    },
    { repeat: true },
  );
}

/** Scrolling waterfall streaks. */
export function fallTex() {
  return make(
    "waterfall",
    64,
    256,
    (g, w, h) => {
      g.fillStyle = "#bff4ff";
      g.fillRect(0, 0, w, h);
      const r = mulberry32(9);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.9)" : "rgba(80,190,230,0.6)";
        g.fillRect(r() * w, r() * h, 2 + r() * 3, 20 + r() * 50);
      }
    },
    { repeat: true },
  );
}
