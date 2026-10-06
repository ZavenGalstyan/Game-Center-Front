/**
 * Color Platforms — fixed-size particle pool (no per-frame allocation).
 * Kinds: 0 dot · 1 ring · 2 sparkle (4-point) · 3 heart · 4 bubble
 */
const TAU = Math.PI * 2;
const MAX = 200;

export class Particles {
  constructor() {
    this.pool = [];
    for (let i = 0; i < MAX; i++) this.pool.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 0, max: 1, size: 2, color: "#fff", kind: 0, drag: 0 });
    this.scale = 1; // particle budget multiplier (settings)
  }

  clear() {
    for (const p of this.pool) p.on = false;
  }

  spawn(x, y, vx, vy, life, size, color, kind = 0, g = 0, drag = 0) {
    for (const p of this.pool) {
      if (p.on) continue;
      p.on = true;
      p.x = x;
      p.y = y;
      p.vx = vx;
      p.vy = vy;
      p.life = life;
      p.max = life;
      p.size = size;
      p.color = color;
      p.kind = kind;
      p.g = g;
      p.drag = drag;
      return p;
    }
    return null;
  }

  /** Burst helper with budget scaling: n is the NORMAL count. */
  burst(n, x, y, opts) {
    const count = Math.max(opts.min ?? 1, Math.round(n * this.scale));
    const { speed = 120, spread = TAU, angle = 0, life = 0.5, size = 2.5, color = "#fff", kind = 0, g = 0, drag = 2, jitter = 0 } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + (spread >= TAU ? (i / count) * TAU + Math.sin(i * 12.9898) * 0.4 : (Math.sin(i * 78.233) * 0.5) * spread);
      const sp = speed * (0.6 + 0.4 * Math.abs(Math.sin(i * 3.7 + x)));
      this.spawn(x + Math.sin(i * 5.1) * jitter, y + Math.cos(i * 4.3) * jitter, Math.cos(a) * sp, Math.sin(a) * sp, life * (0.75 + 0.25 * Math.abs(Math.sin(i * 1.3))), size, color, kind, g, drag);
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.on = false;
        continue;
      }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx) {
    for (const p of this.pool) {
      if (!p.on) continue;
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.6);
      if (p.kind === 1) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2.4 * k + 0.4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - k) + 4, 0, TAU);
        ctx.stroke();
      } else if (p.kind === 2) {
        const s = p.size * (0.5 + k * 0.5);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - s * 1.6);
        ctx.lineTo(p.x + s * 0.4, p.y - s * 0.4);
        ctx.lineTo(p.x + s * 1.6, p.y);
        ctx.lineTo(p.x + s * 0.4, p.y + s * 0.4);
        ctx.lineTo(p.x, p.y + s * 1.6);
        ctx.lineTo(p.x - s * 0.4, p.y + s * 0.4);
        ctx.lineTo(p.x - s * 1.6, p.y);
        ctx.lineTo(p.x - s * 0.4, p.y - s * 0.4);
        ctx.closePath();
        ctx.fill();
      } else if (p.kind === 3) {
        const s = p.size;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y + s);
        ctx.bezierCurveTo(p.x - s * 1.6, p.y - s * 0.2, p.x - s * 0.6, p.y - s * 1.4, p.x, p.y - s * 0.4);
        ctx.bezierCurveTo(p.x + s * 0.6, p.y - s * 1.4, p.x + s * 1.6, p.y - s * 0.2, p.x, p.y + s);
        ctx.fill();
      } else if (p.kind === 4) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
