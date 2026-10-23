/**
 * Escape 100 — procedural 2D art: material textures for the ten environments,
 * the symbol glyph set (shared by 3D clues and the React UI as SVG paths) and
 * the renderer that paints clue content (notes, posters, screens, carvings)
 * onto canvases used as textures.
 */

/* ---------------- glyphs (24×24 SVG paths) ---------------- */
export const GLYPHS = {
  sun: "M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10M12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1",
  moon: "M15 3a9 9 0 1 0 6 15a7 7 0 1 1-6-15z",
  star: "M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z",
  eye: "M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  hand: "M8 21v-9L5 9.5a1.6 1.6 0 0 1 2.3-2.2L9 9V3.5a1.5 1.5 0 0 1 3 0V9V2.5a1.5 1.5 0 0 1 3 0V9V4a1.5 1.5 0 0 1 3 0v10c0 4-2.5 7-6 7z",
  fish: "M2 12c4-6 11-6 15 0c-4 6-11 6-15 0zM17 12l5-4v8zM7 11h.01",
  bird: "M2 14c5 0 7-6 12-6c2 0 3 1 4 2l4-1-3 3c0 4-4 7-9 7c-3 0-6-2-8-5z",
  tree: "M12 2l7 9h-4l5 6H4l5-6H5zM11 17h2v5h-2z",
  wave: "M1 9c3-3 5-3 7 0s4 3 7 0 5-3 8 0M1 16c3-3 5-3 7 0s4 3 7 0 5-3 8 0",
  key: "M8 8a5 5 0 1 0 0 8a5 5 0 1 0 0-8M12 12h10M18 12v4M21 12v3",
  crown: "M2 18L4 7l5 5 3-7 3 7 5-5 2 11zM2 21h20",
  heart: "M12 21C5 15 1 11.5 1 7.5A5 5 0 0 1 12 5a5 5 0 0 1 11 2.5C23 11.5 19 15 12 21z",
  spiral: "M12 12a1 1 0 0 1 2 0a3 3 0 0 1-6 0a5 5 0 0 1 10 0a7 7 0 0 1-14 0a9 9 0 0 1 18 0",
  triangle: "M12 3l10 18H2z",
  circle: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18",
  square: "M4 4h16v16H4z",
  cross: "M9 2h6v7h7v6h-7v7H9v-7H2V9h7z",
  diamond: "M12 2l9 10-9 10-9-10z",
  flame: "M12 22c-5 0-8-3.5-8-8 0-4 3-6 4-10 2 2 3 4 3 6 1-1 2-3 2-5 4 3 7 6 7 10 0 4.5-3 7-8 7z",
  drop: "M12 2c4 6 7 9.5 7 13a7 7 0 0 1-14 0c0-3.5 3-7 7-13z",
  leaf: "M4 20C4 9 10 4 21 3c-1 11-6 17-17 17zM4 20l9-9",
  bolt: "M13 2L4 14h7l-2 8 9-12h-7z",
  anchor: "M12 2a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5M12 7v15M7 11h10M3 14c0 5 4 8 9 8s9-3 9-8",
  hourglass: "M6 2h12M6 22h12M7 2c0 6 10 6 10 10S7 16 7 22M17 2c0 6-10 6-10 10s10 4 10 10",
};
export const GLYPH_NAMES = Object.keys(GLYPHS);

export const COLORS = {
  red: "#e8423f",
  blue: "#3b7de8",
  green: "#36b45c",
  yellow: "#f2c230",
  purple: "#9a52e0",
  orange: "#f08a2c",
  white: "#f2f0e8",
  black: "#1c1c22",
  cyan: "#2fd2e0",
  pink: "#ee5fae",
};

/* ---------------- helpers ---------------- */
const mk = (w, h = w) => {
  const c = typeof document !== "undefined" ? document.createElement("canvas") : null;
  if (!c) return null;
  c.width = w;
  c.height = h;
  return c;
};
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function noise(g, w, h, r, amt, light = true) {
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
    if (!light) d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
function blotches(g, w, h, r, n, color, rmax) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rr = 4 + r() * rmax;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, color);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
}

/* ---------------- material textures ---------------- */

