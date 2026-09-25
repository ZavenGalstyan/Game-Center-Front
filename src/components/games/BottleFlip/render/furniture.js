/**
 * Bottle Flip — furniture / platform art.
 *
 * Drawn in WORLD units with a y-UP transform (see render/view.js). The
 * gameplay plane is the middle of each object's depth: a top face is a band
 * DEPTH units tall centred on the collision top, and everything on the front
 * plane is shifted down by DEPTH/2 (back parts up by DEPTH/2). So the bottle's
 * base sits exactly on the collision line, which is the middle of the visible
 * top face — no floating landings, no sinking.
 *
 * Every size here comes from physics/solids.js (shapeRects / SLAB) so the art
 * and the collision can't drift apart.
 */
import { SHAPE_OF, SLAB } from "../physics/solids.js";
import { shade } from "./bottle.js";

export const DEPTH = 5;
const H = DEPTH / 2;

function lin(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
}

function rr(ctx, x, y, w, h, r) {
  const k = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.lineTo(x + w - k, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + k);
  ctx.lineTo(x + w, y + h - k);
  ctx.quadraticCurveTo(x + w, y + h, x + w - k, y + h);
  ctx.lineTo(x + k, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - k);
  ctx.lineTo(x, y + k);
  ctx.quadraticCurveTo(x, y, x + k, y);
  ctx.closePath();
}

/** Palettes per theme; kinds pick a material from here. */
const MATS = {
  room: { wood: "#b7784a", woodLight: "#d49a68", paint: "#f1e6d8", paint2: "#9fb8a8", metal: "#8c96a3", fabric: "#d98f7a" },
  kitchen: { wood: "#c8925c", woodLight: "#e2b07a", paint: "#f4f1ea", paint2: "#7fb3c9", metal: "#aab4bf", fabric: "#e0a458" },
  office: { wood: "#8a6a50", woodLight: "#a8845f", paint: "#dfe5ec", paint2: "#5c6f86", metal: "#9aa6b4", fabric: "#3d4b5f" },
  backyard: { wood: "#a86b3c", woodLight: "#c98b52", paint: "#eef2e6", paint2: "#3f9fd1", metal: "#9aa3ab", fabric: "#e45f4f" },
  master: { wood: "#2b2f45", woodLight: "#3b4163", paint: "#262a3f", paint2: "#34395a", metal: "#565d80", fabric: "#452e66", neon: "#5ef1ff" },
};

function matFor(kind, theme) {
  const m = MATS[theme] || MATS.room;
  switch (kind) {
    case "bedside":
    case "dresser":
    case "desk":
    case "table":
    case "gardenTable":
    case "bench":
    case "shelf":
    case "ledge":
    case "chair":
    case "stool":
    case "board":
    case "crate":
    case "drawer":
      return { base: theme === "master" ? m.wood : kind === "board" ? m.woodLight : m.wood, trim: m.woodLight };
    case "cabinet":
    case "counter":
      return { base: m.paint, trim: m.paint2 };
    case "filing":
    case "printer":
    case "appliance":
    case "cart":
    case "officeDesk":
    case "officeChair":
    case "lift":
      return { base: kind === "officeDesk" ? m.woodLight : m.metal, trim: m.paint2 };
    case "cooler":
      return { base: m.paint2, trim: m.paint };
    case "cushion":
      return { base: m.fabric, trim: m.paint };
    case "box":
      return { base: "#c9995f", trim: "#e0b77e" };
    case "glass":
      return { base: "#bfe3f0", trim: "#ffffff" };
    case "pedestal":
      return { base: m.paint, trim: m.neon || "#5ef1ff" };
    case "vacuum":
      return { base: "#2c2f36", trim: "#5ef1a0" };
    case "books":
      return { base: "#5b7bd6", trim: "#f2c14e" };
    default:
      return { base: m.wood, trim: m.woodLight };
  }
}

/** Top face band centred on `top`, spanning x0..x1. */
function topFace(ctx, x0, x1, top, color, opts = {}) {
  const r = opts.round ?? 0.8;
  ctx.fillStyle = lin(ctx, 0, top - H, 0, top + H, [
    [0, shade(color, 0.28)],
    [1, shade(color, 0.05)],
  ]);
  rr(ctx, x0, top - H, x1 - x0, DEPTH, r);
  ctx.fill();
  // crisp front lip: reads as "the edge you land on"
  ctx.fillStyle = shade(color, 0.45);
  ctx.fillRect(x0 + 0.4, top - H, x1 - x0 - 0.8, 0.45);
}

