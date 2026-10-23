/**
 * Gravity Sketch — canvas renderer. Draws a sim (./engine.js) onto a 2D
 * context in world units; the caller sets up the world→pixel transform.
 * Look: bright graph-paper sketchbook, chunky outlined toys, marker ink.
 */
import { W, H, INK_W, DOT_R } from "./engine.js";

export const PALETTE = {
  paper: "#fbf7ee",
  grid: "rgba(86, 120, 200, 0.10)",
  gridBold: "rgba(86, 120, 200, 0.20)",
  ink: "#1d1b33",
  solid: "#34375f",
  solidTop: "#5a5f9a",
  wood: "#d9954f",
  woodDark: "#a86a2e",
  pen: "#7b5cff",
  penHi: "#b9a8ff",
  red: "#ff4d6d",
  blue: "#3d8bff",
  green: "#22c58b",
  orange: "#ff8a3d",
  yellow: "#ffc93d",
  pink: "#ff5fc8",
  teal: "#19c3c8",
  purple: "#9b5cff",
  gray: "#9aa0b8",
};
const C = (c) => PALETTE[c] || c || PALETTE.orange;

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) (r *= 1 + f), (g *= 1 + f), (b *= 1 + f);
  else (r += (255 - r) * f), (g += (255 - g) * f), (b += (255 - b) * f);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function pathVerts(ctx, verts) {
  ctx.beginPath();
  ctx.moveTo(verts[0].x, verts[0].y);
  for (let i = 1; i < verts.length; i++) ctx.lineTo(verts[i].x, verts[i].y);
  ctx.closePath();
}

/** Fill every part of a (possibly compound) body. */
function fillBody(ctx, body, fill, stroke = PALETTE.ink, lw = 4) {
  const parts = body.parts.length > 1 ? body.parts.slice(1) : body.parts;
  ctx.lineJoin = "round";
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw * 2;
    for (const p of parts) (pathVerts(ctx, p.vertices), ctx.stroke());
  }
  ctx.fillStyle = fill;
  for (const p of parts) (pathVerts(ctx, p.vertices), ctx.fill());
}

let paperCache = null;
function paper(ctx, accent) {
  const k = accent;
  if (!paperCache || paperCache.k !== k) {
    const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W / 2, H / 2) : null;
    if (!cv) return plainPaper(ctx);
    const g = cv.getContext("2d");
    g.scale(0.5, 0.5);
    plainPaper(g, accent);
    paperCache = { k, cv };
  }
  ctx.drawImage(paperCache.cv, 0, 0, W, H);
}
function plainPaper(ctx, accent = "#7b5cff") {
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, W, H);
  const grd = ctx.createRadialGradient(W / 2, H * 0.35, 100, W / 2, H / 2, W * 0.75);
  grd.addColorStop(0, "rgba(255,255,255,0.7)");
  grd.addColorStop(1, accent + "12");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);
  for (let x = 0; x <= W; x += 40) {
    ctx.strokeStyle = x % 200 === 0 ? PALETTE.gridBold : PALETTE.grid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += 40) {
    ctx.strokeStyle = y % 200 === 100 ? PALETTE.gridBold : PALETTE.grid;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

function hatch(ctx, r, color, gap = 18) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  for (let d = -r.h; d < r.w + r.h; d += gap) {
    ctx.beginPath();
    ctx.moveTo(r.x + d, r.y + r.h);
    ctx.lineTo(r.x + d + r.h, r.y);
    ctx.stroke();
  }
  ctx.restore();
}

