/**
 * Mini Golf Journey — Canvas renderer.
 *
 * Two passes, both called every frame by GolfCanvas:
 *   drawBackdrop(ctx, …)  device pixels, behind the course — sky, parallax
 *                         scenery, city skyline. Fills the fullscreen letterbox.
 *   drawCourse(ctx, …)    logical units (0..320 × 0..180) — the raised course
 *                         platform, terrain, hazards, walls, cup, ball, aim,
 *                         particles.
 *
 * Every world reads its colours from `world.palette` so one renderer paints all
 * five. `quality` ('low' | 'medium' | 'high') only ever removes decorative
 * layers — geometry the player reads from is always drawn.
 */

import { PLAY_BOUNDS, CUP_RADIUS } from "../data/obstacles.js";
import { mulberry32, seedFrom } from "../utils/rng.js";
import { drawDecoration } from "./decor.js";

const B = PLAY_BOUNDS;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hazardPath(ctx, hz) {
  if (hz.shape === "circle") {
    ctx.beginPath();
    ctx.arc(hz.cx, hz.cy, hz.r, 0, Math.PI * 2);
  } else {
    roundRect(ctx, hz.x, hz.y, hz.w, hz.h, hz.round || 6);
  }
}

/* ============================================================ backdrop ==== */

export function drawBackdrop(ctx, world, W, H, time, quality) {
  const pal = world.palette;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  const stops = pal.backdrop;
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const neon = world.id === 5;

  if (neon) {
    // stars
    const rng = mulberry32(99);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    for (let i = 0; i < (quality === "low" ? 24 : 70); i++) {
      const x = rng() * W;
      const y = rng() * H * 0.6;
      const s = rng() * 1.6 + 0.3;
      ctx.globalAlpha = 0.3 + rng() * 0.6;
      ctx.fillRect(x, y, s, s);
    }
    ctx.globalAlpha = 1;
    // moon
    const mg = ctx.createRadialGradient(W * 0.8, H * 0.2, 2, W * 0.8, H * 0.2, H * 0.16);
    mg.addColorStop(0, "rgba(210,225,255,0.95)");
    mg.addColorStop(1, "rgba(210,225,255,0)");
    ctx.fillStyle = mg;
    ctx.beginPath();
    ctx.arc(W * 0.8, H * 0.2, H * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // skyline glow
    const sg = ctx.createLinearGradient(0, H * 0.55, 0, H);
    sg.addColorStop(0, "rgba(110,80,180,0)");
    sg.addColorStop(1, "rgba(120,90,200,0.35)");
    ctx.fillStyle = sg;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
    if (quality !== "low") {
      const rng2 = mulberry32(7);
      for (let x = -20; x < W + 20; x += 26) {
        const bh = (0.18 + rng2() * 0.24) * H;
        ctx.fillStyle = "rgba(20,20,40,0.55)";
        ctx.fillRect(x, H - bh, 22, bh);
        ctx.fillStyle = "rgba(110,231,255,0.18)";
        for (let wy = H - bh + 6; wy < H - 4; wy += 8) {
          if (rng2() > 0.5) ctx.fillRect(x + 4, wy, 4, 3);
        }
      }
    }
    return;
  }

  // sun glow (grass / beach / ruins) or cool haze (snow)
  const warm = world.id === 2 ? "rgba(255,214,150,0.55)" : world.id === 3 ? "rgba(255,255,255,0.4)" : "rgba(255,244,208,0.5)";
  const sx = world.id === 2 ? W * 0.5 : W * 0.78;
  const gg = ctx.createRadialGradient(sx, H * 0.12, 4, sx, H * 0.12, H * 0.5);
  gg.addColorStop(0, warm);
  gg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gg;
  ctx.fillRect(0, 0, W, H);

  if (quality === "low") return;

  // parallax hills / dunes near the horizon
  const [h1, h2] = pal.hills;
  ctx.fillStyle = h1;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.82);
  for (let x = 0; x <= W; x += W / 6) {
    ctx.quadraticCurveTo(x + W / 12, H * (0.7 + 0.1 * Math.sin(x)), x + W / 6, H * 0.8);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();
  ctx.fillStyle = h2;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.92);
  for (let x = 0; x <= W; x += W / 4) {
    ctx.quadraticCurveTo(x + W / 8, H * (0.84 + 0.06 * Math.cos(x)), x + W / 4, H * 0.9);
  }
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();

  if (world.id === 3) {
    // snow-capped peaks
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 4; i++) {
      const x = (i + 0.5) * (W / 4);
      ctx.beginPath();
      ctx.moveTo(x - 46, H * 0.8);
      ctx.lineTo(x, H * 0.5);
      ctx.lineTo(x + 46, H * 0.8);
      ctx.closePath();
      ctx.fill();
    }
  }

  // drifting clouds
  if (quality === "high") {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 4; i++) {
      const cx = ((time * (6 + i * 2) + i * 260) % (W + 160)) - 80;
      const cy = H * (0.12 + i * 0.07);
      const s = 0.7 + i * 0.15;
      ctx.globalAlpha = 0.5 - i * 0.08;
      for (const [dx, dy, r] of [
        [0, 0, 18],
        [16, 4, 13],
        [-15, 5, 12],
        [32, 6, 9],
      ]) {
        ctx.beginPath();
        ctx.ellipse(cx + dx * s, cy + dy * s, r * s, r * s * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/* ============================================================== course ==== */

export function drawCourse(ctx, scene) {
  const { engine, level, world, quality, animations, aimGuide, aim, particles, time } = scene;
  const pal = world.palette;
  const anim = animations !== false;
  const t = anim ? time : 0;

  // 1 — rough surround
  ctx.fillStyle = pal.edgeBand;
  ctx.fillRect(0, 0, 320, 180);
  const vg = ctx.createRadialGradient(160, 90, 40, 160, 90, 190);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, 320, 180);

  // 2 — decorations. Clipped to the rough apron only (whole field minus the
  // play surface) so a tree can peek from behind the rail but never sit on the
  // course or clutter a shot.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-40, -40, 400, 260);
  roundRect(ctx, B.x - 2, B.y - 2, B.w + 4, B.h + 4, 12);
  ctx.clip("evenodd");
  for (const d of level.decorations) drawDecoration(ctx, d, pal, t);
  ctx.restore();

  // 3 — the raised play surface
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = quality === "low" ? 0 : 10;
  ctx.shadowOffsetY = 4;
  roundRect(ctx, B.x, B.y, B.w, B.h, 12);
  const base = ctx.createLinearGradient(B.x, B.y, B.x + B.w, B.y + B.h);
  base.addColorStop(0, pal.groundHi);
  base.addColorStop(0.5, pal.ground);
  base.addColorStop(1, pal.groundLo);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, B.x, B.y, B.w, B.h, 12);
  ctx.clip();

  // mow stripes / grid
  if (world.id === 5) {
    ctx.strokeStyle = "rgba(110,231,255,0.10)";
    ctx.lineWidth = 0.6;
    for (let x = B.x; x <= B.x + B.w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, B.y);
      ctx.lineTo(x, B.y + B.h);
      ctx.stroke();
    }
    for (let y = B.y; y <= B.y + B.h; y += 16) {
      ctx.beginPath();
      ctx.moveTo(B.x, y);
      ctx.lineTo(B.x + B.w, y);
      ctx.stroke();
    }
  } else {
    for (let i = 0, x = B.x; x < B.x + B.w; x += 24, i++) {
      ctx.fillStyle = i % 2 ? pal.fairwayHi : pal.fairway;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x, B.y, 24, B.h);
    }
    ctx.globalAlpha = 1;
    const sheen = ctx.createLinearGradient(0, B.y, 0, B.y + B.h);
    sheen.addColorStop(0, "rgba(255,255,255,0.12)");
    sheen.addColorStop(0.4, "rgba(255,255,255,0)");
    sheen.addColorStop(1, "rgba(0,0,0,0.14)");
    ctx.fillStyle = sheen;
    ctx.fillRect(B.x, B.y, B.w, B.h);
  }

  // speckle texture
  if (quality !== "low") {
    const rng = mulberry32(seedFrom(level.id, 4));
    ctx.fillStyle = world.id === 5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    const count = quality === "high" ? 260 : 120;
    for (let i = 0; i < count; i++) {
      ctx.fillRect(B.x + rng() * B.w, B.y + rng() * B.h, rng() * 1.4 + 0.3, rng() * 1.4 + 0.3);
    }
  }

  // 4 — hazards
  for (const hz of level.hazards) drawHazard(ctx, hz, world, quality, t);

  // 5 — conveyors
  for (const o of level.obstacles) if (o.type === "conveyor") drawConveyor(ctx, o, pal, t);

  // 6 — portals
  for (const p of level.portals) drawPortal(ctx, p, t, quality);

  // inner shadow for depth
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 6;
  roundRect(ctx, B.x + 3, B.y + 3, B.w - 6, B.h - 6, 10);
  ctx.stroke();
  ctx.restore();

  // 7 — cup + flag
  drawCup(ctx, level.hole, pal, t, anim);

  // 8 — walls (static + moving)
  const movers = engine.moverColliders(engine.t);
  drawWalls(ctx, engine.walls, movers, pal, world, quality);

  // 9 — aim guide
  if (aim && aim.active && engine.status === "aim") {
    drawAim(ctx, engine.ball, aim, pal, aimGuide !== false);
  }

  // 10 — ball
  if (engine.status !== "sunk" || engine.sinkAnim < 1) {
    drawBall(ctx, engine, quality);
  }

  // 11 — particles
  for (const p of particles) drawParticle(ctx, p);
}