export function stoneBlocks({ base = "#6f6a62", mortar = "#3c3833", seed = 1, rows = 6, cols = 4, size = 512, moss = 0 } = {}) {
  const c = mk(size), g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = mortar;
  g.fillRect(0, 0, size, size);
  const bh = size / rows;
  for (let y = 0; y < rows; y++) {
    const off = (y % 2) * 0.5, bw = size / cols;
    for (let x = -1; x <= cols; x++) {
      const px = (x + off) * bw, py = y * bh;
      const v = (r() - 0.5) * 30;
      g.fillStyle = shade(base, v);
      g.beginPath();
      g.roundRect(px + 3, py + 3, bw - 6, bh - 6, 6);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.06)";
      g.fillRect(px + 5, py + 4, bw - 10, 3);
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.fillRect(px + 5, py + bh - 8, bw - 10, 3);
    }
  }
  blotches(g, size, size, r, 40, "rgba(0,0,0,0.12)", 40);
  if (moss) blotches(g, size, size, r, moss, "rgba(70,90,40,0.25)", 30);
  noise(g, size, size, r, 22);
  return c;
}

export function concrete({ base = "#77787a", seed = 2, size = 512, stains = 30, lines = true } = {}) {
  const c = mk(size), g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  blotches(g, size, size, r, stains, "rgba(0,0,0,0.12)", 70);
  blotches(g, size, size, r, stains / 2, "rgba(255,255,255,0.05)", 50);
  if (lines) {
    g.strokeStyle = "rgba(0,0,0,0.25)";
    g.lineWidth = 2;
    g.strokeRect(1, 1, size - 2, size - 2);
    for (let i = 0; i < 6; i++) {
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.beginPath();
      g.arc(24 + (i % 2) * (size - 48), 24 + Math.floor(i / 2) * ((size - 48) / 2), 5, 0, 7);
      g.fill();
    }
  }
  noise(g, size, size, r, 26);
  return c;
}

export function planks({ base = "#7a5233", seed = 3, size = 512, n = 6, vertical = false } = {}) {
  const c = mk(size), g = c.getContext("2d"), r = rng(seed);
  const w = size / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = shade(base, (r() - 0.5) * 34);
    if (vertical) g.fillRect(i * w, 0, w, size);
    else g.fillRect(0, i * w, size, w);
    g.strokeStyle = "rgba(0,0,0,0.15)";
    for (let k = 0; k < 14; k++) {
      g.lineWidth = 1 + r() * 2;
      g.beginPath();
      const o = i * w + r() * w;
      if (vertical) {
        g.moveTo(o, 0);
        g.bezierCurveTo(o + 6, size / 3, o - 6, (2 * size) / 3, o + r() * 4, size);
      } else {
        g.moveTo(0, o);
        g.bezierCurveTo(size / 3, o + 6, (2 * size) / 3, o - 6, size, o + r() * 4);
      }
      g.stroke();
    }
    g.fillStyle = "rgba(0,0,0,0.45)";
    if (vertical) g.fillRect(i * w, 0, 2, size);
    else g.fillRect(0, i * w, size, 2);
    // knots
    for (let k = 0; k < 2; k++) {
      const kx = vertical ? i * w + r() * w : r() * size, ky = vertical ? r() * size : i * w + r() * w;
      g.fillStyle = "rgba(40,20,5,0.35)";
      g.beginPath();
      g.ellipse(kx, ky, 5 + r() * 6, 3 + r() * 3, 0, 0, 7);
      g.fill();
    }
  }
  noise(g, size, size, r, 14);
  return c;
}

export function wallpaper({ base = "#5b2a34", ink = "rgba(240,200,150,0.18)", seed = 4, size = 512, stripe = "rgba(0,0,0,0.12)" } = {}) {
  const c = mk(size), g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  g.fillStyle = stripe;
  for (let x = 0; x < size; x += 64) g.fillRect(x, 0, 6, size);
  g.fillStyle = ink;
  for (let y = 0; y < size; y += 128)
    for (let x = 0; x < size; x += 128) {
      const ox = x + ((y / 128) % 2) * 64 + 32, oy = y + 64;
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.ellipse(ox + Math.cos(a) * 16, oy + Math.sin(a) * 22, 7, 13, a, 0, 7);
      }
      g.fill();
      g.beginPath();
      g.arc(ox, oy, 7, 0, 7);
      g.fill();
    }
  blotches(g, size, size, r, 20, "rgba(0,0,0,0.16)", 60);
  noise(g, size, size, r, 12);
  return c;
}

export function tiles({ a = "#d9dde0", b = "#c9cfd3", grout = "#8f979c", n = 8, seed = 5, size = 512, checker = false, dirt = 20 } = {}) {
  const c = mk(size), g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = grout;
  g.fillRect(0, 0, size, size);
  const t = size / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      g.fillStyle = shade(checker ? ((x + y) % 2 ? a : b) : r() < 0.5 ? a : b, (r() - 0.5) * 10);
      g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
      g.fillStyle = "rgba(255,255,255,0.08)";
      g.fillRect(x * t + 3, y * t + 3, t - 6, 3);
    }
  blotches(g, size, size, r, dirt, "rgba(60,50,30,0.12)", 50);
  noise(g, size, size, r, 10);
  return c;
}