function star(ctx, x, y, R, r, n = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rr = i % 2 ? r : R;
    ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function eyes(ctx, b, r, look) {
  const { x, y } = b.position;
  const dx = look ? look.x - x : 0, dy = look ? look.y - y : 0, d = Math.hypot(dx, dy) || 1;
  const ox = (dx / d) * r * 0.12, oy = (dy / d) * r * 0.12;
  for (const s of [-1, 1]) {
    const ex = x + s * r * 0.33, ey = y - r * 0.12;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(ex, ey, r * 0.22, r * 0.27, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(ex + ox, ey + oy, r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBall(ctx, b, o, sim, t) {
  const { x, y } = b.position, r = b.circleRadius;
  const col = C(o.c);
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(x, y, r + 4, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, shade(col, 0.45));
  g.addColorStop(1, col);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (o.face) {
    // look toward the partner ball if there is one
    const partner = o.look && sim.byId.get(o.look);
    eyes(ctx, b, r, partner && !partner.gsGone ? partner.position : null);
  } else {
    // rolling stripe shows spin
    ctx.strokeStyle = shade(col, -0.25);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.62, b.angle, b.angle + Math.PI * 0.7);
    ctx.stroke();
  }
  if (o.held) {
    ctx.strokeStyle = "rgba(29,27,51,0.5)";
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r + 12 + Math.sin(t * 4) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawBox(ctx, b, o, held) {
  const col = C(o.c);
  fillBody(ctx, b, col);
  // top bevel + crate cross for small dynamic boxes
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  const w = o.w, h = o.h;
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(-w / 2 + 4, -h / 2 + 4, w - 8, Math.min(8, h / 4));
  if (o.crate && w > 30 && h > 30) {
    ctx.strokeStyle = shade(col, -0.3);
    ctx.lineWidth = 4;
    ctx.strokeRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18);
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 9, -h / 2 + 9);
    ctx.lineTo(w / 2 - 9, h / 2 - 9);
    ctx.stroke();
  }
  if (held) {
    ctx.strokeStyle = "rgba(29,27,51,0.5)";
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20);
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawSolid(ctx, b, o) {
  fillBody(ctx, b, o.c ? C(o.c) : PALETTE.solid, PALETTE.ink, 3);
  if (b.parts.length === 1 && o.w) {
    ctx.save();
    ctx.translate(b.position.x, b.position.y);
    ctx.rotate(b.angle);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.fillRect(-o.w / 2 + 3, -o.h / 2 + 3, o.w - 6, Math.min(7, o.h / 3));
    ctx.restore();
  }
}

function drawGate(ctx, b, o, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  const w = o.w, h = o.h;
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
  ctx.fillStyle = PALETTE.yellow;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.clip();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 9;
  for (let d = -w - h; d < w + h; d += 30) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + d, h / 2);
    ctx.lineTo(-w / 2 + d + h, -h / 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSwitch(ctx, b, o, pressed, t) {
  const w = o.w ?? 90;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  // base
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(-w / 2 - 3, -8 - 3, w + 6, 22);
  ctx.fillStyle = "#545a85";
  ctx.fillRect(-w / 2, -8, w, 16);
  // cap
  const capH = pressed ? 5 : 16 + Math.sin(t * 5) * 1.5;
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.roundRect(-w * 0.36 - 3, -8 - capH - 3, w * 0.72 + 6, capH + 6, 8);
  ctx.fill();
  ctx.fillStyle = pressed ? PALETTE.green : PALETTE.red;
  ctx.beginPath();
  ctx.roundRect(-w * 0.36, -8 - capH, w * 0.72, capH + 2, 6);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(-w * 0.3, -8 - capH + 3, w * 0.6, 3);
  ctx.restore();
}

function drawTarget(ctx, b, o, hit, t) {
  const { x, y } = b.position, r = o.r ?? 28;
  const pulse = 1 + Math.sin(t * 4 + x) * 0.06;
  ctx.save();
  if (!hit) {
    ctx.fillStyle = "rgba(255,201,61,0.22)";
    ctx.beginPath();
    ctx.arc(x, y, r * 1.45 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  star(ctx, x, y, r * pulse + 4, r * 0.48 * pulse + 3, 5, -Math.PI / 2 + Math.sin(t * 1.5) * 0.15);
  ctx.fillStyle = PALETTE.ink;
  ctx.fill();
  star(ctx, x, y, r * pulse, r * 0.48 * pulse, 5, -Math.PI / 2 + Math.sin(t * 1.5) * 0.15);
  ctx.fillStyle = hit ? PALETTE.green : PALETTE.yellow;
  ctx.fill();
  if (hit) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x - r * 0.3, y);
    ctx.lineTo(x - r * 0.05, y + r * 0.25);
    ctx.lineTo(x + r * 0.35, y - r * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

function drawZone(ctx, o, sim, t) {
  const met = sim.goalMet;
  const col = C(o.c || "green");
  ctx.save();
  ctx.fillStyle = col + (met ? "38" : "1e");
  ctx.strokeStyle = col;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 12]);
  ctx.lineDashOffset = -t * 30;
  ctx.beginPath();
  ctx.roundRect(o.x, o.y, o.w, o.h, 14);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  // flag
  const fx = o.x + 16, fy = o.y + 14;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(fx, fy + 36);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(fx + 2, fy);
  ctx.lineTo(fx + 26 + Math.sin(t * 5) * 3, fy + 8);
  ctx.lineTo(fx + 2, fy + 17);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawNoDraw(ctx, o) {
  ctx.save();
  ctx.fillStyle = "rgba(255,77,109,0.07)";
  ctx.fillRect(o.x, o.y, o.w, o.h);
  hatch(ctx, o, "rgba(255,77,109,0.28)", 22);
  ctx.strokeStyle = "rgba(255,77,109,0.6)";
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(o.x, o.y, o.w, o.h);
  ctx.setLineDash([]);
  // crossed pencil badge
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2, s = Math.min(26, o.w / 4, o.h / 4);
  if (s > 10) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(cx, cy, s * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.red;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.6, cy + s * 0.6);
    ctx.lineTo(cx + s * 0.6, cy - s * 0.6);
    ctx.moveTo(cx - s * 0.75, cy - s * 0.75);
    ctx.lineTo(cx + s * 0.75, cy + s * 0.75);
    ctx.stroke();
  }
  ctx.restore();
}

function inkPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) ctx.lineTo(pts[1].x, pts[1].y);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  if (pts.length > 2) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}

function strokeInk(ctx, pts, color = PALETTE.pen, alpha = 1) {
  if (!pts.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (pts.length === 1) {
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, INK_W / 2 + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  inkPath(ctx, pts);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = INK_W + 6;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = INK_W;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 3;
  ctx.translate(-1.5, -2);
  ctx.stroke();
  ctx.restore();
}

function drawDrawn(ctx, rec, t) {
  const b = rec.body;
  const age = t - (rec.bornReal ?? -1);
  const pop = age >= 0 && age < 0.25 ? 1 + Math.sin((age / 0.25) * Math.PI) * 0.06 : 1;
  ctx.save();
  ctx.translate(b.position.x, b.position.y);
  ctx.rotate(b.angle);
  ctx.scale(pop, pop);
  if (rec.dot) {
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(0, 0, DOT_R + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.pen;
    ctx.beginPath();
    ctx.arc(0, 0, DOT_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(-5, -5, 5, 0, Math.PI * 2);
    ctx.fill();
  } else strokeInk(ctx, rec.pts);
  ctx.restore();
}

/**
 * Draws the whole scene. opts: { t (real seconds, for idle animation),
 * stroke (live points), strokeBad, ghost ([[x,y]…][] hint paths), fx (particles),
 * accent }
 */
export function drawScene(ctx, sim, opts = {}) {
  const t = opts.t ?? 0;
  paper(ctx, opts.accent || PALETTE.pen);

  // regions first
  for (const rec of sim.objs) {
    if (rec.kind === "zone") drawZone(ctx, rec.o, sim, t);
    else if (rec.kind === "nodraw") drawNoDraw(ctx, rec.o);
  }
  // ropes
  for (const rec of sim.objs) {
    if (rec.kind === "pend" && !rec.body.gsGone) {
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(rec.anchor.x, rec.anchor.y);
      ctx.lineTo(rec.body.position.x, rec.body.position.y);
      ctx.stroke();
      ctx.fillStyle = PALETTE.solid;
      ctx.beginPath();
      ctx.arc(rec.anchor.x, rec.anchor.y, 10, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // bodies
  for (const rec of sim.objs) {
    const { o, body: b, kind } = rec;
    if (!b) continue;
    if (kind === "gate") {
      if (b.gsGone) rec.alpha = Math.max(0, rec.alpha - 0.06);
      if (rec.alpha > 0) drawGate(ctx, b, o, rec.alpha);
      continue;
    }
    if (b.gsGone) continue;
    switch (kind) {
      case "ball":
      case "pend":
        drawBall(ctx, b, { ...o, held: rec.held }, sim, t);
        break;
      case "box":
        if (o.s) drawSolid(ctx, b, o);
        else drawBox(ctx, b, o, rec.held);
        break;
      case "cup":
        fillBody(ctx, b, o.c ? C(o.c) : PALETTE.teal, PALETTE.ink, 3);
        break;
      case "stand":
        fillBody(ctx, b, PALETTE.woodDark, PALETTE.ink, 3);
        break;
      case "seesaw":
        fillBody(ctx, b, o.c ? C(o.c) : PALETTE.wood, PALETTE.ink, 3);
        ctx.fillStyle = PALETTE.ink;
        ctx.beginPath();
        ctx.arc(rec.pivot.x, rec.pivot.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(rec.pivot.x, rec.pivot.y, 3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "switch":
        drawSwitch(ctx, b, o, sim.pressed.has(o.id), t);
        break;
      case "target":
        drawTarget(ctx, b, o, sim.hit.has(o.id), t);
        break;
      case "mover":
      case "spin":
        drawSolid(ctx, b, { ...o, c: o.c || "#4b4f86" });
        if (kind === "spin") {
          ctx.fillStyle = PALETTE.yellow;
          ctx.beginPath();
          ctx.arc(b.position.x, b.position.y, 8, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      default:
        drawSolid(ctx, b, o);
    }
  }
  for (const rec of sim.drawn) if (!rec.body.gsGone) drawDrawn(ctx, rec, t);

  // hint ghost
  if (opts.ghost) {
    ctx.save();
    ctx.setLineDash([2, 22]);
    ctx.lineCap = "round";
    ctx.lineWidth = INK_W;
    ctx.strokeStyle = `rgba(123,92,255,${0.45 + Math.sin(t * 5) * 0.2})`;
    ctx.lineDashOffset = -t * 40;
    for (const g of opts.ghost) {
      if (g.length === 1) {
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(g[0][0], g[0][1], DOT_R, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([2, 22]);
        continue;
      }
      inkPath(ctx, g.map(([x, y]) => ({ x, y })));
      ctx.stroke();
    }
    ctx.restore();
  }
  // live stroke
  if (opts.stroke?.length) strokeInk(ctx, opts.stroke, opts.strokeBad ? PALETTE.red : PALETTE.pen, 0.9);

  // particles
  if (opts.fx) drawFx(ctx, opts.fx);
}

/* ---------------- particles ---------------- */

export function burst(fx, x, y, { n = 18, colors = [PALETTE.yellow, PALETTE.pink, PALETTE.blue, PALETTE.green], speed = 9, life = 0.9, size = 9, g = 0.25, shape = "dot" } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
    fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life, max: life, size: size * (0.6 + Math.random() * 0.7), c: colors[i % colors.length], g, shape, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4 });
  }
}

export function confetti(fx, n = 120) {
  const colors = [PALETTE.yellow, PALETTE.pink, PALETTE.blue, PALETTE.green, PALETTE.orange, PALETTE.purple];
  for (let i = 0; i < n; i++) {
    fx.push({ x: Math.random() * W, y: -20 - Math.random() * 300, vx: (Math.random() - 0.5) * 6, vy: 2 + Math.random() * 5, life: 3.5, max: 3.5, size: 10 + Math.random() * 10, c: colors[i % colors.length], g: 0.08, shape: "rect", rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3 });
  }
}

export function stepFx(fx, dt) {
  const k = dt * 60;
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.vy += p.g * k;
    p.x += p.vx * k;
    p.y += p.vy * k;
    p.rot += p.vr * k;
    p.life -= dt;
    if (p.life <= 0 || p.y > H + 60) fx.splice(i, 1);
  }
}

function drawFx(ctx, fx) {
  for (const p of fx) {
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 2);
    ctx.fillStyle = p.c;
    if (p.shape === "rect") {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else if (p.shape === "star") {
      star(ctx, p.x, p.y, p.size, p.size * 0.45, 5, p.rot);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
