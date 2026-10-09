/**
 * Pirate Cove — procedural canvas textures (no image files). Each is drawn
 * once, cached, and disposed with the game (disposeTextures()).
 *
 * Most are drawn near-white/grey so a material `color` can tint them: one
 * hull-plank texture serves every ship colour, one canvas texture every sail.
 */
import * as THREE from "three";
import { mulberry32 } from "../engine/rng.js";

const cache = new Map();

function make(key, w, h, draw, opts = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = opts.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.nearest) t.magFilter = THREE.NearestFilter;
  cache.set(key, t);
  return t;
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

function grain(g, w, h, rand, alpha, count, horiz = true) {
  for (let i = 0; i < count; i++) {
    const y = rand() * h;
    const x = rand() * w;
    g.strokeStyle = `rgba(0,0,0,${alpha * (0.4 + rand() * 0.6)})`;
    g.lineWidth = 0.5 + rand() * 1.2;
    g.beginPath();
    if (horiz) {
      g.moveTo(x, y);
      g.bezierCurveTo(x + 30, y + (rand() - 0.5) * 3, x + 70, y + (rand() - 0.5) * 3, x + 60 + rand() * 120, y + (rand() - 0.5) * 2);
    } else {
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 3, y + 40 + rand() * 80);
    }
    g.stroke();
  }
}

/** Hull planks: horizontal strakes with seams, grain and a few treenails. */
export function hullPlanks() {
  return make("hull", 512, 512, (g, w, h) => {
    const rand = mulberry32(7);
    const rows = 16;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 200;
      while (x < w) {
        const len = 160 + rand() * 220;
        const v = 200 + Math.floor(rand() * 40);
        g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
        g.fillRect(x, r * rh, len, rh);
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(x, r * rh, 2, rh);
        x += len;
      }
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(0, r * rh + rh - 2, w, 2);
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(0, r * rh, w, 1);
    }
    grain(g, w, h, rand, 0.12, 900);
    for (let i = 0; i < 120; i++) {
      g.fillStyle = "rgba(40,25,10,0.5)";
      g.beginPath();
      g.arc(rand() * w, (Math.floor(rand() * rows) + 0.5) * rh, 1.4, 0, 6.28);
      g.fill();
    }
  });
}

/** Deck planks: long boards running fore and aft (v axis). */
export function deckPlanks() {
  return make("deck", 256, 512, (g, w, h) => {
    const rand = mulberry32(11);
    const cols = 8;
    const cw = w / cols;
    for (let c = 0; c < cols; c++) {
      let y = -rand() * 200;
      while (y < h) {
        const len = 180 + rand() * 260;
        const v = 205 + Math.floor(rand() * 35);
        g.fillStyle = `rgb(${v},${v - 10},${v - 30})`;
        g.fillRect(c * cw, y, cw, len);
        g.fillStyle = "rgba(0,0,0,0.3)";
        g.fillRect(c * cw, y, cw, 2);
        y += len;
      }
      g.fillStyle = "rgba(0,0,0,0.42)";
      g.fillRect(c * cw + cw - 2, 0, 2, h);
    }
    grain(g, w, h, rand, 0.1, 500, false);
  });
}

/** Sail canvas: off-white cloth with panel seams, weave noise and a patch or two. */
export function sailCloth() {
  return make("sail", 256, 256, (g, w, h) => {
    const rand = mulberry32(19);
    g.fillStyle = "#f4efe4";
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * 18;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n - 2;
    }
    g.putImageData(img, 0, 0);
    g.strokeStyle = "rgba(90,70,40,0.25)";
    g.lineWidth = 2;
    for (let x = 0; x < w; x += 32) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
    g.fillStyle = "rgba(120,95,60,0.14)";
    g.fillRect(150, 60, 40, 46);
    g.strokeStyle = "rgba(90,70,40,0.3)";
    g.setLineDash([3, 3]);
    g.strokeRect(150, 60, 40, 46);
    g.setLineDash([]);
    // weathering toward the foot
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(80,60,30,0.12)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
}

/** Tattered sail for cursed ships and wrecks: ragged foot, holes, burn marks (alpha). */
export function tatteredCloth() {
  return make("tattered", 256, 256, (g, w, h) => {
    const rand = mulberry32(53);
    g.drawImage(sailCloth().image, 0, 0);
    g.globalCompositeOperation = "destination-out";
    // ragged foot
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) g.lineTo(x, h - 10 - rand() * 46);
    g.lineTo(w, h);
    g.closePath();
    g.fill();
    // holes
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      const x = 20 + rand() * (w - 40);
      const y = 20 + rand() * (h - 70);
      const r = 5 + rand() * 16;
      for (let a = 0; a < 6.28; a += 0.5) g.lineTo(x + Math.cos(a) * r * (0.6 + rand() * 0.6), y + Math.sin(a) * r * (0.6 + rand() * 0.6));
      g.closePath();
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
    for (let i = 0; i < 12; i++) {
      g.fillStyle = "rgba(40,30,20,0.25)";
      g.beginPath();
      g.arc(rand() * w, rand() * h, 6 + rand() * 14, 0, 6.28);
      g.fill();
    }
  });
}

