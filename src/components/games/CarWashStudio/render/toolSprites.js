/**
 * Car Wash Studio — on-canvas tool sprites (screen space).
 *
 * Spray tools are held off to the side and aim a stream at the pointer (the
 * pointer IS the impact point, where cleaning happens). Contact tools sit
 * centered on the pointer. `tint` is the cosmetic tool color.
 */
import { hexToRgb, rgb, lighten, darken } from "./color.js";

const TAU = Math.PI * 2;

export const SPRAY_OFFSET = { hose: [78, 70], foam: [86, 74], pressure: [96, 80], spray: [62, 54], wheelCleaner: [62, 54], vacuum: [0, 0] };

function grad(ctx, x0, y0, x1, y1, c0, c1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

/** Nozzle tip position for spray tools, given the impact point and aim angle. */
export function nozzleTip(tool, x, y) {
  const o = SPRAY_OFFSET[tool];
  if (!o) return [x, y];
  return [x + o[0], y + o[1]];
}

export function drawTool(ctx, tool, x, y, st) {
  const tint = hexToRgb(st.tint || "#f1e6cf");
  const active = st.active;
  ctx.save();
  switch (tool) {
    case "hose":
    case "foam":
    case "pressure":
    case "spray":
    case "wheelCleaner": {
      const [nx, ny] = nozzleTip(tool, x, y);
      const ang = Math.atan2(y - ny, x - nx);
      ctx.translate(nx, ny);
      ctx.rotate(ang);
      if (tool === "pressure") {
        // long lance + trigger gun
        ctx.fillStyle = grad(ctx, 0, -3, 0, 3, "#dfe3e8", "#6b7179");
        ctx.fillRect(0, -2.6, 58, 5.2);
        ctx.fillStyle = "#23262b";
        ctx.fillRect(-4, -4.5, 10, 9);
        ctx.fillStyle = grad(ctx, 0, -9, 0, 9, rgb(lighten(tint, 0.2)), rgb(darken(tint, 0.35)));
        ctx.beginPath();
        ctx.roundRect(54, -9, 34, 18, 5);
        ctx.fill();
        ctx.fillStyle = "#2a2d31";
        ctx.beginPath();
        ctx.roundRect(68, 7, 11, 26, 4);
        ctx.fill();
        ctx.fillStyle = "#2a2d31";
        ctx.fillRect(86, -3, 30, 6);
      } else if (tool === "foam") {
        ctx.fillStyle = "#2b2e33";
        ctx.fillRect(-2, -5, 18, 10);
        ctx.fillStyle = "#c9ced4";
        ctx.fillRect(14, -4, 10, 8);
        ctx.fillStyle = grad(ctx, 24, -16, 24, 16, "rgba(255,255,255,0.85)", "rgba(210,225,240,0.7)");
        ctx.beginPath();
        ctx.roundRect(24, -15, 34, 30, 8);
        ctx.fill();
        ctx.fillStyle = rgb(tint, 0.9);
        ctx.fillRect(28, -6, 26, 12);
        ctx.fillStyle = "#23262b";
        ctx.beginPath();
        ctx.roundRect(58, -7, 22, 14, 4);
        ctx.fill();
        ctx.fillRect(66, 6, 10, 22);
      } else if (tool === "hose") {
        ctx.fillStyle = grad(ctx, 0, -5, 0, 5, "#eef1f4", "#8a9199");
        ctx.beginPath();
        ctx.roundRect(-2, -5, 28, 10, 3);
        ctx.fill();
        ctx.fillStyle = grad(ctx, 0, -8, 0, 8, rgb(lighten(tint, 0.25)), rgb(darken(tint, 0.3)));
        ctx.beginPath();
        ctx.roundRect(24, -8, 30, 16, 6);
        ctx.fill();
        ctx.fillStyle = "#2a2d31";
        ctx.beginPath();
        ctx.roundRect(40, 6, 12, 26, 5);
        ctx.fill();
        ctx.strokeStyle = "#2e7d4f";
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(50, 30);
        ctx.quadraticCurveTo(70, 60, 110, 70);
        ctx.stroke();
      } else {
        // trigger spray bottle
        const liquid = tool === "wheelCleaner" ? [168, 70, 190] : [120, 190, 240];
        ctx.fillStyle = "#2b2e33";
        ctx.beginPath();
        ctx.roundRect(-2, -5, 20, 10, 3);
        ctx.fill();
        ctx.fillStyle = rgb(tint);
        ctx.beginPath();
        ctx.roundRect(12, -8, 18, 16, 4);
        ctx.fill();
        ctx.save();
        ctx.rotate(-ang);
        ctx.fillStyle = grad(ctx, -12, 0, 12, 0, rgb(liquid, 0.85), rgb(darken(liquid, 0.3), 0.9));
        ctx.beginPath();
        ctx.roundRect(8, 6, 26, 40, 7);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(12, 18, 18, 10);
        ctx.restore();
      }
      break;
    }
    case "sponge": {
      ctx.translate(x, y);
      ctx.rotate(st.rot || 0);
      const sq = active ? 0.9 : 1;
      ctx.scale(1 / sq, sq);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.roundRect(-24, -14, 52, 34, 12);
      ctx.fill();
      ctx.fillStyle = grad(ctx, 0, -16, 0, 16, "#ffe07a", "#e8a93a");
      ctx.beginPath();
      ctx.roundRect(-26, -17, 52, 34, 12);
      ctx.fill();
      ctx.fillStyle = "rgba(160,100,20,0.35)";
      for (let i = 0; i < 16; i++) {
        ctx.beginPath();
        ctx.arc(-20 + ((i * 37) % 42), -11 + ((i * 23) % 22), 1.6 + (i % 3) * 0.6, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = rgb(tint);
      ctx.beginPath();
      ctx.roundRect(-26, 8, 52, 9, [0, 0, 12, 12]);
      ctx.fill();
      if (st.dirt > 0) {
        ctx.fillStyle = `rgba(120,95,60,${Math.min(0.45, st.dirt)})`;
        ctx.beginPath();
        ctx.roundRect(-26, -17, 52, 34, 12);
        ctx.fill();
      }
      break;
    }
    case "wheelBrush":
    case "detailBrush": {
      const small = tool === "detailBrush";
      const s = small ? 0.62 : 1;
      ctx.translate(x, y);
      ctx.rotate((st.rot || 0) * 0.6 - 0.5);
      ctx.scale(s, s);
      ctx.fillStyle = grad(ctx, 0, -8, 0, 8, rgb(lighten(tint, 0.2)), rgb(darken(tint, 0.35)));
      ctx.beginPath();
      ctx.roundRect(14, -6, 60, 12, 6);
      ctx.fill();
      ctx.fillStyle = "#3a3d42";
      ctx.beginPath();
      ctx.roundRect(-4, -12, 20, 24, 5);
      ctx.fill();
      ctx.strokeStyle = small ? "#e7d2a2" : "#24262a";
      ctx.lineWidth = 2;
      for (let i = -9; i <= 9; i += 3) {
        const wig = active ? Math.sin(st.t * 40 + i) * 2 : 0;
        ctx.beginPath();
        ctx.moveTo(-3, i);
        ctx.lineTo(-22 + wig, i * 1.25);
        ctx.stroke();
      }
      break;
    }
    case "cloth":
    case "towel":
    case "tireShine": {
      const big = tool === "towel";
      ctx.translate(x, y);
      ctx.rotate((st.rot || 0) * 0.5);
      const sz = big ? 34 : tool === "tireShine" ? 20 : 26;
      const sq = active ? 0.92 : 1;
      ctx.scale(1 / sq, sq);
      const base = tool === "tireShine" ? [40, 42, 48] : tint;
      const wet = big ? Math.min(0.45, st.wet || 0) : 0;
      const col = tool === "tireShine" ? base : [base[0] * (1 - wet), base[1] * (1 - wet), base[2] * (1 - wet * 0.8)];
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.beginPath();
      ctx.roundRect(-sz + 3, -sz * 0.75 + 4, sz * 2, sz * 1.5, 8);
      ctx.fill();
      ctx.fillStyle = grad(ctx, 0, -sz, 0, sz, rgb(lighten(col, 0.18)), rgb(darken(col, 0.2)));
      ctx.beginPath();
      ctx.roundRect(-sz, -sz * 0.75, sz * 2, sz * 1.5, 8);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      for (let i = -sz + 6; i < sz; i += 6) {
        ctx.beginPath();
        ctx.moveTo(i, -sz * 0.7);
        ctx.lineTo(i + 3, sz * 0.7);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.moveTo(sz, -sz * 0.75);
      ctx.lineTo(sz * 0.4, -sz * 0.75);
      ctx.lineTo(sz, -sz * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "polisher": {
      ctx.translate(x, y);
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.beginPath();
      ctx.arc(3, 4, 36, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.rotate(st.spin || 0);
      ctx.fillStyle = grad(ctx, -34, -34, 34, 34, rgb(lighten(tint, 0.3)), rgb(darken(tint, 0.25)));
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, 10 + i * 4, i, i + 1.6);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = "#2a2d32";
      ctx.beginPath();
      ctx.arc(0, 0, 14, 0, TAU);
      ctx.fill();
      ctx.fillStyle = grad(ctx, 0, -8, 0, 8, "#4a4e55", "#1d1f23");
      ctx.beginPath();
      ctx.roundRect(8, -8, 58, 16, 8);
      ctx.fill();
      ctx.fillStyle = rgb(tint);
      ctx.fillRect(30, -8, 10, 16);
      break;
    }
    case "vacuum": {
      ctx.translate(x, y);
      ctx.rotate(-0.6);
      ctx.fillStyle = grad(ctx, 0, -9, 0, 9, "#5a5f67", "#24272b");
      ctx.beginPath();
      ctx.moveTo(-14, -10);
      ctx.lineTo(14, -10);
      ctx.lineTo(9, 8);
      ctx.lineTo(-9, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#0b0c0d";
      ctx.fillRect(-12, -12, 24, 4);
      ctx.fillStyle = grad(ctx, -7, 0, 7, 0, rgb(lighten(tint, 0.2)), rgb(darken(tint, 0.3)));
      ctx.fillRect(-7, 8, 14, 60);
      ctx.fillStyle = "#2a2d31";
      ctx.fillRect(-9, 64, 18, 10);
      if (active) {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        for (let i = 0; i < 4; i++) {
          const a = st.t * 8 + i * 1.6;
          const r = 30 - ((st.t * 90 + i * 11) % 24);
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r, -12 + Math.sin(a) * r * 0.5);
          ctx.lineTo(Math.cos(a) * (r - 6), -12 + Math.sin(a) * (r - 6) * 0.5);
          ctx.stroke();
        }
      }
      break;
    }
    case "hand": {
      ctx.translate(x, y);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, active ? 14 : 18, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

/** Thin ring showing the exact cleaning footprint under the pointer. */
export function drawFootprint(ctx, x, y, r) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.setLineDash([4, 5]);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}
