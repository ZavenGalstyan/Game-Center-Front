/**
 * Car Wash Studio — lightweight particles + spray streams (screen space).
 *
 * Hard-capped by graphics quality; nothing here affects cleaning state — the
 * brush engine already did the real work at the exact pointer position. These
 * only make the water, foam and dust readable and satisfying.
 */

const CAP = { low: 70, medium: 170, high: 320 };

export class Effects {
  constructor() {
    this.p = [];
    this.quality = "medium";
    this.enabled = true;
  }

  clear() {
    this.p.length = 0;
  }

  add(o) {
    if (!this.enabled) return;
    const cap = CAP[this.quality] || 170;
    if (this.p.length >= cap) this.p.shift();
    o.age = 0;
    this.p.push(o);
  }

  burst(type, x, y, n, opts = {}) {
    if (!this.enabled) return;
    const mul = this.quality === "low" ? 0.45 : this.quality === "high" ? 1.3 : 1;
    const count = Math.max(1, Math.round(n * mul));
    for (let i = 0; i < count; i++) {
      const a = (opts.dir ?? -Math.PI / 2) + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 1.4);
      const sp = (opts.speed ?? 180) * (0.4 + Math.random() * 0.8);
      this.add({
        type, x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        r: (opts.r ?? 2) * (0.6 + Math.random() * 0.8),
        life: (opts.life ?? 0.6) * (0.7 + Math.random() * 0.6),
        g: opts.g ?? 900,
        color: opts.color,
      });
    }
  }

  update(dt) {
    const out = [];
    for (const q of this.p) {
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vy += (q.g || 0) * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      if (q.type === "drip") {
        q.vy = Math.min(q.vy, q.maxV || 30);
      }
      out.push(q);
    }
    this.p = out;
  }

  draw(ctx) {
    for (const q of this.p) {
      const t = q.age / q.life;
      const a = 1 - t;
      switch (q.type) {
        case "drop":
          ctx.fillStyle = `rgba(215,236,255,${0.75 * a})`;
          ctx.beginPath();
          ctx.ellipse(q.x, q.y, q.r * 0.8, q.r * 1.2, Math.atan2(q.vy, q.vx) + Math.PI / 2, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "mist": {
          const r = q.r * (1 + t * 2.2);
          const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
          g.addColorStop(0, `rgba(235,245,255,${0.28 * a})`);
          g.addColorStop(1, "rgba(235,245,255,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case "foam":
          ctx.fillStyle = `rgba(252,252,250,${0.9 * a})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(200,210,220,${0.6 * a})`;
          ctx.beginPath();
          ctx.arc(q.x + q.r * 0.3, q.y + q.r * 0.3, q.r * 0.45, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "suds":
          ctx.strokeStyle = `rgba(${q.color || "235,228,210"},${0.8 * a})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case "drip": {
          const la = Math.min(1, (1 - t) * 3);
          ctx.fillStyle = q.water ? `rgba(220,238,255,${0.55 * la})` : `rgba(250,250,248,${0.92 * la})`;
          ctx.beginPath();
          ctx.ellipse(q.x, q.y, q.r, q.r * (q.water ? 1.6 : 2.4), 0, 0, Math.PI * 2);
          ctx.fill();
          if (!q.water) {
            ctx.fillRect(q.x - q.r * 0.45, q.y - q.r * 5, q.r * 0.9, q.r * 5);
          }
          break;
        }
        case "dust":
          ctx.fillStyle = `rgba(${q.color || "170,160,140"},${0.45 * a})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r * (1 + t), 0, Math.PI * 2);
          ctx.fill();
          break;
        case "spark": {
          const s = q.r * Math.sin(Math.PI * t);
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(t * 0.8);
          ctx.fillStyle = `rgba(255,255,255,${0.95 * Math.sin(Math.PI * t)})`;
          ctx.beginPath();
          ctx.moveTo(0, -s * 2.4);
          ctx.lineTo(s * 0.35, -s * 0.35);
          ctx.lineTo(s * 2.4, 0);
          ctx.lineTo(s * 0.35, s * 0.35);
          ctx.lineTo(0, s * 2.4);
          ctx.lineTo(-s * 0.35, s * 0.35);
          ctx.lineTo(-s * 2.4, 0);
          ctx.lineTo(-s * 0.35, -s * 0.35);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case "crumb":
          ctx.fillStyle = `rgba(${q.color},${a})`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.r * a, 0, Math.PI * 2);
          ctx.fill();
          break;
        default:
          break;
      }
    }
  }
}

/** Water / foam / mist stream from a nozzle to the impact point. */
export function drawStream(ctx, kind, nx, ny, ix, iy, t, strength = 1) {
  const dx = ix - nx;
  const dy = iy - ny;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;
  ctx.save();
  if (kind === "water") {
    const spread = 22;
    const g = ctx.createLinearGradient(nx, ny, ix, iy);
    g.addColorStop(0, "rgba(220,240,255,0.55)");
    g.addColorStop(1, "rgba(220,240,255,0.12)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(nx + px * 2, ny + py * 2);
    ctx.lineTo(ix + px * spread, iy + py * spread);
    ctx.lineTo(ix - px * spread, iy - py * spread);
    ctx.lineTo(nx - px * 2, ny - py * 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(240,250,255,0.5)";
    ctx.lineWidth = 1;
    for (let k = -2; k <= 2; k++) {
      const j = Math.sin(t * 40 + k * 1.7) * 3;
      ctx.beginPath();
      ctx.moveTo(nx, ny);
      ctx.lineTo(ix + px * (k * spread * 0.4 + j), iy + py * (k * spread * 0.4 + j));
      ctx.stroke();
    }
  } else if (kind === "jet") {
    const w = 2.2 + Math.sin(t * 60) * 0.5;
    ctx.strokeStyle = "rgba(200,230,255,0.35)";
    ctx.lineWidth = w * 3.2;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(ix, iy);
    ctx.stroke();
    ctx.strokeStyle = "rgba(250,253,255,0.95)";
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(ix, iy);
    ctx.stroke();
    // impact bloom
    const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, 26 * strength);
    g.addColorStop(0, "rgba(255,255,255,0.75)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ix, iy, 26 * strength, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "foam") {
    const spread = 30;
    const g = ctx.createLinearGradient(nx, ny, ix, iy);
    g.addColorStop(0, "rgba(255,255,255,0.8)");
    g.addColorStop(1, "rgba(255,255,255,0.35)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(nx + px * 5, ny + py * 5);
    ctx.quadraticCurveTo((nx + ix) / 2 + px * spread * 0.7, (ny + iy) / 2 + py * spread * 0.7, ix + px * spread, iy + py * spread);
    ctx.lineTo(ix - px * spread, iy - py * spread);
    ctx.quadraticCurveTo((nx + ix) / 2 - px * spread * 0.7, (ny + iy) / 2 - py * spread * 0.7, nx - px * 5, ny - py * 5);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "mist") {
    const spread = 26;
    const g = ctx.createLinearGradient(nx, ny, ix, iy);
    g.addColorStop(0, "rgba(235,245,255,0.45)");
    g.addColorStop(1, "rgba(235,245,255,0.05)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(ix + px * spread, iy + py * spread);
    ctx.lineTo(ix - px * spread, iy - py * spread);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** One soft diagonal light sweep across the finished car (completion). */
export function drawLightSweep(ctx, box, t) {
  if (t <= 0 || t >= 1) return;
  const x = box.x0 - box.w * 0.3 + (box.w * 1.6) * t;
  ctx.save();
  const g = ctx.createLinearGradient(x - box.w * 0.12, 0, x + box.w * 0.12, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.28)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(box.x0, box.y0, box.w, box.h);
  ctx.restore();
}
