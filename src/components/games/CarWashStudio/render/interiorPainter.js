/**
 * Car Wash Studio — interior painter (view units, 1000 x 560 scenes).
 *
 * Base layers are drawn under the surface composites (dust / stains / smudges),
 * then `drawInteriorOverlay` adds what physically sits above them: the
 * steering wheel, seams, trash and crumbs.
 */
import { pathOf } from "./paths.js";
import { rgb, lighten, darken, mix } from "./color.js";
import { bbox } from "../engine/geom.js";

const TAU = Math.PI * 2;

function vgrad(ctx, y0, y1, c0, c1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, c0);
  g.addColorStop(1, c1);
  return g;
}

function outside(ctx, poly, loc) {
  const b = bbox(poly);
  const sky = loc && loc.theme.sky ? loc.theme.sky : "#9fb3c4";
  const g = ctx.createLinearGradient(0, b.y0, 0, b.y1);
  g.addColorStop(0, sky);
  g.addColorStop(0.7, "#dfe7ec");
  g.addColorStop(1, "#b9c2c9");
  ctx.fillStyle = g;
  ctx.fill(pathOf(poly));
  ctx.save();
  ctx.clip(pathOf(poly));
  // blurred bay shapes outside
  ctx.fillStyle = "rgba(60,70,82,0.25)";
  ctx.fillRect(b.x0, b.y0 + b.h * 0.62, b.w, b.h * 0.4);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  for (let i = 0; i < 3; i++) ctx.fillRect(b.x0 + b.w * (0.15 + i * 0.3), b.y0 + b.h * 0.12, b.w * 0.14, 4);
  // glass tint + reflection streak
  ctx.fillStyle = "rgba(30,50,70,0.18)";
  ctx.fillRect(b.x0, b.y0, b.w, b.h);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(b.x0 + b.w * 0.3, b.y1);
  ctx.lineTo(b.x0 + b.w * 0.42, b.y1);
  ctx.lineTo(b.x0 + b.w * 0.62, b.y0);
  ctx.lineTo(b.x0 + b.w * 0.5, b.y0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function seat(ctx, poly, head, col, leather) {
  const b = bbox(poly);
  ctx.fillStyle = vgrad(ctx, b.y0, b.y1, rgb(lighten(col, 0.18)), rgb(darken(col, 0.35)));
  ctx.fill(pathOf(poly));
  ctx.save();
  ctx.clip(pathOf(poly));
  // bolsters
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(b.x0, b.y0, b.w * 0.16, b.h);
  ctx.fillRect(b.x1 - b.w * 0.16, b.y0, b.w * 0.16, b.h);
  ctx.strokeStyle = leather ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.22)";
  ctx.setLineDash(leather ? [3, 3] : []);
  ctx.lineWidth = 1.2;
  for (const f of [0.16, 0.84]) {
    ctx.beginPath();
    ctx.moveTo(b.x0 + b.w * f, b.y0 + 6);
    ctx.lineTo(b.x0 + b.w * f, b.y1);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  if (leather) {
    const sh = ctx.createRadialGradient(b.x0 + b.w * 0.4, b.y0 + b.h * 0.3, 2, b.x0 + b.w * 0.4, b.y0 + b.h * 0.3, b.w * 0.5);
    sh.addColorStop(0, "rgba(255,255,255,0.14)");
    sh.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sh;
    ctx.fillRect(b.x0, b.y0, b.w, b.h);
  } else {
    ctx.fillStyle = "rgba(0,0,0,0.05)";
    for (let y = b.y0; y < b.y1; y += 4) ctx.fillRect(b.x0, y, b.w, 1);
  }
  ctx.restore();
  if (head) {
    const hb = bbox(head);
    ctx.fillStyle = vgrad(ctx, hb.y0, hb.y1, rgb(lighten(col, 0.15)), rgb(darken(col, 0.25)));
    ctx.fill(pathOf(head));
    ctx.fillStyle = "#8a8f96";
    ctx.fillRect(hb.x0 + hb.w * 0.3, hb.y1, 4, 10);
    ctx.fillRect(hb.x1 - hb.w * 0.3 - 4, hb.y1, 4, 10);
  }
}

function mat(ctx, poly, carpet) {
  const b = bbox(poly);
  ctx.fillStyle = "#15171a";
  ctx.fill(pathOf(poly));
  ctx.save();
  ctx.clip(pathOf(poly));
  ctx.fillStyle = rgb(carpet);
  ctx.beginPath();
  ctx.roundRect(b.x0 + 8, b.y0 + 8, b.w - 16, b.h - 16, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 2;
  for (let x = b.x0 + 16; x < b.x1 - 10; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, b.y0 + 12);
    ctx.lineTo(x, b.y1 - 12);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawInteriorBase(ctx, im, view, spec, loc) {
  const v = im.views[view];
  const dashC = spec.dashColor || [46, 48, 53];
  const seatC = spec.seatColor || [74, 78, 86];
  const leather = im.seatMat === "leather";
  const liner = spec.dashColor && spec.dashColor[0] > 120 ? [214, 206, 192] : [150, 152, 156];
  const carpet = [46, 46, 50];

  if (view === "cabin") {
    // headliner + pillars
    ctx.fillStyle = vgrad(ctx, 0, 200, rgb(lighten(liner, 0.1)), rgb(darken(liner, 0.2)));
    ctx.fillRect(0, 0, 1000, 220);
    if (spec.open) {
      ctx.fillStyle = vgrad(ctx, 0, 60, "#8fd0f0", "#d6eef8");
      ctx.fillRect(0, 0, 1000, 60);
    }
    outside(ctx, v.ws, loc);
    ctx.fillStyle = rgb(darken(dashC, 0.15));
    for (const s of [1, -1]) {
      ctx.beginPath();
      if (s === 1) {
        ctx.moveTo(0, 0);
        ctx.lineTo(190, 26);
        ctx.lineTo(95, 188);
        ctx.lineTo(0, 240);
      } else {
        ctx.moveTo(1000, 0);
        ctx.lineTo(810, 26);
        ctx.lineTo(905, 188);
        ctx.lineTo(1000, 240);
      }
      ctx.closePath();
      ctx.fill();
    }
    // rear-view mirror
    ctx.fillStyle = "#1b1c1f";
    ctx.fillRect(496, 20, 8, 22);
    ctx.beginPath();
    ctx.roundRect(440, 38, 120, 30, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(170,190,210,0.35)";
    ctx.beginPath();
    ctx.roundRect(446, 42, 108, 22, 8);
    ctx.fill();
    // footwell floor + door panels
    ctx.fillStyle = "#0f1012";
    ctx.fillRect(0, 300, 1000, 260);
    ctx.fillStyle = rgb(darken(dashC, 0.25));
    ctx.fillRect(0, 230, 60, 330);
    ctx.fillRect(940, 230, 60, 330);
    mat(ctx, v.matL, carpet);
    mat(ctx, v.matR, carpet);
    // dashboard
    const db = bbox(v.dash);
    ctx.fillStyle = vgrad(ctx, db.y0, db.y1, rgb(lighten(dashC, 0.14)), rgb(darken(dashC, 0.3)));
    ctx.fill(pathOf(v.dash));
    ctx.save();
    ctx.clip(pathOf(v.dash));
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.fillRect(0, 282, 1000, 40);
    // instrument binnacle
    ctx.fillStyle = "#101113";
    ctx.beginPath();
    ctx.ellipse(300, 222, 110, 42, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = "#0b1016";
    ctx.beginPath();
    ctx.roundRect(210, 206, 180, 50, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(90,200,255,0.55)";
    ctx.lineWidth = 2;
    for (const cx of [255, 345]) {
      ctx.beginPath();
      ctx.arc(cx, 234, 18, Math.PI * 0.8, Math.PI * 2.2);
      ctx.stroke();
    }
    // center screen
    ctx.fillStyle = "#0a0d12";
    ctx.beginPath();
    ctx.roundRect(440, 184, 120, 48, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(90,180,255,0.18)";
    ctx.fillRect(448, 192, 50, 32);
    ctx.fillStyle = "rgba(255,255,255,0.1)";
    ctx.fillRect(505, 192, 48, 14);
    // glovebox seam
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(640, 262, 220, 44, 10);
    ctx.stroke();
    ctx.restore();
    // vents
    for (const vt of v.vents) {
      const b = bbox(vt);
      ctx.fillStyle = "#0e0f11";
      ctx.fill(pathOf(vt));
      ctx.save();
      ctx.clip(pathOf(vt));
      ctx.fillStyle = "#3a3d42";
      for (let y = b.y0 + 5; y < b.y1; y += 6) ctx.fillRect(b.x0, y, b.w, 2);
      ctx.restore();
      ctx.strokeStyle = "rgba(200,205,212,0.45)";
      ctx.lineWidth = 1.5;
      ctx.stroke(pathOf(vt));
    }
    // console
    const cb = bbox(v.console);
    ctx.fillStyle = vgrad(ctx, cb.y0, cb.y1, rgb(darken(dashC, 0.05)), rgb(darken(dashC, 0.4)));
    ctx.fill(pathOf(v.console));
    ctx.fillStyle = "#16171a";
    ctx.beginPath();
    ctx.roundRect(470, 350, 60, 40, 10);
    ctx.fill();
    ctx.fillStyle = "#2c2f34";
    ctx.beginPath();
    ctx.ellipse(500, 360, 12, 16, 0, 0, TAU);
    ctx.fill();
    for (const c of v.cups) {
      const b = bbox(c);
      ctx.fillStyle = "#08090a";
      ctx.fill(pathOf(c));
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 2;
      ctx.stroke(pathOf(c));
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.beginPath();
      ctx.ellipse(b.x0 + b.w / 2, b.y0 + b.h * 0.6, b.w * 0.3, b.h * 0.22, 0, 0, TAU);
      ctx.fill();
    }
    // front seats (backs)
    seat(ctx, v.seatL, v.headL, seatC, leather);
    seat(ctx, v.seatR, v.headR, seatC, leather);
  } else if (view === "rearCabin") {
    ctx.fillStyle = vgrad(ctx, 0, 180, rgb(lighten(liner, 0.1)), rgb(darken(liner, 0.2)));
    ctx.fillRect(0, 0, 1000, 200);
    outside(ctx, v.rw, loc);
    ctx.fillStyle = rgb(darken(dashC, 0.1));
    ctx.fillRect(160, 148, 680, 22);
    ctx.fillStyle = "#101113";
    ctx.fillRect(0, 150, 1000, 410);
    ctx.fillStyle = rgb(darken(dashC, 0.25));
    ctx.fillRect(0, 120, 80, 440);
    ctx.fillRect(920, 120, 80, 440);
    ctx.fillStyle = rgb(darken(dashC, 0.1));
    ctx.beginPath();
    ctx.roundRect(470, 430, 60, 130, 12);
    ctx.fill();
    mat(ctx, v.mL, carpet);
    mat(ctx, v.mR, carpet);
    for (const h of v.heads) {
      const hb = bbox(h);
      ctx.fillStyle = vgrad(ctx, hb.y0, hb.y1, rgb(lighten(seatC, 0.15)), rgb(darken(seatC, 0.25)));
      ctx.fill(pathOf(h));
    }
    seat(ctx, v.back, null, seatC, leather);
    seat(ctx, v.cushion, null, mix(seatC, [255, 255, 255], 0.05), leather);
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 2;
    for (const x of [370, 630]) {
      ctx.beginPath();
      ctx.moveTo(x, 172);
      ctx.lineTo(x, 425);
      ctx.stroke();
    }
  } else if (view === "trunk") {
    ctx.fillStyle = "#0c0d0f";
    ctx.fillRect(0, 0, 1000, 560);
    // seat backs visible at the far end
    ctx.fillStyle = vgrad(ctx, 90, 250, rgb(lighten(seatC, 0.08)), rgb(darken(seatC, 0.35)));
    ctx.beginPath();
    ctx.roundRect(210, 90, 580, 170, 26);
    ctx.fill();
    // side walls
    ctx.fillStyle = rgb(darken(dashC, 0.1));
    ctx.beginPath();
    ctx.moveTo(40, 40);
    ctx.lineTo(190, 250);
    ctx.lineTo(85, 520);
    ctx.lineTo(0, 560);
    ctx.lineTo(0, 30);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(960, 40);
    ctx.lineTo(810, 250);
    ctx.lineTo(915, 520);
    ctx.lineTo(1000, 560);
    ctx.lineTo(1000, 30);
    ctx.fill();
    const fb = bbox(v.floor);
    ctx.fillStyle = vgrad(ctx, fb.y0, fb.y1, "#26272b", "#3a3b40");
    ctx.fill(pathOf(v.floor));
    ctx.save();
    ctx.clip(pathOf(v.floor));
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    for (let y = fb.y0; y < fb.y1; y += 3) ctx.fillRect(fb.x0, y, fb.w, 1);
    ctx.restore();
    // tailgate opening frame in paint color
    const pc = spec.paintRgb || [60, 80, 120];
    ctx.strokeStyle = rgb(pc);
    ctx.lineWidth = 34;
    ctx.beginPath();
    ctx.roundRect(8, 8, 984, 580, 40);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(26, 26, 948, 560, 30);
    ctx.stroke();
  }
}

/** steering wheel / latches: drawn above the grime layers */
export function drawInteriorOverlay(ctx, im, view) {
  if (view === "cabin") {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f1012";
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.ellipse(300, 318, 112, 96, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(300, 312, 112, 96, 0, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = "#17181b";
    ctx.lineWidth = 16;
    for (const a of [Math.PI * 0.05, Math.PI * 0.95, Math.PI * 0.5]) {
      ctx.beginPath();
      ctx.moveTo(300, 318);
      ctx.lineTo(300 + Math.cos(a) * 104, 318 + Math.sin(a) * 90);
      ctx.stroke();
    }
    ctx.fillStyle = "#1b1c20";
    ctx.beginPath();
    ctx.ellipse(300, 318, 36, 31, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(300, 318, 14, 12, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- trash */

export function drawTrashItem(ctx, t, lift = 0) {
  ctx.save();
  ctx.translate(t.x, t.y - lift);
  ctx.rotate(t.rot);
  const s = t.size / 40;
  ctx.scale(s, s);
  // soft contact shadow
  ctx.fillStyle = `rgba(0,0,0,${0.35 - lift * 0.004})`;
  ctx.beginPath();
  ctx.ellipse(2, 10 + lift * 0.3, 20, 7, 0, 0, TAU);
  ctx.fill();
  switch (t.kind) {
    case "cup": {
      const g = ctx.createLinearGradient(-12, 0, 12, 0);
      g.addColorStop(0, "#e9e4da");
      g.addColorStop(1, "#b9b2a4");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-12, -16);
      ctx.lineTo(12, -16);
      ctx.lineTo(9, 14);
      ctx.lineTo(-9, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = t.hue > 0.5 ? "#c0392b" : "#2e7d6b";
      ctx.fillRect(-11, -4, 21, 7);
      ctx.fillStyle = "#f5f5f5";
      ctx.beginPath();
      ctx.ellipse(0, -16, 13, 4, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "#d84b4b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(3, -16);
      ctx.lineTo(8, -28);
      ctx.stroke();
      break;
    }
    case "receipt": {
      ctx.fillStyle = "#f7f6f1";
      ctx.beginPath();
      ctx.moveTo(-10, -16);
      ctx.lineTo(8, -14);
      ctx.lineTo(11, 15);
      ctx.lineTo(-9, 16);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)";
      ctx.lineWidth = 1.2;
      for (let y = -10; y < 12; y += 4) {
        ctx.beginPath();
        ctx.moveTo(-6, y);
        ctx.lineTo(4 + (y % 3), y + 0.5);
        ctx.stroke();
      }
      break;
    }
    case "wrapper": {
      const g = ctx.createLinearGradient(-14, -8, 14, 8);
      g.addColorStop(0, "#f0c040");
      g.addColorStop(0.5, "#fff2b0");
      g.addColorStop(1, "#b78a1c");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-15, -6);
      ctx.lineTo(-6, -10);
      ctx.lineTo(4, -7);
      ctx.lineTo(15, -9);
      ctx.lineTo(13, 6);
      ctx.lineTo(2, 9);
      ctx.lineTo(-12, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-8, -4);
      ctx.lineTo(6, 3);
      ctx.stroke();
      break;
    }
    case "bottle": {
      const g = ctx.createLinearGradient(-7, 0, 7, 0);
      g.addColorStop(0, "rgba(170,210,240,0.9)");
      g.addColorStop(0.5, "rgba(230,245,255,0.95)");
      g.addColorStop(1, "rgba(120,170,210,0.9)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-8, -12, 16, 28, 5);
      ctx.fill();
      ctx.fillRect(-4, -20, 8, 9);
      ctx.fillStyle = "#2a76c6";
      ctx.fillRect(-5, -23, 10, 4);
      ctx.fillStyle = "#e9eef3";
      ctx.fillRect(-8, -2, 16, 7);
      break;
    }
    case "box": {
      ctx.fillStyle = "#c79a64";
      ctx.fillRect(-13, -9, 26, 18);
      ctx.fillStyle = "#b08452";
      ctx.fillRect(-13, -9, 26, 5);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.strokeRect(-13, -9, 26, 18);
      break;
    }
    default: {
      const g = ctx.createLinearGradient(-8, 0, 8, 0);
      g.addColorStop(0, "#8e979f");
      g.addColorStop(0.5, "#eef2f5");
      g.addColorStop(1, "#6c747b");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(-8, -14, 16, 28, 4);
      ctx.fill();
      ctx.fillStyle = t.hue > 0.5 ? "#3b6fd1" : "#e0663a";
      ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = "#c9cfd4";
      ctx.beginPath();
      ctx.ellipse(0, -14, 7.5, 2.5, 0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawCrumbs(ctx, crumbs, view) {
  for (const c of crumbs) {
    if (c.view !== view) continue;
    if (!c.alive && !(c.fade > 0)) continue;
    const a = c.alive ? 1 : c.fade;
    ctx.fillStyle = `rgba(${c.color[0] | 0},${c.color[1] | 0},${c.color[2] | 0},${a})`;
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, c.r * (c.alive ? 1 : a), c.r * 0.7 * (c.alive ? 1 : a), c.rot, 0, TAU);
    ctx.fill();
  }
}
