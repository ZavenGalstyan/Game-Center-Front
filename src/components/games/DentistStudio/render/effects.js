/**
 * Dentist Studio — lightweight particles, in WORLD units (they zoom with the
 * camera). A fixed-size pool; "particles" setting off → only essential
 * feedback (sparkles on a finished tooth) is kept.
 */

const MAX = 320;

export class Effects {
  constructor() {
    this.list = [];
  }

  clear() {
    this.list.length = 0;
  }

  add(p) {
    if (this.list.length >= MAX) this.list.shift();
    this.list.push({ age: 0, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6, g: 0, drag: 1.5, ...p });
  }

  burst(type, x, y, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread ?? 1.2) : Math.random() * Math.PI * 2;
      const sp = (o.speed || 60) * (0.4 + Math.random() * 0.8);
      this.add({ type, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: (o.life || 0.6) * (0.7 + Math.random() * 0.6), r: (o.r || 2) * (0.7 + Math.random() * 0.6), g: o.g ?? 0, drag: o.drag ?? 1.5, tx: o.tx, ty: o.ty, color: o.color });
    }
  }

  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) {
        L.splice(i, 1);
        continue;
      }
      if (p.tx != null) {
        // homing (suction pulls, fly-to-pool chips)
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        p.vx += dx * 14 * dt;
        p.vy += dy * 14 * dt;
        p.vx *= 1 - Math.min(1, 6 * dt);
        p.vy *= 1 - Math.min(1, 6 * dt);
        if (dx * dx + dy * dy < 16) p.age = p.life;
      } else {
        p.vy += p.g * dt;
        p.vx *= 1 - Math.min(1, p.drag * dt);
        p.vy *= 1 - Math.min(1, p.drag * dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }

  draw(ctx) {
    for (const p of this.list) {
      const t = p.age / p.life;
      const a = 1 - t;
      switch (p.type) {
        case "drop":
          ctx.fillStyle = `rgba(190, 228, 250, ${0.9 * a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(255,255,255,${0.9 * a})`;
          ctx.beginPath();
          ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.35, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "mist":
          ctx.fillStyle = `rgba(230, 245, 255, ${0.35 * a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (1 + t), 0, Math.PI * 2);
          ctx.fill();
          break;
        case "bubble":
          ctx.fillStyle = `rgba(255,255,255,${0.95 * a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(180, 208, 230, ${0.7 * a})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
          break;
        case "fleck":
        case "chip": {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color || (p.type === "chip" ? "#d9ccb0" : "#ecd490");
          ctx.globalAlpha = Math.min(1, a * 1.5);
          ctx.beginPath();
          ctx.moveTo(-p.r, -p.r * 0.4);
          ctx.lineTo(p.r * 0.2, -p.r * 0.8);
          ctx.lineTo(p.r, p.r * 0.2);
          ctx.lineTo(-p.r * 0.3, p.r * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case "dust":
          ctx.fillStyle = `rgba(214, 222, 232, ${0.8 * a})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
          break;
        case "sparkle": {
          const s = p.r * Math.sin(Math.PI * Math.min(1, t * 1.2));
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * 0.2);
          ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const rr = i % 2 ? s * 0.26 : s;
            const ang = (i * Math.PI) / 4;
            ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = `rgba(160, 230, 255, ${0.5 * a})`;
          ctx.beginPath();
          ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case "glint":
          ctx.strokeStyle = `rgba(255,255,255,${a})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(p.x - p.r, p.y);
          ctx.lineTo(p.x + p.r, p.y);
          ctx.moveTo(p.x, p.y - p.r);
          ctx.lineTo(p.x, p.y + p.r);
          ctx.stroke();
          break;
        case "ring":
          ctx.strokeStyle = `rgba(120, 220, 255, ${0.8 * a})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (0.4 + t), 0, Math.PI * 2);
          ctx.stroke();
          break;
        default:
          break;
      }
    }
  }
}

/** A thin water stream with a slight wobble from nozzle to target. */
export function drawStream(ctx, x0, y0, x1, y1, time, k) {
  const mx = (x0 + x1) / 2 + Math.sin(time * 40) * 1.2;
  const my = (y0 + y1) / 2 - 6 * k;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(170, 220, 250, 0.55)";
  ctx.lineWidth = 5 * k;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo(mx, my, x1, y1);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 1.6 * k;
  ctx.stroke();
  ctx.fillStyle = "rgba(220, 242, 255, 0.5)";
  ctx.beginPath();
  ctx.ellipse(x1, y1, 9 * k, 5 * k, 0, 0, Math.PI * 2);
  ctx.fill();
}
