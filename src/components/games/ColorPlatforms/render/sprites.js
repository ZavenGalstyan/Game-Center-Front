/**
 * Color Platforms — cached sprites. Every platform look (color × width ×
 * variant × color-assist) is painted ONCE into an offscreen canvas at the
 * current pixel scale and then blitted each frame, so glow / gradients /
 * symbols cost nothing per frame. The cache is dropped on resize.
 */
import { NEUTRAL } from "../engine/constants.js";
import { PLAT, SYMBOL_NAME, symbolPath, rrect } from "./palette.js";

const PAD = 26;

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      return new OffscreenCanvas(w, h);
    } catch {
      /* fall through */
    }
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export class SpriteCache {
  constructor() {
    this.k = 1;
    this.map = new Map();
  }

  setScale(k) {
    const kk = Math.round(k * 100) / 100;
    if (kk !== this.k) {
      this.k = kk;
      this.map.clear();
    }
  }

  clear() {
    this.map.clear();
  }

  /** Platform sprite; returns { img, ox, oy, w, h } in world units. */
  platform(color, w, h, variant, assist) {
    const key = `p|${color}|${w}|${h}|${variant}|${assist ? 1 : 0}`;
    let s = this.map.get(key);
    if (!s) {
      s = paintPlatform(this.k, color, w, h, variant, assist);
      this.map.set(key, s);
    }
    return s;
  }

  star() {
    let s = this.map.get("star");
    if (!s) {
      s = paintStar(this.k);
      this.map.set("star", s);
    }
    return s;
  }

  glow(hex) {
    const key = `g|${hex}`;
    let s = this.map.get(key);
    if (!s) {
      const n = parseInt(hex.slice(1), 16);
      s = paintGlow(this.k, `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`);
      this.map.set(key, s);
    }
    return s;
  }
}

