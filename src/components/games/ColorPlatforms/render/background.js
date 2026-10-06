/**
 * Color Platforms — layered parallax backgrounds, one look per chapter.
 *
 * Sky + three seamless silhouette/cloud tiles are painted once per resize /
 * chapter change into offscreen canvases; each frame only blits them at
 * parallax offsets (far ×0.08, clouds ×0.14 + drift, mid ×0.22). Aurora and
 * floating motes are the only per-frame drawing and are skipped on LOW.
 */
import { getChapter } from "../data/chapters.js";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

export class Background {
  constructor() {
    this.chapter = 1;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.quality = "medium";
    this.dirty = true;
    this.motes = [];
    const r = rng(7);
    for (let i = 0; i < 22; i++) this.motes.push({ x: r(), y: r(), s: 0.6 + r() * 1.6, v: 0.2 + r() * 0.8, p: r() * 6.28 });
  }

  setChapter(id) {
    if (id !== this.chapter) {
      this.chapter = id;
      this.dirty = true;
    }
  }

  resize(w, h, dpr, quality) {
    if (w !== this.w || h !== this.h || dpr !== this.dpr || quality !== this.quality) {
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.quality = quality;
      this.dirty = true;
    }
  }

  build() {
    this.dirty = false;
    const ch = getChapter(this.chapter);
    const { w, h, dpr } = this;
    const L = ch.layers;

    // sky
    const sky = makeCanvas(Math.ceil(w * dpr), Math.ceil(h * dpr));
    const g = sky.getContext("2d");
    g.scale(dpr, dpr);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, ch.sky[0]);
    grad.addColorStop(0.45, ch.sky[1]);
    grad.addColorStop(0.8, ch.sky[2]);
    grad.addColorStop(1, ch.sky[3]);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // sun / moon glow
    const sx = w * 0.72;
    const sy = h * (L.kind === "mesas" ? 0.7 : 0.26);
    const sun = g.createRadialGradient(sx, sy, 0, sx, sy, Math.max(w, h) * 0.55);
    sun.addColorStop(0, L.glow);
    sun.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = sun;
    g.fillRect(0, 0, w, h);
    if (L.kind === "geo" || L.kind === "ruins") {
      const r = rng(11 + this.chapter);
      const n = L.kind === "geo" ? 140 : 70;
      for (let i = 0; i < n; i++) {
        const x = r() * w;
        const y = r() * h * 0.7;
        const s = r() * 1.3 + 0.3;
        g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`;
        g.beginPath();
        g.arc(x, y, s, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (L.kind === "mesas") {
      g.fillStyle = "rgba(255,226,170,0.9)";
      g.beginPath();
      g.arc(sx, sy, Math.min(w, h) * 0.07, 0, Math.PI * 2);
      g.fill();
    }
    this.sky = sky;

    const TW = Math.ceil(Math.max(w, 900) * 1.25);
    this.TW = TW;
    this.far = this.tile(TW, h, (c) => this.silhouettes(c, TW, h, L.kind, L.far, 0.6, 1));
    this.mid = this.tile(TW, h, (c) => this.silhouettes(c, TW, h, L.kind, L.mid, 0.74, 2));
    this.clouds = this.quality === "low" ? null : this.tile(TW, h, (c) => this.cloudLayer(c, TW, h, L.cloud, L.kind));
  }

  tile(TW, h, paint) {
    const c = makeCanvas(Math.ceil(TW * this.dpr), Math.ceil(h * this.dpr));
    const g = c.getContext("2d");
    g.scale(this.dpr, this.dpr);
    paint(g);
    return c;
  }

  /** Seamless silhouettes: every periodic term divides TW, shapes wrap. */
  silhouettes(g, TW, h, kind, color, base, layer) {
    const r = rng(this.chapter * 31 + layer * 7);
    const by = h * base;
    g.fillStyle = color;
    const wrap = (fn) => {
      for (const o of [-TW, 0, TW]) fn(o);
    };
    if (kind === "hills" || kind === "mesas") {
      g.beginPath();
      g.moveTo(0, h);
      const a1 = 18 + r() * 14;
      const a2 = 10 + r() * 10;
      const ph = r() * 6.28;
      for (let x = 0; x <= TW; x += 6) {
        let y = by - a1 * Math.sin((x / TW) * Math.PI * 2 * 2 + ph) - a2 * Math.sin((x / TW) * Math.PI * 2 * 5 + ph * 2);
        if (kind === "mesas") y = by - Math.round((a1 * Math.sin((x / TW) * Math.PI * 2 * 3 + ph) + 30) / 24) * 24;
        g.lineTo(x, y);
      }
      g.lineTo(TW, h);
      g.closePath();
      g.fill();
      if (kind === "hills" && layer === 2) {
        // round bushes / trees on the near hills
        for (let i = 0; i < 9; i++) {
          const x = r() * TW;
          const y = by - a1 * Math.sin((x / TW) * Math.PI * 2 * 2 + ph) - a2 * Math.sin((x / TW) * Math.PI * 2 * 5 + ph * 2);
          const s = 10 + r() * 14;
          wrap((o) => {
            g.beginPath();
            g.arc(x + o, y - s * 0.4, s, 0, Math.PI * 2);
            g.arc(x + o + s * 0.8, y - s * 0.2, s * 0.7, 0, Math.PI * 2);
            g.fill();
          });
        }
      }
      if (kind === "mesas" && layer === 1) {
        // floating structures
        for (let i = 0; i < 4; i++) {
          const x = r() * TW;
          const y = h * (0.25 + r() * 0.25);
          const s = 30 + r() * 40;
          wrap((o) => {
            g.beginPath();
            g.moveTo(x + o - s, y);
            g.lineTo(x + o + s, y);
            g.lineTo(x + o + s * 0.4, y + s * 0.8);
            g.lineTo(x + o - s * 0.3, y + s * 0.6);
            g.closePath();
            g.fill();
          });
        }
      }
      return;
    }
    if (kind === "ruins") {
      g.fillRect(0, by + 30, TW, h);
      const n = layer === 1 ? 10 : 7;
      for (let i = 0; i < n; i++) {
        const x = (i / n) * TW + r() * 40;
        const cw = 18 + r() * 16;
        const chh = h * (0.12 + r() * 0.22);
        const broken = r() < 0.5;
        wrap((o) => {
          g.fillRect(x + o, by + 30 - chh, cw, chh);
          g.fillRect(x + o - 4, by + 30 - chh - 6, cw + 8, 6);
          if (!broken && i % 2 === 0) {
            // arch to the next column
            const nx = ((i + 1) / n) * TW;
            g.beginPath();
            g.moveTo(x + o, by + 30 - chh - 6);
            g.quadraticCurveTo((x + nx) / 2 + o, by + 30 - chh - 60, nx + o + cw, by + 30 - chh - 6);
            g.lineTo(nx + o + cw, by + 30 - chh + 4);
            g.quadraticCurveTo((x + nx) / 2 + o, by + 30 - chh - 44, x + o, by + 30 - chh + 4);
            g.fill();
          }
        });
      }
      return;
    }
    if (kind === "towers") {
      const n = layer === 1 ? 6 : 4;
      for (let i = 0; i < n; i++) {
        const x = (i / n) * TW + r() * 80;
        const tw = (layer === 1 ? 16 : 24) + r() * 12;
        const th = h * (0.14 + r() * 0.16);
        const base = h * (layer === 1 ? 0.42 : 0.6) + r() * h * 0.12;
        wrap((o) => {
          const cx = x + o;
          // floating rock: rounded top, short tapered underside
          g.beginPath();
          g.ellipse(cx, base, tw * 2.2, tw * 0.45, 0, Math.PI, 0);
          g.quadraticCurveTo(cx + tw * 1.4, base + tw * 0.9, cx + tw * 0.2, base + tw * 1.3);
          g.quadraticCurveTo(cx - tw * 1.2, base + tw * 0.9, cx - tw * 2.2, base);
          g.fill();
          // slim tower with a dome
          g.fillRect(cx - tw / 2, base - th, tw, th);
          g.beginPath();
          g.arc(cx, base - th, tw / 2 + 2, Math.PI, 0);
          g.fill();
          g.fillRect(cx - 1, base - th - tw / 2 - 9, 2, 9);
          // a smaller side tower
          g.fillRect(cx + tw * 0.9, base - th * 0.55, tw * 0.6, th * 0.55);
          g.beginPath();
          g.arc(cx + tw * 1.2, base - th * 0.55, tw * 0.3 + 1.5, Math.PI, 0);
          g.fill();
        });
      }
      return;
    }
    // geo: floating geometric structures
    const n = layer === 1 ? 9 : 6;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * TW + r() * 50;
      const y = h * (0.3 + r() * 0.45);
      const s = (layer === 1 ? 26 : 40) + r() * 30;
      const kindI = Math.floor(r() * 3);
      wrap((o) => {
        g.beginPath();
        if (kindI === 0) {
          g.moveTo(x + o, y - s);
          g.lineTo(x + o + s * 0.9, y + s * 0.6);
          g.lineTo(x + o - s * 0.9, y + s * 0.6);
        } else if (kindI === 1) {
          g.moveTo(x + o, y - s);
          g.lineTo(x + o + s * 0.7, y);
          g.lineTo(x + o, y + s);
          g.lineTo(x + o - s * 0.7, y);
        } else {
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            g.lineTo(x + o + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.8);
          }
        }
        g.closePath();
        g.fill();
        g.strokeStyle = layer === 1 ? "rgba(140,170,255,0.25)" : "rgba(120,255,210,0.22)";
        g.lineWidth = 1.5;
        g.stroke();
      });
    }
    g.fillRect(0, by + 60, TW, h);
  }

  cloudLayer(g, TW, h, color, kind) {
    const r = rng(this.chapter * 13 + 5);
    const n = kind === "towers" ? 11 : kind === "geo" ? 0 : 7;
    const puff = (x, y, s) => {
      const grd = g.createRadialGradient(x, y, 0, x, y, s);
      grd.addColorStop(0, color);
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    };
    for (let i = 0; i < n; i++) {
      const x = r() * TW;
      const y = h * (0.12 + r() * (kind === "towers" ? 0.75 : 0.42));
      const s = 30 + r() * 40;
      for (const o of [-TW, 0, TW]) {
        for (let k = 0; k < 5; k++) puff(x + o + (k - 2) * s * 0.55, y + Math.sin(k * 1.7) * s * 0.18, s * (0.7 + (k % 2) * 0.3));
      }
    }
    if (kind === "ruins") {
      // low mist band
      const m = g.createLinearGradient(0, h * 0.62, 0, h);
      m.addColorStop(0, "rgba(200,180,255,0)");
      m.addColorStop(1, "rgba(200,180,255,0.28)");
      g.fillStyle = m;
      g.fillRect(0, h * 0.62, TW, h * 0.38);
    }
  }

  draw(ctx, camX, camY, refY, time, reduced) {
    if (this.dirty) this.build();
    const { w, h, TW } = this;
    ctx.drawImage(this.sky, 0, 0, w, h);
    const yShift = (f) => Math.max(-50, Math.min(50, -(camY - refY) * f));
    const strip = (img, f, drift, ys) => {
      if (!img) return;
      let off = -((camX * f + drift) % TW);
      if (off > 0) off -= TW;
      for (let x = off; x < w; x += TW) ctx.drawImage(img, x, ys, TW, h);
    };
    const kind = getChapter(this.chapter).layers.kind;
    if (kind === "geo" && this.quality !== "low") this.aurora(ctx, time, reduced);
    strip(this.far, 0.08, 0, yShift(0.04));
    strip(this.clouds, 0.14, reduced ? 0 : time * 6, yShift(0.06));
    strip(this.mid, 0.22, 0, yShift(0.1));
    if (this.quality !== "low") this.drawMotes(ctx, time, kind, reduced);
  }

  aurora(ctx, time, reduced) {
    const { w, h } = this;
    const t = reduced ? 0 : time;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const bands = [
      ["rgba(80,255,190,0.10)", 0.22, 0.0],
      ["rgba(150,110,255,0.09)", 0.3, 1.7],
      ["rgba(80,200,255,0.07)", 0.16, 3.1],
    ];
    for (const [col, yy, ph] of bands) {
      ctx.strokeStyle = col;
      ctx.lineWidth = h * 0.09;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let x = -20; x <= w + 20; x += 24) {
        const y = h * yy + Math.sin(x * 0.006 + t * 0.35 + ph) * h * 0.05 + Math.sin(x * 0.013 + t * 0.2) * h * 0.02;
        if (x < 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  drawMotes(ctx, time, kind, reduced) {
    const { w, h } = this;
    const col = kind === "geo" ? "rgba(170,255,225," : kind === "mesas" ? "rgba(255,220,170," : "rgba(255,255,255,";
    const t = reduced ? 0 : time;
    for (const m of this.motes) {
      const x = ((m.x * w + t * 10 * m.v) % (w + 20)) - 10;
      const y = m.y * h + Math.sin(t * 0.6 + m.p) * 10;
      ctx.fillStyle = col + (0.18 + 0.2 * Math.sin(t + m.p * 3) ** 2) + ")";
      ctx.beginPath();
      ctx.arc(x, y, m.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
