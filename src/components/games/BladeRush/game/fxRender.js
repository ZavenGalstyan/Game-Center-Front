/**
 * Blade Rush — particles + target-break fragments. Lightweight: no pooling
 * needed at these counts (a handful of particles per hit, 9 fragments per
 * break), but nothing here allocates beyond a `save/restore` per shape.
 */
import { PARTICLE_COLORS } from "../data/targets.js";

export function drawParticles(ctx, particles, cx, cy, material, quality) {
  const colors = PARTICLE_COLORS[material] || PARTICLE_COLORS.wood;
  const max = quality === "low" ? 4 : particles.length;
  for (let i = 0; i < particles.length && i < max; i++) {
    const p = particles[i];
    const life = Math.max(0, p.life / p.maxLife);
    const x = cx + Math.cos(p.angle) * p.r + p.drift * p.r * 0.3;
    const y = cy + Math.sin(p.angle) * p.r;
    ctx.save();
    ctx.globalAlpha = life;
    ctx.translate(x, y);
    ctx.rotate(p.angle);
    const color = colors[i % colors.length];
    if (p.kind === "spark" || p.kind === "metal-spark") {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-4 * life - 2, 0);
      ctx.lineTo(4 * life + 2, 0);
      ctx.stroke();
    } else if (p.kind === "ice-shard") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -3); ctx.lineTo(2.5, 2); ctx.lineTo(-2.5, 2);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === "crystal-shard") {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -3.5); ctx.lineTo(2.2, 0); ctx.lineTo(0, 3.5); ctx.lineTo(-2.2, 0);
      ctx.closePath();
      ctx.fill();
    } else if (p.kind === "stone-chip") {
      ctx.fillStyle = color;
      ctx.fillRect(-2, -2, 4, 4);
    } else {
      // wood-chip
      ctx.fillStyle = color;
      ctx.fillRect(-2.5, -1.5, 5, 3);
    }
    ctx.restore();
  }
}

export function drawFragments(ctx, fragments, cx, cy, radius, target) {
  for (const f of fragments) {
    const life = Math.max(0, f.life / f.maxLife);
    ctx.save();
    ctx.globalAlpha = life;
    ctx.translate(cx + f.x, cy + f.y);
    ctx.rotate(f.rot);
    const grad = ctx.createLinearGradient(0, -radius * 0.2, 0, radius * 0.2);
    grad.addColorStop(0, target.base[0]);
    grad.addColorStop(1, target.base[1]);
    ctx.fillStyle = grad;
    const s = radius * 0.32 * f.scale;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.85, s * 0.2);
    ctx.lineTo(-s * 0.7, s * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = target.rim;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
}

export function drawShard(ctx, x, y, t, collected, color = "#ffd76a") {
  if (collected) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 1.6);
  const s = 6 + Math.sin(t * 4) * 1.2;
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.8);
  grad.addColorStop(0, "#fff6da");
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, "rgba(217,165,60,0)");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, s * 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff6da";
  ctx.beginPath();
  ctx.moveTo(0, -s); ctx.lineTo(s * 0.7, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.7, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
