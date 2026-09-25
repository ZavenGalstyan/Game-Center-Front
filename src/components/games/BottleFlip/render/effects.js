/**
 * Bottle Flip — small effects: particles, floating text, light burst.
 * Everything lives in world units; capped pools, no allocation per frame
 * beyond the occasional spawn.
 */
import { setWorld, setScreen, worldToScreen } from "./view.js";

const MAX = 90;

export function createFx() {
  return { parts: [], texts: [], bursts: [], shake: 0, shakeT: 0, flash: 0 };
}

/** Deterministic-looking spread without Math.random (keeps replays tidy). */
let seed = 1;
function rnd() {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

export function spawn(fx, kind, x, y, n, opts = {}) {
  for (let i = 0; i < n; i++) {
    if (fx.parts.length >= MAX) fx.parts.shift();
    const a = (opts.a0 ?? 0) + (opts.spread ?? Math.PI * 2) * rnd();
    const sp = (opts.speed ?? 60) * (0.5 + rnd() * 0.7);
    fx.parts.push({
      kind,
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0,
      max: (opts.life ?? 0.6) * (0.7 + rnd() * 0.6),
      size: (opts.size ?? 1.2) * (0.7 + rnd() * 0.6),
      color: opts.color || "#ffe08a",
      g: opts.g ?? 0,
      rot: rnd() * 6,
    });
  }
}

export function floatText(fx, text, x, y, opts = {}) {
  fx.texts.push({ text, x, y, t: 0, max: opts.max ?? 1.1, color: opts.color || "#ffffff", size: opts.size ?? 1, sub: opts.sub });
  if (fx.texts.length > 4) fx.texts.shift();
}

export function burst(fx, x, y, opts = {}) {
  fx.bursts.push({ x, y, t: 0, max: opts.max ?? 0.45, r: opts.r ?? 26, color: opts.color || "255,236,170" });
}

export function shake(fx, amount) {
  fx.shake = Math.max(fx.shake, amount);
  fx.shakeT = 0;
}

export function updateFx(fx, dt) {
  for (const p of fx.parts) {
    p.life += dt;
    p.vy -= p.g * dt;
    p.vx *= 1 - 1.6 * dt;
    p.vy *= 1 - 1.6 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += dt * 4;
  }
  fx.parts = fx.parts.filter((p) => p.life < p.max);
  for (const t of fx.texts) t.t += dt;
  fx.texts = fx.texts.filter((t) => t.t < t.max);
  for (const b of fx.bursts) b.t += dt;
  fx.bursts = fx.bursts.filter((b) => b.t < b.max);
  fx.shake *= Math.exp(-dt * 9);
  if (fx.shake < 0.05) fx.shake = 0;
  fx.flash = Math.max(0, fx.flash - dt * 3);
}

function star(ctx, x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const rr = i % 2 ? r * 0.38 : r;
    const a = rot + (i * Math.PI) / 4;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawFxWorld(ctx, v, fx) {
  setWorld(ctx, v, 1);
  for (const b of fx.bursts) {
    const k = b.t / b.max;
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * (0.4 + k));
    g.addColorStop(0, `rgba(${b.color},${0.55 * (1 - k)})`);
    g.addColorStop(1, `rgba(${b.color},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r * (0.4 + k), 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of fx.parts) {
    const k = 1 - p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = p.color;
    if (p.kind === "spark") star(ctx, p.x, p.y, p.size * (0.6 + 0.4 * k), p.rot);
    else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.kind === "dust" ? 1.4 - k * 0.4 : k * 0.8 + 0.2), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Floating labels are drawn in screen space so the text is never mirrored. */
export function drawFxText(ctx, v, fx, uiScale) {
  setScreen(ctx, v);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of fx.texts) {
    const k = t.t / t.max;
    const [sx, sy] = worldToScreen(v, t.x, t.y);
    const pop = k < 0.15 ? 0.7 + (k / 0.15) * 0.4 : k < 0.25 ? 1.1 - ((k - 0.15) / 0.1) * 0.1 : 1;
    const size = Math.round(20 * t.size * uiScale * pop);
    ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    const y = sy - k * 26 * uiScale;
    ctx.font = `900 ${size}px "Segoe UI", system-ui, sans-serif`;
    ctx.lineWidth = Math.max(3, size * 0.18);
    ctx.strokeStyle = "rgba(20,24,40,0.55)";
    ctx.strokeText(t.text, sx, y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, sx, y);
    if (t.sub) {
      ctx.font = `800 ${Math.round(size * 0.5)}px "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = Math.max(2, size * 0.1);
      ctx.strokeText(t.sub, sx, y + size * 0.72);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(t.sub, sx, y + size * 0.72);
    }
  }
  ctx.globalAlpha = 1;
}
