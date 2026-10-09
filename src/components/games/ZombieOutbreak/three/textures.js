/**
 * Zombie Outbreak — procedural textures (canvas → THREE.CanvasTexture),
 * generated once and cached. No image files: every surface is painted here.
 */
import * as THREE from "three";
import { createRng } from "../engine/math.js";

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function tex(key, w, h, paint, { repeat = true, srgb = true, aniso = 8 } = {}) {
  if (cache.has(key)) return cache.get(key);
  const [c, ctx] = canvas(w, h);
  paint(ctx, w, h, createRng(hash(key)));
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/** Speckle noise over a base colour. */
function noise(ctx, w, h, rng, base, n, spread, alpha = 0.18, size = 2) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rng.range(-spread, spread));
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${(alpha * v) / spread})` : `rgba(0,0,0,${(alpha * -v) / spread})`;
    ctx.fillRect(rng.range(0, w), rng.range(0, h), size, size);
  }
}

function blotches(ctx, w, h, rng, n, color, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(rmin, rmax);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color);
    gr.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gr;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function cracks(ctx, w, h, rng, n, color = "rgba(0,0,0,0.5)", width = 1.2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (let i = 0; i < n; i++) {
    let x = rng.range(0, w);
    let y = rng.range(0, h);
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segs = rng.int(3, 8);
    let a = rng.range(0, Math.PI * 2);
    for (let k = 0; k < segs; k++) {
      a += rng.range(-0.8, 0.8);
      x += Math.cos(a) * rng.range(6, 22);
      y += Math.sin(a) * rng.range(6, 22);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/* ------------------------------------------------------------------ ground */

export const asphaltTex = () =>
  tex("asphalt", 512, 512, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, "#2b2c2e", 26000, 10, 0.35, 2);
    blotches(ctx, w, h, rng, 26, "rgba(0,0,0,0.28)", 20, 70);
    blotches(ctx, w, h, rng, 10, "rgba(120,110,95,0.10)", 30, 80);
    cracks(ctx, w, h, rng, 22, "rgba(5,5,5,0.7)", 1.5);
    // Tar repair strips.
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = "rgba(10,10,12,0.45)";
      ctx.save();
      ctx.translate(rng.range(0, w), rng.range(0, h));
      ctx.rotate(rng.range(0, Math.PI));
      ctx.fillRect(-60, -3, 120, 6);
      ctx.restore();
    }
  });

export const sidewalkTex = () =>
  tex("sidewalk", 512, 512, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, "#6c6a66", 20000, 10, 0.25, 2);
    blotches(ctx, w, h, rng, 18, "rgba(0,0,0,0.18)", 20, 60);
    ctx.strokeStyle = "rgba(20,20,20,0.6)";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (i * h) / 4);
      ctx.lineTo(w, (i * h) / 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo((i * w) / 2, 0);
      ctx.lineTo((i * w) / 2, h);
      ctx.stroke();
    }
    cracks(ctx, w, h, rng, 10, "rgba(10,10,10,0.55)", 1.2);
  });

export const concreteTex = (tint = "#5d5c58", key = "concrete") =>
  tex(key + tint, 512, 512, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, tint, 22000, 10, 0.25, 2);
    blotches(ctx, w, h, rng, 30, "rgba(0,0,0,0.2)", 25, 90);
    blotches(ctx, w, h, rng, 8, "rgba(60,40,20,0.15)", 40, 110);
    cracks(ctx, w, h, rng, 8, "rgba(0,0,0,0.5)", 1.2);
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);
  });

export const tileTex = (base = "#b9b8ae", grout = "#5c5d58", key = "tile") =>
  tex(key + base, 512, 512, (ctx, w, h, rng) => {
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, w, h);
    const n = 8;
    const s = w / n;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = rng.range(-14, 10);
        const c = new THREE.Color(base).offsetHSL(0, 0, v / 255);
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.fillRect(x * s + 2, y * s + 2, s - 4, s - 4);
      }
    }
    blotches(ctx, w, h, rng, 26, "rgba(40,35,20,0.22)", 20, 80);
    blotches(ctx, w, h, rng, 6, "rgba(70,10,8,0.25)", 10, 40);
    cracks(ctx, w, h, rng, 6, "rgba(0,0,0,0.55)", 1.2);
  });

export const metalFloorTex = () =>
  tex("metalfloor", 512, 512, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, "#3a3d40", 16000, 10, 0.25, 2);
    const s = w / 4;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * s, 0);
      ctx.lineTo(i * s, h);
      ctx.moveTo(0, i * s);
      ctx.lineTo(w, i * s);
      ctx.stroke();
    }
    // Diamond tread.
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    for (let y = 0; y < h; y += 16) {
      for (let x = (y / 16) % 2 ? 8 : 0; x < w; x += 16) {
        ctx.fillRect(x, y, 6, 2);
      }
    }
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      for (const [dx, dy] of [[8, 8], [s - 8, 8], [8, s - 8], [s - 8, s - 8]]) {
        ctx.beginPath();
        ctx.arc(i * s + dx, k * s + dy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    blotches(ctx, w, h, rng, 20, "rgba(90,50,20,0.18)", 20, 70);
  });

export const dirtTex = () =>
  tex("dirt", 512, 512, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, "#4a4334", 30000, 12, 0.35, 2);
    blotches(ctx, w, h, rng, 30, "rgba(30,35,20,0.35)", 20, 80);
    blotches(ctx, w, h, rng, 20, "rgba(0,0,0,0.25)", 15, 50);
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = `rgba(${rng.int(80, 140)},${rng.int(80, 120)},${rng.int(60, 90)},0.5)`;
      ctx.fillRect(rng.range(0, w), rng.range(0, h), 3, 3);
    }
  });

/* ------------------------------------------------------------------ facades */

/**
 * Building facade atlas: an 8 × 6 grid of 2.5 m × 3.2 m bays (so the pattern
 * only repeats every 20 m × 19.2 m), windows randomly dark, dimly lit,
 * broken or boarded.
 */
export const facadeTex = (style = "brick", base = "#5b3b30") =>
  tex(`facade-${style}-${base}`, 1024, 768, (ctx, w, h, rng) => {
    const bw = w / 8;
    const bh = h / 6;
    if (style === "brick") {
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      const rowH = 8;
      for (let y = 0; y < h; y += rowH) {
        const off = (y / rowH) % 2 ? 9 : 0;
        for (let x = -off; x < w; x += 18) {
          const c = new THREE.Color(base).offsetHSL(rng.range(-0.01, 0.01), 0, rng.range(-0.06, 0.05));
          ctx.fillStyle = `#${c.getHexString()}`;
          ctx.fillRect(x + 1, y + 1, 16, rowH - 2);
        }
      }
    } else {
      noise(ctx, w, h, rng, base, 30000, 10, 0.22, 2);
      // Panel seams.
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      for (let y = 0; y < 6; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * bh + bh - 6);
        ctx.lineTo(w, y * bh + bh - 6);
        ctx.stroke();
      }
    }
    blotches(ctx, w, h, rng, 40, "rgba(0,0,0,0.22)", 30, 120);
    // Rain streaks.
    for (let i = 0; i < 90; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      const gr = ctx.createLinearGradient(x, y, x, y + 120);
      gr.addColorStop(0, "rgba(0,0,0,0.22)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(x, y, rng.range(2, 6), 120);
    }
    for (let by = 0; by < 6; by++) {
      for (let bx = 0; bx < 8; bx++) {
        const x = bx * bw + bw * 0.22;
        const y = by * bh + bh * 0.2;
        const ww = bw * 0.56;
        const wh = bh * 0.55;
        // Sill + lintel.
        ctx.fillStyle = "rgba(200,190,170,0.35)";
        ctx.fillRect(x - 4, y + wh, ww + 8, 6);
        ctx.fillRect(x - 4, y - 6, ww + 8, 5);
        const r = rng.next();
        if (r < 0.1) {
          // Dim warm light.
          const gr = ctx.createLinearGradient(x, y, x, y + wh);
          gr.addColorStop(0, "#c9873a");
          gr.addColorStop(1, "#6a3d18");
          ctx.fillStyle = gr;
          ctx.fillRect(x, y, ww, wh);
        } else if (r < 0.22) {
          // Boarded up.
          ctx.fillStyle = "#1a1612";
          ctx.fillRect(x, y, ww, wh);
          ctx.fillStyle = "#6b5236";
          for (let k = 0; k < 3; k++) {
            ctx.save();
            ctx.translate(x + ww / 2, y + (k + 0.5) * (wh / 3));
            ctx.rotate(rng.range(-0.25, 0.25));
            ctx.fillRect(-ww * 0.6, -6, ww * 1.2, 12);
            ctx.restore();
          }
        } else {
          const gr = ctx.createLinearGradient(x, y, x + ww, y + wh);
          gr.addColorStop(0, "#1d2433");
          gr.addColorStop(1, "#07090d");
          ctx.fillStyle = gr;
          ctx.fillRect(x, y, ww, wh);
          // Reflection.
          ctx.fillStyle = "rgba(140,160,200,0.10)";
          ctx.beginPath();
          ctx.moveTo(x, y + wh * 0.6);
          ctx.lineTo(x + ww * 0.5, y);
          ctx.lineTo(x + ww * 0.7, y);
          ctx.lineTo(x, y + wh);
          ctx.fill();
          if (r > 0.82) {
            // Broken pane.
            ctx.strokeStyle = "rgba(200,210,230,0.5)";
            ctx.lineWidth = 1.5;
            const cx = x + rng.range(0.2, 0.8) * ww;
            const cy = y + rng.range(0.2, 0.8) * wh;
            for (let k = 0; k < 7; k++) {
              const a = rng.range(0, Math.PI * 2);
              ctx.beginPath();
              ctx.moveTo(cx, cy);
              ctx.lineTo(cx + Math.cos(a) * ww * 0.6, cy + Math.sin(a) * wh * 0.6);
              ctx.stroke();
            }
            ctx.fillStyle = "#020203";
            ctx.beginPath();
            ctx.arc(cx, cy, ww * 0.18, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Frame.
        ctx.strokeStyle = "rgba(30,28,25,0.9)";
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, ww, wh);
        ctx.beginPath();
        ctx.moveTo(x + ww / 2, y);
        ctx.lineTo(x + ww / 2, y + wh);
        ctx.stroke();
      }
    }
    // Scorch marks.
    blotches(ctx, w, h, rng, 4, "rgba(0,0,0,0.55)", 60, 140);
  });

/** Ground-floor shopfront band (one 5 m bay; repeats along the street). */
export const shopfrontTex = (key = "shop", tint = "#3b3936") =>
  tex(`shopfront-${key}-${tint}`, 512, 256, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, tint, 9000, 10, 0.25, 2);
    // Two display windows + a door.
    const win = (x, ww, broken) => {
      const y = h * 0.18;
      const wh = h * 0.7;
      const gr = ctx.createLinearGradient(x, y, x, y + wh);
      gr.addColorStop(0, "#161b24");
      gr.addColorStop(1, "#050608");
      ctx.fillStyle = gr;
      ctx.fillRect(x, y, ww, wh);
      // Dim interior shelves.
      ctx.fillStyle = "rgba(90,80,60,0.25)";
      for (let k = 1; k < 4; k++) ctx.fillRect(x + 6, y + (wh * k) / 4, ww - 12, 4);
      if (broken) {
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.beginPath();
        ctx.moveTo(x + ww * 0.2, y + wh);
        for (let k = 0; k < 9; k++) ctx.lineTo(x + ww * (0.2 + k * 0.08), y + wh * rng.range(0.15, 0.7));
        ctx.lineTo(x + ww * 0.9, y + wh);
        ctx.fill();
        ctx.strokeStyle = "rgba(210,220,240,0.45)";
        ctx.lineWidth = 1.2;
        for (let k = 0; k < 10; k++) {
          ctx.beginPath();
          ctx.moveTo(x + rng.range(0, ww), y + rng.range(0, wh));
          ctx.lineTo(x + rng.range(0, ww), y + rng.range(0, wh));
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = "rgba(150,170,210,0.10)";
        ctx.fillRect(x + ww * 0.1, y, ww * 0.12, wh);
      }
      ctx.strokeStyle = "#1a1917";
      ctx.lineWidth = 6;
      ctx.strokeRect(x, y, ww, wh);
    };
    win(w * 0.04, w * 0.36, rng.chance(0.6));
    win(w * 0.6, w * 0.36, rng.chance(0.6));
    // Door.
    ctx.fillStyle = "#0b0b0c";
    ctx.fillRect(w * 0.43, h * 0.12, w * 0.14, h * 0.88);
    ctx.strokeStyle = "#2c2a26";
    ctx.lineWidth = 5;
    ctx.strokeRect(w * 0.43, h * 0.12, w * 0.14, h * 0.88);
    // Graffiti / stains.
    blotches(ctx, w, h, rng, 6, "rgba(0,0,0,0.4)", 20, 60);
    ctx.font = "bold 30px Impact, sans-serif";
    ctx.fillStyle = rng.chance(0.5) ? "rgba(190,30,30,0.75)" : "rgba(40,170,80,0.7)";
    ctx.save();
    ctx.translate(w * rng.range(0.1, 0.6), h * 0.55);
    ctx.rotate(rng.range(-0.15, 0.1));
    ctx.fillText(rng.pick(["KEEP OUT", "INFECTED", "NO ENTRY", "RUN", "DEAD INSIDE", "HELP US"]), 0, 0);
    ctx.restore();
  });

