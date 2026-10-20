/**
 * Haunted Mansion Escape — procedural canvas art: surface textures, painted
 * portraits and the five gallery scenes. Puzzle modals reuse the same images
 * (as data URLs), so the painting you hang is the painting you saw.
 */
function rand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}
const shade = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

/* ------------------------------------------------------------ surfaces */
export function woodCanvas(seed = 1, base = "#4a2e1c") {
  const [c, x] = makeCanvas(512, 512);
  const r = rand(seed);
  const rows = 8, h = 512 / rows;
  for (let i = 0; i < rows; i++) {
    let off = -r() * 300;
    while (off < 512) {
      const len = 180 + r() * 260;
      x.fillStyle = shade(base, 0.75 + r() * 0.45);
      x.fillRect(off, i * h, len, h);
      x.strokeStyle = "rgba(0,0,0,0.12)";
      for (let g = 0; g < 9; g++) {
        x.beginPath();
        const y = i * h + r() * h;
        x.moveTo(off, y);
        x.bezierCurveTo(off + len * 0.3, y + (r() - 0.5) * 6, off + len * 0.6, y + (r() - 0.5) * 6, off + len, y + (r() - 0.5) * 4);
        x.lineWidth = 0.6 + r();
        x.stroke();
      }
      x.fillStyle = "rgba(0,0,0,0.55)";
      x.fillRect(off, i * h, 2, h);
      off += len;
    }
    x.fillStyle = "rgba(0,0,0,0.6)";
    x.fillRect(0, i * h, 512, 2);
  }
  return c;
}
export function stoneCanvas(seed = 2, base = "#4a4540") {
  const [c, x] = makeCanvas(512, 512);
  const r = rand(seed);
  x.fillStyle = "#1c1a18";
  x.fillRect(0, 0, 512, 512);
  const rows = 6, h = 512 / rows;
  for (let i = 0; i < rows; i++) {
    let off = i % 2 ? -64 : 0;
    while (off < 512) {
      const w = 110 + r() * 70;
      x.fillStyle = shade(base, 0.7 + r() * 0.5);
      x.fillRect(off + 3, i * h + 3, w - 6, h - 6);
      for (let k = 0; k < 40; k++) {
        x.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
        x.fillRect(off + r() * w, i * h + r() * h, 2 + r() * 6, 2 + r() * 6);
      }
      off += w;
    }
  }
  return c;
}
export function wallpaperCanvas(base, seed = 3) {
  const [c, x] = makeCanvas(512, 512);
  const r = rand(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 512);
  // damask: repeating medallions + stripes
  x.fillStyle = shade(base, 1.28);
  x.globalAlpha = 0.35;
  for (let gy = 0; gy < 4; gy++)
    for (let gx = 0; gx < 4; gx++) {
      const cx = gx * 128 + (gy % 2 ? 64 : 0) + 32, cy = gy * 128 + 64;
      x.beginPath();
      x.ellipse(cx, cy, 18, 34, 0, 0, Math.PI * 2);
      x.fill();
      for (let k = 0; k < 4; k++) {
        x.beginPath();
        x.ellipse(cx + Math.cos((k * Math.PI) / 2) * 26, cy + Math.sin((k * Math.PI) / 2) * 30, 9, 5, (k * Math.PI) / 2, 0, Math.PI * 2);
        x.fill();
      }
    }
  x.globalAlpha = 0.18;
  for (let s = 0; s < 512; s += 64) x.fillRect(s, 0, 3, 512);
  x.globalAlpha = 1;
  // age: stains and grime
  for (let k = 0; k < 30; k++) {
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 30 + r() * 80);
    g.addColorStop(0, "rgba(20,10,5,0.22)");
    g.addColorStop(1, "rgba(20,10,5,0)");
    x.save();
    x.translate(r() * 512, r() * 512);
    x.fillStyle = g;
    x.fillRect(-110, -110, 220, 220);
    x.restore();
  }
  return c;
}
export function rugCanvas(base, seed = 4) {
  const [c, x] = makeCanvas(512, 340);
  const r = rand(seed);
  x.fillStyle = base;
  x.fillRect(0, 0, 512, 340);
  x.strokeStyle = "#c9a24a";
  x.lineWidth = 10;
  x.strokeRect(22, 22, 468, 296);
  x.strokeStyle = "#1d1630";
  x.lineWidth = 6;
  x.strokeRect(42, 42, 428, 256);
  x.fillStyle = "#1d1630";
  x.beginPath();
  x.ellipse(256, 170, 110, 70, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = "#c9a24a";
  x.beginPath();
  x.ellipse(256, 170, 60, 36, 0, 0, Math.PI * 2);
  x.fill();
  for (let k = 0; k < 1800; k++) {
    x.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.1)";
    x.fillRect(r() * 512, r() * 340, 2, 2);
  }
  return c;
}

