/**
 * Color Platforms — render-side color mapping. Gameplay IDs → shades.
 * Platforms always use these fixed shades (cosmetics only re-shade the
 * mascot), so the world stays readable no matter which cosmetic is worn.
 */
import { BLUE, RED, YELLOW, NEUTRAL } from "../engine/constants.js";

export const PLAT = {
  [BLUE]: { top: "#8cc2ff", body: "#3a86f5", base: "#1d4fb6", side: "#173f93", glow: "rgba(80,160,255,0.55)", sym: "rgba(255,255,255,0.62)" },
  [RED]: { top: "#ff9aa3", body: "#f2455a", base: "#a91c33", side: "#86142a", glow: "rgba(255,90,110,0.55)", sym: "rgba(255,255,255,0.62)" },
  [YELLOW]: { top: "#ffe896", body: "#f8bd2c", base: "#bb7a06", side: "#935f04", glow: "rgba(255,200,60,0.55)", sym: "rgba(120,72,0,0.55)" },
  [NEUTRAL]: { top: "#ffffff", body: "#dfe6f3", base: "#97a3bf", side: "#76829f", glow: "rgba(200,235,255,0.45)", sym: "rgba(90,105,140,0.45)" },
};

/** UI / HUD swatches (CSS) for the three player colors. */
export const UI_COLOR = {
  [BLUE]: "#3d8bff",
  [RED]: "#ff4b5c",
  [YELLOW]: "#ffc531",
};

export const SYMBOL_NAME = { [BLUE]: "circle", [RED]: "triangle", [YELLOW]: "diamond", [NEUTRAL]: "dot" };

export function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbStr = (c, a = 1) => (a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`);

export function mix(a, b, t, out = [0, 0, 0]) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

export const WHITE = [255, 255, 255];
export const BLACK = [10, 14, 34];

/** Draw a color-assist symbol centred at (x, y), radius r, in the current fillStyle/strokeStyle. */
export function symbolPath(ctx, kind, x, y, r) {
  ctx.beginPath();
  if (kind === "circle") {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  } else if (kind === "triangle") {
    ctx.moveTo(x, y - r * 1.05);
    ctx.lineTo(x + r * 1.0, y + r * 0.75);
    ctx.lineTo(x - r * 1.0, y + r * 0.75);
    ctx.closePath();
  } else if (kind === "diamond") {
    ctx.moveTo(x, y - r * 1.1);
    ctx.lineTo(x + r * 0.85, y);
    ctx.lineTo(x, y + r * 1.1);
    ctx.lineTo(x - r * 0.85, y);
    ctx.closePath();
  } else {
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
  }
}

/** Rounded rect with per-corner radii (no reliance on ctx.roundRect). */
export function rrect(ctx, x, y, w, h, r) {
  const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  ctx.lineTo(x + w, y + h - br);
  ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  ctx.lineTo(x + bl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}
