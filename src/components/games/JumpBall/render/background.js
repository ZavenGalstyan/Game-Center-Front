/**
 * Jump Ball — world backgrounds with vertical parallax.
 *
 * Everything static is pre-rendered once per (world, size, quality) into
 * offscreen canvases; per frame we only blit them with parallax offsets and
 * animate a handful of drifting sprites/particles. Drawing is in CSS pixels
 * (the engine applies the DPR transform).
 *
 * Parallax: a layer's screen offset = climb(px) × factor. Ground layers are
 * anchored to world y = 0 and sink away as you climb; cloud / island /
 * structure fields repeat vertically so the climb always has depth.
 */

const TAU = Math.PI * 2;

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

const lerp = (a, b, k) => a + (b - a) * k;
function mixHex(a, b, k) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, k));
  const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, k));
  const bl = Math.round(lerp(pa & 255, pb & 255, k));
  return `rgb(${r},${g},${bl})`;
}

function canvas(w, h) {
  const c = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(Math.max(1, w), Math.max(1, h)) : document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/* ---------------------------------------------------------------- palettes */

const SKY = {
  // [top, middle, horizon] at ground level → at altitude
  sunny: { low: ["#3d8fe0", "#7cc3f5", "#d8f0ff"], high: ["#2266c4", "#5aa6ea", "#b9e2ff"] },
  sunset: { low: ["#3b2b6b", "#d9577a", "#ffb56b"], high: ["#231d57", "#a64a86", "#ff9a6b"] },
  frozen: { low: ["#5b86c4", "#a6c9ec", "#eef7ff"], high: ["#2f4f8f", "#7aa5dc", "#d5e9ff"] },
  cloud: { low: ["#3a4fb0", "#8f9fe8", "#ffe2a8"], high: ["#1f2a78", "#5b6fd0", "#ffd48a"] },
  neon: { low: ["#0b0822", "#1c1450", "#3a1d6e"], high: ["#05040f", "#120c38", "#2a1558"] },
};

/* ---------------------------------------------------------- sprite makers */

function cloudSprite(w, h, tint, shade, seed) {
  const c = canvas(w, h);
  const x = c.getContext("2d");
  const r = rng(seed);
  const puffs = [];
  const n = 7 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    const px = w * (0.15 + 0.7 * (i / (n - 1))) + (r() - 0.5) * w * 0.08;
    const pr = h * (0.22 + 0.2 * Math.sin((i / (n - 1)) * Math.PI) + r() * 0.1);
    puffs.push([px, h * 0.62 - pr * 0.35 + (r() - 0.5) * h * 0.08, pr]);
  }
  // shadow side first, then lit body offset up-left
  x.fillStyle = shade;
  for (const [px, py, pr] of puffs) {
    x.beginPath();
    x.arc(px, py + pr * 0.12, pr, 0, TAU);
    x.fill();
  }
  x.fillStyle = tint;
  for (const [px, py, pr] of puffs) {
    x.beginPath();
    x.arc(px - pr * 0.08, py - pr * 0.06, pr * 0.9, 0, TAU);
    x.fill();
  }
  const hi = x.createLinearGradient(0, 0, 0, h);
  hi.addColorStop(0, "rgba(255,255,255,0.55)");
  hi.addColorStop(0.5, "rgba(255,255,255,0)");
  x.globalCompositeOperation = "source-atop";
  x.fillStyle = hi;
  x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = "source-over";
  return c;
}

/** A ridge line across `w`, returned as points (for silhouettes). */
function ridge(w, base, amp, seed, rough = 0.5, step = 12) {
  const r = rng(seed);
  const pts = [];
  const f1 = 0.004 + r() * 0.003;
  const f2 = 0.011 + r() * 0.006;
  const p1 = r() * TAU;
  const p2 = r() * TAU;
  for (let x = -step; x <= w + step; x += step) {
    const y = base - amp * (0.55 * Math.sin(x * f1 + p1) + 0.3 * Math.sin(x * f2 + p2) + rough * 0.15 * (r() - 0.5)) - amp * 0.5;
    pts.push([x, y]);
  }
  return pts;
}