export function metalPlates({ base = "#5d636b", seed = 6, size = 512, n = 2, rust = 0, rivets = true, stripes = false } = {}) {
  const c = mk(size), g = c.getContext("2d"), r = rng(seed);
  const t = size / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const gr = g.createLinearGradient(x * t, y * t, x * t + t, y * t + t);
      gr.addColorStop(0, shade(base, 12 + (r() - 0.5) * 10));
      gr.addColorStop(1, shade(base, -14));
      g.fillStyle = gr;
      g.fillRect(x * t, y * t, t, t);
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.lineWidth = 3;
      g.strokeRect(x * t + 1.5, y * t + 1.5, t - 3, t - 3);
      if (rivets)
        for (const [rx, ry] of [[14, 14], [t - 14, 14], [14, t - 14], [t - 14, t - 14]]) {
          g.fillStyle = "rgba(0,0,0,0.45)";
          g.beginPath();
          g.arc(x * t + rx + 1, y * t + ry + 1, 5, 0, 7);
          g.fill();
          g.fillStyle = shade(base, 40);
          g.beginPath();
          g.arc(x * t + rx, y * t + ry, 4, 0, 7);
          g.fill();
        }
    }
  // brushed streaks
  g.globalAlpha = 0.06;
  for (let i = 0; i < 300; i++) {
    g.fillStyle = r() < 0.5 ? "#fff" : "#000";
    g.fillRect(0, r() * size, size, 1);
  }
  g.globalAlpha = 1;
  if (stripes) {
    g.save();
    g.beginPath();
    g.rect(0, size - 40, size, 40);
    g.clip();
    for (let x = -40; x < size + 40; x += 40) {
      g.fillStyle = "#e8b520";
      g.beginPath();
      g.moveTo(x, size);
      g.lineTo(x + 20, size);
      g.lineTo(x + 60, size - 40);
      g.lineTo(x + 40, size - 40);
      g.fill();
    }
    g.restore();
  }
  if (rust) blotches(g, size, size, r, rust, "rgba(130,60,20,0.35)", 45);
  noise(g, size, size, r, 14);
  return c;
}

export function sandstone({ base = "#b8925e", seed = 7, size = 512, carvings = true } = {}) {
  const c = stoneBlocks({ base, mortar: shade(base, -50), seed, rows: 4, cols: 3, size });
  const g = c.getContext("2d"), r = rng(seed + 9);
  if (carvings) {
    g.strokeStyle = "rgba(60,35,10,0.35)";
    g.lineWidth = 4;
    const names = GLYPH_NAMES;
    for (let i = 0; i < 7; i++) {
      const p = typeof Path2D !== "undefined" ? new Path2D(GLYPHS[names[Math.floor(r() * names.length)]]) : null;
      if (!p) break;
      g.save();
      g.translate(30 + r() * (size - 90), 30 + r() * (size - 90));
      g.scale(2.2, 2.2);
      g.stroke(p);
      g.restore();
    }
  }
  return c;
}

export function carpet({ base = "#6a1e2a", accent = "#c89b3c", seed = 8, size = 512 } = {}) {
  const c = mk(size), g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = accent;
  g.globalAlpha = 0.45;
  g.lineWidth = 6;
  for (let y = 0; y < size; y += 128)
    for (let x = 0; x < size; x += 128) {
      g.beginPath();
      g.moveTo(x + 64, y + 8);
      g.lineTo(x + 120, y + 64);
      g.lineTo(x + 64, y + 120);
      g.lineTo(x + 8, y + 64);
      g.closePath();
      g.stroke();
      g.beginPath();
      g.arc(x + 64, y + 64, 14, 0, 7);
      g.stroke();
    }
  g.globalAlpha = 1;
  noise(g, size, size, r, 30);
  return c;
}

export function spacePanel({ base = "#c9cfd6", seed = 9, size = 512, glow = "#38d7ff" } = {}) {
  const c = mk(size), g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = 4;
  g.strokeRect(8, 8, size - 16, size - 16);
  g.strokeRect(40, 40, size - 80, size - 80);
  g.fillStyle = "rgba(0,0,0,0.08)";
  g.fillRect(40, 40, size - 80, size - 80);
  for (let i = 0; i < 6; i++) {
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(60 + i * 30, size - 70, 18, 8);
  }
  g.fillStyle = glow;
  g.globalAlpha = 0.85;
  g.fillRect(size / 2 - 60, 20, 120, 6);
  g.globalAlpha = 1;
  noise(g, size, size, r, 8);
  return c;
}

