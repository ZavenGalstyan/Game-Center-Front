/**
 * Bottle Flip — the bottle (the visual hero).
 *
 * Drawn in body space, canvas-style (y DOWN), origin at the centre of mass,
 * 1 unit = 1 world unit; the caller translates/rotates/scales. The outline
 * follows the collision probes in physics/constants.js (base ±4 at y=+8,
 * shoulder at −3.5, neck ±2.3, cap top at −14) so the art and the physics
 * are the same bottle.
 *
 * Liquid: a clipped fill whose surface tilts by `tilt` (radians, relative to
 * the bottle) and ripples by `slosh` — lightweight, no fluid sim.
 */

const BASE = 8;
const SHOULDER = -3.5;
const NECK = -9;
const COLLAR = -11.5;
const TOP = -14;
const HW = 4;
const NW = 2.3;
const FILL = 2.6; // liquid surface height at rest (body space)

function bodyPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(-HW + 1.5, BASE);
  ctx.lineTo(HW - 1.5, BASE);
  ctx.quadraticCurveTo(HW, BASE, HW, BASE - 1.5);
  // subtle grip waist
  ctx.bezierCurveTo(HW - 0.35, 4.5, HW - 0.35, 1.5, HW, -0.5);
  ctx.lineTo(HW, SHOULDER);
  ctx.bezierCurveTo(HW, -6.6, NW + 0.2, -7.2, NW, NECK);
  ctx.lineTo(NW, COLLAR);
  ctx.lineTo(-NW, COLLAR);
  ctx.lineTo(-NW, NECK);
  ctx.bezierCurveTo(-NW - 0.2, -7.2, -HW, -6.6, -HW, SHOULDER);
  ctx.lineTo(-HW, -0.5);
  ctx.bezierCurveTo(-HW + 0.35, 1.5, -HW + 0.35, 4.5, -HW, BASE - 1.5);
  ctx.quadraticCurveTo(-HW, BASE, -HW + 1.5, BASE);
  ctx.closePath();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawMark(ctx, mark, x, y, s, color) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.beginPath();
  switch (mark) {
    case "heart":
      ctx.moveTo(x, y + s * 0.7);
      ctx.bezierCurveTo(x - s * 1.2, y - s * 0.1, x - s * 0.5, y - s * 1, x, y - s * 0.35);
      ctx.bezierCurveTo(x + s * 0.5, y - s * 1, x + s * 1.2, y - s * 0.1, x, y + s * 0.7);
      ctx.fill();
      break;
    case "leaf":
      ctx.moveTo(x - s, y + s * 0.6);
      ctx.quadraticCurveTo(x - s * 0.8, y - s * 0.9, x + s, y - s * 0.7);
      ctx.quadraticCurveTo(x + s * 0.7, y + s * 0.8, x - s, y + s * 0.6);
      ctx.fill();
      break;
    case "sun":
      ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = s * 0.22;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.8);
        ctx.lineTo(x + Math.cos(a) * s * 1.1, y + Math.sin(a) * s * 1.1);
      }
      ctx.stroke();
      break;
    case "wave":
      ctx.lineWidth = s * 0.32;
      ctx.lineCap = "round";
      ctx.moveTo(x - s, y);
      ctx.quadraticCurveTo(x - s * 0.5, y - s * 0.7, x, y);
      ctx.quadraticCurveTo(x + s * 0.5, y + s * 0.7, x + s, y);
      ctx.stroke();
      break;
    case "moon":
      ctx.arc(x, y, s * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.arc(x + s * 0.4, y - s * 0.25, s * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      break;
    case "star":
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.42 : s;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case "crown":
      ctx.moveTo(x - s, y + s * 0.6);
      ctx.lineTo(x - s, y - s * 0.4);
      ctx.lineTo(x - s * 0.45, y + s * 0.05);
      ctx.lineTo(x, y - s * 0.7);
      ctx.lineTo(x + s * 0.45, y + s * 0.05);
      ctx.lineTo(x + s, y - s * 0.4);
      ctx.lineTo(x + s, y + s * 0.6);
      ctx.closePath();
      ctx.fill();
      break;
    case "bolt":
      ctx.moveTo(x + s * 0.2, y - s);
      ctx.lineTo(x - s * 0.6, y + s * 0.15);
      ctx.lineTo(x - s * 0.05, y + s * 0.15);
      ctx.lineTo(x - s * 0.25, y + s);
      ctx.lineTo(x + s * 0.6, y - s * 0.2);
      ctx.lineTo(x + s * 0.05, y - s * 0.2);
      ctx.closePath();
      ctx.fill();
      break;
    default: // drop
      ctx.moveTo(x, y - s);
      ctx.bezierCurveTo(x + s * 0.2, y - s * 0.4, x + s * 0.75, y, x + s * 0.75, y + s * 0.35);
      ctx.arc(x, y + s * 0.35, s * 0.75, 0, Math.PI);
      ctx.bezierCurveTo(x - s * 0.75, y, x - s * 0.2, y - s * 0.4, x, y - s);
      ctx.fill();
  }
}