function fillRidge(x, pts, h, fill) {
  x.fillStyle = fill;
  x.beginPath();
  x.moveTo(pts[0][0], h);
  for (const [px, py] of pts) x.lineTo(px, py);
  x.lineTo(pts[pts.length - 1][0], h);
  x.closePath();
  x.fill();
}

/* ------------------------------------------------------ ground layers */

function buildGround(key, w, h, q, seed) {
  // returns [{ img, factor }] — each image's bottom sits on world y≈0
  const layers = [];
  const hi = q === "high";
  const lo = q === "low";
  if (key === "sunny") {
    const far = canvas(w, h * 0.5);
    let x = far.getContext("2d");
    const pts = ridge(w, h * 0.5 * 0.62, h * 0.18, seed + 1, 0.3);
    fillRidge(x, pts, h * 0.5, "#a9cdee");
    layers.push({ img: far, factor: 0.1 });
    const mid = canvas(w, h * 0.42);
    x = mid.getContext("2d");
    const g = x.createLinearGradient(0, 0, 0, h * 0.42);
    g.addColorStop(0, "#8fd67a");
    g.addColorStop(1, "#5aa85a");
    fillRidge(x, ridge(w, h * 0.42 * 0.55, h * 0.09, seed + 2, 0.1), h * 0.42, g);
    layers.push({ img: mid, factor: 0.2 });
    const near = canvas(w, h * 0.34);
    x = near.getContext("2d");
    const g2 = x.createLinearGradient(0, 0, 0, h * 0.34);
    g2.addColorStop(0, "#5fbf4e");
    g2.addColorStop(1, "#2f7d3a");
    const np = ridge(w, h * 0.34 * 0.5, h * 0.07, seed + 3, 0.1);
    fillRidge(x, np, h * 0.34, g2);
    if (!lo) {
      // round trees on the near hill
      const r = rng(seed + 9);
      const trees = hi ? 18 : 10;
      for (let i = 0; i < trees; i++) {
        const tx = r() * w;
        const idx = Math.max(0, Math.min(np.length - 1, Math.round((tx + 12) / 12)));
        const ty = np[idx][1] + 6;
        const tr = 9 + r() * 10;
        x.fillStyle = "#6b4a2e";
        x.fillRect(tx - 2, ty - tr * 0.4, 4, tr * 0.9);
        x.fillStyle = "#3f9a45";
        x.beginPath();
        x.arc(tx, ty - tr, tr, 0, TAU);
        x.fill();
        x.fillStyle = "rgba(190,255,160,0.35)";
        x.beginPath();
        x.arc(tx - tr * 0.3, ty - tr * 1.3, tr * 0.5, 0, TAU);
        x.fill();
      }
    }
    layers.push({ img: near, factor: 0.34 });
  } else if (key === "sunset") {
    const city = (hh, color, win, seed2, minH, maxH, antenna) => {
      const c = canvas(w, hh);
      const x = c.getContext("2d");
      const r = rng(seed2);
      let bx = -10;
      while (bx < w + 10) {
        const bw = 26 + r() * 50;
        const bh = hh * (minH + r() * (maxH - minH));
        x.fillStyle = color;
        x.fillRect(bx, hh - bh, bw, bh);
        if (antenna && r() < 0.3) {
          x.fillRect(bx + bw * 0.5 - 1, hh - bh - 16, 2, 16);
        }
        if (antenna && r() < 0.18) {
          // water tower
          x.fillRect(bx + bw * 0.2, hh - bh - 12, bw * 0.3, 10);
          x.fillRect(bx + bw * 0.22, hh - bh - 2, 2, 2);
        }
        if (!lo && win) {
          x.fillStyle = win;
          for (let wy = hh - bh + 8; wy < hh - 6; wy += 9) {
            for (let wx = bx + 5; wx < bx + bw - 6; wx += 8) {
              if (r() < 0.22) x.fillRect(wx, wy, 3.5, 4);
            }
          }
        }
        bx += bw + 2 + r() * 6;
      }
      return c;
    };
    layers.push({ img: city(h * 0.5, "#7a3f78", "rgba(255,190,140,0.55)", seed + 11, 0.35, 0.9, false), factor: 0.1 });
    layers.push({ img: city(h * 0.4, "#4e2456", "rgba(255,200,120,0.75)", seed + 12, 0.3, 0.85, true), factor: 0.2 });
    layers.push({ img: city(h * 0.26, "#2a1232", hi ? "rgba(255,210,120,0.9)" : "rgba(255,210,120,0.7)", seed + 13, 0.4, 0.95, true), factor: 0.34 });
  } else if (key === "frozen") {
    const far = canvas(w, h * 0.55);
    let x = far.getContext("2d");
    const pts = ridge(w, h * 0.55 * 0.6, h * 0.24, seed + 21, 0.9, 16);
    fillRidge(x, pts, h * 0.55, "#b9cfe9");
    // snowcaps: clip the ridge and paint its top band white
    x.save();
    x.beginPath();
    x.moveTo(pts[0][0], h);
    for (const [px, py] of pts) x.lineTo(px, py);
    x.lineTo(pts[pts.length - 1][0], h);
    x.closePath();
    x.clip();
    x.fillStyle = "#f4f9ff";
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts) x.lineTo(px, py);
    for (let i = pts.length - 1; i >= 0; i--) x.lineTo(pts[i][0], pts[i][1] + 26 + Math.sin(i * 1.7) * 10);
    x.closePath();
    x.fill();
    x.restore();
    layers.push({ img: far, factor: 0.09 });
    const mid = canvas(w, h * 0.42);
    x = mid.getContext("2d");
    fillRidge(x, ridge(w, h * 0.42 * 0.55, h * 0.14, seed + 22, 0.6, 14), h * 0.42, "#7f9cc6");
    layers.push({ img: mid, factor: 0.19 });
    const near = canvas(w, h * 0.3);
    x = near.getContext("2d");
    const np = ridge(w, h * 0.3 * 0.55, h * 0.05, seed + 23, 0.1);
    fillRidge(x, np, h * 0.3, "#eef6ff");
    if (!lo) {
      const r = rng(seed + 24);
      const n = hi ? 26 : 14;
      for (let i = 0; i < n; i++) {
        const tx = r() * w;
        const idx = Math.max(0, Math.min(np.length - 1, Math.round((tx + 12) / 12)));
        const ty = np[idx][1] + 4;
        const th = 18 + r() * 22;
        x.fillStyle = "#2f5a6e";
        x.beginPath();
        x.moveTo(tx, ty - th);
        x.lineTo(tx + th * 0.32, ty);
        x.lineTo(tx - th * 0.32, ty);
        x.closePath();
        x.fill();
        x.fillStyle = "rgba(255,255,255,0.8)";
        x.beginPath();
        x.moveTo(tx, ty - th);
        x.lineTo(tx + th * 0.12, ty - th * 0.6);
        x.lineTo(tx - th * 0.14, ty - th * 0.62);
        x.closePath();
        x.fill();
      }
    }
    layers.push({ img: near, factor: 0.32 });
  } else if (key === "cloud") {
    // a sea of clouds at the bottom
    for (const [k, f, tint, shade] of [
      [0, 0.12, "#fff3d6", "#d9b98c"],
      [1, 0.26, "#ffffff", "#e6c79a"],
    ]) {
      const c = canvas(w, h * 0.34);
      const x = c.getContext("2d");
      const r = rng(seed + 31 + k);
      const hh = h * 0.34;
      x.fillStyle = shade;
      x.fillRect(0, hh * 0.6, w, hh);
      for (let i = 0; i < 26; i++) {
        const px = (i / 25) * w + (r() - 0.5) * 30;
        const pr = hh * (0.2 + r() * 0.22);
        x.fillStyle = shade;
        x.beginPath();
        x.arc(px, hh * 0.62, pr, 0, TAU);
        x.fill();
        x.fillStyle = tint;
        x.beginPath();
        x.arc(px - pr * 0.1, hh * 0.58, pr * 0.9, 0, TAU);
        x.fill();
      }
      layers.push({ img: c, factor: f });
    }
  } else if (key === "neon") {
    // horizon grid glow
    const c = canvas(w, h * 0.3);
    const x = c.getContext("2d");
    const hh = h * 0.3;
    const g = x.createLinearGradient(0, 0, 0, hh);
    g.addColorStop(0, "rgba(255,77,210,0)");
    g.addColorStop(1, "rgba(255,77,210,0.35)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, hh);
    x.strokeStyle = "rgba(77,240,255,0.35)";
    x.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const y = hh * 0.35 + Math.pow(i / 8, 1.8) * hh * 0.65;
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(w, y);
      x.stroke();
    }
    for (let i = -12; i <= 12; i++) {
      x.beginPath();
      x.moveTo(w / 2 + i * 22, hh * 0.35);
      x.lineTo(w / 2 + i * 120, hh);
      x.stroke();
    }
    layers.push({ img: c, factor: 0.2 });
  }
  return layers;
}