export function surreal({ a = "#1d1a3a", b = "#e8e4ff", seed = 10, size = 512 } = {}) {
  const c = mk(size), g = c.getContext("2d");
  const n = 8, t = size / n;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? a : b;
      g.fillRect(x * t, y * t, t, t);
    }
  g.strokeStyle = "rgba(160,120,255,0.5)";
  g.lineWidth = 3;
  g.strokeRect(0, 0, size, size);
  return c;
}

export function starfield(size = 1024, seed = 11) {
  const c = mk(size, size / 2), g = c.getContext("2d"), r = rng(seed);
  g.fillStyle = "#02030a";
  g.fillRect(0, 0, size, size / 2);
  blotches(g, size, size / 2, r, 8, "rgba(80,40,160,0.18)", 220);
  blotches(g, size, size / 2, r, 6, "rgba(30,120,200,0.14)", 180);
  for (let i = 0; i < 900; i++) {
    const s = r();
    g.fillStyle = `rgba(255,255,255,${0.3 + s * 0.7})`;
    g.fillRect(r() * size, (r() * size) / 2, s > 0.97 ? 2 : 1, s > 0.97 ? 2 : 1);
  }
  return c;
}

export function glowSprite(color = "#ffd29a", size = 128) {
  const c = mk(size), g = c.getContext("2d");
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, color);
  gr.addColorStop(0.35, color + "88");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

export function dustSprite(size = 64) {
  return glowSprite("#ffffff", size);
}

export function canvasPainting({ seed = 12, size = 256, palette = ["#2c3e50", "#c0392b", "#e6b35a", "#5d8a4e"] } = {}) {
  const c = mk(size, Math.round(size * 1.25)), g = c.getContext("2d"), r = rng(seed), h = c.height;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, palette[0]);
  sky.addColorStop(1, palette[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, size, h);
  g.fillStyle = palette[3];
  g.beginPath();
  g.moveTo(0, h * 0.7);
  for (let x = 0; x <= size; x += 16) g.lineTo(x, h * (0.62 + Math.sin(x * 0.03 + seed) * 0.06));
  g.lineTo(size, h);
  g.lineTo(0, h);
  g.fill();
  g.fillStyle = palette[1];
  g.beginPath();
  g.arc(size * (0.3 + r() * 0.4), h * 0.3, size * 0.1, 0, 7);
  g.fill();
  noise(g, size, h, r, 20);
  return c;
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v) => Math.max(0, Math.min(255, v + amt)) | 0;
  return `rgb(${cl(n >> 16)},${cl((n >> 8) & 255)},${cl(n & 255)})`;
}

/* ---------------- clue content ---------------- */

const STYLES = {
  paper: { bg: "#efe6cf", ink: "#2b2418", font: "'Caveat', 'Segoe Print', 'Bradley Hand', cursive", edge: "#c9b991" },
  poster: { bg: "#f4efe2", ink: "#1f2a3a", font: "'Oswald', 'Arial Narrow', sans-serif", edge: "#b03a2e" },
  chalk: { bg: "#23332a", ink: "#f2f2e8", font: "'Caveat', 'Segoe Print', cursive", edge: "#6b4a2a" },
  screen: { bg: "#06130f", ink: "#5cff9d", font: "'Courier New', monospace", edge: "#0f3d2a", glow: true },
  holo: { bg: "#03121c", ink: "#7fe9ff", font: "'Courier New', monospace", edge: "#1a6c8a", glow: true },
  stone: { bg: "#8b7a5e", ink: "#2d2213", font: "'Trajan Pro', 'Times New Roman', serif", edge: "#5e4f37", carve: true },
  brass: { bg: "#b08a3e", ink: "#2a1d08", font: "'Georgia', serif", edge: "#6d5220" },
  card: { bg: "#ffffff", ink: "#202020", font: "'Georgia', serif", edge: "#999" },
  neon: { bg: "#120a24", ink: "#ff7af0", font: "'Courier New', monospace", edge: "#5a2a8a", glow: true },
};
export const CLUE_STYLES = Object.keys(STYLES);

function drawGlyph(g, name, x, y, s, color, fill = false) {
  if (typeof Path2D === "undefined" || !GLYPHS[name]) return;
  g.save();
  g.translate(x - s / 2, y - s / 2);
  g.scale(s / 24, s / 24);
  const p = new Path2D(GLYPHS[name]);
  g.lineWidth = 2;
  g.lineJoin = g.lineCap = "round";
  g.strokeStyle = color;
  g.fillStyle = color;
  if (fill) g.fill(p);
  else g.stroke(p);
  g.restore();
}

