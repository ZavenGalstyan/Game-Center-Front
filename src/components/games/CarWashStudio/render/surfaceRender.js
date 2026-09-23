/**
 * Car Wash Studio — surface compositor.
 *
 * Each Surface gets one small canvas holding its composited overlay (haze,
 * polish gloss, wetness, dust, grime, mud, spots, smudges, slurry, cleaner,
 * foam, tire shine). Only the surface's dirty rectangle is recomposited, and
 * only for panels visible in the current view, under a per-frame pixel
 * budget — so a brush stroke costs a few thousand pixels, not a full redraw.
 *
 * The overlay is drawn over the clean base car through the region's clip
 * + affine, i.e. exactly where the brush engine measures. What you see is
 * what the progress counts.
 */
import { clipRegion } from "./paths.js";
import { hexToRgb, deepen } from "./color.js";

const ss = (a, b, v) => {
  const t = v <= a ? 0 : v >= b ? 1 : (v - a) / (b - a);
  return t * t * (3 - 2 * t);
};

export function makePalette(job) {
  const c = job.dirt.colors;
  const paint = hexToRgb(job.paint);
  return {
    dust: c.dust,
    mud: c.mud,
    grime: c.grime,
    spot: c.spot,
    haze: [206, 210, 216],
    deep: deepen(paint, 0.12),
    slurry: [(c.mud[0] + c.grime[0]) / 2 + 20, (c.mud[1] + c.grime[1]) / 2 + 16, (c.mud[2] + c.grime[2]) / 2 + 12],
    foam: [250, 251, 252],
    foamDirty: [170, 150, 122],
    wheelCleaner: [168, 70, 190],
    glassCleaner: [205, 228, 255],
    iDust: [192, 190, 184],
    iFloor: job.interior?.sand ? [206, 186, 142] : [118, 98, 76],
    iStain: [98, 74, 52],
  };
}

export class SurfaceView {
  constructor(surf) {
    this.surf = surf;
    this.canvas = document.createElement("canvas");
    this.canvas.width = surf.w;
    this.canvas.height = surf.h;
    this.ctx = this.canvas.getContext("2d");
    this.img = this.ctx.createImageData(surf.w, surf.h);
  }

  /** Recomposite up to `budget` pixels of the dirty rect. Returns pixels used. */
  update(pal, budget) {
    const s = this.surf;
    const d = s.dirty;
    if (!d) return 0;
    const x0 = Math.max(0, d.x0 | 0);
    const x1 = Math.min(s.w, Math.ceil(d.x1));
    let y0 = Math.max(0, d.y0 | 0);
    const y1 = Math.min(s.h, Math.ceil(d.y1));
    const rowW = Math.max(1, x1 - x0);
    const rows = Math.max(1, Math.min(y1 - y0, Math.floor(budget / rowW)));
    const yEnd = Math.min(y1, y0 + rows);
    compositeRows(s, this.img.data, pal, x0, x1, y0, yEnd);
    this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0, yEnd - y0);
    if (yEnd >= y1) s.dirty = null;
    else s.dirty = { x0, y0: yEnd, x1, y1 };
    return rowW * (yEnd - y0);
  }
}

// premultiplied "over" accumulator (module-level: no per-pixel closures)
let pr = 0;
let pg = 0;
let pb = 0;
let pa = 0;
function over(r, g, b, a) {
  if (a <= 0.003) return;
  if (a > 1) a = 1;
  const k = 1 - a;
  pr = r * a + pr * k;
  pg = g * a + pg * k;
  pb = b * a + pb * k;
  pa = a + pa * k;
}

