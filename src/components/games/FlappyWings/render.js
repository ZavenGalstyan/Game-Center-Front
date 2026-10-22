/**
 * Flappy Wings canvas renderer. Draws one frame of engine state in world
 * units (the caller sets the world→pixel transform). Parallax layers scroll
 * at fractions of `s.scroll`: hills 0.12, clouds 0.25, bushes 0.5, pipes and
 * ground 1.
 */
import { H, PLAY_H, GROUND_H, BIRD_R, PIPE_W, CAP_H, CAP_LIP, birdX } from "./engine.js";

const CLOUD_PERIOD = 1500;
const CLOUDS = [
  { x: 80, y: 90, s: 1.1 },
  { x: 430, y: 150, s: 0.75 },
  { x: 720, y: 70, s: 0.95 },
  { x: 1050, y: 175, s: 0.7 },
  { x: 1280, y: 110, s: 1.25 },
];

let skyCache = null;
function sky(ctx, W) {
  if (!skyCache || skyCache.ctx !== ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, PLAY_H);
    g.addColorStop(0, "#3fb4f2");
    g.addColorStop(0.55, "#8fd6fb");
    g.addColorStop(1, "#d9f3ff");
    skyCache = { ctx, g };
  }
  ctx.fillStyle = skyCache.g;
  ctx.fillRect(0, 0, W, PLAY_H);
  const sun = ctx.createRadialGradient(W * 0.8, 105, 10, W * 0.8, 105, 120);
  sun.addColorStop(0, "rgba(255,250,220,0.95)");
  sun.addColorStop(0.25, "rgba(255,244,190,0.55)");
  sun.addColorStop(1, "rgba(255,244,190,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(W * 0.8 - 120, 0, 240, 230);
}

function ridge(ctx, W, off, base, amp, color, f1, f2) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, PLAY_H);
  for (let x = 0; x <= W + 16; x += 16) {
    const u = x + off;
    ctx.lineTo(x, base - Math.sin(u * f1) * amp - Math.sin(u * f2 + 1.7) * amp * 0.55);
  }
  ctx.lineTo(W + 16, PLAY_H);
  ctx.closePath();
  ctx.fill();
}

function cloud(ctx, x, y, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.fillStyle = "rgba(120,170,210,0.25)";
  puffs(ctx, 4);
  ctx.fillStyle = "#ffffff";
  puffs(ctx, 0);
  ctx.restore();
}
function puffs(ctx, dy) {
  ctx.beginPath();
  ctx.arc(-38, 8 + dy, 22, 0, Math.PI * 2);
  ctx.arc(-10, -6 + dy, 30, 0, Math.PI * 2);
  ctx.arc(24, 0 + dy, 26, 0, Math.PI * 2);
  ctx.arc(48, 12 + dy, 17, 0, Math.PI * 2);
  ctx.rect(-38, 8 + dy, 86, 22);
  ctx.fill();
}

