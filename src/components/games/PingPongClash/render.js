/**
 * Ping Pong Clash — canvas drawing. The arena, table and net never move, so
 * they are painted once per resize into an offscreen layer; each frame only
 * draws paddles, ball, shadows and effects on top.
 */
import { TABLE, BOUNDS, PADDLE_R, BALL_R } from "./engine.js";

const HL = TABLE.L / 2;
const HW = TABLE.W / 2;
const COLORS = [
  { rubber: "#e63946", hi: "#ff8a8a", ring: "#ff6b6b" },
  { rubber: "#1d2b53", hi: "#4f74d9", ring: "#6bc4ff" },
];

export function createView() {
  return { w: 0, h: 0, dpr: 1, s: 1, cx: 0, cy: 0, layer: null, trail: [] };
}

/** Fit the world into the canvas and repaint the static layer. */
export function resizeView(view, canvas, w, h, dpr) {
  dpr = Math.min(dpr || 1, 2);
  view.w = w;
  view.h = h;
  view.dpr = dpr;
  view.s = Math.min(w / (BOUNDS.x * 2), h / (BOUNDS.y * 2));
  view.cx = w / 2;
  view.cy = h / 2 + view.s * 0.04;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const layer = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(canvas.width, canvas.height) : document.createElement("canvas");
  layer.width = canvas.width;
  layer.height = canvas.height;
  const c = layer.getContext("2d");
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintStatic(c, view);
  view.layer = layer;
}

