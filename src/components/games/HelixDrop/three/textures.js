/**
 * Helix Drop — procedural canvas textures (no image files). Cached by key so a
 * world switch never re-creates what already exists.
 */
import * as THREE from "three";

const cache = new Map();

function make(key, w, h, draw, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Diagonal hazard stripes: the danger language is PATTERN first, colour second. */
export function hazardTexture(body, stripe) {
  return make(
    `haz:${body}:${stripe}`,
    128,
    128,
    (x, w, h) => {
      x.fillStyle = body;
      x.fillRect(0, 0, w, h);
      x.fillStyle = stripe;
      for (let i = -2; i < 4; i++) {
        x.beginPath();
        x.moveTo(i * 64, 0);
        x.lineTo(i * 64 + 32, 0);
        x.lineTo(i * 64 + 32 + h, h);
        x.lineTo(i * 64 + h, h);
        x.closePath();
        x.fill();
      }
      // grime so it never reads as a flat colour block
      for (let i = 0; i < 90; i++) {
        x.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
        x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 1 + Math.random() * 2);
      }
    },
    { repeat: [0.9, 0.9] }
  );
}

/** Cracked surface for breakable platforms. */
export function crackTexture(base) {
  return make(
    `crk:${base}`,
    256,
    256,
    (x, w, h) => {
      x.fillStyle = base;
      x.fillRect(0, 0, w, h);
      let s = 11;
      const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      x.strokeStyle = "rgba(40,50,70,0.55)";
      x.lineWidth = 2.2;
      for (let k = 0; k < 7; k++) {
        let px = r() * w;
        let py = r() * h;
        x.beginPath();
        x.moveTo(px, py);
        for (let j = 0; j < 6; j++) {
          px += (r() - 0.5) * 70;
          py += (r() - 0.5) * 70;
          x.lineTo(px, py);
        }
        x.stroke();
      }
      x.strokeStyle = "rgba(255,255,255,0.45)";
      x.lineWidth = 1;
      x.stroke();
    },
    { repeat: [0.7, 0.7] }
  );
}

/** Subtle speckle/grain for safe platforms so they read as a material. */
export function grainTexture() {
  return make(
    "grain",
    128,
    128,
    (x, w, h) => {
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        const v = 225 + Math.floor(Math.random() * 30);
        x.fillStyle = `rgb(${v},${v},${v})`;
        x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    },
    { repeat: [0.6, 0.6] }
  );
}

/** Column: vertical grooves + horizontal bands. */
export function columnTexture(color, accent) {
  return make(
    `col:${color}:${accent}`,
    256,
    256,
    (x, w, h) => {
      x.fillStyle = color;
      x.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) {
        const gx = (i / 16) * w;
        const g = x.createLinearGradient(gx, 0, gx + w / 16, 0);
        g.addColorStop(0, "rgba(0,0,0,0.10)");
        g.addColorStop(0.5, "rgba(255,255,255,0.10)");
        g.addColorStop(1, "rgba(0,0,0,0.10)");
        x.fillStyle = g;
        x.fillRect(gx, 0, w / 16, h);
      }
      x.fillStyle = accent;
      x.fillRect(0, h * 0.46, w, h * 0.08);
      x.fillStyle = "rgba(0,0,0,0.15)";
      x.fillRect(0, h * 0.54, w, h * 0.012);
    },
    { repeat: [2, 1] }
  );
}

/** Ball surface: a band + two dots so rotation is always visible. */
export function ballTexture(base, band, dots) {
  return make(`ball:${base}:${band}:${dots}`, 256, 128, (x, w, h) => {
    x.fillStyle = base;
    x.fillRect(0, 0, w, h);
    x.fillStyle = band;
    x.fillRect(0, h * 0.44, w, h * 0.12);
    x.fillStyle = dots;
    for (const [u, v] of [
      [0.25, 0.22],
      [0.75, 0.78],
      [0.5, 0.2],
      [0.0, 0.8],
    ]) {
      x.beginPath();
      x.arc(u * w, v * h, h * 0.07, 0, Math.PI * 2);
      x.fill();
    }
  });
}

export function skyTexture(top, bottom) {
  return make(`sky:${top}:${bottom}`, 16, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
}

export function radialTexture(key, inner, outer) {
  return make(`rad:${key}`, 128, 128, (x, w, h) => {
    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
}

export function cloudTexture(tint) {
  return make(`cloud:${tint}`, 256, 128, (x, w, h) => {
    let s = 5;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 14; i++) {
      const cx = w * (0.18 + 0.64 * r());
      const cy = h * (0.45 + 0.2 * (r() - 0.5));
      const rr = h * (0.18 + 0.2 * r());
      const g = x.createRadialGradient(cx, cy - rr * 0.2, 0, cx, cy, rr);
      g.addColorStop(0, tint);
      g.addColorStop(0.7, tint.replace(/[\d.]+\)$/, "0.55)"));
      g.addColorStop(1, tint.replace(/[\d.]+\)$/, "0)"));
      x.fillStyle = g;
      x.beginPath();
      x.arc(cx, cy, rr, 0, Math.PI * 2);
      x.fill();
    }
  });
}

/** Far silhouette strip for each world (mountains / city / spires / ruins / towers). */
export function silhouetteTexture(key, color) {
  return make(`sil2:${key}:${color}`, 1024, 256, (x, w, h) => {
    x.fillStyle = color;
    let s = key.length * 97;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    if (key === "sunset" || key === "neon") {
      let bx = 0;
      while (bx < w) {
        const bw = 20 + r() * 60;
        const bh = h * (0.25 + r() * 0.65);
        x.fillRect(bx, h - bh, bw, bh);
        if (key === "neon" && r() < 0.5) {
          x.fillStyle = "rgba(77,240,255,0.6)";
          x.fillRect(bx, h - bh, bw, 2);
          x.fillStyle = color;
        }
        bx += bw + r() * 10;
      }
    } else {
      x.beginPath();
      x.moveTo(0, h);
      for (let px = 0; px <= w; px += 8) {
        const peak = key === "frozen" ? 0.75 : key === "abyss" ? 0.4 : 0.55;
        const y = h * (1 - peak * (0.5 + 0.35 * Math.sin(px * 0.011 + 1) + 0.15 * Math.sin(px * 0.037)) - 0.05 * r());
        x.lineTo(px, y);
      }
      x.lineTo(w, h);
      x.closePath();
      x.fill();
      if (key === "abyss") {
        // ruined pillars on the ridge
        for (let i = 0; i < 12; i++) {
          const px = r() * w;
          x.fillRect(px, h * (0.2 + r() * 0.2), 8 + r() * 6, h);
        }
      }
    }
    // melt the base into the haze — no hard horizon edge
    x.globalCompositeOperation = "destination-out";
    const fade = x.createLinearGradient(0, h * 0.45, 0, h);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    x.fillStyle = fade;
    x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = "source-over";
  });
}
