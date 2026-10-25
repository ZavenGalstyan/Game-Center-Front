/**
 * Shadow Runner — menu backdrop: the selected district's skyline scrolling
 * past while a runner sprints across endless rooftops with the Hunter behind.
 */
import { THEMES, TILE, buildLayer } from "./theme.js";
import { drawFigure, poseFor } from "./runner.js";

const cache = new Map();
function layersFor(d) {
  if (!cache.has(d)) cache.set(d, THEMES[d].layers.map((ly, i) => ({ ...ly, items: buildLayer(ly, d * 97 + i * 13 + 5) })));
  return cache.get(d);
}

const ROOF_W = [520, 380, 640, 300, 460, 560];
const GAP_W = [120, 150, 90, 140, 110, 130];

export function drawMenuScene(ctx, W, H, t, district = 0) {
  const th = THEMES[district] || THEMES[0];
  const camX = t * 300;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  th.sky.forEach((c, i) => sky.addColorStop(i / (th.sky.length - 1), c));
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  if (th.sun) {
    const sx = W * th.sun.x;
    const sy = H * th.sun.y;
    const g = ctx.createRadialGradient(sx, sy, th.sun.r * 0.4, sx, sy, th.sun.r * 3.2);
    g.addColorStop(0, th.sun.glow);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = th.sun.color;
    ctx.beginPath();
    ctx.arc(sx, sy, th.sun.r, 0, Math.PI * 2);
    ctx.fill();
  }
  const horizon = H * 0.86;
  for (const ly of layersFor(district)) {
    const base = horizon + ly.f * 140;
    const off = -(((camX * ly.f) % TILE) + TILE) % TILE;
    ctx.fillStyle = ly.color;
    for (let rep = off; rep < W; rep += TILE) {
      for (const it of ly.items) {
        const x = rep + it.x;
        if (x > W || x + it.w < 0) continue;
        ctx.fillRect(x, base - it.h, it.w, H);
        if (it.windows.length) {
          ctx.fillStyle = th.window;
          ctx.globalAlpha = 0.45;
          for (const w of it.windows) ctx.fillRect(x + w.x, base - it.h + w.y, w.w, w.h);
          ctx.globalAlpha = 1;
          ctx.fillStyle = ly.color;
        }
      }
    }
    ctx.fillStyle = th.fog;
    ctx.fillRect(0, base - 60, W, H);
  }

  // foreground rooftops (repeating pattern of roofs and gaps)
  const roofY = H * 0.8;
  const period = ROOF_W.reduce((a, b) => a + b, 0) + GAP_W.reduce((a, b) => a + b, 0);
  const ox = -(camX % period);
  let x = ox;
  const roofs = [];
  for (let rep = 0; rep < 3; rep++) {
    for (let i = 0; i < ROOF_W.length; i++) {
      roofs.push([x, ROOF_W[i]]);
      x += ROOF_W[i] + GAP_W[i];
    }
  }
  for (const [rx, rw] of roofs) {
    if (rx > W || rx + rw < 0) continue;
    ctx.fillStyle = th.facade;
    ctx.fillRect(rx, roofY, rw, H - roofY);
    ctx.fillStyle = th.rim;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(rx - 3, roofY, rw + 6, 2);
    ctx.globalAlpha = 1;
  }
  // the runner jumps every gap: find the gap ahead of a fixed screen x
  const runX = W * 0.62;
  const worldX = runX + camX;
  let feet = roofY;
  let air = null;
  for (const [rx, rw] of roofs) {
    const gapStart = rx + rw + camX;
    const jumpFrom = gapStart - 40;
    const rel = worldX - jumpFrom;
    if (rel >= 0 && rel < 230) air = rel / 230;
  }
  let pose;
  if (air != null) {
    feet = roofY - Math.sin(air * Math.PI) * 90;
    pose = poseFor({ m: "air", vx: 300, vy: air < 0.5 ? -400 : 400, st: worldX, jk: 1, at: air * 0.6 }, t);
  } else pose = poseFor({ m: "run", vx: 360, st: worldX }, t);
  drawFigure(ctx, runX, feet, 1, pose, { body: "#030305", far: "#17171f", rim: th.rim, scarf: th.accent });

  const hx = runX - 230 + Math.sin(t * 0.7) * 30;
  const hWorld = hx + camX;
  let hFeet = roofY;
  let hAir = null;
  for (const [rx, rw] of roofs) {
    const rel = hWorld - (rx + rw + camX - 40);
    if (rel >= 0 && rel < 230) hAir = rel / 230;
  }
  if (hAir != null) hFeet = roofY - Math.sin(hAir * Math.PI) * 90;
  const hp = hAir != null ? poseFor({ m: "air", vx: 300, vy: hAir < 0.5 ? -400 : 400, st: hWorld, jk: 1, at: 0.3 }, t) : poseFor({ m: "run", vx: 360, st: hWorld }, t);
  drawFigure(ctx, hx, hFeet, 1, hp, { body: "#000", far: "#1a0709", rim: "#ff2a3a", bulk: 1.16, visor: "#ff4747", coat: true });

  const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0.05)");
  vg.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}