/** Grey noise used as a detail map on terrain, rocks and stone (world-space UVs). */
export function detailNoise() {
  return make(
    "detail",
    256,
    256,
    (g, w, h) => {
      const rand = mulberry32(23);
      const img = g.createImageData(w, h);
      // multi-octave blotches
      const base = new Float32Array(w * h).fill(0);
      for (const [cells, amp] of [
        [8, 0.5],
        [24, 0.3],
        [64, 0.2],
      ]) {
        const vals = new Float32Array((cells + 1) * (cells + 1)).map(() => rand());
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const fx = (x / w) * cells;
            const fy = (y / h) * cells;
            const ix = Math.floor(fx);
            const iy = Math.floor(fy);
            const tx = fx - ix;
            const ty = fy - iy;
            const at = (a, b) => vals[(b % cells) * (cells + 1) + (a % cells)];
            const v = at(ix, iy) * (1 - tx) * (1 - ty) + at(ix + 1, iy) * tx * (1 - ty) + at(ix, iy + 1) * (1 - tx) * ty + at(ix + 1, iy + 1) * tx * ty;
            base[y * w + x] += v * amp;
          }
        }
      }
      for (let i = 0; i < w * h; i++) {
        const v = Math.round(200 + (base[i] - 0.5) * 90 + (rand() - 0.5) * 22);
        img.data[i * 4] = v;
        img.data[i * 4 + 1] = v;
        img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    },
    {},
  );
}

/** Dressed stone blocks for ruins and forts. */
export function stoneBlocks() {
  return make("stone", 512, 512, (g, w, h) => {
    const rand = mulberry32(29);
    g.fillStyle = "#b9b3a6";
    g.fillRect(0, 0, w, h);
    const rows = 8;
    const rh = h / rows;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -rh * 0.7 : 0;
      while (x < w) {
        const bw = rh * (1.2 + rand() * 0.9);
        const v = 165 + Math.floor(rand() * 45);
        g.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
        g.fillRect(x + 2, r * rh + 2, bw - 4, rh - 4);
        // chips + moss
        for (let k = 0; k < 6; k++) {
          g.fillStyle = rand() < 0.4 ? "rgba(70,95,50,0.25)" : "rgba(0,0,0,0.12)";
          g.beginPath();
          g.arc(x + rand() * bw, r * rh + rand() * rh, 2 + rand() * 7, 0, 6.28);
          g.fill();
        }
        x += bw;
      }
    }
  });
}

/** Thatch: straw strokes for hut roofs. */
export function thatch() {
  return make("thatch", 256, 256, (g, w, h) => {
    const rand = mulberry32(31);
    g.fillStyle = "#b8975a";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const v = 120 + Math.floor(rand() * 90);
      g.strokeStyle = `rgba(${v + 40},${v + 10},${v - 40},0.7)`;
      g.lineWidth = 1 + rand();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (rand() - 0.5) * 4, y + 14 + rand() * 18);
      g.stroke();
    }
    for (let r = 0; r < 8; r++) {
      g.fillStyle = "rgba(60,40,10,0.25)";
      g.fillRect(0, r * 32 + 28, w, 4);
    }
  });
}

