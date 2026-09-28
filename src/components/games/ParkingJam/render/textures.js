/**
 * Parking Jam — procedural surface textures (asphalt, grass, concrete,
 * pavers). Each is painted once into a small canvas tile, cached by key and
 * used as an SVG <pattern>, so the static scene costs nothing per frame.
 */
import { rng } from "../engine/level.js";
import { shade } from "./color.js";

const cache = new Map();

function tile(key, size, paint) {
  if (cache.has(key)) return cache.get(key);
  let url = "";
  try {
    const c = document.createElement("canvas");
    c.width = size;
    c.height = size;
    const g = c.getContext("2d");
    paint(g, size);
    url = c.toDataURL("image/png");
  } catch {
    url = "";
  }
  cache.set(key, url);
  return url;
}

/** Fine aggregate speckle + soft blotches — stylised, not photographic. */
export function asphaltTile(base) {
  return tile(`asphalt:${base}`, 256, (g, n) => {
    const r = rng(9001);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 14; i++) {
      const x = r() * n;
      const y = r() * n;
      const rad = 20 + r() * 50;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const tone = r() > 0.5 ? shade(base, 0.05) : shade(base, -0.06);
      grd.addColorStop(0, tone);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.globalAlpha = 0.55;
      g.fillStyle = grd;
      for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
        g.save();
        g.translate(ox, oy);
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 2600; i++) {
      const light = r() > 0.55;
      g.fillStyle = light ? `rgba(255,255,255,${0.05 + r() * 0.09})` : `rgba(0,0,0,${0.06 + r() * 0.12})`;
      const s = r() > 0.92 ? 2 : 1;
      g.fillRect(Math.floor(r() * n), Math.floor(r() * n), s, s);
    }
  });
}

export function grassTile(base) {
  return tile(`grass:${base}`, 256, (g, n) => {
    const r = rng(4242);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 22; i++) {
      const x = r() * n;
      const y = r() * n;
      const rad = 18 + r() * 46;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, r() > 0.5 ? shade(base, 0.08) : shade(base, -0.08));
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.globalAlpha = 0.6;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 1500; i++) {
      const x = r() * n;
      const y = r() * n;
      g.strokeStyle = r() > 0.5 ? `rgba(255,255,220,${0.08 + r() * 0.1})` : `rgba(0,40,0,${0.08 + r() * 0.12})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 3);
      g.stroke();
    }
  });
}

export function concreteTile(base) {
  return tile(`concrete:${base}`, 256, (g, n) => {
    const r = rng(777);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${0.04 + r() * 0.06})` : `rgba(0,0,0,${0.04 + r() * 0.07})`;
      g.fillRect(Math.floor(r() * n), Math.floor(r() * n), 1, 1);
    }
    for (let i = 0; i < 8; i++) {
      const x = r() * n;
      const y = r() * n;
      const rad = 30 + r() * 60;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(0,0,0,${0.03 + r() * 0.04})`);
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
}

/** Paving slabs for sidewalks. */
export function paverTile(base) {
  return tile(`paver:${base}`, 128, (g, n) => {
    const r = rng(31);
    g.fillStyle = base;
    g.fillRect(0, 0, n, n);
    const s = n / 4;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        g.fillStyle = r() > 0.5 ? shade(base, 0.04) : shade(base, -0.035);
        g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
      }
    }
    g.strokeStyle = shade(base, -0.18);
    g.lineWidth = 1.5;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(i * s, 0);
      g.lineTo(i * s, n);
      g.moveTo(0, i * s);
      g.lineTo(n, i * s);
      g.stroke();
    }
  });
}
