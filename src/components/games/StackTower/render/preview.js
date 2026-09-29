/**
 * Stack Tower — static theme preview: the real background + a short tower,
 * drawn once into a small canvas (theme selector cards).
 */
import { Background } from "./background.js";
import { drawBox, drawContactShadow } from "./blocks.js";
import { blockColor } from "../data/themes.js";
import { BLOCK_H, BASE_SIZE } from "../engine/stackMath.js";

const TOWER = [
  [0, 0, 10, 10],
  [0.6, 0, 8.8, 10],
  [0.6, -0.4, 8.8, 9.2],
  [0.2, -0.4, 8, 9.2],
  [0.2, -0.4, 8, 9.2],
  [0.2, 0.1, 8, 8.2],
  [-0.2, 0.1, 7.2, 8.2],
];

export function renderPreview(canvas, theme, quality = "medium") {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(40, Math.round(r.width * dpr));
  const h = Math.max(30, Math.round(r.height * dpr));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const bg = new Background();
  bg.build(theme, w, h, dpr, quality);
  const s = Math.min(w / 30, h / 19);
  const top = TOWER.length * BLOCK_H;
  const view = { cx: w / 2, cy: h * 0.46, s, camY: top - 2 };
  bg.draw(ctx, 4, 0, s, 0, 0, false);
  const opts = { tint: theme.tint, quality, edgeGlow: theme.edgeGlow, glow: 0.45 };
  drawBox(ctx, view, { x: 0, y: -40, z: 0, w: BASE_SIZE, h: 40, d: BASE_SIZE, hsl: theme.base }, opts);
  TOWER.forEach(([x, z, bw, bd], i) => {
    const c = blockColor(theme, (i + 1) * 3);
    const b = { x, z, w: bw, d: bd, y: i * BLOCK_H, h: BLOCK_H, hsl: c };
    drawBox(ctx, view, b, opts);
    const n = TOWER[i + 1];
    if (n) drawContactShadow(ctx, view, b, { x: n[0], z: n[1], w: n[2], d: n[3] }, b.y + BLOCK_H);
  });
  const c = blockColor(theme, 24);
  drawBox(ctx, view, { x: -9, y: top, z: 0.1, w: 7.2, h: BLOCK_H, d: 8.2, hsl: c }, opts);
}