export const signTex = (text, color = "#ff4d5e") =>
  tex(`sign-${text}-${color}`, 512, 128, (ctx, w, h) => {
    ctx.fillStyle = "#121214";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#2c2c30";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.font = "bold 78px Impact, 'Arial Narrow', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + 4);
  }, { repeat: false });

/* ------------------------------------------------------------------ props */

export const containerTex = () =>
  tex("container", 512, 256, (ctx, w, h, rng) => {
    ctx.fillStyle = "#bdbdbd";
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      const g = ctx.createLinearGradient(x, 0, x + 16, 0);
      g.addColorStop(0, "rgba(0,0,0,0.25)");
      g.addColorStop(0.5, "rgba(255,255,255,0.18)");
      g.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 16, h);
    }
    blotches(ctx, w, h, rng, 30, "rgba(90,45,15,0.35)", 10, 50);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);
  });

export const crateTex = () =>
  tex("crate", 256, 256, (ctx, w, h, rng) => {
    for (let y = 0; y < h; y += 32) {
      const c = new THREE.Color("#7a5a36").offsetHSL(0, 0, rng.range(-0.06, 0.04));
      ctx.fillStyle = `#${c.getHexString()}`;
      ctx.fillRect(0, y, w, 30);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, y + 30, w, 2);
      for (let k = 0; k < 40; k++) {
        ctx.fillStyle = "rgba(40,25,10,0.25)";
        ctx.fillRect(rng.range(0, w), y + rng.range(0, 30), rng.range(10, 60), 1);
      }
    }
    ctx.strokeStyle = "#4b331c";
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, w - 18, h - 18);
    ctx.beginPath();
    ctx.moveTo(9, 9);
    ctx.lineTo(w - 9, h - 9);
    ctx.stroke();
    ctx.font = "bold 26px 'Arial Narrow', sans-serif";
    ctx.fillStyle = "rgba(20,15,10,0.6)";
    ctx.fillText("SUPPLY", 70, 140);
  });