function compositeRows(s, out, pal, x0, x1, y0, y1) {
  const mat = s.material;
  const isPaint = mat === "paint";
  const isGlass = mat === "glass" || mat === "iglass";
  const isWheel = mat === "wheel";
  const interior = mat === "dash" || mat === "fabric" || mat === "leather" || mat === "carpet" || mat === "vent" || mat === "iglass";
  const { D, ML, MS, G, S, SM, W, F, FD, C, P, TS, valid, nz, bub, stk, gl, lm, ring } = s;
  const dustC = interior ? (mat === "carpet" ? pal.iFloor : pal.iDust) : pal.dust;
  const cleanerC = isWheel ? pal.wheelCleaner : pal.glassCleaner;
  const stainC = interior ? pal.iStain : pal.spot;
  for (let y = y0; y < y1; y++) {
    let i = y * s.w + x0;
    for (let x = x0; x < x1; x++, i++) {
      const o = i * 4;
      if (!valid[i]) {
        out[o + 3] = 0;
        continue;
      }
      pr = 0;
      pg = 0;
      pb = 0;
      pa = 0;
      const n = nz[i] / 255;
      if (isPaint) {
        const p = P[i] / 255;
        over(pal.haze[0], pal.haze[1], pal.haze[2], 0.15 * (1 - p));
        if (p > 0) {
          over(pal.deep[0], pal.deep[1], pal.deep[2], 0.22 * p);
          const g = gl[i] / 255;
          over(255, 255, 255, g * 0.36 * p);
        }
      }
      if (!interior) {
        const w = W[i] / 255;
        if (w > 0.01) {
          over(8, 14, 26, w * 0.17);
          const st = stk[i] / 255;
          if (st > 0) over(225, 238, 248, st * w * 0.14);
          if (n > 0.93) over(255, 255, 255, (n - 0.93) * 9 * w);
        }
      }
      if (isWheel && ring && ring[i] && TS[i]) {
        const t = TS[i] / 255;
        over(6, 6, 8, t * 0.42);
        over(255, 255, 255, t * 0.07 * (gl[i] / 255));
      }
      const dv = D[i];
      if (dv) {
        const a = (dv / 255) * (mat === "carpet" ? 0.9 : 0.8) * (0.85 + 0.3 * (n - 0.5));
        const t = 0.92 + 0.16 * n;
        over(dustC[0] * t, dustC[1] * t, dustC[2] * t, a);
      }
      const gv = G[i];
      if (gv) {
        const t = 0.88 + 0.24 * n;
        over(pal.grime[0] * t, pal.grime[1] * t, pal.grime[2] * t, (gv / 255) * 0.88);
      }
      const mv = ML[i] + MS[i];
      if (mv) {
        const m = Math.min(1, mv / 255);
        const thr = n * 0.3;
        const a = ss(thr, thr + 0.24, m) * 0.96;
        const t = 0.8 + 0.34 * n - (MS[i] / 255) * 0.12;
        over(pal.mud[0] * t, pal.mud[1] * t, pal.mud[2] * t, a);
      }
      const sv = S[i];
      if (sv) over(stainC[0], stainC[1], stainC[2], (sv / 255) * (interior ? 0.78 : 0.95));
      const smv = SM[i];
      if (smv) over(214, 219, 226, (smv / 255) * (mat === "iglass" ? 0.5 : 0.36) * (0.85 + 0.3 * n));
      const f = F[i] / 255;
      const fd = FD[i] / 255;
      if (fd > 0 && f < 0.95) over(pal.slurry[0], pal.slurry[1], pal.slurry[2], fd * 0.72 * (1 - f));
      const cv = C[i] / 255;
      if (cv > 0) {
        const b = bub[i] / 255;
        over(cleanerC[0], cleanerC[1], cleanerC[2], cv * (isWheel ? 0.58 : 0.34) * (0.7 + 0.3 * b));
        if (n > 0.9) over(255, 255, 255, cv * 0.45);
      }
      if (f > 0.01) {
        // thick, soft suds: low-frequency lumps give volume, bubbles only a
        // gentle texture, thin spots let the paint glow through slightly
        const b = bub[i] / 255;
        const lump = lm[i] / 255;
        const a = Math.min(1, f * 1.3) * (0.66 + 0.34 * lump) * (0.94 + 0.06 * b);
        const k = Math.min(1, (fd / Math.max(f, 0.05)) * 1.2);
        const t = 0.86 + 0.1 * lump + 0.05 * b;
        const cool = (1 - lump) * 0.3;
        const fr = pal.foam[0] + (pal.foamDirty[0] - pal.foam[0]) * k;
        const fg = pal.foam[1] + (pal.foamDirty[1] - pal.foam[1]) * k;
        const fb = pal.foam[2] + (pal.foamDirty[2] - pal.foam[2]) * k;
        over((fr + (200 - fr) * cool) * t, (fg + (210 - fg) * cool) * t, (fb + (224 - fb) * cool) * t, a);
        if (b > 0.9 && n > 0.55) over(255, 255, 255, (b - 0.9) * 6 * a);
      }
      if (isGlass && !interior && pa < 0.01) {
        out[o + 3] = 0;
        continue;
      }
      if (pa <= 0.002) {
        out[o + 3] = 0;
        continue;
      }
      out[o] = pr / pa;
      out[o + 1] = pg / pa;
      out[o + 2] = pb / pa;
      out[o + 3] = pa * 255;
    }
  }
}

/** Draw every visible panel overlay for a view (camera transform already set). */
export function drawSurfaces(ctx, session, views, regions, alpha = 1) {
  for (const r of regions) {
    const sv = views.get(r.panel);
    if (!sv) continue;
    ctx.save();
    clipRegion(ctx, r);
    const m = r.aff;
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    ctx.globalAlpha = alpha;
    ctx.drawImage(sv.canvas, 0, 0);
    ctx.restore();
  }
}

/**
 * Cleaning assist: a soft pulse over pixels the current stage still needs.
 * Built at low cost on demand (a few times per second at most).
 */
export function buildAssistCanvas(surf, need, ctx2) {
  const c = document.createElement("canvas");
  c.width = surf.w;
  c.height = surf.h;
  const x = c.getContext("2d");
  const img = x.createImageData(surf.w, surf.h);
  let any = 0;
  for (let i = 0; i < surf.n; i++) {
    if (surf.valid[i] && need(surf, i, ctx2)) {
      const o = i * 4;
      img.data[o] = 120;
      img.data[o + 1] = 230;
      img.data[o + 2] = 255;
      img.data[o + 3] = 255;
      any++;
    }
  }
  x.putImageData(img, 0, 0);
  return any ? c : null;
}