/* ------------------------------------------------ repeating mid-air field */

function islandSprite(seed, w, h) {
  // floating rock with ruined columns (Cloud Kingdom)
  const c = canvas(w, h);
  const x = c.getContext("2d");
  const r = rng(seed);
  const top = h * 0.55;
  x.fillStyle = "#b99a72";
  x.beginPath();
  x.moveTo(w * 0.08, top);
  x.lineTo(w * 0.92, top);
  x.lineTo(w * 0.6, h * 0.98);
  x.lineTo(w * 0.45, h * 0.9);
  x.closePath();
  x.fill();
  x.fillStyle = "#e9d7b3";
  x.fillRect(w * 0.06, top - 4, w * 0.88, 7);
  x.fillStyle = "#8fc27a";
  x.fillRect(w * 0.06, top - 6, w * 0.88, 3);
  const cols = 2 + Math.floor(r() * 3);
  for (let i = 0; i < cols; i++) {
    const cx = w * (0.2 + (0.6 * i) / Math.max(1, cols - 1));
    const ch = h * (0.25 + r() * 0.3);
    x.fillStyle = "#f5ead2";
    x.fillRect(cx - 5, top - 6 - ch, 10, ch);
    x.fillStyle = "#fff8e6";
    x.fillRect(cx - 7, top - 8 - ch, 14, 4);
    x.fillStyle = "rgba(160,120,60,0.3)";
    x.fillRect(cx + 1, top - 6 - ch, 3, ch);
  }
  if (r() < 0.6) {
    x.strokeStyle = "#f5ead2";
    x.lineWidth = 6;
    x.beginPath();
    x.arc(w * 0.5, top - h * 0.3, w * 0.16, Math.PI, 0);
    x.stroke();
  }
  return c;
}