export const plasterTex = (base = "#a49d8c", key = "plaster", band = "#4d6b66") =>
  tex(`plaster-${key}-${base}`, 512, 512, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, base, 20000, 10, 0.2, 2);
    blotches(ctx, w, h, rng, 26, "rgba(60,50,30,0.18)", 30, 110);
    // Dado band (lower third).
    ctx.fillStyle = band;
    ctx.fillRect(0, h * 0.7, w, h * 0.3);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, h * 0.7, w, 4);
    blotches(ctx, w, h, rng, 10, "rgba(0,0,0,0.25)", 20, 70);
    // Drips.
    for (let i = 0; i < 30; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h * 0.5);
      const g2 = ctx.createLinearGradient(x, y, x, y + 140);
      g2.addColorStop(0, "rgba(50,40,20,0.3)");
      g2.addColorStop(1, "rgba(50,40,20,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(x, y, 3, 140);
    }
    if (rng.chance(0.9)) blotches(ctx, w, h, rng, 3, "rgba(80,10,8,0.35)", 15, 40);
  });

export const metalWallTex = (base = "#4c5156", key = "metalwall") =>
  tex(`${key}-${base}`, 512, 512, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, base, 16000, 10, 0.22, 2);
    for (let x = 0; x < w; x += 64) {
      const g = ctx.createLinearGradient(x, 0, x + 64, 0);
      g.addColorStop(0, "rgba(0,0,0,0.3)");
      g.addColorStop(0.15, "rgba(255,255,255,0.08)");
      g.addColorStop(0.5, "rgba(0,0,0,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0.3)");
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, 64, h);
    }
    blotches(ctx, w, h, rng, 26, "rgba(110,55,20,0.22)", 15, 70);
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    for (let y = 16; y < h; y += 128) for (let x = 8; x < w; x += 32) {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });

export const hazardTex = () =>
  tex("hazard", 256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#e0b522";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#151515";
    for (let x = -h; x < w + h; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + 24, h);
      ctx.lineTo(x + 24 + h, 0);
      ctx.lineTo(x + h, 0);
      ctx.fill();
    }
  });

/* ------------------------------------------------------------------ characters */

/** Mottled rotting skin (tinted by material colour). */
export const skinTex = () =>
  tex("skin", 256, 256, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, "#d8d8d8", 9000, 10, 0.3, 2);
    blotches(ctx, w, h, rng, 30, "rgba(70,40,60,0.35)", 6, 28);
    blotches(ctx, w, h, rng, 20, "rgba(110,20,15,0.4)", 3, 12);
    blotches(ctx, w, h, rng, 14, "rgba(40,60,20,0.35)", 8, 30);
    // Veins.
    ctx.strokeStyle = "rgba(40,30,70,0.35)";
    ctx.lineWidth = 1;
    cracks(ctx, w, h, rng, 26, "rgba(50,30,70,0.35)", 1);
  });

/** Head: skin + sunken eyes + torn mouth (front of a SphereGeometry is u = 0.25). */
export const faceTex = () =>
  tex("face", 512, 256, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, "#d6d6d2", 12000, 10, 0.3, 2);
    blotches(ctx, w, h, rng, 26, "rgba(70,40,60,0.35)", 6, 26);
    blotches(ctx, w, h, rng, 14, "rgba(120,20,15,0.45)", 3, 12);
    const cx = w * 0.25;
    const cy = h * 0.5;
    // Eye sockets.
    for (const s of [-1, 1]) {
      const g = ctx.createRadialGradient(cx + s * 30, cy - 8, 2, cx + s * 30, cy - 8, 26);
      g.addColorStop(0, "rgba(10,5,5,1)");
      g.addColorStop(0.6, "rgba(40,15,20,0.8)");
      g.addColorStop(1, "rgba(60,30,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx + s * 30 - 28, cy - 36, 56, 56);
    }
    // Nose cavity.
    ctx.fillStyle = "rgba(30,10,10,0.8)";
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy + 18);
    ctx.lineTo(cx + 6, cy + 18);
    ctx.lineTo(cx, cy + 6);
    ctx.fill();
    // Mouth.
    ctx.fillStyle = "#1a0606";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 40, 26, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b8b08a";
    for (let k = -3; k <= 3; k++) ctx.fillRect(cx + k * 7 - 2, cy + 32, 4, 6 + rng.range(0, 3));
    // Blood drool.
    ctx.fillStyle = "rgba(110,10,10,0.7)";
    ctx.fillRect(cx - 10, cy + 46, 5, 30);
    ctx.fillRect(cx + 8, cy + 48, 3, 18);
  });