/** Screen → world (for pointer input). */
export function toWorld(view, px, py) {
  return { x: (px - view.cx) / view.s, y: (py - view.cy) / view.s };
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function paintStatic(c, v) {
  const { w, h, s, cx, cy } = v;
  // arena floor
  const bg = c.createRadialGradient(cx, cy, s * 0.4, cx, cy, Math.max(w, h) * 0.75);
  bg.addColorStop(0, "#26315f");
  bg.addColorStop(0.55, "#161c3d");
  bg.addColorStop(1, "#0a0d22");
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  // court surround lines
  c.strokeStyle = "rgba(140, 170, 255, 0.10)";
  c.lineWidth = Math.max(1, s * 0.012);
  roundRect(c, cx - s * 2.15, cy - s * 1.2, s * 4.3, s * 2.4, s * 0.12);
  c.stroke();
  c.beginPath();
  c.arc(cx, cy, s * 1.05, 0, Math.PI * 2);
  c.stroke();
  // spotlight
  const spot = c.createRadialGradient(cx, cy, 0, cx, cy, s * 1.9);
  spot.addColorStop(0, "rgba(130, 170, 255, 0.16)");
  spot.addColorStop(1, "rgba(130, 170, 255, 0)");
  c.fillStyle = spot;
  c.fillRect(0, 0, w, h);

  const tx = cx - HL * s;
  const ty = cy - HW * s;
  const tw = TABLE.L * s;
  const th = TABLE.W * s;
  // soft drop shadow + table edge thickness
  c.save();
  c.shadowColor = "rgba(0, 0, 0, 0.55)";
  c.shadowBlur = s * 0.25;
  c.shadowOffsetY = s * 0.08;
  c.fillStyle = "#0b2a5e";
  roundRect(c, tx, ty, tw, th + s * 0.035, s * 0.02);
  c.fill();
  c.restore();
  // surface
  const top = c.createLinearGradient(0, ty, 0, ty + th);
  top.addColorStop(0, "#2f78e0");
  top.addColorStop(1, "#1b55b5");
  c.fillStyle = top;
  roundRect(c, tx, ty, tw, th, s * 0.015);
  c.fill();
  // sheen
  const sheen = c.createLinearGradient(tx, ty, tx + tw, ty + th);
  sheen.addColorStop(0, "rgba(255,255,255,0.10)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0.05)");
  c.fillStyle = sheen;
  c.fill();
  // markings
  const lw = Math.max(1.5, s * 0.02);
  c.strokeStyle = "rgba(255,255,255,0.95)";
  c.lineWidth = lw;
  c.strokeRect(tx + lw / 2, ty + lw / 2, tw - lw, th - lw);
  c.lineWidth = Math.max(1, s * 0.006);
  c.strokeStyle = "rgba(255,255,255,0.75)";
  c.beginPath();
  c.moveTo(tx + lw, cy);
  c.lineTo(tx + tw - lw, cy);
  c.stroke();

  // net: shadow on the table, mesh, white tape, posts
  const ny0 = cy - (HW + 0.15) * s;
  const ny1 = cy + (HW + 0.15) * s;
  c.fillStyle = "rgba(0, 10, 40, 0.28)";
  c.fillRect(cx + s * 0.01, ny0 + s * 0.02, s * 0.06, ny1 - ny0);
  c.fillStyle = "rgba(20, 24, 40, 0.75)";
  c.fillRect(cx - s * 0.016, ny0, s * 0.032, ny1 - ny0);
  c.strokeStyle = "rgba(255,255,255,0.18)";
  c.lineWidth = 1;
  c.beginPath();
  for (let y = ny0; y < ny1; y += Math.max(3, s * 0.025)) {
    c.moveTo(cx - s * 0.016, y);
    c.lineTo(cx + s * 0.016, y);
  }
  c.stroke();
  c.fillStyle = "#f4f6ff";
  c.fillRect(cx - s * 0.006, ny0, s * 0.012, ny1 - ny0);
  c.fillStyle = "#2b2f45";
  for (const y of [ny0, ny1]) {
    roundRect(c, cx - s * 0.025, y - s * 0.025, s * 0.05, s * 0.05, s * 0.01);
    c.fill();
  }
}

function drawPaddle(c, v, p, side) {
  const { s, cx, cy } = v;
  const x = cx + p.x * s;
  const y = cy + p.y * s;
  const r = PADDLE_R * s;
  const facing = side === 0 ? 1 : -1;
  // handle points back toward the player's end, tilting with lateral motion
  const tilt = Math.max(-0.6, Math.min(0.6, p.vy * 0.12));
  const ang = (side === 0 ? Math.PI : 0) - tilt * facing;
  const col = COLORS[side];

  c.save();
  c.translate(x, y);
  // shadow
  c.save();
  c.translate(s * 0.05, s * 0.08);
  c.rotate(ang);
  c.fillStyle = "rgba(0, 0, 20, 0.35)";
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  roundRect(c, r * 0.8, -r * 0.16, r * 0.95, r * 0.32, r * 0.12);
  c.fill();
  c.restore();

  c.rotate(ang);
  // handle
  const hg = c.createLinearGradient(0, -r * 0.16, 0, r * 0.16);
  hg.addColorStop(0, "#e2b98a");
  hg.addColorStop(0.5, "#c58f58");
  hg.addColorStop(1, "#8f6238");
  c.fillStyle = hg;
  roundRect(c, r * 0.78, -r * 0.16, r * 0.95, r * 0.32, r * 0.12);
  c.fill();
  c.fillStyle = "rgba(60,30,10,0.35)";
  c.fillRect(r * 0.82, -r * 0.16, r * 0.08, r * 0.32);
  // wooden rim + rubber
  c.fillStyle = "#d9a86f";
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  const rg = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  rg.addColorStop(0, col.hi);
  rg.addColorStop(0.55, col.rubber);
  rg.addColorStop(1, col.rubber);
  c.fillStyle = rg;
  c.beginPath();
  c.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  c.fill();
  // subtle rubber texture rings
  c.lineWidth = 1;
  c.strokeStyle = "rgba(0,0,0,0.08)";
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(0, 0, r * (0.3 + i * 0.2), 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

function drawBall(c, v, b) {
  const { s, cx, cy } = v;
  const over = Math.abs(b.x) <= HL && Math.abs(b.y) <= HW;
  const ground = over ? 0 : -TABLE.H;
  const hgt = Math.max(0, b.z - ground);
  const r = Math.max(3, BALL_R * s * (1 + Math.max(0, b.z + 0.3) * 0.45));
  const x = cx + b.x * s;
  const y = cy + b.y * s;

  // shadow, cast down-right, fading with height
  c.fillStyle = `rgba(0, 0, 25, ${0.4 / (1 + hgt * 2.2)})`;
  c.beginPath();
  c.ellipse(x + hgt * s * 0.22, y + hgt * s * 0.35, r * (1 + hgt * 0.4), r * 0.8 * (1 + hgt * 0.4), 0, 0, Math.PI * 2);
  c.fill();

  // trail
  const tr = v.trail;
  for (let i = 0; i < tr.length; i++) {
    const a = (i + 1) / (tr.length + 1);
    c.fillStyle = `rgba(255, 245, 220, ${a * 0.22})`;
    c.beginPath();
    c.arc(cx + tr[i].x * s, cy + tr[i].y * s, r * (0.45 + a * 0.45), 0, Math.PI * 2);
    c.fill();
  }

  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.7, "#f3f1ea");
  g.addColorStop(1, "#c9c4b8");
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

export function draw(c, v, m) {
  const { s, cx, cy, dpr } = v;
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (v.layer) c.drawImage(v.layer, 0, 0);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  // serve indicator: pulsing ring under the server's paddle
  if (m.phase === "serve") {
    const p = m.paddles[m.server];
    const pulse = 0.5 + 0.5 * Math.sin(m.time * 6);
    c.strokeStyle = m.server === 0 ? `rgba(255, 209, 102, ${0.4 + pulse * 0.5})` : `rgba(107, 196, 255, ${0.4 + pulse * 0.5})`;
    c.lineWidth = Math.max(2, s * 0.014);
    c.beginPath();
    c.arc(cx + p.x * s, cy + p.y * s, PADDLE_R * s * (1.35 + pulse * 0.15), 0, Math.PI * 2);
    c.stroke();
  }

  drawPaddle(c, v, m.paddles[0], 0);
  drawPaddle(c, v, m.paddles[1], 1);

  // ball trail bookkeeping (only while the ball is in flight)
  const b = m.ball;
  if (m.phase === "live") {
    v.trail.push({ x: b.x, y: b.y });
    if (v.trail.length > 7) v.trail.shift();
  } else if (v.trail.length) v.trail.shift();
  if (m.phase !== "over") drawBall(c, v, b);

  for (const f of m.fx) {
    const k = f.t / f.life;
    const x = cx + f.x * s;
    const y = cy + f.y * s;
    c.globalAlpha = 1 - k;
    if (f.kind === "ring") {
      c.strokeStyle = f.color;
      c.lineWidth = Math.max(1.5, s * (f.big ? 0.02 : 0.01));
      c.beginPath();
      c.arc(x, y, s * (f.big ? 0.08 + k * 0.6 : 0.04 + k * 0.22), 0, Math.PI * 2);
      c.stroke();
    } else {
      c.fillStyle = f.color;
      c.beginPath();
      c.arc(x, y, Math.max(1.5, s * 0.014 * (1 - k * 0.5)), 0, Math.PI * 2);
      c.fill();
    }
  }
  c.globalAlpha = 1;
}
