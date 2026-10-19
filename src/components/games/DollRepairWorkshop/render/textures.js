/**
 * Canvas-generated textures (no image files): fabrics, plush fur, wood
 * grain, hair strands, irises, and the workshop's floor, wallpaper, rug and
 * marble. Cached per key; `disposeTextures()` frees them on unmount.
 * Outside a browser (headless tests) every factory returns null.
 */
import * as THREE from "three";
import { mulberry } from "../engine/rng.js";

const HAS_DOM = typeof document !== "undefined";
const cache = new Map();

export function canvas(w, h) {
  if (!HAS_DOM) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function make(key, w, h, draw, { repeat = null, srgb = true, aniso = 4 } = {}) {
  if (!HAS_DOM) return null;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(w, h);
  const ctx = c.getContext("2d");
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.userData.shared = true;
  cache.set(key, t);
  return t;
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/* ---------------------------------------------------------------- fabrics */
/** Light-grey weave (tinted by material colour). kind: cotton|lace|velvet|knit|patch|denim */
export function fabricTex(kind = "cotton") {
  return make(`fab:${kind}`, 256, 256, (g, w, h) => {
    const r = mulberry(kind.length * 977);
    g.fillStyle = "#f2f2f2";
    g.fillRect(0, 0, w, h);
    if (kind === "cotton" || kind === "denim") {
      for (let y = 0; y < h; y += 2) {
        g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`;
        g.fillRect(0, y, w, 1);
      }
      for (let x = 0; x < w; x += 2) {
        g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.05})`;
        g.fillRect(x, 0, 1, h);
      }
      if (kind === "denim") for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
        g.fillRect(r() * w, r() * h, 3, 1);
      }
    } else if (kind === "lace") {
      g.fillStyle = "#e8e8e8";
      g.fillRect(0, 0, w, h);
      g.strokeStyle = "rgba(255,255,255,0.95)";
      g.lineWidth = 3;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const cx = x * 64 + 32, cy = y * 64 + 32;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          g.moveTo(cx, cy);
          g.quadraticCurveTo(cx + Math.cos(a + 0.5) * 22, cy + Math.sin(a + 0.5) * 22, cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
        }
        g.stroke();
        g.beginPath();
        g.arc(cx, cy, 7, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(cx + 32, cy + 32, 12, 0, Math.PI * 2);
        g.stroke();
      }
    } else if (kind === "velvet") {
      const grd = g.createLinearGradient(0, 0, w, h);
      grd.addColorStop(0, "#e6e6e6");
      grd.addColorStop(0.5, "#ffffff");
      grd.addColorStop(1, "#dedede");
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = `rgba(0,0,0,${r() * 0.05})`;
        g.fillRect(r() * w, r() * h, 1, 2);
      }
    } else if (kind === "knit") {
      for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 12) {
        g.fillStyle = "rgba(0,0,0,0.09)";
        g.beginPath();
        g.ellipse(x + 3, y + 8, 3.5, 7, -0.5, 0, Math.PI * 2);
        g.ellipse(x + 9, y + 8, 3.5, 7, 0.5, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(x + 2, y + 4, 1, 6);
        g.fillRect(x + 9, y + 4, 1, 6);
      }
    } else if (kind === "patch") {
      const cols = ["#f2f2f2", "#d9d9d9", "#ffffff", "#e3e3e3"];
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = cols[(x + y * 3) % 4];
        g.fillRect(x * 64, y * 64, 64, 64);
        if ((x + y) % 2) {
          g.fillStyle = "rgba(0,0,0,0.12)";
          for (let d = 0; d < 6; d++) {
            g.beginPath();
            g.arc(x * 64 + 10 + (d % 3) * 22, y * 64 + 16 + Math.floor(d / 3) * 30, 5, 0, Math.PI * 2);
            g.fill();
          }
        } else {
          g.fillStyle = "rgba(0,0,0,0.08)";
          for (let s = 0; s < 64; s += 8) g.fillRect(x * 64 + s, y * 64, 3, 64);
        }
        g.strokeStyle = "rgba(60,40,30,0.5)";
        g.setLineDash([4, 3]);
        g.lineWidth = 1.5;
        g.strokeRect(x * 64 + 2, y * 64 + 2, 60, 60);
        g.setLineDash([]);
      }
    }
  }, { repeat: [3, 3] });
}