/** Striped tent cloth. */
export function tentCloth(a = "#d8c8a8", b = "#a8463a") {
  return make(`tent${a}${b}`, 128, 128, (g, w, h) => {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? a : b;
      g.fillRect((i * w) / 8, 0, w / 8, h);
    }
    const rand = mulberry32(37);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(0,0,0,${rand() * 0.08})`;
      g.fillRect(rand() * w, rand() * h, 2, 2);
    }
  });
}

/** Jolly Roger and friends. kind: skull | bones | gull | bolt | crown | player */
export function flagTexture(kind = "skull", bg = "#111111") {
  return make(
    `flag:${kind}:${bg}`,
    128,
    96,
    (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#f2efe6";
      g.strokeStyle = "#f2efe6";
      const cx = w / 2;
      const cy = h / 2 - 4;
      const bones = () => {
        g.lineWidth = 7;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(cx - 34, cy + 30);
        g.lineTo(cx + 34, cy - 4);
        g.moveTo(cx + 34, cy + 30);
        g.lineTo(cx - 34, cy - 4);
        g.stroke();
        for (const [x, y] of [
          [cx - 34, cy + 30],
          [cx + 34, cy - 4],
          [cx + 34, cy + 30],
          [cx - 34, cy - 4],
        ]) {
          g.beginPath();
          g.arc(x - 3, y, 4, 0, 6.28);
          g.arc(x + 3, y, 4, 0, 6.28);
          g.fill();
        }
      };
      const skull = () => {
        g.beginPath();
        g.arc(cx, cy, 17, 0, 6.28);
        g.fill();
        g.fillRect(cx - 9, cy + 10, 18, 12);
        g.fillStyle = bg;
        g.beginPath();
        g.arc(cx - 7, cy + 1, 5, 0, 6.28);
        g.arc(cx + 7, cy + 1, 5, 0, 6.28);
        g.fill();
        g.fillRect(cx - 1.5, cy + 8, 3, 5);
        for (let i = -6; i <= 6; i += 4) g.fillRect(cx + i - 0.75, cy + 15, 1.5, 7);
        g.fillStyle = "#f2efe6";
      };
      if (kind === "gull") {
        g.lineWidth = 6;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(cx - 36, cy);
        g.quadraticCurveTo(cx - 14, cy - 20, cx, cy + 4);
        g.quadraticCurveTo(cx + 14, cy - 20, cx + 36, cy);
        g.stroke();
      } else if (kind === "bolt") {
        g.fillStyle = "#e8c440";
        g.beginPath();
        g.moveTo(cx + 6, cy - 32);
        g.lineTo(cx - 14, cy + 4);
        g.lineTo(cx - 2, cy + 4);
        g.lineTo(cx - 8, cy + 34);
        g.lineTo(cx + 16, cy - 4);
        g.lineTo(cx + 4, cy - 4);
        g.closePath();
        g.fill();
      } else if (kind === "crown") {
        bones();
        skull();
        g.fillStyle = "#d4af37";
        g.beginPath();
        g.moveTo(cx - 18, cy - 14);
        g.lineTo(cx - 18, cy - 30);
        g.lineTo(cx - 9, cy - 20);
        g.lineTo(cx, cy - 34);
        g.lineTo(cx + 9, cy - 20);
        g.lineTo(cx + 18, cy - 30);
        g.lineTo(cx + 18, cy - 14);
        g.closePath();
        g.fill();
      } else {
        bones();
        skull();
        if (kind === "player") {
          g.fillStyle = "#c9a43c";
          g.fillRect(cx - 20, cy - 20, 40, 4);
          g.fillRect(cx - 12, cy - 30, 24, 10);
        }
      }
    },
    { clamp: true },
  );
}

/** Soft round sprite for particles. */
export function softDot() {
  return make(
    "dot",
    64,
    64,
    (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, "rgba(255,255,255,1)");
      grd.addColorStop(0.35, "rgba(255,255,255,0.75)");
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
    },
    { clamp: true },
  );
}

/** Puffy smoke sprite (lumpy, not a perfect disc). */
export function puffSprite() {
  return make(
    "puff",
    128,
    128,
    (g, w, h) => {
      const rand = mulberry32(41);
      for (let i = 0; i < 14; i++) {
        const x = w / 2 + (rand() - 0.5) * w * 0.4;
        const y = h / 2 + (rand() - 0.5) * h * 0.4;
        const r = w * (0.16 + rand() * 0.14);
        const grd = g.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, "rgba(255,255,255,0.55)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, r, 0, 6.28);
        g.fill();
      }
    },
    { clamp: true },
  );
}

/** Foam streaks for ship wakes. */
export function foamTexture() {
  return make("foam", 128, 256, (g, w, h) => {
    const rand = mulberry32(43);
    g.fillStyle = "rgba(255,255,255,0)";
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = 2 + rand() * 9;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(255,255,255,${0.5 + rand() * 0.4})`);
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x, y, r, r * (1.5 + rand() * 2), 0, 0, 6.28);
      g.fill();
    }
  });
}

/** Coins / gold glitter for treasure piles. */
export function goldTexture() {
  return make("gold", 128, 128, (g, w, h) => {
    const rand = mulberry32(47);
    g.fillStyle = "#c08a1e";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const r = 4 + rand() * 5;
      g.fillStyle = rand() < 0.5 ? "#f2cc5a" : "#d9a531";
      g.beginPath();
      g.ellipse(x, y, r, r * (0.5 + rand() * 0.5), rand() * 3, 0, 6.28);
      g.fill();
      g.strokeStyle = "rgba(120,80,10,0.6)";
      g.stroke();
    }
  });
}
