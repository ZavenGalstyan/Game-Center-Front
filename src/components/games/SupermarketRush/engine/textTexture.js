/**
 * Supermarket Rush — canvas-generated text textures for in-world signage:
 * aisle signs, box labels, shelf name tags. Cached by (text, options) so
 * the same string never rasterizes twice.
 */
import * as THREE from "three";

const cache = new Map();

export function getTextTexture(text, opts = {}) {
  const { bg = "#ffffff", color = "#1a1a1a", font = "bold 64px Arial, sans-serif", width = 512, height = 128, pad = 12 } = opts;
  const key = `${text}|${bg}|${color}|${font}|${width}|${height}`;
  if (cache.has(key)) return cache.get(key);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Shrink-to-fit so long labels never clip.
  let fontSize = parseInt(font.match(/\d+/)?.[0] || "64", 10);
  while (fontSize > 16) {
    ctx.font = font.replace(/\d+px/, `${fontSize}px`);
    if (ctx.measureText(text).width <= width - pad * 2) break;
    fontSize -= 4;
  }
  ctx.fillText(text, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}
