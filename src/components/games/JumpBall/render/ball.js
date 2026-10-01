/**
 * Jump Ball — ball painter. Screen-space, pixels.
 *
 * Layers (bottom → top):
 *   1. base sphere gradient (light key from upper-left)
 *   2. surface pattern, ROTATED by the ball's spin so rolling is visible
 *   3. fixed shading: terminator falloff, environment rim light, specular
 * Squash/stretch is applied as a non-uniform scale pivoting on the contact
 * point (bottom), so a squash never pushes the ball into the platform.
 */

const TAU = Math.PI * 2;

function pattern(ctx, r, skin) {
  const c = skin.band;
  ctx.fillStyle = c;
  ctx.strokeStyle = c;
  switch (skin.pattern) {
    case "band": {
      // curved band — two arcs of a larger circle read as a great circle on a sphere
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.02, r * 0.2, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha *= 0.6;
      ctx.beginPath();
      ctx.arc(0, -r * 0.62, r * 0.12, 0, TAU);
      ctx.fill();
      break;
    }
    case "dual": {
      ctx.beginPath();
      ctx.ellipse(0, -r * 0.3, r * 0.98, r * 0.1, 0, 0, TAU);
      ctx.ellipse(0, r * 0.3, r * 0.98, r * 0.1, 0, 0, TAU);
      ctx.fill();
      break;
    }
    case "wave": {
      ctx.lineWidth = r * 0.16;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = -10; i <= 10; i++) {
        const x = (i / 10) * r;
        const y = Math.sin((i / 10) * Math.PI * 2) * r * 0.22;
        if (i === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      break;
    }
    case "dots": {
      const pts = [
        [0, 0, 0.22],
        [0.55, -0.35, 0.14],
        [-0.5, 0.42, 0.15],
        [-0.45, -0.5, 0.11],
        [0.5, 0.48, 0.12],
      ];
      for (const [x, y, s] of pts) {
        ctx.beginPath();
        ctx.arc(x * r, y * r, s * r, 0, TAU);
        ctx.fill();
      }
      break;
    }
    case "ring": {
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.52, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.14, 0, TAU);
      ctx.fill();
      break;
    }
    case "star": {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = (i % 2 ? 0.26 : 0.6) * r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "galaxy": {
      ctx.globalAlpha *= 0.55;
      ctx.lineWidth = r * 0.1;
      ctx.lineCap = "round";
      for (let k = 0; k < 2; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const a = k * Math.PI + i * 0.22;
          const rr = r * (0.08 + i * 0.034);
          const x = Math.cos(a) * rr;
          const y = Math.sin(a) * rr * 0.8;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha /= 0.55;
      const specks = [
        [0.5, -0.3],
        [-0.6, 0.2],
        [0.2, 0.6],
        [-0.25, -0.62],
        [0.68, 0.3],
        [-0.1, 0.3],
      ];
      for (const [x, y] of specks) {
        ctx.beginPath();
        ctx.arc(x * r, y * r, r * 0.05, 0, TAU);
        ctx.fill();
      }
      break;
    }
    default:
      break;
  }
}

/**
 * o: { x, y (screen centre, px), r (px), rot, sx, sy, skin, rim (css colour),
 *      alpha, glow (0..1), quality }
 */
export function drawBall(ctx, o) {
  const { x, y, r, rot = 0, sx = 1, sy = 1, skin, rim = "#bfe6ff", alpha = 1, glow = 0, quality = "medium" } = o;
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  // pivot on the contact point so squash stays on the surface
  ctx.translate(x, y + r);
  ctx.scale(sx, sy);
  ctx.translate(0, -r);

  if (glow > 0.01) {
    const g = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.1);
    g.addColorStop(0, `rgba(255,240,180,${0.5 * glow})`);
    g.addColorStop(1, "rgba(255,240,180,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.1, 0, TAU);
    ctx.fill();
  }

  // 1. base sphere
  const base = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.08, 0, 0, r * 1.02);
  base.addColorStop(0, skin.light);
  base.addColorStop(0.55, skin.base);
  base.addColorStop(1, skin.dark);
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  // 2. rotating surface pattern, clipped to the sphere
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.995, 0, TAU);
  ctx.clip();
  ctx.rotate(rot);
  ctx.globalAlpha = alpha * 0.92;
  pattern(ctx, r, skin);
  ctx.restore();

  // 3a. terminator — the far side falls into shadow over the pattern too
  const shade = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.35, -r * 0.1, -r * 0.1, r * 1.25);
  shade.addColorStop(0, "rgba(0,0,0,0)");
  shade.addColorStop(0.62, "rgba(10,10,30,0.08)");
  shade.addColorStop(1, "rgba(10,10,40,0.5)");
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  // 3b. environment rim light (bounce light from the sky / world)
  if (quality !== "low") {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.clip();
    ctx.globalAlpha = alpha * 0.55;
    ctx.strokeStyle = rim;
    ctx.lineWidth = r * 0.22;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.98, Math.PI * 0.05, Math.PI * 0.62);
    ctx.stroke();
    ctx.restore();
  }

  // 3c. specular: soft lobe + small hard hot-spot (subtle reflection)
  const spec = ctx.createRadialGradient(-r * 0.36, -r * 0.44, 0, -r * 0.36, -r * 0.44, r * 0.5);
  spec.addColorStop(0, "rgba(255,255,255,0.75)");
  spec.addColorStop(0.35, "rgba(255,255,255,0.28)");
  spec.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, -r * 0.5, r * 0.13, r * 0.08, -0.6, 0, TAU);
  ctx.fill();

  // crisp edge
  ctx.strokeStyle = "rgba(20,10,30,0.28)";
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

/** Soft contact shadow on a surface below the ball. */
export function drawBallShadow(ctx, x, y, r, k, alpha = 1) {
  // k: 1 = touching, 0 = far away
  if (k <= 0.02) return;
  const w = r * (0.55 + 0.6 * k);
  const h = Math.max(2, r * 0.22 * (0.5 + 0.5 * k));
  ctx.save();
  ctx.globalAlpha = alpha * (0.12 + 0.34 * k);
  const g = ctx.createRadialGradient(x, y, 0, x, y, w);
  g.addColorStop(0, "rgba(20,15,40,0.9)");
  g.addColorStop(1, "rgba(20,15,40,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, w, h, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}