function frontFace(ctx, x0, x1, y0, y1, color, r = 0.6) {
  ctx.fillStyle = lin(ctx, x0, 0, x1, 0, [
    [0, shade(color, -0.12)],
    [0.12, color],
    [0.85, color],
    [1, shade(color, -0.2)],
  ]);
  rr(ctx, x0, y0 - H, x1 - x0, y1 - y0, r);
  ctx.fill();
  // under-lip shadow
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(x0 + 0.3, y1 - H - 1.2, x1 - x0 - 0.6, 1.2);
}

function knob(ctx, x, y, r, color) {
  ctx.fillStyle = shade(color, -0.3);
  ctx.beginPath();
  ctx.arc(x, y - 0.15, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shade(color, 0.3);
  ctx.beginPath();
  ctx.arc(x - r * 0.25, y + r * 0.2, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawers(ctx, x0, x1, y0, y1, n, color, knobColor) {
  const pad = 2;
  const hh = (y1 - y0 - pad * (n + 1)) / n;
  for (let i = 0; i < n; i++) {
    const yb = y0 + pad + i * (hh + pad) - H;
    ctx.fillStyle = shade(color, 0.08);
    rr(ctx, x0 + pad, yb, x1 - x0 - pad * 2, hh, 0.8);
    ctx.fill();
    ctx.strokeStyle = shade(color, -0.22);
    ctx.lineWidth = 0.35;
    ctx.stroke();
    knob(ctx, (x0 + x1) / 2, yb + hh / 2, Math.min(1.3, hh * 0.18), knobColor);
  }
}

const BOOK_COLORS = ["#e2574c", "#4f86c6", "#f2c14e", "#57a773", "#9b6bd6", "#ef8a5b", "#3d5a80", "#e07a9a"];

/** Draw one platform. ox/oy: current moving offset. */
export function drawPlatform(ctx, p, ox, oy, theme, opts = {}) {
  const shape = SHAPE_OF[p.kind] || "block";
  const x0 = p.x + ox;
  const x1 = x0 + p.w;
  const top = p.top + oy;
  const base = (p.base ?? 0) + oy * (p.move?.axis === "y" ? 1 : 0);
  const mat = matFor(p.kind, theme);
  const c = mat.base;
  const tseed = (p.x * 13 + p.top * 7) | 0;

  // contact shadow on whatever it stands on (floor-standing only)
  if (!p.base && shape !== "shelf" && p.kind !== "lift") {
    ctx.fillStyle = "rgba(20,10,0,0.18)";
    ctx.beginPath();
    ctx.ellipse((x0 + x1) / 2, base - H + 0.4, p.w * 0.56, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // moving platforms ride a visible track, so their path is readable
  if (p.move && p.kind !== "cart" && p.kind !== "vacuum" && !opts.noTrack) {
    const m = p.move;
    ctx.fillStyle = theme === "master" ? "rgba(94,241,255,0.35)" : "rgba(70,80,95,0.4)";
    if (m.axis === "y") {
      const cx = p.x + p.w / 2;
      ctx.fillRect(cx - 0.6, p.top - m.range - 4, 1.2, m.range * 2 + 8);
      ctx.beginPath();
      ctx.arc(cx, p.top + m.range + H, 1.2, 0, Math.PI * 2);
      ctx.arc(cx, p.top - m.range - 4, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const ry = (p.base ?? p.top - 6) + H + 2;
      ctx.fillRect(p.x - m.range - 3, ry, p.w + m.range * 2 + 6, 1.1);
      ctx.fillRect(p.x - m.range - 3, ry - 2, 1.2, 4);
      ctx.fillRect(p.x + p.w + m.range + 1.8, ry - 2, 1.2, 4);
    }
  }
  if (p.move && (p.kind === "cart" || p.kind === "vacuum")) {
    // floor lane marks
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (const ex of [p.x - p.move.range, p.x + p.w + p.move.range]) ctx.fillRect(ex - 0.5, -H - 1, 1, 2.5);
  }

  switch (shape) {
    case "table": {
      const s = SLAB.table;
      const inset = Math.min(4, p.w * 0.06);
      const lw = p.kind === "bench" ? 4 : 3;
      // back legs (behind, darker)
      ctx.fillStyle = shade(c, -0.35);
      ctx.fillRect(x0 + inset + 2, base + H, lw - 0.6, top - s - base - H);
      ctx.fillRect(x1 - inset - lw - 1.4, base + H, lw - 0.6, top - s - base - H);
      // front legs (match collision)
      for (const lx of [x0 + inset, x1 - inset - lw]) {
        ctx.fillStyle = lin(ctx, lx, 0, lx + lw, 0, [
          [0, shade(c, -0.25)],
          [0.4, shade(c, 0.05)],
          [1, shade(c, -0.3)],
        ]);
        ctx.fillRect(lx, base - H, lw, top - s - base);
      }
      if (p.kind === "desk" || p.kind === "officeDesk") {
        // modesty drawer unit under the slab (visual, sits between the legs)
        const dw = Math.min(34, p.w * 0.32);
        const dx = x1 - inset - lw - dw - 1;
        ctx.fillStyle = shade(c, -0.05);
        rr(ctx, dx, top - s - 11 - H, dw, 11, 0.6);
        ctx.fill();
        ctx.strokeStyle = shade(c, -0.25);
        ctx.lineWidth = 0.35;
        ctx.stroke();
        knob(ctx, dx + dw / 2, top - s - 5.5 - H, 1, mat.trim);
      }
      frontFace(ctx, x0, x1, top - s, top, c, 0.5);
      topFace(ctx, x0, x1, top, mat.trim);
      break;
    }
    case "shelf": {
      const s = SLAB.shelf;
      if (p.kind !== "lift" && p.kind !== "glass") {
        // brackets on the wall behind
        ctx.fillStyle = shade(theme === "master" ? "#555a80" : "#6b7280", -0.1);
        for (const bx of [x0 + p.w * 0.18, x1 - p.w * 0.18 - 1.6]) {
          ctx.beginPath();
          ctx.moveTo(bx, top - s + H);
          ctx.lineTo(bx + 1.6, top - s + H);
          ctx.lineTo(bx + 1.6, top - s + H - 9);
          ctx.closePath();
          ctx.fill();
        }
      }
      if (p.kind === "lift") {
        // lift rails + cable
        ctx.strokeStyle = "rgba(60,70,90,0.55)";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo((x0 + x1) / 2, top + H);
        ctx.lineTo((x0 + x1) / 2, top + 400);
        ctx.stroke();
      }
      if (p.kind === "glass") {
        ctx.fillStyle = "rgba(190,230,245,0.55)";
        rr(ctx, x0, top - s - H, p.w, s, 0.6);
        ctx.fill();
        topFace(ctx, x0, x1, top, "#d8f1fa");
        ctx.globalAlpha = 1;
      } else {
        frontFace(ctx, x0, x1, top - s, top, c, 0.6);
        topFace(ctx, x0, x1, top, mat.trim);
      }
      break;
    }
    case "stool": {
      const s = SLAB.stool;
      const cx = (x0 + x1) / 2;
      const metal = p.kind === "officeChair" ? "#3a4150" : "#8a94a3";
      ctx.fillStyle = lin(ctx, cx - 2.5, 0, cx + 2.5, 0, [
        [0, shade(metal, -0.3)],
        [0.45, shade(metal, 0.25)],
        [1, shade(metal, -0.35)],
      ]);
      ctx.fillRect(cx - 2.5, base - H + 3, 5, top - s - base - 3);
      // foot ring / base
      ctx.fillStyle = shade(metal, -0.2);
      rr(ctx, cx - p.w * 0.42, base - H, p.w * 0.84, 3, 1.2);
      ctx.fill();
      if (p.kind === "officeChair") {
        ctx.fillStyle = "#1f242d";
        for (const wx of [cx - p.w * 0.38, cx + p.w * 0.38]) {
          ctx.beginPath();
          ctx.arc(wx, base - H + 1, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      const seat = p.kind === "officeChair" ? MATS.office.fabric : c;
      frontFace(ctx, x0, x1, top - s, top, seat, 1.6);
      topFace(ctx, x0, x1, top, shade(seat, 0.12), { round: 2 });
      break;
    }
    case "chair": {
      const s = SLAB.chair;
      const back = p.back ?? "left";
      const bx = back === "left" ? x0 : x1 - 3;
      const bh = p.backH ?? 34;
      // backrest post (solid, not landable)
      ctx.fillStyle = lin(ctx, bx, 0, bx + 3, 0, [
        [0, shade(c, -0.25)],
        [0.5, shade(c, 0.1)],
        [1, shade(c, -0.25)],
      ]);
      rr(ctx, bx, top - H, 3, bh + H, 1);
      ctx.fill();
      // backrest slats toward the back
      ctx.fillStyle = shade(c, -0.18);
      const sx = back === "left" ? bx + 3 : bx - 5;
      ctx.fillRect(sx, top + bh * 0.45, 5, 2.4);
      ctx.fillRect(sx, top + bh * 0.8, 5, 2.4);
      for (const lx of [x0 + 2, x1 - 5]) {
        ctx.fillStyle = shade(c, -0.12);
        ctx.fillRect(lx, base - H, 3, top - s - base);
      }
      frontFace(ctx, x0, x1, top - s, top, c, 0.8);
      topFace(ctx, x0, x1, top, mat.trim);
      break;
    }
    case "cart": {
      const s = SLAB.cart;
      const metal = mat.base;
      ctx.fillStyle = shade(metal, -0.1);
      ctx.fillRect(x0 + 1, base + 6 - H, 2.5, top - s - base - 6);
      ctx.fillRect(x1 - 3.5, base + 6 - H, 2.5, top - s - base - 6);
      // lower tray (visual)
      ctx.fillStyle = shade(metal, -0.05);
      rr(ctx, x0 + 1, base + 9 - H, p.w - 2, 2.5, 0.5);
      ctx.fill();
      // wheels
      for (const wx of [x0 + 3, x1 - 3]) {
        ctx.fillStyle = "#23262d";
        ctx.beginPath();
        ctx.arc(wx, base + 3 - H, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#8a93a0";
        ctx.beginPath();
        ctx.arc(wx, base + 3 - H, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      frontFace(ctx, x0, x1, top - s, top, mat.trim, 0.8);
      topFace(ctx, x0, x1, top, shade(mat.trim, 0.1));
      // push handle
      ctx.strokeStyle = shade(metal, -0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0 + 1, top - H);
      ctx.lineTo(x0 - 3, top + 10);
      ctx.stroke();
      break;
    }
    default:
      drawBlock(ctx, p, x0, x1, base, top, mat, theme, tseed);
  }

  if (opts.goal) drawGoal(ctx, (x0 + x1) / 2, top, p.w, opts.time || 0, opts.goalKind);
}

function drawBlock(ctx, p, x0, x1, base, top, mat, theme, seed) {
  const c = mat.base;
  const k = p.kind;
  if (k === "books") {
    // stack of books: each layer a book lying flat
    const n = Math.max(1, Math.round((top - base) / 4.5));
    const hh = (top - base) / n;
    for (let i = 0; i < n; i++) {
      const col = BOOK_COLORS[(seed + i * 3) % BOOK_COLORS.length];
      const inset = ((seed >> i) & 3) * 0.6;
      const yb = base + i * hh;
      ctx.fillStyle = lin(ctx, 0, yb - H, 0, yb + hh - H, [
        [0, shade(col, -0.2)],
        [0.5, col],
        [1, shade(col, 0.1)],
      ]);
      rr(ctx, x0 + inset * 0.5, yb - H, p.w - inset, hh - 0.2, 0.8);
      ctx.fill();
      // pages edge
      ctx.fillStyle = "#f5efe0";
      ctx.fillRect(x1 - inset * 0.5 - 2.2, yb - H + 0.6, 1.8, hh - 1.4);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(x0 + 3, yb - H + hh * 0.45, p.w * 0.4, 0.4);
    }
    const tc = BOOK_COLORS[(seed + (n - 1) * 3) % BOOK_COLORS.length];
    topFace(ctx, x0, x1, top, shade(tc, 0.1), { round: 0.6 });
    return;
  }
  if (k === "cushion") {
    ctx.fillStyle = lin(ctx, 0, base - H, 0, top - H, [
      [0, shade(c, -0.25)],
      [1, shade(c, 0.05)],
    ]);
    rr(ctx, x0, base - H, p.w, top - base, 4);
    ctx.fill();
    ctx.strokeStyle = shade(c, -0.3);
    ctx.setLineDash([0.8, 0.8]);
    ctx.lineWidth = 0.35;
    rr(ctx, x0 + 1.5, base - H + 1.5, p.w - 3, top - base - 3, 3);
    ctx.stroke();
    ctx.setLineDash([]);
    topFace(ctx, x0 + 0.5, x1 - 0.5, top, shade(c, 0.12), { round: 2.4 });
    return;
  }
  if (k === "vacuum") {
    ctx.fillStyle = lin(ctx, 0, base - H, 0, top - H, [
      [0, "#15171c"],
      [1, "#3a3e48"],
    ]);
    rr(ctx, x0, base - H, p.w, top - base, 3);
    ctx.fill();
    ctx.fillStyle = mat.trim;
    ctx.fillRect(x0 + p.w * 0.2, base - H + (top - base) * 0.45, p.w * 0.6, 0.8);
    topFace(ctx, x0, x1, top, "#4a4f5c", { round: 2.4 });
    ctx.fillStyle = mat.trim;
    ctx.beginPath();
    ctx.arc((x0 + x1) / 2 + p.w * 0.3, top + 0.4, 0.7, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  frontFace(ctx, x0, x1, base, top, c, k === "cooler" ? 2 : 0.8);

  switch (k) {
    case "bedside":
    case "dresser":
    case "drawer": {
      const n = k === "dresser" ? 3 : k === "drawer" ? 1 : 2;
      drawers(ctx, x0, x1, base + 4, top - 2, n, c, mat.trim);
      if (k !== "drawer") {
        ctx.fillStyle = shade(c, -0.35);
        ctx.fillRect(x0 + 2, base - H, 2, 4);
        ctx.fillRect(x1 - 4, base - H, 2, 4);
      }
      break;
    }
    case "cabinet":
    case "counter": {
      const doors = Math.max(1, Math.round(p.w / 34));
      const dw = (p.w - 4) / doors;
      for (let i = 0; i < doors; i++) {
        const dx = x0 + 2 + i * dw;
        ctx.fillStyle = shade(c, -0.04);
        rr(ctx, dx + 0.5, base + 5 - H, dw - 1, top - base - (k === "counter" ? 13 : 8), 0.8);
        ctx.fill();
        ctx.strokeStyle = shade(c, -0.18);
        ctx.lineWidth = 0.35;
        ctx.stroke();
        ctx.fillStyle = shade(mat.trim, -0.2);
        const hx = i % 2 ? dx + 3 : dx + dw - 4;
        rr(ctx, hx, top - (k === "counter" ? 16 : 10) - H, 1, 6, 0.5);
        ctx.fill();
      }
      if (k === "counter") {
        // top drawer strip + stone worktop edge
        ctx.fillStyle = shade(c, -0.08);
        ctx.fillRect(x0 + 2, top - 6.5 - H, p.w - 4, 3.2);
        ctx.fillStyle = theme === "kitchen" ? "#d9d4cc" : shade(mat.trim, 0.2);
        ctx.fillRect(x0 - 0.5, top - 2.6 - H, p.w + 1, 2.6);
      }
      // plinth
      ctx.fillStyle = shade(c, -0.4);
      ctx.fillRect(x0 + 1.5, base - H, p.w - 3, 3.5);
      break;
    }
    case "box": {
      ctx.fillStyle = shade(c, -0.12);
      ctx.fillRect((x0 + x1) / 2 - 2, top - 7 - H, 4, 7);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect((x0 + x1) / 2 - 2, top - 7 - H, 4, 1);
      ctx.strokeStyle = shade(c, -0.25);
      ctx.lineWidth = 0.3;
      ctx.strokeRect(x0 + p.w * 0.12, base + (top - base) * 0.25 - H, p.w * 0.3, (top - base) * 0.22);
      ctx.fillStyle = shade(c, -0.3);
      ctx.font = "2.2px sans-serif";
      break;
    }
    case "crate": {
      const n = Math.max(2, Math.round((top - base) / 8));
      const hh = (top - base) / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = shade(c, ((seed + i) % 3) * 0.05 - 0.05);
        rr(ctx, x0 + 0.6, base + i * hh + 0.5 - H, p.w - 1.2, hh - 1, 0.5);
        ctx.fill();
      }
      ctx.fillStyle = shade(c, -0.3);
      ctx.fillRect(x0 + 1, base - H, 2.2, top - base);
      ctx.fillRect(x1 - 3.2, base - H, 2.2, top - base);
      break;
    }
    case "cooler": {
      ctx.fillStyle = mat.trim;
      rr(ctx, x0 + 0.5, top - 6 - H, p.w - 1, 5, 1.2);
      ctx.fill();
      ctx.fillStyle = shade(c, -0.3);
      rr(ctx, (x0 + x1) / 2 - 5, top - 12 - H, 10, 3, 1.2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      rr(ctx, x0 + 2, base + 3 - H, 3, top - base - 12, 1.2);
      ctx.fill();
      break;
    }
    case "appliance": {
      // microwave-like: window + dial
      ctx.fillStyle = "#1c2430";
      rr(ctx, x0 + 3, base + 3 - H, p.w * 0.62, top - base - 7, 1.2);
      ctx.fill();
      ctx.fillStyle = "rgba(140,200,255,0.18)";
      ctx.fillRect(x0 + 4.5, top - 8 - H, p.w * 0.3, 1);
      knob(ctx, x1 - p.w * 0.16, (base + top) / 2 + 2, 2, "#cfd6de");
      ctx.fillStyle = "#5ef1a0";
      ctx.fillRect(x1 - p.w * 0.22, (base + top) / 2 - 4 - H, p.w * 0.12, 1.4);
      break;
    }
    case "filing": {
      drawers(ctx, x0, x1, base + 2, top - 1, Math.max(2, Math.round((top - base) / 20)), c, "#d7dde5");
      break;
    }
    case "printer": {
      ctx.fillStyle = shade(c, -0.25);
      ctx.fillRect(x0 + 3, top - 6 - H, p.w - 6, 1.6);
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(x0 + 6, top - 5 - H, p.w - 12, 2);
      ctx.fillStyle = "#5ef1a0";
      ctx.beginPath();
      ctx.arc(x1 - 4, top - 10 - H, 0.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "board": {
      ctx.fillStyle = shade(c, -0.25);
      ctx.beginPath();
      ctx.arc(x1 - 3, (base + top) / 2 - H, 0.9, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case "pedestal": {
      const glow = mat.trim;
      ctx.strokeStyle = glow;
      ctx.lineWidth = 0.6;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(x0 + 1, top - 1.5 - H);
      ctx.lineTo(x1 - 1, top - 1.5 - H);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let y = base + 6; y < top - 4; y += 8) ctx.fillRect(x0 + 2, y - H, p.w - 4, 0.4);
      break;
    }
    default:
      break;
  }

  topFace(ctx, x0, x1, top, k === "counter" ? "#e6e1d8" : k === "pedestal" ? "#3a3f60" : mat.trim, {
    round: k === "cooler" ? 1.6 : 0.8,
  });
  if (k === "pedestal") {
    ctx.strokeStyle = mat.trim;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, top - H + 0.2);
    ctx.lineTo(x1 - 0.5, top - H + 0.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Soft landing marker on the next goal (a glowing coaster), pulsing. */
export function drawGoal(ctx, cx, top, w, time, kind = "next") {
  const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
  const rx = Math.min(w * 0.36, 16);
  const col = kind === "finish" ? "255,210,90" : "120,230,190";
  ctx.save();
  ctx.fillStyle = `rgba(${col},${0.16 + pulse * 0.14})`;
  ctx.beginPath();
  ctx.ellipse(cx, top, rx, H * 0.72, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = `rgba(${col},${0.55 + pulse * 0.35})`;
  ctx.lineWidth = 0.45;
  ctx.setLineDash([1.4, 1]);
  ctx.beginPath();
  ctx.ellipse(cx, top, rx * (0.9 + pulse * 0.08), H * 0.66, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