/* ------------------------------------------------------------ text */
export function textCanvas(lines, { w = 512, h = 256, bg = null, color = "#e8d7b0", font = "Georgia, serif", size = 36, mirror = false, scratch = false } = {}) {
  const [c, x] = makeCanvas(w, h);
  if (bg) {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
  }
  if (mirror) {
    x.translate(w, 0);
    x.scale(-1, 1);
  }
  x.fillStyle = color;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.font = `${size}px ${font}`;
  const r = rand(9);
  lines.forEach((l, i) => {
    const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.25;
    if (scratch) {
      x.save();
      x.translate(w / 2, y);
      x.rotate((r() - 0.5) * 0.06);
      x.shadowColor = "rgba(0,0,0,0.8)";
      x.shadowBlur = 4;
      x.fillText(l, 0, 0);
      x.restore();
    } else x.fillText(l, w / 2, y);
  });
  return c;
}

/* ------------------------------------------------------------ paintings */
function varnish(x, w, h, seed) {
  const r = rand(seed);
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(10,5,0,0.7)");
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  x.fillStyle = "rgba(160,110,30,0.12)";
  x.fillRect(0, 0, w, h);
  x.strokeStyle = "rgba(0,0,0,0.18)";
  x.lineWidth = 0.6;
  for (let k = 0; k < 70; k++) {
    x.beginPath();
    let px = r() * w, py = r() * h;
    x.moveTo(px, py);
    for (let s = 0; s < 4; s++) x.lineTo((px += (r() - 0.5) * 30), (py += (r() - 0.5) * 30));
    x.stroke();
  }
  for (let k = 0; k < 2500; k++) {
    x.fillStyle = r() < 0.5 ? "rgba(255,240,200,0.04)" : "rgba(0,0,0,0.07)";
    x.fillRect(r() * w, r() * h, 2, 2);
  }
}
function bg(x, w, h, c1, c2) {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
}
function ell(x, cx, cy, rx, ry, col) {
  x.fillStyle = col;
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  x.fill();
}
function person(x, cx, base, s, { coat, skin = "#d9b99a", hair, dress = false, veil = false, collar = null }) {
  // shoulders / body
  x.fillStyle = coat;
  x.beginPath();
  if (dress) {
    x.moveTo(cx - 26 * s, base - 120 * s);
    x.quadraticCurveTo(cx - 70 * s, base, cx - 80 * s, base);
    x.lineTo(cx + 80 * s, base);
    x.quadraticCurveTo(cx + 70 * s, base, cx + 26 * s, base - 120 * s);
  } else {
    x.moveTo(cx - 70 * s, base);
    x.quadraticCurveTo(cx - 66 * s, base - 110 * s, cx - 20 * s, base - 128 * s);
    x.lineTo(cx + 20 * s, base - 128 * s);
    x.quadraticCurveTo(cx + 66 * s, base - 110 * s, cx + 70 * s, base);
  }
  x.closePath();
  x.fill();
  if (collar) {
    x.fillStyle = collar;
    x.beginPath();
    x.moveTo(cx - 14 * s, base - 128 * s);
    x.lineTo(cx, base - 100 * s);
    x.lineTo(cx + 14 * s, base - 128 * s);
    x.fill();
  }
  ell(x, cx, base - 132 * s, 11 * s, 10 * s, skin); // neck
  ell(x, cx, base - 160 * s, 22 * s, 28 * s, skin);
  if (hair) {
    x.fillStyle = hair;
    x.beginPath();
    x.ellipse(cx, base - 172 * s, 25 * s, 20 * s, 0, Math.PI, 0);
    x.fill();
  }
  if (veil) {
    x.fillStyle = "rgba(10,8,12,0.78)";
    x.beginPath();
    x.ellipse(cx, base - 160 * s, 30 * s, 40 * s, 0, 0, Math.PI * 2);
    x.fill();
  }
  // eyes
  ell(x, cx - 8 * s, base - 162 * s, 2.6 * s, 2 * s, "#1a1210");
  ell(x, cx + 8 * s, base - 162 * s, 2.6 * s, 2 * s, "#1a1210");
}
const SUBJECTS = {
  edmund(x, w, h) {
    bg(x, w, h, "#2b2219", "#0f0b08");
    person(x, w / 2, h, 1.4, { coat: "#121014", hair: "#2a1d14", collar: "#d8d2c4" });
    x.fillStyle = "#3a2618";
    x.fillRect(w / 2 - 12, h - 1.4 * 150, 24, 4); // moustache
  },
  evelyn(x, w, h) {
    bg(x, w, h, "#3a2a2a", "#120a0a");
    person(x, w / 2, h, 1.35, { coat: "#6a1b26", hair: "#3b2416", dress: true });
    ell(x, w / 2, h - 1.35 * 205, 16, 14, "#3b2416"); // bun
    for (let i = -3; i <= 3; i++) ell(x, w / 2 + i * 6, h - 1.35 * 122 + Math.abs(i) * -2, 2.5, 2.5, "#f2ead8");
  },
  clara(x, w, h) {
    bg(x, w, h, "#24303a", "#0b0f14");
    person(x, w / 2, h, 1.15, { coat: "#7d9bb5", hair: "#d8b45e", dress: true, skin: "#e6c9ad" });
    ell(x, w / 2 - 26, h - 1.15 * 150, 9, 22, "#d8b45e");
    ell(x, w / 2 + 26, h - 1.15 * 150, 9, 22, "#d8b45e");
  },
  guest(x, w, h) {
    bg(x, w, h, "#1d1a24", "#08070b");
    person(x, w / 2, h, 1.35, { coat: "#0d0c10", hair: "#0d0c10", veil: true, dress: true, skin: "#bfb4a8" });
  },
  landscape(x, w, h) {
    bg(x, w, h, "#2c3446", "#0e0f12");
    ell(x, w * 0.72, h * 0.25, 18, 18, "#e8e1c4");
    x.fillStyle = "#14161a";
    x.beginPath();
    x.moveTo(0, h * 0.7);
    x.quadraticCurveTo(w * 0.3, h * 0.5, w * 0.6, h * 0.66);
    x.quadraticCurveTo(w * 0.8, h * 0.6, w, h * 0.68);
    x.lineTo(w, h);
    x.lineTo(0, h);
    x.fill();
    x.fillStyle = "#0a0b0d";
    x.fillRect(w * 0.38, h * 0.48, w * 0.24, h * 0.16);
    x.beginPath();
    x.moveTo(w * 0.36, h * 0.49);
    x.lineTo(w * 0.5, h * 0.38);
    x.lineTo(w * 0.64, h * 0.49);
    x.fill();
    x.fillStyle = "#e0b45a";
    x.fillRect(w * 0.45, h * 0.53, 5, 7);
  },
  /* gallery story */
  wedding(x, w, h) {
    bg(x, w, h, "#4a4436", "#17140f");
    x.strokeStyle = "#c9b98a";
    x.lineWidth = 8;
    x.beginPath();
    x.arc(w / 2, h * 0.62, w * 0.3, Math.PI, 0);
    x.stroke();
    person(x, w / 2 - 34, h, 0.95, { coat: "#121014", hair: "#2a1d14", collar: "#eee" });
    person(x, w / 2 + 34, h, 0.9, { coat: "#efe8da", hair: "#3b2416", dress: true });
    x.fillStyle = "rgba(255,255,255,0.5)";
    x.beginPath();
    x.ellipse(w / 2 + 34, h - 0.9 * 150, 26, 44, 0, 0, Math.PI * 2);
    x.fill();
  },
  cradle(x, w, h) {
    bg(x, w, h, "#3b3226", "#120e09");
    person(x, w * 0.33, h, 1.0, { coat: "#6a1b26", hair: "#3b2416", dress: true });
    x.fillStyle = "#5a3b22";
    x.beginPath();
    x.ellipse(w * 0.66, h * 0.78, 52, 26, 0, 0, Math.PI);
    x.fill();
    x.fillRect(w * 0.66 - 50, h * 0.78 - 4, 100, 6);
    ell(x, w * 0.66, h * 0.76, 14, 11, "#f0d8c0");
    ell(x, w * 0.66 + 18, h * 0.77, 26, 10, "#e8e2f0");
  },
  three(x, w, h) {
    bg(x, w, h, "#3d5a44", "#1a2419");
    x.fillStyle = "#2a1b10";
    x.fillRect(w * 0.12, h * 0.1, 18, h * 0.9);
    ell(x, w * 0.2, h * 0.12, 90, 50, "#24402a");
    x.strokeStyle = "#cdb98f";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(w * 0.48, h * 0.15);
    x.lineTo(w * 0.5, h * 0.66);
    x.moveTo(w * 0.62, h * 0.15);
    x.lineTo(w * 0.6, h * 0.66);
    x.stroke();
    x.fillStyle = "#5a3b22";
    x.fillRect(w * 0.47, h * 0.66, w * 0.16, 6);
    person(x, w * 0.55, h * 0.84, 0.55, { coat: "#f2c6d0", hair: "#e3c06a", dress: true, skin: "#f0d0b4" });
  },
  seven(x, w, h) {
    bg(x, w, h, "#28303c", "#0c0f13");
    x.fillStyle = "#0a0a0c";
    x.beginPath();
    x.moveTo(w * 0.45, h * 0.62);
    x.lineTo(w * 0.95, h * 0.62);
    x.quadraticCurveTo(w * 0.98, h * 0.4, w * 0.75, h * 0.42);
    x.lineTo(w * 0.45, h * 0.55);
    x.fill();
    x.fillStyle = "#e9e3d6";
    x.fillRect(w * 0.45, h * 0.6, w * 0.3, 6);
    x.fillStyle = "#0a0a0c";
    x.fillRect(w * 0.5, h * 0.66, 6, h * 0.34);
    x.fillRect(w * 0.88, h * 0.66, 6, h * 0.34);
    person(x, w * 0.3, h, 0.75, { coat: "#7d9bb5", hair: "#d8b45e", dress: true, skin: "#e6c9ad" });
  },
  chair(x, w, h) {
    bg(x, w, h, "#1a1714", "#060504");
    const g = x.createRadialGradient(w * 0.7, h * 0.4, 2, w * 0.7, h * 0.4, 70);
    g.addColorStop(0, "rgba(255,200,120,0.5)");
    g.addColorStop(1, "rgba(255,200,120,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    ell(x, w * 0.7, h * 0.36, 3, 7, "#ffd27a");
    x.fillStyle = "#e8e0d0";
    x.fillRect(w * 0.7 - 3, h * 0.39, 6, 22);
    x.fillStyle = "#3a2414";
    x.fillRect(w * 0.36, h * 0.3, 10, h * 0.6);
    x.fillRect(w * 0.36, h * 0.3, 60, 10);
    x.fillRect(w * 0.36 + 50, h * 0.3, 10, h * 0.35);
    x.fillRect(w * 0.36, h * 0.6, 80, 10);
    x.fillRect(w * 0.36 + 70, h * 0.6, 10, h * 0.3);
  },
};
const artCache = new Map();
/** Canvas for a painting subject (portrait aspect for people, landscape for gallery scenes). */
export function paintingCanvas(subject, seed = 7) {
  const key = subject + seed;
  if (artCache.has(key)) return artCache.get(key);
  const wide = ["wedding", "cradle", "three", "seven", "chair", "landscape"].includes(subject);
  const [c, x] = makeCanvas(wide ? 320 : 256, wide ? 256 : 320);
  (SUBJECTS[subject] || SUBJECTS.landscape)(x, c.width, c.height);
  varnish(x, c.width, c.height, seed + subject.length);
  artCache.set(key, c);
  return c;
}
export function paintingURL(subject) {
  return paintingCanvas(subject).toDataURL("image/jpeg", 0.85);
}

/* ------------------------------------------------------------ soft sprites */
export function glowCanvas(inner = "rgba(255,220,150,1)", outer = "rgba(255,140,40,0)") {
  const [c, x] = makeCanvas(128, 128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.45)"));
  g.addColorStop(1, outer);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return c;
}
export function flameCanvas() {
  const [c, x] = makeCanvas(64, 128);
  const g = x.createRadialGradient(32, 84, 2, 32, 70, 46);
  g.addColorStop(0, "rgba(255,255,230,1)");
  g.addColorStop(0.3, "rgba(255,200,90,0.95)");
  g.addColorStop(0.7, "rgba(255,110,20,0.4)");
  g.addColorStop(1, "rgba(255,80,0,0)");
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(32, 6);
  x.quadraticCurveTo(58, 70, 32, 122);
  x.quadraticCurveTo(6, 70, 32, 6);
  x.fill();
  return c;
}
export function ghostCanvas() {
  const [c, x] = makeCanvas(128, 256);
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "rgba(220,230,255,0.75)");
  g.addColorStop(0.7, "rgba(200,215,255,0.35)");
  g.addColorStop(1, "rgba(200,215,255,0)");
  x.fillStyle = g;
  x.beginPath();
  x.ellipse(64, 46, 22, 28, 0, 0, Math.PI * 2);
  x.moveTo(42, 70);
  x.quadraticCurveTo(10, 180, 20, 256);
  x.lineTo(108, 256);
  x.quadraticCurveTo(118, 180, 86, 70);
  x.fill();
  x.fillStyle = "rgba(20,25,40,0.7)";
  x.beginPath();
  x.ellipse(56, 44, 4, 6, 0, 0, Math.PI * 2);
  x.ellipse(72, 44, 4, 6, 0, 0, Math.PI * 2);
  x.fill();
  return c;
}
export const SIGN_GLYPH = { crown: "♛", rose: "✿", moon: "☾", star: "★", bird: "🕊", heart: "♥", key: "⚷", owl: "🦉", eye: "👁" };
export function signsCanvas(signs, { w = 512, h = 128, color = "#e6c068", bg: back = null } = {}) {
  const [c, x] = makeCanvas(w, h);
  if (back) {
    x.fillStyle = back;
    x.fillRect(0, 0, w, h);
  }
  x.fillStyle = color;
  x.font = `${h * 0.6}px "Segoe UI Symbol", "Noto Sans Symbols", serif`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  signs.forEach((s, i) => x.fillText(SIGN_GLYPH[s] || s, (w / signs.length) * (i + 0.5), h / 2));
  return c;
}
