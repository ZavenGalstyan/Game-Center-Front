/**
 * Blade Rush — procedural blade rendering. One shape, reused for the
 * waiting blade, the flying blade, every embedded blade, the Blades-screen
 * preview and the Main Menu showcase; only the two endpoints (tip,
 * handle-butt) and the skin's colors change. Every skin uses this exact
 * geometry — see data/blades.js — so no skin is ever easier or harder to
 * land than another, only prettier.
 *
 * Proportions: ~64% blade / ~36% handle, long and slim (a throwing knife,
 * not a sword) — see bladeGeometry() for how that maps onto the target.
 */
const BLADE_FRACTION = 0.64;

export function drawBlade(ctx, { tipX, tipY, handleX, handleY, width, skin, quality = "high", glow = 0 }) {
  const dx = handleX - tipX;
  const dy = handleY - tipY;
  const len = Math.hypot(dx, dy) || 1;
  const angle = Math.atan2(dy, dx);
  const bladeLen = len * BLADE_FRACTION;
  const handleLen = len - bladeLen;
  const w = width;

  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angle);

  // drop shadow (subtle, only at higher quality)
  if (quality !== "low") {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.lineTo(bladeLen + 2, w * 0.5 + 2);
    ctx.lineTo(len + 2, w * 0.36 + 2);
    ctx.lineTo(len + 2, -w * 0.36 + 2);
    ctx.lineTo(bladeLen + 2, -w * 0.5 + 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // metal blade — long tapered profile: fine tip, full width at the guard
  const metalGrad = ctx.createLinearGradient(0, -w * 0.5, 0, w * 0.5);
  metalGrad.addColorStop(0, skin.edge);
  metalGrad.addColorStop(0.42, skin.metal[0]);
  metalGrad.addColorStop(1, skin.metal[1]);
  ctx.fillStyle = metalGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(bladeLen * 0.22, -w * 0.3);
  ctx.lineTo(bladeLen * 0.62, -w * 0.5);
  ctx.lineTo(bladeLen, -w * 0.46);
  ctx.lineTo(bladeLen, w * 0.46);
  ctx.lineTo(bladeLen * 0.62, w * 0.5);
  ctx.lineTo(bladeLen * 0.22, w * 0.3);
  ctx.closePath();
  ctx.fill();

  // darker spine down the centerline (reads as a fuller/ground blade)
  ctx.strokeStyle = skin.spine || skin.metal[1];
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(0.7, w * 0.09);
  ctx.beginPath();
  ctx.moveTo(bladeLen * 0.06, 0);
  ctx.lineTo(bladeLen * 0.97, 0);
  ctx.stroke();

  // bright edge highlight, offset toward one face
  ctx.strokeStyle = skin.edge;
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = Math.max(0.6, w * 0.06);
  ctx.beginPath();
  ctx.moveTo(bladeLen * 0.1, -w * 0.16);
  ctx.lineTo(bladeLen * 0.93, -w * 0.16);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (skin.engraved && quality !== "low") {
    ctx.strokeStyle = skin.accent;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = Math.max(0.5, w * 0.045);
    for (const t of [0.32, 0.5]) {
      ctx.beginPath();
      ctx.moveTo(bladeLen * t, -w * 0.22);
      ctx.lineTo(bladeLen * t, w * 0.22);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  if (skin.energy) {
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = skin.accent;
    ctx.lineWidth = Math.max(0.8, w * 0.1);
    ctx.beginPath();
    ctx.moveTo(bladeLen * 0.08, w * 0.14);
    ctx.lineTo(bladeLen * 0.95, w * 0.14);
    ctx.stroke();
    if (skin.accent2) {
      ctx.strokeStyle = skin.accent2;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(bladeLen * 0.08, -w * 0.14);
      ctx.lineTo(bladeLen * 0.85, -w * 0.14);
      ctx.stroke();
    }
    ctx.restore();
  }

  // hover/selection shimmer (BladePreview only — 0 everywhere else)
  if (glow > 0) {
    ctx.save();
    ctx.globalAlpha = glow * 0.45;
    ctx.strokeStyle = skin.accent;
    ctx.lineWidth = w * 0.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bladeLen, 0);
    ctx.stroke();
    ctx.restore();
  }

  // guard
  ctx.fillStyle = skin.guard;
  ctx.fillRect(bladeLen - w * 0.05, -w * 0.68, w * 0.15, w * 1.36);

  // handle — long grip with a subtle taper toward the pommel
  const hx = bladeLen + w * 0.1;
  const gripLen = handleLen - w * 0.36;
  const handleGrad = ctx.createLinearGradient(0, -w * 0.38, 0, w * 0.38);
  handleGrad.addColorStop(0, skin.handle);
  handleGrad.addColorStop(0.5, skin.handle);
  handleGrad.addColorStop(1, "#000000");
  ctx.fillStyle = handleGrad;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(hx, -w * 0.34, gripLen, w * 0.68, w * 0.16);
  else ctx.rect(hx, -w * 0.34, gripLen, w * 0.68);
  ctx.fill();

  // grip texture — a few wraps along the handle
  if (quality !== "low") {
    ctx.strokeStyle = "#000000";
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(0.6, w * 0.05);
    const wraps = 4;
    for (let i = 1; i <= wraps; i++) {
      const gx = hx + (gripLen * i) / (wraps + 1);
      ctx.beginPath();
      ctx.moveTo(gx, -w * 0.3);
      ctx.lineTo(gx, w * 0.3);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // accent band on the handle
  ctx.fillStyle = skin.accent;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(hx + gripLen * 0.32, -w * 0.34, w * 0.12, w * 0.68);
  ctx.globalAlpha = 1;

  // pommel
  ctx.fillStyle = skin.guard;
  ctx.beginPath();
  ctx.arc(hx + gripLen + w * 0.16, 0, w * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Standard collision-consistent blade sizing, relative to target radius —
 * the SAME for every skin. `HANDLE_STICK_RATIO` is exported so the layout
 * code can reserve enough headroom for the longest visible extent without
 * hardcoding the ratio in two places.
 */
export const HANDLE_STICK_RATIO = 0.72;

export function bladeGeometry(targetRadius) {
  return {
    width: Math.max(6, targetRadius * 0.115),
    insertDepth: targetRadius * 0.2,
    handleStick: targetRadius * HANDLE_STICK_RATIO,
  };
}
