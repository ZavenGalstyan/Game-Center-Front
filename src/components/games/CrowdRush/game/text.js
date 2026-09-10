/**
 * Crowd Rush — canvas-drawn label textures (no font libraries, no drei).
 *
 * Used for the big operation faces on gates ("×3", "+20"), the crowd/enemy
 * count discs and the boss strength plate. Cached by string so a "+20" gate
 * that appears on ten levels shares one texture.
 */

import * as THREE from "three";

const cache = new Map();

export function labelTexture(text, opts = {}) {
  const {
    fg = "#ffffff",
    bg = "transparent",
    stroke = "rgba(0,0,0,0.35)",
    strokeW = 10,
    font = 700,
    pad = 0.22,
    w = 256,
    h = 256,
  } = opts;
  const key = `${text}|${fg}|${bg}|${stroke}|${strokeW}|${font}|${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (bg !== "transparent") {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
  }
  let size = h * (1 - pad * 2);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const fit = () => {
    g.font = `${font} ${size}px "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`;
    return g.measureText(text).width;
  };
  while (fit() > w * (1 - pad) && size > 8) size -= 4;

  g.lineJoin = "round";
  if (strokeW > 0) {
    g.strokeStyle = stroke;
    g.lineWidth = strokeW;
    g.strokeText(text, w / 2, h / 2 + size * 0.04);
  }
  g.fillStyle = fg;
  g.fillText(text, w / 2, h / 2 + size * 0.04);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

export function disposeLabelCache() {
  for (const t of cache.values()) t.dispose?.();
  cache.clear();
}
