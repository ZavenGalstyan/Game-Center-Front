/**
 * Stack Tower — atmospheric background.
 *
 * Everything static is baked once per (theme, size, quality) into offscreen
 * canvases: two sky gradients (ground-level and high-altitude), a star
 * field, and three silhouette layers (far ridge, mid, near skyline) with
 * haze baked in. Per frame we only blit those with a parallax offset driven
 * by the camera height, plus a handful of drifting clouds, an optional
 * aurora and a few ambient motes.
 *
 * As the tower rises the silhouettes sink out of view and the sky blends
 * toward its high-altitude gradient — the background itself reads as
 * progress, without ever competing with the blocks.
 */

function mulberry(seed) {
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
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function skyCanvas(w, h, stops) {
  const c = makeCanvas(w, h);
  const g = c.getContext("2d");
  const gr = g.createLinearGradient(0, 0, 0, h);
  stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  return c;
}

function starCanvas(w, h, rnd, dpr) {
  const c = makeCanvas(w, h);
  const g = c.getContext("2d");
  const n = Math.round((w * h) / (5200 * dpr * dpr));
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = Math.pow(rnd(), 1.4) * h * 0.8;
    const r = (rnd() < 0.08 ? 1.3 : 0.7) * dpr;
    g.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Ridge / skyline layer. Returns a canvas whose TOP is the tallest peak. */
function layerCanvas(kind, w, h, color, theme, rnd, dpr, quality) {
  const c = makeCanvas(w, h);
  const g = c.getContext("2d");
  g.fillStyle = color;
  if (kind === "ridge") {
    const f1 = 1 + rnd() * 2;
    const f2 = 4 + rnd() * 4;
    const f3 = 11 + rnd() * 8;
    const p1 = rnd() * 6;
    const p2 = rnd() * 6;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4 * dpr) {
      const u = x / w;
      const y =
        0.42 +
        0.2 * Math.sin(u * Math.PI * f1 + p1) +
        0.12 * Math.sin(u * Math.PI * f2 + p2) +
        0.04 * Math.sin(u * Math.PI * f3);
      g.lineTo(x, Math.max(0.02, y) * h * 0.6);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    if (theme.snow) {
      // snow caps: lighter band clipped to the ridge top
      g.save();
      g.clip();
      g.fillStyle = "rgba(200,235,240,0.18)";
      g.fillRect(0, 0, w, h * 0.2);
      g.restore();
    }
  } else {
    // skyline: blocks of buildings with a few towers / antennas
    let x = -rnd() * 30 * dpr;
    const bw0 = kind === "near" ? 34 : 24;
    const winCols = theme.windows;
    while (x < w) {
      const bw = (bw0 * (0.6 + rnd() * 1.1)) * dpr;
      const tall = rnd();
      const bh = h * (kind === "near" ? 0.25 + tall * 0.55 : 0.3 + tall * 0.6);
      const top = h - bh;
      g.fillStyle = color;
      g.fillRect(x, top, bw + 1, bh);
      if (tall > 0.8) g.fillRect(x + bw * 0.45, top - 14 * dpr, 2 * dpr, 14 * dpr);
      if (tall > 0.6 && rnd() < 0.4) g.fillRect(x + bw * 0.2, top - 6 * dpr, bw * 0.6, 6 * dpr);
      if (winCols && quality !== "low") {
        const step = 7 * dpr;
        for (let wy = top + 6 * dpr; wy < h - 4 * dpr; wy += step) {
          for (let wx = x + 4 * dpr; wx < x + bw - 4 * dpr; wx += step * 0.9) {
            if (rnd() < (kind === "near" ? 0.2 : 0.14)) {
              const col = winCols[rnd() < 0.75 ? 0 : 1];
              g.fillStyle = `rgba(${col},${0.35 + rnd() * 0.5})`;
              g.fillRect(wx, wy, 2.2 * dpr, 3 * dpr);
            }
          }
        }
      }
      x += bw + rnd() * 6 * dpr;
    }
  }
  // atmospheric haze toward the base of the layer
  const hz = g.createLinearGradient(0, h * 0.25, 0, h);
  hz.addColorStop(0, "rgba(0,0,0,0)");
  hz.addColorStop(1, theme.haze);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = hz;
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "source-over";
  if (theme.grid && kind === "near") {
    // synthwave floor lines under the neon skyline
    g.strokeStyle = "rgba(255,70,200,0.35)";
    g.lineWidth = dpr;
    for (let i = 0; i < 6; i++) {
      const y = h - (i * i * 2.4 + 2) * dpr;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  }
  return c;
}

function cloudSprite(color, rnd, dpr) {
  const w = 260 * dpr;
  const h = 90 * dpr;
  const c = makeCanvas(w, h);
  const g = c.getContext("2d");
  const puffs = 7;
  for (let i = 0; i < puffs; i++) {
    const px = w * (0.15 + (0.7 * i) / (puffs - 1)) + (rnd() - 0.5) * 20 * dpr;
    const py = h * (0.6 - Math.sin((i / (puffs - 1)) * Math.PI) * 0.18) + (rnd() - 0.5) * 8 * dpr;
    const r = h * (0.28 + rnd() * 0.18);
    const gr = g.createRadialGradient(px, py, 0, px, py, r);
    gr.addColorStop(0, color);
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(px - r, py - r, r * 2, r * 2);
  }
  return c;
}

export class Background {
  constructor() {
    this.key = "";
    this.clouds = [];
    this.motes = [];
  }

  build(theme, w, h, dpr, quality) {
    const key = `${theme.id}|${w}|${h}|${quality}`;
    if (key === this.key) return;
    this.key = key;
    this.theme = theme;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.quality = quality;
    const rnd = mulberry(theme.id.length * 977 + 13);
    this.sky = skyCanvas(w, h, theme.sky);
    this.highSky = skyCanvas(w, h, theme.highSky);
    this.stars = theme.stars > 0 || quality !== "low" ? starCanvas(w, h, rnd, dpr) : null;
    const lw = w * 1.25;
    this.layers = [];
    if (quality !== "low") this.layers.push({ c: layerCanvas("ridge", lw, h * 0.34, theme.far, theme, rnd, dpr, quality), base: 0.66, par: 0.05, sway: 0.2, col: theme.far });
    const midKind = theme.id === "aurora" ? "ridge" : "mid";
    this.layers.push({ c: layerCanvas(midKind, lw, h * 0.24, theme.mid, theme, rnd, dpr, quality), base: 0.76, par: 0.1, sway: 0.45, col: theme.mid });
    const nearKind = theme.id === "aurora" ? "ridge" : "near";
    this.layers.push({ c: layerCanvas(nearKind, lw, h * 0.16, theme.near, theme, rnd, dpr, quality), base: 0.86, par: 0.18, sway: 0.8, col: theme.near });
    const cloudN = quality === "low" ? 2 : quality === "high" ? 6 : 4;
    this.cloudSprites = [cloudSprite(theme.cloud, rnd, dpr), cloudSprite(theme.cloud, rnd, dpr)];
    this.clouds = Array.from({ length: cloudN }, (_, i) => ({
      x: rnd(),
      y: 0.08 + rnd() * 0.42,
      s: 0.55 + rnd() * 0.7,
      v: 0.004 + rnd() * 0.006,
      sp: i % 2,
      par: 0.02 + rnd() * 0.05,
    }));
    const moteN = quality === "low" ? 0 : quality === "high" ? 34 : 18;
    this.motes = Array.from({ length: moteN }, () => ({
      x: rnd(),
      y: rnd(),
      r: 0.6 + rnd() * 1.6,
      v: 0.006 + rnd() * 0.014,
      ph: rnd() * 6.28,
    }));
    if (theme.aurora) {
      const strip = makeCanvas(4, 160 * dpr);
      const g = strip.getContext("2d");
      const gr = g.createLinearGradient(0, 0, 0, strip.height);
      gr.addColorStop(0, "rgba(120,255,200,0)");
      gr.addColorStop(0.35, "rgba(120,255,200,0.55)");
      gr.addColorStop(0.7, "rgba(90,200,255,0.25)");
      gr.addColorStop(1, "rgba(160,110,255,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, 4, strip.height);
      this.auroraStrip = strip;
      const div = quality === "high" ? 4 : 7;
      this.auroraBuf = makeCanvas(w / div, (h * 0.62) / div);
    } else this.auroraStrip = null;
  }

  /**
   * lift  – camera height in world units (drives parallax + sky blend)
   * s     – world→pixel scale
   * sway  – horizontal camera drift in pixels (menu only)
   * motion – 0..1 parallax/animation intensity (reduced motion → small)
   */
  draw(ctx, t, lift, s, sway, motion, particles) {
    const { w, h, theme } = this;
    ctx.drawImage(this.sky, 0, 0);
    const high = Math.min(1, Math.max(0, lift / 160));
    if (high > 0) {
      ctx.globalAlpha = high;
      ctx.drawImage(this.highSky, 0, 0);
      ctx.globalAlpha = 1;
    }
    const starA = Math.min(1, theme.stars + high * 0.5);
    if (this.stars && starA > 0.01) {
      ctx.globalAlpha = starA * (0.85 + 0.15 * Math.sin(t * 0.7));
      ctx.drawImage(this.stars, 0, Math.min(h * 0.1, lift * s * 0.01));
      ctx.globalAlpha = 1;
    }

    // sun / moon
    const sun = theme.sun;
    if (sun) {
      const sx = sun.x * w + sway * 0.05;
      const sy = sun.y * h + lift * s * 0.03;
      const r = sun.r * h;
      const gl = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 4);
      gl.addColorStop(0, sun.glow);
      gl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gl;
      ctx.fillRect(sx - r * 4, sy - r * 4, r * 8, r * 8);
      ctx.fillStyle = sun.color;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
      if (sun.striped) {
        ctx.fillStyle = theme.sky[2];
        for (let i = 0; i < 5; i++) {
          const yy = sy + r * (0.15 + i * 0.18);
          ctx.fillRect(sx - r, yy, r * 2, r * (0.03 + i * 0.022));
        }
      }
    }

    // aurora curtains — drawn 1px-per-column into a low-res buffer, then
    // upscaled with smoothing: soft ribbons, no column banding, cheap
    if (this.auroraStrip) {
      const buf = this.auroraBuf;
      const g = buf.getContext("2d");
      const bw = buf.width;
      const bh = buf.height;
      const tt = t * motion;
      g.clearRect(0, 0, bw, bh);
      g.globalCompositeOperation = "lighter";
      for (let band = 0; band < 2; band++) {
        g.globalAlpha = band ? 0.35 : 0.5;
        for (let x = 0; x < bw; x++) {
          const u = x / bw;
          const y = bh * (0.12 + band * 0.18) + Math.sin(u * 5.5 + tt * 0.35 + band * 2) * bh * 0.08 + Math.sin(u * 13 + tt * 0.6) * bh * 0.025;
          const len = bh * (0.36 + 0.13 * Math.sin(u * 7 + tt * 0.4 + band));
          g.drawImage(this.auroraStrip, x, y, 1, len);
        }
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = "source-over";
      ctx.globalCompositeOperation = "lighter";
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(buf, 0, lift * s * 0.02, w, h * 0.62);
      ctx.globalCompositeOperation = "source-over";
    }

    // clouds (behind the silhouettes)
    for (const c of this.clouds) {
      const sp = this.cloudSprites[c.sp];
      const cw = sp.width * c.s;
      const x = (((c.x + t * c.v * motion) % 1.3) - 0.15) * w - cw / 2 + sway * c.par;
      const y = c.y * h + lift * s * c.par * 0.6;
      if (y > h + 50) continue;
      ctx.drawImage(sp, x, y, cw, sp.height * c.s);
    }

    // silhouettes, sinking as the camera climbs
    for (const L of this.layers) {
      const y = L.base * h + lift * s * L.par * motion + lift * s * L.par * (1 - motion) * 0.5;
      if (y >= h) continue;
      const x = -(L.c.width - w) / 2 + sway * L.sway * 0.1;
      ctx.drawImage(L.c, x, y);
      const bottom = y + L.c.height;
      if (bottom < h) {
        ctx.fillStyle = L.col;
        ctx.fillRect(0, bottom - 1, w, h - bottom + 1);
      }
    }

    // ambient motes
    if (particles && this.motes.length) {
      const m = theme.motes;
      for (const p of this.motes) {
        const y = (((p.y - t * p.v * motion) % 1) + 1) % 1;
        const x = p.x + Math.sin(t * 0.3 + p.ph) * 0.01 * motion;
        const a = m.alpha * (0.4 + 0.6 * Math.sin(t * 0.9 + p.ph) ** 2);
        ctx.fillStyle = `rgba(${m.color},${a})`;
        ctx.beginPath();
        ctx.arc(x * w, y * h, p.r * this.dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