/** Mohair fur for the teddy (tinted). */
export function furTex() {
  return make("fur", 256, 256, (g, w, h) => {
    const r = mulberry(31);
    g.fillStyle = "#d8d8d8";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const x = r() * w, y = r() * h, l = 3 + r() * 6, a = 1.2 + (r() - 0.5) * 0.8;
      const v = Math.floor(170 + r() * 85);
      g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      g.stroke();
    }
  }, { repeat: [4, 4] });
}

export function furBump() {
  return make("furB", 128, 128, (g, w, h) => {
    const r = mulberry(32);
    g.fillStyle = "#808080";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(r() * 255);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(r() * w, r() * h, 1, 3);
    }
  }, { repeat: [5, 5], srgb: false });
}

/** Carved wood grain (tinted lightly). */
export function woodTex(tone = "light") {
  return make(`wood:${tone}`, 256, 256, (g, w, h) => {
    const r = mulberry(tone === "light" ? 11 : 12);
    const base = tone === "light" ? [222, 176, 128] : tone === "dark" ? [120, 78, 48] : [178, 124, 80];
    g.fillStyle = `rgb(${base})`;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const k = Math.sin(y * 0.18 + Math.sin(y * 0.031) * 4) * 0.5 + 0.5;
      g.fillStyle = `rgba(80,45,20,${0.05 + k * 0.1})`;
      g.fillRect(0, y, w, 1);
    }
    for (let i = 0; i < 6; i++) {
      const cx = r() * w, cy = r() * h;
      g.strokeStyle = "rgba(90,50,25,0.18)";
      for (let k = 1; k < 5; k++) {
        g.beginPath();
        g.ellipse(cx, cy, 4 * k, 2 * k, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }, { repeat: [1, 1] });
}

/** Floorboards (wide planks, warm). */
export function floorTex(stage = 1) {
  return make(`floor:${stage}`, 512, 512, (g, w, h) => {
    const r = mulberry(40 + stage);
    const palette = stage === 3 ? [[214, 196, 172], [226, 210, 186], [205, 186, 160]] : stage === 2 ? [[176, 120, 78], [190, 132, 86], [166, 112, 72]] : [[196, 150, 104], [208, 162, 112], [186, 140, 96]];
    if (stage === 3) {
      // herringbone parquet: zig-zag rows of short planks over a warm base
      g.fillStyle = "rgb(214,196,172)";
      g.fillRect(0, 0, w, h);
      const pl = 64, pwid = 22;
      for (let row = -2; row < h / pwid + 2; row++) {
        for (let col = -2; col < w / pl + 2; col++) {
          for (const dir of [1, -1]) {
            const c = palette[Math.floor(r() * 3)];
            g.save();
            g.translate(col * pl * 1.42 + (dir < 0 ? pl * 0.71 : 0), row * pwid * 1.42);
            g.rotate(dir * Math.PI / 4);
            g.fillStyle = `rgb(${c})`;
            g.fillRect(0, 0, pl, pwid);
            g.strokeStyle = "rgba(120,85,55,0.45)";
            g.lineWidth = 1.5;
            g.strokeRect(0, 0, pl, pwid);
            g.restore();
          }
        }
      }
      return;
    }
    const pw = 64;
    for (let x = 0; x < w; x += pw) {
      let y = -Math.floor(r() * 200);
      while (y < h) {
        const len = 180 + r() * 200;
        const c = palette[Math.floor(r() * 3)];
        g.fillStyle = `rgb(${c})`;
        g.fillRect(x, y, pw, len);
        for (let k = 0; k < 18; k++) {
          g.fillStyle = `rgba(90,55,30,${0.04 + r() * 0.06})`;
          g.fillRect(x + r() * pw, y, 1 + r() * 2, len);
        }
        g.fillStyle = "rgba(60,35,20,0.55)";
        g.fillRect(x, y, pw, 2);
        y += len;
      }
      g.fillStyle = "rgba(60,35,20,0.5)";
      g.fillRect(x, 0, 2, h);
    }
  }, { repeat: [4, 4] });
}

/** Wallpaper per stage: plaster (1), floral stripes (2), damask (3). */
export function wallTex(stage = 1) {
  return make(`wall:${stage}`, 512, 512, (g, w, h) => {
    const r = mulberry(70 + stage);
    if (stage === 1) {
      g.fillStyle = "#f4e7d6";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "160,130,100"},${r() * 0.05})`;
        g.fillRect(r() * w, r() * h, 2, 2);
      }
      return;
    }
    if (stage === 2) {
      for (let x = 0; x < w; x += 64) {
        g.fillStyle = (x / 64) % 2 ? "#f7dce0" : "#fbeae6";
        g.fillRect(x, 0, 64, h);
      }
      for (let y = 20; y < h; y += 64) for (let x = 32; x < w; x += 128) {
        const yy = y + ((x / 128) % 2) * 32;
        g.fillStyle = "rgba(214,120,140,0.55)";
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          g.beginPath();
          g.arc(x + Math.cos(a) * 6, yy + Math.sin(a) * 6, 5, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = "rgba(240,200,110,0.9)";
        g.beginPath();
        g.arc(x, yy, 3.5, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(120,160,110,0.6)";
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x, yy + 10);
        g.quadraticCurveTo(x + 10, yy + 22, x + 2, yy + 34);
        g.stroke();
      }
      return;
    }
    g.fillStyle = "#e9dcef";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(170,140,200,0.35)";
    for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) {
      const cx = x + 64 + (((y / 128) % 2) * 64) % 128, cy = y + 64;
      g.beginPath();
      g.moveTo(cx, cy - 48);
      g.bezierCurveTo(cx + 40, cy - 30, cx + 40, cy + 30, cx, cy + 48);
      g.bezierCurveTo(cx - 40, cy + 30, cx - 40, cy - 30, cx, cy - 48);
      g.fill();
      g.strokeStyle = "rgba(210,180,110,0.7)";
      g.lineWidth = 2;
      g.stroke();
    }
  }, { repeat: [3, 1.4] });
}

export function rugTex(stage = 2) {
  return make(`rug:${stage}`, 512, 512, (g, w, h) => {
    const cols = stage === 3 ? ["#7d3f6e", "#d9b25a", "#f4ead2", "#3a4f86"] : ["#c97b84", "#f4ead2", "#8fb3a3", "#e8b86a"];
    g.fillStyle = cols[0];
    g.fillRect(0, 0, w, h);
    g.fillStyle = cols[1];
    g.fillRect(24, 24, w - 48, h - 48);
    g.fillStyle = cols[0];
    g.fillRect(40, 40, w - 80, h - 80);
    g.fillStyle = cols[2];
    g.fillRect(56, 56, w - 112, h - 112);
    g.save();
    g.translate(w / 2, h / 2);
    for (let k = 0; k < 12; k++) {
      g.rotate(Math.PI / 6);
      g.fillStyle = k % 2 ? cols[3] : cols[0];
      g.beginPath();
      g.ellipse(0, 90, 26, 60, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = cols[1];
    g.beginPath();
    g.arc(0, 0, 48, 0, Math.PI * 2);
    g.fill();
    g.restore();
    for (let i = 0; i < 20000; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
  });
}

export function marbleTex() {
  return make("marble", 512, 512, (g, w, h) => {
    const r = mulberry(5);
    g.fillStyle = "#f4f0ec";
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 14; k++) {
      g.strokeStyle = `rgba(150,140,150,${0.15 + r() * 0.25})`;
      g.lineWidth = 0.6 + r() * 2;
      g.beginPath();
      let x = r() * w, y = 0;
      g.moveTo(x, y);
      while (y < h) {
        x += (r() - 0.5) * 40;
        y += 10 + r() * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  }, { repeat: [2, 1] });
}

/** Self-healing cutting mat (green grid). */
export function matTex() {
  return make("mat", 512, 512, (g, w, h) => {
    g.fillStyle = "#3f7d6a";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(220,240,230,0.35)";
    g.lineWidth = 1;
    for (let x = 0; x <= w; x += 16) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = 0; y <= h; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.strokeStyle = "rgba(240,250,240,0.6)";
    g.lineWidth = 2;
    for (let x = 0; x <= w; x += 128) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(w, 0);
    g.stroke();
  });
}

/** Pegboard with holes. */
export function pegTex() {
  return make("peg", 256, 256, (g, w, h) => {
    g.fillStyle = "#d8b98e";
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#6b4f33";
    for (let y = 16; y < h; y += 32) for (let x = 16; x < w; x += 32) {
      g.beginPath();
      g.arc(x, y, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeat: [4, 2] });
}

/** Hair strands running along v (grey; tinted by material/vertex colour). */
export function hairTex(kind = "silk") {
  return make(`hair:${kind}`, 128, 256, (g, w, h) => {
    const r = mulberry(kind === "yarn" ? 3 : 4);
    g.fillStyle = "#cfcfcf";
    g.fillRect(0, 0, w, h);
    if (kind === "yarn") {
      for (let y = 0; y < h; y += 6) {
        g.fillStyle = "rgba(0,0,0,0.12)";
        g.save();
        g.translate(0, y);
        g.transform(1, -0.35, 0, 1, 0, 0);
        g.fillRect(0, 0, w * 2, 2);
        g.restore();
      }
      return;
    }
    // fine strands: smooth noise across, long streaks along
    let v = 220;
    for (let x = 0; x < w; x++) {
      v += (r() - 0.5) * 26;
      v = Math.max(185, Math.min(255, v * 0.9 + 230 * 0.1));
      g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      g.fillRect(x, 0, 1, h);
    }
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y0 = r() * h, len = 40 + r() * 160;
      g.strokeStyle = `rgba(${r() < 0.5 ? "255,255,255" : "120,110,100"},${0.12 + r() * 0.12})`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(x, y0);
      g.lineTo(x + (r() - 0.5) * 3, y0 + len);
      g.stroke();
    }
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(0,0,0,0.12)");
    grd.addColorStop(0.35, "rgba(255,255,255,0.06)");
    grd.addColorStop(1, "rgba(0,0,0,0.04)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }, { repeat: [2, 1] });
}

/** Iris texture for glass eyes. state: ok | broken */
export function irisTex(hex, state = "ok") {
  return make(`iris:${hex}:${state}`, 256, 256, (g, w, h) => {
    const r = mulberry(hex.length * 13 + (state === "ok" ? 0 : 5));
    g.fillStyle = "#fbfaf7";
    g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const grd = g.createRadialGradient(cx, cy, 8, cx, cy, 70);
    grd.addColorStop(0, hex);
    grd.addColorStop(0.7, hex);
    grd.addColorStop(1, "#1d1a1c");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, 70, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 90; i++) {
      const a = r() * Math.PI * 2;
      g.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.15})`;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
      g.lineTo(cx + Math.cos(a) * 66, cy + Math.sin(a) * 66);
      g.stroke();
    }
    g.fillStyle = "#121012";
    g.beginPath();
    g.arc(cx, cy, 27, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.9)";
    g.beginPath();
    g.arc(cx - 22, cy - 24, 11, 0, Math.PI * 2);
    g.fill();
    if (state === "broken") {
      g.fillStyle = "rgba(225,228,232,0.62)";
      g.beginPath();
      g.arc(cx + 10, cy + 6, 62, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "rgba(40,30,30,0.85)";
      g.lineWidth = 3;
      for (let k = 0; k < 4; k++) {
        g.beginPath();
        let x = cx, y = cy;
        g.moveTo(x, y);
        const a0 = r() * Math.PI * 2;
        for (let s = 0; s < 6; s++) {
          x += Math.cos(a0 + (r() - 0.5)) * 16;
          y += Math.sin(a0 + (r() - 0.5)) * 16;
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }
  });
}

/** Soft round sprite for particles. */
export function dotTex() {
  return make("dot", 64, 64, (g, w, h) => {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.75)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

export function bubbleTex() {
  return make("bubble", 64, 64, (g, w, h) => {
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(32, 32, 26, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath();
    g.arc(22, 22, 6, 0, Math.PI * 2);
    g.fill();
  });
}

export function sparkleTex() {
  return make("sparkle", 64, 64, (g) => {
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(32, 2);
    g.quadraticCurveTo(36, 28, 62, 32);
    g.quadraticCurveTo(36, 36, 32, 62);
    g.quadraticCurveTo(28, 36, 2, 32);
    g.quadraticCurveTo(28, 28, 32, 2);
    g.fill();
  });
}

/** A tiny landscape painting for wall frames. */
export function paintingTex(i) {
  return make(`painting:${i}`, 256, 192, (g, w, h) => {
    const r = mulberry(100 + i);
    const skies = [["#bfe3f5", "#fbe6d0"], ["#f8c9b6", "#fbe9c9"], ["#c9d9f2", "#e7dcf2"]];
    const s = skies[i % 3];
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, s[0]);
    grd.addColorStop(1, s[1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,240,200,0.9)";
    g.beginPath();
    g.arc(60 + r() * 140, 50, 18, 0, Math.PI * 2);
    g.fill();
    const hills = ["#9fc49a", "#7fae84", "#5f8f6c"];
    hills.forEach((c, k) => {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * (0.55 + k * 0.12) + Math.sin(x * 0.02 + k * 2 + r()) * 14);
      g.lineTo(w, h);
      g.fill();
    });
    if (i % 2 === 0) {
      g.fillStyle = "#f4f0e6";
      g.fillRect(150, 104, 40, 30);
      g.fillStyle = "#c7384b";
      g.beginPath();
      g.moveTo(144, 106);
      g.lineTo(170, 86);
      g.lineTo(196, 106);
      g.fill();
    }
  });
}

/** Window view: sky + distant rooftops + greenery. */
export function windowViewTex() {
  return make("view", 512, 384, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "#a9d8f2");
    grd.addColorStop(0.7, "#fdeedd");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(255,255,255,0.85)";
    for (const [x, y, s] of [[90, 70, 1], [320, 50, 1.3], [430, 110, 0.8]]) {
      g.beginPath();
      g.ellipse(x, y, 40 * s, 14 * s, 0, 0, Math.PI * 2);
      g.ellipse(x + 26 * s, y - 8 * s, 26 * s, 14 * s, 0, 0, Math.PI * 2);
      g.fill();
    }
    const r = mulberry(9);
    for (let x = -20; x < w; x += 60 + r() * 30) {
      const bh = 80 + r() * 90;
      g.fillStyle = ["#e9c9b5", "#d9b8a5", "#f1d9c5", "#c9a993"][Math.floor(r() * 4)];
      g.fillRect(x, h - bh - 60, 58, bh + 60);
      g.fillStyle = ["#b55d4c", "#8a5a4a", "#6f7f9a"][Math.floor(r() * 3)];
      g.beginPath();
      g.moveTo(x - 6, h - bh - 60);
      g.lineTo(x + 29, h - bh - 90);
      g.lineTo(x + 64, h - bh - 60);
      g.fill();
      g.fillStyle = "rgba(255,250,220,0.8)";
      for (let k = 0; k < 3; k++) g.fillRect(x + 8 + k * 16, h - bh - 30, 8, 12);
    }
    g.fillStyle = "#86b37f";
    for (let x = 0; x < w; x += 24) {
      g.beginPath();
      g.arc(x, h - 30 + Math.sin(x) * 6, 30, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Book spines for shelves. */
export function booksTex() {
  return make("books", 256, 64, (g, w, h) => {
    const r = mulberry(21);
    let x = 0;
    while (x < w) {
      const bw = 8 + r() * 14;
      g.fillStyle = ["#a24b4b", "#3f6b8a", "#c9a24a", "#5e8a5a", "#7d4f7a", "#d98a6a"][Math.floor(r() * 6)];
      g.fillRect(x, h - 40 - r() * 20, bw - 1, 64);
      g.fillStyle = "rgba(255,255,255,0.4)";
      g.fillRect(x + 2, 20, bw - 5, 2);
      x += bw;
    }
  });
}

/** Wrap a canvas (for live-updated textures like faces). */
export function liveTexture(c) {
  if (!c) return null;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
