/**
 * Boxing Club — ring + arena renderer (Canvas 2D).
 *
 * World: metres; the fighters stand on the z = 0 line of the canvas, +z is
 * toward the camera. The camera is elevated, so depth drops down the screen
 * (DEPTH_Y) and nearer things scale up slightly. Draw order per frame:
 *
 *   drawBackdrop  (arena, lights, crowd — parallax, cached static layer)
 *   drawRingBack  (platform, canvas floor, back posts, back ropes)
 *   … fighters …
 *   drawRingFront (front posts, front ropes, near crowd heads)
 *
 * so fighters are always in front of the rear ropes and behind the front
 * ropes — ropes never randomly cut through a body.
 */
import { RING_HALF } from "../engine/fighter.js";
import { DEPTH_Y, shade } from "./fighterArt.js";
import { rng } from "../engine/rng.js";

export const RING = {
  edge: RING_HALF + 0.18, // post / rope line
  back: -1.7,
  front: 1.2,
  ropes: [0.45, 0.8, 1.15],
  postH: 1.32,
};

export function worldToScreen(cam, x, y, z) {
  const sc = 1 + z * 0.06;
  return { x: cam.cx + (x - cam.camX) * cam.S * sc, y: cam.floorY - y * cam.S * sc + z * cam.S * DEPTH_Y };
}

/* ------------------------------------------------------------ backdrop */

const cache = new Map();