function bushes(ctx, W, off) {
  const period = 70;
  const start = -((off % period) + period) % period - period;
  ctx.fillStyle = "#5cb85a";
  ctx.beginPath();
  for (let x = start; x < W + period; x += period) {
    const i = Math.round((x + off) / period);
    const r = 26 + ((i * 37) % 13);
    ctx.moveTo(x + r, PLAY_H - 6);
    ctx.arc(x, PLAY_H - 6, r, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.fillStyle = "#73cc6a";
  ctx.beginPath();
  for (let x = start; x < W + period; x += period) {
    const i = Math.round((x + off) / period);
    const r = 16 + ((i * 23) % 9);
    ctx.moveTo(x + 12 + r, PLAY_H - 18);
    ctx.arc(x + 12, PLAY_H - 18, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

function pipeBody(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, "#3c9a2c");
  g.addColorStop(0.22, "#9ee86d");
  g.addColorStop(0.45, "#63c84a");
  g.addColorStop(1, "#2f7f22");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#1f5a17";
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);
}

function pipes(ctx, s) {
  for (const p of s.pipes) {
    const top = p.cy - p.gap / 2;
    const bot = p.cy + p.gap / 2;
    pipeBody(ctx, p.x, -10, PIPE_W, top - CAP_H + 10);
    pipeBody(ctx, p.x, bot + CAP_H, PIPE_W, PLAY_H - bot - CAP_H + 4);
    pipeBody(ctx, p.x - CAP_LIP, top - CAP_H, PIPE_W + CAP_LIP * 2, CAP_H);
    pipeBody(ctx, p.x - CAP_LIP, bot, PIPE_W + CAP_LIP * 2, CAP_H);
    // shadow under the caps
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.fillRect(p.x + 1.5, top - CAP_H - 8, PIPE_W - 3, 8);
    ctx.fillRect(p.x + 1.5, bot + CAP_H, PIPE_W - 3, 8);
  }
}

function ground(ctx, W, off) {
  ctx.fillStyle = "#ded08f";
  ctx.fillRect(0, PLAY_H, W, GROUND_H);
  // scrolling diagonal stripes
  const p = 28;
  const shift = off % p;
  ctx.fillStyle = "#d2c07a";
  ctx.beginPath();
  for (let x = -shift - p; x < W + p; x += p) {
    ctx.moveTo(x, PLAY_H + 22);
    ctx.lineTo(x + 14, PLAY_H + 22);
    ctx.lineTo(x + 14 - 18, H);
    ctx.lineTo(x - 18, H);
  }
  ctx.fill();
  // grass lip
  ctx.fillStyle = "#7ed957";
  ctx.fillRect(0, PLAY_H, W, 16);
  ctx.fillStyle = "#64c043";
  for (let x = -shift - p; x < W + p; x += p) ctx.fillRect(x, PLAY_H + 4, 14, 12);
  ctx.fillStyle = "#4e9a34";
  ctx.fillRect(0, PLAY_H + 16, W, 5);
  ctx.fillStyle = "#3f7f2a";
  ctx.fillRect(0, PLAY_H - 2, W, 3);
}

function bird(ctx, s) {
  const b = s.bird;
  ctx.save();
  ctx.translate(birdX(s), b.y);
  ctx.rotate(b.rot);
  const r = BIRD_R;
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "#7a4a00";
  // tail
  ctx.fillStyle = "#f4a200";
  ctx.beginPath();
  ctx.moveTo(-r * 0.9, -2);
  ctx.lineTo(-r * 1.65, -r * 0.55);
  ctx.lineTo(-r * 1.45, 1);
  ctx.lineTo(-r * 1.65, r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // body
  const body = ctx.createRadialGradient(-4, -6, 2, 0, 0, r * 1.4);
  body.addColorStop(0, "#fff27a");
  body.addColorStop(0.6, "#ffd23f");
  body.addColorStop(1, "#f2a900");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.18, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // belly
  ctx.fillStyle = "#fff6c8";
  ctx.beginPath();
  ctx.ellipse(2, r * 0.42, r * 0.72, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  // beak
  ctx.fillStyle = "#ff7a1a";
  ctx.beginPath();
  ctx.moveTo(r * 0.9, -4);
  ctx.quadraticCurveTo(r * 1.75, -2, r * 1.65, 2);
  ctx.lineTo(r * 0.92, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#e85d0c";
  ctx.beginPath();
  ctx.moveTo(r * 0.92, 3);
  ctx.lineTo(r * 1.5, 4);
  ctx.lineTo(r * 0.95, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // eye
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(r * 0.5, -r * 0.38, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#1b1b2f";
  ctx.beginPath();
  ctx.arc(r * 0.62, -r * 0.36, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(r * 0.68, -r * 0.44, r * 0.06, 0, Math.PI * 2);
  ctx.fill();
  // cheek
  ctx.fillStyle = "rgba(255,120,90,0.45)";
  ctx.beginPath();
  ctx.ellipse(r * 0.42, r * 0.12, 4, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // wing: hinged at the shoulder, flapping
  const flapA = s.phase === "over" ? 0.3 : Math.sin(b.wing) * 0.75;
  ctx.save();
  ctx.translate(-r * 0.25, 1);
  ctx.rotate(flapA);
  ctx.fillStyle = "#ffbf1f";
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, 0, r * 0.7, r * 0.4, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(122,74,0,0.45)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-r * 0.75, 1);
  ctx.lineTo(-r * 0.15, 0);
  ctx.moveTo(-r * 0.65, 5);
  ctx.lineTo(-r * 0.2, 4);
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function outlinedText(ctx, text, x, y, size, fill = "#fff") {
  ctx.font = `900 ${size}px "Nunito", "Segoe UI Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = "#173a5c";
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function hud(ctx, s, W) {
  if (s.phase === "playing" || s.phase === "paused" || (s.phase === "over" && s.time - s.overAt < 0.6)) {
    const k = 1 + s.bump * 0.35;
    ctx.save();
    ctx.translate(W / 2, 78);
    ctx.scale(k, k);
    outlinedText(ctx, String(s.score), 0, 0, 64);
    ctx.restore();
  }
  for (const p of s.pops) {
    ctx.globalAlpha = 1 - p.t / 0.8;
    outlinedText(ctx, "+1", p.x, p.y - p.t * 50, 28, "#ffe066");
  }
  ctx.globalAlpha = 1;
  if (s.phase === "countdown") {
    const n = Math.ceil(s.countdown);
    const f = s.countdown - Math.floor(s.countdown); // 1 → 0 within each second
    ctx.save();
    ctx.globalAlpha = Math.min(1, f * 3);
    ctx.translate(W / 2, PLAY_H * 0.3);
    ctx.scale(0.7 + f * 0.6, 0.7 + f * 0.6);
    outlinedText(ctx, String(n), 0, 0, 110, "#ffe066");
    ctx.restore();
  }
}

export function draw(ctx, s) {
  const W = s.W;
  sky(ctx, W);
  const sc = s.scroll;
  ridge(ctx, W, sc * 0.12, PLAY_H - 120, 34, "#a8dccd", 0.006, 0.017);
  for (const c of CLOUDS) {
    const x = ((((c.x - sc * 0.25) % CLOUD_PERIOD) + CLOUD_PERIOD) % CLOUD_PERIOD) - 120;
    if (x < W + 120) cloud(ctx, x, c.y, c.s);
    if (x + CLOUD_PERIOD < W + 120) cloud(ctx, x + CLOUD_PERIOD, c.y, c.s);
  }
  ridge(ctx, W, sc * 0.3, PLAY_H - 50, 22, "#86cfa0", 0.011, 0.027);
  bushes(ctx, W, sc * 0.5);
  pipes(ctx, s);
  ground(ctx, W, sc);
  bird(ctx, s);
  hud(ctx, s, W);
  if (s.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${s.flash * 0.75})`;
    ctx.fillRect(0, 0, W, H);
  }
}