/**
 * opts: { tilt, slosh, time, quality: "low"|"medium"|"high", glow }
 */
export function drawBottle(ctx, skin, opts = {}) {
  const tilt = opts.tilt || 0;
  const slosh = opts.slosh || 0;
  const time = opts.time || 0;
  const q = opts.quality || "medium";

  // ---- glass body (back wall, very light) ----
  bodyPath(ctx);
  const gb = ctx.createLinearGradient(-HW, 0, HW, 0);
  gb.addColorStop(0, hexA(skin.glass, 0.55));
  gb.addColorStop(0.45, hexA(skin.glass, 0.22));
  gb.addColorStop(1, hexA(skin.glass, 0.5));
  ctx.fillStyle = gb;
  ctx.fill();

  // ---- liquid ----
  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  ctx.save();
  ctx.translate(0, FILL);
  ctx.rotate(tilt);
  const lg = ctx.createLinearGradient(0, -2, 0, 12);
  lg.addColorStop(0, skin.liquid[0]);
  lg.addColorStop(1, skin.liquid[1]);
  ctx.fillStyle = lg;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  // rippled surface
  const amp = Math.min(0.9, Math.abs(slosh)) * 0.9;
  ctx.moveTo(-14, 0);
  for (let i = -14; i <= 14; i += 2) {
    ctx.lineTo(i, Math.sin(i * 0.7 + time * 9) * amp);
  }
  ctx.lineTo(14, 22);
  ctx.lineTo(-14, 22);
  ctx.closePath();
  ctx.fill();
  // surface sheen
  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 0.45;
  ctx.beginPath();
  ctx.moveTo(-6, Math.sin(-6 * 0.7 + time * 9) * amp);
  for (let i = -6; i <= 6; i += 1.5) ctx.lineTo(i, Math.sin(i * 0.7 + time * 9) * amp);
  ctx.stroke();
  ctx.restore();
  // bubbles
  if (q !== "low") {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    for (let i = 0; i < 4; i++) {
      const ph = (time * (0.35 + i * 0.07) + i * 0.29) % 1;
      const bx = -2.4 + i * 1.6 + Math.sin(time * 2 + i) * 0.3;
      const by = BASE - 0.8 - ph * (BASE - FILL - 1);
      ctx.beginPath();
      ctx.arc(bx, by, 0.22 + (i % 2) * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // inner base shading (the concave bottom)
  const bs = ctx.createLinearGradient(0, BASE - 2.5, 0, BASE);
  bs.addColorStop(0, "rgba(0,0,0,0)");
  bs.addColorStop(1, "rgba(0,20,60,0.22)");
  ctx.fillStyle = bs;
  ctx.fillRect(-HW, BASE - 2.5, HW * 2, 2.5);
  // grip ribs
  ctx.globalAlpha = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 0.25;
  for (const ry of [4.2, 5.4, 6.6]) {
    ctx.beginPath();
    ctx.moveTo(-HW + 0.4, ry);
    ctx.quadraticCurveTo(0, ry + 0.35, HW - 0.4, ry);
    ctx.stroke();
  }
  ctx.restore();

  // ---- label (wraps the body) ----
  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  const L0 = -3.2;
  const L1 = 1.1;
  const lb = ctx.createLinearGradient(-HW, 0, HW, 0);
  lb.addColorStop(0, shade(skin.label.bg, -0.18));
  lb.addColorStop(0.35, skin.label.bg);
  lb.addColorStop(0.7, skin.label.bg);
  lb.addColorStop(1, shade(skin.label.bg, -0.25));
  ctx.fillStyle = lb;
  ctx.fillRect(-HW - 1, L0, HW * 2 + 2, L1 - L0);
  ctx.fillStyle = skin.label.accent;
  ctx.fillRect(-HW - 1, L1 - 0.7, HW * 2 + 2, 0.7);
  ctx.fillRect(-HW - 1, L0, HW * 2 + 2, 0.35);
  drawMark(ctx, skin.label.mark, -1.3, (L0 + L1) / 2 - 0.1, 1.05, skin.label.ink);
  ctx.fillStyle = skin.label.ink;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(0.3, -1.9, 2.6, 0.45);
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0.3, -1.1, 2.0, 0.35);
  ctx.globalAlpha = 1;
  ctx.restore();

  // ---- glass front: highlights & rim ----
  ctx.save();
  bodyPath(ctx);
  ctx.clip();
  const hl = ctx.createLinearGradient(-HW, 0, -HW + 3, 0);
  hl.addColorStop(0, "rgba(255,255,255,0)");
  hl.addColorStop(0.35, "rgba(255,255,255,0.55)");
  hl.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = hl;
  ctx.fillRect(-HW + 0.5, SHOULDER - 3, 2.2, BASE - SHOULDER + 1.5);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(HW - 1.35, SHOULDER + 0.5, 0.45, BASE - SHOULDER - 2);
  // shoulder specular
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.ellipse(-1.7, -5.6, 0.55, 1.5, -0.55, 0, Math.PI * 2);
  ctx.fill();
  if (q === "high") {
    // soft environment reflection band
    const rf = ctx.createLinearGradient(0, SHOULDER, 0, BASE);
    rf.addColorStop(0, "rgba(255,255,255,0.12)");
    rf.addColorStop(0.5, "rgba(255,255,255,0)");
    rf.addColorStop(1, "rgba(255,255,255,0.1)");
    ctx.fillStyle = rf;
    ctx.fillRect(-HW, SHOULDER, HW * 2, BASE - SHOULDER);
  }
  ctx.restore();

  bodyPath(ctx);
  ctx.strokeStyle = hexA(shade(skin.glass, -0.45), 0.75);
  ctx.lineWidth = 0.32;
  ctx.stroke();

  // ---- collar + cap ----
  ctx.fillStyle = hexA(shade(skin.glass, -0.1), 0.9);
  roundRect(ctx, -NW - 0.35, COLLAR - 0.2, (NW + 0.35) * 2, 0.7, 0.3);
  ctx.fill();
  const cg = ctx.createLinearGradient(-2.6, 0, 2.6, 0);
  cg.addColorStop(0, skin.cap[1]);
  cg.addColorStop(0.35, skin.cap[0]);
  cg.addColorStop(0.6, shade(skin.cap[0], 0.25));
  cg.addColorStop(1, skin.cap[1]);
  ctx.fillStyle = cg;
  roundRect(ctx, -2.6, TOP, 5.2, COLLAR - TOP, 0.7);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.22)";
  ctx.lineWidth = 0.2;
  for (let i = -2; i <= 2; i += 0.8) {
    ctx.beginPath();
    ctx.moveTo(i, TOP + 0.7);
    ctx.lineTo(i, COLLAR - 0.25);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  roundRect(ctx, -2.2, TOP + 0.25, 4.4, 0.55, 0.25);
  ctx.fill();

  if (opts.glow) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = opts.glow;
    bodyPath(ctx);
    ctx.fillStyle = "rgba(255,240,200,0.6)";
    ctx.fill();
    ctx.restore();
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (amt >= 0) {
    r += (255 - r) * amt;
    g += (255 - g) * amt;
    b += (255 - b) * amt;
  } else {
    r *= 1 + amt;
    g *= 1 + amt;
    b *= 1 + amt;
  }
  const h = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}
