/**
 * Dentist Studio — treatment-view renderer (Canvas 2D).
 *
 * Paints straight from the session's cell layers; nothing here owns state
 * that gameplay depends on. Layers, back to front:
 *
 *   backdrop (screen) → face → mouth interior → tongue → water pool →
 *   teeth (base → issue overlay → foam → shine) → braces → gums →
 *   food bits → inner-lip shadow → lips
 *
 * Tools, particles, hint rings and HUD are drawn by the gameplay loop on
 * top. Per-tooth issue overlays are tiny canvases (one pixel per engine
 * cell) rebuilt only when that tooth changed, then upscaled smoothly —
 * cleaning never re-renders more than the teeth it touched.
 */
import { GRID_W, GRID_H, GUM_HIDE, mouthOpening } from "../engine/geometry.js";
import { mulberry32 } from "../engine/rng.js";
import { rgba, shade } from "./color.js";

export const QUALITY = {
  low: { bubbles: 0.45, highlights: false, backdrop: false },
  medium: { bubbles: 0.8, highlights: true, backdrop: true },
  high: { bubbles: 1, highlights: true, backdrop: true, extra: true },
};

function polyPath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

export function setWorld(ctx, cam, dpr) {
  ctx.setTransform(dpr * cam.s, 0, 0, dpr * cam.s, dpr * cam.ox, dpr * cam.oy);
}

/** Outer lip outline (superellipse + a soft cupid's bow). */
function lipsOuter(M, smile, samples = 120) {
  const pts = [];
  const n = 2.35;
  const rx = M.rx + 30;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = M.cx + rx * Math.sign(c) * Math.abs(c) ** (2 / n);
    const top = s < 0;
    let y = M.cy + (top ? M.ryTop + 46 : M.ryBot + 60) * Math.sign(s) * Math.abs(s) ** (2 / n);
    const dx = x - M.cx;
    if (top) y += 16 * Math.exp(-((dx / 44) ** 2)) - 7 * Math.exp(-(((Math.abs(dx) - 96) / 60) ** 2));
    const ex = Math.abs(dx) / rx;
    y -= smile * 30 * ex ** 5;
    pts.push([x, y]);
  }
  return pts;
}

export class MouthRenderer {
  constructor(session, patient, quality = "medium") {
    this.S = session;
    this.patient = patient;
    this.q = QUALITY[quality] || QUALITY.medium;
    this.overlays = new Map();
    this.bubbles = new Map();
    this.canMake = typeof document !== "undefined";
    this.skin = patient.skin;
    this.lip = patient.lip;
    this.opening0 = session.mouth.opening;
    this.lips0 = lipsOuter(session.mouth.mouth, 0);
  }

  setQuality(q) {
    this.q = QUALITY[q] || QUALITY.medium;
  }

  /* ---------------------------------------------------- overlays */

  overlay(t) {
    let o = this.overlays.get(t.id);
    if (!o) {
      const c = document.createElement("canvas");
      c.width = GRID_W;
      c.height = GRID_H;
      const cx = c.getContext("2d");
      o = { c, cx, img: cx.createImageData(GRID_W, GRID_H) };
      this.overlays.set(t.id, o);
      this.paintOverlay(t, o);
      if (!this.snapshot) t.dirty = false;
      return o.c;
    }
    // a snapshot renderer never consumes the live renderer's dirty flags
    if (t.dirty && !this.snapshot) {
      this.paintOverlay(t, o);
      t.dirty = false;
    }
    return o.c;
  }