/** Torn, bloodied clothing (tinted by material colour). */
export const clothTex = () =>
  tex("cloth", 256, 256, (ctx, w, h, rng) => {
    noise(ctx, w, h, rng, "#c8c8c8", 10000, 10, 0.25, 2);
    // Weave.
    ctx.fillStyle = "rgba(0,0,0,0.06)";
    for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
    blotches(ctx, w, h, rng, 16, "rgba(70,8,8,0.55)", 8, 34);
    blotches(ctx, w, h, rng, 20, "rgba(0,0,0,0.3)", 10, 40);
    // Rips (dark holes with frayed edges).
    for (let i = 0; i < 7; i++) {
      const x = rng.range(0, w);
      const y = rng.range(0, h);
      ctx.fillStyle = "rgba(25,12,12,0.85)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 7; k++) ctx.lineTo(x + rng.range(-20, 20), y + rng.range(-14, 14));
      ctx.fill();
    }
  });

export const groundGlowTex = () =>
  tex("glow", 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.45)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { repeat: false, srgb: false });

export const blobShadowTex = () =>
  tex("blob", 128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(0,0,0,0.75)");
    g.addColorStop(0.6, "rgba(0,0,0,0.35)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { repeat: false, srgb: false });

export const smokeTex = () =>
  tex("smoke", 128, 128, (ctx, w, h, rng) => {
    for (let i = 0; i < 22; i++) {
      const x = w / 2 + rng.range(-24, 24);
      const y = h / 2 + rng.range(-24, 24);
      const r = rng.range(18, 40);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255,0.22)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }, { repeat: false, srgb: false });

export const ringTex = () =>
  tex("ring", 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,0.18)");
    g.addColorStop(0.82, "rgba(255,255,255,0.35)");
    g.addColorStop(0.9, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    ctx.fill();
  }, { repeat: false, srgb: false });

export const decalTex = (kind) =>
  tex(`decal-${kind}`, 128, 128, (ctx, w, h, rng) => {
    ctx.clearRect(0, 0, w, h);
    if (kind === "hole") {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(0.18, "rgba(10,10,10,0.95)");
      g.addColorStop(0.3, "rgba(40,35,30,0.6)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    } else if (kind === "splat") {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      for (let i = 0; i < 16; i++) {
        ctx.beginPath();
        ctx.arc(w / 2 + rng.range(-34, 34), h / 2 + rng.range(-34, 34), rng.range(4, 18), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 26, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "cross") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(w * 0.38, h * 0.14, w * 0.24, h * 0.72);
      ctx.fillRect(w * 0.14, h * 0.38, w * 0.72, h * 0.24);
    }
  }, { repeat: false, srgb: false });

export const skyTex = (top = "#0b1020", bottom = "#2a2f3c", glow = "#4a3a3a") =>
  tex(`sky-${top}-${bottom}-${glow}`, 512, 512, (ctx, w, h, rng) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(0.55, bottom);
    g.addColorStop(0.62, glow);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Cloud bands.
    for (let i = 0; i < 70; i++) {
      const x = rng.range(0, w);
      const y = rng.range(h * 0.15, h * 0.58);
      const r = rng.range(30, 90);
      const gg = ctx.createRadialGradient(x, y, 0, x, y, r);
      gg.addColorStop(0, "rgba(140,140,160,0.10)");
      gg.addColorStop(1, "rgba(140,140,160,0)");
      ctx.fillStyle = gg;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }, { repeat: false });

export const chainTex = () =>
  tex("chain", 128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(200,205,210,1)";
    ctx.lineWidth = 3;
    for (let i = -w; i < w * 2; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + h, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
    }
  });
