/**
 * Car Wash Studio — location backdrops (Canvas 2D, screen space).
 *
 * A wash bay per location: back wall with fixtures, garage door (or open
 * sides with sky), tool shelves, hose reel, tiled perspective floor with a
 * drainage channel and soft light pools. Detailed but low-contrast so the
 * car stays the hero; everything is cached per (location, size, quality).
 */
import { hexToRgb, rgb, lighten, darken, mix } from "./color.js";
import { mulberry32 } from "../engine/rng.js";

const cache = new Map();

export function getBackdrop(loc, w, h, groundY, dpr, quality) {
  const key = `${loc.id}|${w}|${h}|${Math.round(groundY)}|${dpr}|${quality}`;
  let c = cache.get(key);
  if (!c) {
    if (cache.size > 10) cache.clear();
    c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const ctx = c.getContext("2d");
    ctx.scale(dpr, dpr);
    drawBay(ctx, loc, w, h, groundY, quality);
    cache.set(key, c);
  }
  return c;
}

function drawBay(ctx, loc, W, H, groundY, quality) {
  const th = loc.theme;
  const wall = hexToRgb(th.wall);
  const wall2 = hexToRgb(th.wall2);
  const floor = hexToRgb(th.floor);
  const floor2 = hexToRgb(th.floor2);
  const accent = hexToRgb(th.accent);
  const rand = mulberry32(loc.id * 97);
  const horizon = groundY - Math.min(H * 0.2, 150);
  const hi = quality !== "low";

  // --- back wall
  const wg = ctx.createLinearGradient(0, 0, 0, horizon);
  wg.addColorStop(0, rgb(darken(wall2, 0.1)));
  wg.addColorStop(0.55, rgb(wall));
  wg.addColorStop(1, rgb(mix(wall, wall2, 0.5)));
  ctx.fillStyle = wg;
  ctx.fillRect(0, 0, W, horizon + 2);

  if (loc.key === "coastal") {
    // open-air club: sky, sea line, palms behind a low white wall
    const sky = ctx.createLinearGradient(0, 0, 0, horizon * 0.72);
    sky.addColorStop(0, "#6ec3ec");
    sky.addColorStop(1, "#cdeefa");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, horizon * 0.72);
    ctx.fillStyle = "#3aa3c9";
    ctx.fillRect(0, horizon * 0.6, W, horizon * 0.12);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 18; i++) ctx.fillRect(rand() * W, horizon * (0.62 + rand() * 0.08), 20 + rand() * 40, 1.2);
    for (const px of [0.08, 0.22, 0.8, 0.93]) palm(ctx, W * px, horizon * 0.72, horizon * (0.5 + rand() * 0.15), rand);
    const lw = ctx.createLinearGradient(0, horizon * 0.7, 0, horizon);
    lw.addColorStop(0, "#f7fbfc");
    lw.addColorStop(1, "#dbe7ec");
    ctx.fillStyle = lw;
    ctx.fillRect(0, horizon * 0.7, W, horizon * 0.3 + 2);
    // canopy beams
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(0, 0, W, Math.max(10, H * 0.035));
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, Math.max(10, H * 0.035), W, 4);
  } else {
    // wall panels
    const pw = Math.max(90, W / 9);
    for (let x = 0; x < W; x += pw) {
      ctx.fillStyle = "rgba(255,255,255,0.025)";
      ctx.fillRect(x + 2, 0, pw - 4, horizon);
      ctx.fillStyle = "rgba(0,0,0,0.16)";
      ctx.fillRect(x, 0, 1.5, horizon);
    }
    if (loc.key === "mountain") {
      // timber planks
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      for (let y = 12; y < horizon; y += 22) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }
    // garage door / window to the outside
    const dx0 = W * 0.56;
    const dx1 = W * 0.92;
    const dy0 = horizon * 0.2;
    ctx.fillStyle = rgb(darken(wall2, 0.35));
    ctx.fillRect(dx0 - 6, dy0 - 6, dx1 - dx0 + 12, horizon - dy0 + 6);
    if (th.sky) {
      const sg = ctx.createLinearGradient(0, dy0, 0, horizon);
      sg.addColorStop(0, th.sky);
      sg.addColorStop(1, rgb(lighten(hexToRgb(th.sky), 0.5)));
      ctx.fillStyle = sg;
      ctx.fillRect(dx0, dy0, dx1 - dx0, horizon - dy0);
      if (loc.key === "mountain") {
        for (let i = 0; i < 7; i++) pine(ctx, dx0 + ((dx1 - dx0) * (i + 0.5)) / 7 + (rand() - 0.5) * 20, horizon, 30 + rand() * 45);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(dx0, horizon - 6, dx1 - dx0, 6);
      }
      // mullions
      ctx.fillStyle = rgb(darken(wall2, 0.3));
      for (let i = 1; i < 4; i++) ctx.fillRect(dx0 + ((dx1 - dx0) * i) / 4 - 2, dy0, 4, horizon - dy0);
    } else {
      // roller door slats
      const dg = ctx.createLinearGradient(0, dy0, 0, horizon);
      dg.addColorStop(0, rgb(lighten(wall, 0.08)));
      dg.addColorStop(1, rgb(darken(wall, 0.1)));
      ctx.fillStyle = dg;
      ctx.fillRect(dx0, dy0, dx1 - dx0, horizon - dy0);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      for (let y = dy0 + 10; y < horizon; y += 12) ctx.fillRect(dx0, y, dx1 - dx0, 1.4);
      // daylight leaking under the door
      const lk = ctx.createLinearGradient(0, horizon - 14, 0, horizon);
      lk.addColorStop(0, "rgba(255,244,214,0)");
      lk.addColorStop(1, "rgba(255,244,214,0.55)");
      ctx.fillStyle = lk;
      ctx.fillRect(dx0, horizon - 14, dx1 - dx0, 14);
    }
    // shelves with product bottles (left)
    const sx0 = W * 0.05;
    const sx1 = W * 0.3;
    for (const sy of [horizon * 0.34, horizon * 0.62]) {
      ctx.fillStyle = rgb(darken(wall2, 0.4));
      ctx.fillRect(sx0, sy, sx1 - sx0, 5);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(sx0, sy + 5, sx1 - sx0, 4);
      let x = sx0 + 6;
      while (x < sx1 - 16) {
        const bw = 9 + rand() * 9;
        const bh = 18 + rand() * 22;
        const hue = [accent, [230, 90, 80], [250, 200, 80], [120, 190, 240], [240, 240, 240], [140, 200, 130]][Math.floor(rand() * 6)];
        const bg = ctx.createLinearGradient(x, 0, x + bw, 0);
        bg.addColorStop(0, rgb(lighten(hue, 0.25)));
        bg.addColorStop(1, rgb(darken(hue, 0.3)));
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(x, sy - bh, bw, bh, [3, 3, 1, 1]);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillRect(x + bw * 0.2, sy - bh * 0.6, bw * 0.6, bh * 0.22);
        ctx.fillStyle = "#222";
        ctx.fillRect(x + bw * 0.3, sy - bh - 4, bw * 0.4, 4);
        x += bw + 4 + rand() * 5;
      }
    }
  }

  // hose reel on the wall (right)
  if (loc.key !== "coastal") {
    const rx = W * 0.47;
    const ry = horizon * 0.55;
    const rr = Math.min(38, horizon * 0.16);
    ctx.fillStyle = rgb(darken(wall2, 0.35));
    ctx.beginPath();
    ctx.arc(rx, ry, rr * 1.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgb(accent);
    ctx.lineWidth = 3.2;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.arc(rx, ry, rr * (0.45 + k * 0.12), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#1c1d20";
    ctx.beginPath();
    ctx.arc(rx, ry, rr * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgb(accent);
    ctx.beginPath();
    ctx.moveTo(rx, ry + rr * 1.0);
    ctx.bezierCurveTo(rx + 10, horizon - 10, rx + 30, horizon - 4, rx + 60, horizon + 6);
    ctx.stroke();
  }

  // ceiling light fixtures + their glow on the wall
  const nL = 4;
  for (let i = 0; i < nL; i++) {
    const lx = (W * (i + 0.5)) / nL;
    const ly = Math.max(14, H * 0.05);
    const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, W * 0.18);
    glow.addColorStop(0, rgb(hexToRgb(th.light), loc.key === "premium" ? 0.2 : 0.16));
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(lx - W * 0.18, 0, W * 0.36, horizon);
    ctx.fillStyle = loc.key === "premium" ? rgb(accent) : "#f4fbff";
    ctx.beginPath();
    ctx.roundRect(lx - W * 0.06, ly - 3, W * 0.12, 6, 3);
    ctx.fill();
  }

  // accent stripe along the wall base
  ctx.fillStyle = rgb(accent, loc.key === "premium" ? 0.85 : 0.6);
  ctx.fillRect(0, horizon - 8, W, 3);
  ctx.fillStyle = rgb(darken(wall2, 0.45));
  ctx.fillRect(0, horizon - 5, W, 5);

  // --- floor
  const fg = ctx.createLinearGradient(0, horizon, 0, H);
  fg.addColorStop(0, rgb(darken(floor2, 0.15)));
  fg.addColorStop(0.35, rgb(floor2));
  fg.addColorStop(1, rgb(floor));
  ctx.fillStyle = fg;
  ctx.fillRect(0, horizon, W, H - horizon);
  // perspective tile lines
  const vx = W / 2;
  const vy = horizon - (H - horizon) * 1.6;
  ctx.strokeStyle = loc.key === "premium" ? "rgba(255,220,150,0.06)" : "rgba(0,0,0,0.12)";
  ctx.lineWidth = 1;
  for (let i = -14; i <= 14; i++) {
    const bx = vx + i * W * 0.09;
    const t = (horizon - vy) / (H - vy);
    ctx.beginPath();
    ctx.moveTo(vx + (bx - vx) * t, horizon);
    ctx.lineTo(bx, H);
    ctx.stroke();
  }
  let gap = 6;
  for (let y = horizon + 4; y < H; y += gap) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    gap *= 1.32;
  }
  // light pools reflected on the floor
  if (hi) {
    for (let i = 0; i < nL; i++) {
      const lx = (W * (i + 0.5)) / nL;
      const pool = ctx.createRadialGradient(lx, groundY + (H - groundY) * 0.4, 4, lx, groundY + (H - groundY) * 0.4, W * 0.14);
      pool.addColorStop(0, "rgba(255,255,255,0.08)");
      pool.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = pool;
      ctx.fillRect(lx - W * 0.14, horizon, W * 0.28, H - horizon);
    }
  }
  // drainage channel in front of the car
  const chY = Math.min(H - 10, groundY + Math.max(12, (H - groundY) * 0.42));
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(W * 0.04, chY, W * 0.92, 9);
  ctx.fillStyle = "rgba(160,168,176,0.55)";
  for (let x = W * 0.04 + 3; x < W * 0.96; x += 7) ctx.fillRect(x, chY + 1.5, 3, 6);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(W * 0.04, chY - 1, W * 0.92, 1);

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function palm(ctx, x, base, h, rand) {
  ctx.strokeStyle = "#6b5a44";
  ctx.lineWidth = Math.max(3, h * 0.05);
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + h * 0.12, base - h * 0.5, x + h * 0.05, base - h);
  ctx.stroke();
  ctx.fillStyle = "#3f8a55";
  const tx = x + h * 0.05;
  const ty = base - h;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.5 + (rand() - 0.5) * 0.2;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(h * 0.2, 0, h * 0.22, h * 0.045, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function pine(ctx, x, base, h) {
  ctx.fillStyle = "#2f4a3a";
  ctx.beginPath();
  ctx.moveTo(x, base - h);
  ctx.lineTo(x + h * 0.32, base);
  ctx.lineTo(x - h * 0.32, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.moveTo(x, base - h);
  ctx.lineTo(x + h * 0.1, base - h * 0.7);
  ctx.lineTo(x - h * 0.1, base - h * 0.7);
  ctx.closePath();
  ctx.fill();
}

/** Wet patches on the floor that grow as water is used (screen space). */
export function drawWetFloor(ctx, cx, groundY, width, amount, t) {
  if (amount <= 0.01) return;
  const a = Math.min(1, amount);
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const px = cx + (i - 1.5) * width * 0.28 + Math.sin(i * 7.1) * width * 0.05;
    const rx = width * (0.2 + 0.05 * Math.sin(i * 3.3)) * (0.6 + 0.4 * a);
    const g = ctx.createRadialGradient(px, groundY + 8, 2, px, groundY + 8, rx);
    g.addColorStop(0, `rgba(30,50,70,${0.22 * a})`);
    g.addColorStop(0.7, `rgba(40,60,80,${0.1 * a})`);
    g.addColorStop(1, "rgba(40,60,80,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, groundY + 8, rx, rx * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    // glint
    ctx.fillStyle = `rgba(220,240,255,${0.12 * a * (0.6 + 0.4 * Math.sin(t * 0.8 + i))})`;
    ctx.beginPath();
    ctx.ellipse(px + rx * 0.2, groundY + 7, rx * 0.35, rx * 0.025, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