  paintOverlay(t, o) {
    const g = t.g;
    const L = t.L;
    const d = o.img.data;
    const hidden = t.hidden;
    for (let k = 0; k < g.n; k++) {
      const p = k * 4;
      if (!g.valid[k] || L.X[k]) {
        d[p + 3] = 0;
        continue;
      }
      // composite bottom → top ("over"), premultiplied accumulation
      let r = 0;
      let gg = 0;
      let b = 0;
      let a = 0;
      const over = (cr, cg, cb, ca) => {
        if (ca <= 0) return;
        r = cr * ca + r * (1 - ca);
        gg = cg * ca + gg * (1 - ca);
        b = cb * ca + b * (1 - ca);
        a = ca + a * (1 - ca);
      };
      const grain = L.G[k] / 255;
      if (L.D[k]) over(204, 184, 140, (L.D[k] / 255) * 0.27);
      if (L.S[k]) {
        const s = L.S[k] / 255;
        if (L.SH[k]) over(150, 104, 66, s * 0.62);
        else over(184, 136, 86, s * 0.5);
      }
      if (L.CV[k]) {
        if (L.C[k]) over(96, 80, 84, (L.C[k] / 255) * 0.92);
        else if (L.PR[k]) {
          const fill = L.FI[k] / 255;
          const sm = L.SM[k] / 255;
          over(198, 210, 222, 0.62 * (1 - fill));
          if (fill > 0) {
            // fresh filling reads slightly cooler/brighter; smoothing blends it in
            const blend = 1 - sm;
            over(236 + 10 * blend, 238 + 4 * blend, 232 + 18 * blend, fill * (0.2 + 0.72 * blend));
          }
        }
      }
      if (L.P[k]) {
        const vis = hidden ? L.I[k] / 255 : 1;
        const pa = (L.P[k] / 255) * (0.78 + grain * 0.3) * vis;
        over(230, 202, 112, Math.min(0.94, pa * 1.15));
      }
      if (L.T[k]) {
        const ta = Math.min(0.97, (L.T[k] / 255) * 1.1);
        if (L.K[k]) over(196 + grain * 24, 184 + grain * 20, 150 + grain * 10, ta);
        else over(232, 200 + grain * 16, 112 + grain * 20, ta);
      }
      if (L.R[k]) over(244, 244, 240, (L.R[k] / 255) * 0.62);
      if (L.F[k]) over(255, 255, 255, Math.min(0.9, (L.F[k] / 255) * 0.95));
      if (L.W[k]) over(214, 236, 255, (L.W[k] / 255) * 0.26);
      if (a > 0) {
        d[p] = r / a;
        d[p + 1] = gg / a;
        d[p + 2] = b / a;
      }
      d[p + 3] = a * 255;
    }
    o.cx.putImageData(o.img, 0, 0);
  }

  bubbleList(t) {
    let list = this.bubbles.get(t.id);
    if (!list) {
      const g = t.g;
      const rand = mulberry32(g.x * 13 + g.yGum * 7);
      list = [];
      for (let i = 0; i < 110 && list.length < 64; i++) {
        const k = Math.floor(rand() * g.n);
        if (!g.valid[k]) continue;
        list.push({ k, x: g.cellX[k] + (rand() - 0.5) * 3, y: g.cellY[k] + (rand() - 0.5) * 3, r: (1.6 + rand() * 3) * g.p, keep: rand() });
      }
      this.bubbles.set(t.id, list);
    }
    return list;
  }

  /* ---------------------------------------------------- backdrop */