function towerSprite(seed, w, h) {
  // floating futuristic structure (Neon Space)
  const c = canvas(w, h);
  const x = c.getContext("2d");
  const r = rng(seed);
  x.fillStyle = "#1a1c3a";
  x.beginPath();
  x.moveTo(w * 0.3, h * 0.15);
  x.lineTo(w * 0.7, h * 0.15);
  x.lineTo(w * 0.62, h * 0.85);
  x.lineTo(w * 0.5, h);
  x.lineTo(w * 0.38, h * 0.85);
  x.closePath();
  x.fill();
  x.fillRect(w * 0.1, h * 0.3, w * 0.8, h * 0.06);
  x.fillStyle = "#4df0ff";
  x.fillRect(w * 0.1, h * 0.3, w * 0.8, 2);
  const n = 4 + Math.floor(r() * 4);
  for (let i = 0; i < n; i++) {
    x.fillStyle = r() < 0.5 ? "#ff4dd2" : "#4df0ff";
    x.fillRect(w * (0.4 + r() * 0.18), h * (0.2 + (i / n) * 0.55), 4, 3);
  }
  x.fillStyle = "#ff4dd2";
  x.fillRect(w * 0.49, h * 0.02, 2, h * 0.13);
  return c;
}

/* ================================================================ class */

export class Background {
  constructor() {
    this.key = "";
    this.w = 0;
    this.h = 0;
    this.q = "medium";
    this.cache = null;
  }