/* ------------------------------------------------------------- hazards ---- */

function drawHazard(ctx, hz, world, quality, t) {
  const pal = world.palette;
  ctx.save();
  hazardPath(ctx, hz);
  ctx.clip();
  const bb = hzBounds(hz);

  if (hz.kind === "water") {
    const g = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
    g.addColorStop(0, pal.water || "#3aa0d6");
    g.addColorStop(1, "#12557f");
    ctx.fillStyle = g;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) {
      const yy = bb.y + ((i + 0.5) / 5) * bb.h + Math.sin(t * 1.6 + i) * 1.2;
      ctx.beginPath();
      for (let x = bb.x; x <= bb.x + bb.w; x += 6) {
        const oy = yy + Math.sin(x * 0.25 + t * 2 + i) * 1.1;
        x === bb.x ? ctx.moveTo(x, oy) : ctx.lineTo(x, oy);
      }
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.fillRect(bb.x, bb.y, bb.w, 2);
  } else if (hz.kind === "sand") {
    const g = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
    g.addColorStop(0, pal.sandHi || "#fbe9c4");
    g.addColorStop(1, pal.sand || "#e9cf9c");
    ctx.fillStyle = g;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    if (quality !== "low") {
      const rng = mulberry32(seedFrom(bb.x, bb.y));
      ctx.fillStyle = "rgba(150,110,60,0.28)";
      for (let i = 0; i < 140; i++) {
        ctx.fillRect(bb.x + rng() * bb.w, bb.y + rng() * bb.h, 0.8, 0.8);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 0.6;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(bb.x, bb.y + (i / 4) * bb.h);
        ctx.quadraticCurveTo(bb.x + bb.w / 2, bb.y + (i / 4) * bb.h + 3, bb.x + bb.w, bb.y + (i / 4) * bb.h);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "rgba(120,90,50,0.4)";
    ctx.lineWidth = 1.4;
    hazardPath(ctx, hz);
    ctx.stroke();
  } else if (hz.kind === "ice") {
    const g = ctx.createLinearGradient(bb.x, bb.y, bb.x + bb.w, bb.y + bb.h);
    g.addColorStop(0, pal.iceHi || "#e6f7fb");
    g.addColorStop(1, pal.ice || "#bfe6f2");
    ctx.fillStyle = g;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.save();
    ctx.translate(bb.x, bb.y);
    ctx.rotate(-0.5);
    ctx.fillRect(-bb.h, bb.h * 0.2, bb.w * 2, bb.h * 0.16);
    ctx.restore();
    if (quality !== "low") {
      const rng = mulberry32(seedFrom(bb.x, bb.y + 1));
      ctx.strokeStyle = "rgba(150,190,205,0.32)";
      ctx.lineWidth = 0.5;
      const cracks = Math.max(1, Math.round((bb.w * bb.h) / 5200));
      for (let i = 0; i < cracks; i++) {
        let x = bb.x + rng() * bb.w;
        let y = bb.y + rng() * bb.h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          x += (rng() - 0.5) * 11;
          y += (rng() - 0.5) * 11;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.4;
    hazardPath(ctx, hz);
    ctx.stroke();
  } else if (hz.kind === "snow") {
    const g = ctx.createLinearGradient(bb.x, bb.y, bb.x, bb.y + bb.h);
    g.addColorStop(0, pal.snowHi || "#ffffff");
    g.addColorStop(1, pal.snow || "#e7eef4");
    ctx.fillStyle = g;
    ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
    if (quality !== "low") {
      const rng = mulberry32(seedFrom(bb.x, bb.y + 2));
      ctx.fillStyle = "rgba(180,205,225,0.5)";
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc(bb.x + rng() * bb.w, bb.y + rng() * bb.h, rng() * 1.2 + 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(200,220,235,0.8)";
    ctx.lineWidth = 2;
    hazardPath(ctx, hz);
    ctx.stroke();
  }
  ctx.restore();
}

function hzBounds(hz) {
  if (hz.shape === "circle") return { x: hz.cx - hz.r, y: hz.cy - hz.r, w: hz.r * 2, h: hz.r * 2 };
  return { x: hz.x, y: hz.y, w: hz.w, h: hz.h };
}

/* ----------------------------------------------------------- conveyor ---- */

function drawConveyor(ctx, o, pal, t) {
  ctx.save();
  roundRect(ctx, o.x, o.y, o.w, o.h, 4);
  ctx.clip();
  ctx.fillStyle = "rgba(110,231,255,0.10)";
  ctx.fillRect(o.x, o.y, o.w, o.h);
  const cl = Math.hypot(o.dx, o.dy) || 1;
  const nx = o.dx / cl;
  const ny = o.dy / cl;
  const ang = Math.atan2(ny, nx);
  ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
  ctx.rotate(ang);
  const span = Math.hypot(o.w, o.h);
  ctx.strokeStyle = "rgba(110,231,255,0.6)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  const scroll = (t * 26) % 14;
  for (let d = -span; d < span; d += 14) {
    const px = d + scroll;
    ctx.beginPath();
    ctx.moveTo(px - 3, -3.5);
    ctx.lineTo(px + 3, 0);
    ctx.lineTo(px - 3, 3.5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = pal.accent || "#6ee7ff";
  ctx.shadowColor = pal.accent || "#6ee7ff";
  ctx.shadowBlur = 6;
  ctx.lineWidth = 1.4;
  roundRect(ctx, o.x, o.y, o.w, o.h, 4);
  ctx.stroke();
  ctx.restore();
}

/* ------------------------------------------------------------- portal ---- */

function drawPortal(ctx, p, t, quality) {
  for (const [x, y] of [
    [p.ax, p.ay],
    [p.bx, p.by],
  ]) {
    ctx.save();
    ctx.translate(x, y);
    const col = `hsl(${p.hue}, 85%, 62%)`;
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, p.r + 5);
    g.addColorStop(0, `hsla(${p.hue},90%,70%,0.55)`);
    g.addColorStop(1, `hsla(${p.hue},90%,70%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(t * 2.2);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.rotate(-t * 3.4);
    ctx.strokeStyle = `hsla(${p.hue},90%,80%,0.8)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 0.6, 0.4, Math.PI * 1.6);
    ctx.stroke();
    ctx.restore();
  }
}

/* --------------------------------------------------------------- cup ----- */

function drawCup(ctx, hole, pal, t, anim) {
  const { x, y } = hole;
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x + 1.5, y + 1.5, CUP_RADIUS + 1.5, (CUP_RADIUS + 1.5) * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // hole
  const g = ctx.createRadialGradient(x, y - 1, 0.5, x, y, CUP_RADIUS);
  g.addColorStop(0, "#000");
  g.addColorStop(0.7, pal.cup || "#15100a");
  g.addColorStop(1, "#3a2c1c");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, CUP_RADIUS, CUP_RADIUS * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  // back rim highlight
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(x, y, CUP_RADIUS, CUP_RADIUS * 0.72, 0, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();

  // flag — pole clamped so it never spills past the top rail
  const sway = anim ? Math.sin(t * 2) * 0.08 : 0;
  const poleX = x;
  const poleTopY = Math.max(y - 30, 7);
  ctx.strokeStyle = "#e8e3d6";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(poleX, y - 1);
  ctx.quadraticCurveTo(poleX + sway * 20, (y + poleTopY) / 2, poleX + sway * 26, poleTopY);
  ctx.stroke();
  ctx.fillStyle = "#c9c2b0";
  ctx.beginPath();
  ctx.arc(poleX + sway * 26, poleTopY, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // cloth
  const fx = poleX + sway * 26;
  ctx.fillStyle = pal.flag || "#e8442f";
  ctx.beginPath();
  ctx.moveTo(fx, poleTopY + 1);
  const wob = anim ? Math.sin(t * 6) * 2 : 0;
  ctx.quadraticCurveTo(fx + 12, poleTopY + 3 + wob, fx + 20, poleTopY + 6 - wob);
  ctx.quadraticCurveTo(fx + 12, poleTopY + 8, fx + 1, poleTopY + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.moveTo(fx, poleTopY + 8);
  ctx.quadraticCurveTo(fx + 8, poleTopY + 9, fx + 1, poleTopY + 12);
  ctx.closePath();
  ctx.fill();
}

/* -------------------------------------------------------------- walls ---- */

function drawWalls(ctx, statics, movers, pal, world, quality) {
  const neon = world.id === 5;
  const all = [];
  for (const w of statics) all.push({ w, moving: false });
  for (const w of movers) all.push({ w, moving: true });

  // shadows first
  if (!neon) {
    ctx.strokeStyle = "rgba(0,0,0,0.30)";
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    for (const { w } of all) {
      if (w.kind === "capsule") {
        ctx.lineCap = "round";
        ctx.lineWidth = w.r * 2 + 2;
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1 + 2.5);
        ctx.lineTo(w.x2, w.y2 + 2.5);
        ctx.stroke();
      } else {
        roundRect(ctx, w.x + 1.5, w.y + 2.5, w.w, w.h, 3);
        ctx.fill();
      }
    }
  }

  for (const { w, moving } of all) {
    if (w.kind === "capsule") {
      const seg = () => {
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
      };
      ctx.lineCap = "round";
      if (neon) {
        ctx.strokeStyle = "#1c2338";
        ctx.lineWidth = w.r * 2 + 1;
        seg();
        ctx.stroke();
        ctx.save();
        ctx.shadowColor = moving ? (pal.accent2 || "#b98cff") : pal.wallLine;
        ctx.shadowBlur = quality === "low" ? 3 : 9;
        ctx.strokeStyle = moving ? (pal.accent2 || "#b98cff") : pal.wallLine;
        ctx.lineWidth = 2;
        seg();
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.strokeStyle = pal.wallSide;
        ctx.lineWidth = w.r * 2 + 1;
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1 + 1.4);
        ctx.lineTo(w.x2, w.y2 + 1.4);
        ctx.stroke();
        ctx.strokeStyle = moving ? shade(pal.wallTop, -8) : pal.wallTop;
        ctx.lineWidth = w.r * 2;
        seg();
        ctx.stroke();
        ctx.strokeStyle = pal.wallLine;
        ctx.lineWidth = 0.7;
        seg();
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1 - w.r * 0.4);
        ctx.lineTo(w.x2, w.y2 - w.r * 0.4);
        ctx.stroke();
      }
    } else {
      // rect box
      if (neon) {
        roundRect(ctx, w.x, w.y, w.w, w.h, 3);
        ctx.fillStyle = "#1c2338";
        ctx.fill();
        ctx.save();
        ctx.shadowColor = pal.wallLine;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = pal.wallLine;
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.restore();
      } else {
        roundRect(ctx, w.x, w.y, w.w, w.h, 3);
        ctx.fillStyle = pal.wallSide;
        ctx.fill();
        roundRect(ctx, w.x, w.y - 1.5, w.w, w.h, 3);
        const g = ctx.createLinearGradient(w.x, w.y, w.x, w.y + w.h);
        g.addColorStop(0, shade(pal.wallTop, 6));
        g.addColorStop(1, pal.wallTop);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = pal.wallLine;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }
  }
}

function shade(hex, amt) {
  const c = hex.replace("#", "");
  const n = parseInt(c.length === 3 ? c.split("").map((x) => x + x).join("") : c, 16);
  let r = (n >> 16) + amt;
  let g = ((n >> 8) & 255) + amt;
  let b = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));
  return `rgb(${r},${g},${b})`;
}

/* --------------------------------------------------------------- aim ----- */

function drawAim(ctx, ball, aim, pal, showGuide) {
  const l = Math.hypot(aim.dirX, aim.dirY) || 1;
  const nx = aim.dirX / l;
  const ny = aim.dirY / l;
  const power = aim.power;

  // power ring around ball
  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r + 4, 0, Math.PI * 2);
  ctx.stroke();
  const col = power < 0.4 ? "#57d06a" : power < 0.72 ? "#f4c744" : "#f0603a";
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r + 4, -Math.PI / 2, -Math.PI / 2 + power * Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (!showGuide) return;

  // dotted aim line (limited length — never the full trajectory)
  const maxLen = 24 + power * 66;
  ctx.save();
  ctx.fillStyle = col;
  for (let d = ball.r + 5; d < maxLen; d += 6) {
    const a = 1 - d / maxLen;
    ctx.globalAlpha = 0.25 + a * 0.6;
    ctx.beginPath();
    ctx.arc(ball.x + nx * d, ball.y + ny * d, 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // arrowhead
  const ex = ball.x + nx * maxLen;
  const ey = ball.y + ny * maxLen;
  const pa = Math.atan2(ny, nx);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - Math.cos(pa - 0.4) * 6, ey - Math.sin(pa - 0.4) * 6);
  ctx.lineTo(ex - Math.cos(pa + 0.4) * 6, ey - Math.sin(pa + 0.4) * 6);
  ctx.closePath();
  ctx.fill();
  // pull-back marker
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(ball.x, ball.y);
  ctx.lineTo(ball.x - nx * (10 + power * 30), ball.y - ny * (10 + power * 30));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* -------------------------------------------------------------- ball ----- */

function drawBall(ctx, engine, quality) {
  const b = engine.ball;
  let scale = 1;
  let sink = 0;
  if (engine.status === "sunk") {
    sink = engine.sinkAnim;
    scale = 1 - sink * 0.55;
  }
  const r = b.r * scale;

  // contact shadow
  ctx.fillStyle = `rgba(0,0,0,${0.32 * (1 - sink)})`;
  ctx.beginPath();
  ctx.ellipse(b.x + 1.4, b.y + 2.2, r * 1.15, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.clip();
  const g = ctx.createRadialGradient(b.x - r * 0.4, b.y - r * 0.45, r * 0.1, b.x, b.y, r * 1.15);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.55, "#eef1f4");
  g.addColorStop(1, "#c2c8d0");
  ctx.fillStyle = g;
  ctx.fillRect(b.x - r, b.y - r, r * 2, r * 2);

  if (quality !== "low") {
    ctx.fillStyle = "rgba(140,150,165,0.28)";
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const rr = r * (0.35 + (i % 3) * 0.22);
      ctx.beginPath();
      ctx.arc(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr, r * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // rim light
  ctx.strokeStyle = "rgba(120,130,145,0.5)";
  ctx.lineWidth = r * 0.3;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r * 0.92, Math.PI * 0.1, Math.PI * 0.8);
  ctx.stroke();
  ctx.restore();

  // specular
  if (sink < 0.5) {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.ellipse(b.x - r * 0.35, b.y - r * 0.4, r * 0.28, r * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(0,0,0,0.12)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
  ctx.stroke();
}

/* ----------------------------------------------------------- particles --- */

function drawParticle(ctx, p) {
  const life = p.life / p.max;
  ctx.save();
  ctx.globalAlpha = Math.max(0, life);
  if (p.kind === "splash" || p.kind === "spray") {
    ctx.fillStyle = p.kind === "splash" ? "rgba(150,210,240,0.9)" : "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * life + 0.4, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === "star") {
    ctx.fillStyle = p.color || "#ffd66b";
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot || 0);
    star(ctx, 0, 0, 5, p.r * (0.5 + life), p.r * 0.4);
    ctx.fill();
  } else if (p.kind === "ring") {
    ctx.strokeStyle = p.color || "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.5 * life + 0.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 - life) + 2, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = p.color || "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * life + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function star(ctx, cx, cy, spikes, outer, inner) {
  let rot = -Math.PI / 2;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outer);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner);
    rot += step;
  }
  ctx.closePath();
}