/**
 * Paints clue content: { style, title, lines: [string], glyphs: [name],
 * colors: [name], big (one large string), grid: [[…]] , footer }
 */
export function paintClue(content, w = 512, h = 384) {
  const c = mk(w, h);
  if (!c) return null;
  const g = c.getContext("2d");
  const S = STYLES[content.style || "paper"];
  g.fillStyle = S.bg;
  g.fillRect(0, 0, w, h);
  if (content.style === "paper" || !content.style) {
    const r = rng(content.title?.length ?? 3);
    blotches(g, w, h, r, 10, "rgba(120,90,40,0.12)", 60);
    g.strokeStyle = "rgba(80,100,160,0.18)";
    for (let y = 60; y < h; y += 34) {
      g.beginPath();
      g.moveTo(16, y);
      g.lineTo(w - 16, y);
      g.stroke();
    }
  }
  if (S.glow) {
    g.fillStyle = "rgba(255,255,255,0.03)";
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  }
  g.strokeStyle = S.edge;
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = S.ink;
  g.strokeStyle = S.ink;
  if (S.glow) {
    g.shadowColor = S.ink;
    g.shadowBlur = 12;
  }
  g.textAlign = "center";
  g.textBaseline = "middle";
  let y = 34;
  if (content.title) {
    g.font = `bold 34px ${S.font}`;
    g.fillText(content.title, w / 2, y + 8, w - 40);
    y += 52;
  }
  const area = h - y - (content.footer ? 40 : 16);
  if (content.big) {
    const fs = Math.min(150, (w - 60) / Math.max(1, String(content.big).length) * 1.6, area * 0.9);
    g.font = `bold ${fs}px ${S.font}`;
    g.fillText(content.big, w / 2, y + area / 2, w - 40);
    y += area;
  }
  if (content.glyphs?.length) {
    const n = content.glyphs.length, s = Math.min(90, (w - 60) / n - 12, area * 0.8);
    content.glyphs.forEach((gname, i) => {
      const x = w / 2 + (i - (n - 1) / 2) * (s + 14);
      const gy = y + (content.lines?.length ? s / 2 + 6 : area / 2);
      if (content.glyphColors) drawGlyph(g, gname, x, gy, s, COLORS[content.glyphColors[i]] || content.glyphColors[i], true);
      else drawGlyph(g, gname, x, gy, s, S.ink);
      if (content.glyphNums) {
        g.font = `bold 28px ${S.font}`;
        g.fillText(String(content.glyphNums[i]), x, gy + s / 2 + 22);
      }
    });
    y += s + (content.glyphNums ? 50 : 18);
  }
  if (content.colors?.length) {
    const n = content.colors.length, s = Math.min(80, (w - 60) / n - 14);
    content.colors.forEach((col, i) => {
      const x = w / 2 + (i - (n - 1) / 2) * (s + 14);
      g.fillStyle = COLORS[col] || col;
      g.beginPath();
      g.roundRect(x - s / 2, y + 6, s, s, 10);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0,0,0,0.5)";
      g.stroke();
    });
    g.fillStyle = S.ink;
    g.strokeStyle = S.ink;
    y += s + 22;
  }
  if (content.grid) {
    const rows = content.grid.length, cols = content.grid[0].length;
    const cs = Math.min((w - 80) / cols, (area - 10) / rows);
    const x0 = w / 2 - (cols * cs) / 2;
    g.font = `bold ${cs * 0.5}px ${S.font}`;
    g.lineWidth = 2;
    content.grid.forEach((row, ry) =>
      row.forEach((v, rx) => {
        const cx = x0 + rx * cs, cy = y + ry * cs;
        g.strokeRect(cx, cy, cs, cs);
        if (v === "#") g.fillRect(cx + 4, cy + 4, cs - 8, cs - 8);
        else if (GLYPHS[v]) drawGlyph(g, v, cx + cs / 2, cy + cs / 2, cs * 0.7, S.ink);
        else if (v) g.fillText(String(v), cx + cs / 2, cy + cs / 2);
      }),
    );
    y += rows * cs + 10;
  }
  if (content.lines?.length) {
    const n = content.lines.length;
    const fs = Math.max(18, Math.min(38, (h - y - 20) / n / 1.25));
    g.font = `${fs}px ${S.font}`;
    content.lines.forEach((ln, i) => g.fillText(ln, w / 2, y + fs * 0.7 + i * fs * 1.25, w - 40));
  }
  if (content.footer) {
    g.font = `italic 22px ${S.font}`;
    g.fillText(content.footer, w / 2, h - 26, w - 40);
  }
  return c;
}