  ensure(key, w, h, q) {
    if (this.cache && key === this.key && Math.abs(w - this.w) < 1 && Math.abs(h - this.h) < 1 && q === this.q) return;
    this.key = key;
    this.w = w;
    this.h = h;
    this.q = q;
    const seed = { sunny: 11, sunset: 22, frozen: 33, cloud: 44, neon: 55 }[key] || 1;
    const r = rng(seed * 97);
    const cloudTint = { sunny: ["#ffffff", "#cfe3f5"], sunset: ["#ffd6c4", "#c9708e"], frozen: ["#f7fbff", "#b8cde6"], cloud: ["#fffaf0", "#e7cfa6"], neon: ["#3a2a7a", "#1c1450"] }[key];
    const clouds = [];
    const nClouds = q === "low" ? 6 : q === "high" ? 16 : 11;
    const sprites = [];
    for (let i = 0; i < 4; i++) sprites.push(cloudSprite(240 + i * 30, 90 + i * 10, cloudTint[0], cloudTint[1], seed * 13 + i));
    for (let i = 0; i < nClouds; i++) {
      const depth = r();
      clouds.push({
        img: sprites[i % sprites.length],
        x: r(),
        y: r(), // 0..1 of the repeating period
        scale: 0.45 + depth * 0.8,
        factor: 0.15 + depth * 0.35,
        speed: 4 + depth * 10,
        alpha: key === "neon" ? 0.35 + depth * 0.3 : 0.55 + depth * 0.45,
      });
    }
    clouds.sort((a, b) => a.factor - b.factor);
    const props = [];
    if (key === "cloud" || key === "neon") {
      const n = q === "low" ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const depth = r();
        props.push({
          img: key === "cloud" ? islandSprite(seed + i * 7, 150, 130) : towerSprite(seed + i * 7, 90, 190),
          x: (i + 0.5) / n + (r() - 0.5) * 0.1,
          y: r(),
          scale: 0.5 + depth * 0.6,
          factor: 0.12 + depth * 0.2,
          bob: r() * TAU,
        });
      }
    }
    const stars = [];
    if (key === "neon" || key === "frozen" || key === "cloud") {
      const n = key === "neon" ? (q === "low" ? 60 : q === "high" ? 220 : 130) : 50;
      for (let i = 0; i < n; i++) stars.push({ x: r(), y: r(), s: r() < 0.9 ? 0.6 + r() : 1.6 + r() * 0.8, tw: r() * TAU });
    }
    const birds = [];
    if (key === "sunny" || key === "sunset") for (let i = 0; i < 4; i++) birds.push({ x: r(), y: r(), sp: 18 + r() * 14, ph: r() * TAU });
    const flakes = [];
    if (key === "frozen" || key === "cloud") {
      const n = q === "low" ? 25 : q === "high" ? 110 : 60;
      for (let i = 0; i < n; i++) flakes.push({ x: r(), y: r(), r: 0.8 + r() * 2.2, sp: 16 + r() * 30, ph: r() * TAU });
    }
    this.cache = { ground: buildGround(key, w, h, q, seed), clouds, props, stars, birds, flakes, sky: SKY[key] || SKY.sunny };
  }

  /**
   * climb: world units the camera bottom is above y=0; s: px per unit.
   * altitude: 0..1 progress for the sky blend.
   */
  draw(ctx, key, w, h, climb, s, t, q, altitude = 0, motion = 1, calm = 1) {
    this.ensure(key, w, h, q);
    const c = this.cache;
    const climbPx = climb * s;
    const k = Math.max(0, Math.min(1, altitude));

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, mixHex(c.sky.low[0], c.sky.high[0], k));
    g.addColorStop(0.55, mixHex(c.sky.low[1], c.sky.high[1], k));
    g.addColorStop(1, mixHex(c.sky.low[2], c.sky.high[2], k));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // stars
    if (c.stars.length) {
      const vis = key === "neon" ? 1 : key === "frozen" ? k * 0.7 : k * 0.4;
      if (vis > 0.02) {
        const period = h * 1.6;
        for (const st of c.stars) {
          const y = (((st.y * period + climbPx * 0.04) % period) + period) % period - (period - h) / 2;
          const tw = 0.55 + 0.45 * Math.sin(t * 1.6 * motion + st.tw);
          ctx.globalAlpha = vis * tw;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(st.x * w, y, st.s, st.s);
        }
        ctx.globalAlpha = 1;
      }
    }

    this.drawCelestial(ctx, key, w, h, climbPx, t, q);

    // clouds (repeat vertically), far ones first
    const period = h * 1.5;
    for (const cl of c.clouds) {
      const cw = cl.img.width * cl.scale * (h / 700);
      const ch = cl.img.height * cl.scale * (h / 700);
      const x = ((((cl.x * (w + cw) + t * cl.speed * motion) % (w + cw)) + (w + cw)) % (w + cw)) - cw;
      const y = (((cl.y * period + climbPx * cl.factor) % period) + period) % period - (period - h) / 2 - ch / 2;
      ctx.globalAlpha = cl.alpha * calm;
      ctx.drawImage(cl.img, x, y, cw, ch);
    }
    ctx.globalAlpha = 1;

    // floating islands / structures
    if (c.props.length) {
      const pp = h * 1.8;
      for (const p of c.props) {
        const pw = p.img.width * p.scale * (h / 700);
        const ph = p.img.height * p.scale * (h / 700);
        const y = (((p.y * pp + climbPx * p.factor) % pp) + pp) % pp - (pp - h) / 2 - ph / 2 + Math.sin(t * 0.6 * motion + p.bob) * 4;
        ctx.globalAlpha = 0.55 + p.factor;
        ctx.drawImage(p.img, p.x * w - pw / 2, y, pw, ph);
      }
      ctx.globalAlpha = 1;
    }

    // ground layers anchored to world y=0
    for (const L of c.ground) {
      const y = h - L.img.height + climbPx * L.factor;
      if (y > h) continue;
      ctx.drawImage(L.img, 0, y);
      // fill below the layer image so nothing gaps as it slides
      if (y + L.img.height < h) {
        ctx.drawImage(L.img, 0, L.img.height - 2, L.img.width, 2, 0, y + L.img.height - 1, w, h - (y + L.img.height) + 2);
      }
    }

    // birds
    if (c.birds.length && q !== "low") {
      ctx.strokeStyle = key === "sunset" ? "rgba(50,20,50,0.7)" : "rgba(40,60,90,0.55)";
      ctx.lineWidth = 1.6;
      const bp = h * 1.3;
      for (const b of c.birds) {
        const x = ((b.x * w + t * b.sp * motion) % (w + 60)) - 30;
        const y = (((b.y * bp + climbPx * 0.3) % bp) + bp) % bp - (bp - h) / 2;
        const f = Math.sin(t * 8 + b.ph) * 4;
        ctx.beginPath();
        ctx.moveTo(x - 7, y - f);
        ctx.quadraticCurveTo(x - 3, y - 3, x, y);
        ctx.quadraticCurveTo(x + 3, y - 3, x + 7, y - f);
        ctx.stroke();
      }
    }

    // falling snow / drifting motes
    if (c.flakes.length && q !== "low" && motion > 0.1) {
      ctx.fillStyle = key === "cloud" ? "rgba(255,240,200,0.8)" : "rgba(255,255,255,0.9)";
      for (const f of c.flakes) {
        const y = (((f.y * h + t * f.sp + climbPx * 0.5) % (h + 10)) + h + 10) % (h + 10) - 5;
        const x = f.x * w + Math.sin(t * 0.8 + f.ph) * 14;
        ctx.globalAlpha = key === "cloud" ? 0.5 : 0.85;
        ctx.beginPath();
        ctx.arc(x, y, f.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  drawCelestial(ctx, key, w, h, climbPx, t, q) {
    const drift = climbPx * 0.02;
    if (key === "sunny") {
      const x = w * 0.82;
      const y = h * 0.16 + drift;
      const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.3);
      g.addColorStop(0, "rgba(255,250,220,0.95)");
      g.addColorStop(0.12, "rgba(255,244,190,0.85)");
      g.addColorStop(0.2, "rgba(255,240,180,0.25)");
      g.addColorStop(1, "rgba(255,240,180,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - h * 0.3, y - h * 0.3, h * 0.6, h * 0.6);
    } else if (key === "sunset") {
      const x = w * 0.3;
      const y = h * 0.62 + drift;
      const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.5);
      g.addColorStop(0, "rgba(255,236,170,1)");
      g.addColorStop(0.14, "rgba(255,196,120,0.95)");
      g.addColorStop(0.16, "rgba(255,160,110,0.4)");
      g.addColorStop(1, "rgba(255,120,110,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - h * 0.5, y - h * 0.5, h, h);
    } else if (key === "frozen") {
      const x = w * 0.78;
      const y = h * 0.2 + drift;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(x, y, h * 0.045, 0, TAU);
      ctx.fill();
      if (q === "high") {
        // aurora ribbon
        ctx.globalAlpha = 0.18;
        for (let i = 0; i < 3; i++) {
          const g = ctx.createLinearGradient(0, h * 0.05, 0, h * 0.4);
          g.addColorStop(0, "rgba(120,255,200,0)");
          g.addColorStop(0.5, i % 2 ? "rgba(120,200,255,0.9)" : "rgba(120,255,200,0.9)");
          g.addColorStop(1, "rgba(120,255,200,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          for (let xx = 0; xx <= w; xx += 20) {
            const yy = h * 0.14 + Math.sin(xx * 0.006 + t * 0.3 + i) * h * 0.05 + drift * 0.5;
            if (xx === 0) ctx.moveTo(xx, yy);
            else ctx.lineTo(xx, yy);
          }
          for (let xx = w; xx >= 0; xx -= 20) ctx.lineTo(xx, h * 0.3 + Math.sin(xx * 0.005 + t * 0.25 + i) * h * 0.04 + drift * 0.5);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } else if (key === "cloud") {
      const x = w * 0.5;
      const y = h * 0.95 + drift;
      const g = ctx.createRadialGradient(x, y, 0, x, y, h * 0.9);
      g.addColorStop(0, "rgba(255,230,160,0.8)");
      g.addColorStop(0.35, "rgba(255,210,140,0.25)");
      g.addColorStop(1, "rgba(255,210,140,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      if (q !== "low") {
        // god rays
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = "#fff4cc";
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.22 + Math.sin(t * 0.1 + i) * 0.02;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a - 0.05) * h * 1.4, y + Math.sin(a - 0.05) * h * 1.4);
          ctx.lineTo(x + Math.cos(a + 0.05) * h * 1.4, y + Math.sin(a + 0.05) * h * 1.4);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    } else if (key === "neon") {
      // nebula + ringed planet
      if (q !== "low") {
        const n = ctx.createRadialGradient(w * 0.25, h * 0.35 + drift * 0.5, 0, w * 0.25, h * 0.35 + drift * 0.5, h * 0.6);
        n.addColorStop(0, "rgba(160,60,255,0.28)");
        n.addColorStop(1, "rgba(160,60,255,0)");
        ctx.fillStyle = n;
        ctx.fillRect(0, 0, w, h);
        const n2 = ctx.createRadialGradient(w * 0.8, h * 0.7 + drift * 0.5, 0, w * 0.8, h * 0.7 + drift * 0.5, h * 0.5);
        n2.addColorStop(0, "rgba(255,60,200,0.18)");
        n2.addColorStop(1, "rgba(255,60,200,0)");
        ctx.fillStyle = n2;
        ctx.fillRect(0, 0, w, h);
      }
      const px = w * 0.84;
      const py = h * 0.22 + drift;
      const pr = h * 0.09;
      const pg = ctx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
      pg.addColorStop(0, "#ffb3e8");
      pg.addColorStop(0.6, "#9b4dff");
      pg.addColorStop(1, "#2a1060");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(77,240,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px, py, pr * 1.8, pr * 0.4, -0.3, 0, TAU);
      ctx.stroke();
    }
  }
}