function paintStatic(arena, W, H) {
  const key = `${arena.id}:${W}x${H}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas");
  c.width = Math.round(W * 1.3);
  c.height = H;
  const g = c.getContext("2d");
  const r = rng(arena.seed || 7);
  const w = c.width;
  // base wall / darkness
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, arena.bg[0]);
  bg.addColorStop(0.6, arena.bg[1]);
  bg.addColorStop(1, arena.bg[2]);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, H);

  if (arena.style === "gym") {
    // brick wall
    g.globalAlpha = 0.18;
    for (let y = 0; y < H * 0.62; y += 18) {
      for (let x = (y / 18) % 2 ? -20 : 0; x < w; x += 40) {
        g.fillStyle = r() > 0.5 ? "#8a4b33" : "#6f3a28";
        g.fillRect(x + 1, y + 1, 38, 16);
      }
    }
    g.globalAlpha = 1;
    // high windows with warm light
    for (let i = 0; i < 4; i++) {
      const x = w * (0.12 + i * 0.25);
      const wg = g.createLinearGradient(x, 40, x, 140);
      wg.addColorStop(0, "rgba(255,214,150,0.55)");
      wg.addColorStop(1, "rgba(255,190,120,0.15)");
      g.fillStyle = wg;
      g.fillRect(x, 36, 110, 90);
      g.strokeStyle = "rgba(40,24,16,0.9)";
      g.lineWidth = 5;
      g.strokeRect(x, 36, 110, 90);
      g.beginPath();
      g.moveTo(x + 55, 36);
      g.lineTo(x + 55, 126);
      g.moveTo(x, 81);
      g.lineTo(x + 110, 81);
      g.stroke();
    }
    // posters
    const posters = [["FRIDAY", "SPARRING"], ["BOXING", "CLUB"], ["TRAIN", "HARD"], ["LOCAL", "CHAMPS"]];
    for (let i = 0; i < 4; i++) {
      const x = w * (0.05 + i * 0.26) + 130;
      const y = 150;
      g.fillStyle = ["#c9442f", "#e8c46a", "#2c5d9e", "#e2e2d8"][i];
      g.fillRect(x, y, 62, 84);
      g.fillStyle = "rgba(0,0,0,0.7)";
      g.font = "bold 13px Impact, sans-serif";
      g.textAlign = "center";
      g.fillText(posters[i][0], x + 31, y + 30);
      g.fillText(posters[i][1], x + 31, y + 48);
      g.fillRect(x + 14, y + 58, 34, 3);
    }
    // heavy bags hanging on chains
    for (let i = 0; i < 3; i++) {
      const x = w * (0.08 + i * 0.4);
      g.strokeStyle = "#555";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 150);
      g.stroke();
      const bgd = g.createLinearGradient(x - 26, 0, x + 26, 0);
      bgd.addColorStop(0, "#3a1914");
      bgd.addColorStop(0.45, "#8e3325");
      bgd.addColorStop(1, "#2a100c");
      g.fillStyle = bgd;
      g.beginPath();
      g.roundRect(x - 26, 150, 52, 150, 16);
      g.fill();
      g.fillStyle = "rgba(0,0,0,0.35)";
      g.fillRect(x - 26, 190, 52, 6);
      g.fillRect(x - 26, 262, 52, 6);
    }
  } else {
    // stands: tiers of seating rising into the dark
    const tiers = arena.tiers || 4;
    for (let t = 0; t < tiers; t++) {
      const y = H * (0.12 + t * 0.12);
      g.fillStyle = `rgba(${arena.seatTint || "40,44,60"},${0.5 - t * 0.08})`;
      g.fillRect(0, y, w, H * 0.1);
    }
    if (arena.style === "hall") {
      // hanging banners
      for (let i = 0; i < 6; i++) {
        const x = w * (0.06 + i * 0.16);
        g.fillStyle = ["#b83a3a", "#2f5fa8", "#e0b84a"][i % 3];
        g.beginPath();
        g.moveTo(x, 20);
        g.lineTo(x + 50, 20);
        g.lineTo(x + 50, 110);
        g.lineTo(x + 25, 95);
        g.lineTo(x, 110);
        g.closePath();
        g.fill();
        g.fillStyle = "rgba(255,255,255,0.8)";
        g.font = "bold 12px Impact, sans-serif";
        g.textAlign = "center";
        g.fillText("BOX", x + 25, 60);
      }
    }
    if (arena.style === "arena" || arena.style === "stadium" || arena.style === "championship") {
      // LED ribbon board
      const y = H * 0.44;
      g.fillStyle = "#07090f";
      g.fillRect(0, y, w, 22);
      g.fillStyle = arena.led || "#3fd0ff";
      g.font = "bold 14px Consolas, monospace";
      g.textAlign = "left";
      for (let x = 10; x < w; x += 260) g.fillText(arena.ledText || "BOXING CLUB  •  FIGHT NIGHT", x, y + 16);
    }
  }
  // overhead light rig
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(0, 0, w, 14);
  for (let i = 0; i < 8; i++) {
    const x = w * (0.06 + i * 0.125);
    g.fillStyle = "#1c1c20";
    g.fillRect(x - 14, 8, 28, 12);
    g.fillStyle = arena.lamp || "#fff4d8";
    g.fillRect(x - 10, 18, 20, 4);
  }
  cache.set(key, c);
  return c;
}

/** Crowd silhouettes: rows of heads/shoulders; excitement lifts arms. */
function drawCrowd(ctx, W, H, arena, t, excite, detail, parallax) {
  const rows = detail === "low" ? Math.min(2, arena.crowdRows) : arena.crowdRows;
  const r = rng(arena.seed * 13 + 1);
  for (let row = 0; row < rows; row++) {
    const y = H * (0.47 - row * 0.075);
    const size = 13 - row * 2;
    const step = size * 1.55;
    const shadeV = 0.12 + row * 0.03;
    const off = parallax * (0.25 + row * 0.05);
    for (let x = -40 + (row % 2) * step * 0.5; x < W + 40; x += step) {
      const seed = r();
      if (seed < arena.emptySeats) continue;
      const bob = Math.sin(t * (2 + seed * 2) + seed * 10) * (1 + excite * 3);
      const px = x - (off % step);
      const tone = `rgba(${Math.round(20 + seed * 30)},${Math.round(18 + seed * 22)},${Math.round(24 + seed * 30)},${1 - shadeV})`;
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.ellipse(px, y + size * 1.4 + bob * 0.4, size * 0.95, size * 0.8, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px, y + bob, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
      if (excite > 0.25 && seed > 0.62) {
        const lift = Math.min(1, excite) * size * 1.4;
        ctx.strokeStyle = tone;
        ctx.lineWidth = size * 0.3;
        ctx.beginPath();
        ctx.moveTo(px + size * 0.6, y + size);
        ctx.lineTo(px + size * 0.8, y - lift + bob);
        ctx.stroke();
      }
    }
  }
}

export function drawBackdrop(ctx, cam, W, H, arena, t, state) {
  const img = paintStatic(arena, Math.round(W), Math.round(H));
  const parallax = cam.camX * cam.S * 0.3;
  ctx.drawImage(img, -(img.width - W) / 2 - parallax, 0);
  drawCrowd(ctx, W, H, arena, t, state.excite || 0, state.detail, parallax);
  // light beams (championship) — gentle sweep
  if (arena.beams && state.detail !== "low") {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4; i++) {
      const sway = state.reduced ? 0 : Math.sin(t * 0.4 + i * 1.7) * 0.25;
      const x = W * (0.15 + i * 0.23);
      const g = ctx.createLinearGradient(x, 0, x + Math.sin(sway) * H, H * 0.8);
      g.addColorStop(0, "rgba(255,230,160,0.16)");
      g.addColorStop(1, "rgba(255,230,160,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 6, 0);
      ctx.lineTo(x + 6, 0);
      ctx.lineTo(x + Math.sin(sway) * H + 90, H * 0.8);
      ctx.lineTo(x + Math.sin(sway) * H - 90, H * 0.8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // camera flashes in the stands
  if (arena.flashes && state.detail !== "low") {
    for (const fl of state.flashes || []) {
      const a = 1 - fl.t / 140;
      if (a <= 0) continue;
      const g = ctx.createRadialGradient(fl.x, fl.y, 0, fl.x, fl.y, 18);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(fl.x - 18, fl.y - 18, 36, 36);
    }
  }
  // atmosphere haze toward the ring
  const haze = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.62);
  haze.addColorStop(0, "rgba(0,0,0,0)");
  haze.addColorStop(1, `rgba(0,0,0,${arena.haze ?? 0.35})`);
  ctx.fillStyle = haze;
  ctx.fillRect(0, H * 0.3, W, H * 0.4);
}

/* ---------------------------------------------------------------- ring */

function post(ctx, cam, x, z, pad) {
  const b = worldToScreen(cam, x, 0, z);
  const t = worldToScreen(cam, x, RING.postH, z);
  const w = 0.07 * cam.S * (1 + z * 0.06);
  const g = ctx.createLinearGradient(b.x - w, 0, b.x + w, 0);
  g.addColorStop(0, "#5c6066");
  g.addColorStop(0.5, "#c9ced4");
  g.addColorStop(1, "#4a4e54");
  ctx.fillStyle = g;
  ctx.fillRect(b.x - w * 0.6, t.y, w * 1.2, b.y - t.y);
  // turnbuckle pad
  const pg = ctx.createLinearGradient(b.x - w * 1.5, 0, b.x + w * 1.5, 0);
  pg.addColorStop(0, shade(pad, -0.35));
  pg.addColorStop(0.5, pad);
  pg.addColorStop(1, shade(pad, -0.4));
  ctx.fillStyle = pg;
  const top = worldToScreen(cam, x, RING.ropes[2] + 0.1, z).y;
  const bot = worldToScreen(cam, x, RING.ropes[0] - 0.1, z).y;
  ctx.beginPath();
  ctx.roundRect(b.x - w * 1.35, top, w * 2.7, bot - top, w * 0.8);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function rope(ctx, cam, a, b, h, color, alpha = 1) {
  const p = worldToScreen(cam, a.x, h, a.z);
  const q = worldToScreen(cam, b.x, h, b.z);
  const sag = 0.035 * cam.S;
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.05 * cam.S;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y + 3);
  ctx.quadraticCurveTo((p.x + q.x) / 2, (p.y + q.y) / 2 + sag + 3, q.x, q.y + 3);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.034 * cam.S;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.quadraticCurveTo((p.x + q.x) / 2, (p.y + q.y) / 2 + sag, q.x, q.y);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 0.01 * cam.S;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 0.008 * cam.S);
  ctx.quadraticCurveTo((p.x + q.x) / 2, (p.y + q.y) / 2 + sag - 0.008 * cam.S, q.x, q.y - 0.008 * cam.S);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawRingBack(ctx, cam, arena, state) {
  const E = RING.edge;
  const bl = worldToScreen(cam, -E - 0.25, 0, RING.back - 0.1);
  const br = worldToScreen(cam, E + 0.25, 0, RING.back - 0.1);
  const fl = worldToScreen(cam, -E - 0.25, 0, RING.front + 0.15);
  const fr = worldToScreen(cam, E + 0.25, 0, RING.front + 0.15);
  // apron (front face of the platform)
  const apronH = 0.42 * cam.S;
  const ag = ctx.createLinearGradient(0, fl.y, 0, fl.y + apronH);
  ag.addColorStop(0, arena.apron);
  ag.addColorStop(1, shade(arena.apron, -0.55));
  ctx.fillStyle = ag;
  ctx.fillRect(fl.x, fl.y, fr.x - fl.x, apronH);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `900 ${Math.round(0.16 * cam.S)}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(arena.apronText || "BOXING CLUB", (fl.x + fr.x) / 2, fl.y + apronH * 0.62);
  // canvas floor
  ctx.beginPath();
  ctx.moveTo(bl.x, bl.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(fr.x, fr.y);
  ctx.lineTo(fl.x, fl.y);
  ctx.closePath();
  const fg = ctx.createLinearGradient(0, bl.y, 0, fl.y);
  fg.addColorStop(0, shade(arena.canvas, -0.25));
  fg.addColorStop(1, arena.canvas);
  ctx.fillStyle = fg;
  ctx.fill();
  // spotlight pool on the canvas
  const mid = worldToScreen(cam, 0, 0, -0.1);
  const pool = ctx.createRadialGradient(mid.x, mid.y, 10, mid.x, mid.y, cam.S * 3.4);
  pool.addColorStop(0, `rgba(255,250,235,${arena.spot ?? 0.28})`);
  pool.addColorStop(1, "rgba(255,250,235,0)");
  ctx.save();
  ctx.clip();
  ctx.fillStyle = pool;
  ctx.fillRect(fl.x, bl.y, fr.x - fl.x, fl.y - bl.y);
  // centre logo + corner markings
  ctx.save();
  ctx.translate(mid.x, mid.y);
  ctx.scale(1, DEPTH_Y * 0.95);
  ctx.beginPath();
  ctx.arc(0, 0, 0.95 * cam.S, 0, Math.PI * 2);
  ctx.strokeStyle = arena.logo;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 0.06 * cam.S;
  ctx.stroke();
  ctx.font = `900 ${Math.round(0.36 * cam.S)}px Impact, "Arial Black", sans-serif`;
  ctx.fillStyle = arena.logo;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(arena.floorText || "BC", 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
  if (state.detail === "high") {
    // soft reflection of the lights on the canvas
    const refl = ctx.createLinearGradient(0, bl.y, 0, fl.y);
    refl.addColorStop(0, "rgba(255,255,255,0.06)");
    refl.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = refl;
    ctx.fillRect(fl.x, bl.y, fr.x - fl.x, fl.y - bl.y);
  }
  ctx.restore();
  // edge line of the canvas
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(fl.x, fl.y);
  ctx.lineTo(fr.x, fr.y);
  ctx.stroke();

  // back posts + back ropes + back halves of the side ropes
  post(ctx, cam, -E, RING.back, arena.cornerRed);
  post(ctx, cam, E, RING.back, arena.cornerNeutral);
  for (const h of RING.ropes) {
    rope(ctx, cam, { x: -E, z: RING.back }, { x: E, z: RING.back }, h, arena.rope);
    rope(ctx, cam, { x: -E, z: RING.back }, { x: -E, z: 0 }, h, arena.rope);
    rope(ctx, cam, { x: E, z: RING.back }, { x: E, z: 0 }, h, arena.rope);
  }
}

export function drawRingFront(ctx, cam, arena, W, H, t, state) {
  const E = RING.edge;
  for (const h of RING.ropes) {
    rope(ctx, cam, { x: -E, z: 0 }, { x: -E, z: RING.front }, h, arena.rope);
    rope(ctx, cam, { x: E, z: 0 }, { x: E, z: RING.front }, h, arena.rope);
  }
  post(ctx, cam, -E, RING.front, arena.cornerNeutral);
  post(ctx, cam, E, RING.front, arena.cornerBlue);
  for (const h of RING.ropes) rope(ctx, cam, { x: -E, z: RING.front }, { x: E, z: RING.front }, h, arena.rope, 0.92);
  // near crowd heads / press row along the bottom edge
  if (state.detail !== "low") {
    const r = rng(arena.seed * 7 + 3);
    const y = H - 6;
    for (let x = -20; x < W + 30; x += 34) {
      const s = 17 + r() * 6;
      const bob = Math.sin(t * 2.3 + x) * (1 + (state.excite || 0) * 3);
      ctx.fillStyle = "rgba(6,6,10,0.92)";
      ctx.beginPath();
      ctx.ellipse(x + r() * 8, y + s * 0.4, s * 1.2, s, 0, Math.PI, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + r() * 8, y - s * 0.6 + bob, s * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