function paintPlatform(k, color, w, h, variant, assist) {
  const P = PLAT[color];
  const cw = Math.ceil((w + PAD * 2) * k);
  const ch = Math.ceil((h + PAD * 2 + 10) * k);
  const c = makeCanvas(Math.max(1, cw), Math.max(1, ch));
  const g = c.getContext("2d");
  g.scale(k, k);
  g.translate(PAD, PAD);
  const glass = variant === "fade";
  const r = Math.min(10, h / 2);
  const depth = Math.min(7, h * 0.3);

  // soft drop shadow + colored glow
  g.save();
  g.shadowColor = "rgba(5,8,25,0.45)";
  g.shadowBlur = 16;
  g.shadowOffsetY = 9;
  g.fillStyle = P.side;
  rrect(g, 0, 0, w, h, r);
  g.fill();
  g.restore();
  g.save();
  g.shadowColor = P.glow;
  g.shadowBlur = 18;
  g.fillStyle = P.side;
  rrect(g, 0, 0, w, h, r);
  g.fill();
  g.restore();

  // slab: dark side band, then the lit top face
  g.globalAlpha = glass ? 0.82 : 1;
  g.fillStyle = P.side;
  rrect(g, 0, 0, w, h, r);
  g.fill();
  const face = g.createLinearGradient(0, 0, 0, h - depth);
  face.addColorStop(0, P.top);
  face.addColorStop(0.28, P.body);
  face.addColorStop(1, P.base);
  g.fillStyle = face;
  rrect(g, 0, 0, w, h - depth, [r, r, Math.min(r, 6), Math.min(r, 6)]);
  g.fill();
  g.globalAlpha = 1;

  // top highlight + sheen
  g.fillStyle = "rgba(255,255,255,0.55)";
  rrect(g, 5, 1.5, w - 10, 2.6, 1.3);
  g.fill();
  const sheen = g.createLinearGradient(0, 0, w, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0)");
  sheen.addColorStop(0.35, "rgba(255,255,255,0.14)");
  sheen.addColorStop(0.6, "rgba(255,255,255,0)");
  g.fillStyle = sheen;
  rrect(g, 2, 2, w - 4, h - depth - 4, r);
  g.fill();

  // color-assist pattern (always a tiny emblem; full pattern when assist is on)
  const sym = SYMBOL_NAME[color];
  const faceH = h - depth;
  const cy = faceH / 2 + 0.5;
  if (color !== NEUTRAL) {
    g.save();
    rrect(g, 3, 3, w - 6, faceH - 5, r);
    g.clip();
    if (assist) {
      const step = 30;
      const n = Math.max(1, Math.floor((w - 12) / step));
      const x0 = (w - (n - 1) * step) / 2;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * step;
        g.fillStyle = P.sym;
        g.strokeStyle = P.sym;
        g.lineWidth = 2;
        symbolPath(g, sym, x, cy, 4.6);
        if (sym === "circle") g.stroke();
        else g.fill();
      }
    } else {
      g.fillStyle = P.sym;
      g.globalAlpha = 0.35;
      symbolPath(g, sym, w / 2, cy, 3.6);
      g.fill();
    }
    g.restore();
  } else {
    // neutral: tiny dot rhythm — reads as "safe for everyone"
    g.fillStyle = P.sym;
    const step = 22;
    const n = Math.max(1, Math.floor((w - 16) / step));
    const x0 = (w - (n - 1) * step) / 2;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.arc(x0 + i * step, cy, 1.8, 0, Math.PI * 2);
      g.fill();
    }
  }

  // fading platforms: dashed rim + hairline cracks so the type reads early
  if (glass) {
    g.save();
    g.setLineDash([6, 5]);
    g.strokeStyle = "rgba(255,255,255,0.85)";
    g.lineWidth = 1.6;
    rrect(g, 1.5, 1.5, w - 3, h - 3, r);
    g.stroke();
    g.restore();
    g.strokeStyle = "rgba(255,255,255,0.35)";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(w * 0.22, 3);
    g.lineTo(w * 0.27, faceH * 0.55);
    g.lineTo(w * 0.24, faceH - 2);
    g.moveTo(w * 0.7, 3);
    g.lineTo(w * 0.66, faceH * 0.5);
    g.stroke();
  }

  // movers: small end caps
  if (variant === "move") {
    g.fillStyle = "rgba(255,255,255,0.75)";
    for (const x of [6, w - 6]) {
      g.beginPath();
      g.arc(x, cy, 2.2, 0, Math.PI * 2);
      g.fill();
    }
  }

  // crisp outline
  g.strokeStyle = "rgba(6,10,30,0.38)";
  g.lineWidth = 1.2;
  rrect(g, 0.6, 0.6, w - 1.2, h - 1.2, r);
  g.stroke();

  return { img: c, ox: -PAD, oy: -PAD, w: w + PAD * 2, h: h + PAD * 2 + 10 };
}

function paintStar(k) {
  const R = 16;
  const S = 64;
  const c = makeCanvas(Math.ceil(S * k), Math.ceil(S * k));
  const g = c.getContext("2d");
  g.scale(k, k);
  g.translate(S / 2, S / 2);
  const path = () => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? R * 0.48 : R;
      const x = Math.cos(a) * rr;
      const y = Math.sin(a) * rr;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
  };
  g.save();
  g.shadowColor = "rgba(255,200,60,0.85)";
  g.shadowBlur = 16;
  g.fillStyle = "#ffcf3a";
  path();
  g.fill();
  g.restore();
  const grad = g.createLinearGradient(0, -R, 0, R);
  grad.addColorStop(0, "#fff3b0");
  grad.addColorStop(0.45, "#ffd23f");
  grad.addColorStop(1, "#f29a0e");
  g.fillStyle = grad;
  path();
  g.fill();
  g.strokeStyle = "rgba(150,80,0,0.55)";
  g.lineWidth = 1.4;
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.75)";
  g.beginPath();
  g.ellipse(-4, -6, 3.2, 2, -0.6, 0, Math.PI * 2);
  g.fill();
  return { img: c, ox: -S / 2, oy: -S / 2, w: S, h: S };
}

function paintGlow(k, rgb) {
  const S = 128;
  const c = makeCanvas(Math.ceil(S * k), Math.ceil(S * k));
  const g = c.getContext("2d");
  g.scale(k, k);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(${rgb},0.55)`);
  grad.addColorStop(0.4, `rgba(${rgb},0.18)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return { img: c, ox: -S / 2, oy: -S / 2, w: S, h: S };
}