  drawBackdrop(ctx, W, H, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#d9f1ef");
    g.addColorStop(0.55, "#eaf5f2");
    g.addColorStop(1, "#f3ece6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!this.q.backdrop) return;
    // out-of-focus clinic: window light, a frame, a plant, the lamp glow
    const win = ctx.createRadialGradient(W * 0.1, H * 0.12, 0, W * 0.1, H * 0.12, W * 0.35);
    win.addColorStop(0, "rgba(255,255,255,0.85)");
    win.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = win;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(143, 206, 196, 0.22)";
    ctx.beginPath();
    ctx.roundRect(W * 0.84, H * 0.14, W * 0.1, H * 0.2, 10);
    ctx.fill();
    ctx.fillStyle = "rgba(120, 190, 150, 0.2)";
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.ellipse(W * 0.06 + i * 9, H * 0.72 - i * 14, 18, 44, -0.5 + i * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    const lamp = ctx.createRadialGradient(W * 0.5, -H * 0.1, 0, W * 0.5, -H * 0.1, H * 0.9);
    lamp.addColorStop(0, "rgba(255, 250, 235, 0.7)");
    lamp.addColorStop(1, "rgba(255, 250, 235, 0)");
    ctx.fillStyle = lamp;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------------------------------------------------- scene */

  /**
   * opts: { time, smile, assist:Set<toothId>, pulse 0..1, sweep 0..1|null,
   *         grabbed:{id,x,y}|null, revealAll, flossGap, showGaps }
   */
  drawScene(ctx, cam, dpr, opts = {}) {
    const S = this.S;
    const M = S.mouth.mouth;
    const smile = opts.smile || 0;
    const opening = smile ? mouthOpening(M, smile) : this.opening0;
    const lips = smile ? lipsOuter(M, smile) : this.lips0;
    setWorld(ctx, cam, dpr);

    this.drawFace(ctx, M);

    // ---- inside the mouth
    ctx.save();
    polyPath(ctx, opening);
    ctx.clip();
    const inner = ctx.createRadialGradient(M.cx, M.cy + 10, 30, M.cx, M.cy, M.rx);
    inner.addColorStop(0, "#5c2b40");
    inner.addColorStop(0.5, "#86465d");
    inner.addColorStop(1, "#c07a8e");
    ctx.fillStyle = inner;
    ctx.fillRect(M.cx - M.rx - 20, M.cy - M.ryTop - 20, M.rx * 2 + 40, M.ryTop + M.ryBot + 40);
    // soft palate / throat
    const throat = ctx.createRadialGradient(M.cx, M.cy + 6, 0, M.cx, M.cy + 6, 200);
    throat.addColorStop(0, "rgba(50, 18, 32, 0.55)");
    throat.addColorStop(1, "rgba(40, 14, 26, 0)");
    ctx.fillStyle = throat;
    ctx.beginPath();
    ctx.ellipse(M.cx, M.cy + 6, 220, 90, 0, 0, Math.PI * 2);
    ctx.fill();

    this.drawTongue(ctx, S.mouth.tongue);
    this.drawPool(ctx, opts.time || 0);

    for (const t of S.teeth) this.drawTooth(ctx, t, opts);
    this.drawBraces(ctx);
    this.drawGum(ctx, S.mouth.gums.upper, "upper");
    this.drawGum(ctx, S.mouth.gums.lower, "lower");
    if (opts.showGaps) this.drawGapGuides(ctx, opts);
    this.drawDebris(ctx, opts);
    if (opts.sweep != null) this.drawSweep(ctx, M, opts.sweep);

    // inner-lip shadow: a band just inside the opening
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(70, 24, 44, 0.28)";
    ctx.lineWidth = 26;
    polyPath(ctx, opening);
    ctx.stroke();
    ctx.strokeStyle = "rgba(70, 24, 44, 0.22)";
    ctx.lineWidth = 12;
    ctx.stroke();
    ctx.restore();

    this.drawLips(ctx, M, lips, opening, smile);
  }

  drawFace(ctx, M) {
    const skin = this.skin;
    const shadeC = this.patient.shade;
    const fg = ctx.createRadialGradient(M.cx, M.cy, 120, M.cx, M.cy + 40, 820);
    fg.addColorStop(0, shade(skin, 0.05));
    fg.addColorStop(0.62, skin);
    fg.addColorStop(1, shadeC);
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.ellipse(M.cx, M.cy - 10, 760, 760, 0, 0, Math.PI * 2);
    ctx.fill();
    // jaw edge shading
    ctx.strokeStyle = rgba(shadeC, 0.5);
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.ellipse(M.cx, M.cy - 10, 740, 740, 0, 0, Math.PI * 2);
    ctx.stroke();
    // cheeks
    for (const sx of [-1, 1]) {
      const cx = M.cx + sx * (M.rx + 120);
      const bl = ctx.createRadialGradient(cx, M.cy - 40, 0, cx, M.cy - 40, 150);
      bl.addColorStop(0, rgba(this.patient.blush, 0.38));
      bl.addColorStop(1, rgba(this.patient.blush, 0));
      ctx.fillStyle = bl;
      ctx.beginPath();
      ctx.arc(cx, M.cy - 40, 150, 0, Math.PI * 2);
      ctx.fill();
    }
    // nose underside + philtrum, very soft
    const ny = M.cy - M.ryTop - 150;
    const ng = ctx.createRadialGradient(M.cx, ny + 10, 10, M.cx, ny, 130);
    ng.addColorStop(0, rgba(shadeC, 0.55));
    ng.addColorStop(1, rgba(shadeC, 0));
    ctx.fillStyle = ng;
    ctx.beginPath();
    ctx.ellipse(M.cx, ny, 130, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba(shadeC, 0.55);
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(M.cx + sx * 42, ny + 6, 22, 12, sx * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    const ph = ctx.createLinearGradient(M.cx - 30, 0, M.cx + 30, 0);
    ph.addColorStop(0, rgba(shadeC, 0));
    ph.addColorStop(0.5, rgba(shadeC, 0.28));
    ph.addColorStop(1, rgba(shadeC, 0));
    ctx.fillStyle = ph;
    ctx.fillRect(M.cx - 30, ny + 20, 60, 100);
    // chin crease
    ctx.strokeStyle = rgba(shadeC, 0.4);
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(M.cx, M.cy + M.ryBot + 120, 110, 22, 0, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
  }

  drawTongue(ctx, T) {
    const g = ctx.createLinearGradient(0, T.cy - T.ry, 0, T.cy + T.ry);
    g.addColorStop(0, "#f2a9b2");
    g.addColorStop(0.5, "#e58f9e");
    g.addColorStop(1, "#c96f82");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(T.cx, T.cy, T.rx, T.ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(170, 70, 95, 0.35)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(T.cx, T.cy - T.ry + 26);
    ctx.quadraticCurveTo(T.cx + 2, T.cy - 20, T.cx, T.cy + 10);
    ctx.stroke();
    const hl = ctx.createRadialGradient(T.cx - 70, T.cy - T.ry + 28, 0, T.cx - 70, T.cy - T.ry + 28, 110);
    hl.addColorStop(0, "rgba(255, 225, 230, 0.55)");
    hl.addColorStop(1, "rgba(255, 225, 230, 0)");
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.ellipse(T.cx - 60, T.cy - T.ry + 34, 120, 40, -0.1, 0, Math.PI * 2);
    ctx.fill();
  }

  drawPool(ctx, time) {
    const S = this.S;
    const P = S.mouth.pool;
    const w = S.pool.water;
    const f = S.pool.foam;
    if (w > 0.01) {
      const rx = 50 + 170 * w;
      const ry = 9 + 15 * w;
      const g = ctx.createRadialGradient(P.cx, P.cy - 4, 0, P.cx, P.cy, rx);
      g.addColorStop(0, "rgba(214, 240, 255, 0.72)");
      g.addColorStop(0.8, "rgba(180, 224, 246, 0.6)");
      g.addColorStop(1, "rgba(180, 224, 246, 0.2)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(P.cx, P.cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      const wob = Math.sin(time * 2.1) * 6;
      ctx.beginPath();
      ctx.ellipse(P.cx - rx * 0.35 + wob, P.cy - ry * 0.35, rx * 0.22, ry * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (f > 0.01) {
      const rand = mulberry32(99);
      const n = Math.round(4 + 26 * Math.min(1, f));
      for (let i = 0; i < n; i++) {
        const x = P.cx + (rand() - 0.5) * (80 + 260 * Math.min(1, w + f));
        const y = P.cy + (rand() - 0.5) * 18;
        const r = 2 + rand() * 5;
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(190, 215, 235, 0.7)";
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    }
    for (const b of S.pool.bits) {
      ctx.fillStyle = b.kind === "tartar" ? "#d9ccb0" : "#ecd490";
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.r, b.r * 0.72, b.x * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(150, 120, 80, 0.45)";
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  drawTooth(ctx, t, opts) {
    const g = t.g;
    const q = this.q;
    const bb = g.bbox;
    const cervY = g.yGum;
    const edgeY = g.yGum + g.dir * g.h * g.sy;
    const front = g.index <= 1;
    const s = t.sums;
    const pol = s.vc ? 1 - s.D / (255 * s.vc) : 1;
    const polishOn = this.S.hasStage("polish");

    polyPath(ctx, g.wpoly);
    const lg = ctx.createLinearGradient(0, cervY, 0, edgeY);
    lg.addColorStop(0, "#e6d4b3");
    lg.addColorStop(0.3, "#f3e9d6");
    lg.addColorStop(0.75, "#fbf6ec");
    lg.addColorStop(1, front ? "#e6eef2" : "#f3ecdf");
    ctx.fillStyle = lg;
    ctx.fill();
    // roundness: darker toward the sides
    const hg = ctx.createLinearGradient(bb.minX, 0, bb.maxX, 0);
    hg.addColorStop(0, "rgba(150, 116, 82, 0.34)");
    hg.addColorStop(0.24, "rgba(150, 116, 82, 0.04)");
    hg.addColorStop(0.7, "rgba(150, 116, 82, 0.03)");
    hg.addColorStop(1, "rgba(150, 116, 82, 0.4)");
    ctx.fillStyle = hg;
    ctx.fill();

    // issues overlay, clipped to the crown
    if (this.canMake) {
      const ov = this.overlay(t);
      ctx.save();
      polyPath(ctx, g.wpoly);
      ctx.clip();
      ctx.transform(g.sx, 0, 0, g.dir * g.sy, g.x, g.yGum);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(ov, -g.w / 2, -GUM_HIDE, g.w, g.h + GUM_HIDE);
      ctx.restore();
    }

    // foam bubbles
    if (s.F > 0) {
      const list = this.bubbleList(t);
      const F = t.L.F;
      for (const b of list) {
        if (b.keep > q.bubbles) continue;
        const f = F[b.k];
        if (f < 60) continue;
        const a = Math.min(1, (f - 60) / 110);
        const r = b.r * (0.55 + 0.45 * (f / 255));
        ctx.fillStyle = `rgba(255,255,255,${0.92 * a})`;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(185, 210, 232, ${0.75 * a})`;
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }

    // enamel shine — brighter and crisper as the tooth is polished
    const shine = polishOn ? 0.35 + 0.65 * pol : 0.6;
    const plaqueDim = s.vc ? Math.min(0.6, (s.P + s.T) / (255 * s.vc) * 2) : 0;
    const hx = g.x - (bb.maxX - bb.minX) * 0.16;
    const hy = cervY + g.dir * g.h * g.sy * 0.36;
    const hr = (bb.maxX - bb.minX) * 0.34;
    ctx.save();
    polyPath(ctx, g.wpoly);
    ctx.clip();
    const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr * 1.4);
    hl.addColorStop(0, `rgba(255,255,255,${0.62 * shine * (1 - plaqueDim)})`);
    hl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hl;
    ctx.fillRect(bb.minX, bb.minY, bb.maxX - bb.minX, bb.maxY - bb.minY);
    if (q.highlights && pol > 0.4 && polishOn) {
      // a crisp reflection streak on polished enamel
      ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.85, (pol - 0.4) * 1.3) * (1 - plaqueDim)})`;
      ctx.lineWidth = Math.max(1.6, (bb.maxX - bb.minX) * 0.07);
      ctx.lineCap = "round";
      const x0 = g.x - (bb.maxX - bb.minX) * 0.24;
      ctx.beginPath();
      ctx.moveTo(x0, cervY + g.dir * g.h * g.sy * 0.28);
      ctx.quadraticCurveTo(x0 - 3, cervY + g.dir * g.h * g.sy * 0.46, x0 + 1, cervY + g.dir * g.h * g.sy * 0.6);
      ctx.stroke();
    }
    // wet glints
    if (s.W > s.vc * 40) {
      const a = Math.min(0.9, s.W / (s.vc * 255));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      for (const [u, v, rr] of [[0.3, 0.3, 2.4], [-0.2, 0.62, 1.8], [0.1, 0.8, 1.4]]) {
        ctx.beginPath();
        ctx.ellipse(g.x + u * (bb.maxX - bb.minX) * 0.5, cervY + g.dir * v * g.h * g.sy, rr * g.p * 1.6, rr * g.p, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // outline
    polyPath(ctx, g.wpoly);
    ctx.strokeStyle = "rgba(160, 128, 96, 0.5)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // assist / final-check glow
    if (opts.assist && opts.assist.has(t.id)) {
      const a = 0.25 + 0.35 * (opts.pulse || 0);
      ctx.strokeStyle = `rgba(80, 200, 255, ${a})`;
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  drawBraces(ctx) {
    const B = this.S.brackets;
    if (!B.length) return;
    for (const jaw of ["upper", "lower"]) {
      const list = B.filter((b) => b.jaw === jaw).sort((a, b) => a.x - b.x);
      if (!list.length) continue;
      // wire
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const [col, w] of [["rgba(90, 105, 125, 0.55)", 4], ["#d7dee7", 2.4], ["rgba(255,255,255,0.8)", 0.9]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(list[0].x - 14, list[0].y + (jaw === "upper" ? -2 : 2));
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          const n = list[i + 1];
          if (n) ctx.quadraticCurveTo(b.x, b.y, (b.x + n.x) / 2, (b.y + n.y) / 2);
          else ctx.lineTo(b.x + 14, b.y + (jaw === "upper" ? -2 : 2));
        }
        ctx.stroke();
      }
      for (const b of list) {
        const h = b.half;
        const g = ctx.createLinearGradient(b.x - h, b.y - h, b.x + h, b.y + h);
        g.addColorStop(0, "#f7fafc");
        g.addColorStop(0.5, "#c3ced9");
        g.addColorStop(1, "#8e9cab");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(b.x - h, b.y - h, h * 2, h * 2, h * 0.35);
        ctx.fill();
        ctx.strokeStyle = "rgba(80, 95, 115, 0.6)";
        ctx.lineWidth = 0.9;
        ctx.stroke();
        // coloured tie + slot
        ctx.strokeStyle = this.patient.outfit;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.roundRect(b.x - h * 0.62, b.y - h * 0.62, h * 1.24, h * 1.24, h * 0.3);
        ctx.stroke();
        ctx.fillStyle = "rgba(90, 105, 125, 0.7)";
        ctx.fillRect(b.x - h * 0.9, b.y - 0.9, h * 1.8, 1.8);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(b.x - h * 0.6, b.y - h * 0.72, h * 0.5, 1.2);
      }
    }
  }

  drawGum(ctx, poly, jaw) {
    const ys = poly.map((p) => p[1]);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const g = ctx.createLinearGradient(0, jaw === "upper" ? y0 : y1, 0, jaw === "upper" ? y1 : y0);
    g.addColorStop(0, "#d9788e");
    g.addColorStop(0.55, "#ee9fae");
    g.addColorStop(1, "#f6b8c3");
    ctx.fillStyle = g;
    polyPath(ctx, poly);
    ctx.fill();
    // soft margin highlight along the scallops
    const margin = poly.margin || poly;
    ctx.strokeStyle = "rgba(255, 214, 222, 0.8)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(margin[0][0], margin[0][1]);
    for (const p of margin) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  }

  drawGapGuides(ctx, opts) {
    const pulse = opts.pulse || 0;
    for (const gp of this.S.gaps) {
      if (!gp.listed || gp.done) continue;
      const active = opts.flossGap === gp.id;
      ctx.strokeStyle = active ? "rgba(90, 210, 255, 0.9)" : `rgba(90, 210, 255, ${0.3 + 0.35 * pulse})`;
      ctx.lineWidth = active ? 3 : 2.2;
      ctx.setLineDash(active ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(gp.x, gp.yMin);
      ctx.lineTo(gp.x, gp.yMax);
      ctx.stroke();
      ctx.setLineDash([]);
      if (gp.progress > 0) {
        ctx.strokeStyle = "rgba(110, 231, 168, 0.95)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(gp.x, gp.yMin);
        ctx.lineTo(gp.x, gp.yMin + (gp.yMax - gp.yMin) * gp.progress);
        ctx.stroke();
      }
    }
  }

  drawDebris(ctx, opts) {
    for (const d of this.S.debris) {
      if (d.removed || (!d.revealed && !opts.revealAll)) continue;
      let x = d.x;
      let y = d.y;
      if (opts.grabbed && opts.grabbed.id === d.id) {
        // stretch toward the tweezers, elastic
        const dx = opts.grabbed.x - d.x;
        const dy = opts.grabbed.y - d.y;
        const k = Math.min(1, Math.hypot(dx, dy) / 30);
        x += dx * (0.35 + 0.4 * k);
        y += dy * (0.35 + 0.4 * k);
      }
      drawBit(ctx, d.kind, x, y, d.size, d.rot);
    }
  }

  drawSweep(ctx, M, t) {
    const x = M.cx - M.rx + t * (M.rx * 2 + 200) - 100;
    const g = ctx.createLinearGradient(x - 90, 0, x + 90, 0);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(0.5, "rgba(255,255,255,0.42)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.beginPath();
    for (const t2 of this.S.teeth) {
      const p = t2.g.wpoly;
      ctx.moveTo(p[0][0], p[0][1]);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
      ctx.closePath();
    }
    ctx.clip();
    ctx.fillStyle = g;
    ctx.fillRect(x - 90, M.cy - M.ryTop, 180, M.ryTop + M.ryBot);
    ctx.restore();
  }

  drawLips(ctx, M, lips, opening, smile) {
    const lip = this.lip;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(lips[0][0], lips[0][1]);
    for (const p of lips) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    ctx.moveTo(opening[0][0], opening[0][1]);
    for (const p of opening) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, M.cy - M.ryTop - 50, 0, M.cy + M.ryBot + 64);
    g.addColorStop(0, shade(lip, -0.12));
    g.addColorStop(0.35, lip);
    g.addColorStop(0.62, shade(lip, 0.06));
    g.addColorStop(1, shade(lip, -0.08));
    ctx.fillStyle = g;
    ctx.fill("evenodd");
    ctx.clip("evenodd");
    // lower-lip gloss + upper-lip soft top highlight
    const gl = ctx.createRadialGradient(M.cx - 40, M.cy + M.ryBot + 26, 0, M.cx - 40, M.cy + M.ryBot + 26, 180);
    gl.addColorStop(0, "rgba(255,255,255,0.4)");
    gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl;
    ctx.fillRect(M.cx - 400, M.cy + 60, 800, 300);
    const gu = ctx.createRadialGradient(M.cx + 90, M.cy - M.ryTop - 20, 0, M.cx + 90, M.cy - M.ryTop - 20, 140);
    gu.addColorStop(0, "rgba(255,255,255,0.22)");
    gu.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gu;
    ctx.fillRect(M.cx - 200, M.cy - 400, 500, 300);
    ctx.restore();
    // outer lip line + corner creases
    ctx.strokeStyle = rgba(shade(lip, -0.3), 0.35);
    ctx.lineWidth = 2;
    polyPath(ctx, lips);
    ctx.stroke();
    ctx.strokeStyle = rgba(this.patient.shade, 0.7);
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    for (const sx of [-1, 1]) {
      const x = M.cx + sx * (M.rx + 26);
      ctx.beginPath();
      ctx.moveTo(x, M.cy - smile * 30 - 2);
      ctx.quadraticCurveTo(x + sx * 18, M.cy - smile * 44 - 10, x + sx * 26, M.cy - smile * 60 - 22);
      ctx.stroke();
    }
  }
}

/** Food bits — harmless, readable, a little cute. */
export function drawBit(ctx, kind, x, y, size, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(60, 30, 20, 0.18)";
  ctx.beginPath();
  ctx.ellipse(1.5, 2, size * 0.9, size * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  if (kind === "herb") {
    ctx.fillStyle = "#6fbf5e";
    ctx.beginPath();
    ctx.moveTo(-size, 0);
    ctx.quadraticCurveTo(0, -size * 0.9, size, 0);
    ctx.quadraticCurveTo(0, size * 0.9, -size, 0);
    ctx.fill();
    ctx.strokeStyle = "#4b9a42";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-size * 0.8, 0);
    ctx.lineTo(size * 0.8, 0);
    ctx.stroke();
  } else if (kind === "seed") {
    ctx.fillStyle = "#f2dfae";
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.85, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#c9ad72";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.beginPath();
    ctx.ellipse(-size * 0.2, -size * 0.15, size * 0.3, size * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === "flake") {
    ctx.fillStyle = "rgba(245, 205, 100, 0.95)";
    ctx.beginPath();
    ctx.moveTo(-size * 0.9, -size * 0.2);
    ctx.lineTo(-size * 0.2, -size * 0.8);
    ctx.lineTo(size * 0.8, -size * 0.3);
    ctx.lineTo(size * 0.6, size * 0.6);
    ctx.lineTo(-size * 0.5, size * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#d69f3a";
    ctx.lineWidth = 1;
    ctx.stroke();
  } else {
    // crumb
    ctx.fillStyle = "#d8a466";
    ctx.beginPath();
    ctx.moveTo(-size * 0.8, 0);
    ctx.lineTo(-size * 0.3, -size * 0.75);
    ctx.lineTo(size * 0.5, -size * 0.6);
    ctx.lineTo(size * 0.85, size * 0.1);
    ctx.lineTo(size * 0.2, size * 0.7);
    ctx.lineTo(-size * 0.6, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b9844a";
    ctx.beginPath();
    ctx.arc(size * 0.15, size * 0.05, size * 0.2, 0, Math.PI * 2);
    ctx.arc(-size * 0.35, -size * 0.2, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Fit the world rect for a named view into the screen's safe rect.
 * view: "all" | "left" | "right"
 */
export function fitCamera(mouth, view, W, H, safe) {
  const M = mouth.mouth;
  let rect;
  if (view === "left") rect = { x0: M.cx - M.rx - 10, x1: M.cx + 30, y0: M.cy - M.ryTop - 10, y1: M.cy + M.ryBot + 10 };
  else if (view === "right") rect = { x0: M.cx - 30, x1: M.cx + M.rx + 10, y0: M.cy - M.ryTop - 10, y1: M.cy + M.ryBot + 10 };
  else rect = { x0: M.cx - M.rx - 34, x1: M.cx + M.rx + 34, y0: M.cy - M.ryTop - 30, y1: M.cy + M.ryBot + 40 };
  const sw = Math.max(40, W - safe.left - safe.right);
  const sh = Math.max(40, H - safe.top - safe.bottom);
  const s = Math.min(sw / (rect.x1 - rect.x0), sh / (rect.y1 - rect.y0));
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  return { s, ox: safe.left + sw / 2 - cx * s, oy: safe.top + sh / 2 - cy * s, view };
}

export function lerpCam(a, b, t) {
  return { s: a.s + (b.s - a.s) * t, ox: a.ox + (b.ox - a.ox) * t, oy: a.oy + (b.oy - a.oy) * t, view: b.view };
}

/** Render the mouth into a standalone image (Before / After). */
export function renderSnapshot(session, patient, w, h, opts = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  const R = new MouthRenderer(session, patient, "high");
  R.snapshot = true;
  R.drawBackdrop(ctx, w, h, 1);
  const cam = fitCamera(session.mouth, "all", w, h, { top: 6, bottom: 6, left: 6, right: 6 });
  R.drawScene(ctx, cam, 1, { time: 0, revealAll: opts.revealAll, smile: opts.smile || 0 });
  return c;
}
