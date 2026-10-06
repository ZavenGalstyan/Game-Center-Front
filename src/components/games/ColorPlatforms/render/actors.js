/**
 * Color Platforms — procedural drawing for the mascot and level props.
 * All functions draw in WORLD units (the engine sets the camera transform).
 */
import { rgbStr, mix, WHITE, BLACK, symbolPath, rrect, PLAT } from "./palette.js";
import { NEUTRAL } from "../engine/constants.js";

const TAU = Math.PI * 2;
const tl = [0, 0, 0];
const td = [0, 0, 0];

/**
 * pl: { x, y, rgb, sx, sy, tilt, look, lookY, blink, mood, foot, run, alpha,
 *       sym, cos, time, glow }
 */
export function drawPlayer(ctx, pl) {
  const light = mix(pl.rgb, WHITE, 0.5, tl);
  const dark = mix(pl.rgb, BLACK, 0.42, td);
  ctx.save();
  ctx.globalAlpha = pl.alpha;
  ctx.translate(pl.x, pl.y);
  ctx.rotate(pl.tilt);
  ctx.scale(pl.sx, pl.sy);

  // feet
  ctx.fillStyle = rgbStr(dark);
  const lift = pl.run ? 3.2 : 0;
  const f1 = Math.max(0, Math.sin(pl.foot)) * lift;
  const f2 = Math.max(0, Math.sin(pl.foot + Math.PI)) * lift;
  ctx.beginPath();
  ctx.ellipse(-7.5, -2.2 - f1, 6, 3.6, 0, 0, TAU);
  ctx.ellipse(7.5, -2.2 - f2, 6, 3.6, 0, 0, TAU);
  ctx.fill();

  // body (gumdrop)
  ctx.beginPath();
  ctx.moveTo(-16, -9);
  ctx.bezierCurveTo(-16, -38, 16, -38, 16, -9);
  ctx.quadraticCurveTo(16, -2.5, 9, -2.5);
  ctx.lineTo(-9, -2.5);
  ctx.quadraticCurveTo(-16, -2.5, -16, -9);
  ctx.closePath();
  const g = ctx.createRadialGradient(-6, -24, 2, -2, -16, 26);
  g.addColorStop(0, rgbStr(light));
  g.addColorStop(0.45, rgbStr(pl.rgb));
  g.addColorStop(1, rgbStr(dark));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgbStr(dark, 0.9);
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // highlight
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.ellipse(-7.5, -23.5, 4.6, 2.6, -0.6, 0, TAU);
  ctx.fill();

  // cheeks
  ctx.fillStyle = pl.cos.eyes === "happy" ? "rgba(255,120,150,0.42)" : "rgba(255,140,160,0.26)";
  ctx.beginPath();
  ctx.ellipse(-10.5, -11.5, 3, 1.8, 0, 0, TAU);
  ctx.ellipse(10.5, -11.5, 3, 1.8, 0, 0, TAU);
  ctx.fill();

  // eyes
  const ex = pl.look * 2;
  const ey = -18 + pl.lookY * 1.4;
  const open = Math.max(0.12, pl.blink);
  if (pl.mood === "happy") {
    ctx.strokeStyle = "#1a1d33";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * 6 + ex, ey + 1.5, 3.2, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  } else {
    for (const s of [-1, 1]) {
      const cx = s * 6.2 + ex;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(cx, ey, 4.3, 5.4 * open, 0, 0, TAU);
      ctx.fill();
      if (open > 0.3) {
        ctx.fillStyle = "#1a1d33";
        ctx.beginPath();
        ctx.arc(cx + pl.look * 1.5, ey + pl.lookY * 1.2 + 0.6, 2.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(cx + pl.look * 1.5 - 0.9, ey + pl.lookY * 1.2 - 0.6, 0.9, 0, TAU);
        ctx.fill();
      }
      if (pl.cos.eyes === "sharp") {
        ctx.fillStyle = rgbStr(mix(pl.rgb, BLACK, 0.15, tl));
        ctx.beginPath();
        ctx.moveTo(cx - 5, ey - 6);
        ctx.lineTo(cx + 5, ey - 6);
        ctx.lineTo(cx + 5, ey - 2.4 + s * 1.3);
        ctx.lineTo(cx - 5, ey - 2.4 - s * 1.3);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // mouth
  ctx.strokeStyle = "#1a1d33";
  ctx.fillStyle = "#1a1d33";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  if (pl.mood === "fall") {
    ctx.beginPath();
    ctx.ellipse(ex * 0.6, -10.5, 1.8, 2.3, 0, 0, TAU);
    ctx.fill();
  } else if (pl.mood === "happy") {
    ctx.beginPath();
    ctx.moveTo(-3.6 + ex * 0.6, -11.5);
    ctx.quadraticCurveTo(ex * 0.6, -6, 3.6 + ex * 0.6, -11.5);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(ex * 0.6, -12.2, 2.6, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.stroke();
  }

  // color-assist badge on the belly
  if (pl.sym) {
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.3;
    symbolPath(ctx, pl.sym, 0, -6.2, 2.4);
    if (pl.sym === "circle") ctx.stroke();
    else ctx.fill();
  }

  drawAccessory(ctx, pl.cos.accessory, pl.rgb, light, pl.time);
  ctx.restore();
}

function drawAccessory(ctx, kind, rgb, light, t) {
  if (kind === "none") return;
  ctx.save();
  if (kind === "sprout") {
    ctx.strokeStyle = "#3f9a4a";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.quadraticCurveTo(1, -35, 0.5, -38);
    ctx.stroke();
    ctx.fillStyle = "#62d16f";
    ctx.beginPath();
    ctx.ellipse(-3.5, -38, 4, 2.2, -0.5, 0, TAU);
    ctx.ellipse(4, -39, 4, 2.2, 0.5, 0, TAU);
    ctx.fill();
  } else if (kind === "antenna") {
    ctx.strokeStyle = "rgba(20,20,40,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(1, -30);
    ctx.lineTo(4, -41);
    ctx.stroke();
    ctx.fillStyle = rgbStr(light);
    ctx.shadowColor = rgbStr(rgb);
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(4, -42, 2.8 + Math.sin(t * 6) * 0.4, 0, TAU);
    ctx.fill();
  } else if (kind === "band") {
    ctx.fillStyle = "#1c2240";
    ctx.beginPath();
    ctx.moveTo(-15.4, -22);
    ctx.quadraticCurveTo(0, -28, 15.4, -22);
    ctx.lineTo(15.8, -18.5);
    ctx.quadraticCurveTo(0, -24.5, -15.8, -18.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(15, -21);
    ctx.lineTo(21, -24 + Math.sin(t * 8) * 1.5);
    ctx.lineTo(20, -19);
    ctx.closePath();
    ctx.fill();
  } else if (kind === "bow") {
    ctx.fillStyle = "#ff6fa8";
    ctx.beginPath();
    ctx.moveTo(8, -27);
    ctx.lineTo(2.5, -31.5);
    ctx.lineTo(3, -23.5);
    ctx.closePath();
    ctx.moveTo(8, -27);
    ctx.lineTo(13.5, -32);
    ctx.lineTo(13.5, -23);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffd1e4";
    ctx.beginPath();
    ctx.arc(8, -27, 1.9, 0, TAU);
    ctx.fill();
  } else if (kind === "fin") {
    ctx.fillStyle = "rgba(235,250,255,0.95)";
    ctx.strokeStyle = "rgba(40,80,120,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, -29.5);
    ctx.quadraticCurveTo(-1, -40, 6, -41);
    ctx.quadraticCurveTo(3, -35, 5, -29);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (kind === "crown") {
    const grd = ctx.createLinearGradient(0, -40, 0, -29);
    grd.addColorStop(0, "#fff0a0");
    grd.addColorStop(1, "#e2a312");
    ctx.fillStyle = grd;
    ctx.strokeStyle = "rgba(120,70,0,0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-7, -29);
    ctx.lineTo(-8, -37);
    ctx.lineTo(-3.5, -33);
    ctx.lineTo(0, -39.5);
    ctx.lineTo(3.5, -33);
    ctx.lineTo(8, -37);
    ctx.lineTo(7, -29);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Soft contact shadow under the mascot. */
export function drawShadow(ctx, x, y, dist, alpha) {
  const k = Math.max(0, 1 - dist / 260);
  if (k <= 0) return;
  ctx.fillStyle = `rgba(5,8,25,${0.32 * k * alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 15 * (0.55 + 0.45 * k), 3.6 * (0.6 + 0.4 * k), 0, 0, TAU);
  ctx.fill();
}

/** Bounce pad (Neutral). `sq` 0..1 compression. */
export function drawBounce(ctx, x, y, w, h, sq, time) {
  const P = PLAT[NEUTRAL];
  const press = sq * 7;
  // base
  ctx.fillStyle = "#59647f";
  rrect(ctx, x + 4, y + h - 9, w - 8, 9, 4);
  ctx.fill();
  // springs
  const top = y + 7 + press;
  const bot = y + h - 8;
  ctx.strokeStyle = "#c9d3e6";
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "round";
  for (const cx of [x + w * 0.28, x + w * 0.72]) {
    ctx.beginPath();
    const n = 4;
    for (let i = 0; i <= n; i++) {
      const yy = top + ((bot - top) * i) / n;
      const xx = cx + (i % 2 ? 6 : -6) * (i === 0 || i === n ? 0 : 1);
      if (i) ctx.lineTo(xx, yy);
      else ctx.moveTo(xx, yy);
    }
    ctx.stroke();
  }
  // glow
  ctx.save();
  ctx.shadowColor = "rgba(120,255,230,0.8)";
  ctx.shadowBlur = 14 + Math.sin(time * 5) * 4;
  const pad = ctx.createLinearGradient(0, y + press, 0, y + press + 9);
  pad.addColorStop(0, "#ffffff");
  pad.addColorStop(1, P.body);
  ctx.fillStyle = pad;
  rrect(ctx, x, y + press, w, 9, 4.5);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(6,10,30,0.4)";
  ctx.lineWidth = 1.1;
  rrect(ctx, x + 0.5, y + press + 0.5, w - 1, 8, 4);
  ctx.stroke();
  // chevrons
  ctx.strokeStyle = "rgba(40,170,160,0.9)";
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const cx = x + w / 2 + (i - 1) * 14;
    ctx.beginPath();
    ctx.moveTo(cx - 4, y + press + 6.5);
    ctx.lineTo(cx, y + press + 2.5);
    ctx.lineTo(cx + 4, y + press + 6.5);
    ctx.stroke();
  }
}

export function drawSpikes(ctx, x, y, w) {
  const n = Math.max(1, Math.round(w / 16));
  const sw = w / n;
  ctx.fillStyle = "#2a2f4a";
  rrect(ctx, x, y - 4, w, 4, 2);
  ctx.fill();
  const grd = ctx.createLinearGradient(0, y - 16, 0, y);
  grd.addColorStop(0, "#ffffff");
  grd.addColorStop(0.5, "#b9c2d8");
  grd.addColorStop(1, "#5d6684");
  ctx.fillStyle = grd;
  ctx.strokeStyle = "rgba(10,12,30,0.7)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const sx = x + i * sw;
    ctx.moveTo(sx + 1, y - 3);
    ctx.lineTo(sx + sw / 2, y - 17);
    ctx.lineTo(sx + sw - 1, y - 3);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(255,80,110,0.85)";
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x + i * sw + sw / 2, y - 15.5, 1.3, 0, TAU);
    ctx.fill();
  }
}

export function drawSaw(ctx, x, y, r, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 4);
  ctx.fillStyle = "#c3cbe0";
  ctx.strokeStyle = "rgba(10,12,30,0.75)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const n = 10;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU;
    const rr = i % 2 ? r * 0.72 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#3a4060";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#ff4d6d";
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.2, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Finish portal at feet position (x, y). `big` for the final level. */
export function drawPortal(ctx, x, y, time, big, reduced) {
  const s = big ? 1.4 : 1;
  const H = 92 * s;
  const W = 24 * s;
  const cy = y - H / 2 - 2;
  ctx.save();
  // light column
  const col = ctx.createLinearGradient(0, y - H * 1.6, 0, y);
  col.addColorStop(0, "rgba(140,255,200,0)");
  col.addColorStop(1, "rgba(140,255,200,0.22)");
  ctx.fillStyle = col;
  ctx.fillRect(x - W * 1.1, y - H * 1.6, W * 2.2, H * 1.6);
  // inner field
  const inner = ctx.createRadialGradient(x, cy, 2, x, cy, H * 0.55);
  inner.addColorStop(0, "rgba(255,255,255,0.9)");
  inner.addColorStop(0.4, "rgba(150,255,210,0.45)");
  inner.addColorStop(1, "rgba(80,220,170,0.05)");
  ctx.fillStyle = inner;
  ctx.beginPath();
  ctx.ellipse(x, cy, W, H / 2, 0, 0, TAU);
  ctx.fill();
  // swirl
  const t = reduced ? 0 : time;
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 3; i++) {
    const a = t * 2.2 + (i * TAU) / 3;
    ctx.beginPath();
    ctx.ellipse(x, cy, W * 0.62, H * 0.36, 0, a, a + 1.6);
    ctx.stroke();
  }
  // ring
  ctx.shadowColor = "rgba(120,255,200,0.95)";
  ctx.shadowBlur = 18;
  ctx.strokeStyle = "#eafff5";
  ctx.lineWidth = 4.5 * s;
  ctx.beginPath();
  ctx.ellipse(x, cy, W, H / 2, 0, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(60,220,160,0.9)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(x, cy, W + 4 * s, H / 2 + 4 * s, 0, 0, TAU);
  ctx.stroke();
  // base
  ctx.fillStyle = "#e7fff4";
  rrect(ctx, x - W - 8, y - 5, (W + 8) * 2, 5, 2.5);
  ctx.fill();
  ctx.restore();
}

export function drawCheckpoint(ctx, x, y, active, time, pulse) {
  ctx.save();
  ctx.strokeStyle = "#e9eef8";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 56);
  ctx.stroke();
  const wave = Math.sin(time * 4) * 3;
  ctx.fillStyle = active ? "#5ff2d2" : "#8c96b0";
  if (active) {
    ctx.shadowColor = "rgba(90,255,220,0.95)";
    ctx.shadowBlur = 14;
  }
  ctx.beginPath();
  ctx.moveTo(x + 1.5, y - 55);
  ctx.quadraticCurveTo(x + 14, y - 51 + wave, x + 26, y - 47 + wave * 0.6);
  ctx.quadraticCurveTo(x + 14, y - 43 - wave * 0.4, x + 1.5, y - 38);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = active ? "#ffffff" : "#c3cada";
  ctx.beginPath();
  ctx.arc(x, y - 58, 3.4, 0, TAU);
  ctx.fill();
  if (pulse > 0) {
    ctx.strokeStyle = `rgba(110,255,225,${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y - 30, 20 + (1 - pulse) * 40, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTrack(ctx, x0, y0, x1, y1) {
  ctx.save();
  ctx.setLineDash([3, 7]);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  for (const [x, y] of [
    [x0, y0],
    [x1, y1],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 2.6, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}
